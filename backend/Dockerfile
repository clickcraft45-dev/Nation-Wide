# Build context must be the monorepo root (e.g. `docker build -f backend/Dockerfile .`) —
# the backend depends on the packages/shared-types workspace, which needs to be in the build
# context too. All stages share node:20-bookworm-slim (not alpine) so sharp/bcrypt's native
# bindings, compiled once in the `build` stage, are ABI-compatible with the `runtime` stage.

FROM node:20-bookworm-slim AS base
WORKDIR /app
# openssl is required by Prisma's query engine on Debian-based images.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

FROM base AS deps
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
RUN npm ci

FROM deps AS build
COPY packages/shared-types packages/shared-types
COPY backend backend
RUN npm run build --workspace=packages/shared-types
RUN npx prisma generate --schema backend/prisma/schema.prisma
RUN npm run build --workspace=backend

FROM base AS runtime
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
RUN npm ci --omit=dev
# Prisma's generated client (node_modules/.prisma) isn't produced by a plain `npm ci` — carried
# over from the build stage instead, which ran on the same base image so the native query engine
# binary matches.
COPY --from=build /app/node_modules/.prisma node_modules/.prisma
COPY --from=build /app/packages/shared-types/dist packages/shared-types/dist
COPY --from=build /app/backend/dist backend/dist
COPY --from=build /app/backend/prisma backend/prisma

WORKDIR /app/backend

# Run as a non-root user — if any other vulnerability ever achieves code execution in this
# container, this keeps its blast radius to an unprivileged account rather than root. node:20's
# official images ship a pre-created, unprivileged `node` user (uid/gid 1000) for exactly this.
#
# Nothing in this image needs to be writable any more: every uploaded and generated file goes to
# S3 (see StorageService), so there is no storage/ directory to create or chown. A read-only
# filesystem is the point — files that used to live here did not survive a redeploy.
USER node

EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/v1/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "dist/src/main"]
