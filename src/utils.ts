export async function handleResNotOk(res: Response) {
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
}

export function getApiKey() {
  const apiKey = process.env.GB_API_KEY;
  if (!apiKey) {
    throw new Error("GB_API_KEY environment variable is required");
  }
  return apiKey;
}

export function getApiUrl() {
  const defaultApiUrl = "https://api.growthbook.io/api/v1";
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
        md: "https://raw.githubusercontent.com/growthbook/growthbook/main/docs/docs/lib/react.mdx",
        docs: "https://docs.growthbook.io/lib/react",
      };
    case ".ts":
    case ".js":
      return {
        language: "javascript",
        md: "https://raw.githubusercontent.com/growthbook/growthbook/main/docs/docs/lib/js.mdx",
        docs: "https://docs.growthbook.io/lib/js",
      };
    case ".vue":
      return {
        language: "vue",
        md: "https://raw.githubusercontent.com/growthbook/growthbook/main/docs/docs/lib/vue.mdx",
        docs: "https://docs.growthbook.io/lib/vue",
      };
    case ".py":
      return {
        language: "python",
        md: "https://raw.githubusercontent.com/growthbook/growthbook/main/docs/docs/lib/python.mdx",
        docs: "https://docs.growthbook.io/lib/python",
      };
    case ".go":
      return {
        language: "go",
        md: "https://raw.githubusercontent.com/growthbook/growthbook/main/docs/docs/lib/go.mdx",
        docs: "https://docs.growthbook.io/lib/go",
      };
    case ".php":
      return {
        language: "php",
        md: "https://raw.githubusercontent.com/growthbook/growthbook/main/docs/docs/lib/php.mdx",
        docs: "https://docs.growthbook.io/lib/php",
      };
    case ".rb":
      return {
        language: "ruby",
        md: "https://raw.githubusercontent.com/growthbook/growthbook/main/docs/docs/lib/ruby.mdx",
        docs: "https://docs.growthbook.io/lib/ruby",
      };
    case ".java":
      return {
        language: "java",
        md: "https://raw.githubusercontent.com/growthbook/growthbook/main/docs/docs/lib/java.mdx",
        docs: "https://docs.growthbook.io/lib/java",
      };
    case ".cs":
      return {
        language: "csharp",
        md: "https://raw.githubusercontent.com/growthbook/growthbook/main/docs/docs/lib/csharp.mdx",
        docs: "https://docs.growthbook.io/lib/csharp",
      };
    case ".swift":
      return {
        language: "swift",
        md: "https://raw.githubusercontent.com/growthbook/growthbook/main/docs/docs/lib/swift.mdx",
        docs: "https://docs.growthbook.io/lib/swift",
      };
    case ".ex":
    case ".exs":
      return {
        language: "elixir",
        md: "https://raw.githubusercontent.com/growthbook/growthbook/main/docs/docs/lib/elixir.mdx",
        docs: "https://docs.growthbook.io/lib/elixir",
      };
    case ".kt":
    case ".kts":
    case ".ktm":
      return {
        language: "kotlin",
        md: "https://raw.githubusercontent.com/growthbook/growthbook/main/docs/docs/lib/kotlin.mdx",
        docs: "https://docs.growthbook.io/lib/kotlin",
      };
    case ".dart":
      return {
        language: "flutter",
        md: "https://raw.githubusercontent.com/growthbook/growthbook/main/docs/docs/lib/flutter.mdx",
        docs: "https://docs.growthbook.io/lib/flutter",
      };
    default:
      return {
        language: "unknown",
        md: "https://raw.githubusercontent.com/growthbook/growthbook/main/docs/docs/lib/index.mdx",
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

export async function findImplementationDocs(extension: string) {
  const { md } = getDocsMetadata(extension);
  try {
    const response = await fetch(md);
    await handleResNotOk(response);
    const markdown = await response.text();
    return markdown;
  } catch (error) {
    return "Docs not found";
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
