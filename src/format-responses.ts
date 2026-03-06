import { formatList, generateLinkToGrowthBook } from "./utils.js";
import type { MetricLookup } from "./tools/experiments/summary-logic.js";
import type {
  ListSdkConnectionsResponse,
  ListProjectsResponse,
  ListEnvironmentsResponse,
  ListAttributesResponse,
  ListFeaturesResponse,
  GetFeatureResponse,
  CreateFeatureResponse,
  UpdateFeatureResponse,
  ListExperimentsResponse,
  GetExperimentResponse,
  PostExperimentResponse,
  ListMetricsResponse,
  ListFactMetricsResponse,
  GetMetricResponse,
  GetFactMetricResponse,
  Feature,
  GetStaleFeatureResponse,
} from "./api-type-helpers.js";

// Helper to resolve a metric ID to a display name using an optional lookup
function resolveMetric(metricId: string, metricLookup?: MetricLookup): string {
  if (!metricLookup) return `\`${metricId}\``;
  const info = metricLookup.get(metricId);
  if (!info) return `\`${metricId}\``;
  const inverse = info.inverse ? " (inverse)" : "";
  return `**${info.name}** (\`${metricId}\`, ${info.type}${inverse})`;
}

function resolveMetricList(
  metrics: { metricId: string }[] | undefined,
  metricLookup?: MetricLookup
): string {
  if (!metrics?.length) return "none";
  return metrics.map((g) => resolveMetric(g.metricId, metricLookup)).join(", ");
}

// ─── Projects ───────────────────────────────────────────────────────
export function formatProjects(data: ListProjectsResponse): string {
  const projects = data.projects || [];
  if (projects.length === 0) {
    return "No projects found. Features and experiments will be created without a project scope.";
  }

  const lines = projects.map((p) => {
    const parts = [`- **${p.name}** (id: \`${p.id}\`)`];
    if (p.description) parts.push(`  ${p.description}`);
    return parts.join("\n");
  });

  return [
    `**${projects.length} project(s):**`,
    "",
    ...lines,
    "",
    `Use the \`id\` value when creating feature flags or experiments scoped to a project.`,
  ].join("\n");
}

// ─── Environments ───────────────────────────────────────────────────
export function formatEnvironments(data: ListEnvironmentsResponse): string {
  const environments = data.environments || [];
  if (environments.length === 0) {
    return "No environments found. At least one environment (production) should exist.";
  }

  const lines = environments.map((e) => {
    const parts = [`- **${e.id}**`];
    if (e.description) parts.push(`: ${e.description}`);
    if (e.toggleOnList) parts.push(" (toggle on by default)");
    if (e.defaultState === false) parts.push(" (disabled by default)");
    return parts.join("");
  });

  return [`**${environments.length} environment(s):**`, "", ...lines].join(
    "\n"
  );
}

// ─── Attributes ─────────────────────────────────────────────────────
export function formatAttributes(data: ListAttributesResponse): string {
  const attributes = data.attributes || [];
  if (attributes.length === 0) {
    return "No targeting attributes configured. Attributes (like country, plan, userId) must be set up in GrowthBook before they can be used in targeting conditions.";
  }

  const lines = attributes.map((a) => {
    return `- **${a.property}** (${a.datatype}${
      a.hashAttribute ? ", hash attribute" : ""
    })`;
  });

  return [
    `**${attributes.length} attribute(s) available for targeting:**`,
    "",
    ...lines,
    "",
    `These can be used in targeting conditions (e.g. \`{"${attributes[0]?.property}": "value"}\`).`,
  ].join("\n");
}

// ─── SDK Connections ────────────────────────────────────────────────
export function formatSdkConnections(data: ListSdkConnectionsResponse): string {
  const connections = data.connections || [];
  if (connections.length === 0) {
    return "No SDK connections found. Use create_sdk_connection to create one for your app.";
  }

  const lines = connections.map((c) => {
    return `**${c.name}**:
  - Languages: ${formatList(c.languages)}
  - Environment: ${c.environment}
  - Client Key: \`${c.key}\`
  - Projects: ${formatList(c.projects || [])}`;
  });

  return [`**${connections.length} SDK connection(s):**`, "", ...lines].join(
    "\n"
  );
}

