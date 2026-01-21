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

// Algolia search result types
export interface AlgoliaHit {
  objectID: string;
  title?: string;
  content?: string;
  text?: string;
  url?: string;
  anchor?: string;
  hierarchy?: {
    lvl0?: string;
    lvl1?: string;
    lvl2?: string;
    lvl3?: string;
    lvl4?: string;
    lvl5?: string;
    lvl6?: string;
  };
  _snippetResult?: {
    content?: { value: string; matchLevel: string };
    text?: { value: string; matchLevel: string };
  };
  _highlightResult?: {
    content?: { value: string; matchLevel: string };
    text?: { value: string; matchLevel: string };
    title?: { value: string; matchLevel: string };
  };
  _rankingInfo?: {
    promoted: boolean;
    nbTypos: number;
    firstMatchedWord: number;
    proximityDistance?: number;
    geoDistance?: number;
    geoPrecision?: number;
    nbExactWords: number;
    words: number;
    filters: number;
    userScore: number;
    matchedGeoLocation?: {
      lat: number;
      lng: number;
      distance: number;
    };
  };
}

export interface AlgoliaSearchResponse {
  hits: AlgoliaHit[];
  nbHits: number;
  page: number;
  nbPages: number;
  hitsPerPage: number;
  processingTimeMS: number;
  query: string;
  params: string;
}

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  content?: string;
  hierarchy?: string[];
  relevance?: {
    score: number;
    typos: number;
    matchedWords: number;
  };
}

