# GrowthBook MCP Thin

A thin MCP server for GrowthBook with three tools:

| Tool | Purpose |
|------|---------|
| `list_skills` | List bundled GrowthBook agent skills (name + description) |
| `read_skill` | Return the full skill markdown (workflow + guardrails) |
| `call_api` | Authenticated REST passthrough to the GrowthBook API |

Competence lives in the [skills](https://github.com/growthbook/skills) repo and is **bundled at build time**. Capability is a generic `call_api` tool — no per-endpoint formatters. The tool description asks agents to confirm mutating methods (POST/PUT/PATCH/DELETE) with the user unless already instructed.

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
- `http://127.0.0.1:3333/mcp/api` — capability-only (`call_api`)

Unauthenticated requests receive `401` with `WWW-Authenticate` pointing at `/.well-known/oauth-protected-resource`, which advertises the GrowthBook Authorization Server.

Before handling MCP, the server probes GrowthBook REST (`GET /api/v1/`) with the bearer. A `401` from that probe (or later from `call_api`) yields HTTP `401` with `error="invalid_token"` so the MCP client can refresh — instead of surfacing `"This API key has expired"` as a tool error. A `403` is treated as an accepted bearer (permission denied ≠ invalid token) so clients are not forced into a refresh loop.

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
- Tool description + server instructions tell the agent to confirm POST/PUT/PATCH/DELETE with the user unless already instructed (soft guidance, not a hard gate)

### `list_skills` / `read_skill`

Only registered when `GB_SKILLS_ENABLED` is not disabled. `read_skill` returns the full `SKILL.md` content so the agent can follow workflow steps and guardrails.

## Development

```bash
# Requires a sibling checkout at ../skills (or SKILLS_SRC)
npm install
npm run build
npm start
```

## Standalone HTTP mode

By default the server runs over stdio. Set `GB_MCP_TRANSPORT=http` to run it as a standalone HTTP server that exposes MCP at `/mcp` (skills + `call_api`) and `/mcp/api` (capability-only), behind an OAuth 2.0 protected-resource surface (RFC 9728 metadata + RFC 6750 `WWW-Authenticate`).

- `GB_MCP_URL` (**required** in HTTP mode) — the server's public base URL. It is stamped into the OAuth resource (audience) and the protected-resource metadata, so it is never derived from request headers. The server refuses to start without it.
- `GB_MCP_PORT` (default `3333`) and `GB_MCP_HOST` (default `127.0.0.1`).
- Incoming bearers are validated by probing the GrowthBook REST API; a rejected token gets HTTP `401` + `WWW-Authenticate` so the client can refresh.

Run it on a trusted network or bound to loopback. For a multi-tenant or public deployment, front it with your own gateway/auth.

## Deployment & releases

Two tracks, so GrowthBook Cloud can move fast while self-hosters stay on stable, pinned versions.

### Cloud (continuous)

`deploy.yml` runs on every push to `main` (and on manual dispatch). It builds the image — checking out `growthbook/skills` fresh so cloud always has the newest skills — pushes it to ECR as `:latest` and `:git-<sha>`, then forces a new ECS deployment. Infra (ECS service, ALB, DNS) lives in the terraform repo (`growthbook-mcp.tf`).

Skills commits do **not** auto-trigger cloud. To pull a skills change into cloud without an MCP commit, run `deploy.yml` via **Run workflow** (manual dispatch); the fresh skills checkout picks it up.

To roll cloud back, run `rollback.yml` (manual dispatch) with the 7-char SHA of a known-good commit — it retags that `:git-<sha>` image as `:latest` and redeploys. Nothing about npm or self-hosted releases is touched.

### Self-hosted (tagged releases)

Cutting a release is deliberate — you push a `v<version>` git tag whose version **matches `package.json`** (a guard job fails the release otherwise):

```bash
# bump version in package.json, merge to main, then:
git tag v2.0.0-beta.1
git push origin v2.0.0-beta.1
```

`release.yml` then, from that tagged commit (skills frozen at cut time):

- builds and pushes a **multi-arch** (`amd64`+`arm64`) image to `ghcr.io/growthbook/growthbook-mcp`, tagged `:<version>` (plus `:<major>`, `:<major>.<minor>`, `:latest` for stable releases only);
- publishes `@growthbook/mcp` to npm (prereleases go under the `beta` dist-tag, never `latest`);
- publishes to the MCP registry;
- opens a GitHub Release with generated notes.

Self-hosters pull `ghcr.io/growthbook/growthbook-mcp:<version>` or `npx @growthbook/mcp@<version>`.

> **One-time setup:** the GHCR package defaults to private on first publish — make it public in the org's package settings so self-hosters can pull it. The cloud workflows (`deploy.yml`, `rollback.yml`) need `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` repo secrets; npm publish uses OIDC trusted publishing (no `NPM_TOKEN`).

## Out of scope (v1)

- CLI OAuth login (Phase 2 — same AS)
- Dedicated token introspection endpoint (HTTP mode probes REST and relies on `401` for invalidation)
- Response formatting and summarization (belongs in skills)
- Editing the canonical skills to reference `call_api` instead of `gb-call` (bridged via instructions)