// ─── Feature Flags ──────────────────────────────────────────────────
export function formatFeatureFlagList(data: ListFeaturesResponse): string {
  const features = data.features || [];
  if (features.length === 0) {
    return "No feature flags found. Use create_feature_flag to create one.";
  }

  const lines = features.map((f) => {
    const envStatus = f.environments
      ? Object.entries(f.environments)
          .map(
            ([env, config]) =>
              `${env}: ${config.enabled ? "ON" : "OFF"}${
                config.rules?.length
                  ? ` (${config.rules.length} rule${
                      config.rules.length > 1 ? "s" : ""
                    })`
                  : ""
              }`
          )
          .join(", ")
      : "no environments";
    const archived = f.archived ? " [ARCHIVED]" : "";
    return `- **${f.id}** (${f.valueType}) — default: \`${
      f.defaultValue
    }\`${archived}\n  Environments: ${envStatus}${
      f.project ? `\n  Project: ${f.project}` : ""
    }`;
  });

  const pagination = data.hasMore
    ? `\n\nShowing ${features.length} of ${data.total}. Use offset=${data.nextOffset} to see more.`
    : "";

  return [
    `**${features.length} feature flag(s):**`,
    "",
    ...lines,
    pagination,
  ].join("\n");
}

export function formatFeatureFlagDetail(
  data: GetFeatureResponse,
  appOrigin: string
): string {
  const f = data.feature;
  if (!f) return "Feature flag not found.";

  const formatRule = (r: any, i: number): string => {
    const disabledTag = r.enabled === false ? " [DISABLED]" : "";
    const desc = r.description ? ` — ${r.description}` : "";
    const condition = r.condition ? `\n      Condition: ${r.condition}` : "";
    const savedGroups = r.savedGroupTargeting?.length
      ? `\n      Saved groups: ${r.savedGroupTargeting.map((sg: any) => `${sg.matchType} of [${sg.savedGroups.join(", ")}]`).join("; ")}`
      : "";
    const schedule = r.scheduleRules?.length
      ? `\n      Schedule: ${r.scheduleRules.map((sr: any) => `${sr.enabled ? "enable" : "disable"} at ${sr.timestamp || "immediately"}`).join(", ")}`
      : "";
    const prerequisites = r.prerequisites?.length
      ? `\n      Prerequisites: ${r.prerequisites.map((p: any) => p.id).join(", ")}`
      : "";

    if (r.type === "force") {
      return `    ${i + 1}. Force rule${disabledTag}: value=\`${r.value}\`${desc}${condition}${savedGroups}${schedule}${prerequisites}`;
    }
    if (r.type === "rollout") {
      return `    ${i + 1}. Rollout rule${disabledTag}: value=\`${r.value}\`, coverage=${r.coverage}, hashAttribute=${r.hashAttribute || "id"}${desc}${condition}${savedGroups}${schedule}`;
    }
    if (r.type === "experiment-ref") {
      const variations = r.variations?.length
        ? `\n      Variations: ${r.variations.map((v: any) => `${v.variationId}=\`${v.value}\``).join(", ")}`
        : "";
      return `    ${i + 1}. Experiment rule${disabledTag}: experimentId=\`${r.experimentId}\`${desc}${condition}${variations}${schedule}`;
    }
    if (r.type === "experiment") {
      const trackingKey = r.trackingKey ? `, trackingKey=\`${r.trackingKey}\`` : "";
      const coverage = r.coverage != null ? `, coverage=${r.coverage}` : "";
      return `    ${i + 1}. Inline experiment${disabledTag}${trackingKey}${coverage}${desc}${condition}${savedGroups}${schedule}`;
    }
    if (r.type === "safe-rollout") {
      return `    ${i + 1}. Safe rollout${disabledTag}: status=${r.status || "running"}, control=\`${r.controlValue}\`, variation=\`${r.variationValue}\`${condition}${savedGroups}${prerequisites}`;
    }
    return `    ${i + 1}. ${r.type} rule${disabledTag}${desc}`;
  };

  const envLines = f.environments
    ? Object.entries(f.environments).map(([env, config]) => {
        const status = config.enabled ? "ON" : "OFF";
        const rules = config.rules || [];
        const rulesSummary =
          rules.length > 0
            ? rules.map(formatRule).join("\n")
            : "    (no rules)";
        return `  **${env}**: ${status}\n${rulesSummary}`;
      })
    : [];

  const link = generateLinkToGrowthBook(appOrigin, "features", f.id);
  const archived = f.archived
    ? "\n**This flag is ARCHIVED.** Consider removing it from the codebase."
    : "";
  const tags = f.tags?.length ? `Tags: ${f.tags.join(", ")}` : "";
  const prereqs = f.prerequisites?.length
    ? `Prerequisites: ${f.prerequisites.join(", ")}`
    : "";

  return [
    `**Feature flag: \`${f.id}\`**${archived}`,
    `Type: ${f.valueType} | Default: \`${f.defaultValue}\` | Owner: ${
      f.owner || "unset"
    }${f.project ? ` | Project: ${f.project}` : ""}`,
    f.description ? `Description: ${f.description}` : "",
    tags,
    prereqs,
    "",
    "**Environments:**",
    ...envLines,
    "",
    `[View in GrowthBook](${link})`,
  ]
    .filter(Boolean)
    .join("\n");
}

