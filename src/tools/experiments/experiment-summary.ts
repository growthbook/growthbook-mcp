import { fetchWithRateLimit, handleResNotOk } from "../../utils.js";
import { type Experiment } from "../../types/types.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// Types
interface MetricInfo {
  id: string;
  name: string;
  inverse: boolean;
  type: "binomial" | "count" | "duration" | "revenue";
}

type MetricLookup = Map<string, MetricInfo>;

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

interface VerdictResult {
  verdict: "won" | "lost" | "inconclusive";
  primaryMetricResult: {
    id: string;
    name: string;
    lift: number | null;
    significant: boolean;
    direction: "winning" | "losing" | "flat";
  } | null;
  guardrailsRegressed: boolean;
  srmPassing: boolean;
  srmPValue: number | null;
  totalUsers: number;
}

// Helper functions
function median(arr: number[]): number | null {
  if (arr.length === 0) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function round(n: number | null | undefined, decimals = 4): number | null {
  if (n === null || n === undefined || isNaN(n)) return null;
  return Math.round(n * 10 ** decimals) / 10 ** decimals;
}

function formatLift(lift: number | null): string {
  if (lift === null) return "N/A";
  const sign = lift >= 0 ? "+" : "";
  return `${sign}${(lift * 100).toFixed(1)}%`;
}

function getYearMonth(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function computeVerdict(
  exp: Experiment,
  metricLookup: MetricLookup
): VerdictResult {
  const resultData = exp.result?.results?.[0];
  const srmPValue = resultData?.checks?.srm ?? null;
  const totalUsers = resultData?.totalUsers || 0;

  const srmPassing = srmPValue !== null ? srmPValue > 0.001 : true;

  // Get goal and guardrail metric IDs
  const goalIds = exp.settings?.goals?.map((g) => g.metricId) || [];
  const guardrailIds = new Set(
    exp.settings?.guardrails?.map((g) => g.metricId) || []
  );

  // Check guardrail regression
  const guardrailsRegressed = resultData
    ? (resultData.metrics || [])
        .filter((m) => guardrailIds.has(m.metricId))
        .some((m) => {
          const metricInfo = metricLookup.get(m.metricId);
          const isInverse = metricInfo?.inverse ?? false;

          return m.variations.slice(1).some((v) => {
            const analysis = v.analyses?.[0];
            if (!analysis) return false;

            if (analysis.chanceToBeatControl !== undefined) {
              return isInverse
                ? analysis.chanceToBeatControl > 0.95
                : analysis.chanceToBeatControl < 0.05;
            }

            return isInverse
              ? (analysis.ciLow ?? 0) > 0
              : (analysis.ciHigh ?? 0) < 0;
          });
        })
    : false;

  // Verdict: Match GrowthBook's ExperimentWinRate.tsx exactly
  // exp.results maps to resultSummary.status in the API
  const userResult = exp.resultSummary?.status?.toLowerCase() || "";
  let verdict: "won" | "lost" | "inconclusive";

  if (userResult === "won") {
    verdict = "won";
  } else if (userResult === "lost") {
    verdict = "lost";
  } else {
    // Everything else is "inconclusive": dnf, inconclusive, undefined, null, ""
    verdict = "inconclusive";
  }

  // Compute primary metric result for display
  const primaryMetricResult = resultData
    ? computePrimaryMetricResult(resultData, metricLookup, goalIds)
    : null;

  return {
    verdict,
    primaryMetricResult,
    guardrailsRegressed,
    srmPassing,
    srmPValue,
    totalUsers,
  };
}

function computePrimaryMetricResult(
  resultData: NonNullable<Experiment["result"]>["results"][0],
  metricLookup: MetricLookup,
  goalIds: string[]
): VerdictResult["primaryMetricResult"] {
  const primaryMetricId = goalIds[0];
  if (!primaryMetricId) return null;

  const primaryMetricData = resultData.metrics?.find(
    (m) => m.metricId === primaryMetricId
  );

  if (!primaryMetricData || primaryMetricData.variations.length <= 1) {
    return null;
  }

  const metricInfo = metricLookup.get(primaryMetricId);
  const isInverse = metricInfo?.inverse ?? false;

  // Find best performing variation (excluding control at index 0)
  let bestVariation = primaryMetricData.variations[1];
  let bestLift = bestVariation?.analyses?.[0]?.percentChange ?? 0;

  for (let i = 2; i < primaryMetricData.variations.length; i++) {
    const v = primaryMetricData.variations[i];
    const lift = v.analyses?.[0]?.percentChange ?? 0;
    const isBetter = isInverse ? lift < bestLift : lift > bestLift;
    if (isBetter) {
      bestVariation = v;
      bestLift = lift;
    }
  }

  const analysis = bestVariation?.analyses?.[0];
  if (!analysis) return null;

  const lift = analysis.percentChange;
  const chanceToBeatControl = analysis.chanceToBeatControl;

  let significant = false;
  if (chanceToBeatControl !== undefined) {
    significant = chanceToBeatControl > 0.95 || chanceToBeatControl < 0.05;
  } else {
    significant =
      analysis.ciLow !== undefined &&
      analysis.ciHigh !== undefined &&
      (analysis.ciLow > 0 || analysis.ciHigh < 0);
  }

  let direction: "winning" | "losing" | "flat" = "flat";
  if (significant) {
    const rawPositive = lift > 0;
    const isWinning = isInverse ? !rawPositive : rawPositive;
    direction = isWinning ? "winning" : "losing";
  }

  return {
    id: primaryMetricId,
    name: metricInfo?.name || primaryMetricId,
    lift: round(lift),
    significant,
    direction,
  };
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
              headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
              },
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
              headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
              },
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
