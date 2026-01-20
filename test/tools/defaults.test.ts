import { describe, expect, it, vi } from "vitest";

type MemFs = Map<string, string>;

function makeMemFs(initial: Record<string, unknown> = {}): MemFs {
  const fs = new Map<string, string>();
  for (const [k, v] of Object.entries(initial)) {
    fs.set(k, typeof v === "string" ? v : JSON.stringify(v));
  }
  return fs;
}

function enoent(path: string) {
  const err: NodeJS.ErrnoException = new Error(`ENOENT: no such file ${path}`);
  err.code = "ENOENT";
  return err;
}

function makeResponse(opts: {
  ok: boolean;
  status: number;
  statusText?: string;
  json?: any;
  text?: string;
  headers?: Record<string, string>;
}): Response {
  const headers = new Headers(opts.headers ?? {});
  return {
    ok: opts.ok,
    status: opts.status,
    statusText: opts.statusText ?? "",
    headers,
    json: async () => opts.json,
    text: async () => opts.text ?? JSON.stringify(opts.json ?? {}),
  } as any as Response;
}

describe("defaults (getDefaults/createDefaults)", () => {
  it("uses user defaults for ds/aq/envs and preserves fresh auto name/hypothesis/description", async () => {
    vi.resetModules();
    const cfgDir = "/tmp/gb-mcp-test";
    const experimentDefaultsFile = `${cfgDir}/experiment-defaults.json`;
    const userDefaultsFile = `${cfgDir}/user-defaults.json`;

    const memfs = makeMemFs({
      [userDefaultsFile]: {
        datasourceId: "ds_user",
        assignmentQueryId: "aq_user",
        environments: ["prod", "staging"],
        timestamp: new Date().toISOString(),
      },
      [experimentDefaultsFile]: {
        name: ["Checkout CTA"],
        hypothesis: ["More contrast increases CTR"],
        description: ["Test CTA color"],
        datasource: "ds_auto",
        assignmentQuery: "aq_auto",
        environments: ["prod"],
        filePaths: { experimentDefaultsFile, userDefaultsFile },
        timestamp: new Date().toISOString(),
      },
    });

    vi.doMock("env-paths", () => ({
      default: () => ({ config: cfgDir }),
    }));

    vi.doMock("fs/promises", () => ({
      readFile: vi.fn(async (p: string) => {
        const v = memfs.get(p);
        if (v === undefined) throw enoent(p);
        return v;
      }),
      writeFile: vi.fn(async (p: string, data: string) => {
        memfs.set(p, data);
      }),
      mkdir: vi.fn(async () => {}),
      unlink: vi.fn(async (p: string) => {
        if (!memfs.has(p)) throw enoent(p);
        memfs.delete(p);
      }),
    }));

    const fetchSpy = vi.fn(() => {
      throw new Error("fetch should not be called in this test");
    });
    vi.stubGlobal("fetch", fetchSpy);

    const { getDefaults } = await import("../../src/tools/defaults.js");
    const res = await getDefaults("k", "https://api.example.com");

    expect(res.datasource).toBe("ds_user");
    expect(res.assignmentQuery).toBe("aq_user");
    expect(res.environments).toEqual(["prod", "staging"]);
    expect(res.name).toEqual(["Checkout CTA"]);
    expect(res.hypothesis).toEqual(["More contrast increases CTR"]);
    expect(res.description).toEqual(["Test CTA color"]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("with no user defaults, generates defaults when cache missing (ENOENT) and writes file", async () => {
    vi.resetModules();
    const cfgDir = "/tmp/gb-mcp-test-2";
    const experimentDefaultsFile = `${cfgDir}/experiment-defaults.json`;
    const userDefaultsFile = `${cfgDir}/user-defaults.json`;
    const memfs = makeMemFs();

    vi.doMock("env-paths", () => ({
      default: () => ({ config: cfgDir }),
    }));

    const writeFile = vi.fn(async (p: string, data: string) => {
      memfs.set(p, data);
    });

    vi.doMock("fs/promises", () => ({
      readFile: vi.fn(async (p: string) => {
        const v = memfs.get(p);
        if (v === undefined) throw enoent(p);
        return v;
      }),
      writeFile,
      mkdir: vi.fn(async () => {}),
      unlink: vi.fn(async (p: string) => {
        if (!memfs.has(p)) throw enoent(p);
        memfs.delete(p);
      }),
    }));

    // createDefaults: experiments empty => fetch data-sources then environments
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(
        makeResponse({
          ok: true,
          status: 200,
          json: { experiments: [], hasMore: false },
        })
      )
      .mockResolvedValueOnce(
        makeResponse({
          ok: true,
          status: 200,
          json: {
            dataSources: [
              { assignmentQueries: [{ id: "aq_auto_1" }] },
            ],
          },
        })
      )
      .mockResolvedValueOnce(
        makeResponse({
          ok: true,
          status: 200,
          json: { environments: [{ id: "production" }, { id: "staging" }] },
        })
      );
    vi.stubGlobal("fetch", fetchSpy);

    vi.useFakeTimers();

    const { getDefaults } = await import("../../src/tools/defaults.js");
    const p = getDefaults("k", "https://api.example.com");
    await vi.runAllTimersAsync();
    const res = await p;

    expect(res.assignmentQuery).toBe("aq_auto_1");
    expect(res.environments).toEqual(["production", "staging"]);
    expect(res.filePaths.experimentDefaultsFile).toBe(experimentDefaultsFile);
    expect(res.filePaths.userDefaultsFile).toBe(userDefaultsFile);
    expect(writeFile).toHaveBeenCalled();
    expect(memfs.has(experimentDefaultsFile)).toBe(true);
  });

  it("regenerates auto defaults when cached timestamp is older than 30 days", async () => {
    vi.resetModules();
    const cfgDir = "/tmp/gb-mcp-test-3";
    const experimentDefaultsFile = `${cfgDir}/experiment-defaults.json`;
    const userDefaultsFile = `${cfgDir}/user-defaults.json`;

    const old = new Date(Date.now() - 1000 * 60 * 60 * 24 * 31).toISOString();
    const memfs = makeMemFs({
      [experimentDefaultsFile]: {
        name: ["Old"],
        hypothesis: ["Old"],
        description: ["Old"],
        datasource: "ds_old",
        assignmentQuery: "aq_old",
        environments: ["prod"],
        filePaths: { experimentDefaultsFile, userDefaultsFile },
        timestamp: old,
      },
    });

    vi.doMock("env-paths", () => ({
      default: () => ({ config: cfgDir }),
    }));

    vi.doMock("fs/promises", () => ({
      readFile: vi.fn(async (p: string) => {
        const v = memfs.get(p);
        if (v === undefined) throw enoent(p);
        return v;
      }),
      writeFile: vi.fn(async (p: string, data: string) => {
        memfs.set(p, data);
      }),
      mkdir: vi.fn(async () => {}),
      unlink: vi.fn(async (p: string) => {
        if (!memfs.has(p)) throw enoent(p);
        memfs.delete(p);
      }),
    }));

    const fetchSpy = vi
      .fn()
      // experiments empty => data-sources => environments
      .mockResolvedValueOnce(
        makeResponse({
          ok: true,
          status: 200,
          json: { experiments: [], hasMore: false },
        })
      )
      .mockResolvedValueOnce(
        makeResponse({
          ok: true,
          status: 200,
          json: {
            dataSources: [
              { assignmentQueries: [{ id: "aq_new" }] },
            ],
          },
        })
      )
      .mockResolvedValueOnce(
        makeResponse({
          ok: true,
          status: 200,
          json: { environments: [{ id: "prod" }] },
        })
      );
    vi.stubGlobal("fetch", fetchSpy);
    vi.useFakeTimers();

    const { getDefaults } = await import("../../src/tools/defaults.js");
    const p = getDefaults("k", "https://api.example.com");
    await vi.runAllTimersAsync();
    const res = await p;

    expect(fetchSpy).toHaveBeenCalled(); // regeneration happened
    expect(res.assignmentQuery).toBe("aq_new");
  });
});

