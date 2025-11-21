import { z } from "zod";
import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { searchGrowthBookDocs } from "../utils.js";

/**
 * Tool: search_growthbook_docs
 */
export function registerSearchTools({ server }: { server: McpServer }) {
  server.tool(
    "search_growthbook_docs",
    "Search the GrowthBook docs on how to use a feature",
    {
      query: z
        .string()
        .describe("The search query to look up in the GrowthBook docs."),
    },
    {
      readOnlyHint: true,
    },
    async ({ query }) => {
      const hits = await searchGrowthBookDocs(query);
      return {
        content: hits.slice(0, 5).map((hit: any) => {
          // Algolia typically returns content in various fields
          const content =
            hit.content ||
            hit.text ||
            hit._snippetResult?.content?.value ||
            hit._highlightResult?.content?.value;
          const snippet =
            hit._snippetResult?.content?.value ||
            hit._highlightResult?.content?.value;
          const title = hit.title || hit.hierarchy?.lvl0 || hit.hierarchy?.lvl1;
          const url = hit.url || hit.anchor;

          let text = "";
          if (title) {
            text += `**${title}**\n`;
          }
          if (url) {
            text += `URL: ${url}\n`;
          }
          if (snippet || content) {
            text += `\n${snippet || content}`;
          }

          return {
            type: "text",
            text: text || JSON.stringify(hit),
          };
        }),
      };
    }
  );
}
