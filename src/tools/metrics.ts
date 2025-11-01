import { z } from "zod";
import {
  ExtendedToolsInterface,
  generateLinkToGrowthBook,
  handleResNotOk,
  paginationSchema,
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
  server.tool(
    "get_metrics",
    "Fetches metrics from the GrowthBook API, with optional limit, offset, and project filtering.",
    {
      project: z
        .string()
        .describe("The ID of the project to filter metrics by")
        .optional(),
      ...paginationSchema,
    },
    async ({ limit, offset, project }) => {
      try {
        const queryParams = new URLSearchParams({
          limit: limit?.toString(),
          offset: offset?.toString(),
        });

        if (project) {
          queryParams.append("projectId", project);
        }

        const metricsRes = await fetch(
          `${baseApiUrl}/api/v1/metrics?${queryParams.toString()}`,
          {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
          }
        );

        await handleResNotOk(metricsRes);

        const metricsData = await metricsRes.json();

        const factMetricRes = await fetch(
          `${baseApiUrl}/api/v1/fact-metrics?${queryParams.toString()}`,
          {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
          }
        );

        await handleResNotOk(factMetricRes);

        const factMetricData = await factMetricRes.json();

        const metricData = {
          metrics: metricsData,
          factMetrics: factMetricData,
        };

        return {
          content: [
            { type: "text", text: JSON.stringify(metricData, null, 2) },
          ],
        };
      } catch (error) {
        throw new Error(`Error fetching metrics: ${error}`);
      }
    }
  );

  /**
   * Tool: get_metric
   */
  server.tool(
    "get_metric",
    "Fetches a metric from the GrowthBook API",
    {
      metricId: z.string().describe("The ID of the metric to get"),
    },
    async ({ metricId }) => {
      try {
        let res;

        if (metricId.startsWith("fact__")) {
          res = await fetch(`${baseApiUrl}/api/v1/fact-metrics/${metricId}`, {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
          });
        } else {
          res = await fetch(`${baseApiUrl}/api/v1/metrics/${metricId}`, {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
          });
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
                JSON.stringify(data, null, 2) +
                `\n**Critical** Show the user the link to the metric in GrowthBook: [View the metric in GrowthBook](${linkToGrowthBook})
          `,
            },
          ],
        };
      } catch (error) {
        throw new Error(`Error fetching metric: ${error}`);
      }
    }
  );
}
