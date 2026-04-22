#!/bin/sh
set -e

echo "Running Prisma migrations..."
cd /app/packages/database
./node_modules/.bin/prisma migrate deploy

# 개발 환경에서만 seed fixture 재생 — 프로덕션 컴포즈는 NODE_ENV 가 production 이라 스킵된다.
# 시드는 upsert 라 재시작마다 돌아도 멱등. 실패해도 크롤러 부팅은 이어가야 하므로
# `set -e` 하에서도 에러를 삼켜준다 (크롤러 스케줄이 결국 데이터를 채움).
if [ "$NODE_ENV" = "development" ]; then
  echo "Running DB seed (dev only)..."
  ./node_modules/.bin/tsx prisma/seed.ts || echo "seed failed, continuing"
fi

echo "Starting stock-crawler..."

# pnpm/npx wrapper를 우회해서 SIGTERM이 Node 프로세스에 직접 전달되도록 한다.
# wrapper를 거치면 pnpm이 signal-exit을 실패로 리포트해서 로그가 지저분해진다.
if [ "$NODE_ENV" = "development" ]; then
  cd /app/apps/stock-crawler
  exec ./node_modules/.bin/tsx src/index.ts
else
  cd /app
  exec node apps/stock-crawler/dist/index.js
fi
