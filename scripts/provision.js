import { isAbsolute, join, relative, resolve } from "jsr:@std/path@1.1.2";
import { parse as parseJsonc } from "jsr:@std/jsonc";
import { error, info, notice, setOutput, warning } from "./lib/actions.js";
import {
  getBooleanOption,
  getStringOption,
  parseArgs,
  requireString,
  slugify,
} from "./lib/cli.js";
import {
  inferOrganizationSlugFromAccessibleApps,
  inferOrganizationSlugFromApp,
  inferOrganizationSlugFromToken,
} from "./lib/deno_cli_orgs.js";
import { DenoApiClient } from "./lib/deno_api.js";
import { ensureArtifactBranch, GitHubApiClient } from "./lib/github_api.js";
import { resolveOrganization } from "./lib/deno_org_resolution.js";

const PLUGIN_MANIFEST_TOOL_SPEC = "@ubiquity-os/plugin-manifest-tool@latest";

function buildManagedCommands(repository) {
  return {
    install: "deno install",
    build:
      `deno x -y ${PLUGIN_MANIFEST_TOOL_SPEC} --repository ${repository} --production-branch main`,
    predeploy: "deno install",
  };
}

function isSecretKey(key, hasPublicPrefix) {
  const commonSecretPattern =
    /^(?!.*(?:^|_)(PUBLIC|NEXT_PUBLIC|EXPOSED)(?:_|$)).*(KEY|SECRET|TOKEN|PASSWORD|PRIVATE|CREDENTIALS|AUTH)(?![A-Za-z])/i;
  if (hasPublicPrefix) {
    return !/^PUBLIC_|^NEXT_PUBLIC_/.test(key);
  }
  return commonSecretPattern.test(key);
}

export function parseEnvFileContent(content) {
  const entries = {};
  const escapedBackslashPlaceholder = "\u0000";

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
      .replace(/\\\\/g, escapedBackslashPlaceholder)
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")
      .replace(/\\"/g, '"')
      .replaceAll(escapedBackslashPlaceholder, "\\");
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
    "BUILD_ACTION_ENABLED",
    "DENO_API_TOKEN",
    "DENO_DEPLOY_TOKEN",
    "DEPLOY_DENO_ENABLED",
    "EXCLUDE_SUPPORTED_EVENTS",
    "GH_TOKEN",
    "GITHUB_TOKEN",
    "REF_NAME",
    "SKIP_BOT_EVENTS",
  ]);

  const entries = Object.entries(environmentSource)
    .filter(([key]) => !excludedByPattern.test(key))
    .filter(([key]) => !excludedKeys.has(key))
    .filter(([, value]) =>
      value !== undefined && value !== null && value.trim() !== ""
    )
    .sort(([left], [right]) => left.localeCompare(right));

  const hasPublicPrefix = entries.some(([key]) =>
    /^PUBLIC_|^NEXT_PUBLIC_/.test(key)
  );

  return entries.map(([key, value]) => ({
    key,
    value,
    secret: isSecretKey(key, hasPublicPrefix),
    contexts: [contextName],
  }));
}

function collectManagedRuntimeEnvironmentVariables({ contextName, refName }) {
  return [
    {
      key: "REF_NAME",
      value: refName,
      secret: false,
      contexts: [contextName],
    },
  ];
}

function collectBuildEnvironmentVariables({ repository, refName }) {
  const envVars = [
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
      key: "REF_NAME",
      value: refName,
      secret: false,
      contexts: ["build"],
    },
  ];
  return envVars;
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function mergeUnstableFlags(sourceConfig) {
  const merged = [];
  const seen = new Set();

  for (const value of sourceConfig.unstable || []) {
    if (typeof value !== "string" || seen.has(value)) {
      continue;
    }
    seen.add(value);
    merged.push(value);
  }

  if (!seen.has("kv")) {
    merged.push("kv");
  }

  return merged;
}

export function buildConfig(entrypoint, repository, sourceConfig = {}) {
  const runtime = isPlainObject(sourceConfig.runtime)
    ? sourceConfig.runtime
    : {};

  return {
    ...sourceConfig,
    ...buildManagedCommands(repository),
    unstable: mergeUnstableFlags(sourceConfig),
    runtime: {
      ...runtime,
      type: "dynamic",
      entrypoint,
    },
  };
}

