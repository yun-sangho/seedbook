#!/bin/sh
set -e

echo "Running Prisma migrations..."
cd /app/packages/database
./node_modules/.bin/prisma migrate deploy

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
