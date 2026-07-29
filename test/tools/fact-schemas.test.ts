import { describe, expect, it } from "vitest";
import {
  buildFactMetricPayload,
  buildFactTablePayload,
  validateFactMetricInput,
} from "../../src/tools/fact-schemas.js";

const owner = "u@example.com";

describe("buildFactTablePayload", () => {
  it("sets the owner from the configured GrowthBook user", () => {
    const payload = buildFactTablePayload(
      {
        name: "Orders",
        datasource: "ds_1",
        userIdTypes: ["id"],
        sql: "SELECT * FROM orders",
      },
      owner
    );

    expect(payload.owner).toBe("u@example.com");
  });

  it("tags created fact tables with 'mcp' for traceability", () => {
    const payload = buildFactTablePayload(
      {
        name: "Orders",
        datasource: "ds_1",
        userIdTypes: ["id"],
        sql: "SELECT * FROM orders",
      },
      owner
    );

    expect(payload.tags).toEqual(["mcp"]);
  });

  it("keeps caller tags and appends 'mcp' without duplicating it", () => {
    const payload = buildFactTablePayload(
      {
        name: "Orders",
        datasource: "ds_1",
        userIdTypes: ["id"],
        sql: "SELECT * FROM orders",
        tags: ["revenue", "mcp"],
      },
      owner
    );

    expect(payload.tags).toEqual(["revenue", "mcp"]);
  });

  it("omits optional keys that were not provided", () => {
    const payload = buildFactTablePayload(
      {
        name: "Orders",
        datasource: "ds_1",
        userIdTypes: ["id"],
        sql: "SELECT * FROM orders",
      },
      owner
    );

    expect(payload).not.toHaveProperty("description");
    expect(payload).not.toHaveProperty("eventName");
    expect(payload).not.toHaveProperty("projects");
    expect(payload).not.toHaveProperty("managedBy");
  });

  it("passes managedBy through so callers can lock a table to API management", () => {
    const payload = buildFactTablePayload(
      {
        name: "Orders",
        datasource: "ds_1",
        userIdTypes: ["id"],
        sql: "SELECT * FROM orders",
        managedBy: "api",
      },
      owner
    );

    expect(payload.managedBy).toBe("api");
  });
});

describe("validateFactMetricInput", () => {
  const proportion = {
    name: "Signup rate",
    metricType: "proportion" as const,
    numerator: { factTableId: "ftb_1" },
  };

  it("accepts a valid proportion metric", () => {
    expect(validateFactMetricInput(proportion)).toEqual([]);
  });

  it("rejects a proportion metric that sets a numerator column", () => {
    const errors = validateFactMetricInput({
      ...proportion,
      numerator: { factTableId: "ftb_1", column: "amount" },
    });

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("numerator.column");
    expect(errors[0]).toContain("proportion");
  });

  it("rejects a dailyParticipation metric that sets a numerator column", () => {
    const errors = validateFactMetricInput({
      name: "DAU",
      metricType: "dailyParticipation",
      numerator: { factTableId: "ftb_1", column: "amount" },
    });

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("numerator.column");
  });

  it("requires a denominator for ratio metrics", () => {
    const errors = validateFactMetricInput({
      name: "Revenue per order",
      metricType: "ratio",
      numerator: { factTableId: "ftb_1", column: "amount" },
    });

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("denominator");
    expect(errors[0]).toContain("ratio");
  });

  it("accepts a ratio metric that provides a denominator", () => {
    const errors = validateFactMetricInput({
      name: "Revenue per order",
      metricType: "ratio",
      numerator: { factTableId: "ftb_1", column: "amount" },
      denominator: { factTableId: "ftb_1", column: "$$count" },
    });

    expect(errors).toEqual([]);
  });

  it("rejects a denominator on a non-ratio metric", () => {
    const errors = validateFactMetricInput({
      name: "Average order value",
      metricType: "mean",
      numerator: { factTableId: "ftb_1", column: "amount" },
      denominator: { factTableId: "ftb_1", column: "$$count" },
    });

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("denominator");
  });

  it("requires quantileSettings for quantile metrics", () => {
    const errors = validateFactMetricInput({
      name: "p95 latency",
      metricType: "quantile",
      numerator: { factTableId: "ftb_1", column: "duration_ms" },
    });

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("quantileSettings");
  });

  it("accepts a quantile metric that provides quantileSettings", () => {
    const errors = validateFactMetricInput({
      name: "p95 latency",
      metricType: "quantile",
      numerator: { factTableId: "ftb_1", column: "duration_ms" },
      quantileSettings: {
        type: "event",
        quantile: 0.95,
        ignoreZeros: false,
      },
    });

    expect(errors).toEqual([]);
  });

  it("requires values on row filter operators that compare", () => {
    const errors = validateFactMetricInput({
      ...proportion,
      numerator: {
        factTableId: "ftb_1",
        rowFilters: [{ operator: "=", column: "country" }],
      },
    });

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("values");
  });

  it("does not require values on null and boolean row filter operators", () => {
    const errors = validateFactMetricInput({
      ...proportion,
      numerator: {
        factTableId: "ftb_1",
        rowFilters: [{ operator: "is_null", column: "country" }],
      },
    });

    expect(errors).toEqual([]);
  });

  it("requires a column on row filter operators that target one", () => {
    const errors = validateFactMetricInput({
      ...proportion,
      numerator: {
        factTableId: "ftb_1",
        rowFilters: [{ operator: "in", values: ["FR"] }],
      },
    });

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("column");
  });

  it("does not require a column for sql_expr and saved_filter operators", () => {
    const errors = validateFactMetricInput({
      ...proportion,
      numerator: {
        factTableId: "ftb_1",
        rowFilters: [{ operator: "sql_expr", values: ["amount > 0"] }],
      },
    });

    expect(errors).toEqual([]);
  });

  it("validates row filters on the denominator too", () => {
    const errors = validateFactMetricInput({
      name: "Revenue per order",
      metricType: "ratio",
      numerator: { factTableId: "ftb_1", column: "amount" },
      denominator: {
        factTableId: "ftb_1",
        column: "$$count",
        rowFilters: [{ operator: "=", column: "country" }],
      },
    });

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("denominator");
  });

  it("requires aggregateFilter and aggregateFilterColumn together", () => {
    const errors = validateFactMetricInput({
      ...proportion,
      numerator: {
        factTableId: "ftb_1",
        aggregateFilterColumn: "$$count",
      },
    });

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("aggregateFilter");
  });

  it("only allows aggregate filters on retention and proportion metrics", () => {
    const errors = validateFactMetricInput({
      name: "Average order value",
      metricType: "mean",
      numerator: {
        factTableId: "ftb_1",
        column: "amount",
        aggregateFilterColumn: "$$count",
        aggregateFilter: ">= 2",
      },
    });

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("aggregateFilter");
  });

  it("reports every problem at once so the agent can fix them in one pass", () => {
    const errors = validateFactMetricInput({
      name: "Broken",
      metricType: "ratio",
      numerator: {
        factTableId: "ftb_1",
        rowFilters: [{ operator: "=", column: "country" }],
      },
    });

    expect(errors.length).toBeGreaterThan(1);
  });
});

