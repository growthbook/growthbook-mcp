export type Experiment = {
  id: string;
  status: "draft" | "running" | "stopped";
  hypothesis: string;
  trackingKey: string;
  dateCreated: string;
  dateUpdated: string;
  name: string;
  type: "standard" | "multi-armed-bandit";
  project: string;
  tags?: string[];
  owner?: string;
  resultSummary: {
    status: string;
    winner: string;
    conclusions: string;
    releasedVariationId: string;
    excludeFromPayload: true;
  };
  variations: Array<{
    variationId: string;
    name: string;
  }>;
  settings: {
    goals: Array<{ metricId: string }>;
    guardrails: Array<{ metricId: string }>;
  };
  result?: {
    id: string;
    dateStart: string;
    dateEnd: string;
    results: Array<{
      checks: {
        srm: number;
      };
      totalUsers: number;
      metrics: Array<{
        metricId: string;
        variations: Array<{
          variationId: string;
          users: number;
          analyses: Array<{
            ciLow: number;
            ciHigh: number;
            percentChange: number;
            chanceToBeatControl: number;
            mean: number;
          }>;
        }>;
      }>;
    }>;
  };
};
