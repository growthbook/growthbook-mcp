# Multi-stage build for the GrowthBook MCP server (HTTP transport).
#
# `npm run build` runs `bundle-skills`, which copies SKILL.md files from a
# checkout of github.com/growthbook/skills. That repo is NOT part of this build
# context by default, so CI must vendor it into ./skills-src before building
# (the deploy workflow does this via actions/checkout, matching ci.yml).
#
#   Local build:
#     git clone git@github.com:growthbook/skills.git skills-src
#     docker build -t growthbook-mcp .
#
# Runtime is configured entirely through env vars (see the ENV block below and
# the terraform task definition). No secrets are baked into the image.

FROM node:20-slim AS build
WORKDIR /build

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Skills source, vendored into the context by CI (or a local clone). bundle-skills
# reads <SKILLS_SRC>/skills/<name>/SKILL.md.
ENV SKILLS_SRC=/build/skills-src
RUN npm run build


FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Pick up Debian security patches (glibc, gnutls28, dpkg, etc.) ahead of the
# next node:20-slim base refresh.
RUN apt-get update && apt-get upgrade -y && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
# npm itself (and its vendored deps: tar, minimatch, brace-expansion, ...) is
# only needed to install; it never runs once the container starts `node`.
RUN npm ci --omit=dev && npm cache clean --force && \
    rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack

# Compiled server (includes the bundled skills under server/skills).
COPY --from=build /build/server ./server

# Defaults for HTTP deployment. GB_MCP_URL and GB_API_URL are environment-specific
# and are supplied by the ECS task definition; GB_MCP_HOST must be 0.0.0.0 so the
# load balancer can reach the container (the app defaults to loopback otherwise).
ENV GB_MCP_TRANSPORT=http \
    GB_MCP_HOST=0.0.0.0 \
    GB_MCP_PORT=3333

EXPOSE 3333

CMD ["node", "server/index.js"]
