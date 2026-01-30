import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getApiUrl, getAppOrigin } from "../src/utils.js";

describe("getApiUrl", () => {
  const originalEnv = process.env.GB_API_URL;

  beforeEach(() => {
    // Reset environment variable before each test
    delete process.env.GB_API_URL;
  });

  afterEach(() => {
    // Restore original environment variable after each test
    if (originalEnv !== undefined) {
      process.env.GB_API_URL = originalEnv;
    } else {
      delete process.env.GB_API_URL;
    }
  });

  it("returns default API URL when GB_API_URL is not set", () => {
    const url = getApiUrl();
    expect(url).toBe("https://api.growthbook.io");
  });

  it("returns custom API URL from GB_API_URL environment variable", () => {
    process.env.GB_API_URL = "https://custom-api.example.com";
    const url = getApiUrl();
    expect(url).toBe("https://custom-api.example.com");
  });

  it("trims whitespace from GB_API_URL", () => {
    process.env.GB_API_URL = "  https://custom-api.example.com  ";
    const url = getApiUrl();
    expect(url).toBe("https://custom-api.example.com");
  });

  it("removes trailing slash from GB_API_URL", () => {
    process.env.GB_API_URL = "https://custom-api.example.com/";
    const url = getApiUrl();
    expect(url).toBe("https://custom-api.example.com");
  });

  it("removes multiple trailing slashes from GB_API_URL", () => {
    process.env.GB_API_URL = "https://custom-api.example.com///";
    const url = getApiUrl();
    expect(url).toBe("https://custom-api.example.com");
  });

  it("handles URL with whitespace and trailing slash", () => {
    process.env.GB_API_URL = "  https://custom-api.example.com/  ";
    const url = getApiUrl();
    expect(url).toBe("https://custom-api.example.com");
  });

  it("handles empty string by using default", () => {
    process.env.GB_API_URL = "";
    const url = getApiUrl();
    expect(url).toBe("https://api.growthbook.io");
  });

  it("handles whitespace-only string by using default", () => {
    process.env.GB_API_URL = "   ";
    const url = getApiUrl();
    expect(url).toBe("https://api.growthbook.io");
  });
});

describe("getAppOrigin", () => {
  const originalEnv = process.env.GB_APP_ORIGIN;

  beforeEach(() => {
    // Reset environment variable before each test
    delete process.env.GB_APP_ORIGIN;
  });

  afterEach(() => {
    // Restore original environment variable after each test
    if (originalEnv !== undefined) {
      process.env.GB_APP_ORIGIN = originalEnv;
    } else {
      delete process.env.GB_APP_ORIGIN;
    }
  });

  it("returns default app origin when GB_APP_ORIGIN is not set", () => {
    const origin = getAppOrigin();
    expect(origin).toBe("https://app.growthbook.io");
  });

  it("returns custom app origin from GB_APP_ORIGIN environment variable", () => {
    process.env.GB_APP_ORIGIN = "https://custom-app.example.com";
    const origin = getAppOrigin();
    expect(origin).toBe("https://custom-app.example.com");
  });

  it("trims whitespace from GB_APP_ORIGIN", () => {
    process.env.GB_APP_ORIGIN = "  https://custom-app.example.com  ";
    const origin = getAppOrigin();
    expect(origin).toBe("https://custom-app.example.com");
  });

  it("removes trailing slash from GB_APP_ORIGIN", () => {
    process.env.GB_APP_ORIGIN = "https://custom-app.example.com/";
    const origin = getAppOrigin();
    expect(origin).toBe("https://custom-app.example.com");
  });

  it("removes multiple trailing slashes from GB_APP_ORIGIN", () => {
    process.env.GB_APP_ORIGIN = "https://custom-app.example.com///";
    const origin = getAppOrigin();
    expect(origin).toBe("https://custom-app.example.com");
  });

  it("handles URL with whitespace and trailing slash", () => {
    process.env.GB_APP_ORIGIN = "  https://custom-app.example.com/  ";
    const origin = getAppOrigin();
    expect(origin).toBe("https://custom-app.example.com");
  });

  it("handles empty string by using default", () => {
    process.env.GB_APP_ORIGIN = "";
    const origin = getAppOrigin();
    expect(origin).toBe("https://app.growthbook.io");
  });

  it("handles whitespace-only string by using default", () => {
    process.env.GB_APP_ORIGIN = "   ";
    const origin = getAppOrigin();
    expect(origin).toBe("https://app.growthbook.io");
  });
});
