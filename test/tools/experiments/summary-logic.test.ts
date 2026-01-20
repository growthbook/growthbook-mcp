import { describe, expect, it } from "vitest";
import {
  computePrimaryMetricResult,
  computeVerdict,
  type MetricLookup,
} from "../../../src/tools/experiments/summary-logic.js";
import { type Experiment } from "../../../src/types/types.js";

function makeExperiment(
  overrides: Partial<Experiment> = {}
): Experiment {
  return {
    id: "exp_1",
    status: "stopped",
    hypothesis: "",
    trackingKey: "exp-1",
    dateCreated: new Date().toISOString(),
    dateUpdated: new Date().toISOString(),
    name: "Experiment 1",
    type: "standard",
    project: "",
    tags: [],
    owner: "",
    resultSummary: {
      status: "inconclusive",
      winner: "",
      conclusions: "",
      releasedVariationId: "",
      excludeFromPayload: true,
    },
    variations: [
      { variationId: "0", name: "Control" },
      { variationId: "1", name: "Variant" },
    ],
    settings: {
      goals: [],
      guardrails: [],
    },
    ...overrides,
  };
}

describe("summary-logic.computeVerdict", () => {
  it("maps resultSummary.status (case-insensitive) to won/lost/inconclusive", () => {
    const metricLookup: MetricLookup = new Map();

    expect(
      computeVerdict(
        makeExperiment({ resultSummary: { ...makeExperiment().resultSummary, status: "WON" } }),
        metricLookup
      ).verdict
    ).toBe("won");

    expect(
      computeVerdict(
        makeExperiment({ resultSummary: { ...makeExperiment().resultSummary, status: "lost" } }),
        metricLookup
      ).verdict
    ).toBe("lost");

    expect(
      computeVerdict(
        makeExperiment({ resultSummary: { ...makeExperiment().resultSummary, status: "dnf" } }),
        metricLookup
      ).verdict
    ).toBe("inconclusive");
  });

  it("treats SRM as passing when pValue is null/absent, and failing when <= 0.001", () => {
    const metricLookup: MetricLookup = new Map();

    // no result => srmPassing true
    expect(computeVerdict(makeExperiment({ result: undefined }), metricLookup).srmPassing).toBe(
      true
    );

    const withSrmFail = makeExperiment({
      result: {
        id: "r1",
        dateStart: "",
        dateEnd: "",
        results: [
          {
            checks: { srm: 0.001 },
            totalUsers: 100,
            metrics: [],
          },
        ],
      },
    });
    expect(computeVerdict(withSrmFail, metricLookup).srmPassing).toBe(false);

    const withSrmPass = makeExperiment({
      result: {
        id: "r2",
        dateStart: "",
        dateEnd: "",
        results: [
          {
            checks: { srm: 0.002 },
            totalUsers: 100,
            metrics: [],
          },
        ],
      },
    });
    expect(computeVerdict(withSrmPass, metricLookup).srmPassing).toBe(true);
  });
});

describe("summary-logic.computePrimaryMetricResult", () => {
  it("selects the best non-control variation for non-inverse metrics and uses chanceToBeatControl for significance", () => {
    const metricLookup: MetricLookup = new Map([
      [
        "m1",
        {
          id: "m1",
          name: "Metric 1",
          inverse: false,
          type: "binomial",
        },
      ],
    ]);

    const resultData: NonNullable<Experiment["result"]>["results"][0] = {
      checks: { srm: 0.5 },
      totalUsers: 1000,
      metrics: [
        {
          metricId: "m1",
          variations: [
            { variationId: "0", users: 500, analyses: [] },
            {
              variationId: "1",
              users: 250,
              analyses: [
                {
                  ciLow: -0.01,
                  ciHigh: 0.05,
                  percentChange: 0.1,
                  chanceToBeatControl: 0.9,
                  mean: 0,
                },
              ],
            },
            {
              variationId: "2",
              users: 250,
              analyses: [
                {
                  ciLow: 0.01,
                  ciHigh: 0.2,
                  percentChange: 0.2,
                  chanceToBeatControl: 0.96,
                  mean: 0,
                },
              ],
            },
          ],
        },
      ],
    };

    const res = computePrimaryMetricResult(resultData, metricLookup, ["m1"]);
    expect(res?.id).toBe("m1");
    expect(res?.name).toBe("Metric 1");
    expect(res?.lift).toBe(0.2);
    expect(res?.significant).toBe(true);
    expect(res?.direction).toBe("winning");
  });

  it("for inverse metrics, chooses the lowest lift and flips winning/losing direction", () => {
    const metricLookup: MetricLookup = new Map([
      [
        "m2",
        {
          id: "m2",
          name: "Inverse Metric",
          inverse: true,
          type: "binomial",
        },
      ],
    ]);

    const resultData: NonNullable<Experiment["result"]>["results"][0] = {
      checks: { srm: 0.5 },
      totalUsers: 1000,
      metrics: [
        {
          metricId: "m2",
          variations: [
            { variationId: "0", users: 500, analyses: [] },
            {
              variationId: "1",
              users: 250,
              analyses: [
                {
                  ciLow: -0.2,
                  ciHigh: -0.01,
                  percentChange: -0.1,
                  chanceToBeatControl: 0.96,
                  mean: 0,
                },
              ],
            },
            {
              variationId: "2",
              users: 250,
              analyses: [
                {
                  ciLow: 0.01,
                  ciHigh: 0.2,
                  percentChange: 0.05,
                  chanceToBeatControl: 0.96,
                  mean: 0,
                },
              ],
            },
          ],
        },
      ],
    };

    const res = computePrimaryMetricResult(resultData, metricLookup, ["m2"]);
    expect(res?.lift).toBe(-0.1);
    expect(res?.significant).toBe(true);
    expect(res?.direction).toBe("winning"); // negative lift is good for inverse metrics
  });

  it("uses ciLow/ciHigh when chanceToBeatControl is missing", () => {
    const metricLookup: MetricLookup = new Map([
      [
        "m3",
        {
          id: "m3",
          name: "CI Metric",
          inverse: false,
          type: "binomial",
        },
      ],
    ]);

    const resultData: NonNullable<Experiment["result"]>["results"][0] = {
      checks: { srm: 0.5 },
      totalUsers: 1000,
      metrics: [
        {
          metricId: "m3",
          variations: [
            { variationId: "0", users: 500, analyses: [] },
            {
              variationId: "1",
              users: 500,
              analyses: [
                {
                  ciLow: 0.01,
                  ciHigh: 0.02,
                  percentChange: 0.015,
                  // chanceToBeatControl intentionally omitted
                  mean: 0,
                } as any,
              ],
            },
          ],
        },
      ],
    };

    const res = computePrimaryMetricResult(resultData, metricLookup, ["m3"]);
    expect(res?.significant).toBe(true);
    expect(res?.direction).toBe("winning");
  });
});

