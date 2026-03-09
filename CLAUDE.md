# CLAUDE.md

This file provides guidance when working with the GrowthBook MCP server codebase.

## Build & Test Commands

```bash
npm run build          # TypeScript compilation (tsc)
npm run dev            # Watch mode
npm test               # Run all tests (vitest)
npx vitest run         # Alternative test runner
npm run generate-api-types  # Regenerate API types from OpenAPI spec
```

## Version Management

Version lives in `package.json` and must be synced to `manifest.json` and `server.json`.

```bash
npm run bump:minor     # Bump minor version + sync all files
npm run bump:patch     # Bump patch version + sync all files
npm run sync-version   # Sync version from package.json → manifest.json + server.json
```

**Do NOT manually edit versions in manifest.json or server.json** — use the bump scripts or edit `package.json` then run `npm run sync-version`.

## Architecture

### Source Structure

```
src/
  index.ts              # Server entry point, registers all tool groups
  utils.ts              # Shared utilities (fetch, schemas, headers, rate limiting)
  format-responses.ts   # Response formatters for all tools (agent-friendly output)
  api-types.d.ts        # Auto-generated from OpenAPI spec (do not edit manually)
  api-type-helpers.ts   # Typed aliases for specific API responses
  docs.ts               # SDK code snippets per language
  tools/
    features.ts         # Feature flag tools (create, get, list keys, stale check)
    experiments/
      experiments.ts    # Experiment tools (get, create, attributes)
      experiment-summary.ts  # Summary mode logic and metric resolution
    defaults.ts         # Experiment defaults management
    environments.ts     # Environment listing
    projects.ts         # Project listing
    sdk-connections.ts  # SDK connection tools
    metrics.ts          # Metrics tools
    search.ts           # Documentation search
  prompts/              # MCP prompt registrations
  types/                # TypeScript type definitions
```

### Key Patterns

**Tool registration**: Each tool group has a `register*Tools()` function that receives `{ server, baseApiUrl, apiKey, ... }` and registers tools via `server.registerTool()`.

**Response formatting**: All tool responses go through formatters in `format-responses.ts`. Never return raw `JSON.stringify()` — use or create a formatter that produces agent-friendly markdown output. List views should be scannable summaries; detail views should include full configuration.

**API calls**: Use `fetchWithRateLimit()` for all API calls (adds courtesy delays and retry on 429). Use `buildHeaders(apiKey)` for request headers. Use `handleResNotOk(res)` to throw on non-2xx responses.

**Error handling**: Use `formatApiError(error, context, suggestions)` to produce errors with actionable suggestions for the agent.

**Input schemas**: Use Zod for all tool input schemas. Reuse schemas from `featureFlagSchema` in utils.ts where applicable. File extension uses `SUPPORTED_FILE_EXTENSIONS` constant.

## Adding a New Tool

1. **Add the tool** in the appropriate file under `src/tools/`. Use `server.registerTool()` with a Zod input schema.
2. **Add a formatter** in `src/format-responses.ts` if the tool returns data. Follow the existing pattern of returning markdown-formatted strings.
3. **Add to manifest.json** — add a `{ "name": "tool_name", "description": "..." }` entry in the `tools` array. This is used by MCP registries.
4. **Update the docs** — add the tool to `docs/docs/integrations/mcp.mdx` in the growthbook repo (under the appropriate Tools subsection).
5. **Update CHANGELOG.md** — add the tool under the current version's `### Added` section.
6. **Run build and tests** — `npm run build && npm test`.

### Tool Description Best Practices

Tool descriptions directly influence how well AI agents use the tool. Follow these guidelines:

- **Lead with what the tool needs** — if a parameter is required, say so upfront (e.g., "Given a list of feature flag IDs, checks whether...")
- **Reference other tools** — tell the agent which tools to use first (e.g., "Use list_feature_keys to get all flag IDs")
- **Keep it language-agnostic** — don't reference JS-specific SDK methods; users may be in Python, Go, Ruby, etc.
- **Avoid modes when possible** — simpler tools with a single response shape are easier for agents to use correctly
- **Handle missing required params gracefully** — return a helpful response (not an error) guiding the agent on how to gather the data

## Files That Must Stay in Sync

When making changes, ensure these files are updated together:

| Change | Files to update |
|--------|----------------|
| New tool | `src/tools/*.ts`, `manifest.json`, docs `mcp.mdx`, `CHANGELOG.md` |
| Version bump | `package.json` → run `npm run sync-version` → updates `manifest.json` + `server.json` |
| API schema changes | Run `npm run generate-api-types`, update `api-type-helpers.ts` if needed |
| Tool rename/remove | `src/tools/*.ts`, `src/format-responses.ts` (formatters), `manifest.json`, docs `mcp.mdx`, `CHANGELOG.md` |

## API Types

`src/api-types.d.ts` is auto-generated from GrowthBook's OpenAPI spec. Do not edit it manually.

```bash
npm run generate-api-types
```

`src/api-type-helpers.ts` provides concrete type aliases for API responses used in tools:

```typescript
export type GetStaleFeatureResponse =
  Paths["/stale-features"]["get"]["responses"][200]["content"]["application/json"];
```

Add new type aliases here when working with new API endpoints.

## Testing

Tests use Vitest and live in `test/`. The project tests utility functions and tool registration — not individual API responses (those depend on live data).

Key test files:
- `test/tools/readonly-tools.test.ts` — verifies read-only tools are registered with correct annotations
- `test/tools/defaults.test.ts` — tests experiment defaults logic
- `test/tools/experiments/summary-logic.test.ts` — tests experiment summary formatting

## External Documentation

The MCP docs page lives in the main GrowthBook repo at `docs/docs/integrations/mcp.mdx`. When adding or removing tools, update that file too.
