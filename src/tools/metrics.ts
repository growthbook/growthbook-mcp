import { z } from "zod";
import {
  ExtendedToolsInterface,
  handleResNotOk,
  paginationSchema,
  fetchWithRateLimit,
  fetchWithPagination,
  buildHeaders,
} from "../utils.js";
import type {
  ListMetricsResponse,
  ListFactMetricsResponse,
  GetMetricResponse,
  GetFactMetricResponse,
  CreateFactMetricResponse,
} from "../api-type-helpers.js";
import {
  formatMetricsList,
  formatMetricDetail,
  formatFactMetricCreated,
  formatFactMetricValidationErrors,
  formatApiError,
} from "../format-responses.js";
import {
  buildFactMetricPayload,
  createFactMetricShape,
  validateFactMetricInput,
} from "./fact-schemas.js";

interface MetricsTools extends ExtendedToolsInterface {}

export function registerMetricsTools({
  server,
  baseApiUrl,
  apiKey,
  appOrigin,
  user,
}: MetricsTools) {
  /**
   * Tool: get_metrics
   */
  server.registerTool(
    "get_metrics",
    {
      title: "Get Metrics",
      description:
        "Lists metrics in GrowthBook. Metrics measure experiment success (e.g., conversion rate, revenue per user). Two metric types: Fact metrics (IDs start with 'fact__') are modern and recommended for new setups; Legacy metrics are an older format, still supported. Use this to find metric IDs for analyzing experiments or understand available success measures. Single metric fetch includes full definition and GrowthBook link.",
      inputSchema: z.object({
        project: z
          .string()
          .describe("The ID of the project to filter metrics by")
          .optional(),
        metricId: z
          .string()
          .describe("The ID of the metric to fetch")
          .optional(),
        ...paginationSchema,
      }),
      annotations: {
        readOnlyHint: true,
      },
    },
    async ({ limit, offset, mostRecent, project, metricId }) => {
      if (metricId) {
        try {
          let res;

          if (metricId.startsWith("fact__")) {
            res = await fetchWithRateLimit(
              `${baseApiUrl}/api/v1/fact-metrics/${metricId}`,
              {
                headers: buildHeaders(apiKey),
              }
            );
          } else {
            res = await fetchWithRateLimit(
              `${baseApiUrl}/api/v1/metrics/${metricId}`,
              {
                headers: buildHeaders(apiKey),
              }
            );
          }

          await handleResNotOk(res);

          const data =
            metricId.startsWith("fact__")
              ? ((await res.json()) as GetFactMetricResponse)
              : ((await res.json()) as GetMetricResponse);

          return {
            content: [
              {
                type: "text",
                text: formatMetricDetail(data, appOrigin),
              },
            ],
          };
        } catch (error) {
          throw new Error(formatApiError(error, `fetching metric '${metricId}'`, [
            "Check the metric ID is correct. Fact metric IDs start with 'fact__'.",
            "Use get_metrics without a metricId to list all available metrics.",
          ]));
        }
      }

      try {
        const additionalParams = project ? { projectId: project } : undefined;

        const metricsData = (await fetchWithPagination(
          baseApiUrl,
          apiKey,
          "/api/v1/metrics",
          limit,
          offset,
          mostRecent,
          additionalParams
        )) as ListMetricsResponse;

        const factMetricData = (await fetchWithPagination(
          baseApiUrl,
          apiKey,
          "/api/v1/fact-metrics",
          limit,
          offset,
          mostRecent,
          additionalParams
        )) as ListFactMetricsResponse;

        // Reverse arrays for mostRecent to show newest-first
        if (mostRecent && offset === 0) {
          if (Array.isArray(metricsData.metrics)) {
            metricsData.metrics = metricsData.metrics.reverse();
          }
          if (Array.isArray(factMetricData.factMetrics)) {
            factMetricData.factMetrics = factMetricData.factMetrics.reverse();
          }
        }

        return {
          content: [{ type: "text", text: formatMetricsList(metricsData, factMetricData) }],
        };
      } catch (error) {
        throw new Error(formatApiError(error, "fetching metrics", [
          "Check that your GB_API_KEY has permission to read metrics.",
        ]));
      }
    }
  );

  /**
   * Tool: create_fact_metric
   */
  server.registerTool(
    "create_fact_metric",
    {
      title: "Create Fact Metric",
      description:
        "Creates a fact metric on an existing fact table. Requires a name, a metricType, and a numerator pointing at a fact table id — use `list_fact_tables` to find the id and `get_fact_table` to check column names. " +
        "Pick the metricType from what you are measuring: `proportion` for the share of units that did something (leave numerator.column empty), `mean` for the average of a column per unit, " +
        "`ratio` for one aggregate divided by another (requires a denominator), `quantile` for a percentile (requires quantileSettings), and `retention` or `dailyParticipation` for engagement over time. " +
        "Set `inverse` when a decrease is an improvement, such as bounce rate. " +
        "Analysis settings (conversion windows, capping, priors, risk thresholds) are not set here — the metric inherits your organization defaults and can be tuned in the GrowthBook UI. " +
        "Input problems are reported back as a list before anything is sent to GrowthBook.",
      inputSchema: createFactMetricShape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    async (input) => {
      const validationErrors = validateFactMetricInput(input);
      if (validationErrors.length > 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: formatFactMetricValidationErrors(validationErrors),
            },
          ],
        };
      }

      try {
        const res = await fetchWithRateLimit(
          `${baseApiUrl}/api/v1/fact-metrics`,
          {
            method: "POST",
            headers: buildHeaders(apiKey),
            body: JSON.stringify(buildFactMetricPayload(input, user)),
          }
        );

        await handleResNotOk(res);
        const data = (await res.json()) as CreateFactMetricResponse;

        return {
          content: [
            {
              type: "text" as const,
              text: formatFactMetricCreated(data, appOrigin),
            },
          ],
        };
      } catch (error) {
        throw new Error(
          formatApiError(error, `creating fact metric '${input.name}'`, [
            "Verify the fact table id — use list_fact_tables to list valid ids.",
            "Verify column names against get_fact_table, including special values like '$$count' and '$$distinctUsers'.",
            "If scoping to a project, verify the project id with get_projects.",
          ])
        );
      }
    }
  );
}