// ─── Feature Flag Creation / Update ─────────────────────────────────
export function formatFeatureFlagCreated(
  data: CreateFeatureResponse,
  appOrigin: string,
  sdkStub: string,
  language: string,
  docsUrl: string
): string {
  const f = data.feature;
  const id = f?.id || "unknown";
  const link = generateLinkToGrowthBook(appOrigin, "features", id);

  return [
    `**Feature flag \`${id}\` created.**`,
    `[View in GrowthBook](${link})`,
    "",
    "**SDK integration:**",
    sdkStub,
    "",
    `[${language} docs](${docsUrl})`,
  ].join("\n");
}

export function formatForceRuleCreated(
  data: UpdateFeatureResponse,
  appOrigin: string,
  featureId: string,
  sdkStub: string,
  language: string,
  docsUrl: string
): string {
  const link = generateLinkToGrowthBook(appOrigin, "features", featureId);

  return [
    `**Targeting rule added to \`${featureId}\`.**`,
    `[View in GrowthBook](${link})`,
    "",
    "**SDK integration:**",
    sdkStub,
    "",
    `[${language} docs](${docsUrl})`,
  ].join("\n");
}

// ─── Experiments ────────────────────────────────────────────────────
export function formatExperimentList(data: ListExperimentsResponse): string {
  const experiments = data.experiments || [];
  if (experiments.length === 0) {
    return "No experiments found. Use create_experiment to create one.";
  }

  const lines = experiments.map((e) => {
    const status = e.status || "unknown";
    const variations = e.variations
      ? e.variations.map((v: any) => v.name).join(" vs ")
      : "no variations";
    const goalCount = e.settings?.goals?.length || 0;
    return `- **${e.name}** (id: \`${
      e.id
    }\`, status: ${status})\n  Variations: ${variations}${
      goalCount > 0 ? ` | Goals: ${goalCount} metric(s)` : ""
    }${e.project ? ` | Project: ${e.project}` : ""}`;
  });

  const pagination = data.hasMore
    ? `\n\nShowing ${experiments.length} of ${data.total}. Use offset=${data.nextOffset} to see more.`
    : "";

  return [
    `**${experiments.length} experiment(s):**`,
    "",
    ...lines,
    pagination,
  ].join("\n");
}

