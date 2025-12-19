import { z } from "zod";
import { getFeatureFlagDocs } from "./docs.js";
import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// Shared interfaces for MCP tools
export interface BaseToolsInterface {
  server: McpServer;
  baseApiUrl: string;
  apiKey: string;
}

export interface ExtendedToolsInterface extends BaseToolsInterface {
  appOrigin: string;
  user: string;
}

// Shared file extension enum for all MCP tools
export const SUPPORTED_FILE_EXTENSIONS = [
  ".tsx",
  ".jsx",
  ".ts",
  ".js",
  ".vue",
  ".py",
  ".go",
  ".php",
  ".rb",
  ".java",
  ".cs",
  ".swift",
  ".ex",
  ".exs",
  ".kt",
  ".kts",
  ".ktm",
  ".dart",
] as const;

export type SupportedFileExtension = (typeof SUPPORTED_FILE_EXTENSIONS)[number];

export async function handleResNotOk(res: Response) {
  if (!res.ok) {
    const errorText = await res.text();
    let errorMessage = `HTTP ${res.status} ${res.statusText}`;
    try {
      const errorBody = JSON.parse(errorText);
      errorMessage += `: ${JSON.stringify(errorBody)}`;
    } catch {
      if (errorText) errorMessage += `: ${errorText}`;
    }
    throw new Error(errorMessage);
  }
}

export function getApiKey() {
  const apiKey = process.env.GB_API_KEY;
  if (!apiKey) {
    throw new Error("GB_API_KEY environment variable is required");
  }
  return apiKey;
}

export function getApiUrl() {
  const defaultApiUrl = "https://api.growthbook.io";
  const userApiUrl = process.env.GB_API_URL;
  return `${userApiUrl || defaultApiUrl}`;
}

export function getAppOrigin() {
  const defaultAppOrigin = "https://app.growthbook.io";
  const userAppOrigin = process.env.GB_APP_ORIGIN;
  return `${userAppOrigin || defaultAppOrigin}`;
}

export function getDocsMetadata(extension: string) {
  switch (extension) {
    case ".tsx":
    case ".jsx":
      return {
        language: "react",
        stub: getFeatureFlagDocs("react"),
        docs: "https://docs.growthbook.io/lib/react",
      };
    case ".ts":
    case ".js":
      return {
        language: "javascript",
        stub: getFeatureFlagDocs("javascript"),
        docs: "https://docs.growthbook.io/lib/js",
      };
    case ".vue":
      return {
        language: "vue",
        stub: getFeatureFlagDocs("vue"),
        docs: "https://docs.growthbook.io/lib/vue",
      };
    case ".py":
      return {
        language: "python",
        stub: getFeatureFlagDocs("python"),
        docs: "https://docs.growthbook.io/lib/python",
      };
    case ".go":
      return {
        language: "go",
        stub: getFeatureFlagDocs("go"),
        docs: "https://docs.growthbook.io/lib/go",
      };
    case ".php":
      return {
        language: "php",
        stub: getFeatureFlagDocs("php"),
        docs: "https://docs.growthbook.io/lib/php",
      };
    case ".rb":
      return {
        language: "ruby",
        stub: getFeatureFlagDocs("ruby"),
        docs: "https://docs.growthbook.io/lib/ruby",
      };
    case ".java":
      return {
        language: "java",
        stub: getFeatureFlagDocs("java"),
        docs: "https://docs.growthbook.io/lib/java",
      };
    case ".cs":
      return {
        language: "csharp",
        stub: getFeatureFlagDocs("csharp"),
        docs: "https://docs.growthbook.io/lib/csharp",
      };
    case ".swift":
      return {
        language: "swift",
        stub: getFeatureFlagDocs("swift"),
        docs: "https://docs.growthbook.io/lib/swift",
      };
    case ".ex":
    case ".exs":
      return {
        language: "elixir",
        stub: getFeatureFlagDocs("elixir"),
        docs: "https://docs.growthbook.io/lib/elixir",
      };
    case ".kt":
    case ".kts":
    case ".ktm":
      return {
        language: "kotlin",
        stub: getFeatureFlagDocs("kotlin"),
        docs: "https://docs.growthbook.io/lib/kotlin",
      };
    case ".dart":
      return {
        language: "flutter",
        stub: getFeatureFlagDocs("flutter"),
        docs: "https://docs.growthbook.io/lib/flutter",
      };
    default:
      return {
        language: "unknown",
        stub: getFeatureFlagDocs("unknown"),
        docs: "https://docs.growthbook.io/lib/",
      };
  }
}

