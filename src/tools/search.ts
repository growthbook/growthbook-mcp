import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { searchGrowthBookDocs } from "../utils.js";

/**
 * Tool: search_growthbook_docs
 * Description: Searches the GrowthBook documentation for information on how to use a feature, based on a user-provided query.
 */
export function registerSearchTool({ server }: { server: McpServer }) {
  server.tool(
    "search_growthbook_docs",
    "Search the GrowthBook docs on how to use a feature",
    {
      query: z
        .string()
        .describe("The search query to look up in the GrowthBook docs."),
    },
    async ({ query }) => {
      const hits = await searchGrowthBookDocs(query);
      return {
        content: hits.slice(0, 5).map((hit: any) => ({
          type: "text",
          text: hit.title
            ? `${hit.title}: ${hit.url}`
            : hit.url || JSON.stringify(hit),
        })),
      };
    }
  );
}
