# Build
FROM node:24-alpine AS build
WORKDIR /app
RUN corepack enable pnpm
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

# Run — Next standalone output only
FROM node:24-alpine
# node:24-alpine is rebuilt on Node's cadence, not Alpine's, so its apk packages
# trail Alpine's own security fixes — the trivy gate reds on a patched CVE days
# before the base image picks the fix up. Refresh what is already installed: no
# new packages, same Alpine minor, so this only ever pulls patch releases.
RUN apk upgrade --no-cache
# Defaults keep a plain `docker build` (CI's image gate, a local checkout)
# working; the release workflow passes the real values.
ARG VERSION=0.0.0-dev
ARG REVISION=unknown
# org.opencontainers.image.source is the label GHCR reads to link the published
# package back to this repository. It does not make the package public — that is
# a one-time setting, recorded in docs/releasing.md.
LABEL org.opencontainers.image.title="managed-agent-console" \
      org.opencontainers.image.description="Web console for managed-agent-platform" \
      org.opencontainers.image.source="https://github.com/OpenSDLC-Dev/managed-agent-console" \
      org.opencontainers.image.licenses="Apache-2.0" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${REVISION}"
# The runtime only ever executes `node server.js` — drop the bundled npm and
# corepack entirely (smaller image; npm's vendored deps carry periodic CVEs
# the app can never reach, and they'd still trip the trivy gate).
RUN rm -rf /usr/local/lib/node_modules /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
EXPOSE 3000
USER node
CMD ["node", "server.js"]