export async function searchGrowthBookDocs(query: string) {
  const APPLICATION_ID = "MN7ZMY63CG";
  const API_KEY = "e17ebcbd97bce29ad0bdec269770e9df";
  const INDEX_NAME = "growthbook";
  const url = `https://${APPLICATION_ID}-dsn.algolia.net/1/indexes/${INDEX_NAME}/query`;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "X-Algolia-API-Key": API_KEY,
        "X-Algolia-Application-Id": APPLICATION_ID,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        attributesToSnippet: ["content:20", "text:20"],
        snippetEllipsisText: "...",
        hitsPerPage: 5,
      }),
    });

    await handleResNotOk(response);

    const data = await response.json();
    const hits = data.hits || [];

    return hits;
  } catch (error) {
    return [];
  }
}

export function generateLinkToGrowthBook(
  appOrigin: string,
  resource:
    | "features"
    | "experiment"
    | "attribute"
    | "environment"
    | "project"
    | "sdk-connection"
    | "metric"
    | "fact-metrics",
  id: string
) {
  return `${appOrigin}/${resource}/${id}`;
}

// Reusable pagination schema for GrowthBook API tools
export const paginationSchema = {
  limit: z
    .number()
    .min(1)
    .max(100)
    .default(100)
    .describe("The number of items to fetch (1-100)"),
  offset: z
    .number()
    .min(0)
    .default(0)
    .describe(
      "The number of items to skip. For example, set to 100 to fetch the second page with default limit. Note: The API returns items in chronological order (oldest first) by default."
    ),
  mostRecent: z
    .boolean()
    .default(false)
    .describe(
      "When true, fetches the most recent items and returns them newest-first. When false (default), returns oldest items first."
    ),
} as const;

export const featureFlagSchema = {
  id: z
    .string()
    .regex(
      /^[a-zA-Z0-9_.:|_-]+$/,
      "Feature key can only include letters, numbers, and the characters _, -, ., :, and |"
    )
    .describe("A unique key name for the feature"),
  valueType: z
    .enum(["string", "number", "boolean", "json"])
    .describe("The value type the feature flag will return"),
  defaultValue: z.string().describe("The default value of the feature flag"),
  description: z.string().describe("A brief description of the feature flag"),
  archived: z.boolean().describe("Whether the feature flag should be archived"),
  project: z
    .string()
    .describe("The ID of the project to which the feature flag belongs"),
  // Contextual info
  fileExtension: z
    .enum(SUPPORTED_FILE_EXTENSIONS)
    .describe(
      "The extension of the current file. If it's unclear, ask the user."
    ),
} as const;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
const MIN_DELAY_MS = 50;

export async function fetchWithRateLimit(
  url: string,
  options: RequestInit,
  retries = 3
): Promise<Response> {
  // Small courtesy delay to avoid hammering
  await sleep(MIN_DELAY_MS);

  const response = await fetch(url, options);

  // If rate limited, wait and retry
  if (response.status === 429 && retries > 0) {
    const resetSeconds = parseInt(
      response.headers.get("RateLimit-Reset") || "5",
      10
    );
    console.error(
      `Rate limited, waiting ${resetSeconds}s (${retries} retries left)`
    );
    await sleep(resetSeconds * 1000);
    return fetchWithRateLimit(url, options, retries - 1);
  }

  return response;
}
