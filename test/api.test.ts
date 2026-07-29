import { describe, expect, it, vi } from "vitest";
import {
  areSkillsEnabled,
  checkBearerWithGrowthBook,
  explainHttpError,
  getTransportMode,
  invalidateBearerCache,
  normalizeMethod,
  normalizePath,
} from "../src/api.js";

describe("normalizeMethod", () => {
  it("uppercases allowed methods", () => {
    expect(normalizeMethod("get")).toBe("GET");
    expect(normalizeMethod("PATCH")).toBe("PATCH");
  });

  it("rejects unknown methods", () => {
    expect(() => normalizeMethod("TRACE")).toThrow(/Unknown method/);
  });
});

describe("normalizePath", () => {
  it("ensures a leading slash", () => {
    expect(normalizePath("api/v1/projects")).toBe("/api/v1/projects");
    expect(normalizePath("/api/v1/projects")).toBe("/api/v1/projects");
  });

  it("rejects empty or control-character paths", () => {
    expect(() => normalizePath("")).toThrow(/non-empty/);
    expect(() => normalizePath("/api/v1/foo bar")).toThrow(/control/);
    expect(() => normalizePath("/api/v1/foo\nbar")).toThrow(/control/);
  });
});

describe("areSkillsEnabled", () => {
  it("defaults to true", () => {
    delete process.env.GB_SKILLS_ENABLED;
    expect(areSkillsEnabled()).toBe(true);
  });

  it("treats falsey strings as disabled", () => {
    for (const raw of ["false", "0", "no", "off", " FALSE "]) {
      process.env.GB_SKILLS_ENABLED = raw;
      expect(areSkillsEnabled()).toBe(false);
    }
  });

  it("treats other values as enabled", () => {
    process.env.GB_SKILLS_ENABLED = "true";
    expect(areSkillsEnabled()).toBe(true);
  });
});

describe("getTransportMode", () => {
  it("defaults to stdio", () => {
    delete process.env.GB_MCP_TRANSPORT;
    expect(getTransportMode()).toBe("stdio");
  });

  it("returns http only for http", () => {
    process.env.GB_MCP_TRANSPORT = "http";
    expect(getTransportMode()).toBe("http");
    process.env.GB_MCP_TRANSPORT = "something";
    expect(getTransportMode()).toBe("stdio");
  });
});

describe("explainHttpError", () => {
  it("hints at auth refresh on 401", () => {
    const msg = explainHttpError(
      401,
      "Unauthorized",
      "",
      "GET",
      "https://api.growthbook.io/api/v1/projects"
    );
    expect(msg).toMatch(/Authentication failed/);
    expect(msg).toMatch(/OAuth|GB_API_KEY/);
  });

  it("frames 403 as a permissions problem, not a refresh", () => {
    const msg = explainHttpError(
      403,
      "Forbidden",
      "",
      "POST",
      "https://api.growthbook.io/api/v1/features"
    );
    expect(msg).toMatch(/permission/i);
    expect(msg).toMatch(/will not help/i);
  });

  it("hints at GB_API_URL on cloud 404", () => {
    const msg = explainHttpError(
      404,
      "Not Found",
      "",
      "GET",
      "https://api.growthbook.io/api/v1/missing"
    );
    expect(msg).toMatch(/GB_API_URL/);
  });

  it("mentions rate limit on 429", () => {
    const msg = explainHttpError(
      429,
      "Too Many Requests",
      "",
      "GET",
      "https://api.growthbook.io/api/v1/projects"
    );
    expect(msg).toMatch(/Rate limited/);
  });
});

describe("checkBearerWithGrowthBook", () => {
  it("returns 'invalid' on 401", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 401, ok: false });
    vi.stubGlobal("fetch", fetchMock);

    await expect(checkBearerWithGrowthBook("bad-token")).resolves.toBe(
      "invalid"
    );
  });

  it("accepts 403 (permission denied, but token is authenticated)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 403, ok: false });
    vi.stubGlobal("fetch", fetchMock);

    await expect(checkBearerWithGrowthBook("scoped-token")).resolves.toBe(
      "accepted"
    );
  });

  it("fails closed ('unavailable') on 5xx", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 503, ok: false });
    vi.stubGlobal("fetch", fetchMock);

    await expect(checkBearerWithGrowthBook("any")).resolves.toBe(
      "unavailable"
    );
  });

  it("fails closed ('unavailable') on 429", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 429, ok: false });
    vi.stubGlobal("fetch", fetchMock);

    await expect(checkBearerWithGrowthBook("any")).resolves.toBe(
      "unavailable"
    );
  });

  it("caches a successful probe", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 200, ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await expect(checkBearerWithGrowthBook("good")).resolves.toBe("accepted");
    await expect(checkBearerWithGrowthBook("good")).resolves.toBe("accepted");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not cache an 'unavailable' result (re-probes)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 503, ok: false });
    vi.stubGlobal("fetch", fetchMock);

    await checkBearerWithGrowthBook("flaky");
    await checkBearerWithGrowthBook("flaky");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("re-probes after invalidateBearerCache", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 200, ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await checkBearerWithGrowthBook("good");
    invalidateBearerCache("good");
    await checkBearerWithGrowthBook("good");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("fails closed ('unavailable') on network errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await expect(checkBearerWithGrowthBook("any")).resolves.toBe(
      "unavailable"
    );
  });
});
