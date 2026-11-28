FROM node:24-slim AS base

RUN corepack enable && corepack prepare pnpm@8.15.6 --activate
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# --- Dependencies ---
FROM base AS deps

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/database/package.json ./packages/database/package.json
COPY packages/domain/package.json ./packages/domain/package.json
COPY packages/typescript-config/package.json ./packages/typescript-config/package.json
COPY packages/tailwind-config/package.json ./packages/tailwind-config/package.json
COPY packages/native-plugins/package.json ./packages/native-plugins/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY apps/mobile/package.json ./apps/mobile/package.json

RUN pnpm install --frozen-lockfile

# --- Build ---
FROM deps AS build

COPY packages/typescript-config/ ./packages/typescript-config/
COPY packages/tailwind-config/ ./packages/tailwind-config/
COPY packages/database/ ./packages/database/
COPY packages/domain/ ./packages/domain/
COPY apps/web/ ./apps/web/
# 앱 화면 (Vite SPA). 웹 서버가 빌드 결과를 public/_app 으로 복사해 같이 서빙한다.
# 네이티브 프로젝트(android·ios)는 .dockerignore 로 뺀다.
COPY apps/mobile/ ./apps/mobile/

# 기기 레코드의 writtenBy (`apps/mobile/src/lib/native/device-db/app-build.ts`). 배포 워크플로가 커밋 sha 를 넘긴다.
ARG APP_BUILD=unknown
ENV SEEDBOOK_APP_BUILD=$APP_BUILD

# @seedbook/database 의 dist/ 는 Drizzle 만 export 하므로 Prisma generate 가
# 더 이상 필요 없다. tsc 컴파일 한 번이면 web 이 import 할 수 있다.
RUN pnpm --filter @seedbook/database build
# Bypass turbo (which would require ^build + format:check) by invoking
# the package build scripts directly via pnpm filter. 앱 화면 먼저 — 웹 빌드가 그 결과를 복사한다.
RUN pnpm --filter @seedbook/mobile build
RUN pnpm --filter @seedbook/web build

# --- Production ---
FROM base AS production

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001
ENV HOSTNAME=0.0.0.0

# Run as non-root
RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs

# Next.js standalone output contains server.js plus a minimized node_modules
# tree (with the workspace layout preserved thanks to outputFileTracingRoot).
COPY --from=build --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
# Static assets and the public dir must be copied separately per Next.js docs.
COPY --from=build --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public

USER nextjs

EXPOSE 3001

CMD ["node", "apps/web/server.js"]

# --- Development ---
FROM deps AS development

WORKDIR /app

# Shared packages (change infrequently — good cache layer)
COPY packages/typescript-config/ ./packages/typescript-config/
COPY packages/tailwind-config/ ./packages/tailwind-config/
COPY packages/database/ ./packages/database/
COPY packages/domain/ ./packages/domain/

RUN pnpm --filter @seedbook/database build

# Web config files only — source directories come in via volume mounts
COPY apps/web/package.json ./apps/web/
COPY apps/web/next.config.js ./apps/web/
COPY apps/web/tsconfig.json ./apps/web/
COPY apps/web/postcss.config.js ./apps/web/
COPY apps/web/components.json ./apps/web/
COPY apps/web/vitest.config.ts ./apps/web/
COPY apps/web/vitest.setup.ts ./apps/web/

ENV NODE_ENV=development
ENV PORT=3001
ENV HOSTNAME=0.0.0.0

EXPOSE 3001

CMD ["pnpm", "--filter", "@seedbook/web", "dev"]