export function formatExperimentDetail(
  data:
    | (GetExperimentResponse & { result?: unknown })
    | GetExperimentResponse["experiment"],
  appOrigin: string,
  metricLookup?: MetricLookup
): string {
  const e =
    "experiment" in data && data.experiment
      ? data.experiment
      : (data as GetExperimentResponse["experiment"]);
  if (!e?.id) return "Experiment not found.";

  const link = generateLinkToGrowthBook(appOrigin, "experiment", e.id);
  const variations = e.variations
    ? e.variations
        .map((v) => `${v.name} (key: \`${v.key}\`, variationId: \`${v.variationId}\`)`)
        .join(", ")
    : "none";

  const parts: string[] = [
    `**Experiment: ${e.name}** (id: \`${e.id}\`, status: ${e.status}, type: ${e.type || "standard"})`,
  ];

  if (e.archived) parts.push("**This experiment is ARCHIVED.**");
  if (e.hypothesis) parts.push(`Hypothesis: ${e.hypothesis}`);
  if (e.description) parts.push(`Description: ${e.description}`);
  parts.push(`Variations: ${variations}`);
  parts.push(`Goal metrics: ${resolveMetricList(e.settings?.goals, metricLookup)}`);
  const secondary = resolveMetricList(e.settings?.secondaryMetrics, metricLookup);
  if (secondary !== "none") parts.push(`Secondary metrics: ${secondary}`);
  parts.push(`Guardrail metrics: ${resolveMetricList(e.settings?.guardrails, metricLookup)}`);
  if (e.trackingKey) parts.push(`Tracking key: \`${e.trackingKey}\``);
  if (e.hashAttribute) parts.push(`Hash attribute: \`${e.hashAttribute}\``);
  if (e.project) parts.push(`Project: ${e.project}`);
  if (e.owner) parts.push(`Owner: ${e.owner}`);
  if (e.tags?.length) parts.push(`Tags: ${e.tags.join(", ")}`);

  // Linked features
  if (e.linkedFeatures?.length) {
    parts.push(`Linked features: ${e.linkedFeatures.map((f) => `\`${f}\``).join(", ")}`);
  }

  // Result summary (if experiment has concluded)
  if (e.resultSummary) {
    const rs = e.resultSummary;
    parts.push("");
    parts.push("**Result summary:**");
    if (rs.status) parts.push(`  Status: ${rs.status}`);
    if (rs.winner) parts.push(`  Winner: \`${rs.winner}\``);
    if (rs.conclusions) parts.push(`  Conclusions: ${rs.conclusions}`);
    if (rs.releasedVariationId) parts.push(`  Released variation: \`${rs.releasedVariationId}\``);
  }

  // Phases (traffic allocation history)
  if (e.phases?.length) {
    parts.push("");
    parts.push(`**Phases (${e.phases.length}):**`);
    for (const [idx, phase] of e.phases.entries()) {
      const dateRange = `${phase.dateStarted || "?"} → ${phase.dateEnded || "ongoing"}`;
      const traffic = phase.trafficSplit?.length
        ? phase.trafficSplit.map((t) => `${t.variationId}: ${(t.weight * 100).toFixed(0)}%`).join(", ")
        : "even split";
      const coverageStr = phase.coverage != null ? `, coverage: ${(phase.coverage * 100).toFixed(0)}%` : "";
      const targeting = phase.targetingCondition ? `\n    Targeting: ${phase.targetingCondition}` : "";
      parts.push(`  ${idx + 1}. ${phase.name || `Phase ${idx + 1}`} (${dateRange})\n    Traffic: ${traffic}${coverageStr}${targeting}`);
      if (phase.reasonForStopping) parts.push(`    Stopped: ${phase.reasonForStopping}`);
    }
  }

  // Bandit-specific settings
  if (e.type === "multi-armed-bandit") {
    const banditParts: string[] = [];
    if (e.banditScheduleValue) banditParts.push(`schedule: ${e.banditScheduleValue} ${e.banditScheduleUnit || "hours"}`);
    if (e.banditBurnInValue) banditParts.push(`burn-in: ${e.banditBurnInValue} ${e.banditBurnInUnit || "hours"}`);
    if (banditParts.length) parts.push(`Bandit settings: ${banditParts.join(", ")}`);
  }

  parts.push("");
  parts.push(`[View in GrowthBook](${link})`);

  return parts.join("\n");
}

export function formatExperimentCreated(
  experimentData: PostExperimentResponse,
  appOrigin: string,
  sdkStub: string | undefined,
  language: string,
  docsUrl: string
): string {
  const e = experimentData.experiment;
  const link = generateLinkToGrowthBook(appOrigin, "experiment", e.id);
  const variations = e.variations
    ? e.variations
        .map((v) => `${v.name} (variationId: \`${v.variationId}\`)`)
        .join(", ")
    : "none";

  const parts = [
    `**Draft experiment \`${e.name}\` created.** [Review and launch in GrowthBook](${link})`,
    "",
    `Variations: ${variations}`,
    `Tracking key: \`${e.trackingKey}\``,
  ];

  if (sdkStub) {
    parts.push(
      "",
      "**SDK integration:**",
      sdkStub,
      "",
      `[${language} docs](${docsUrl})`
    );
  }

  return parts.join("\n");
}

