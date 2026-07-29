# GrowthBook MCP Thin

A thin MCP server for GrowthBook with three tools:

| Tool | Purpose |
|------|---------|
| `growthbook_list_skills` | List bundled GrowthBook agent skills (name + description) |
| `growthbook_read_skill` | Return the full skill markdown (workflow + guardrails) |
| `growthbook_call_api` | Authenticated REST passthrough to the GrowthBook API |

Competence lives in the [skills](https://github.com/growthbook/skills) repo and is **bundled at build time**. Capability is a generic `growthbook_call_api` tool — no per-endpoint formatters. The tool description asks agents to confirm mutating methods (POST/PUT/PATCH/DELETE) with the user unless already instructed.

Tools are prefixed with `growthbook_` so they stay unambiguous when a client has multiple MCP servers loaded — an agent should never mistake `growthbook_call_api` for a generic API caller.

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
      "args": ["/absolute/path/to/growthbook-mcp/server/index.js"],
      "env": {
        "GB_API_KEY": "your_api_key_or_pat",
        "GB_API_URL": "https://api.growthbook.io"
      }
    }
  }
}
```

Or after publishing (beta dist-tag until 2.0.0 is stable):

```bash
npx @growthbook/mcp@beta
```

## Environment variables

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `GB_API_KEY` | Yes for stdio; optional for HTTP OAuth | — | GrowthBook API key or personal access token |
| `GB_API_URL` | No | `https://api.growthbook.io` | API base URL (self-hosted) and default OAuth AS issuer |
| `GB_MCP_TRANSPORT` | No | `stdio` | `stdio` or `http` |
| `GB_MCP_PORT` | No | `3333` | HTTP listen port (when transport=http) |
| `GB_MCP_HOST` | No | `127.0.0.1` | HTTP bind host |
| `GB_MCP_URL` | Yes for HTTP | — | Public MCP base URL stamped into OAuth resource metadata (server refuses to start in HTTP mode without it) |
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
- `http://127.0.0.1:3333/mcp/api` — capability-only (`growthbook_call_api`)

Unauthenticated requests receive `401` with `WWW-Authenticate` pointing at `/.well-known/oauth-protected-resource`, which advertises the GrowthBook Authorization Server.

Before handling MCP, the server probes GrowthBook REST (`GET /api/v1/`) with the bearer. A `401` from that probe (or later from `growthbook_call_api`) yields HTTP `401` with `error="invalid_token"` so the MCP client can refresh — instead of surfacing `"This API key has expired"` as a tool error. A `403` is treated as an accepted bearer (permission denied ≠ invalid token) so clients are not forced into a refresh loop.

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
| `/mcp` | `growthbook_list_skills`, `growthbook_read_skill`, `growthbook_call_api` (unless `GB_SKILLS_ENABLED=false`) |
| `/mcp/api` | `growthbook_call_api` only |

**stdio / process-wide:** set env so skills are never registered:

```json
"env": {
  "GB_API_KEY": "...",
  "GB_SKILLS_ENABLED": "false"
}
```

When skills are disabled, only `growthbook_call_api` is registered. `growthbook_list_skills` and `growthbook_read_skill` are not exposed.

## How skills are bundled

```bash
npm run build   # tsc && bundle-skills
```

`scripts/bundle-skills.mjs` copies every `skills/*/SKILL.md` from the canonical skills checkout into `server/skills/<name>.md`.

Source path resolution:

1. `SKILLS_SRC` env var (path to the skills repo root), or
2. `../skills` (sibling directory)

The skills repo stays the source of truth — this package never forks skill content.

## Using skills with `growthbook_call_api`

Bundled skills still show workflows as:

```bash
gb-call GET /api/v1/projects
gb-call POST /api/v2/features ./payload.json
```

This MCP server does **not** shell out to `gb-call`. When a skill shows that pattern, call the `growthbook_call_api` tool with the same method, path, and optional JSON body string. Server instructions and `growthbook_read_skill` output include this bridge note.

## Tools detail

### `growthbook_call_api`

```json
{ "method": "GET", "path": "/api/v1/projects" }
{ "method": "POST", "path": "/api/v2/features", "body": "{\"id\":\"my-flag\",...}" }
```

- Methods: `GET` | `POST` | `PUT` | `PATCH` | `DELETE`
- Returns raw response body on 2xx
- On non-2xx, returns an actionable error (`isError: true`) covering auth failures, self-hosted 404 hints, and rate limits
- Tool description + server instructions tell the agent to confirm POST/PUT/PATCH/DELETE with the user unless already instructed (soft guidance, not a hard gate)

### `growthbook_list_skills` / `growthbook_read_skill`

Only registered when `GB_SKILLS_ENABLED` is not disabled. `growthbook_read_skill` returns the full `SKILL.md` content so the agent can follow workflow steps and guardrails.

## Development

```bash
# Requires a sibling checkout at ../skills (or SKILLS_SRC)
npm install
npm run build
npm start
```

## Standalone HTTP mode

By default the server runs over stdio. Set `GB_MCP_TRANSPORT=http` to run it as a standalone HTTP server that exposes MCP at `/mcp` (skills + `growthbook_call_api`) and `/mcp/api` (capability-only), behind an OAuth 2.0 protected-resource surface (RFC 9728 metadata + RFC 6750 `WWW-Authenticate`).

- `GB_MCP_URL` (**required** in HTTP mode) — the server's public base URL. It is stamped into the OAuth resource (audience) and the protected-resource metadata, so it is never derived from request headers. The server refuses to start without it.
- `GB_MCP_PORT` (default `3333`) and `GB_MCP_HOST` (default `127.0.0.1`).
- Incoming bearers are validated by probing the GrowthBook REST API; a rejected token gets HTTP `401` + `WWW-Authenticate` so the client can refresh.

Run it on a trusted network or bound to loopback. For a multi-tenant or public deployment, front it with your own gateway/auth.

## Releases

Cutting a release is deliberate: bump the version in `package.json`, then push a matching `v*` tag:

```bash
git tag v2.0.0-beta.1
git push origin v2.0.0-beta.1
```

That tagged commit (with skills frozen at cut time) publishes:

- `@growthbook/mcp` to npm — prereleases (versions with a `-`, e.g. `2.0.0-beta.1`) go under the `beta` dist-tag; stable versions become `latest`
- a multi-arch (`amd64` + `arm64`) image to `ghcr.io/growthbook/growthbook-mcp` (`:<version>`, plus `:<major>`, `:<major>.<minor>`, and `:latest` for stable releases)
- an entry in the MCP registry
- a GitHub Release

Install a release with `npx @growthbook/mcp@<version>` or pull `ghcr.io/growthbook/growthbook-mcp:<version>`.
