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
