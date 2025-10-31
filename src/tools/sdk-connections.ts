import { z } from "zod";
import {
  handleResNotOk,
  type BaseToolsInterface,
  paginationSchema,
} from "../utils.js";

interface SdkConnectionTools extends BaseToolsInterface {}
export function registerSdkConnectionTools({
  server,
  baseApiUrl,
  apiKey,
}: SdkConnectionTools) {
  /**
   * Tool: get_sdk_connections
   */
  server.tool(
    "get_sdk_connections",
    "Get all SDK connections. SDK connections are how GrowthBook connects to an app. Users need the client key to fetch features and experiments from the API.",
    {
      project: z
        .string()
        .describe("The ID of the project to filter SDK connections by")
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
        throw new Error(`Error fetching sdk connections: ${error}`);
      }
    }
  );

  /**
   * Tool: create_sdk_connection
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
        .describe("The language or platform for the SDK connection."),
      environment: z
        .string()
        .optional()
        .describe("The environment associated with the SDK connection."),
      projects: z
        .array(z.string())
        .describe("The projects to create the SDK connection in")
        .optional(),
    },
    async ({ name, language, environment, projects }) => {
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
        ...(projects && { projects }),
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
        throw new Error(`Error creating sdk connection: ${error}`);
      }
    }
  );
}
