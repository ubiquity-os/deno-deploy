import { assertEquals, assertRejects } from "jsr:@std/assert@1.0.13";
import { resolveOrganization } from "./deno_org_resolution.js";

Deno.test("resolveOrganization prefers the explicit organization input", async () => {
  const result = await resolveOrganization({
    organization: "ubiquity-os",
    fallbackOrganization: "fallback-org",
    token: "token",
    repoRoot: "/tmp",
    appSlug: "app",
    hasExistingApp: true,
    deno: {},
    inferFromToken: async () => {
      throw new Error("should not run");
    },
    inferFromApp: async () => {
      throw new Error("should not run");
    },
    inferFromAccessibleApps: async () => {
      throw new Error("should not run");
    },
  });

  assertEquals(result, {
    organization: "ubiquity-os",
    source: "input",
  });
});

Deno.test("resolveOrganization uses direct token inference when it succeeds", async () => {
  const result = await resolveOrganization({
    organization: "",
    fallbackOrganization: "",
    token: "token",
    repoRoot: "/tmp",
    appSlug: "app",
    hasExistingApp: false,
    deno: {},
    inferFromToken: async () => "ubiquity-os",
    inferFromApp: async () => {
      throw new Error("should not run");
    },
    inferFromAccessibleApps: async () => {
      throw new Error("should not run");
    },
  });

  assertEquals(result, {
    organization: "ubiquity-os",
    source: "token",
  });
});

Deno.test("resolveOrganization falls back to existing-app inference after direct token inference fails", async () => {
  const result = await resolveOrganization({
    organization: "",
    fallbackOrganization: "",
    token: "token",
    repoRoot: "/tmp",
    appSlug: "app",
    hasExistingApp: true,
    deno: {},
    inferFromToken: async () => {
      throw new Error("direct failure");
    },
    inferFromApp: async () => "ubiquity-os",
    inferFromAccessibleApps: async () => {
      throw new Error("should not run");
    },
  });

  assertEquals(result, {
    organization: "ubiquity-os",
    source: "existing-app",
  });
});

Deno.test("resolveOrganization falls back to DENO_ORG_NAME when inference fails", async () => {
  const result = await resolveOrganization({
    organization: "",
    fallbackOrganization: "fallback-org",
    token: "token",
    repoRoot: "/tmp",
    appSlug: "app",
    hasExistingApp: false,
    deno: {},
    inferFromToken: async () => {
      throw new Error("direct failure");
    },
    inferFromApp: async () => {
      throw new Error("should not run");
    },
    inferFromAccessibleApps: async () => {
      throw new Error("legacy failure");
    },
  });

  assertEquals(result, {
    organization: "fallback-org",
    source: "env",
  });
});

Deno.test("resolveOrganization throws an actionable error when every path fails", async () => {
  await assertRejects(
    () =>
      resolveOrganization({
        organization: "",
        fallbackOrganization: "",
        token: "token",
        repoRoot: "/tmp",
        appSlug: "app",
        hasExistingApp: false,
        deno: {},
        inferFromToken: async () => {
          throw new Error("direct failure");
        },
        inferFromApp: async () => {
          throw new Error("should not run");
        },
        inferFromAccessibleApps: async () => {
          throw new Error("legacy failure");
        },
      }),
    Error,
    "Pass the 'organization' input or set DENO_ORG_NAME.",
  );
});
