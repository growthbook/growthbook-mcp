import { describe, expect, it } from "vitest";
import { getDocsMetadata } from "../src/utils.js";

describe("getDocsMetadata", () => {
  it("maps .tsx to react docs + stub", () => {
    const res = getDocsMetadata(".tsx");
    expect(res.language).toBe("react");
    expect(res.docs).toContain("docs.growthbook.io/lib/react");
    expect(res.stub).toContain("React Feature Flag Implementation");
  });

  it("maps .ts to javascript docs", () => {
    const res = getDocsMetadata(".ts");
    expect(res.language).toBe("javascript");
    expect(res.docs).toContain("docs.growthbook.io/lib/js");
  });

  it("falls back to unknown", () => {
    const res = getDocsMetadata(".weird");
    expect(res.language).toBe("unknown");
    expect(res.docs).toContain("docs.growthbook.io/lib/");
  });
});

