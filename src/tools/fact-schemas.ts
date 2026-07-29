import { z } from "zod";

/**
 * Shared input schemas, validation, and payload builders for the fact table and
 * fact metric write tools.
 *
 * Design notes:
 * - The Zod shapes below mirror the request bodies of `POST /fact-tables` and
 *   `POST /fact-metrics`. They intentionally cover how a metric is *defined*
 *   (type, numerator, denominator, filters, quantiles) and leave analysis
 *   tuning (priors, regression adjustment, risk thresholds, conversion windows)
 *   to the org defaults, which users adjust in the GrowthBook UI. This keeps
 *   the tools small enough for an agent to use correctly.
 * - `validateFactMetricInput` only enforces constraints the API documents
 *   explicitly. Anything the API merely implies is left to the API, so the MCP
 *   never rejects a request GrowthBook would have accepted.
 */

/** Row filter operators accepted by the fact metric API. */
export const factRowFilterOperatorSchema = z.enum([
  "=",
  "!=",
  ">",
  "<",
  ">=",
  "<=",
  "in",
  "not_in",
  "is_null",
  "not_null",
  "is_true",
  "is_false",
  "contains",
  "not_contains",
  "starts_with",
  "ends_with",
  "sql_expr",
  "saved_filter",
]);

/** Operators that carry no comparison values. */
const OPERATORS_WITHOUT_VALUES = new Set([
  "is_null",
  "not_null",
  "is_true",
  "is_false",
]);

/** Operators that do not target a single column. */
const OPERATORS_WITHOUT_COLUMN = new Set(["sql_expr", "saved_filter"]);

/** Metric types whose numerator must not specify a column. */
const METRIC_TYPES_WITHOUT_NUMERATOR_COLUMN = new Set([
  "proportion",
  "dailyParticipation",
]);

/** Metric types that support aggregate filters. */
const METRIC_TYPES_WITH_AGGREGATE_FILTER = new Set(["retention", "proportion"]);

export const factRowFilterSchema = z.object({
  operator: factRowFilterOperatorSchema.describe(
    "Comparison operator applied to rows before aggregation."
  ),
  column: z
    .string()
    .optional()
    .describe(
      "Column to filter on. Required for every operator except sql_expr and saved_filter."
    ),
  values: z
    .array(z.string())
    .optional()
    .describe(
      "Values to compare against. Not required for is_null, not_null, is_true, and is_false."
    ),
});

const factMetricColumnAggregationSchema = z
  .enum(["sum", "max", "count distinct"])
  .describe(
    "How the column is aggregated per unit. Defaults to sum for numeric columns; string columns require 'count distinct'."
  );

export const factMetricNumeratorSchema = z.object({
  factTableId: z
    .string()
    .describe("Fact table id (use list_fact_tables to find one)."),
  column: z
    .string()
    .optional()
    .describe(
      "Column to aggregate, or a special value: '$$count', '$$distinctUsers', or '$$distinctDates'. Must be omitted for proportion and dailyParticipation metrics."
    ),
  aggregation: factMetricColumnAggregationSchema.optional(),
  rowFilters: z
    .array(factRowFilterSchema)
    .optional()
    .describe("Filters applied to fact table rows before aggregation."),
  aggregateFilterColumn: z
    .string()
    .optional()
    .describe(
      "Column used to filter units after aggregation ('$$count' or a numeric column). Only for retention and proportion metrics, and requires aggregateFilter."
    ),
  aggregateFilter: z
    .string()
    .optional()
    .describe(
      "Comparison applied after aggregation, e.g. '>= 2'. Requires aggregateFilterColumn."
    ),
});

export const factMetricDenominatorSchema = z.object({
  factTableId: z.string().describe("Fact table id for the denominator."),
  column: z
    .string()
    .describe(
      "Column to aggregate, or a special value: '$$count', '$$distinctUsers', or '$$distinctDates'."
    ),
  aggregation: factMetricColumnAggregationSchema.optional(),
  rowFilters: z
    .array(factRowFilterSchema)
    .optional()
    .describe("Filters applied to denominator rows before aggregation."),
});

