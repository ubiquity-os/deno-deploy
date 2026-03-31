import { join } from "jsr:@std/path@1.1.2";
import { parse as parseJsonc } from "jsr:@std/jsonc";
import { appendSummary, error, info, notice, setOutput, warning } from "./lib/actions.js";
import { getBooleanOption, getStringOption, parseArgs, requireString, slugify } from "./lib/cli.js";
import { DenoApiClient } from "./lib/deno_api.js";
import { ensureArtifactBranch, GitHubApiClient } from "./lib/github_api.js";

const APP_CONFIG = {
  install: "deno install",
  build:
    'deno deploy switch --token "$PLUGIN_MANIFEST_SWITCH_TOKEN" --app "$DENO_DEPLOY_APPLICATION_SLUG" && deno x -y @ubiquity-os/plugin-manifest-tool@latest',
  predeploy: "deno install",
};

function isSecretKey(key, hasPublicPrefix) {
  const commonSecretPattern =
    /^(?!.*(?:^|_)(PUBLIC|NEXT_PUBLIC|EXPOSED)(?:_|$)).*(KEY|SECRET|TOKEN|PASSWORD|PRIVATE|CREDENTIALS|AUTH)(?![A-Za-z])/i;
  if (hasPublicPrefix) {
    return !/^PUBLIC_|^NEXT_PUBLIC_/.test(key);
  }
  return commonSecretPattern.test(key);
}

function parseEnvFileContent(content) {
  const entries = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();
    if (!key) {
      continue;
    }

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    entries[key] = value
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\");
  }

  return entries;
}

async function loadEnvironmentSource(envFilePath) {
  if (!envFilePath) {
    return Deno.env.toObject();
  }

  return parseEnvFileContent(await Deno.readTextFile(envFilePath));
}

function collectRuntimeEnvironmentVariables(contextName, environmentSource) {
  const excludedByPattern =
    /^(DENO_|GITHUB_|RUNNER_|CI$|HOME$|PATH$|PWD$|SHELL$|SHLVL$|LANG$|LC_|TZ$|ACTIONS_|INPUT_|STATE_|JAVA_HOME$|POWERSHELL_)/;
  const excludedKeys = new Set([
    "ACTION_REF",
    "APP_ID",
    "APP_INSTALLATION_ID",
    "APP_PRIVATE_KEY",
    "BUILD_ACTION_ENABLED",
    "DENO_API_TOKEN",
    "DENO_DEPLOY_TOKEN",
    "DEPLOY_DENO_ENABLED",
    "EXCLUDE_SUPPORTED_EVENTS",
    "GH_TOKEN",
    "GITHUB_TOKEN",
    "SKIP_BOT_EVENTS",
  ]);

  const entries = Object.entries(environmentSource)
    .filter(([key]) => !excludedByPattern.test(key))
    .filter(([key]) => !excludedKeys.has(key))
    .filter(([, value]) => value !== undefined && value !== null && value.trim() !== "")
    .sort(([left], [right]) => left.localeCompare(right));

  const hasPublicPrefix = entries.some(([key]) => /^PUBLIC_|^NEXT_PUBLIC_/.test(key));

  return entries.map(([key, value]) => ({
    key,
    value,
    secret: isSecretKey(key, hasPublicPrefix),
    contexts: [contextName],
  }));
}

function collectBuildEnvironmentVariables({ repository, token }) {
  return [
    {
      key: "PLUGIN_MANIFEST_PRODUCTION_BRANCH",
      value: "main",
      secret: false,
      contexts: ["build"],
    },
    {
      key: "PLUGIN_MANIFEST_REPOSITORY",
      value: repository,
      secret: false,
      contexts: ["build"],
    },
    {
      key: "PLUGIN_MANIFEST_SWITCH_TOKEN",
      value: token,
      secret: true,
      contexts: ["build"],
    },
  ];
}

function buildConfig(entrypoint) {
  return {
    ...APP_CONFIG,
    runtime: {
      type: "dynamic",
      entrypoint,
    },
  };
}

async function readWorkspaceManifest(repoRoot) {
  const manifestPath = join(repoRoot, "manifest.json");
  try {
    return await Deno.readTextFile(manifestPath);
  } catch (caughtError) {
    if (caughtError instanceof Deno.errors.NotFound) {
      return null;
    }
    throw caughtError;
  }
}

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

  return {
    stdout: stdoutText,
    stderr: stderrText,
  };
}

async function gitFileIsTracked(repoRoot, relativePath) {
  const process = new Deno.Command("git", {
    args: ["-C", repoRoot, "ls-files", "--error-unmatch", relativePath],
    stdout: "null",
    stderr: "null",
  });
  const { code } = await process.output();
  return code === 0;
}

