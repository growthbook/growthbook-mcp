import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerExperimentAnalysisPrompt({
  server,
}: {
  server: McpServer;
}) {
  server.prompt(
    "experiment-analysis",
    "Analyze recent experiments and give me actionable advice",
    () => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: "Use GrowthBook to fetch my recent experiments. Analyze the experiments and tell me:\n\n1. Which experiment types are actually worth running vs. theater?\n\n2. What's the one pattern in our losses that we're blind to?\n\n3. If you could only run 3 experiments next quarter based on these results, what would they be and why?\n\n4. What's the biggest methodological risk in our current approach that could be invalidating results?\n\nBe specific. Use the actual data. Don't give me generic advice.",
          },
        },
      ],
    })
  );
}
