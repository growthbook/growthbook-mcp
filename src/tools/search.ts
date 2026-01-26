import { z } from "zod";
import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { searchGrowthBookDocs } from "../utils.js";

/**
 * Tool: search_growthbook_docs
 */
export function registerSearchTools({ server }: { server: McpServer }) {
  server.registerTool(
    "search_growthbook_docs",
    {
      title: "Search GrowthBook Docs",
      description:
        'Searches official GrowthBook documentation for SDK integration, metrics setup, and experimentation best practices. Use when user asks about SDK integration in specific languages, metrics/fact tables/data source setup, experiment best practices, or troubleshooting. Good queries: "React SDK setup", "fact metrics", "sample ratio mismatch", "targeting attributes". Returns documentation snippets with links to full articles.',
      inputSchema: z.object({
        query: z
          .string()
          .min(1)
          .describe("The search query to look up in the GrowthBook docs."),
        maxResults: z
          .number()
          .min(1)
          .max(10)
          .default(5)
          .optional()
          .describe(
            "Maximum number of results to return (1-10, default: 5). More results may provide better context but increase response size."
          ),
      }),
      annotations: {
        readOnlyHint: true,
      },
    },
    async ({ query, maxResults = 5 }) => {
      const results = await searchGrowthBookDocs(query, {
        hitsPerPage: maxResults,
      });

      if (results.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No results found for "${query}". Try using different keywords or a more specific search term.`,
            },
          ],
        };
      }

      return {
        content: results.map((result) => {
          let text = `**${result.title}**\n`;

          // Add hierarchy/breadcrumb if available (helps with context)
          if (result.hierarchy && result.hierarchy.length > 0) {
            text += `📍 ${result.hierarchy.join(" > ")}\n`;
          }

          // Add URL (important for reference)
          if (result.url && result.url !== "#") {
            text += `🔗 ${result.url}\n`;
          }

          // Add snippet/content (the most important part - make it prominent)
          if (result.snippet) {
            text += `\n${result.snippet}`;
          } else if (result.content) {
            // Fallback to full content if no snippet, but truncate intelligently
            const truncated = result.content.substring(0, 300);
            text += `\n${truncated}${result.content.length > 300 ? "..." : ""}`;
          }

          return {
            type: "text",
            text: text.trim(),
          };
        }),
      };
    }
  );
}
