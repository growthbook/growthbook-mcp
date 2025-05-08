import { z } from "zod";
import { getDocs } from "../docs.js";
import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

interface FeatureTools {
  server: McpServer;
  baseApiUrl: string;
  apiKey: string;
  appOrigin: string;
}

export function registerFeatureTools({
  server,
  baseApiUrl,
  apiKey,
  appOrigin,
}: FeatureTools) {
  server.tool(
    "create_feature_flag",
    "Create, add, or wrap an element with a feature flag.",
    {
      id: z
        .string()
        .regex(
          /^[a-zA-Z0-9_-]+$/,
          "Feature key can only include letters, numbers, hyphens, and underscores."
        )
        .describe("A unique key name for the feature"),
      archived: z
        .boolean()
        .optional()
        .default(false)
        .describe("Whether the feature flag is archived"),
      description: z
        .string()
        .optional()
        .default("")
        .describe("A description of the feature flag"),
      owner: z.string().describe("The owner of the feature flag"),
      project: z
        .string()
        .optional()
        .default("")
        .describe("The project the feature flag belongs to"),
      valueType: z
        .enum(["string", "number", "boolean", "json"])
        .describe("The value type the feature flag will return"),
      defaultValue: z
        .string()
        .describe("The default value of the feature flag"),
      tags: z
        .array(z.string())
        .optional()
        .describe("Tags for the feature flag"),
      docs: z.enum(["nextjs", "react", "javascript", "typescript"]),
    },
    async ({
      id,
      archived,
      description,
      owner,
      project,
      valueType,
      defaultValue,
      tags,
      docs,
    }) => {
      const payload = {
        id,
        archived,
        description,
        owner,
        project,
        valueType,
        defaultValue,
        tags,
      };

      try {
        const res = await fetch(`${baseApiUrl}/features`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          let errorMessage = `HTTP ${res.status} ${res.statusText}`;
          try {
            const errorBody = await res.json();
            errorMessage += `: ${JSON.stringify(errorBody)}`;
          } catch {
            // fallback to text if not JSON
            const errorText = await res.text();
            if (errorText) errorMessage += `: ${errorText}`;
          }
          throw new Error(errorMessage);
        }

        const data = await res.json();

        const docsText = getDocs(docs);

        const text = `
      ${JSON.stringify(data, null, 2)}
      
      Here is the documentation for the feature flag, if it makes sense to add the flag to the codebase:
      
      ${docsText}
  
      Additionally, see the feature flag on GrowthBook: ${appOrigin}/features/${id}
      `;

        return {
          content: [{ type: "text", text }],
        };
      } catch (error) {
        console.error("Error creating feature flag:", error);
        throw error;
      }
    }
  );

  server.tool(
    "get_feature_flags",
    "Fetches all feature flags from the GrowthBook API",
    {
      limit: z.number().optional().default(10),
      offset: z.number().optional().default(0),
      project: z.string().optional(),
    },
    async ({ limit, offset, project }) => {
      try {
        const queryParams = new URLSearchParams({
          limit: limit?.toString(),
          offset: offset?.toString(),
        });

        if (project) queryParams.append("project", project);

        const res = await fetch(
          `${baseApiUrl}/features?${queryParams.toString()}`,
          {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
          }
        );

        if (!res.ok) {
          const errorText = await res.text();
          throw new Error(errorText);
        }

        const data = await res.json();

        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      } catch (error) {
        console.error("Error fetching flags:", error);
        throw error;
      }
    }
  );
}
