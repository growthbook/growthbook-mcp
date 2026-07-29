/**
 * Authenticated GrowthBook REST passthrough helpers.
 *
 * Combines:
 * - growthbook-mcp utils: getApiKey/getApiUrl, GB_HTTP_HEADER_*, buildHeaders, fetchWithRateLimit
 * - skills/gb-call: control-char rejection + explainHttpError catalog
 */

import { AsyncLocalStorage } from "node:async_hooks";

const CONTROL_RE = /[\s\x00-\x1f\x7f]/;
const DEFAULT_API_URL = "https://api.growthbook.io";
const MIN_DELAY_MS = 50;
const ALLOWED_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

export type HttpMethod = (typeof ALLOWED_METHODS)[number];

/**
 * Per-request context (HTTP transport).
 * - bearer: OAuth bearer; falls back to GB_API_KEY for stdio.
 */
export const requestAuthStore = new AsyncLocalStorage<{
  bearer?: string;
}>();

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Resolve the credential used for GrowthBook REST calls.
 * Precedence: request bearer (OAuth / HTTP) → GB_API_KEY env (stdio / key mode).
 */
export function resolveCredential(): string {
  const fromRequest = requestAuthStore.getStore()?.bearer;
  if (fromRequest) {
    if (CONTROL_RE.test(fromRequest)) {
      throw new Error(
        "Authorization bearer contains whitespace or control characters."
      );
    }
    return fromRequest;
  }
  return getApiKeyFromEnv();
}

export function getApiKeyFromEnv(): string {
  const apiKey = process.env.GB_API_KEY;
  if (!apiKey) {
    throw new Error(
      "No credentials: provide an OAuth bearer on the HTTP request, or set GB_API_KEY for stdio/key mode."
    );
  }
  if (CONTROL_RE.test(apiKey)) {
    throw new Error(
      "GB_API_KEY contains whitespace or control characters. Set a clean value with no spaces or line breaks."
    );
  }
  return apiKey;
}

/** Prefer resolveCredential(); kept for callers that mean env-or-request. */
export function getApiKey(): string {
  return resolveCredential();
}

export function getApiUrl(): string {
  let userApiUrl = process.env.GB_API_URL;
  userApiUrl = userApiUrl?.trim().replace(/\/+$/, "");
  const apiUrl = userApiUrl || DEFAULT_API_URL;
  if (CONTROL_RE.test(apiUrl)) {
    throw new Error(
      "GrowthBook API base URL contains whitespace or control characters. Set a clean base URL (e.g. https://api.growthbook.io)."
    );
  }
  return apiUrl;
}

/**
 * Authorization Server issuer advertised in protected-resource metadata.
 * Defaults to GB_API_URL (where /.well-known/oauth-authorization-server lives).
 */
export function getOauthIssuer(): string {
  const explicit = process.env.GB_OAUTH_ISSUER?.trim().replace(/\/+$/, "");
  if (explicit) return explicit;
  return getApiUrl();
}

/**
 * Parses custom HTTP headers from environment variables with the prefix GB_HTTP_HEADER_*
 * Converts environment variable names to proper HTTP header format:
 * GB_HTTP_HEADER_X_TENANT_ID -> X-Tenant-ID
 * GB_HTTP_HEADER_CF_ACCESS_TOKEN -> Cf-Access-Token
 */
export function getCustomHeaders(): Record<string, string> {
  const customHeaders: Record<string, string> = {};
  const headerPrefix = "GB_HTTP_HEADER_";

  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith(headerPrefix) && value) {
      const headerNamePart = key.slice(headerPrefix.length);
      const headerName = headerNamePart
        .split("_")
        .map((part) => {
          if (part.length === 1 || part === "API" || part === "ID") {
            return part;
          }
          return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
        })
        .join("-");

      customHeaders[headerName] = value;
    }
  }

  return customHeaders;
}

/**
 * Builds HTTP headers for GrowthBook API requests, merging required headers
 * with any custom headers configured via GB_HTTP_HEADER_* environment variables.
 */
export function buildHeaders(
  apiKey: string,
  includeContentType = true
): Record<string, string> {
  const headers: Record<string, string> = {
    ...getCustomHeaders(),
    Authorization: `Bearer ${apiKey}`,
    Accept: "application/json",
  };

  if (includeContentType) {
    headers["Content-Type"] = "application/json";
  }

  return headers;
}

