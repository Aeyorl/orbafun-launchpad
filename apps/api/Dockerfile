# Orba API — Dockerfile (Render / Fly.io / any container host)
# Multi-stage build to keep the final image small.
# The API is a NestJS app that needs to run persistently (indexer poller +
# WebSocket server cannot be serverless).
#
# Build context must be the monorepo root (so workspace deps resolve).
# On Render: render.yaml sets rootDir: . and dockerfilePath: ./apps/api/Dockerfile

# ─── Build stage ────────────────────────────────────────────────────────────
FROM node:20-slim AS builder

WORKDIR /app

# Copy workspace root package.json + lockfile first (for dependency caching).
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/

# Install all deps (including devDeps for the build).
RUN npm ci --workspace=apps/api --workspace=packages/shared --include-workspace-root

# Copy source.
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api

# Build the shared package first (the API depends on it).
RUN npm run build --workspace=packages/shared

# Build the API.
RUN npm run build --workspace=apps/api

# ─── Production stage ───────────────────────────────────────────────────────
FROM node:20-slim AS production

WORKDIR /app

# Copy workspace root package.json + lockfile.
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/

# Install only production deps.
RUN npm ci --workspace=apps/api --workspace=packages/shared --include-workspace-root --omit=dev

# Copy built artifacts.
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/apps/api/dist ./apps/api/dist

# Copy the DB schema + migration scripts (needed for db:migrate on boot).
COPY apps/api/db ./apps/api/db

# Expose the API port (Fly proxy forwards 80/443 → this internal port).
ENV API_PORT=4000
EXPOSE 4000

# Health check — hit the tokens endpoint (lightweight, no auth needed).
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://localhost:4000/tokens?limit=1').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Start the API.
CMD ["node", "apps/api/dist/main.js"]
