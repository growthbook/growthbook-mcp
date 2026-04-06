import { z } from "zod";

/** Row filter operators accepted by product-analytics exploration APIs */
export const explorationFilterOperatorSchema = z.enum([
  "=",
  "!=",
  "<",
  "<=",
  ">",
  ">=",
  "in",
  "not_in",
  "contains",
  "not_contains",
  "starts_with",
  "ends_with",
  "is_null",
  "not_null",
  "is_true",
  "is_false",
  "sql_expr",
  "saved_filter",
]);

export const explorationRowFilterSchema = z.object({
  operator: explorationFilterOperatorSchema,
  column: z.string().optional(),
  values: z.array(z.string()).optional(),
});

export const explorationDimensionSchema = z.discriminatedUnion("dimensionType", [
  z.object({
    dimensionType: z.literal("date"),
    column: z
      .string()
      .default("date")
      .describe("Date column name."),
    dateGranularity: z
      .enum(["auto", "hour", "day", "week", "month", "year"])
      .describe("Granularity for the date axis."),
  }),
  z.object({
    dimensionType: z.literal("dynamic"),
    column: z
      .string()
      .describe(
        "Column name to group by (e.g. 'country', 'device_type'). Shows the top N values."
      ),
    maxValues: z
      .number()
      .default(10)
      .describe("Maximum number of distinct values to return."),
  }),
  z.object({
    dimensionType: z.literal("static"),
    column: z
      .string()
      .describe("Column name to group by (e.g. 'country')."),
    values: z
      .array(z.string())
      .describe(
        "Specific values to include (e.g. ['US', 'CA', 'UK']). Only these values will appear in the results."
      ),
  }),
  z.object({
    dimensionType: z.literal("slice"),
    slices: z
      .array(
        z.object({
          name: z
            .string()
            .describe(
              "Display name for this slice (e.g. 'North America', 'Mobile users')."
            ),
          filters: z
            .array(explorationRowFilterSchema)
            .describe("Filters that define this slice."),
        })
      )
      .describe(
        "Named slices, each defined by a set of filters. Use for custom groupings like 'North America' = country in ['US','CA']."
      ),
  }),
]);

const dimensionsField = z
  .array(explorationDimensionSchema)
  .optional()
  .describe(
    "Dimensions to break down the data. For timeseries charts (line, area, timeseries-table), a date dimension is auto-included if not explicitly provided. For cumulative charts (bar, table, bigNumber), omit the date dimension. " +
      "Types: 'date' for time axis, 'dynamic' for top-N grouping, 'static' for specific values, 'slice' for custom named segments. " +
      "Prefer 'dynamic' over 'static' for group-by dimensions — 'static' and 'slice' dimensions work in the API response but are not yet fully supported in the GrowthBook UI chart view. Use 'dynamic' for results that render correctly in both the API and the GrowthBook link."
  );

/** Shared Zod fields for metric and fact-table exploration tools */
export const explorationSharedInputSchema = z.object({
  dateRange: z
    .enum([
      "today",
      "last7Days",
      "last30Days",
      "last90Days",
      "customLookback",
      "customDateRange",
    ])
    .default("last30Days")
    .describe(
      "Date range for the chart. Use a predefined range, 'customLookback' with lookbackValue/lookbackUnit, or 'customDateRange' with startDate/endDate."
    ),
  lookbackValue: z
    .number()
    .optional()
    .describe(
      "Number of time units to look back. Only used when dateRange is 'customLookback'. Example: 14 with lookbackUnit 'day' = last 14 days."
    ),
  lookbackUnit: z
    .enum(["hour", "day", "week", "month"])
    .optional()
    .describe(
      "Time unit for the lookback. Only used when dateRange is 'customLookback'."
    ),
  startDate: z
    .string()
    .optional()
    .describe(
      "Start date for custom date range (ISO 8601 format, e.g. '2025-01-01'). Only used when dateRange is 'customDateRange'."
    ),
  endDate: z
    .string()
    .optional()
    .describe(
      "End date for custom date range (ISO 8601 format, e.g. '2025-03-31'). Only used when dateRange is 'customDateRange'."
    ),
  cache: z
    .enum(["preferred", "required", "never"])
    .default("preferred")
    .describe(
      "Cache behavior: 'preferred' (default) returns cached results if available, otherwise runs a new query; 'never' always runs a fresh query; 'required' only returns cached results or null if none exist."
    ),
  chartType: z
    .enum([
      "line",
      "area",
      "timeseries-table",
      "table",
      "bar",
      "stackedBar",
      "horizontalBar",
      "stackedHorizontalBar",
      "bigNumber",
    ])
    .default("line")
    .describe(
      "The type of chart to render. Chart mode vs time series: line, area, and timeseries-table charts are always timeseries — these must include a date dimension. Bar charts (bar, stackedBar, horizontalBar, stackedHorizontalBar), the plain table chart, and bigNumber are cumulative — these do not use a date dimension. When switching between timeseries and cumulative chart types, add or remove the date dimension accordingly."
    ),
  dateGranularity: z
    .enum(["auto", "hour", "day", "week", "month", "year"])
    .default("auto")
    .describe(
      "Granularity for the date dimension. Depending on the amount of time scanned, the granularity might be automatically adjusted to a less granular level to reduce the number of data points."
    ),
  dimensions: dimensionsField,
});

