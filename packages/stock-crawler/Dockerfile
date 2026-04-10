FROM node:22-slim AS base

RUN corepack enable && corepack prepare pnpm@8.15.6 --activate
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# --- Dependencies ---
FROM base AS deps

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/database/package.json ./packages/database/package.json
COPY packages/stock-crawler/package.json ./packages/stock-crawler/package.json
COPY packages/typescript-config/package.json ./packages/typescript-config/package.json

RUN pnpm install --frozen-lockfile

# --- Build ---
FROM deps AS build

COPY packages/typescript-config/ ./packages/typescript-config/
COPY packages/database/ ./packages/database/
COPY packages/stock-crawler/ ./packages/stock-crawler/

RUN pnpm --filter @seedbook/database prisma:generate
RUN pnpm --filter @seedbook/stock-crawler build

# --- Production ---
FROM base AS production

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/database/node_modules ./packages/database/node_modules
COPY --from=deps /app/packages/stock-crawler/node_modules ./packages/stock-crawler/node_modules
COPY --from=build /app/packages/database/ ./packages/database/
COPY --from=build /app/packages/stock-crawler/ ./packages/stock-crawler/
COPY --from=build /app/packages/typescript-config/ ./packages/typescript-config/
COPY pnpm-workspace.yaml package.json ./

COPY packages/stock-crawler/entrypoint.sh /app/entrypoint.sh

ENV NODE_ENV=production

ENTRYPOINT ["/app/entrypoint.sh"]

# --- Development ---
FROM base AS development

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/ ./packages/
COPY packages/typescript-config/ ./packages/typescript-config/
COPY packages/database/ ./packages/database/
COPY packages/stock-crawler/ ./packages/stock-crawler/
COPY pnpm-workspace.yaml package.json ./

RUN pnpm --filter @seedbook/database prisma:generate

COPY packages/stock-crawler/entrypoint.sh /app/entrypoint.sh

ENV NODE_ENV=development

ENTRYPOINT ["/app/entrypoint.sh"]
