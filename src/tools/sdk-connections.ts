import { z } from "zod";
import {
  handleResNotOk,
  type BaseToolsInterface,
  paginationSchema,
  fetchWithRateLimit,
  fetchWithPagination,
  buildHeaders,
} from "../utils.js";
import type {
  ListSdkConnectionsResponse,
  CreateSdkConnectionResponse,
} from "../api-type-helpers.js";
import { formatSdkConnections, formatEnvironments, formatApiError } from "../format-responses.js";

interface SdkConnectionTools extends BaseToolsInterface {}
export function registerSdkConnectionTools({
  server,
  baseApiUrl,
  apiKey,
}: SdkConnectionTools) {
  /**
   * Tool: get_sdk_connections
   */
  server.registerTool(
    "get_sdk_connections",
    {
      title: "Get SDK Connections",
      description:
        "Lists all SDK connections configured in GrowthBook. SDK connections are how GrowthBook connects to an app - users need the client key to fetch features and experiments from the API. Use this to find existing client keys or check SDK configuration before troubleshooting.",
      inputSchema: z.object({
        project: z
          .string()
          .describe("The ID of the project to filter SDK connections by")
          .optional(),
        ...paginationSchema,
      }),
      annotations: {
        readOnlyHint: true,
      },
    },
    async ({ limit, offset, mostRecent, project }) => {
      try {
        const data = (await fetchWithPagination(
          baseApiUrl,
          apiKey,
          "/api/v1/sdk-connections",
          limit,
          offset,
          mostRecent,
          project ? { projectId: project } : undefined
        )) as ListSdkConnectionsResponse;

        // Reverse connections array for mostRecent to show newest-first
        if (mostRecent && offset === 0 && Array.isArray(data.connections)) {
          data.connections = data.connections.reverse();
        }

        return {
          content: [{ type: "text", text: formatSdkConnections(data) }],
        };
      } catch (error) {
        throw new Error(formatApiError(error, "fetching SDK connections", [
          "Check that your GB_API_KEY has permission to read SDK connections.",
        ]));
      }
    }
  );

  /**
   * Tool: create_sdk_connection
   */
  server.registerTool(
    "create_sdk_connection",
    {
      title: "Create SDK Connection",
      description:
        "Creates an SDK connection and returns the clientKey needed to integrate GrowthBook into an application. Prerequisites: Specify an environment (call get_environments first if unsure). Use for new app integrations; for existing apps use get_sdk_connections to find the existing key.",
      inputSchema: z.object({
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
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
      },
    },
    async ({ name, language, environment, projects }) => {
      if (!environment) {
        try {
          const res = await fetchWithRateLimit(
            `${baseApiUrl}/api/v1/environments`,
            {
              headers: buildHeaders(apiKey),
            }
          );

          await handleResNotOk(res);
          const data = await res.json();
          return {
            content: [
              {
                type: "text",
                text:
                  formatEnvironments(data) +
                  "\n\nAsk the user to select an environment, then call create_sdk_connection with the chosen environment id.",
              },
            ],
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
        const res = await fetchWithRateLimit(
          `${baseApiUrl}/api/v1/sdk-connections`,
          {
            method: "POST",
            headers: buildHeaders(apiKey),
            body: JSON.stringify(payload),
          }
        );

        await handleResNotOk(res);

        const data =
          (await res.json()) as CreateSdkConnectionResponse;

        const conn = data.sdkConnection;
        const text = conn
          ? `**SDK connection \`${conn.name}\` created.**\nClient key: \`${conn.key}\`\nEnvironment: ${conn.environment}\nLanguage(s): ${conn.languages.join(
              ", "
            )}`
          : `SDK connection created.\n${JSON.stringify(data)}`;
        return {
          content: [{ type: "text", text }],
        };
      } catch (error) {
        throw new Error(formatApiError(error, "creating SDK connection", [
          "Ensure the environment exists — use get_environments to check available environments.",
          "Check that the language parameter is a valid SDK language.",
        ]));
      }
    }
  );
}