export const factMetricQuantileSettingsSchema = z.object({
  type: z
    .enum(["event", "unit"])
    .describe(
      "Whether the quantile is computed over raw event values or over per-unit aggregates."
    ),
  quantile: z
    .number()
    .gt(0)
    .lt(1)
    .describe("Quantile to compute, strictly between 0 and 1 (e.g. 0.95)."),
  ignoreZeros: z
    .boolean()
    .describe("When true, zero values are excluded before computing."),
});

/** Input shape for `create_fact_table`. */
export const createFactTableShape = {
  name: z.string().describe("Display name of the fact table."),
  datasource: z
    .string()
    .describe(
      "Data source id the SQL runs against (use get_defaults to see the configured data source)."
    ),
  userIdTypes: z
    .array(z.string())
    .min(1)
    .describe(
      "Identifier columns returned by the SQL, e.g. ['user_id'] or ['anonymous_id', 'user_id']."
    ),
  sql: z
    .string()
    .describe(
      "SQL returning one row per event, including the identifier columns and a timestamp column."
    ),
  description: z.string().optional().describe("What this fact table contains."),
  eventName: z
    .string()
    .optional()
    .describe("Event name used in SQL template variables."),
  projects: z
    .array(z.string())
    .optional()
    .describe("Project ids to scope this fact table to (use get_projects)."),
  tags: z.array(z.string()).optional().describe("Tags to apply."),
  managedBy: z
    .literal("api")
    .optional()
    .describe(
      "Set to 'api' to make this fact table read-only in the GrowthBook UI, so it can only be changed through the API. Leave unset for a table users can edit."
    ),
} as const;

/** Input shape for `create_fact_metric`. */
export const createFactMetricShape = {
  name: z.string().describe("Display name of the metric."),
  metricType: z
    .enum([
      "proportion",
      "retention",
      "mean",
      "quantile",
      "ratio",
      "dailyParticipation",
    ])
    .describe(
      "proportion: share of units with at least one matching row. mean: average of a column per unit. ratio: numerator divided by denominator. quantile: percentile of values. retention and dailyParticipation: engagement over time."
    ),
  numerator: factMetricNumeratorSchema.describe(
    "What the metric measures. Required for every metric type."
  ),
  denominator: factMetricDenominatorSchema
    .optional()
    .describe("Required for ratio metrics, and rejected for every other type."),
  quantileSettings: factMetricQuantileSettingsSchema
    .optional()
    .describe("Required for quantile metrics."),
  inverse: z
    .boolean()
    .optional()
    .describe(
      "Set to true when a decrease is an improvement, e.g. bounce rate."
    ),
  description: z.string().optional().describe("What this metric measures."),
  projects: z
    .array(z.string())
    .optional()
    .describe("Project ids to scope this metric to (use get_projects)."),
  tags: z.array(z.string()).optional().describe("Tags to apply."),
  displayAsPercentage: z
    .boolean()
    .optional()
    .describe("Display the metric value as a percentage."),
  managedBy: z
    .literal("api")
    .optional()
    .describe(
      "Set to 'api' to make this metric read-only in the GrowthBook UI, so it can only be changed through the API. Leave unset for a metric users can edit."
    ),
} as const;

export type FactTableInput = z.infer<z.ZodObject<typeof createFactTableShape>>;
export type FactMetricInput = z.infer<z.ZodObject<typeof createFactMetricShape>>;
type FactMetricColumnRef =
  | FactMetricInput["numerator"]
  | NonNullable<FactMetricInput["denominator"]>;

/** Always tag MCP-created resources so they can be found later. */
const MCP_TAG = "mcp";

function withMcpTag(tags?: string[]): string[] {
  if (!tags?.length) return [MCP_TAG];
  return tags.includes(MCP_TAG) ? tags : [...tags, MCP_TAG];
}

/** Drops keys whose value is undefined, keeping explicit `false` and `0`. */
function omitUndefined<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== undefined)
  ) as T;
}

