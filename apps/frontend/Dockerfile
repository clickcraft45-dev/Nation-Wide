# Build context must be the monorepo root (e.g. `docker build -f apps/frontend/Dockerfile .`) —
# the frontend depends on the packages/shared-types workspace, which needs to be in the build
# context too.

FROM node:20-bookworm-slim AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/frontend/package.json apps/frontend/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
RUN npm ci

FROM deps AS build
COPY packages/shared-types packages/shared-types
COPY apps/frontend apps/frontend
# NEXT_PUBLIC_* variables are inlined into the client bundle by `next build`, so they have to be
# present at BUILD time — setting them on the container at runtime does nothing. They arrive as
# build args (docker-compose passes them under build.args) rather than runtime env vars, which is
# what the compose file used to do and why a containerised frontend always called localhost:4000.
ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:4000/api/v1
ARG NEXT_PUBLIC_SITE_URL=http://localhost:3004
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
RUN npm run build --workspace=packages/shared-types
# next.config.ts sets output: "standalone" — traces only the node_modules this app actually
# needs into .next/standalone, so the runtime stage never ships the full monorepo node_modules.
RUN npm run build --workspace=apps/frontend

FROM base AS runtime
ENV NODE_ENV=production
# The standalone tree preserves the monorepo-relative path (apps/frontend/server.js) — the
# workspace root is app/frontend's cwd is set below, not /app root, so relative asset lookups
# inside server.js still resolve.
#
# --chown=node:node (rather than a separate `RUN chown -R` layer) hands ownership straight to
# the unprivileged `node` user these files run as below — needed because next/image's optimizer
# creates .next/cache/images on first request, and standalone output doesn't ship that directory
# pre-built. node:20's official images ship this user (uid/gid 1000) pre-created for this purpose.
COPY --from=build --chown=node:node /app/apps/frontend/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/frontend/.next/static ./apps/frontend/.next/static
COPY --from=build --chown=node:node /app/apps/frontend/public ./apps/frontend/public

WORKDIR /app/apps/frontend
USER node

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||3000)+'/',r=>process.exit(r.statusCode<500?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "server.js"]
