import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getDocs } from "./docs.js";

function getApiKey() {
  const apiKey = process.env.GB_API_KEY;
  if (!apiKey) {
    throw new Error("GB_API_KEY environment variable is required");
  }
  return apiKey;
}

function getApiUrl() {
  const defaultApiUrl = "https://api.growthbook.io/api/v1";
  const userApiUrl = process.env.GB_API_URL;
  return `${userApiUrl || defaultApiUrl}`;
}

function getAppOrigin() {
  const defaultAppOrigin = "https://app.growthbook.io";
  const userAppOrigin = process.env.GB_APP_ORIGIN;
  return `${userAppOrigin || defaultAppOrigin}`;
}

const baseApiUrl = getApiUrl();
const apiKey = getApiKey();
const appOrigin = getAppOrigin();
// Create an MCP server
const server = new McpServer(
  {
    name: "GrowthBook MCP",
    version: "1.0.0",
  },
  {
    instructions:
      "You are a helpful assistant that interacts with GrowthBook, an open source feature flagging and experimentation platform.",
  }
);

// Get all projects
server.tool(
  "get_projects",
  "Fetches all projects from the GrowthBook API",
  {},
  async () => {
    const queryParams = new URLSearchParams();
    queryParams.append("limit", "100");

    const res = await fetch(
      `${baseApiUrl}/projects?${queryParams.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    const data = await res.json();
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

server.tool(
  "get_project",
  "Fetch a single project from GrowthBook",
  {
    projectId: z.string(),
  },
  async ({ projectId }) => {
    const res = await fetch(`${baseApiUrl}/projects/${projectId}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });

    const data = await res.json();
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

server.tool(
  "edit_project",
  "Change the name, description, or settings.",
  {
    projectId: z.string(),
    name: z.string().optional(),
    description: z.string().optional(),
  },
  async ({ projectId, name, description }) => {
    const payload: { name?: string; description?: string } = {};

    if (name) {
      payload.name = name;
    }

    if (description) {
      payload.description = description;
    }

    if (!name && !description) {
      throw new Error("At least one of name or description is required");
    }

    const res = await fetch(`${baseApiUrl}/projects/${projectId}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

// Get all flags
server.tool(
  "get_flags",
  "Fetches all flags from the GrowthBook API",
  {},
  async () => {
    try {
      const queryParams = new URLSearchParams();

      queryParams.append("limit", "100");

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
        console.error(
          `API request failed with status ${res.status}:`,
          errorText
        );
        throw new Error(`API request failed with status ${res.status}`);
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

server.tool(
  "get_experiments",
  "Fetches all experiments from the GrowthBook API",
  {},
  async () => {
    try {
      const queryParams = new URLSearchParams();
      queryParams.append("limit", "100");

      const res = await fetch(
        `${baseApiUrl}/experiments?${queryParams.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
        }
      );

      const data = await res.json();
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    } catch (error) {
      console.error("Error fetching experiments:", error);
      throw error;
    }
  }
);

server.tool(
  "create_flag",
  "Create a new feature flag.",
  {
    id: z
      .string()
      .regex(
        /^[a-zA-Z0-9_-]+$/,
        "Feature key can only include letters, numbers, hyphens, and underscores."
      )
      .describe("Also known as the feature flag name."),
    archived: z.boolean().optional().default(false),
    description: z.string().optional().default(""),
    owner: z.string(),
    project: z.string().optional().default(""),
    valueType: z.enum(["string", "number", "boolean", "json"]),
    defaultValue: z.string(),
    tags: z.array(z.string()).optional(),
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

    const res = await fetch(`${baseApiUrl}/features`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    const docsText = getDocs(docs);

    const text = `
    ${JSON.stringify(data, null, 2)}
    
    Here is the documentation for the feature flag, if it makes sense to add the flag to the codebase:
    
    ${docsText}

    Additionally, see the feature flag on GrowthBook: @${appOrigin}/features/${id}
    `;

    return {
      content: [{ type: "text", text }],
    };
  }
);

server.tool(
  "create_force_rule",
  "Create a new force feature rule on an existing feature. Don't use this for experiments. Instead, use create_experiment.",
  {
    featureId: z.string(),
    description: z.string().optional(),
    condition: z
      .string()
      .describe(
        "Applied to everyone by default. Write conditions in MongoDB-style query syntax."
      )
      .optional(),
    value: z
      .string()
      .describe("The type of the value should match the feature type"),
    environments: z.string().array(),
  },
  async ({ featureId, description, condition, value, environments }) => {
    const payload = {
      // Loop through the environments and create a rule for each one keyed by environment name
      environments: environments.reduce((acc, env) => {
        acc[env] = {
          enabled: true,
          rules: [
            {
              type: "force",
              description,
              condition,
              value,
            },
          ],
        };
        return acc;
      }, {} as Record<string, { enabled: boolean; rules: Array<any> }>),
    };

    const res = await fetch(`${baseApiUrl}/features/${featureId}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

server.tool(
  "get_experiment",
  "Gets a single experiment from GrowthBook",
  {
    experimentId: z.string().describe("The ID of the experiment to get"),
  },
  async ({ experimentId }) => {
    const res = await fetch(`${baseApiUrl}/experiments/${experimentId}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });
    const data = await res.json();

    const text = `
    ${JSON.stringify(data, null, 2)}
    
    See the experiment on GrowthBook: @${appOrigin}/experiment/${experimentId}
    `;

    return {
      content: [{ type: "text", text }],
    };
  }
);

