import { assertEquals, assertThrows } from "jsr:@std/assert@1.0.13";
import { selectOrganizationSlug } from "./deno_org_selection.js";

Deno.test("selectOrganizationSlug returns the only accessible organization slug", () => {
  assertEquals(
    selectOrganizationSlug([{ slug: "ubiquity-os" }]),
    "ubiquity-os",
  );
});

Deno.test("selectOrganizationSlug collapses duplicate organization slugs", () => {
  assertEquals(
    selectOrganizationSlug([
      { slug: "ubiquity-os" },
      { slug: "ubiquity-os" },
    ]),
    "ubiquity-os",
  );
});

Deno.test("selectOrganizationSlug rejects tokens with no accessible organizations", () => {
  assertThrows(
    () => selectOrganizationSlug([]),
    Error,
    "no accessible Deno organizations were found",
  );
});

Deno.test("selectOrganizationSlug rejects ambiguous multi-organization tokens", () => {
  assertThrows(
    () => selectOrganizationSlug([
      { slug: "ubiquity-os" },
      { slug: "another-org" },
    ]),
    Error,
    "multiple Deno organizations",
  );
});