// ─── Metrics ────────────────────────────────────────────────────────
export function formatMetricsList(
  metricsData: ListMetricsResponse,
  factMetricData: ListFactMetricsResponse
): string {
  const metrics = metricsData.metrics || [];
  const factMetrics = factMetricData.factMetrics || [];

  if (metrics.length === 0 && factMetrics.length === 0) {
    return "No metrics found. Metrics must be created GrowthBook before they can be used in experiments.";
  }

  const parts: string[] = [];

  if (factMetrics.length > 0) {
    parts.push(`**${factMetrics.length} fact metric(s)**:`);
    parts.push("");
    for (const m of factMetrics) {
      const desc = m.description ? ` — ${m.description}` : "";
      parts.push(`- **${m.name}** (id: \`${m.id}\`)${desc}`);
    }
  }

  if (metrics.length > 0) {
    if (parts.length > 0) parts.push("");
    parts.push(`**${metrics.length} legacy metric(s):**`);
    parts.push("");
    for (const m of metrics) {
      const desc = m.description ? ` — ${m.description}` : "";
      const type = m.type ? ` [${m.type}]` : "";
      parts.push(`- **${m.name}** (id: \`${m.id}\`)${type}${desc}`);
    }
  }

  parts.push("");
  parts.push(
    "Use metric `id` values when configuring experiment goals and guardrails. Fact metrics (ids starting with `fact__`) are recommended over legacy metrics."
  );

  return parts.join("\n");
}

export function formatMetricDetail(
  data: {
    metric?: GetMetricResponse["metric"];
    factMetric?: GetFactMetricResponse["factMetric"];
  },
  appOrigin: string
): string {
  const m = data.metric || data.factMetric;
  if (!m) return "Metric not found.";

  const isFactMetric = !!data.factMetric;
  const resource = isFactMetric ? "fact-metrics" : "metric";
  const link = generateLinkToGrowthBook(appOrigin, resource, m.id);

  const metricType = isFactMetric
    ? "fact metric"
    : "type" in m
    ? (m as { type?: string }).type ?? "legacy"
    : "legacy";
  return [
    `**Metric: ${m.name}** (id: \`${m.id}\`, type: ${metricType})`,
    m.description ? `Description: ${m.description}` : "",
    "inverse" in m && (m as { inverse?: boolean }).inverse
      ? "**Inverse metric** — lower is better"
      : "",
    "",
    `[View in GrowthBook](${link})`,
  ]
    .filter(Boolean)
    .join("\n");
}

