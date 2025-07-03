import { z } from "zod";
import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { searchGrowthBookDocs, type BaseToolsInterface } from "../utils.js";

interface SearchTools {
  server: McpServer;
}

/**
 * Tool: search_growthbook_docs
 */
export function registerSearchTools({ server }: SearchTools) {
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
