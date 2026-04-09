export function selectOrganizationSlug(orgs) {
  const uniqueSlugs = [...new Set(
    (Array.isArray(orgs) ? orgs : [])
      .map((org) => typeof org?.slug === "string" ? org.slug.trim() : "")
      .filter(Boolean),
  )];

  if (uniqueSlugs.length === 1) {
    return uniqueSlugs[0];
  }

  if (uniqueSlugs.length === 0) {
    throw new Error(
      "organization was not provided and could not be inferred from the token because no accessible Deno organizations were found.",
    );
  }

  throw new Error(
    `organization was not provided and the token can access multiple Deno organizations (${uniqueSlugs.join(", ")}). Pass the 'organization' input explicitly.`,
  );
}
