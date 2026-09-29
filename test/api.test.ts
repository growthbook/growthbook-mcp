import { describe, expect, it, vi } from "vitest";
import {
  areSkillsEnabled,
  buildMcpTelemetryHeaders,
  callApi,
  checkBearerWithGrowthBook,
  explainHttpError,
  getTransportMode,
  invalidateBearerCache,
  normalizeMethod,
  normalizePath,
  requestAuthStore,
  SERVER_VERSION,
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

describe("MCP telemetry headers", () => {
  it("tags tool calls with version, transport, tool, and client", async () => {
    process.env.GB_API_KEY = "secret_abc";
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, text: async () => "{}" });
    vi.stubGlobal("fetch", fetchMock);

    await callApi({
      method: "GET",
      path: "/api/v1/projects",
      tool: "growthbook_api_read",
      client: "cursor/1.2.3",
    });

    const headers = fetchMock.mock.calls[0][1].headers;
    expect(headers["X-GB-MCP-Version"]).toBe(SERVER_VERSION);
    expect(headers["X-GB-MCP-Transport"]).toBe("stdio");
    expect(headers["X-GB-MCP-Tool"]).toBe("growthbook_api_read");
    expect(headers["X-GB-MCP-Client"]).toBe("cursor/1.2.3");
    expect(headers.Authorization).toBe("Bearer secret_abc");
  });

  it("falls back to the HTTP User-Agent when no client info is known", () => {
    const headers = requestAuthStore.run(
      { bearer: "tok", userAgent: "claude-code/2.0" },
      () => buildMcpTelemetryHeaders("growthbook_api_write")
    );
    expect(headers["X-GB-MCP-Client"]).toBe("claude-code/2.0");
  });

  it("strips non-printable characters from client-controlled values", () => {
    const headers = buildMcpTelemetryHeaders("t", "evil\r\nX-Injected: 1");
    expect(headers["X-GB-MCP-Client"]).toBe("evilX-Injected: 1");
  });

  it("omits telemetry headers when no tool is given", async () => {
    process.env.GB_API_KEY = "secret_abc";
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, text: async () => "{}" });
    vi.stubGlobal("fetch", fetchMock);

    await callApi({ method: "GET", path: "/api/v1/projects" });

    const headers = fetchMock.mock.calls[0][1].headers;
    expect(headers["X-GB-MCP-Tool"]).toBeUndefined();
  });
});
