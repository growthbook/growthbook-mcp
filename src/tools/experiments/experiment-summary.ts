import { fetchWithRateLimit, handleResNotOk, buildHeaders } from "../../utils.js";
import { type Experiment } from "../../types/types.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  computeVerdict,
  formatLift,
  getYearMonth,
  median,
  round,
  type MetricInfo,
  type MetricLookup,
} from "./summary-logic.js";

interface ExperimentCard {
  id: string;
  name: string;
  trackingKey: string;
  hypothesis: string;
  verdict: "won" | "lost" | "inconclusive";
  project: string;
  tags: string[];
  owner: string;
  type: "standard" | "multi-armed-bandit";

  primaryMetric: {
    id: string;
    name: string;
    lift: number | null;
    liftFormatted: string;
    significant: boolean;
    direction: "winning" | "losing" | "flat";
  } | null;

  totalUsers: number;
  durationDays: number | null;
  dateStarted: string | null;
  dateEnded: string | null;

  srmPassing: boolean;
  srmPValue: number | null;
  guardrailsRegressed: boolean;
}

interface ExperimentStats {
  total: number; // Only stopped experiments

  byVerdict: {
    won: number;
    lost: number;
    inconclusive: number;
  };

  // Rates
  winRate: number | null;

  // Duration & scale
  avgDurationDays: number | null;
  medianDurationDays: number | null;
  totalUsers: number;
  avgUsersPerExperiment: number | null;

  // Effect sizes
  avgLiftWinners: number | null;
  medianLiftWinners: number | null;

  // Health
  srmFailureRate: number | null;
  guardrailRegressionRate: number | null;
  srmIssues: Array<{
    id: string;
    name: string;
    srmPValue: number;
  }>;

  // Top performers
  topWinners: Array<{
    id: string;
    name: string;
    lift: number;
    liftFormatted: string;
    metric: string;
    hypothesis: string;
  }>;
  topLosers: Array<{
    id: string;
    name: string;
    lift: number;
    liftFormatted: string;
    metric: string;
    hypothesis: string;
  }>;

  // Breakdowns
  byType: { standard: number; bandit: number };
  byProject: Record<
    string,
    {
      count: number;
      won: number;
      lost: number;
      inconclusive: number;
      winRate: number | null;
    }
  >;
  byTag: Record<
    string,
    {
      count: number;
      won: number;
      lost: number;
      inconclusive: number;
      winRate: number | null;
    }
  >;
  byMonth: Record<
    string,
    {
      ended: number;
      won: number;
      lost: number;
    }
  >;

  // Cards
  experiments: ExperimentCard[];
}
// Metric Lookup with caching
const metricCache = new Map<string, { info: MetricInfo; timestamp: number }>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_CONCURRENT_FETCHES = 10; // Limit concurrent API calls

// Helper to process array in batches with concurrency limit
async function processBatch<T, R>(
  items: T[],
  concurrency: number,
  processor: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(processor));
    results.push(...batchResults);
  }
  return results;
}

async function getMetricLookup(
  baseApiUrl: string,
  apiKey: string,
  metricIds: Set<string>
): Promise<MetricLookup> {
  const metricLookup = new Map<string, MetricInfo>();

  if (metricIds.size === 0) {
    return metricLookup;
  }

  // Check cache first
  const now = Date.now();
  const uncachedMetricIds: string[] = [];
  const factMetricIds: string[] = [];
  const regularMetricIds: string[] = [];

  for (const metricId of metricIds) {
    const cached = metricCache.get(metricId);
    if (cached && now - cached.timestamp < CACHE_TTL_MS) {
      metricLookup.set(metricId, cached.info);
    } else {
      uncachedMetricIds.push(metricId);
      if (metricId.startsWith("fact__")) {
        factMetricIds.push(metricId);
      } else {
        regularMetricIds.push(metricId);
      }
    }
  }

  // If all metrics are cached, return early
  if (uncachedMetricIds.length === 0) {
    return metricLookup;
  }

  try {
    // Fetch regular metrics in batches with concurrency limit
    const regularResults = await processBatch(
      regularMetricIds,
      MAX_CONCURRENT_FETCHES,
      async (metricId) => {
        try {
          const res = await fetchWithRateLimit(
            `${baseApiUrl}/api/v1/metrics/${metricId}`,
            {
              headers: buildHeaders(apiKey),
            }
          );
          await handleResNotOk(res);
          const data = await res.json();
          const info: MetricInfo = {
            id: metricId,
            name: data.name || metricId,
            inverse: data.inverse || false,
            type: data.type || "binomial",
          };
          // Cache the result
          metricCache.set(metricId, { info, timestamp: now });
          return { id: metricId, info };
        } catch (error) {
          console.error(`Error fetching metric ${metricId}:`, error);
          return null;
        }
      }
    );

    // Fetch fact metrics in batches with concurrency limit
    const factResults = await processBatch(
      factMetricIds,
      MAX_CONCURRENT_FETCHES,
      async (metricId) => {
        try {
          const res = await fetchWithRateLimit(
            `${baseApiUrl}/api/v1/fact-metrics/${metricId}`,
            {
              headers: buildHeaders(apiKey),
            }
          );
          await handleResNotOk(res);
          const data = await res.json();
          const info: MetricInfo = {
            id: metricId,
            name: data.name || metricId,
            inverse: false,
            type: "count", // Fact metrics are typically count type
          };
          // Cache the result
          metricCache.set(metricId, { info, timestamp: now });
          return { id: metricId, info };
        } catch (error) {
          console.error(`Error fetching fact metric ${metricId}:`, error);
          return null;
        }
      }
    );

    // Add fetched metrics to lookup
    for (const result of regularResults) {
      if (result) {
        metricLookup.set(result.id, result.info);
      }
    }
    for (const result of factResults) {
      if (result) {
        metricLookup.set(result.id, result.info);
      }
    }
  } catch (error) {
    console.error("Error fetching metrics for lookup:", error);
    // Return partial map if some fetches fail
  }

  return metricLookup;
}