const VariationSchema = z.object({
  name: z.string().describe("The value to use for the variation"),
  key: z
    .string()
    .describe(
      "The key to use for the variation. Use a slugified version of name, if not supplied"
    ),
  value: z.string().describe("The value to use for the variation"),
});

server.tool(
  "create_experiment",
  "Create a new experiment rule on an existing feature",
  {
    featureId: z.string(),
    description: z.string().optional(),
    condition: z
      .string()
      .describe(
        "Applied to everyone by default. Write conditions in MongoDB-style query syntax."
      )
      .optional(),
    variations: z.array(VariationSchema),
    assignmentQueryId: z
      .string()
      .optional()
      .describe(
        "The ID of the assignment query to use. If not present, you'll need to fetch the datasource and show the result to the user for confirmation."
      ),
    name: z.string().describe("The name of the experiment"),
    trackingKey: z
      .string()
      .describe(
        "The key to use for tracking the experiment. Use a slugified version of name, if not supplied"
      ),
    environments: z.string().array(),
    hypothesis: z.string().describe("The hypothesis for the experiment"),
  },
  async ({
    featureId,
    description,
    condition,
    variations,
    environments,
    assignmentQueryId,
    name,
    trackingKey,
    hypothesis,
  }) => {
    if (!assignmentQueryId) {
      const res = await fetch(`${baseApiUrl}/data-sources/`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      });
      const data = await res.json();

      const text = `
      ${JSON.stringify(data, null, 2)}
      
      Here is the list of datasources. Please select one and use the ID in the create_experiment tool.
      `;

      return {
        content: [{ type: "text", text }],
      };
    }

    // Create experiment
    const experimentPayload = {
      name,
      trackingKey,
      description,
      condition,
      variations,
      hypothesis,
      assignmentQueryId,
    };

    const experimentRes = await fetch(`${baseApiUrl}/experiments`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(experimentPayload),
    });

    if (!experimentRes.ok) {
      const errorText = await experimentRes.text();
      return {
        content: [{ type: "text", text: errorText }],
      };
    }

    const experimentData = await experimentRes.json();

    const featurePayload = {
      // Loop through the environments and create a rule for each one keyed by environment name
      environments: environments.reduce((acc, env) => {
        acc[env] = {
          enabled: true,
          rules: [
            {
              type: "experiment-ref",
              experimentId: experimentData?.experiment.id,
              description,
              condition,
              variations: experimentData?.experiment.variations.map(
                (variation: { variationId: string }, idx: number) => ({
                  value: variations[idx].value,
                  variationId: variation.variationId,
                })
              ),
            },
          ],
        };
        return acc;
      }, {} as Record<string, { enabled: boolean; rules: Array<any> }>),
    };

    // return {
    //   content: [
    //     {
    //       type: "text",
    //       text: JSON.stringify({ featurePayload, experimentData }, null, 2),
    //     },
    //   ],
    // };

    const res = await fetch(`${baseApiUrl}/features/${featureId}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(featurePayload),
    });

    const data = await res.json();

    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

// Start receiving messages on stdin and sending messages on stdout
const transport = new StdioServerTransport();
await server.connect(transport);
