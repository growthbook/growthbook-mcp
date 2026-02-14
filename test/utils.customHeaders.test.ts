import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getCustomHeaders, buildHeaders } from "../src/utils.js";

describe("Custom HTTP Headers", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment before each test
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe("getCustomHeaders", () => {
    it("should return empty object when no custom headers are set", () => {
      const headers = getCustomHeaders();
      expect(headers).toEqual({});
    });

    it("should parse single custom header with X- prefix", () => {
      process.env.GB_HTTP_HEADER_X_TENANT_ID = "abc123";
      const headers = getCustomHeaders();
      expect(headers).toEqual({
        "X-Tenant-ID": "abc123",
      });
    });

    it("should parse multiple custom headers", () => {
      process.env.GB_HTTP_HEADER_X_TENANT_ID = "abc123";
      process.env.GB_HTTP_HEADER_CF_ACCESS_TOKEN = "abc123";

      const headers = getCustomHeaders();
      expect(headers).toEqual({
        "X-Tenant-ID": "abc123",
        "Cf-Access-Token": "abc123",
      });
    });

    it("should handle header names with single letter parts", () => {
      process.env.GB_HTTP_HEADER_X = "value1";
      const headers = getCustomHeaders();
      expect(headers).toEqual({
        X: "value1",
      });
    });

    it("should handle API and ID in header names", () => {
      process.env.GB_HTTP_HEADER_API_KEY_ID = "key123";
      const headers = getCustomHeaders();
      expect(headers).toEqual({
        "API-Key-ID": "key123",
      });
    });

    it("should ignore empty header values", () => {
      process.env.GB_HTTP_HEADER_EMPTY = "";
      process.env.GB_HTTP_HEADER_VALID = "value";

      const headers = getCustomHeaders();
      expect(headers).toEqual({
        Valid: "value",
      });
    });

    it("should ignore environment variables without GB_HTTP_HEADER_ prefix", () => {
      process.env.CUSTOM_HEADER = "ignored";
      process.env.GB_API_KEY = "also-ignored";
      process.env.GB_HTTP_HEADER_INCLUDED = "included";

      const headers = getCustomHeaders();
      expect(headers).toEqual({
        Included: "included",
      });
    });

    it("should handle lowercase header names correctly", () => {
      process.env.GB_HTTP_HEADER_CONTENT_ENCODING = "gzip";
      const headers = getCustomHeaders();
      expect(headers).toEqual({
        "Content-Encoding": "gzip",
      });
    });

    it("should handle mixed case with underscores", () => {
      process.env.GB_HTTP_HEADER_X_CUSTOM_USER_AGENT = "MyApp/1.0";
      const headers = getCustomHeaders();
      expect(headers).toEqual({
        "X-Custom-User-Agent": "MyApp/1.0",
      });
    });
  });

  describe("buildHeaders", () => {
    it("should build headers with only required headers when no custom headers", () => {
      const headers = buildHeaders("test-api-key");
      expect(headers).toEqual({
        Authorization: "Bearer test-api-key",
        "Content-Type": "application/json",
      });
    });

    it("should build headers without Content-Type when includeContentType is false", () => {
      const headers = buildHeaders("test-api-key", false);
      expect(headers).toEqual({
        Authorization: "Bearer test-api-key",
      });
    });

    it("should merge custom headers with required headers", () => {
      process.env.GB_HTTP_HEADER_X_TENANT_ID = "tenant-123";
      process.env.GB_HTTP_HEADER_CF_ACCESS_TOKEN = "abc123";

      const headers = buildHeaders("test-api-key");
      expect(headers).toEqual({
        "X-Tenant-ID": "tenant-123",
        "Cf-Access-Token": "abc123",
        Authorization: "Bearer test-api-key",
        "Content-Type": "application/json",
      });
    });

    it("should ensure Authorization header always takes precedence", () => {
      // Try to override Authorization with custom header (should not work)
      process.env.GB_HTTP_HEADER_AUTHORIZATION = "BadValue";

      const headers = buildHeaders("correct-api-key");
      // Authorization should be set by buildHeaders, not from custom headers
      expect(headers.Authorization).toBe("Bearer correct-api-key");
    });

    it("should ensure Content-Type header always takes precedence", () => {
      // Try to override Content-Type with custom header (should not work)
      process.env.GB_HTTP_HEADER_CONTENT_TYPE = "text/plain";

      const headers = buildHeaders("test-api-key", true);
      // Content-Type should be application/json from buildHeaders
      expect(headers["Content-Type"]).toBe("application/json");
    });

    it("should allow custom headers with includeContentType false", () => {
      process.env.GB_HTTP_HEADER_X_CUSTOM = "value";

      const headers = buildHeaders("test-api-key", false);
      expect(headers).toEqual({
        "X-Custom": "value",
        Authorization: "Bearer test-api-key",
      });
      expect(headers["Content-Type"]).toBeUndefined();
    });

    it("should handle many custom headers", () => {
      process.env.GB_HTTP_HEADER_X_TENANT_ID = "tenant1";
      process.env.GB_HTTP_HEADER_X_USER_ID = "user1";
      process.env.GB_HTTP_HEADER_X_SESSION_ID = "session1";
      process.env.GB_HTTP_HEADER_CUSTOM_TRACE_ID = "trace1";

      const headers = buildHeaders("api-key");
      expect(Object.keys(headers).length).toBe(6); // 4 custom + Authorization + Content-Type
      expect(headers["X-Tenant-ID"]).toBe("tenant1");
      expect(headers["X-User-ID"]).toBe("user1");
      expect(headers["X-Session-ID"]).toBe("session1");
      expect(headers["Custom-Trace-ID"]).toBe("trace1");
      expect(headers.Authorization).toBe("Bearer api-key");
      expect(headers["Content-Type"]).toBe("application/json");
    });
  });
});
