
# Build native dependencies in the same Debian family used by the runtime image.
FROM node:22-bookworm-slim AS dependencies

ENV NODE_ENV=production
WORKDIR /app/backend

# better-sqlite3 may need a native compilation toolchain when no compatible prebuild exists.
RUN apt-get update \
    && apt-get install --no-install-recommends -y python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund \
    && npm cache clean --force

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production \
    PORT=3000 \
    DB_PATH=data/pqrs.db \
    ATTACHMENTS_STORAGE_DIR=data/attachments \
    STATIC_CACHE_SECONDS=3600

WORKDIR /app

# Keep the runtime user unprivileged. Persistent directories are writable by this UID.
RUN groupadd --system --gid 10001 pqrs \
    && useradd --system --uid 10001 --gid pqrs --home-dir /app --no-create-home pqrs \
    && mkdir -p /app/data/attachments \
    && chown -R 10001:10001 /app/data

COPY --from=dependencies --chown=10001:10001 /app/backend/node_modules ./backend/node_modules
COPY --chown=10001:10001 backend/package.json ./backend/package.json
COPY --chown=10001:10001 backend/src ./backend/src
COPY --chown=10001:10001 frontend ./frontend
COPY --chown=10001:10001 frontend-admin ./frontend-admin
COPY --chown=10001:10001 shared ./shared

USER 10001:10001

EXPOSE 3000

# This verifies that the HTTP process responds. Database readiness is exercised separately
# by the container smoke test; the existing /api/health endpoint is intentionally lightweight.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "backend/src/server.js"]