async function assertNoTrackedSourceDeployConfig(repoRoot) {
  for (const fileName of ["deno.json", "deno.jsonc"]) {
    if (!(await gitFileIsTracked(repoRoot, fileName))) {
      continue;
    }

    const filePath = join(repoRoot, fileName);
    const parsed = parseJsonc(await Deno.readTextFile(filePath));
    if (parsed?.deploy) {
      throw new Error(
        `Tracked source config '${fileName}' contains a 'deploy' block. Remove it so the action-managed Deno dashboard config remains authoritative.`,
      );
    }
  }
}

async function prepareWorkspaceManifest(repoRoot, manifestToolPath) {
  notice("Preparing manifest.json in the workspace before publishing dist artifacts.");
  await runCommand({
    command: "deno",
    args: ["install"],
    cwd: repoRoot,
    description: "deno install",
  });
  if (manifestToolPath) {
    await runCommand({
      command: "node",
      args: [manifestToolPath],
      cwd: repoRoot,
      description: "plugin manifest generation",
    });
  } else {
    await runCommand({
      command: "deno",
      args: ["x", "-y", "@ubiquity-os/plugin-manifest-tool@latest"],
      cwd: repoRoot,
      description: "plugin manifest generation",
    });
  }

  const manifestContent = await readWorkspaceManifest(repoRoot);
  if (!manifestContent) {
    throw new Error("plugin manifest generation completed but manifest.json was not written.");
  }
}

async function createGitHubLinkedApp({
  repoRoot,
  token,
  organization,
  appSlug,
  githubOwner,
  githubRepo,
  entrypoint,
}) {
  try {
    await runCommand({
      command: "deno",
      args: [
        "deploy",
        "create",
        "--source",
        "github",
        "--owner",
        githubOwner,
        "--repo",
        githubRepo,
        "--org",
        organization,
        "--app",
        appSlug,
        "--app-directory",
        " ",
        "--runtime-mode",
        "dynamic",
        "--entrypoint",
        entrypoint,
        "--region",
        "global",
        "--no-wait",
        "--install-command",
        APP_CONFIG.install,
        "--build-command",
        APP_CONFIG.build,
        "--pre-deploy-command",
        APP_CONFIG.predeploy,
      ],
      cwd: repoRoot,
      env: {
        DENO_DEPLOY_TOKEN: token,
      },
      description: `create Deno app '${appSlug}'`,
    });
  } catch (caughtError) {
    if (caughtError.message.includes("No GitHub identity was found for the authenticated user")) {
      throw new Error(
        `${caughtError.message}\nUse a GitHub-linked Deno user token for app creation, then rerun provision.`,
      );
    }
    throw caughtError;
  }
}

async function inferDenoSettingsUrl({ repoRoot, token, appSlug }) {
  await runCommand({
    command: "deno",
    args: ["deploy", "switch", "--token", token, "--app", appSlug],
    cwd: repoRoot,
    description: "deno deploy switch",
  });

  const configPath = join(repoRoot, "deno.jsonc");
  const configText = await Deno.readTextFile(configPath);
  const config = parseJsonc(configText);
  const organization = config?.deploy?.org;
  const inferredApp = config?.deploy?.app;

  if (typeof organization !== "string" || !organization) {
    throw new Error(`Unable to resolve 'deploy.org' from '${configPath}'.`);
  }

  const targetApp = typeof inferredApp === "string" && inferredApp ? inferredApp : appSlug;
  return `https://console.deno.com/${organization}/${targetApp}/settings`;
}

async function publishManifestArtifact({
  github,
  repoRoot,
  sourceBranch,
  defaultBranch,
  artifactBranch,
}) {
  const manifestContent = await readWorkspaceManifest(repoRoot);
  if (!manifestContent) {
    notice("manifest.json was not found in the workspace. Skipping dist branch publication.");
    return null;
  }

  await ensureArtifactBranch({
    github,
    sourceBranch,
    defaultBranch,
    artifactBranch,
  });

  const existing = await github.getFile("manifest.json", artifactBranch);
  if (existing?.content === manifestContent) {
    info(`manifest.json is unchanged on '${artifactBranch}'.`);
    return artifactBranch;
  }

  await github.putFile({
    path: "manifest.json",
    branch: artifactBranch,
    message: `chore: [skip ci] publish manifest for ${sourceBranch}`,
    content: manifestContent,
    sha: existing?.sha,
  });

  notice(`Published manifest.json to '${artifactBranch}'.`);
  return artifactBranch;
}

function redactEnvVars(envVars) {
  return envVars.map((envVar) => ({
    ...envVar,
    value: envVar.secret ? "[REDACTED]" : envVar.value,
  }));
}

function summarizeDryRun({
  appSlug,
  organization,
  contextName,
  runtimeEnvVars,
  buildEnvVars,
  patchPayload,
}) {
  info(`Dry run for app '${appSlug}'${organization ? ` in organization '${organization}'` : ""}`);
  info(`Runtime environment context: ${contextName}`);
  info(`Runtime environment variable count: ${runtimeEnvVars.length}`);
  info(`Build environment variable count: ${buildEnvVars.length}`);
  if (organization) {
    info(`Create flow: deno deploy create --source github ... --org ${organization} --app ${appSlug}`);
  } else {
    info(`Create flow: organization was not provided, so missing-app creation would fail until one is supplied.`);
  }
  info(`Patch payload: ${JSON.stringify({
    ...patchPayload,
    env_vars: redactEnvVars(patchPayload.env_vars || []),
  }, null, 2)}`);
}

