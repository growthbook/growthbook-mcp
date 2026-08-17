import { describe, expect, it } from "vitest";
import { rewriteReferencePaths } from "../scripts/bundle-skills.mjs";
import { normalizeSkillPath, parseFrontmatter } from "../src/skills.js";

describe("parseFrontmatter", () => {
  it("parses name and description", () => {
    const content = `---
name: flag-create
description: Create a feature flag
---

# Body
`;
    expect(parseFrontmatter(content)).toEqual({
      name: "flag-create",
      description: "Create a feature flag",
    });
  });

  it("strips surrounding quotes", () => {
    const content = `---
name: "flag-create"
description: 'Create a feature flag'
---
`;
    expect(parseFrontmatter(content)).toEqual({
      name: "flag-create",
      description: "Create a feature flag",
    });
  });

  it("returns empty object when frontmatter is missing", () => {
    expect(parseFrontmatter("# No frontmatter\n")).toEqual({});
  });
});

describe("normalizeSkillPath", () => {
  it("strips .md and normalizes separators", () => {
    expect(normalizeSkillPath("feature-flags/references/flag-create.md")).toBe(
      "feature-flags/references/flag-create"
    );
    expect(normalizeSkillPath("feature-flags\\references\\flag-create")).toBe(
      "feature-flags/references/flag-create"
    );
  });

  it("rejects path traversal and empty names", () => {
    expect(normalizeSkillPath("../secrets")).toBeNull();
    expect(normalizeSkillPath("feature-flags/../experiments")).toBeNull();
    expect(normalizeSkillPath("")).toBeNull();
    expect(normalizeSkillPath("   ")).toBeNull();
    expect(normalizeSkillPath("/feature-flags")).toBeNull();
  });
});

describe("rewriteReferencePaths", () => {
  it("rewrites backtick references to qualified paths", () => {
    const input = `Read \`references/flag-create.md\` then \`references/flag-publish.md\`.`;
    expect(rewriteReferencePaths(input, "feature-flags")).toBe(
      "Read `feature-flags/references/flag-create` then `feature-flags/references/flag-publish`."
    );
  });

  it("leaves bare workflow names and cross-skill prose alone", () => {
    const input =
      "Start at `experiment-design`. Use the **experiments** skill.";
    expect(rewriteReferencePaths(input, "experiments")).toBe(input);
  });

  it("scopes rewrites to the top-level skill", () => {
    const input = "See `references/metric-search.md`.";
    expect(rewriteReferencePaths(input, "analytics")).toBe(
      "See `analytics/references/metric-search`."
    );
  });
});
