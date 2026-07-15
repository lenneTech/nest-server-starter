# Production Dockerfile for nest-server-starter projects.
# Works in both standalone and monorepo (lt fullstack init) setups.
#
# Standalone:  docker build -t api .
# Monorepo:    docker build --build-arg API_DIR=projects/api -t api .
#              (build context = monorepo root)

ARG API_DIR=.

# Stage 1: Install dependencies
FROM node:24-alpine@sha256:a0b9bf06e4e6193cf7a0f58816cc935ff8c2a908f81e6f1a95432d679c54fbfd AS deps
WORKDIR /app

# Build tools for bcrypt native addon
RUN apk add --no-cache python3 make g++ && corepack enable

# Copy all manifests for dependency resolution.
# In monorepo mode pnpm needs workspace config + all project manifests;
# copying everything and then installing is the simplest cross-mode approach.
COPY . /tmp/src
RUN find /tmp/src -maxdepth 3 -name "package.json" -not -path "*/node_modules/*" \
      -exec sh -c 'dir=$(dirname "$1" | sed "s|^/tmp/src|.|"); mkdir -p "/app/$dir"; cp "$1" "/app/$dir/"' _ {} \; \
    && cp -f /tmp/src/pnpm-lock.yaml /app/ 2>/dev/null || true \
    && cp -f /tmp/src/pnpm-workspace.yaml /app/ 2>/dev/null || true \
    && cp -f /tmp/src/.npmrc /app/ 2>/dev/null || true \
    && rm -rf /tmp/src

# Install dependencies (--ignore-scripts prevents husky/prepare errors in Docker)
# Rebuild bcrypt native addon separately
RUN pnpm install --frozen-lockfile --ignore-scripts && pnpm rebuild bcrypt

# Stage 2: Build
FROM node:24-alpine@sha256:a0b9bf06e4e6193cf7a0f58816cc935ff8c2a908f81e6f1a95432d679c54fbfd AS builder
ARG API_DIR=.
WORKDIR /app
RUN corepack enable

COPY --from=deps /app ./
COPY ${API_DIR}/ ./${API_DIR}/

RUN cd ${API_DIR} && pnpm run build

# Produce a self-contained production node_modules. The approach differs by mode
# because pnpm lays out node_modules differently:
#   * Monorepo (API_DIR=projects/api): the project's dependency symlinks live in
#     its OWN node_modules (pointing into the shared .pnpm store); the
#     workspace-root /app/node_modules has 0 top-level entries. Copying the root
#     would ship an empty tree → boot crash "Cannot find module '@nestjs/apollo'".
#     `pnpm deploy` resolves the project's full prod tree into a standalone dir.
#   * Standalone (API_DIR=.): a single package whose prod deps (incl. transitive
#     framework peers like @nestjs/apollo) are already flattened into
#     /app/node_modules by shamefully-hoist. `pnpm deploy` would DROP those hoisted
#     transitive peers here, so prune in place and reuse the tree verbatim.
# --legacy is required for `pnpm deploy` on pnpm 9+/11; the package name is derived
# from the project package.json (never hardcoded) so the Dockerfile stays generic.
RUN if [ "$API_DIR" = "." ]; then \
      CI=true pnpm install --frozen-lockfile --prod --ignore-scripts \
      && mkdir -p /app/deploy \
      && cp -a node_modules /app/deploy/node_modules \
      && cp package.json /app/deploy/package.json; \
    else \
      PKG=$(cd "$API_DIR" && node -p "require('./package.json').name") \
      && pnpm --filter="$PKG" deploy --prod --legacy /app/deploy; \
    fi

# Stage 3: Production runner
FROM node:24-alpine@sha256:a0b9bf06e4e6193cf7a0f58816cc935ff8c2a908f81e6f1a95432d679c54fbfd
ARG API_DIR=.
WORKDIR /app
ENV NODE_ENV=production

# Bake the build's git commit SHA into the image so GET /meta and the health
# check can report exactly which build is running — letting App and API be
# compared to detect a mismatched / stale container after a partial rollout.
# Read at runtime (process.env), so it belongs in the final image. Fed from the
# CI commit SHA via docker build args; defaults to "unknown" for local builds.
ARG APP_VERSION_COMMIT=unknown
ENV APP_VERSION_COMMIT=$APP_VERSION_COMMIT

# Non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

# Create writable directories for runtime files (TUS uploads, GraphQL schema)
RUN mkdir -p /app/uploads && chown -R nodejs:nodejs /app

# Copy built application and the self-contained production dependencies
# (package.json + node_modules come from the `pnpm deploy` output, dist from build)
COPY --from=builder --chown=nodejs:nodejs /app/${API_DIR}/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/deploy/package.json ./
COPY --from=builder --chown=nodejs:nodejs /app/deploy/node_modules ./node_modules
COPY --chown=nodejs:nodejs --chmod=755 ./${API_DIR}/docker-entrypoint.sh /app/docker-entrypoint.sh

USER nodejs
EXPOSE 3000
ENTRYPOINT ["/app/docker-entrypoint.sh"]
