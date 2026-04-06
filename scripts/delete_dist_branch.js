import { error, notice, warning } from "./lib/actions.js";
import { getStringOption, parseArgs, requireString } from "./lib/cli.js";
import { DenoApiClient } from "./lib/deno_api.js";
import { GitHubApiClient } from "./lib/github_api.js";

try {
  const args = parseArgs(Deno.args);
  const token = requireString(
    "token",
    getStringOption(args, "token", "", "") || Deno.env.get("DENO_API_TOKEN") || Deno.env.get("DENO_DEPLOY_TOKEN") || "",
  );
  const appSlug = requireString("app", getStringOption(args, "app", "DENO_APP_SLUG"));
  const githubToken = requireString("github-token", getStringOption(args, "github-token", "GITHUB_TOKEN"));
  const githubOwner = requireString("github-owner", getStringOption(args, "github-owner", "GITHUB_OWNER"));
  const githubRepo = requireString("github-repo", getStringOption(args, "github-repo", "GITHUB_REPO"));
  const artifactRef = requireString("artifact-ref", getStringOption(args, "artifact-ref", "ARTIFACT_REF"));
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

  const existingApp = await deno.getApp(appSlug);
  if (!existingApp) {
    warning(`Deno app '${appSlug}' was already absent.`);
  } else {
    await deno.deleteApp(appSlug);
    notice(`Deleted Deno app '${appSlug}'.`);
  }

  try {
    await github.deleteRef(`heads/${artifactRef}`);
    notice(`Deleted artifact branch '${artifactRef}'.`);
  } catch (deleteError) {
    if (deleteError.status === 404 || deleteError.status === 422) {
      warning(`Artifact branch '${artifactRef}' was already absent.`);
    } else {
      throw deleteError;
    }
  }
} catch (caughtError) {
  error(caughtError.message);
  throw caughtError;
}