describe("buildFactMetricPayload", () => {
  const meanMetric = {
    name: "Average order value",
    metricType: "mean" as const,
    numerator: { factTableId: "ftb_1", column: "amount" },
  };

  it("sets the owner and the mcp tag", () => {
    const payload = buildFactMetricPayload(meanMetric, owner);

    expect(payload.owner).toBe("u@example.com");
    expect(payload.tags).toEqual(["mcp"]);
  });

  it("passes the numerator through untouched", () => {
    const payload = buildFactMetricPayload(
      {
        ...meanMetric,
        numerator: {
          factTableId: "ftb_1",
          column: "amount",
          aggregation: "sum",
          rowFilters: [{ operator: "=", column: "country", values: ["FR"] }],
        },
      },
      owner
    );

    expect(payload.numerator).toEqual({
      factTableId: "ftb_1",
      column: "amount",
      aggregation: "sum",
      rowFilters: [{ operator: "=", column: "country", values: ["FR"] }],
    });
  });

  it("drops a denominator when the metric is not a ratio", () => {
    const payload = buildFactMetricPayload(
      {
        ...meanMetric,
        denominator: { factTableId: "ftb_1", column: "$$count" },
      },
      owner
    );

    expect(payload).not.toHaveProperty("denominator");
  });

  it("includes the denominator for ratio metrics", () => {
    const payload = buildFactMetricPayload(
      {
        name: "Revenue per order",
        metricType: "ratio",
        numerator: { factTableId: "ftb_1", column: "amount" },
        denominator: { factTableId: "ftb_1", column: "$$count" },
      },
      owner
    );

    expect(payload.denominator).toEqual({
      factTableId: "ftb_1",
      column: "$$count",
    });
  });

  it("omits optional keys that were not provided", () => {
    const payload = buildFactMetricPayload(meanMetric, owner);

    expect(payload).not.toHaveProperty("description");
    expect(payload).not.toHaveProperty("projects");
    expect(payload).not.toHaveProperty("quantileSettings");
    expect(payload).not.toHaveProperty("inverse");
    expect(payload).not.toHaveProperty("managedBy");
  });

  it("keeps inverse when explicitly set to false", () => {
    const payload = buildFactMetricPayload(
      { ...meanMetric, inverse: false },
      owner
    );

    expect(payload.inverse).toBe(false);
  });
});
