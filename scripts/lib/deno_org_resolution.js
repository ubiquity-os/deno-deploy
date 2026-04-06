function normalizeOrganization(value) {
  return typeof value === "string" ? value.trim() : "";
}

function formatAttemptFailure(label, caughtError) {
  const message = caughtError instanceof Error ? caughtError.message : String(caughtError);
  return `${label}: ${message}`;
}

export async function resolveOrganization({
  organization,
  fallbackOrganization,
  token,
  repoRoot,
  appSlug,
  hasExistingApp,
  deno,
  consoleUrl = "https://console.deno.com",
  inferFromToken,
  inferFromApp,
  inferFromAccessibleApps,
}) {
  const explicitOrganization = normalizeOrganization(organization);
  if (explicitOrganization) {
    return {
      organization: explicitOrganization,
      source: "input",
    };
  }

  const attemptFailures = [];

  try {
    const inferredOrganization = normalizeOrganization(await inferFromToken({
      token,
      consoleUrl,
    }));
    if (inferredOrganization) {
      return {
        organization: inferredOrganization,
        source: "token",
      };
    }
    attemptFailures.push("direct token inference returned an empty organization slug");
  } catch (caughtError) {
    attemptFailures.push(formatAttemptFailure("direct token inference", caughtError));
  }

  try {
    const inferredOrganization = normalizeOrganization(
      hasExistingApp
        ? await inferFromApp({
          repoRoot,
          token,
          appSlug,
        })
        : await inferFromAccessibleApps({
          repoRoot,
          token,
          deno,
        }),
    );

    if (inferredOrganization) {
      return {
        organization: inferredOrganization,
        source: hasExistingApp ? "existing-app" : "accessible-apps",
      };
    }

    attemptFailures.push(
      hasExistingApp
        ? "existing-app inference returned an empty organization slug"
        : "accessible-app inference returned an empty organization slug",
    );
  } catch (caughtError) {
    attemptFailures.push(formatAttemptFailure(
      hasExistingApp ? `existing-app inference for '${appSlug}'` : "accessible-app inference",
      caughtError,
    ));
  }

  const envFallbackOrganization = normalizeOrganization(fallbackOrganization);
  if (envFallbackOrganization) {
    return {
      organization: envFallbackOrganization,
      source: "env",
    };
  }

  const failureSummary = attemptFailures.length > 0 ? ` Tried: ${attemptFailures.join(" ; ")}` : "";
  throw new Error(
    `organization was not provided and could not be resolved. Pass the 'organization' input or set DENO_ORG_NAME.${failureSummary}`,
  );
}