export async function fetchWithRateLimit(
  url: string,
  options: RequestInit,
  retries = 3
): Promise<Response> {
  await sleep(MIN_DELAY_MS);

  const response = await fetch(url, options);

  if (response.status === 429 && retries > 0) {
    const resetSeconds = parseInt(
      response.headers.get("RateLimit-Reset") || "5",
      10
    );
    await sleep(resetSeconds * 1000);
    return fetchWithRateLimit(url, options, retries - 1);
  }

  return response;
}

/**
 * Translate common HTTP failures into actionable hints.
 * Reworded from gb-call's /growthbook:setup guidance to env-var guidance.
 */
export function explainHttpError(
  status: number,
  statusText: string,
  responseBody: string,
  method: string,
  requestUrl: string
): string {
  const host = (() => {
    try {
      return new URL(requestUrl).host;
    } catch {
      return requestUrl;
    }
  })();
  const isCloud = host === "api.growthbook.io";

  if (status === 401) {
    return (
      `HTTP 401 ${statusText} on ${method} ${requestUrl}\n` +
      `Authentication failed. Your OAuth token or GB_API_KEY may be invalid, expired, or revoked.\n` +
      `If using OAuth, refresh the token. If using a key, update GB_API_KEY and try again.\n` +
      (responseBody ? responseBody + "\n" : "")
    );
  }
  if (status === 403) {
    return (
      `HTTP 403 ${statusText} on ${method} ${requestUrl}\n` +
      `The token is valid but lacks permission for this request. This is a permissions/role\n` +
      `problem, not an expired credential — refreshing the token will not help. Check that the\n` +
      `token's user/role can perform this action, or use a token with the required scope.\n` +
      (responseBody ? responseBody + "\n" : "")
    );
  }
  if (status === 404 && isCloud) {
    return (
      `HTTP 404 on ${method} ${requestUrl}\n` +
      `Got 404 from api.growthbook.io. If you're using a self-hosted GrowthBook instance,\n` +
      `set GB_API_URL to your API base URL (e.g. https://growthbook.example.com).\n` +
      (responseBody ? responseBody + "\n" : "")
    );
  }
  if (status === 429) {
    return (
      `HTTP 429 ${statusText} on ${method} ${requestUrl}\n` +
      `Rate limited (60 requests/minute). Wait a moment and retry.\n` +
      (responseBody ? responseBody + "\n" : "")
    );
  }
  return (
    `HTTP ${status} ${statusText} on ${method} ${requestUrl}\n` +
    (responseBody ? responseBody + "\n" : "")
  );
}

export function normalizeMethod(method: string): HttpMethod {
  const upper = method.toUpperCase();
  if (!(ALLOWED_METHODS as readonly string[]).includes(upper)) {
    throw new Error(
      `Unknown method: ${method}. Allowed: ${ALLOWED_METHODS.join(", ")}`
    );
  }
  return upper as HttpMethod;
}

export function normalizePath(path: string): string {
  if (!path || CONTROL_RE.test(path)) {
    throw new Error(
      "path must be a non-empty API path with no whitespace or control characters (e.g. /api/v1/projects)."
    );
  }
  return path.startsWith("/") ? path : `/${path}`;
}

export interface CallApiArgs {
  method: string;
  path: string;
  body?: string;
}

export interface CallApiResult {
  ok: boolean;
  text: string;
}

/**
 * Make an authenticated GrowthBook API request.
 * Returns raw response body on 2xx; actionable error text on non-2xx.
 */
