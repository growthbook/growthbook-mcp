import { z } from "zod";
import {
  type BaseToolsInterface,
  handleResNotOk,
  fetchWithRateLimit,
  buildHeaders,
} from "../utils.js";
import type { CreateExplorationResponse } from "../api-type-helpers.js";
import {
  formatMetricExploration,
  formatApiError,
} from "../format-responses.js";

interface ProductAnalyticsTools extends BaseToolsInterface {
  appOrigin: string;
}

async function resolveFactMetricDatasource(
  baseApiUrl: string,
  apiKey: string,
  metricId: string
): Promise<{ datasource: string; metricName: string }> {
  if (!metricId.startsWith("fact__")) {
    throw new Error(
      `Metric explorations only support fact metrics (IDs starting with 'fact__'). ` +
        `The metric '${metricId}' is a standard metric. ` +
        `Use get_metrics to find a fact metric ID instead.`
    );
  }

  const res = await fetchWithRateLimit(
    `${baseApiUrl}/api/v1/fact-metrics/${metricId}`,
    { headers: buildHeaders(apiKey) }
  );
  await handleResNotOk(res);
  const data = await res.json();

  const metric = data.factMetric;
  const datasource = metric.datasource;
  const metricName = metric.name || metricId;

  if (!datasource) {
    throw new Error(
      `Fact metric '${metricId}' does not have a datasource configured.`
    );
  }

  return { datasource, metricName };
}

const TIMESERIES_CHART_TYPES = new Set(["line", "area", "timeseries-table"]);

function buildDimensions(
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

export function registerProductAnalyticsTools({
  server,
  baseApiUrl,
  apiKey,
  appOrigin,
}: ProductAnalyticsTools) {
  server.registerTool(
    "create_metric_exploration",
    {
      title: "Create Metric Exploration",
      description:
        "Charts an existing GrowthBook fact metric (IDs starting with 'fact__'), either as a time series or a cumulative chart. Requires a fact metric ID — use `get_metrics` to find one. Standard (non-fact) metrics are not supported. Returns chart data and a link to view the visualization in GrowthBook. If no fact metric matches what the user wants to chart, consider using `create_fact_table_exploration` or `create_data_source_exploration` instead (when available).",
      inputSchema: z.object({
        metricId: z
          .string()
          .describe(
            "The ID of the fact metric to chart (must start with 'fact__'). Standard metrics are not supported. Use get_metrics to find available fact metric IDs."
          ),
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
            "The type of chart to render. Chart mode vs time series: line, area, and timeseries-table charts are always timeseries — these must include a date dimension. Bar charts (bar, stackedBar, horizontalBar, stackedHorizontalBar), the plain table chart, and bigNumber are cumulative — thesedo not use a date dimension. When switching between timeseries and cumulative chart types, add or remove the date dimension accordingly"
          ),
        dateGranularity: z
          .enum(["auto", "hour", "day", "week", "month", "year"])
          .default("auto")
          .describe(
            "Granularity for the date dimension. Depending on the amount of time scanned, the granularity might be automatically adjusted to a less granular level to reduce the number of data points."
          ),
        dimensions: z
          .array(
            z.discriminatedUnion("dimensionType", [
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
                        .array(
                          z.object({
                            operator: z.enum([
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
                            ]),
                            column: z.string().optional(),
                            values: z.array(z.string()).optional(),
                          })
                        )
                        .describe("Filters that define this slice."),
                    })
                  )
                  .describe(
                    "Named slices, each defined by a set of filters. Use for custom groupings like 'North America' = country in ['US','CA']."
                  ),
              }),
            ])
          )
          .optional()
          .describe(
            "Dimensions to break down the data. For timeseries charts (line, area, timeseries-table), a date dimension is auto-included if not explicitly provided. For cumulative charts (bar, table, bigNumber), omit the date dimension. Types: 'date' for time axis, 'dynamic' for top-N grouping, 'static' for specific values, 'slice' for custom named segments."
          ),
        name: z
          .string()
          .optional()
          .describe(
            "Display name for the metric series. Defaults to the metric name."
          ),
      }),
      annotations: {
        readOnlyHint: false,
      },
    },
    async ({
      metricId,
      dateRange,
      lookbackValue,
      lookbackUnit,
      startDate,
      endDate,
      cache,
      chartType,
      dateGranularity,
      dimensions,
      name,
    }) => {
      try {
        const { datasource, metricName } = await resolveFactMetricDatasource(
          baseApiUrl,
          apiKey,
          metricId
        );

        const seriesName = name || metricName;

        const payload = {
          datasource,
          type: "metric" as const,
          chartType,
          dateRange: {
            predefined: dateRange,
            lookbackValue:
              dateRange === "customLookback" ? lookbackValue ?? null : null,
            lookbackUnit:
              dateRange === "customLookback" ? lookbackUnit ?? null : null,
            startDate:
              dateRange === "customDateRange" ? startDate ?? null : null,
            endDate: dateRange === "customDateRange" ? endDate ?? null : null,
          },
          dimensions: buildDimensions(dimensions, chartType, dateGranularity),
          dataset: {
            type: "metric" as const,
            values: [
              {
                name: seriesName,
                type: "metric" as const,
                metricId,
                rowFilters: [],
                unit: null,
                denominatorUnit: null,
              },
            ],
          },
        };

        const res = await fetchWithRateLimit(
          `${baseApiUrl}/api/v1/product-analytics/metric-exploration?cache=${cache}`,
          {
            method: "POST",
            headers: buildHeaders(apiKey),
            body: JSON.stringify(payload),
          }
        );

        await handleResNotOk(res);

        const data = (await res.json()) as CreateExplorationResponse & {
          explorationUrl?: string;
        };

        return {
          content: [
            {
              type: "text" as const,
              text: formatMetricExploration(data, seriesName),
            },
          ],
        };
      } catch (error) {
        throw new Error(
          formatApiError(
            error,
            `creating metric exploration for '${metricId}'`,
            [
              "Only fact metrics are supported — IDs must start with 'fact__'.",
              "Use get_metrics to find available fact metric IDs.",
              "If no fact metric matches, consider charting from a fact table or data source instead.",
            ]
          )
        );
      }
    }
  );
}