function validateRowFilters(
  ref: FactMetricColumnRef,
  path: "numerator" | "denominator"
): string[] {
  const errors: string[] = [];

  ref.rowFilters?.forEach((filter, index) => {
    const at = `${path}.rowFilters[${index}]`;

    if (!OPERATORS_WITHOUT_VALUES.has(filter.operator) && !filter.values?.length) {
      errors.push(
        `${at}: operator '${filter.operator}' requires 'values'. Only is_null, not_null, is_true, and is_false take no values.`
      );
    }

    if (!OPERATORS_WITHOUT_COLUMN.has(filter.operator) && !filter.column) {
      errors.push(
        `${at}: operator '${filter.operator}' requires a 'column'. Only sql_expr and saved_filter take none. Use get_fact_table to list valid column names.`
      );
    }
  });

  return errors;
}

/**
 * Checks the cross-field rules the GrowthBook API documents for fact metrics.
 * Returns one human-readable message per problem, so an agent can fix
 * everything in a single pass instead of discovering issues one 400 at a time.
 */
export function validateFactMetricInput(input: FactMetricInput): string[] {
  const errors: string[] = [];
  const { metricType, numerator, denominator, quantileSettings } = input;

  if (
    METRIC_TYPES_WITHOUT_NUMERATOR_COLUMN.has(metricType) &&
    numerator.column
  ) {
    errors.push(
      `numerator.column must be empty for '${metricType}' metrics, which count units with at least one matching row rather than aggregating a column. Use rowFilters to narrow which rows count.`
    );
  }

  if (metricType === "ratio" && !denominator) {
    errors.push(
      "denominator is required when metricType is 'ratio'. Provide the fact table and column to divide by."
    );
  }

  if (metricType !== "ratio" && denominator) {
    errors.push(
      `denominator is only allowed when metricType is 'ratio' (got '${metricType}').`
    );
  }

  if (metricType === "quantile" && !quantileSettings) {
    errors.push(
      "quantileSettings is required when metricType is 'quantile'. Provide type ('event' or 'unit'), quantile (0-1), and ignoreZeros."
    );
  }

  const hasAggregateFilterColumn = Boolean(numerator.aggregateFilterColumn);
  const hasAggregateFilter = Boolean(numerator.aggregateFilter);

  if (hasAggregateFilterColumn !== hasAggregateFilter) {
    errors.push(
      "numerator.aggregateFilterColumn and numerator.aggregateFilter must be set together, e.g. column '$$count' with filter '>= 2'."
    );
  } else if (
    hasAggregateFilterColumn &&
    !METRIC_TYPES_WITH_AGGREGATE_FILTER.has(metricType)
  ) {
    errors.push(
      `numerator.aggregateFilter is only supported for retention and proportion metrics (got '${metricType}').`
    );
  }

  errors.push(...validateRowFilters(numerator, "numerator"));
  if (denominator) {
    errors.push(...validateRowFilters(denominator, "denominator"));
  }

  return errors;
}

/** Builds the `POST /fact-tables` request body. */
export function buildFactTablePayload(
  input: FactTableInput,
  owner: string
): Record<string, unknown> {
  return omitUndefined({
    name: input.name,
    datasource: input.datasource,
    userIdTypes: input.userIdTypes,
    sql: input.sql,
    owner,
    tags: withMcpTag(input.tags),
    description: input.description,
    eventName: input.eventName,
    projects: input.projects,
    managedBy: input.managedBy,
  });
}

/** Builds the `POST /fact-metrics` request body. */
export function buildFactMetricPayload(
  input: FactMetricInput,
  owner: string
): Record<string, unknown> {
  return omitUndefined({
    name: input.name,
    metricType: input.metricType,
    numerator: input.numerator,
    owner,
    tags: withMcpTag(input.tags),
    // The API only accepts a denominator on ratio metrics.
    denominator: input.metricType === "ratio" ? input.denominator : undefined,
    quantileSettings: input.quantileSettings,
    inverse: input.inverse,
    description: input.description,
    projects: input.projects,
    displayAsPercentage: input.displayAsPercentage,
    managedBy: input.managedBy,
  });
}
