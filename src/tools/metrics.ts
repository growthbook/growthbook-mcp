import { z } from "zod";
import {
  ExtendedToolsInterface,
  generateLinkToGrowthBook,
  handleResNotOk,
  paginationSchema,
  fetchWithRateLimit,
  fetchWithPagination,
} from "../utils.js";

interface MetricsTools extends ExtendedToolsInterface {}

export function registerMetricsTools({
  server,
  baseApiUrl,
  apiKey,
  appOrigin,
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
                headers: {
                  Authorization: `Bearer ${apiKey}`,
                  "Content-Type": "application/json",
                },
              }
            );
          } else {
            res = await fetchWithRateLimit(
              `${baseApiUrl}/api/v1/metrics/${metricId}`,
              {
                headers: {
                  Authorization: `Bearer ${apiKey}`,
                  "Content-Type": "application/json",
                },
              }
            );
          }

          await handleResNotOk(res);

          const data = await res.json();

          const linkToGrowthBook = generateLinkToGrowthBook(
            appOrigin,
            data.factMetric ? "fact-metrics" : "metric",
            metricId
          );

          return {
            content: [
              {
                type: "text",
                text:
                  JSON.stringify(data) +
                  `\n**Critical** Show the user the link to the metric in GrowthBook: [View the metric in GrowthBook](${linkToGrowthBook})
      `,
              },
            ],
          };
        } catch (error) {
          throw new Error(`Error fetching metric: ${error}`);
        }
      }

      try {
        const additionalParams = project ? { projectId: project } : undefined;

        const metricsData = await fetchWithPagination(
          baseApiUrl,
          apiKey,
          "/api/v1/metrics",
          limit,
          offset,
          mostRecent,
          additionalParams
        );

        const factMetricData = await fetchWithPagination(
          baseApiUrl,
          apiKey,
          "/api/v1/fact-metrics",
          limit,
          offset,
          mostRecent,
          additionalParams
        );

        // Reverse arrays for mostRecent to show newest-first
        if (mostRecent && offset === 0) {
          if (Array.isArray(metricsData.metrics)) {
            metricsData.metrics = metricsData.metrics.reverse();
          }
          if (Array.isArray(factMetricData.factMetrics)) {
            factMetricData.factMetrics = factMetricData.factMetrics.reverse();
          }
        }

        const metricData = {
          metrics: metricsData,
          factMetrics: factMetricData,
        };

        return {
          content: [{ type: "text", text: JSON.stringify(metricData) }],
        };
      } catch (error) {
        throw new Error(`Error fetching metrics: ${error}`);
      }
    }
  );
}