export async function callApi(args: CallApiArgs): Promise<CallApiResult> {
  const apiKey = resolveCredential();
  const baseApiUrl = getApiUrl();
  const method = normalizeMethod(args.method);
  const path = normalizePath(args.path);
  const url = `${baseApiUrl}${path}`;

  const hasBody =
    args.body !== undefined && args.body !== null && args.body !== "";
  const headers = buildHeaders(apiKey, hasBody);

  let res: Response;
  try {
    res = await fetchWithRateLimit(url, {
      method,
      headers,
      body: hasBody ? args.body : undefined,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, text: `Request failed: ${message}` };
  }

  const text = await res.text();
  if (!res.ok) {
    // Only 401 means the bearer itself is bad. 403 is often a valid token
    // with insufficient permissions — do not force a client refresh loop.
    if (res.status === 401 && requestAuthStore.getStore()?.bearer) {
      invalidateBearerCache(apiKey);
    }
    return {
      ok: false,
      text: explainHttpError(res.status, res.statusText, text, method, url),
    };
  }

  return { ok: true, text };
}

export function areSkillsEnabled(): boolean {
  const raw = process.env.GB_SKILLS_ENABLED;
  if (raw === undefined || raw === "") {
    return true;
  }
  const normalized = raw.trim().toLowerCase();
  return !(
    normalized === "false" ||
    normalized === "0" ||
    normalized === "no" ||
    normalized === "off"
  );
}

export function getTransportMode(): "stdio" | "http" {
  const raw = (process.env.GB_MCP_TRANSPORT || "stdio").trim().toLowerCase();
  return raw === "http" ? "http" : "stdio";
}

/** Positive cache so bursty MCP clients don't double every call against the API. */
const BEARER_VALID_CACHE_TTL_MS = 5_000;
const BEARER_CACHE_MAX_ENTRIES = 1_000;
const bearerValidUntil = new Map<string, number>();

function rememberBearerAccepted(token: string, ttlMs: number): void {
  if (bearerValidUntil.size >= BEARER_CACHE_MAX_ENTRIES) {
    // Drop expired first; if still full, clear (tokens are short-lived anyway).
    const now = Date.now();
    for (const [key, until] of bearerValidUntil) {
      if (until <= now) bearerValidUntil.delete(key);
    }
    if (bearerValidUntil.size >= BEARER_CACHE_MAX_ENTRIES) {
      bearerValidUntil.clear();
    }
  }
  bearerValidUntil.set(token, Date.now() + ttlMs);
}

/**
 * Outcome of probing GrowthBook REST auth for a bearer:
 * - "accepted"    — token is a valid credential (2xx, or 403 = authenticated
 *                   but lacking permission on the probe path)
 * - "invalid"     — token is expired/revoked/invalid (401); client should refresh
 * - "unavailable" — GrowthBook could not answer (429 / 5xx / network), so we
 *                   can't verify the token. Fail closed: do NOT grant access.
 */
export type BearerCheckResult = "accepted" | "invalid" | "unavailable";

/**
 * Probe GrowthBook REST auth for this bearer.
 *
 * Fails closed: only a definite success (2xx) or a 403 (authenticated but
 * permission-denied on the probe path) accepts the token. A 401 is a real
 * rejection (refresh). Anything else — rate limit, 5xx, network — means we
 * couldn't verify, so we report "unavailable" instead of letting the request
 * through on an outage.
 *
 * Used by the HTTP resource server so Cursor gets a real HTTP 401 +
 * WWW-Authenticate on invalid tokens (and can refresh), and a 503 when the
 * token simply can't be verified.
 */
export async function checkBearerWithGrowthBook(
  token: string
): Promise<BearerCheckResult> {
  const cachedUntil = bearerValidUntil.get(token);
  if (cachedUntil !== undefined) {
    if (cachedUntil > Date.now()) {
      return "accepted";
    }
    bearerValidUntil.delete(token);
  }

  const url = `${getApiUrl()}/api/v1/`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: buildHeaders(token, false),
    });
  } catch {
    // Network failure — can't verify. Don't cache; re-probe next request.
    return "unavailable";
  }

  if (res.status === 401) {
    bearerValidUntil.delete(token);
    return "invalid";
  }
  // 403 = token authenticated but lacks permission on the probe path; it's
  // still a valid credential, so accept rather than force a refresh loop.
  if (res.ok || res.status === 403) {
    rememberBearerAccepted(token, BEARER_VALID_CACHE_TTL_MS);
    return "accepted";
  }
  // 429 / 5xx — GrowthBook couldn't answer. Fail closed and don't cache, so we
  // re-probe on the next request once it recovers.
  return "unavailable";
}

/** Drop cached validity (e.g. after an upstream 401 on growthbook_call_api). */
export function invalidateBearerCache(token: string): void {
  bearerValidUntil.delete(token);
}

/** Test helper — clear the bearer validity cache. */
export function clearBearerCacheForTests(): void {
  bearerValidUntil.clear();
}
