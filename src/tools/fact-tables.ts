import { z } from "zod";
import {
  type BaseToolsInterface,
  fetchWithPagination,
  fetchWithRateLimit,
  buildHeaders,
  handleResNotOk,
  paginationSchema,
} from "../utils.js";
import type {
  ListFactTablesResponse,
  GetFactTableResponse,
} from "../api-type-helpers.js";
import {
  formatFactTablesList,
  formatFactTableDetail,
  formatApiError,
} from "../format-responses.js";

interface FactTableTools extends BaseToolsInterface {}

export function registerFactTableTools({
  server,
  baseApiUrl,
  apiKey,
}: FactTableTools) {
  server.registerTool(
    "list_fact_tables",
    {
      title: "List Fact Tables",
      description:
        "Lists GrowthBook fact tables (event-level data sources for fact metrics and product analytics). " +
        "Returns each table's id, name, and datasource id. Use `get_fact_table` with an id for full column objects (JSON per column), SQL, and user id types. " +
        "Use `get_projects` to resolve project names when filtering by projectId. " +
        "Use this to discover fact table IDs before charting or analysis tools that require a factTableId.",
      inputSchema: z.object({
        projectId: z
          .string()
          .optional()
          .describe("Filter fact tables associated with this project id."),
        datasourceId: z
          .string()
          .optional()
          .describe("Filter fact tables that use this data source id."),
        ...paginationSchema,
      }),
      annotations: {
        readOnlyHint: true,
      },
    },
    async ({ limit, offset, mostRecent, projectId, datasourceId }) => {
      try {
        const additionalParams: Record<string, string> = {};
        if (projectId) additionalParams.projectId = projectId;
        if (datasourceId) additionalParams.datasourceId = datasourceId;

        const data = (await fetchWithPagination(
          baseApiUrl,
          apiKey,
          "/api/v1/fact-tables",
          limit,
          offset,
          mostRecent,
          Object.keys(additionalParams).length > 0
            ? additionalParams
            : undefined
        )) as ListFactTablesResponse;

        if (
          mostRecent &&
          offset === 0 &&
          Array.isArray(data.factTables) &&
          data.factTables.length > 0
        ) {
          data.factTables = [...data.factTables].reverse();
        }

        return {
          content: [
            {
              type: "text" as const,
              text: formatFactTablesList(data),
            },
          ],
        };
      } catch (error) {
        throw new Error(
          formatApiError(error, "listing fact tables", [
            "Check that your GB_API_KEY has permission to read fact tables.",
            "Use get_projects if you need valid project IDs for filtering.",
          ])
        );
      }
    }
  );

  server.registerTool(
    "get_fact_table",
    {
      title: "Get Fact Table",
      description:
        "Fetches a single GrowthBook fact table by id (use `list_fact_tables` to discover ids). " +
        "Returns datasource, user id types, metadata, SQL, and each `columns[]` entry as pretty-printed JSON (all keys the API returns, including slice-related fields and deleted columns). " +
        "If a boolean property on a column object is omitted from that JSON, treat it as false. " +
        "Use when configuring fact-table explorations, interpreting fact metrics, or validating column names for filters. " +
        "Fact tables with `managedBy` set to `api` or `admin` are managed/official definitions.",
      inputSchema: z.object({
        factTableId: z
          .string()
          .describe(
            "The fact table id (e.g. from list_fact_tables, typically prefixed with ftb_)."
          ),
      }),
      annotations: {
        readOnlyHint: true,
      },
    },
    async ({ factTableId }) => {
      try {
        const res = await fetchWithRateLimit(
          `${baseApiUrl}/api/v1/fact-tables/${encodeURIComponent(factTableId)}`,
          { headers: buildHeaders(apiKey) }
        );
        await handleResNotOk(res);
        const data = (await res.json()) as GetFactTableResponse;

        return {
          content: [
            {
              type: "text" as const,
              text: formatFactTableDetail(data),
            },
          ],
        };
      } catch (error) {
        throw new Error(
          formatApiError(error, `fetching fact table '${factTableId}'`, [
            "Check the fact table id — use list_fact_tables to list valid ids.",
            "Ensure your GB_API_KEY can read fact tables.",
          ])
        );
      }
    }
  );
}