// ─── Defaults ───────────────────────────────────────────────────────
export function formatDefaults(defaults: any): string {
  const parts: string[] = [];
  parts.push("**Experiment defaults:**");
  parts.push("");

  parts.push(`Datasource: \`${defaults.datasource || "not set"}\``);
  parts.push(`Assignment query: \`${defaults.assignmentQuery || "not set"}\``);
  parts.push(
    `Environments: ${
      defaults.environments?.length
        ? defaults.environments.map((e: string) => `\`${e}\``).join(", ")
        : "none found"
    }`
  );

  if (defaults.name?.length > 0) {
    const recentNames = defaults.name.slice(-5);
    parts.push("");
    parts.push("**Recent experiment naming examples:**");
    for (const name of recentNames) {
      if (name) parts.push(`- ${name}`);
    }
  }

  if (defaults.hypothesis?.length > 0) {
    const recentHypotheses = defaults.hypothesis.filter(Boolean).slice(-3);
    if (recentHypotheses.length > 0) {
      parts.push("");
      parts.push("**Recent hypothesis examples:**");
      for (const h of recentHypotheses) {
        parts.push(`- ${h}`);
      }
    }
  }

  return parts.join("\n");
}

// ─── Stale Features ─────────────────────────────────────────────────

// Common SDK patterns to search for when removing a flag from the codebase
const SDK_PATTERNS = [
  // JS/TS/React
  "isOn",
  "getFeatureValue",
  "useFeatureIsOn",
  "useFeatureValue",
  "evalFeature",
  // Python
  "is_on",
  "get_feature_value",
  // Go / Ruby / other
  "IsOn",
  "GetFeatureValue",
  "feature_is_on",
];

function buildSearchPatterns(flagId: string): string {
  return SDK_PATTERNS.map((fn) => `${fn}("${flagId}")`).join(", ");
}

export function formatStaleFeatureFlags(
  data: GetStaleFeatureResponse,
  requestedIds: string[]
): string {
  const features = data.features || {};
  const foundIds = Object.keys(features);

  if (foundIds.length === 0) {
    return "No features found for the given IDs. Check that the feature IDs are correct and your API key has access.";
  }

  const parts: string[] = [`**${foundIds.length} feature flag(s) checked:**`, ""];

  let staleCount = 0;
  for (const id of requestedIds) {
    const f = features[id];
    if (!f) {
      parts.push(`- **\`${id}\`**: NOT FOUND`);
      continue;
    }

    if (f.neverStale) {
      parts.push(
        `- **\`${f.featureId}\`**: NOT STALE (stale detection disabled)`
      );
      continue;
    }

    if (!f.isStale) {
      parts.push(
        `- **\`${f.featureId}\`**: NOT STALE${f.staleReason ? ` (${f.staleReason})` : ""}`
      );
      continue;
    }

    // ── Stale flag: include replacement guidance ──
    staleCount++;

    const envEntries = f.staleByEnv ? Object.entries(f.staleByEnv) : [];
    const envsWithValues = envEntries.filter(
      ([, e]) => e.evaluatesTo !== undefined
    );

    let replacementValue: string | undefined;
    let envNote: string;

    if (envsWithValues.length === 0) {
      replacementValue = undefined;
      envNote =
        "No deterministic value available — ask the user what the replacement should be.";
    } else {
      const values = new Set(envsWithValues.map(([, e]) => e.evaluatesTo));
      if (values.size === 1) {
        replacementValue = envsWithValues[0][1].evaluatesTo;
        envNote = `All environments agree.`;
      } else {
        // Environments disagree — default to production
        const prod = envsWithValues.find(([env]) => env === "production");
        if (prod) {
          replacementValue = prod[1].evaluatesTo;
          const others = envsWithValues
            .map(([env, e]) => `${env}=\`${e.evaluatesTo}\``)
            .join(", ");
          envNote = `Environments disagree (${others}). Using production value. Confirm with the user if a different environment should be used.`;
        } else {
          replacementValue = envsWithValues[0][1].evaluatesTo;
          const others = envsWithValues
            .map(([env, e]) => `${env}=\`${e.evaluatesTo}\``)
            .join(", ");
          envNote = `Environments disagree (${others}). No production environment found, using ${envsWithValues[0][0]}. Confirm with the user which environment to use.`;
        }
      }
    }

    if (replacementValue !== undefined) {
      parts.push(
        `- **\`${f.featureId}\`**: STALE (${f.staleReason}) — replace with: \`${replacementValue}\``
      );
    } else {
      parts.push(
        `- **\`${f.featureId}\`**: STALE (${f.staleReason}) — needs manual review`
      );
    }
    parts.push(`  ${envNote}`);
    parts.push(`  Search for: ${buildSearchPatterns(id)}`);
    parts.push("");
  }

  // Summary
  const notFound = requestedIds.filter((id) => !features[id]);
  if (notFound.length > 0) {
    parts.push(
      `${notFound.length} flag(s) not found: ${notFound.map((id) => `\`${id}\``).join(", ")}`
    );
  }

  if (staleCount > 0) {
    parts.push(
      `**${staleCount} flag(s) ready for cleanup.** For each stale flag, find usages with the search patterns above, replace the flag check with the resolved value, and remove dead code branches. Confirm changes with the user before modifying files.`
    );
  } else {
    parts.push("No stale flags found. All checked features are active.");
  }

  return parts.join("\n");
}

// ─── Helpful Errors ─────────────────────────────────────────────────
export function formatApiError(
  error: unknown,
  context: string,
  suggestions?: string[]
): string {
  const message = error instanceof Error ? error.message : String(error);

  const parts = [`Error ${context}: ${message}`];

  if (suggestions && suggestions.length > 0) {
    parts.push("");
    parts.push("Suggestions:");
    for (const s of suggestions) {
      parts.push(`- ${s}`);
    }
  }

  return parts.join("\n");
}
