import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const APPLICATION_ID = "MN7ZMY63CG";
const API_KEY = "e17ebcbd97bce29ad0bdec269770e9df";

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
      const INDEX_NAME = "growthbook";
      const url = `https://${APPLICATION_ID}-dsn.algolia.net/1/indexes/${INDEX_NAME}/query`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "X-Algolia-API-Key": API_KEY,
          "X-Algolia-Application-Id": APPLICATION_ID,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query }),
      });
      if (!response.ok) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Algolia search failed: ${response.statusText}`,
            },
          ],
        };
      }
      const data = await response.json();
      const hits = data.hits || [];
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
