import { join } from "jsr:@std/path@1.1.2";
import { parse as parseJsonc } from "jsr:@std/jsonc";
import { selectOrganizationSlug } from "./deno_org_selection.js";

async function runCommand({ command, args, cwd, env = {}, description }) {
  const process = new Deno.Command(command, {
    args,
    cwd,
    env,
    stdout: "piped",
    stderr: "piped",
  });
  const { code, stdout, stderr } = await process.output();
  const stdoutText = new TextDecoder().decode(stdout).trim();
  const stderrText = new TextDecoder().decode(stderr).trim();

  if (code !== 0) {
    const details = stderrText || stdoutText || `${description} exited with code ${code}.`;
    throw new Error(`${description} failed: ${details}`);
  }

  return stdoutText;
}

async function withTemporarySwitchWorkspace(repoRoot, callback) {
  const switchWorkspaceRoot = await Deno.makeTempDir({
    dir: repoRoot,
    prefix: ".deno-org-switch-",
  });

  try {
    return await callback(switchWorkspaceRoot);
  } finally {
    try {
      await Deno.remove(switchWorkspaceRoot, { recursive: true });
    } catch (caughtError) {
      if (!(caughtError instanceof Deno.errors.NotFound)) {
        throw caughtError;
      }
    }
  }
}

async function readOrganizationFromDeploySwitchConfig({ repoRoot, token, appSlug }) {
  return await withTemporarySwitchWorkspace(repoRoot, async (switchWorkspaceRoot) => {
    await runCommand({
      command: "deno",
      args: ["deploy", "switch", "--app", appSlug],
      cwd: switchWorkspaceRoot,
      env: {
        DENO_DEPLOY_TOKEN: token,
      },
      description: `deno deploy switch for '${appSlug}'`,
    });

    const configPath = join(switchWorkspaceRoot, "deno.jsonc");
    const configText = await Deno.readTextFile(configPath);
    const config = parseJsonc(configText);
    const organization = typeof config?.deploy?.org === "string" ? config.deploy.org.trim() : "";

    if (!organization) {
      throw new Error(`Unable to resolve 'deploy.org' from '${configPath}' after switching to '${appSlug}'.`);
    }

    return organization;
  });
}

export async function inferOrganizationSlugFromToken({
  token,
  consoleUrl = "https://console.deno.com",
}) {
  // Run the Deno CLI auth client in a subprocess so malformed or expired tokens
  // cannot terminate the parent provision process before fallback logic runs.
  const workerPath = new URL("./deno_cli_orgs_worker.js", import.meta.url);
  return (await runCommand({
    command: Deno.execPath(),
    args: [
      "run",
      "--quiet",
      "--allow-env=DENO_DEPLOY_TOKEN,DENO_CONSOLE_URL,__IS_WSL_TEST__",
      "--allow-net=api.deno.com,console.deno.com",
      "--allow-sys=osRelease",
      workerPath.href,
    ],
    env: {
      DENO_DEPLOY_TOKEN: token,
      DENO_CONSOLE_URL: consoleUrl,
    },
    description: "direct token organization inference",
  })).trim();
}

export async function inferOrganizationSlugFromApp({
  repoRoot,
  token,
  appSlug,
}) {
  return await readOrganizationFromDeploySwitchConfig({
    repoRoot,
    token,
    appSlug,
  });
}

export async function inferOrganizationSlugFromAccessibleApps({
  repoRoot,
  token,
  deno,
}) {
  const apps = await deno.listApps();
  const probeAppSlugs = [...new Set(
    (Array.isArray(apps) ? apps : [])
      .map((app) => typeof app?.slug === "string" ? app.slug.trim() : "")
      .filter(Boolean),
  )];

  if (probeAppSlugs.length === 0) {
    throw new Error(
      "organization was not provided and could not be inferred from the token because no accessible Deno apps were found.",
    );
  }

  const inferredOrganizations = [];
  const switchFailures = [];
  for (const probeAppSlug of probeAppSlugs) {
    try {
      inferredOrganizations.push({
        slug: await inferOrganizationSlugFromApp({
          repoRoot,
          token,
          appSlug: probeAppSlug,
        }),
      });
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : String(caughtError);
      switchFailures.push(`${probeAppSlug}: ${message}`);
    }
  }

  if (inferredOrganizations.length === 0) {
    const failureSummary = switchFailures.length > 0 ? ` ${switchFailures.join(" | ")}` : "";
    throw new Error(
      `organization was not provided and could not be inferred from accessible Deno apps.${failureSummary}`,
    );
  }

  return selectOrganizationSlug(inferredOrganizations);
}