function normalizeEntrypoint(repoRoot, entrypoint) {
  if (!isAbsolute(entrypoint)) {
    return entrypoint.replaceAll("\\", "/");
  }

  const relativeEntrypoint = relative(repoRoot, entrypoint).replaceAll(
    "\\",
    "/",
  );
  if (
    !relativeEntrypoint ||
    relativeEntrypoint === "." ||
    relativeEntrypoint.startsWith("../") ||
    relativeEntrypoint === ".."
  ) {
    throw new Error(
      `Entrypoint '${entrypoint}' must be relative to the repository root '${repoRoot}' when using an absolute path.`,
    );
  }

  return relativeEntrypoint;
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

function manifestHasHomepageUrl(content) {
  if (!content) {
    return false;
  }

  try {
    const manifest = JSON.parse(content);
    return typeof manifest?.homepage_url === "string" &&
      manifest.homepage_url.trim() !== "";
  } catch {
    return false;
  }
}

function updateManifestHomepage(content, homepageUrl) {
  let manifest;
  try {
    manifest = JSON.parse(content);
  } catch (caughtError) {
    throw new Error(`Invalid JSON in manifest.json: ${caughtError.message}`);
  }

  manifest.homepage_url = homepageUrl;
  return `${JSON.stringify(manifest, null, 2)}\n`;
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
    const details = stderrText || stdoutText ||
      `${description} exited with code ${code}.`;
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

export async function readTrackedSourceConfig(repoRoot) {
  for (const fileName of ["deno.json", "deno.jsonc"]) {
    if (!(await gitFileIsTracked(repoRoot, fileName))) {
      continue;
    }

    const filePath = join(repoRoot, fileName);
    const parsed = parseJsonc(await Deno.readTextFile(filePath));
    if (!isPlainObject(parsed)) {
      throw new Error(
        `Tracked source config '${fileName}' must contain a JSON object at the top level.`,
      );
    }
    if (parsed?.deploy) {
      throw new Error(
        `Tracked source config '${fileName}' contains a 'deploy' block. Remove it so the action-managed Deno dashboard config remains authoritative.`,
      );
    }

    return {
      fileName,
      config: parsed,
    };
  }

  return {
    fileName: null,
    config: {},
  };
}

export async function stageWorkspaceDeployConfig({
  repoRoot,
  fileName,
  config,
}) {
  const targetFileName = fileName || "deno.jsonc";
  const targetPath = join(repoRoot, targetFileName);
  let originalContent = null;

  try {
    originalContent = await Deno.readTextFile(targetPath);
  } catch (caughtError) {
    if (!(caughtError instanceof Deno.errors.NotFound)) {
      throw caughtError;
    }
  }

  await Deno.writeTextFile(targetPath, `${JSON.stringify(config, null, 2)}\n`);

  return {
    fileName: targetFileName,
    path: targetPath,
    async restore() {
      if (originalContent === null) {
        try {
          await Deno.remove(targetPath);
        } catch (caughtError) {
          if (!(caughtError instanceof Deno.errors.NotFound)) {
            throw caughtError;
          }
        }
        return;
      }

      await Deno.writeTextFile(targetPath, originalContent);
    },
  };
}

async function prepareWorkspaceManifest(repoRoot, manifestToolPath) {
  notice(
    "Preparing manifest.json in the workspace before publishing dist artifacts.",
  );
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
      args: ["x", "-y", PLUGIN_MANIFEST_TOOL_SPEC],
      cwd: repoRoot,
      description: "plugin manifest generation",
    });
  }

  const manifestContent = await readWorkspaceManifest(repoRoot);
  if (!manifestContent) {
    throw new Error(
      "plugin manifest generation completed but manifest.json was not written.",
    );
  }
}

async function createDenoApp({
  deno,
  appSlug,
  payload,
}) {
  return deno.createApp({
    slug: appSlug,
    ...payload,
  });
}

async function deployBranchApp({
  repoRoot,
  token,
  organization,
  appSlug,
  entrypoint,
  managedConfig,
  sourceConfigFileName,
}) {
  const nodeModulesPath = join(repoRoot, "node_modules");
  try {
    const nodeModulesInfo = await Deno.stat(nodeModulesPath);
    if (nodeModulesInfo.isDirectory) {
      notice(
        "Removing node_modules before deploy so Deno uploads only the workspace source.",
      );
      await Deno.remove(nodeModulesPath, { recursive: true });
    }
  } catch (caughtError) {
    if (!(caughtError instanceof Deno.errors.NotFound)) {
      throw caughtError;
    }
  }

  const stagedConfig = await stageWorkspaceDeployConfig({
    repoRoot,
    fileName: sourceConfigFileName,
    config: {
      ...managedConfig,
      deploy: {
        org: organization,
        app: appSlug,
        entrypoint,
      },
    },
  });

  notice(
    `Staged temporary ${stagedConfig.fileName} for deploy upload with unstable features: ${
      JSON.stringify(managedConfig.unstable || [])
    }.`,
  );

  let deployError = null;

  try {
    await runCommand({
      command: "deno",
      args: [
        "--unstable-kv",
        "deploy",
        ".",
        "--config",
        stagedConfig.path,
        "--prod",
      ],
      cwd: repoRoot,
      env: {
        DENO_DEPLOY_TOKEN: token,
      },
      description: `deploy Deno app '${appSlug}'`,
    });
  } catch (caughtError) {
    deployError = caughtError;
  }

  try {
    await stagedConfig.restore();
  } catch (caughtError) {
    if (deployError) {
      warning(
        `Failed to restore ${stagedConfig.fileName} after deploy error: ${caughtError.message}`,
      );
    } else {
      throw caughtError;
    }
  }

  if (deployError) {
    throw deployError;
  }
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
    notice(
      "manifest.json was not found in the workspace. Skipping dist branch publication.",
    );
    return {
      artifactBranch: null,
      hasHomepageUrl: false,
    };
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
    return {
      artifactBranch,
      hasHomepageUrl: manifestHasHomepageUrl(manifestContent),
    };
  }

  await github.putFile({
    path: "manifest.json",
    branch: artifactBranch,
    message: `chore: [skip ci] publish manifest for ${sourceBranch}`,
    content: manifestContent,
    sha: existing?.sha,
  });

  notice(`Published manifest.json to '${artifactBranch}'.`);
  return {
    artifactBranch,
    hasHomepageUrl: manifestHasHomepageUrl(manifestContent),
  };
}

