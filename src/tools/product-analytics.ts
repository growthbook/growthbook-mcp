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

async function resolveMetricDatasource(
  baseApiUrl: string,
  apiKey: string,
  metricId: string
): Promise<{ datasource: string; metricName: string }> {
  const isFactMetric = metricId.startsWith("fact__");
  const endpoint = isFactMetric
    ? `${baseApiUrl}/api/v1/fact-metrics/${metricId}`
    : `${baseApiUrl}/api/v1/metrics/${metricId}`;

  const res = await fetchWithRateLimit(endpoint, {
    headers: buildHeaders(apiKey),
  });
  await handleResNotOk(res);
  const data = await res.json();

  const metric = isFactMetric ? data.factMetric : data.metric;
  const datasource = isFactMetric ? metric.datasource : metric.datasourceId;
  const metricName = metric.name || metricId;

  if (!datasource) {
    throw new Error(
      `Metric '${metricId}' does not have a datasource configured.`
    );
  }

  return { datasource, metricName };
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
        "Charts an existing GrowthBook metric over time. Requires a metricId — use `get_metrics` to find one. Returns chart data and a link to view the visualization in GrowthBook. If no metric matches what the user wants to chart, consider using `create_fact_table_exploration` or `create_data_source_exploration` instead (when available).",
      inputSchema: z.object({
        metricId: z
          .string()
          .describe(
            "The ID of the metric to chart. Use get_metrics to find available metric IDs."
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
          .describe("The type of chart to render."),
        dateGranularity: z
          .enum(["auto", "hour", "day", "week", "month", "year"])
          .default("auto")
          .describe("Granularity for the date dimension."),
        dimensions: z
          .array(
            z.discriminatedUnion("dimensionType", [
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
            "Additional dimensions to break down the data. The date dimension is always included automatically. Use 'dynamic' for top-N grouping (e.g. top 10 countries), 'static' for specific values (e.g. only US, CA, UK), or 'slice' for custom named segments with filters."
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
    async ({ metricId, dateRange, lookbackValue, lookbackUnit, startDate, endDate, chartType, dateGranularity, dimensions, name }) => {
      try {
        const { datasource, metricName } = await resolveMetricDatasource(
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
            lookbackValue: dateRange === "customLookback" ? (lookbackValue ?? null) : null,
            lookbackUnit: dateRange === "customLookback" ? (lookbackUnit ?? null) : null,
            startDate: dateRange === "customDateRange" ? (startDate ?? null) : null,
            endDate: dateRange === "customDateRange" ? (endDate ?? null) : null,
          },
          dimensions: [
            {
              dimensionType: "date" as const,
              column: null,
              dateGranularity,
            },
            ...(dimensions || []),
          ],
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
          `${baseApiUrl}/api/v1/product-analytics/metric-exploration`,
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
          formatApiError(error, `creating metric exploration for '${metricId}'`, [
            "Check that the metric ID is correct — use get_metrics to list available metrics.",
            "Fact metric IDs start with 'fact__'.",
            "If no metric matches, consider charting from a fact table or data source instead.",
          ])
        );
      }
    }
  );
}
