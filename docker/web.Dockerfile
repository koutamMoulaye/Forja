# Forja web: the Next.js standalone server on a slim Node image, as an unprivileged user.
# Build from the repository root:
#   docker build -f docker/web.Dockerfile -t forja-web:0.1.0 .

ARG NODE_VERSION=24

FROM node:${NODE_VERSION}-bookworm-slim AS build
ENV NEXT_TELEMETRY_DISABLED=1 \
    FORJA_WEB_STANDALONE=true
WORKDIR /web
RUN corepack enable
COPY apps/web/package.json apps/web/pnpm-lock.yaml apps/web/pnpm-workspace.yaml ./
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile
COPY apps/web ./
RUN pnpm build

FROM node:${NODE_VERSION}-bookworm-slim
ARG FORJA_VERSION=0.1.0
LABEL org.opencontainers.image.title="Forja web" \
      org.opencontainers.image.version="${FORJA_VERSION}" \
      org.opencontainers.image.licenses="Apache-2.0" \
      org.opencontainers.image.source="https://github.com/koutamMoulaye/Forja"
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    FORJA_API_URL=http://api:8000
WORKDIR /web
COPY --from=build --chown=node:node /web/.next/standalone ./
COPY --from=build --chown=node:node /web/.next/static ./.next/static
COPY --from=build --chown=node:node /web/public ./public
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
    CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "server.js"]