async function writeWorkspaceManifestHomepage(repoRoot, homepageUrl) {
  const manifestContent = await readWorkspaceManifest(repoRoot);
  if (!manifestContent) {
    throw new Error(
      "manifest.json was not found in the workspace after deploy.",
    );
  }

  await Deno.writeTextFile(
    join(repoRoot, "manifest.json"),
    updateManifestHomepage(manifestContent, homepageUrl),
  );
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
  fallbackOrganization,
  runtimeEnvVars,
  buildEnvVars,
  patchPayload,
}) {
  info(
    `Dry run for app '${appSlug}'${
      organization ? ` in organization '${organization}'` : ""
    }`,
  );
  info("Runtime environment context: production");
  info(`Runtime environment variable count: ${runtimeEnvVars.length}`);
  info(`Build environment variable count: ${buildEnvVars.length}`);
  if (organization) {
    info(
      `Missing-app flow: create app metadata via POST /v2/apps for '${appSlug}', then deno --unstable-kv deploy . --config .deno-branch-app.jsonc --prod`,
    );
    info(
      "Existing-app flow: deno --unstable-kv deploy . --config .deno-branch-app.jsonc --prod",
    );
  } else if (fallbackOrganization) {
    info(
      `Missing-app flow: organization was not provided, so provision will first infer it from the token and then fall back to DENO_ORG_NAME='${fallbackOrganization}' if inference is unavailable.`,
    );
    info(
      "Existing-app flow: deno --unstable-kv deploy . --config .deno-branch-app.jsonc --prod",
    );
  } else {
    info(
      "Missing-app flow: organization was not provided, so provision will infer it from the token using the working direct and app-based paths before failing.",
    );
    info(
      "Existing-app flow: deno --unstable-kv deploy . --config .deno-branch-app.jsonc --prod",
    );
  }
  info(`Patch payload: ${
    JSON.stringify(
      {
        ...patchPayload,
        env_vars: redactEnvVars(patchPayload.env_vars || []),
      },
      null,
      2,
    )
  }`);
}