export async function searchGrowthBookDocs(
  query: string,
  options?: {
    hitsPerPage?: number;
    attributesToSnippet?: string[];
    attributesToHighlight?: string[];
  }
): Promise<SearchResult[]> {
  const APPLICATION_ID = "MN7ZMY63CG";
  const API_KEY = "e17ebcbd97bce29ad0bdec269770e9df";
  const INDEX_NAME = "growthbook";
  const url = `https://${APPLICATION_ID}-dsn.algolia.net/1/indexes/${INDEX_NAME}/query`;

  const hitsPerPage = options?.hitsPerPage ?? 5;
  // Increased snippet length for more context (50 words instead of 30)
  const attributesToSnippet = options?.attributesToSnippet ?? [
    "content:50",
    "text:50",
  ];
  const attributesToHighlight = options?.attributesToHighlight ?? [
    "title",
    "content",
    "text",
  ];

  try {
    const response = await fetchWithRateLimit(url, {
      method: "POST",
      headers: {
        "X-Algolia-API-Key": API_KEY,
        "X-Algolia-Application-Id": APPLICATION_ID,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        attributesToSnippet,
        attributesToHighlight,
        // Retrieve all useful attributes for better context
        attributesToRetrieve: [
          "title",
          "content",
          "text",
          "url",
          "anchor",
          "hierarchy",
        ],
        snippetEllipsisText: "...",
        hitsPerPage,
        getRankingInfo: true,
        distinct: true, // Avoid duplicate results
        typoTolerance: true,
        // Better typo handling for technical terms
        minWordSizefor1Typo: 4,
        minWordSizefor2Typos: 8,
        // Enable advanced query syntax for better matching
        advancedSyntax: true,
        // Remove stop words only if no results, keep them otherwise for better context
        removeWordsIfNoResults: "allOptional",
        // Enable prefix matching for better partial matches
        queryType: "prefixLast",
        // Enable word proximity for better phrase matching
        enableRules: true,
        // Better handling of special characters in technical docs
        allowTyposOnNumericTokens: false,
      }),
    });

    await handleResNotOk(response);

    const data = (await response.json()) as AlgoliaSearchResponse;
    const hits = data.hits || [];

    return hits.map((hit): SearchResult => {
      // Extract title from various possible fields (prefer highlighted)
      const title =
        hit._highlightResult?.title?.value ||
        hit.title ||
        hit.hierarchy?.lvl0 ||
        hit.hierarchy?.lvl1 ||
        "Untitled";

      // Build comprehensive snippet from multiple sources
      // Prioritize snippets that contain query matches, then highlights, then raw content
      const snippetParts: string[] = [];

      // Add content snippet (most relevant, contains query matches)
      if (hit._snippetResult?.content?.value) {
        snippetParts.push(hit._snippetResult.content.value);
      }
      // Add text snippet if different from content
      if (
        hit._snippetResult?.text?.value &&
        hit._snippetResult.text.value !== hit._snippetResult?.content?.value
      ) {
        snippetParts.push(hit._snippetResult.text.value);
      }
      // Add highlighted content for additional context
      if (
        hit._highlightResult?.content?.value &&
        !snippetParts.some((s) =>
          s.includes(hit._highlightResult!.content!.value)
        )
      ) {
        const highlighted = hit._highlightResult.content.value;
        // Only add if it adds new information
        if (!snippetParts.some((s) => s === highlighted)) {
          snippetParts.push(highlighted);
        }
      }
      // Add highlighted text if different
      if (
        hit._highlightResult?.text?.value &&
        hit._highlightResult.text.value !== hit._highlightResult?.content?.value
      ) {
        const highlighted = hit._highlightResult.text.value;
        if (!snippetParts.some((s) => s === highlighted)) {
          snippetParts.push(highlighted);
        }
      }

      // Combine snippets intelligently, removing duplicates and overlaps
      let combinedSnippet = "";
      if (snippetParts.length > 0) {
        // Join with separator, but avoid repetition
        combinedSnippet = snippetParts
          .filter((part, idx, arr) => {
            // Remove duplicates
            return arr.indexOf(part) === idx;
          })
          .join(" ... ");
      } else {
        // Fallback to raw content if no snippets available
        const rawContent = hit.content || hit.text || "";
        combinedSnippet = rawContent.substring(0, 300);
        if (rawContent.length > 300) {
          combinedSnippet += "...";
        }
      }

      // Build URL (handle both full URLs and anchors)
      let url = hit.url || "";
      if (hit.anchor && !url.includes("#")) {
        url = url ? `${url}#${hit.anchor}` : `#${hit.anchor}`;
      }

      // Extract hierarchy path (breadcrumb)
      const hierarchy: string[] = [];
      if (hit.hierarchy) {
        for (let i = 0; i <= 6; i++) {
          const level = hit.hierarchy[`lvl${i}` as keyof typeof hit.hierarchy];
          if (level && !hierarchy.includes(level)) {
            hierarchy.push(level);
          }
        }
      }

      // Extract relevance information
      const relevance = hit._rankingInfo
        ? {
            score: hit._rankingInfo.userScore,
            typos: hit._rankingInfo.nbTypos,
            matchedWords: hit._rankingInfo.nbExactWords,
          }
        : undefined;

      return {
        title: title.trim(),
        url: url.trim() || "#",
        snippet: combinedSnippet.trim(),
        content: hit.content || hit.text,
        hierarchy: hierarchy.length > 0 ? hierarchy : undefined,
        relevance,
      };
    });
  } catch (error) {
    // Log error but don't throw - return empty array to allow graceful degradation
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Error searching GrowthBook docs: ${errorMessage}`);
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

export async function fetchWithPagination(
  baseApiUrl: string,
  apiKey: string,
  endpoint: string,
  limit: number,
  offset: number,
  mostRecent: boolean,
  additionalParams?: Record<string, string>
): Promise<any> {
  // Default behavior: use provided limit and offset
  if (!mostRecent || offset > 0) {
    const queryParams = new URLSearchParams({
      limit: limit.toString(),
      offset: offset.toString(),
    });

    // Add any additional query parameters
    if (additionalParams) {
      Object.entries(additionalParams).forEach(([key, value]) => {
        if (value) {
          queryParams.append(key, value);
        }
      });
    }

    const res = await fetchWithRateLimit(
      `${baseApiUrl}${endpoint}?${queryParams.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    await handleResNotOk(res);
    return await res.json();
  }

  // Most recent behavior: fetch total count first, then calculate offset
  const countRes = await fetchWithRateLimit(
    `${baseApiUrl}${endpoint}?limit=1`,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    }
  );

  await handleResNotOk(countRes);
  const countData = await countRes.json();
  const total = countData.total;
  const calculatedOffset = Math.max(0, total - limit);

  const mostRecentQueryParams = new URLSearchParams({
    limit: limit.toString(),
    offset: calculatedOffset.toString(),
  });

  // Add any additional query parameters
  if (additionalParams) {
    Object.entries(additionalParams).forEach(([key, value]) => {
      if (value) {
        mostRecentQueryParams.append(key, value);
      }
    });
  }

  const mostRecentRes = await fetchWithRateLimit(
    `${baseApiUrl}${endpoint}?${mostRecentQueryParams.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    }
  );

  await handleResNotOk(mostRecentRes);
  return await mostRecentRes.json();
}
