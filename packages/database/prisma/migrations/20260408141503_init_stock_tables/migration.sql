-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "seedbook";

-- CreateTable
CREATE TABLE "seedbook"."Stock" (
    "market" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KRW',
    "sector" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Stock_pkey" PRIMARY KEY ("market","ticker")
);

-- CreateTable
CREATE TABLE "seedbook"."StockPrice" (
    "id" SERIAL NOT NULL,
    "stockMarket" TEXT NOT NULL,
    "stockTicker" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "open" BIGINT NOT NULL,
    "high" BIGINT NOT NULL,
    "low" BIGINT NOT NULL,
    "close" BIGINT NOT NULL,
    "volume" BIGINT NOT NULL,
    "marketCap" BIGINT,
    "change" BIGINT,

    CONSTRAINT "StockPrice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Stock_market_idx" ON "seedbook"."Stock"("market");

-- CreateIndex
CREATE INDEX "Stock_isActive_idx" ON "seedbook"."Stock"("isActive");

-- CreateIndex
CREATE INDEX "Stock_name_idx" ON "seedbook"."Stock"("name");

-- CreateIndex
CREATE INDEX "StockPrice_date_idx" ON "seedbook"."StockPrice"("date");

-- CreateIndex
CREATE INDEX "StockPrice_stockMarket_stockTicker_idx" ON "seedbook"."StockPrice"("stockMarket","stockTicker");

-- CreateIndex
CREATE UNIQUE INDEX "StockPrice_stockMarket_stockTicker_date_key" ON "seedbook"."StockPrice"("stockMarket","stockTicker","date");

-- AddForeignKey
ALTER TABLE "seedbook"."StockPrice" ADD CONSTRAINT "StockPrice_stockMarket_stockTicker_fkey" FOREIGN KEY ("stockMarket","stockTicker") REFERENCES "seedbook"."Stock"("market","ticker") ON DELETE RESTRICT ON UPDATE CASCADE;
