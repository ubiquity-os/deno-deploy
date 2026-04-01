import { error, info, notice, setOutput, warning } from "./lib/actions.js";
import { getStringOption, parseArgs, requireString } from "./lib/cli.js";
import { DenoApiClient } from "./lib/deno_api.js";
import { GitHubApiClient } from "./lib/github_api.js";

function sanitizeBranchRefName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function extractTimelineBranch(timeline) {
  const candidates = [
    timeline?.partition?.["git.branch"],
    timeline?.partition?.["git.branch_sanitized"],
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
    if (value && !value.includes("/") && value !== "production" && value !== "preview" && value !== "git-branch") {
      return value;
    }
  }

  return null;
}

function normalizeDomain(domain) {
  if (!domain) {
    return null;
  }

  return domain.startsWith("http://") || domain.startsWith("https://") ? domain : `https://${domain}`;
}

function updateManifestHomepage(content, homepageUrl) {
  let manifest;
  try {
    manifest = JSON.parse(content);
  } catch (error) {
    throw new Error(`Invalid JSON in manifest.json: ${error.message}`);
  }
  manifest.homepage_url = homepageUrl;
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

function collectManifestTargets(timelines, productionBranch) {
  const targets = new Map();

  for (const timeline of timelines) {
    const branch = extractTimelineBranch(timeline);
    const homepageUrl = normalizeDomain(timeline?.domains?.[0]?.domain);
    if (!branch || !homepageUrl) {
      continue;
    }
    targets.set(branch, homepageUrl);
  }

  if (targets.size > 0) {
    return targets;
  }

  const productionTimeline = timelines.find((timeline) => timeline?.slug === "production" && timeline?.domains?.length);
  const productionUrl = normalizeDomain(productionTimeline?.domains?.[0]?.domain);
  if (productionUrl) {
    targets.set(productionBranch, productionUrl);
  }

  return targets;
}

async function resolveArtifactBranch(github, branch) {
  const directArtifactBranch = `dist/${branch}`;
  if (await github.getFile("manifest.json", directArtifactBranch)) {
    return directArtifactBranch;
  }

  const expectedSlug = sanitizeBranchRefName(branch);
  if (!expectedSlug) {
    return directArtifactBranch;
  }

  const refs = await github.listMatchingRefs("heads/dist/");
  const candidates = refs
    .map((ref) => String(ref.ref || "").replace(/^refs\/heads\/dist\//, ""))
    .filter(Boolean);
  const exactMatches = candidates.filter((candidate) => sanitizeBranchRefName(candidate) === expectedSlug);
  const prefixMatches = exactMatches.length > 0
    ? exactMatches
    : candidates.filter((candidate) => sanitizeBranchRefName(candidate).startsWith(expectedSlug));
  const matches = prefixMatches;

  if (matches.length === 1) {
    const resolvedArtifactBranch = `dist/${matches[0]}`;
    notice(`Resolved sanitized Deno branch '${branch}' to artifact branch '${resolvedArtifactBranch}'.`);
    return resolvedArtifactBranch;
  }

  if (matches.length > 1) {
    warning(
      `Multiple dist branches matched sanitized Deno branch '${branch}': ${matches.join(", ")}. Falling back to '${directArtifactBranch}'.`,
    );
  }

  return directArtifactBranch;
}

async function updatePublishedManifest({
  github,
  branch,
  homepageUrl,
}) {
  const artifactBranch = await resolveArtifactBranch(github, branch);
  const existing = await github.getFile("manifest.json", artifactBranch);
  if (!existing) {
    warning(`No manifest.json was found on '${artifactBranch}'. Skipping homepage update.`);
    return null;
  }

  const nextContent = updateManifestHomepage(existing.content, homepageUrl);
  if (nextContent === existing.content) {
    info(`manifest.json homepage_url is unchanged on '${artifactBranch}'.`);
    return artifactBranch;
  }

  await github.putFile({
    path: "manifest.json",
    branch: artifactBranch,
    message: `chore: [skip ci] update manifest homepage for ${branch}`,
    content: nextContent,
    sha: existing.sha,
  });
  notice(`Updated homepage_url in '${artifactBranch}' to '${homepageUrl}'.`);
  return artifactBranch;
}

async function main() {
  const args = parseArgs(Deno.args);
  const token = requireString(
    "token",
    getStringOption(args, "token", "", "") || Deno.env.get("DENO_API_TOKEN") || Deno.env.get("DENO_DEPLOY_TOKEN") || "",
  );
  const githubToken = requireString("github-token", getStringOption(args, "github-token", "GITHUB_TOKEN"));
  const githubOwner = requireString("github-owner", getStringOption(args, "github-owner", "GITHUB_OWNER"));
  const githubRepo = requireString("github-repo", getStringOption(args, "github-repo", "GITHUB_REPO"));
  const revisionId = requireString("revision-id", getStringOption(args, "revision-id", "REVISION_ID"));
  const appSlug = getStringOption(args, "app-slug", "APP_SLUG");
  const productionBranch = getStringOption(args, "production-branch", "PRODUCTION_BRANCH", "main");
  const denoApiBaseUrl = getStringOption(args, "deno-api-base-url", "DENO_API_BASE_URL", "https://api.deno.com");
  const githubApiBaseUrl = getStringOption(args, "github-api-base-url", "GITHUB_API_URL", "https://api.github.com");

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

  const timelines = await deno.getRevisionTimelines(revisionId);
  const targets = collectManifestTargets(timelines, productionBranch);

  await setOutput("revision_id", revisionId);
  if (appSlug) {
    await setOutput("app_slug", appSlug);
  }

  if (targets.size === 0) {
    warning(`No routed timelines with domains were found for revision '${revisionId}'.`);
    return;
  }

  let firstHomepageUrl = null;
  for (const [branch, homepageUrl] of targets.entries()) {
    if (!firstHomepageUrl) {
      firstHomepageUrl = homepageUrl;
    }
    await updatePublishedManifest({
      github,
      branch,
      homepageUrl,
    });
  }

  if (firstHomepageUrl) {
    await setOutput("homepage_url", firstHomepageUrl);
  }
}

try {
  await main();
} catch (caughtError) {
  error(caughtError.message);
  throw caughtError;
}
