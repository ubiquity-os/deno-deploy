import { join } from "jsr:@std/path@1.1.2";
import { error, info, notice, setOutput, warning } from "./lib/actions.js";
import {
  getBooleanOption,
  getIntegerOption,
  getStringOption,
  parseArgs,
  requireString,
  sleep,
  slugify,
} from "./lib/cli.js";
import { DenoApiClient } from "./lib/deno_api.js";
import { ensureArtifactBranch, GitHubApiClient } from "./lib/github_api.js";
import { collectAssets } from "./lib/repo_assets.js";

const APP_CONFIG = {
  install: "deno install && deno x -y @ubiquity-os/plugin-manifest-tool@latest",
  build: " ",
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

function collectEnvironmentVariables(contextName, environmentSource) {
  const excludedByPattern =
    /^(GITHUB_|RUNNER_|CI$|HOME$|PATH$|PWD$|SHELL$|SHLVL$|LANG$|LC_|TZ$|ACTIONS_|INPUT_|STATE_|JAVA_HOME$|POWERSHELL_)/;
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

function buildConfig(entrypoint) {
  return {
    ...APP_CONFIG,
    runtime: {
      type: "dynamic",
      entrypoint,
    },
  };
}

function buildRevisionLabels({ branch, sha, repository }) {
  const labels = {
    "custom.branch": branch,
    "custom.repository": repository,
  };

  if (sha) {
    labels["custom.sha"] = sha;
  }

  return labels;
}

async function readWorkspaceManifest(repoRoot) {
  const manifestPath = join(repoRoot, "manifest.json");
  try {
    return await Deno.readTextFile(manifestPath);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return null;
    }
    throw error;
  }
}

function extractTimelineBranch(timeline) {
  const candidates = [
    timeline?.partition?.["git.branch"],
    timeline?.partition?.branch,
    timeline?.partition?.git_branch,
    timeline?.partition?.ref,
    timeline?.slug,
  ].filter(Boolean);

  for (const candidate of candidates) {
    const value = String(candidate);
    if (value.startsWith("git-branch/")) {
      return value.slice("git-branch/".length);
    }
    if (value && !value.includes("/")) {
      return value;
    }
  }

  return null;
}

function findTimelineDomain(timelines, { branch, isProduction }) {
  const exact = timelines.find((timeline) => extractTimelineBranch(timeline) === branch && timeline?.domains?.length);
  const preferredSlug = isProduction ? "production" : "preview";
  const preferred = timelines.find((timeline) => timeline?.slug === preferredSlug && timeline?.domains?.length);
  const fallback = timelines.find((timeline) => timeline?.domains?.length);
  const timeline = exact ?? preferred ?? fallback;
  if (!timeline?.domains?.[0]?.domain) {
    return null;
  }

  const domain = timeline.domains[0].domain;
  return domain.startsWith("http://") || domain.startsWith("https://") ? domain : `https://${domain}`;
}

function updateManifestHomepage(content, homepageUrl) {
  const manifest = JSON.parse(content);
  manifest.homepage_url = homepageUrl;
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

async function waitForRevision({ deno, revisionId, timeoutMs, intervalMs }) {
  const startedAt = Date.now();

  while (true) {
    const revision = await deno.getRevision(revisionId);
    if (!["queued", "building"].includes(revision.status)) {
      return revision;
    }

    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(`Timed out waiting for revision '${revisionId}' after ${timeoutMs}ms.`);
    }

    await sleep(intervalMs);
  }
}

async function publishManifest({
  github,
  repoRoot,
  sourceBranch,
  defaultBranch,
  artifactBranch,
  homepageUrl,
}) {
  const manifestContent = await readWorkspaceManifest(repoRoot);
  if (!manifestContent) {
    notice("manifest.json was not found in the workspace. Skipping dist branch publication.");
    return null;
  }

  const nextContent = updateManifestHomepage(manifestContent, homepageUrl);
  await ensureArtifactBranch({
    github,
    sourceBranch,
    defaultBranch,
    artifactBranch,
  });

  const existing = await github.getFile("manifest.json", artifactBranch);
  if (existing?.content === nextContent) {
    info(`manifest.json is unchanged on '${artifactBranch}'.`);
    return artifactBranch;
  }

  await github.putFile({
    path: "manifest.json",
    branch: artifactBranch,
    message: `chore: [skip ci] publish manifest for ${sourceBranch}`,
    content: nextContent,
    sha: existing?.sha,
  });

  notice(`Published manifest.json to '${artifactBranch}' using '${homepageUrl}'.`);
  return artifactBranch;
}

function summarizeDryRun({ appSlug, contextName, trackedFiles, envVars, createPayload, patchPayload, deployPayload }) {
  info(`Dry run for app '${appSlug}'`);
  info(`Environment context: ${contextName}`);
  info(`Tracked asset count: ${trackedFiles.length}`);
  info(`Tracked asset sample: ${trackedFiles.slice(0, 20).join(", ")}`);
  info(`Environment variable count: ${envVars.length}`);
  info(`App payload: ${JSON.stringify(createPayload, null, 2)}`);
  info(`Patch payload: ${JSON.stringify(patchPayload, null, 2)}`);
  info(`Deploy payload summary: ${JSON.stringify({
    ...deployPayload,
    assets: {
      count: Object.keys(deployPayload.assets).length,
      sample: Object.keys(deployPayload.assets).slice(0, 20),
    },
  }, null, 2)}`);
}

async function main() {
  const args = parseArgs(Deno.args);
  const repoRoot = getStringOption(args, "repo-root", "REPO_ROOT", Deno.cwd());
  const token = requireString(
    "token",
    getStringOption(args, "token", "", "") || Deno.env.get("DENO_API_TOKEN") || Deno.env.get("DENO_DEPLOY_TOKEN") || "",
  );
  const githubOwner = requireString("github-owner", getStringOption(args, "github-owner", "GITHUB_OWNER"));
  const githubRepo = requireString("github-repo", getStringOption(args, "github-repo", "GITHUB_REPO"));
  const refName = requireString("ref-name", getStringOption(args, "ref-name", "REF_NAME"));
  const defaultBranch = requireString("default-branch", getStringOption(args, "default-branch", "DEFAULT_BRANCH"));
  const entrypoint = getStringOption(args, "entrypoint", "ENTRYPOINT", "src/deno.ts");
  const appSlug = slugify(getStringOption(args, "app", "DENO_APP_SLUG", githubRepo));
  const githubSha = getStringOption(args, "github-sha", "GITHUB_SHA");
  const githubToken = getStringOption(args, "github-token", "GITHUB_TOKEN");
  const dryRun = getBooleanOption(args, "dry-run", "DRY_RUN", false);
  const syncEnv = getBooleanOption(args, "sync-env", "SYNC_ENV", true);
  const timeoutMs = getIntegerOption(args, "timeout-ms", "REVISION_TIMEOUT_MS", 600000);
  const intervalMs = getIntegerOption(args, "interval-ms", "REVISION_POLL_INTERVAL_MS", 5000);
  const denoApiBaseUrl = getStringOption(args, "deno-api-base-url", "DENO_API_BASE_URL", "https://api.deno.com");
  const githubApiBaseUrl = getStringOption(args, "github-api-base-url", "GITHUB_API_URL", "https://api.github.com");
  const envFilePath = getStringOption(args, "env-file", "ENV_FILE");
  const contextName = refName === defaultBranch ? "production" : "preview";
  const isProduction = contextName === "production";
  const artifactBranch = `dist/${refName}`;

  if (contextName === "preview") {
    notice("Non-default branches share the Deno Deploy Preview context. Later runs on other branches can replace preview-scoped values.");
  }

  const environmentSource = await loadEnvironmentSource(envFilePath);
  const envVars = syncEnv ? collectEnvironmentVariables(contextName, environmentSource) : [];
  const config = buildConfig(entrypoint);
  const createPayload = {
    slug: appSlug,
    ...(envVars.length > 0 ? { env_vars: envVars } : {}),
    config,
  };
  const patchPayload = {
    ...(envVars.length > 0 ? { env_vars: envVars } : {}),
    config,
  };

  const { assets, trackedFiles, assetCount } = await collectAssets(repoRoot);
  if (assetCount === 0) {
    throw new Error(`No git-tracked assets were found in '${repoRoot}'.`);
  }

  const deployPayload = {
    assets,
    labels: buildRevisionLabels({
      branch: refName,
      sha: githubSha,
      repository: `${githubOwner}/${githubRepo}`,
    }),
    production: isProduction,
    preview: !isProduction,
  };

  if (dryRun) {
    summarizeDryRun({
      appSlug,
      contextName,
      trackedFiles,
      envVars,
      createPayload,
      patchPayload,
      deployPayload,
    });
    await setOutput("app_slug", appSlug);
    return;
  }

  if (!githubToken) {
    throw new Error("github-token is required to publish manifest.json to dist branches.");
  }

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
    notice(`Creating Deno app '${appSlug}' via API v2.`);
    await deno.createApp(createPayload);
  } else {
    notice(`Updating Deno app '${appSlug}' via API v2.`);
    await deno.patchApp(appSlug, patchPayload);
  }

  const revision = await deno.deployApp(appSlug, deployPayload);
  await setOutput("app_slug", appSlug);
  await setOutput("revision_id", revision.id);
  notice(`Created revision '${revision.id}' for app '${appSlug}'.`);

  const settledRevision = await waitForRevision({
    deno,
    revisionId: revision.id,
    timeoutMs,
    intervalMs,
  });

  if (settledRevision.status !== "succeeded") {
    let buildLogs = "";
    try {
      buildLogs = await deno.getRevisionBuildLogs(settledRevision.id);
    } catch (buildLogError) {
      warning(`Unable to fetch build logs for revision '${settledRevision.id}': ${buildLogError.message}`);
    }

    throw new Error(
      [
        `Revision '${settledRevision.id}' failed with status '${settledRevision.status}'`,
        settledRevision.failure_reason ? `failure_reason=${settledRevision.failure_reason}` : "",
        buildLogs ? `build_logs=\n${buildLogs}` : "",
      ].filter(Boolean).join("\n"),
    );
  }

  notice(`Revision '${settledRevision.id}' succeeded.`);

  const timelines = await deno.getRevisionTimelines(settledRevision.id);
  const homepageUrl = findTimelineDomain(timelines, {
    branch: refName,
    isProduction,
  });
  if (!homepageUrl) {
    warning(`No routed timeline with a domain was found for revision '${settledRevision.id}'. Skipping manifest publication.`);
    return;
  }

  await publishManifest({
    github,
    repoRoot,
    sourceBranch: refName,
    defaultBranch,
    artifactBranch,
    homepageUrl,
  });

  await setOutput("homepage_url", homepageUrl);
}

try {
  await main();
} catch (caughtError) {
  error(caughtError.message);
  throw caughtError;
}
