FROM node:22-slim AS base

RUN corepack enable && corepack prepare pnpm@8.15.6 --activate
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# --- Dependencies ---
FROM base AS deps

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/database/package.json ./packages/database/package.json
COPY apps/stock-crawler/package.json ./apps/stock-crawler/package.json
COPY packages/typescript-config/package.json ./packages/typescript-config/package.json

RUN pnpm install --frozen-lockfile

# --- Build ---
FROM deps AS build

COPY packages/typescript-config/ ./packages/typescript-config/
COPY packages/database/ ./packages/database/
COPY apps/stock-crawler/ ./apps/stock-crawler/

RUN pnpm --filter @seedbook/database prisma:generate
# @seedbook/database 의 package.json 은 main/types 를 dist/ 로 가리키는데
# NodeNext resolution 을 쓰는 stock-crawler tsc 는 dist 가 없으면 타입을
# 찾지 못한다. Next.js (swc) 는 src 를 직접 transpile 하므로 web 쪽은
# 영향 없지만, 컨테이너 빌드에서는 여기서 명시적으로 먼저 컴파일한다.
RUN pnpm --filter @seedbook/database build
RUN pnpm --filter @seedbook/stock-crawler build

# --- Production ---
FROM base AS production

WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/database/node_modules ./packages/database/node_modules
COPY --from=build /app/apps/stock-crawler/node_modules ./apps/stock-crawler/node_modules
COPY --from=build /app/packages/database/ ./packages/database/
COPY --from=build /app/apps/stock-crawler/ ./apps/stock-crawler/
COPY --from=build /app/packages/typescript-config/ ./packages/typescript-config/
COPY pnpm-workspace.yaml package.json ./

COPY apps/stock-crawler/entrypoint.sh /app/entrypoint.sh

ENV NODE_ENV=production

ENTRYPOINT ["/app/entrypoint.sh"]

# --- Development ---
FROM base AS development

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/ ./packages/
COPY --from=deps /app/apps/stock-crawler/node_modules ./apps/stock-crawler/node_modules
COPY packages/typescript-config/ ./packages/typescript-config/
COPY packages/database/ ./packages/database/
COPY apps/stock-crawler/ ./apps/stock-crawler/
COPY pnpm-workspace.yaml package.json ./

RUN pnpm --filter @seedbook/database prisma:generate

COPY apps/stock-crawler/entrypoint.sh /app/entrypoint.sh

ENV NODE_ENV=development

ENTRYPOINT ["/app/entrypoint.sh"]
