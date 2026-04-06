import { z } from "zod";
import {
  type BaseToolsInterface,
  handleResNotOk,
  fetchWithRateLimit,
  buildHeaders,
} from "../utils.js";
import type {
  CreateExplorationResponse,
  CreateFactTableExplorationResponse,
  GetFactTableResponse,
} from "../api-type-helpers.js";
import { formatExplorationResult, formatApiError } from "../format-responses.js";
import {
  explorationSharedInputSchema,
  buildDateRangePayload,
  buildDimensions,
  factTableExplorationSeriesSchema,
  mapFactTableSeriesToPayload,
  metricExplorationEntrySchema,
} from "./exploration-schemas.js";

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

async function resolveFactTableDatasource(
  baseApiUrl: string,
  apiKey: string,
  factTableId: string
): Promise<{ datasource: string; factTableName: string }> {
  const res = await fetchWithRateLimit(
    `${baseApiUrl}/api/v1/fact-tables/${encodeURIComponent(factTableId)}`,
    { headers: buildHeaders(apiKey) }
  );
  await handleResNotOk(res);
  const data = (await res.json()) as GetFactTableResponse;
  const ft = data.factTable;
  const datasource = ft?.datasource;
  const factTableName = ft?.name || factTableId;

  if (!datasource) {
    throw new Error(
      `Fact table '${factTableId}' does not have a datasource configured.`
    );
  }

  return { datasource, factTableName };
}

const metricExplorationInputSchema = explorationSharedInputSchema
  .extend({
    metricId: z
      .string()
      .optional()
      .describe(
        "Single-series mode: the fact metric id to chart (must start with 'fact__'). Legacy/standard metrics (met_) are not supported. " +
          "Use get_metrics to find ids. Omit when using metrics[] for multiple series on one chart."
      ),
    name: z
      .string()
      .optional()
      .describe(
        "Single-series mode only: display name for the series in the legend and formatted table. Defaults to the metric name from GrowthBook."
      ),
    metrics: z
      .array(metricExplorationEntrySchema)
      .optional()
      .describe(
        "Multi-series mode: one or more fact metrics on the same chart (same date range, chart type, and dimensions). " +
          "Each entry is a fact__ metric id and optional legend name. All metrics must use the same datasource. " +
          "Do not pass metricId/name when using this array."
      ),
  })
  .superRefine((data, ctx) => {
    const hasMulti = (data.metrics?.length ?? 0) > 0;
    const hasSingle = Boolean(data.metricId?.trim());
    if (hasMulti && hasSingle) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Use either metricId (single series) or metrics[] (one or more series), not both.",
        path: ["metrics"],
      });
    }
    if (!hasMulti && !hasSingle) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Provide metricId for one fact metric, or metrics[] with at least one fact metric.",
        path: ["metricId"],
      });
    }
  });

const factTableExplorationInputSchema = explorationSharedInputSchema.extend({
  factTableId: z
    .string()
    .describe(
      "The fact table id (from list_fact_tables, typically prefixed with ftb_). Use get_fact_table first to confirm datasource columns for filters, sums, and dimensions."
    ),
  series: z
    .array(factTableExplorationSeriesSchema)
    .min(1)
    .describe(
      "One or more series for a single chart from the fact table (row counts, distinct unit counts, or sums of a numeric column). " +
        "Pass multiple objects here to plot several measures at once (e.g. order count and sum of revenue). " +
        "For valueType 'sum', valueColumn must be a numeric column name from get_fact_table. " +
        "The formatted summary table lists each series in separate columns; the GrowthBook link shows the full chart."
    ),
});

