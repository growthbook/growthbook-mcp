import { z } from "zod";
import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { handleResNotOk, type BaseToolsInterface } from "../utils.js";

interface SdkConnectionTools extends BaseToolsInterface {}
export function registerSdkConnectionTools({
  server,
  baseApiUrl,
  apiKey,
}: SdkConnectionTools) {
  /**
   * Tool: get_sdk_connections
   * Description: Retrieves all SDK connections, which are how GrowthBook connects to an app.
   * Users need the key, which is a public key that allows the app to fetch features and experiments from the API.
   */
  server.tool(
    "get_sdk_connections",
    "Get all SDK connections. SDK connections are how GrowthBook connects to an app. Users need the client key to fetch features and experiments from the API.",
    {
      limit: z.number().optional().default(100),
      offset: z.number().optional().default(0),
    },
    async ({ limit, offset }) => {
      try {
        const queryParams = new URLSearchParams({
          limit: limit?.toString(),
          offset: offset?.toString(),
        });

        const res = await fetch(
          `${baseApiUrl}/api/v1/sdk-connections?${queryParams.toString()}`,
          {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
          }
        );

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

  /**
   * Tool: create_sdk_connection
   * Description: Creates an SDK connection for a user. Returns an SDK clientKey that can be used to fetch features and experiments.
   * Requires a name, language, and optionally an environment.
   */
  server.tool(
    "create_sdk_connection",
    `Create an SDK connection for a user. Returns an SDK clientKey that can be used to fetch features and experiments.`,
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
        try {
          const res = await fetch(`${baseApiUrl}/api/v1/environments`, {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
          });

          await handleResNotOk(res);
          const data = await res.json();
          const text = `${JSON.stringify(data, null, 2)}
    
        Here is the list of environments. Ask the user to select one and use the key in the create_sdk_connection tool.
        `;

          return {
            content: [{ type: "text", text }],
          };
        } catch (error) {
          return {
            content: [{ type: "text", text: `Error: ${error}` }],
          };
        }
      }

      const payload = {
        name,
        language,
        environment,
      };

      try {
        const res = await fetch(`${baseApiUrl}/api/v1/sdk-connections`, {
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
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error}` }],
        };
      }
    }
  );
}