async function main() {
  const args = parseArgs(Deno.args);
  const repoRoot = resolve(
    getStringOption(args, "repo-root", "REPO_ROOT", Deno.cwd()),
  );
  const token = requireString(
    "token",
    getStringOption(args, "token", "", "") || Deno.env.get("DENO_API_TOKEN") ||
      Deno.env.get("DENO_DEPLOY_TOKEN") || "",
  );
  const organization = getStringOption(args, "organization", "ORGANIZATION");
  const fallbackOrganization = (Deno.env.get("DENO_ORG_NAME") || "").trim();
  const githubOwner = requireString(
    "github-owner",
    getStringOption(args, "github-owner", "GITHUB_OWNER"),
  );
  const githubRepo = requireString(
    "github-repo",
    getStringOption(args, "github-repo", "GITHUB_REPO"),
  );
  const refName = requireString(
    "ref-name",
    getStringOption(args, "ref-name", "REF_NAME"),
  );
  const defaultBranch = requireString(
    "default-branch",
    getStringOption(args, "default-branch", "DEFAULT_BRANCH"),
  );
  const entrypoint = normalizeEntrypoint(
    repoRoot,
    getStringOption(args, "entrypoint", "ENTRYPOINT", "src/deno.ts"),
  );
  const appSlug = slugify(
    getStringOption(args, "app", "DENO_APP_SLUG", githubRepo),
  );
  const githubToken = getStringOption(args, "github-token", "GITHUB_TOKEN");
  const dryRun = getBooleanOption(args, "dry-run", "DRY_RUN", false);
  const denoApiBaseUrl = getStringOption(
    args,
    "deno-api-base-url",
    "DENO_API_BASE_URL",
    "https://api.deno.com",
  );
  const denoConsoleUrl = getStringOption(
    args,
    "deno-console-url",
    "DENO_CONSOLE_URL",
    "https://console.deno.com",
  );
  const githubApiBaseUrl = getStringOption(
    args,
    "github-api-base-url",
    "GITHUB_API_URL",
    "https://api.github.com",
  );
  const envFilePath = getStringOption(args, "env-file", "ENV_FILE");
  const manifestToolPath = getStringOption(
    args,
    "manifest-tool-path",
    "PLUGIN_MANIFEST_TOOL_PATH",
  );
  const contextName = "production";
  const artifactBranch = `dist/${refName}`;
  const repository = `${githubOwner}/${githubRepo}`;

  const environmentSource = await loadEnvironmentSource(envFilePath);
  const runtimeEnvVars = collectRuntimeEnvironmentVariables(
    contextName,
    environmentSource,
  );
  const managedRuntimeEnvVars = collectManagedRuntimeEnvironmentVariables({
    contextName,
    refName,
  });
  const buildEnvVars = collectBuildEnvironmentVariables({
    repository,
    refName,
  });
  const sourceConfigState = await readTrackedSourceConfig(repoRoot);
  const patchPayload = {
    config: buildConfig(entrypoint, repository, sourceConfigState.config),
    env_vars: [...runtimeEnvVars, ...managedRuntimeEnvVars, ...buildEnvVars],
  };

  if (dryRun) {
    summarizeDryRun({
      appSlug,
      organization,
      fallbackOrganization,
      runtimeEnvVars: [...runtimeEnvVars, ...managedRuntimeEnvVars],
      buildEnvVars,
      patchPayload,
    });
    await setOutput("app_slug", appSlug);
    return;
  }

  if (!githubToken) {
    throw new Error(
      "github-token is required to publish manifest.json to dist branches.",
    );
  }

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
  const { organization: effectiveOrganization, source: organizationSource } =
    await resolveOrganization({
      organization,
      fallbackOrganization,
      token,
      repoRoot,
      appSlug,
      hasExistingApp: Boolean(existingApp),
      deno,
      consoleUrl: denoConsoleUrl,
      inferFromToken: inferOrganizationSlugFromToken,
      inferFromApp: inferOrganizationSlugFromApp,
      inferFromAccessibleApps: inferOrganizationSlugFromAccessibleApps,
    });

  switch (organizationSource) {
    case "input":
      notice(`Using explicit Deno organization '${effectiveOrganization}'.`);
      break;
    case "token":
      notice(
        `Inferred Deno organization '${effectiveOrganization}' directly from the token.`,
      );
      break;
    case "existing-app":
      notice(
        `Inferred Deno organization '${effectiveOrganization}' from the existing app '${appSlug}'.`,
      );
      break;
    case "accessible-apps":
      notice(
        `Inferred Deno organization '${effectiveOrganization}' from accessible Deno apps.`,
      );
      break;
    case "env":
      notice(
        `Using DENO_ORG_NAME fallback '${effectiveOrganization}' after token inference was unavailable.`,
      );
      break;
  }

  await setOutput("organization_slug", effectiveOrganization);

  if (!existingApp) {
    notice(
      `Creating Deno app '${appSlug}' via the Deno API before the first production deploy.`,
    );
    await createDenoApp({
      deno,
      appSlug,
      payload: patchPayload,
    });
  } else {
    notice(`Updating Deno app '${appSlug}'.`);
    await deno.patchApp(appSlug, patchPayload);
  }

  await setOutput("app_slug", appSlug);

  notice(`Deploying Deno branch app '${appSlug}'.`);
  await deployBranchApp({
    repoRoot,
    token,
    organization: effectiveOrganization,
    appSlug,
    entrypoint,
    managedConfig: patchPayload.config,
    sourceConfigFileName: sourceConfigState.fileName,
  });
  const homepageUrl = `https://${appSlug}.${effectiveOrganization}.deno.net`;
  await writeWorkspaceManifestHomepage(repoRoot, homepageUrl);
  await setOutput("homepage_url", homepageUrl);
  notice(
    `Deployed '${appSlug}' and updated workspace manifest homepage_url to '${homepageUrl}'.`,
  );

  await publishManifestArtifact({
    github,
    repoRoot,
    sourceBranch: refName,
    defaultBranch,
    artifactBranch,
  });
}

if (import.meta.main) {
  try {
    await main();
  } catch (caughtError) {
    error(caughtError.message);
    throw caughtError;
  }
}
