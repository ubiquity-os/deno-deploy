import { error, notice, warning } from "./lib/actions.js";
import { getStringOption, parseArgs, requireString } from "./lib/cli.js";
import { GitHubApiClient } from "./lib/github_api.js";

try {
  const args = parseArgs(Deno.args);
  const githubToken = requireString("github-token", getStringOption(args, "github-token", "GITHUB_TOKEN"));
  const githubOwner = requireString("github-owner", getStringOption(args, "github-owner", "GITHUB_OWNER"));
  const githubRepo = requireString("github-repo", getStringOption(args, "github-repo", "GITHUB_REPO"));
  const artifactRef = requireString("artifact-ref", getStringOption(args, "artifact-ref", "ARTIFACT_REF"));
  const githubApiBaseUrl = getStringOption(args, "github-api-base-url", "GITHUB_API_URL", "https://api.github.com");

  const github = new GitHubApiClient({
    token: githubToken,
    owner: githubOwner,
    repo: githubRepo,
    baseUrl: githubApiBaseUrl,
  });

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
