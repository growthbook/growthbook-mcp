import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { z } from "zod";

function getApiKey() {
  const apiKey = process.env.GB_API_KEY;
  if (!apiKey) {
    throw new Error("GB_API_KEY environment variable is required");
  }
  return apiKey;
}

const baseApiUrl = "http://localhost:3100/api/v1";
const apiKey = getApiKey();

// Create an MCP server
const server = new McpServer(
  {
    name: "GrowthBook",
    version: "1.0.0",
  },
  {
    instructions: "You are a helpful assistant that can help with GrowthBook.",
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
  "Create a new feature flag",
  {
    id: z
      .string()
      .regex(
        /^[a-zA-Z0-9_-]+$/,
        "Feature key can only include letters, numbers, hyphens, and underscores"
      ),
    archived: z.boolean().optional().default(false),
    description: z.string().optional().default(""),
    owner: z.string().email(),
    project: z.string().optional().default(""),
    valueType: z.enum(["string", "number", "boolean", "json"]),
    defaultValue: z.string(),
    tags: z.array(z.string()).optional(),
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
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

// Start receiving messages on stdin and sending messages on stdout
const transport = new StdioServerTransport();
await server.connect(transport);
