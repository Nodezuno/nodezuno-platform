# syntax=docker/dockerfile:1.7@sha256:a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e

FROM node:24.14.0-bookworm-slim@sha256:d8e448a56fc63242f70026718378bd4b00f8c82e78d20eefb199224a4d8e33d8 AS dependencies
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN npm install --global pnpm@11.9.0 \
  && pnpm install --frozen-lockfile

FROM dependencies AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODEZUNO_RUNTIME=container
COPY . .
RUN pnpm run build:container

FROM node:24.14.0-bookworm-slim@sha256:d8e448a56fc63242f70026718378bd4b00f8c82e78d20eefb199224a4d8e33d8 AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODEZUNO_RUNTIME=container
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

RUN apt-get update \
  && apt-get install --yes --no-install-recommends util-linux \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs \
  && mkdir --parents /var/lib/nodezuno \
  && chown nextjs:nodejs /var/lib/nodezuno

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/drizzle ./drizzle
COPY --from=builder --chown=nextjs:nodejs /app/scripts/migrate-d1-rest.mjs ./scripts/migrate-d1-rest.mjs
COPY --from=builder --chown=nextjs:nodejs /app/scripts/migrate-sqlite.mjs ./scripts/migrate-sqlite.mjs
COPY --from=builder --chown=nextjs:nodejs /app/scripts/migrate-container.mjs ./scripts/migrate-container.mjs
COPY --from=builder --chown=nextjs:nodejs /app/scripts/backup-sqlite.mjs ./scripts/backup-sqlite.mjs
COPY --from=builder --chown=nextjs:nodejs /app/scripts/restore-sqlite.mjs ./scripts/restore-sqlite.mjs
COPY --from=builder --chown=nextjs:nodejs /app/scripts/preflight-review-application.mjs ./scripts/preflight-review-application.mjs
COPY --from=builder --chown=nextjs:nodejs /app/scripts/preflight-deployment-topology.mjs ./scripts/preflight-deployment-topology.mjs
COPY --from=builder --chown=nextjs:nodejs /app/scripts/process-notification-outbox.mjs ./scripts/process-notification-outbox.mjs
COPY --from=builder --chown=nextjs:nodejs /app/scripts/process-stablecoin-payments.mjs ./scripts/process-stablecoin-payments.mjs
COPY --from=builder --chown=nextjs:nodejs /app/scripts/preflight-stablecoin-payments.mjs ./scripts/preflight-stablecoin-payments.mjs
COPY --from=builder --chown=nextjs:nodejs /app/scripts/start-single-container.mjs ./scripts/start-single-container.mjs
COPY --from=builder --chown=nextjs:nodejs /app/lib/server ./lib/server
COPY --from=builder --chown=nextjs:nodejs /app/lib/review-targets.ts ./lib/review-targets.ts
COPY --from=builder --chown=nextjs:nodejs /app/lib/review-policy.ts ./lib/review-policy.ts
COPY --from=builder --chown=nextjs:nodejs /app/lib/server/crypto.ts ./lib/server/crypto.ts
COPY --from=builder --chown=nextjs:nodejs /app/lib/server/http.ts ./lib/server/http.ts
COPY --from=builder --chown=nextjs:nodejs /app/lib/server/runtime-config.ts ./lib/server/runtime-config.ts
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "const port=process.env.PORT||'3000';fetch('http://127.0.0.1:'+port+'/api/v1/live').then((r)=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
