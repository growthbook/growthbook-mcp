import { afterEach } from "vitest";
import { vi } from "vitest";
import { clearBearerCacheForTests } from "../src/api.js";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  clearBearerCacheForTests();
  delete process.env.GB_API_KEY;
  delete process.env.GB_API_URL;
  delete process.env.GB_SKILLS_ENABLED;
  delete process.env.GB_MCP_TRANSPORT;
});
