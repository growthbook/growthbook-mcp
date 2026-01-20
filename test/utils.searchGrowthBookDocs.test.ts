import { describe, expect, it, vi } from "vitest";
import { searchGrowthBookDocs } from "../src/utils.js";

function makeResponse(opts: {
  ok: boolean;
  status: number;
  json: any;
  statusText?: string;
}) {
  return {
    ok: opts.ok,
    status: opts.status,
    statusText: opts.statusText ?? "",
    headers: new Headers(),
    json: async () => opts.json,
    text: async () => JSON.stringify(opts.json),
  } as any as Response;
}

describe("searchGrowthBookDocs", () => {
  it("returns mapped results with combined snippet + url anchor + hierarchy", async () => {
    vi.useFakeTimers();

    const fetchSpy = vi.fn(async (_url: string, init?: RequestInit) => {
      // Basic sanity: payload contains query
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      expect(body.query).toBe("feature flags");

      return makeResponse({
        ok: true,
        status: 200,
        json: {
          hits: [
            {
              title: "Feature Flags",
              url: "https://docs.growthbook.io/features",
              anchor: "overview",
              hierarchy: { lvl0: "Docs", lvl1: "Features" },
              _snippetResult: {
                content: { value: "Use <em>feature flags</em> to...", matchLevel: "full" },
              },
              _rankingInfo: { userScore: 42, nbTypos: 0, nbExactWords: 2, promoted: false, words: 2, filters: 0, firstMatchedWord: 0 },
            },
          ],
          nbHits: 1,
          page: 0,
          nbPages: 1,
          hitsPerPage: 5,
          processingTimeMS: 1,
          query: "feature flags",
          params: "",
        },
      });
    });

    vi.stubGlobal("fetch", fetchSpy);

    const p = searchGrowthBookDocs("feature flags", { hitsPerPage: 5 });
    await vi.runAllTimersAsync();
    const res = await p;

    expect(res).toHaveLength(1);
    expect(res[0].title).toBe("Feature Flags");
    expect(res[0].url).toBe("https://docs.growthbook.io/features#overview");
    expect(res[0].hierarchy).toEqual(["Docs", "Features"]);
    expect(res[0].snippet).toContain("feature flags");
    expect(res[0].relevance?.score).toBe(42);
  });

  it("returns [] on fetch errors (graceful degradation)", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});

    const fetchSpy = vi.fn(async () => {
      throw new Error("network down");
    });
    vi.stubGlobal("fetch", fetchSpy);

    const p = searchGrowthBookDocs("anything");
    await vi.runAllTimersAsync();
    const res = await p;

    expect(res).toEqual([]);
  });
});

