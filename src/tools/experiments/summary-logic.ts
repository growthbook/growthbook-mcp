import { type Experiment } from "../../types/types.js";

export interface MetricInfo {
  id: string;
  name: string;
  inverse: boolean;
  type: "binomial" | "count" | "duration" | "revenue";
}

export type MetricLookup = Map<string, MetricInfo>;

export interface VerdictResult {
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

export function median(arr: number[]): number | null {
  if (arr.length === 0) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function round(
  n: number | null | undefined,
  decimals = 4
): number | null {
  if (n === null || n === undefined || isNaN(n)) return null;
  return Math.round(n * 10 ** decimals) / 10 ** decimals;
}

export function formatLift(lift: number | null): string {
  if (lift === null) return "N/A";
  const sign = lift >= 0 ? "+" : "";
  return `${sign}${(lift * 100).toFixed(1)}%`;
}

export function getYearMonth(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function computePrimaryMetricResult(
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

export function computeVerdict(
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

