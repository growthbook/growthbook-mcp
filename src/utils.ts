import { getFeatureFlagDocs } from "./docs.js";

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

export function getUser() {
  const user = process.env.GB_USER;
  if (!user) {
    throw new Error("GB_USER environment variable is required");
  }
  return user;
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
      body: JSON.stringify({ query }),
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
    | "sdk-connection",
  id: string
) {
  return `${appOrigin}/${resource}/${id}`;
}