async function buildExperimentStats(
  experiments: Experiment[],
  baseApiUrl: string,
  apiKey: string,
  reportProgress: (progress: number, message?: string) => Promise<void>
): Promise<ExperimentStats> {
  await reportProgress(3, "Figuring out metrics...");

  // Extract all unique metric IDs
  const metricIds = new Set<string>();
  for (const exp of experiments) {
    if (exp.settings?.goals) {
      for (const goal of exp.settings.goals) {
        if (goal.metricId) metricIds.add(goal.metricId);
      }
    }
    if (exp.settings?.guardrails) {
      for (const guardrail of exp.settings.guardrails) {
        if (guardrail.metricId) metricIds.add(guardrail.metricId);
      }
    }
  }

  const metricLookup = await getMetricLookup(baseApiUrl, apiKey, metricIds);

  const cards: ExperimentCard[] = [];
  const byVerdict = { won: 0, lost: 0, inconclusive: 0 };
  const byProject: ExperimentStats["byProject"] = {};
  const byTag: ExperimentStats["byTag"] = {};
  const byMonth: ExperimentStats["byMonth"] = {};
  const byType: { standard: number; bandit: number } = {
    standard: 0,
    bandit: 0,
  };
  const srmIssues: ExperimentStats["srmIssues"] = [];

  const durations: number[] = [];
  const winnerLifts: number[] = [];
  const loserLifts: number[] = [];
  let totalUsers = 0;
  let srmFailures = 0;
  let guardrailRegressions = 0;
  let experimentsWithResults = 0;

  await reportProgress(4, "Computing experiment stats...");

  for (const exp of experiments) {
    const verdictResult = computeVerdict(exp, metricLookup);
    const {
      verdict,
      primaryMetricResult,
      guardrailsRegressed,
      srmPassing,
      srmPValue,
    } = verdictResult;
    const expType = exp.type || "standard";
    // Parse dates
    const dateStarted = exp.result?.dateStart || null;
    const dateEnded = exp.result?.dateEnd || null;
    let durationDays: number | null = null;

    if (dateStarted && dateEnded) {
      const start = new Date(dateStarted);
      const end = new Date(dateEnded);
      if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
        durationDays = Math.round(
          (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
        );
        if (durationDays >= 0) durations.push(durationDays);
      }
    }

    // Build card
    const card: ExperimentCard = {
      id: exp.id,
      name: exp.name,
      trackingKey: exp.trackingKey,
      hypothesis: exp.hypothesis || "",
      verdict,
      project: exp.project || "",
      tags: exp.tags || [],
      owner: exp.owner || "",
      type: expType,
      primaryMetric: primaryMetricResult
        ? {
            ...primaryMetricResult,
            liftFormatted: formatLift(primaryMetricResult.lift),
          }
        : null,
      totalUsers: verdictResult.totalUsers,
      durationDays,
      dateStarted,
      dateEnded,
      srmPassing,
      srmPValue,
      guardrailsRegressed,
    };
    cards.push(card);

    // Accumulate stats

    byVerdict[verdict]++;
    totalUsers += verdictResult.totalUsers;

    if (verdictResult.totalUsers > 0) {
      experimentsWithResults++;
      if (!srmPassing) {
        srmFailures++;
        srmIssues.push({
          id: exp.id,
          name: exp.name,
          srmPValue: srmPValue!,
        });
      }
      if (guardrailsRegressed) guardrailRegressions++;
    }

    if (verdict === "won" && primaryMetricResult?.lift != null) {
      winnerLifts.push(Math.abs(primaryMetricResult.lift));
    }
    if (verdict === "lost" && primaryMetricResult?.lift != null) {
      loserLifts.push(primaryMetricResult.lift);
    }

    // By project
    const project = exp.project || "(none)";
    if (!byProject[project]) {
      byProject[project] = {
        count: 0,
        won: 0,
        lost: 0,
        inconclusive: 0,
        winRate: null,
      };
    }
    byProject[project].count++;
    if (verdict === "won") byProject[project].won++;
    if (verdict === "lost") byProject[project].lost++;
    if (verdict === "inconclusive") byProject[project].inconclusive++;

    // By tags
    for (const tag of exp.tags || []) {
      if (!byTag[tag]) {
        byTag[tag] = {
          count: 0,
          won: 0,
          lost: 0,
          inconclusive: 0,
          winRate: null,
        };
      }
      byTag[tag].count++;
      if (verdict === "won") byTag[tag].won++;
      if (verdict === "lost") byTag[tag].lost++;
      if (verdict === "inconclusive") byTag[tag].inconclusive++;
    }

    // By month
    const endMonth = getYearMonth(dateEnded);
    if (endMonth) {
      if (!byMonth[endMonth]) byMonth[endMonth] = { ended: 0, won: 0, lost: 0 };
      byMonth[endMonth].ended++;
      if (verdict === "won") byMonth[endMonth].won++;
      if (verdict === "lost") byMonth[endMonth].lost++;
    }

    // By type
    if (expType === "multi-armed-bandit") {
      byType.bandit++;
    } else {
      byType.standard++;
    }
  }

  // Calculate win rates for projects and tags
  for (const key of Object.keys(byProject)) {
    const p = byProject[key];
    const total = p.won + p.lost + p.inconclusive;
    p.winRate = total > 0 ? round(p.won / total) : null;
  }
  for (const key of Object.keys(byTag)) {
    const t = byTag[key];
    const total = t.won + t.lost + t.inconclusive;
    t.winRate = total > 0 ? round(t.won / total) : null;
  }

  const total = byVerdict.won + byVerdict.lost + byVerdict.inconclusive;

  // Top winners and losers
  const topWinners = cards
    .filter((c) => c.verdict === "won" && c.primaryMetric?.lift != null)
    .sort(
      (a, b) =>
        Math.abs(b.primaryMetric!.lift!) - Math.abs(a.primaryMetric!.lift!)
    )
    .slice(0, 5)
    .map((c) => ({
      id: c.id,
      name: c.name,
      lift: c.primaryMetric!.lift!,
      liftFormatted: c.primaryMetric!.liftFormatted,
      metric: c.primaryMetric!.name,
      hypothesis: c.hypothesis,
    }));

  const topLosers = cards
    .filter((c) => c.verdict === "lost" && c.primaryMetric?.lift != null)
    .sort(
      (a, b) =>
        Math.abs(b.primaryMetric!.lift!) - Math.abs(a.primaryMetric!.lift!)
    )
    .slice(0, 5)
    .map((c) => ({
      id: c.id,
      name: c.name,
      lift: c.primaryMetric!.lift!,
      liftFormatted: c.primaryMetric!.liftFormatted,
      metric: c.primaryMetric!.name,
      hypothesis: c.hypothesis,
    }));

  await reportProgress(5, "Putting on the finishing touches...");
  return {
    total: experiments.length,
    byVerdict,

    // Matches GrowthBook: winRate = won / (won + lost + inconclusive)
    winRate: total > 0 ? round(byVerdict.won / total) : null,

    avgDurationDays:
      durations.length > 0
        ? round(durations.reduce((a, b) => a + b, 0) / durations.length, 1)
        : null,
    medianDurationDays: median(durations),
    totalUsers,
    avgUsersPerExperiment:
      experimentsWithResults > 0
        ? Math.round(totalUsers / experimentsWithResults)
        : null,

    avgLiftWinners:
      winnerLifts.length > 0
        ? round(winnerLifts.reduce((a, b) => a + b, 0) / winnerLifts.length)
        : null,
    medianLiftWinners: median(winnerLifts),

    srmFailureRate:
      experimentsWithResults > 0
        ? round(srmFailures / experimentsWithResults)
        : null,
    guardrailRegressionRate:
      experimentsWithResults > 0
        ? round(guardrailRegressions / experimentsWithResults)
        : null,
    srmIssues,

    topWinners,
    topLosers,

    byProject,
    byTag,
    byMonth,
    byType,

    experiments: cards,
  };
}

export async function handleSummaryMode(
  experiments: Experiment[],
  baseApiUrl: string,
  apiKey: string,
  reportProgress: (progress: number, message?: string) => Promise<void>
): Promise<
  ExperimentStats & {
    _meta: {
      totalFetched: number;
      excluded: {
        draft: number;
        running: number;
      };
    };
  }
> {
  // Filter to stopped experiments only - matching GrowthBook's filter
  const stoppedExperiments = experiments.filter(
    (exp) => exp.status === "stopped"
  );

  const stats = await buildExperimentStats(
    stoppedExperiments,
    baseApiUrl,
    apiKey,
    reportProgress
  );

  return {
    ...stats,
    _meta: {
      totalFetched: experiments.length,
      excluded: {
        draft: experiments.filter((e) => e.status === "draft").length,
        running: experiments.filter((e) => e.status === "running").length,
      },
    },
  };
}
