import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// Helper to create mock Response objects
function makeResponse(opts: {
  ok: boolean;
  status: number;
  statusText?: string;
  json?: any;
  text?: string;
  headers?: Record<string, string>;
}): Response {
  const headers = new Headers(opts.headers ?? {});
  return {
    ok: opts.ok,
    status: opts.status,
    statusText: opts.statusText ?? "",
    headers,
    json: async () => opts.json,
    text: async () => opts.text ?? JSON.stringify(opts.json ?? {}),
  } as any as Response;
}

// Helper to extract the body from a fetch call
function getRequestBody(fetchMock: ReturnType<typeof vi.fn>, callIndex: number): any {
  const call = fetchMock.mock.calls[callIndex];
  if (!call) return null;
  const options = call[1] as RequestInit;
  return options?.body ? JSON.parse(options.body as string) : null;
}

// Helper to get the URL from a fetch call
function getRequestUrl(fetchMock: ReturnType<typeof vi.fn>, callIndex: number): string {
  const call = fetchMock.mock.calls[callIndex];
  return call?.[0] ?? "";
}

describe("create_experiment payload building", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe("hashAttribute parameter", () => {
    it("includes hashAttribute in experiment payload when provided", async () => {
      const cfgDir = "/tmp/gb-mcp-hash-1";
      const experimentDefaultsFile = `${cfgDir}/experiment-defaults.json`;
      const userDefaultsFile = `${cfgDir}/user-defaults.json`;

      // Mock env-paths
      vi.doMock("env-paths", () => ({
        default: () => ({ config: cfgDir }),
      }));

      // Mock fs/promises
      vi.doMock("fs/promises", () => ({
        readFile: vi.fn(async () => {
          return JSON.stringify({
            datasource: "ds_1",
            assignmentQuery: "aq_1",
            environments: ["production", "staging"],
            filePaths: { experimentDefaultsFile, userDefaultsFile },
            timestamp: new Date().toISOString(),
          });
        }),
        writeFile: vi.fn(async () => {}),
        mkdir: vi.fn(async () => {}),
        unlink: vi.fn(async () => {}),
      }));

      // Track fetch calls
      const fetchSpy = vi.fn()
        // First call: create experiment
        .mockResolvedValueOnce(
          makeResponse({
            ok: true,
            status: 200,
            json: {
              experiment: {
                id: "exp_123",
                variations: [
                  { variationId: "var_0" },
                  { variationId: "var_1" },
                ],
              },
            },
          })
        );
      vi.stubGlobal("fetch", fetchSpy);

      // Import and test - this will be the actual tool handler
      // For now, we test the payload construction logic
      const { buildExperimentPayload } = await import(
        "../../../src/tools/experiments/experiments.js"
      );

      const payload = buildExperimentPayload({
        name: "Test Experiment",
        hashAttribute: "userId",
        user: "test@example.com",
        experimentDefaults: {
          datasource: "ds_1",
          assignmentQuery: "aq_1",
        },
      });

      expect(payload).toHaveProperty("hashAttribute", "userId");
    });

    it("does NOT include hashAttribute when omitted (backward compatible)", async () => {
      const { buildExperimentPayload } = await import(
        "../../../src/tools/experiments/experiments.js"
      );

      const payload = buildExperimentPayload({
        name: "Test Experiment",
        // hashAttribute NOT provided
        user: "test@example.com",
        experimentDefaults: {
          datasource: "ds_1",
          assignmentQuery: "aq_1",
        },
      });

      expect(payload).not.toHaveProperty("hashAttribute");
    });
  });

  describe("trackingKey parameter", () => {
    it("uses provided trackingKey in experiment payload", async () => {
      const { buildExperimentPayload } = await import(
        "../../../src/tools/experiments/experiments.js"
      );

      const payload = buildExperimentPayload({
        name: "Test Experiment",
        trackingKey: "my-custom-key",
        user: "test@example.com",
        experimentDefaults: {
          datasource: "ds_1",
          assignmentQuery: "aq_1",
        },
      });

      expect(payload.trackingKey).toBe("my-custom-key");
    });

    it("auto-generates trackingKey from name when omitted (backward compatible)", async () => {
      const { buildExperimentPayload } = await import(
        "../../../src/tools/experiments/experiments.js"
      );

      const payload = buildExperimentPayload({
        name: "My Test Experiment",
        // trackingKey NOT provided
        user: "test@example.com",
        experimentDefaults: {
          datasource: "ds_1",
          assignmentQuery: "aq_1",
        },
      });

      expect(payload.trackingKey).toBe("my-test-experiment");
    });

    it("handles special characters in name when auto-generating trackingKey", async () => {
      const { buildExperimentPayload } = await import(
        "../../../src/tools/experiments/experiments.js"
      );

      const payload = buildExperimentPayload({
        name: "PEN-1234: Test & Verify!",
        user: "test@example.com",
        experimentDefaults: {},
      });

      expect(payload.trackingKey).toBe("pen-1234--test---verify-");
    });
  });

  describe("enabledEnvironments parameter", () => {
    it("only adds rule to specified environments", async () => {
      const { buildFeatureFlagPayload } = await import(
        "../../../src/tools/experiments/experiments.js"
      );

      const existingFeature = {
        environments: {
          production: { enabled: true, rules: [] },
          staging: { enabled: true, rules: [{ type: "force", value: "old" }] },
          development: { enabled: false, rules: [] },
        },
      };

      const newRule = {
        type: "experiment-ref",
        experimentId: "exp_123",
        variations: [],
      };

      const payload = buildFeatureFlagPayload({
        existingFeature,
        newRule,
        enabledEnvironments: ["production"], // Only production
        defaultEnvironments: ["production", "staging", "development"],
      });

      // Production should have the new rule
      expect(payload.environments.production.rules).toHaveLength(1);
      expect(payload.environments.production.rules[0].type).toBe("experiment-ref");

      // Staging should preserve existing rule, NOT add new one
      expect(payload.environments.staging.rules).toHaveLength(1);
      expect(payload.environments.staging.rules[0].type).toBe("force");

      // Development should be preserved as-is
      expect(payload.environments.development.rules).toHaveLength(0);
    });

    it("adds rule to all default environments when omitted (backward compatible)", async () => {
      const { buildFeatureFlagPayload } = await import(
        "../../../src/tools/experiments/experiments.js"
      );

      const existingFeature = {
        environments: {
          production: { enabled: true, rules: [] },
          staging: { enabled: true, rules: [] },
        },
      };

      const newRule = {
        type: "experiment-ref",
        experimentId: "exp_123",
        variations: [],
      };

      const payload = buildFeatureFlagPayload({
        existingFeature,
        newRule,
        // enabledEnvironments NOT provided - should use defaultEnvironments
        defaultEnvironments: ["production", "staging"],
      });

      // Both environments should have the new rule
      expect(payload.environments.production.rules).toHaveLength(1);
      expect(payload.environments.staging.rules).toHaveLength(1);
    });
  });

  describe("environmentConditions parameter", () => {
    it("adds condition to specified environments", async () => {
      const { buildFeatureFlagPayload } = await import(
        "../../../src/tools/experiments/experiments.js"
      );

      const existingFeature = {
        environments: {
          production: { enabled: true, rules: [] },
          staging: { enabled: true, rules: [] },
        },
      };

      const newRule = {
        type: "experiment-ref",
        experimentId: "exp_123",
        variations: [],
      };

      const payload = buildFeatureFlagPayload({
        existingFeature,
        newRule,
        defaultEnvironments: ["production", "staging"],
        environmentConditions: {
          production: '{"is_test_user": true}',
          // staging has no condition
        },
      });

      // Production rule should have condition
      expect(payload.environments.production.rules[0]).toHaveProperty(
        "condition",
        '{"is_test_user": true}'
      );

      // Staging rule should NOT have condition
      expect(payload.environments.staging.rules[0]).not.toHaveProperty("condition");
    });

    it("adds no conditions when omitted (backward compatible)", async () => {
      const { buildFeatureFlagPayload } = await import(
        "../../../src/tools/experiments/experiments.js"
      );

      const existingFeature = {
        environments: {
          production: { enabled: true, rules: [] },
          staging: { enabled: true, rules: [] },
        },
      };

      const newRule = {
        type: "experiment-ref",
        experimentId: "exp_123",
        variations: [],
      };

      const payload = buildFeatureFlagPayload({
        existingFeature,
        newRule,
        defaultEnvironments: ["production", "staging"],
        // environmentConditions NOT provided
      });

      // No rules should have conditions
      expect(payload.environments.production.rules[0]).not.toHaveProperty("condition");
      expect(payload.environments.staging.rules[0]).not.toHaveProperty("condition");
    });
  });

  describe("backward compatibility", () => {
    it("produces identical experiment payload when all new params are omitted", async () => {
      const { buildExperimentPayload } = await import(
        "../../../src/tools/experiments/experiments.js"
      );

      const payload = buildExperimentPayload({
        name: "Test Experiment",
        description: "A test",
        hypothesis: "Testing hypothesis",
        user: "test@example.com",
        project: "proj_123",
        experimentDefaults: {
          datasource: "ds_1",
          assignmentQuery: "aq_1",
        },
        variations: [
          { name: "Control" },
          { name: "Variant" },
        ],
      });

      // Verify structure matches current behavior
      expect(payload).toEqual({
        name: "Test Experiment",
        description: "A test",
        hypothesis: "Testing hypothesis",
        owner: "test@example.com",
        trackingKey: "test-experiment", // auto-generated
        tags: ["mcp"],
        datasourceId: "ds_1",
        assignmentQueryId: "aq_1",
        project: "proj_123",
        variations: [
          { key: "0", name: "Control" },
          { key: "1", name: "Variant" },
        ],
      });

      // hashAttribute should NOT be present
      expect(payload).not.toHaveProperty("hashAttribute");
    });

    it("preserves existing feature flag rules when adding experiment rule", async () => {
      const { buildFeatureFlagPayload } = await import(
        "../../../src/tools/experiments/experiments.js"
      );

      const existingFeature = {
        environments: {
          production: {
            enabled: true,
            rules: [
              { type: "force", value: "existing-value", description: "Existing rule" },
            ],
          },
          staging: { enabled: false, rules: [] },
        },
      };

      const newRule = {
        type: "experiment-ref",
        experimentId: "exp_123",
        variations: [],
      };

      const payload = buildFeatureFlagPayload({
        existingFeature,
        newRule,
        defaultEnvironments: ["production", "staging"],
      });

      // Production should have BOTH rules (existing + new)
      expect(payload.environments.production.rules).toHaveLength(2);
      expect(payload.environments.production.rules[0].type).toBe("force");
      expect(payload.environments.production.rules[1].type).toBe("experiment-ref");

      // Production should preserve other properties
      expect(payload.environments.production.enabled).toBe(true);
    });
  });

  describe("combined parameters", () => {
    it("works with all new parameters together", async () => {
      vi.resetModules();

      const { buildExperimentPayload, buildFeatureFlagPayload } = await import(
        "../../../src/tools/experiments/experiments.js"
      );

      // Test experiment payload with hashAttribute and trackingKey
      const experimentPayload = buildExperimentPayload({
        name: "Homepage Hero Test",
        hashAttribute: "userId",
        trackingKey: "homepage-hero-jan-2026",
        user: "test@example.com",
        experimentDefaults: {
          datasource: "ds_1",
          assignmentQuery: "aq_1",
        },
      });

      expect(experimentPayload.hashAttribute).toBe("userId");
      expect(experimentPayload.trackingKey).toBe("homepage-hero-jan-2026");

      // Test feature flag payload with enabledEnvironments and environmentConditions
      const existingFeature = {
        environments: {
          production: { enabled: true, rules: [] },
          staging: { enabled: true, rules: [] },
          development: { enabled: false, rules: [] },
        },
      };

      const newRule = {
        type: "experiment-ref",
        experimentId: "exp_123",
        variations: [],
      };

      const flagPayload = buildFeatureFlagPayload({
        existingFeature,
        newRule,
        enabledEnvironments: ["production", "staging"],
        defaultEnvironments: ["production", "staging", "development"],
        environmentConditions: {
          production: '{"is_test_user": true}',
        },
      });

      // Only production and staging should have the rule
      expect(flagPayload.environments.production.rules).toHaveLength(1);
      expect(flagPayload.environments.staging.rules).toHaveLength(1);
      expect(flagPayload.environments.development.rules).toHaveLength(0);

      // Only production should have the condition
      expect(flagPayload.environments.production.rules[0].condition).toBe(
        '{"is_test_user": true}'
      );
      expect(flagPayload.environments.staging.rules[0]).not.toHaveProperty("condition");
    });
  });
});
