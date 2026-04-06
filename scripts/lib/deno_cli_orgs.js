import tokenStorage from "https://jsr.io/@deno/deploy/0.0.69/token_storage.ts";
import { createTrpcClient } from "https://jsr.io/@deno/deploy/0.0.69/auth.ts";
import { selectOrganizationSlug } from "./deno_org_selection.js";

export async function inferOrganizationSlugFromToken({
  token,
  consoleUrl = "https://console.deno.com",
}) {
  // The public v2 API does not expose token-to-org lookup, so reuse the same
  // CLI client path Deno Deploy uses for non-interactive organization listing.
  tokenStorage.set(token, true);
  const client = createTrpcClient(false, consoleUrl);
  const orgs = await client.orgs.list.query();
  return selectOrganizationSlug(orgs);
}