export function registerProductAnalyticsTools({
  server,
  baseApiUrl,
  apiKey,
  appOrigin: _appOrigin,
}: ProductAnalyticsTools) {
  server.registerTool(
    "create_metric_exploration",
    {
      title: "Create Metric Exploration",
      description:
        "This tool can be used to answer questions about Fact Metrics in GrowthBook. " +
        "Charts one or more GrowthBook fact metrics (IDs starting with 'fact__') on a single exploration — pass metricId for one series, or metrics[] for multiple series (e.g. compare metrics on the same time range). " +
        "All metrics in one call must share the same datasource. Legacy/standard metrics (met_) are NOT supported. " +
        "Use `get_metrics` to find fact metric IDs. Returns chart data and a link to view the visualization in GrowthBook. " +
        "The underlying query may take time to execute. If the response indicates the query is still running, wait 10–15 seconds and retry with cache 'preferred' to pick up the completed result. " +
        "For ad-hoc aggregates on raw fact tables (counts, sums, multiple custom series), use `create_fact_table_exploration` with a series array; use `create_data_source_exploration` when that tool is available.",
      inputSchema: metricExplorationInputSchema,
      annotations: {
        readOnlyHint: false,
      },
    },
    async (input) => {
      const {
        metricId,
        name,
        metrics,
        dateRange,
        lookbackValue,
        lookbackUnit,
        startDate,
        endDate,
        cache,
        chartType,
        dateGranularity,
        dimensions,
      } = input;

      const metricEntries =
        metrics && metrics.length > 0
          ? metrics
          : [{ metricId: metricId as string, name }];

      try {
        const resolved = await Promise.all(
          metricEntries.map((m) =>
            resolveFactMetricDatasource(baseApiUrl, apiKey, m.metricId)
          )
        );

        const explorationLabel =
          metricEntries.length > 1
            ? `${metricEntries.length} fact metrics`
            : metricEntries[0].name ?? resolved[0].metricName;

        const datasource = resolved[0].datasource;
        for (let i = 1; i < resolved.length; i++) {
          if (resolved[i].datasource !== datasource) {
            throw new Error(
              `All metrics must use the same datasource. ` +
                `'${metricEntries[i].metricId}' uses '${resolved[i].datasource}', ` +
                `but '${metricEntries[0].metricId}' uses '${datasource}'.`
            );
          }
        }

        const payload = {
          datasource,
          type: "metric" as const,
          chartType,
          dateRange: buildDateRangePayload(
            dateRange,
            lookbackValue,
            lookbackUnit,
            startDate,
            endDate
          ),
          dimensions: buildDimensions(dimensions, chartType, dateGranularity),
          dataset: {
            type: "metric" as const,
            values: metricEntries.map((m, i) => ({
              name: m.name ?? resolved[i].metricName,
              type: "metric" as const,
              metricId: m.metricId,
              rowFilters: [],
              unit: null,
              denominatorUnit: null,
            })),
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
              text: formatExplorationResult(data, explorationLabel),
            },
          ],
        };
      } catch (error) {
        const ids = metricEntries.map((m) => m.metricId).join(", ");
        throw new Error(
          formatApiError(
            error,
            `creating metric exploration for '${ids}'`,
            [
              "Only fact metrics are supported — IDs must start with 'fact__'.",
              "Use get_metrics to find available fact metric IDs.",
              "Multiple metrics in one chart must share the same datasource.",
              "If no fact metric matches, use create_fact_table_exploration or create_data_source_exploration instead.",
            ]
          )
        );
      }
    }
  );

  server.registerTool(
    "create_fact_table_exploration",
    {
      title: "Create Fact Table Exploration",
      description:
        "Requires a factTableId and a series array with at least one entry; you can pass multiple series in one call (e.g. row count and sum of amount on the same chart). " +
        "Runs a GrowthBook product-analytics query against a fact table (raw event-level SQL source), returning chart data and optionally a link to the visualization. " +
        "Each series can be row count, distinct unit count, or sum of a numeric column (use get_fact_table for column names). " +
        "For saved definitions and reuse, prefer fact metrics and `create_metric_exploration` (multiple fact metrics per chart). " +
        "Use list_fact_tables to discover ids, then get_fact_table for column names, SQL, and filters before calling this tool. " +
        "The query may take time; if the response says it is still running, wait 10–15 seconds and retry with cache 'preferred'.",
      inputSchema: factTableExplorationInputSchema,
      annotations: {
        readOnlyHint: false,
      },
    },
    async (input) => {
      const {
        factTableId,
        series,
        dateRange,
        lookbackValue,
        lookbackUnit,
        startDate,
        endDate,
        cache,
        chartType,
        dateGranularity,
        dimensions,
      } = input;

      try {
        const { datasource, factTableName } = await resolveFactTableDatasource(
          baseApiUrl,
          apiKey,
          factTableId
        );

        const payload = {
          datasource,
          type: "fact_table" as const,
          chartType,
          dateRange: buildDateRangePayload(
            dateRange,
            lookbackValue,
            lookbackUnit,
            startDate,
            endDate
          ),
          dimensions: buildDimensions(dimensions, chartType, dateGranularity),
          dataset: {
            type: "fact_table" as const,
            factTableId,
            values: series.map(mapFactTableSeriesToPayload),
          },
        };

        const res = await fetchWithRateLimit(
          `${baseApiUrl}/api/v1/product-analytics/fact-table-exploration?cache=${cache}`,
          {
            method: "POST",
            headers: buildHeaders(apiKey),
            body: JSON.stringify(payload),
          }
        );

        await handleResNotOk(res);

        const data = (await res.json()) as CreateFactTableExplorationResponse & {
          explorationUrl?: string;
        };

        const title =
          series.length > 1
            ? `${factTableName} (${series.length} series)`
            : factTableName;

        return {
          content: [
            {
              type: "text" as const,
              text: formatExplorationResult(data, title),
            },
          ],
        };
      } catch (error) {
        throw new Error(
          formatApiError(
            error,
            `creating fact table exploration for '${factTableId}'`,
            [
              "Verify factTableId with list_fact_tables and get_fact_table.",
              "For sum series, valueColumn must be a numeric column on that fact table.",
              "Ensure your API key can read fact tables and run product analytics queries.",
            ]
          )
        );
      }
    }
  );
}
