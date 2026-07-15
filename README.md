# GrowthBook MCP Thin

A thin MCP server for GrowthBook with three tools:

| Tool | Purpose |
|------|---------|
| `list_skills` | List bundled GrowthBook agent skills (name + description) |
| `read_skill` | Return the full skill markdown (workflow + guardrails) |
| `call_api` | Authenticated REST passthrough to the GrowthBook API |

Competence lives in the [skills](https://github.com/growthbook/skills) repo and is **bundled at build time**. Capability is a generic `call_api` tool — no per-endpoint formatters.

## Install / run

```bash
npm install
npm run build
```

Point your MCP client at the compiled entrypoint:

```json
{
  "mcpServers": {
    "growthbook": {
      "command": "node",
      "args": ["/absolute/path/to/growthbook-mcp-thin/server/index.js"],
      "env": {
        "GB_API_KEY": "your_api_key_or_pat",
        "GB_API_URL": "https://api.growthbook.io"
      }
    }
  }
}
```

Or after publishing:

```bash
npx @growthbook/mcp-thin
```

## Environment variables

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `GB_API_KEY` | Yes for stdio; optional for HTTP OAuth | — | GrowthBook API key or personal access token |
| `GB_API_URL` | No | `https://api.growthbook.io` | API base URL (self-hosted) and default OAuth AS issuer |
| `GB_MCP_TRANSPORT` | No | `stdio` | `stdio` or `http` |
| `GB_MCP_PORT` | No | `3333` | HTTP listen port (when transport=http) |
| `GB_MCP_HOST` | No | `127.0.0.1` | HTTP bind host |
| `GB_MCP_URL` | No | derived from request | Public MCP base URL for resource metadata |
| `GB_OAUTH_ISSUER` | No | `GB_API_URL` | GrowthBook OAuth AS issuer URL |
| `GB_HTTP_HEADER_*` | No | — | Extra request headers (e.g. `GB_HTTP_HEADER_CF_ACCESS_TOKEN`) |
| `GB_SKILLS_ENABLED` | No | `true` | Set to `false` / `0` to disable skill tools |

### HTTP + OAuth mode

```bash
OAUTH_AS_ENABLED=1  # on the GrowthBook API
GB_MCP_TRANSPORT=http GB_API_URL=http://localhost:3100 GB_MCP_PORT=3333 npm start
```

Clients connect to:
- `http://127.0.0.1:3333/mcp` — full (skills + API)
- `http://127.0.0.1:3333/mcp/api` — capability-only (`call_api`)

Unauthenticated requests receive `401` with `WWW-Authenticate` pointing at `/.well-known/oauth-protected-resource`, which advertises the GrowthBook Authorization Server.

### Capability-only mode

**HTTP (recommended for remote):** point the client at `/mcp/api` instead of `/mcp`:

```json
{
  "mcpServers": {
    "growthbook": {
      "url": "http://127.0.0.1:3333/mcp/api"
    }
  }
}
```

| Path | Tools |
|------|--------|
| `/mcp` | `list_skills`, `read_skill`, `call_api` (unless `GB_SKILLS_ENABLED=false`) |
| `/mcp/api` | `call_api` only |

**stdio / process-wide:** set env so skills are never registered:

```json
"env": {
  "GB_API_KEY": "...",
  "GB_SKILLS_ENABLED": "false"
}
```

When skills are disabled, only `call_api` is registered. `list_skills` and `read_skill` are not exposed.

## How skills are bundled

```bash
npm run build   # tsc && bundle-skills
```

`scripts/bundle-skills.mjs` copies every `skills/*/SKILL.md` from the canonical skills checkout into `server/skills/<name>.md`.

Source path resolution:

1. `SKILLS_SRC` env var (path to the skills repo root), or
2. `../skills` (sibling directory)

The skills repo stays the source of truth — this package never forks skill content.

## Using skills with `call_api`

Bundled skills still show workflows as:

```bash
gb-call GET /api/v1/projects
gb-call POST /api/v2/features ./payload.json
```

This MCP server does **not** shell out to `gb-call`. When a skill shows that pattern, call the `call_api` tool with the same method, path, and optional JSON body string. Server instructions and `read_skill` output include this bridge note.

## Tools detail

### `call_api`

```json
{ "method": "GET", "path": "/api/v1/projects" }
{ "method": "POST", "path": "/api/v2/features", "body": "{\"id\":\"my-flag\",...}" }
```

- Methods: `GET` | `POST` | `PUT` | `PATCH` | `DELETE`
- Returns raw response body on 2xx
- On non-2xx, returns an actionable error (`isError: true`) covering auth failures, self-hosted 404 hints, and rate limits

### `list_skills` / `read_skill`

Only registered when `GB_SKILLS_ENABLED` is not disabled. `read_skill` returns the full `SKILL.md` content so the agent can follow workflow steps and guardrails.

## Development

```bash
# Requires a sibling checkout at ../skills (or SKILLS_SRC)
npm install
npm run build
npm start
```

## Out of scope (v1)

- CLI OAuth login (Phase 2 — same AS)
- Independent MCP token introspection / audience validation (pass-through to GB REST for now)
- Response formatting and summarization (belongs in skills)
- Editing the canonical skills to reference `call_api` instead of `gb-call` (bridged via instructions)
