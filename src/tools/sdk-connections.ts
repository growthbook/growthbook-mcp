import { z } from "zod";
import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { handleResNotOk } from "../utils.js";

interface SdkConnectionTools {
  server: McpServer;
  baseApiUrl: string;
  apiKey: string;
}
export function registerSdkConnectionTools({
  server,
  baseApiUrl,
  apiKey,
}: SdkConnectionTools) {
  // Get SDK connections
  server.tool(
    "get_sdk_connections",
    `Get all SDK connections, 
    which are how GrowthBook connects to an app. 
    Importantly, users need the SDK key, which is a public key that allows the app to fetch features and experiments the API `,
    {},
    async () => {
      try {
        const res = await fetch(`${baseApiUrl}/sdk-connections`, {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
        });

        await handleResNotOk(res);

        const data = await res.json();

        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error}` }],
        };
      }
    }
  );

  server.tool(
    "create_sdk_connection",
    `Create an SDK connection for a user. Returns an SDK key that can be used to fetch features and experiments.`,
    {
      name: z
        .string()
        .describe(
          "Name of the SDK connection in GrowthBook. Should reflect the current project."
        ),
      language: z
        .enum([
          "nocode-webflow",
          "nocode-wordpress",
          "nocode-shopify",
          "nocode-other",
          "javascript",
          "nodejs",
          "react",
          "php",
          "ruby",
          "python",
          "go",
          "java",
          "csharp",
          "android",
          "ios",
          "flutter",
          "elixir",
          "edge-cloudflare",
          "edge-fastly",
          "edge-lambda",
          "edge-other",
          "other",
        ])
        .describe(
          "The language of the SDK. Either 'javascript' or 'typescript'."
        ),
      environment: z
        .string()
        .optional()
        .describe("The environment associated with the SDK connection."),
    },
    async ({ name, language, environment }) => {
      if (!environment) {
        const res = await fetch(`${baseApiUrl}/environments`, {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
        });

        await handleResNotOk(res);

        const data = await res.json();

        const text = `
        ${JSON.stringify(data, null, 2)}
        
        Here is the list of environments. Ask the user to select one and use the ID in the create_sdk_connection tool.
        `;

        return {
          content: [{ type: "text", text }],
        };
      }

      const payload = {
        name,
        language,
        environment,
      };

      const res = await fetch(`${baseApiUrl}/sdk-connections`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      await handleResNotOk(res);

      const data = await res.json();

      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    }
  );
}
