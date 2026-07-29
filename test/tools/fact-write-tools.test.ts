import { describe, expect, it, vi } from "vitest";

type RegisteredTool = {
  name: string;
  config: any;
  handler: (args: any, extra?: any) => Promise<any>;
};

function makeServerCapture() {
  const tools: RegisteredTool[] = [];
  const server = {
    registerTool: (
      name: string,
      config: any,
      handler: (args: any, extra?: any) => Promise<any>
    ) => {
      tools.push({ name, config, handler });
    },
    server: {
      notification: vi.fn(async () => {}),
    },
  };
  return { server: server as any, tools };
}

function makeResponse(opts: { ok: boolean; status: number; json: any }) {
  return {
    ok: opts.ok,
    status: opts.status,
    statusText: "",
    headers: new Headers(),
    json: async () => opts.json,
    text: async () => JSON.stringify(opts.json),
  } as any as Response;
}

const config = {
  baseApiUrl: "https://api.example.com",
  apiKey: "key",
  appOrigin: "https://app.example.com",
  user: "u@example.com",
};

async function registerFactTableTools(server: any) {
  const { registerFactTableTools } = await import(
    "../../src/tools/fact-tables.js"
  );
  registerFactTableTools({ server, ...config });
}

async function registerMetricsTools(server: any) {
  const { registerMetricsTools } = await import("../../src/tools/metrics.js");
  registerMetricsTools({ server, ...config });
}

describe("create_fact_table", () => {
  it("posts the fact table to the fact-tables endpoint with auth headers", async () => {
    vi.useFakeTimers();
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchSpy = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return makeResponse({
        ok: true,
        status: 200,
        json: { factTable: { id: "ftb_1", name: "Orders" } },
      });
    });
    vi.stubGlobal("fetch", fetchSpy);

    const { server, tools } = makeServerCapture();
    await registerFactTableTools(server);

    const tool = tools.find((t) => t.name === "create_fact_table");
    expect(tool).toBeTruthy();

    const p = tool!.handler({
      name: "Orders",
      datasource: "ds_1",
      userIdTypes: ["user_id"],
      sql: "SELECT * FROM orders",
    });
    await vi.runAllTimersAsync();
    await p;

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.example.com/api/v1/fact-tables");
    expect(calls[0].init?.method).toBe("POST");
    expect(calls[0].init?.headers).toMatchObject({
      Authorization: "Bearer key",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      name: "Orders",
      datasource: "ds_1",
      userIdTypes: ["user_id"],
      sql: "SELECT * FROM orders",
      owner: "u@example.com",
      tags: ["mcp"],
    });
  });

  it("returns a link to the created fact table", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        makeResponse({
          ok: true,
          status: 200,
          json: { factTable: { id: "ftb_1", name: "Orders" } },
        })
      )
    );

    const { server, tools } = makeServerCapture();
    await registerFactTableTools(server);

    const p = tools
      .find((t) => t.name === "create_fact_table")!
      .handler({
        name: "Orders",
        datasource: "ds_1",
        userIdTypes: ["user_id"],
        sql: "SELECT * FROM orders",
      });
    await vi.runAllTimersAsync();
    const res = await p;

    expect(res.content[0].type).toBe("text");
    expect(res.content[0].text).toContain("ftb_1");
    expect(res.content[0].text).toContain(
      "https://app.example.com/fact-tables/ftb_1"
    );
  });

  it("explains how to recover when the API rejects the fact table", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        makeResponse({
          ok: false,
          status: 400,
          json: { message: "Invalid datasource" },
        })
      )
    );

    const { server, tools } = makeServerCapture();
    await registerFactTableTools(server);

    const p = tools
      .find((t) => t.name === "create_fact_table")!
      .handler({
        name: "Orders",
        datasource: "nope",
        userIdTypes: ["user_id"],
        sql: "SELECT * FROM orders",
      });
    await vi.runAllTimersAsync();

    await expect(p).rejects.toThrow(/creating fact table/i);
    await expect(p).rejects.toThrow(/get_defaults/);
  });

  it("is registered as a non-destructive write tool", async () => {
    const { server, tools } = makeServerCapture();
    await registerFactTableTools(server);

    const tool = tools.find((t) => t.name === "create_fact_table")!;
    expect(tool.config.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
    });
  });
});

describe("create_fact_metric", () => {
  it("posts the fact metric to the fact-metrics endpoint", async () => {
    vi.useFakeTimers();
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchSpy = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return makeResponse({
        ok: true,
        status: 200,
        json: { factMetric: { id: "fact__1", name: "Average order value" } },
      });
    });
    vi.stubGlobal("fetch", fetchSpy);

    const { server, tools } = makeServerCapture();
    await registerMetricsTools(server);

    const tool = tools.find((t) => t.name === "create_fact_metric");
    expect(tool).toBeTruthy();

    const p = tool!.handler({
      name: "Average order value",
      metricType: "mean",
      numerator: { factTableId: "ftb_1", column: "amount" },
    });
    await vi.runAllTimersAsync();
    const res = await p;

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.example.com/api/v1/fact-metrics");
    expect(calls[0].init?.method).toBe("POST");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      name: "Average order value",
      metricType: "mean",
      numerator: { factTableId: "ftb_1", column: "amount" },
      owner: "u@example.com",
      tags: ["mcp"],
    });
    expect(res.content[0].text).toContain(
      "https://app.example.com/fact-metrics/fact__1"
    );
  });

  it("reports invalid input without calling the API", async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.fn(async () =>
      makeResponse({ ok: true, status: 200, json: {} })
    );
    vi.stubGlobal("fetch", fetchSpy);

    const { server, tools } = makeServerCapture();
    await registerMetricsTools(server);

    const p = tools
      .find((t) => t.name === "create_fact_metric")!
      .handler({
        name: "Revenue per order",
        metricType: "ratio",
        numerator: { factTableId: "ftb_1", column: "amount" },
      });
    await vi.runAllTimersAsync();
    const res = await p;

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(res.content[0].text).toContain("denominator");
  });

  it("is registered as a non-destructive write tool", async () => {
    const { server, tools } = makeServerCapture();
    await registerMetricsTools(server);

    const tool = tools.find((t) => t.name === "create_fact_metric")!;
    expect(tool.config.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
    });
  });

  it("explains how to recover when the API rejects the metric", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        makeResponse({
          ok: false,
          status: 400,
          json: { message: "Invalid fact table" },
        })
      )
    );

    const { server, tools } = makeServerCapture();
    await registerMetricsTools(server);

    const p = tools
      .find((t) => t.name === "create_fact_metric")!
      .handler({
        name: "Average order value",
        metricType: "mean",
        numerator: { factTableId: "nope", column: "amount" },
      });
    await vi.runAllTimersAsync();

    await expect(p).rejects.toThrow(/creating fact metric/i);
    await expect(p).rejects.toThrow(/list_fact_tables/);
  });
});
