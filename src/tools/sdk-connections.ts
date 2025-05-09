import { z } from "zod";
import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { handleResNotOk } from "../utils.js";
import { getDocs } from "../docs.js";

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
    Importantly, users need the key, which is a public key that allows the app to fetch features and experiments the API `,
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
          const res = await fetch(`${baseApiUrl}/environments`, {
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
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error}` }],
        };
      }
    }
  );

  server.tool(
    "check_setup",
    "Give a quick check of the setup to ensure that GrowthBook is installed correctly.",
    {
      language: z.enum(["javascript", "typescript", "react", "nextjs"]),
    },
    async ({ language }) => {
      try {
        const sdkRes = await fetch(`${baseApiUrl}/sdk-connections`, {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
        });

        await handleResNotOk(sdkRes);

        const sdkData = await sdkRes.json();

        const queryParams = new URLSearchParams();
        queryParams.append("limit", "100");

        const attrRes = await fetch(
          `${baseApiUrl}/attributes?${queryParams.toString()}`,
          {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
          }
        );

        await handleResNotOk(attrRes);

        const attrData = await attrRes.json();
        const docs = getDocs(language, "setup");

        const text = `
        Here is the list of SDK connections. The key field should match the clientKey property in the codebase:
        ${JSON.stringify(sdkData, null, 2)}

        Here is the list of attributes. Compare this list to what's in the codebase:
        ${JSON.stringify(attrData, null, 2)}

        Use the following instructions to check the codebase to verify everything is correctly configured:
        ${docs}
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
  );
}
