import { describe, expect, it } from "vitest";
import { parseFrontmatter } from "../src/skills.js";

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