export type ExplorationSharedInput = z.infer<typeof explorationSharedInputSchema>;

export function buildDateRangePayload(
  dateRange: ExplorationSharedInput["dateRange"],
  lookbackValue: number | undefined,
  lookbackUnit: ExplorationSharedInput["lookbackUnit"],
  startDate: string | undefined,
  endDate: string | undefined
) {
  return {
    predefined: dateRange,
    lookbackValue: dateRange === "customLookback" ? lookbackValue ?? null : null,
    lookbackUnit: dateRange === "customLookback" ? lookbackUnit ?? null : null,
    startDate: dateRange === "customDateRange" ? startDate ?? null : null,
    endDate: dateRange === "customDateRange" ? endDate ?? null : null,
  };
}

export const TIMESERIES_CHART_TYPES = new Set(["line", "area", "timeseries-table"]);

export function buildDimensions(
  dimensions: Array<Record<string, unknown>> | undefined,
  chartType: string,
  dateGranularity: string
): Array<Record<string, unknown>> {
  const dims = (dimensions || []).map((d) => {
    if (d.dimensionType === "date" && !d.column) {
      return { ...d, column: "date" };
    }
    return d;
  });
  const hasDateDimension = dims.some((d) => d.dimensionType === "date");

  if (!hasDateDimension && TIMESERIES_CHART_TYPES.has(chartType)) {
    return [
      { dimensionType: "date", column: "date", dateGranularity },
      ...dims,
    ];
  }

  return dims;
}

/** One series for fact-table exploration `dataset.values[]` */
export const factTableExplorationSeriesSchema = z.discriminatedUnion(
  "valueType",
  [
    z.object({
      name: z
        .string()
        .describe("Legend label for this series in the chart and API results."),
      valueType: z.literal("count"),
      unit: z
        .string()
        .nullable()
        .optional()
        .describe("Optional unit label (e.g. currency) for display."),
      rowFilters: z
        .array(explorationRowFilterSchema)
        .default([])
        .describe("Filters applied to fact-table rows before aggregating."),
    }),
    z.object({
      name: z.string().describe("Legend label for this series."),
      valueType: z.literal("unit_count"),
      unit: z.string().nullable().optional(),
      rowFilters: z.array(explorationRowFilterSchema).default([]),
    }),
    z.object({
      name: z.string().describe("Legend label for this series."),
      valueType: z.literal("sum"),
      valueColumn: z
        .string()
        .min(1)
        .describe(
          "Numeric fact-table column to sum (use get_fact_table to list valid column names)."
        ),
      unit: z.string().nullable().optional(),
      rowFilters: z.array(explorationRowFilterSchema).default([]),
    }),
  ]
);

export type FactTableExplorationSeries = z.infer<
  typeof factTableExplorationSeriesSchema
>;

/** One fact metric series for metric exploration `dataset.values[]` */
export const metricExplorationEntrySchema = z.object({
  metricId: z
    .string()
    .describe(
      "The ID of a fact metric to chart (must start with 'fact__'). Use get_metrics to discover ids."
    ),
  name: z
    .string()
    .optional()
    .describe(
      "Legend label for this series in the chart and formatted table. Defaults to the metric's name from GrowthBook."
    ),
});

export type MetricExplorationEntry = z.infer<typeof metricExplorationEntrySchema>;

export function mapFactTableSeriesToPayload(series: FactTableExplorationSeries) {
  return {
    name: series.name,
    type: "fact_table" as const,
    valueType: series.valueType,
    valueColumn: series.valueType === "sum" ? series.valueColumn : null,
    unit: series.unit ?? null,
    rowFilters: series.rowFilters,
  };
}