async function main() {
  const args = parseArgs(Deno.args);
  const repoRoot = getStringOption(args, "repo-root", "REPO_ROOT", Deno.cwd());
  const token = requireString(
    "token",
    getStringOption(args, "token", "", "") || Deno.env.get("DENO_API_TOKEN") || Deno.env.get("DENO_DEPLOY_TOKEN") || "",
  );
  const organization = getStringOption(args, "organization", "ORGANIZATION");
  const githubOwner = requireString("github-owner", getStringOption(args, "github-owner", "GITHUB_OWNER"));
  const githubRepo = requireString("github-repo", getStringOption(args, "github-repo", "GITHUB_REPO"));
  const refName = requireString("ref-name", getStringOption(args, "ref-name", "REF_NAME"));
  const defaultBranch = requireString("default-branch", getStringOption(args, "default-branch", "DEFAULT_BRANCH"));
  const entrypoint = getStringOption(args, "entrypoint", "ENTRYPOINT", "src/deno.ts");
  const appSlug = slugify(getStringOption(args, "app", "DENO_APP_SLUG", githubRepo));
  const githubToken = getStringOption(args, "github-token", "GITHUB_TOKEN");
  const dryRun = getBooleanOption(args, "dry-run", "DRY_RUN", false);
  const syncEnv = getBooleanOption(args, "sync-env", "SYNC_ENV", true);
  const denoApiBaseUrl = getStringOption(args, "deno-api-base-url", "DENO_API_BASE_URL", "https://api.deno.com");
  const githubApiBaseUrl = getStringOption(args, "github-api-base-url", "GITHUB_API_URL", "https://api.github.com");
  const envFilePath = getStringOption(args, "env-file", "ENV_FILE");
  const manifestToolPath = getStringOption(args, "manifest-tool-path", "PLUGIN_MANIFEST_TOOL_PATH");
  const contextName = refName === defaultBranch ? "production" : "preview";
  const artifactBranch = `dist/${refName}`;
  const repository = `${githubOwner}/${githubRepo}`;

  if (contextName === "preview") {
    notice("Non-default branches share the Deno Deploy Preview context. Later runs on other branches can replace preview-scoped values.");
  }

  const environmentSource = await loadEnvironmentSource(envFilePath);
  const runtimeEnvVars = syncEnv ? collectRuntimeEnvironmentVariables(contextName, environmentSource) : [];
  const buildEnvVars = collectBuildEnvironmentVariables({
    repository,
    token,
  });
  const patchPayload = {
    config: buildConfig(entrypoint),
    env_vars: [...runtimeEnvVars, ...buildEnvVars],
  };

  if (dryRun) {
    summarizeDryRun({
      appSlug,
      organization,
      contextName,
      runtimeEnvVars,
      buildEnvVars,
      patchPayload,
    });
    await setOutput("app_slug", appSlug);
    return;
  }

  if (!githubToken) {
    throw new Error("github-token is required to publish manifest.json to dist branches.");
  }

  await assertNoTrackedSourceDeployConfig(repoRoot);
  await prepareWorkspaceManifest(repoRoot, manifestToolPath);

  const deno = new DenoApiClient({
    token,
    baseUrl: denoApiBaseUrl,
  });
  const github = new GitHubApiClient({
    token: githubToken,
    owner: githubOwner,
    repo: githubRepo,
    baseUrl: githubApiBaseUrl,
  });

  const existingApp = await deno.getApp(appSlug);
  if (!existingApp) {
    if (!organization) {
      throw new Error(
        `organization is required to create missing app '${appSlug}'. Provide the action input or ORGANIZATION env var and rerun provision.`,
      );
    }
    notice(`Creating GitHub-linked Deno app '${appSlug}'.`);
    await createGitHubLinkedApp({
      repoRoot,
      token,
      organization,
      appSlug,
      githubOwner,
      githubRepo,
      entrypoint,
    });
  } else {
    notice(`Updating Deno app '${appSlug}'.`);
  }

  await deno.patchApp(appSlug, patchPayload);
  await setOutput("app_slug", appSlug);

  await publishManifestArtifact({
    github,
    repoRoot,
    sourceBranch: refName,
    defaultBranch,
    artifactBranch,
  });

  try {
    const settingsUrl = await inferDenoSettingsUrl({
      repoRoot,
      token,
      appSlug,
    });
    await appendSummary(`Link the project to GitHub if not done already: ${settingsUrl}`);
  } catch (summaryError) {
    warning(`Unable to append the Deno settings summary link: ${summaryError.message}`);
  }
}

try {
  await main();
} catch (caughtError) {
  error(caughtError.message);
  throw caughtError;
}
