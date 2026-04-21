-- CreateTable
CREATE TABLE "seedbook"."portfolio" (
    "id" UUID NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "color" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "portfolio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seedbook"."portfolio_allocation" (
    "id" UUID NOT NULL,
    "portfolioId" UUID NOT NULL,
    "market" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "targetPercent" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "portfolio_allocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "portfolio_userId_idx" ON "seedbook"."portfolio"("userId");

-- CreateIndex
CREATE INDEX "portfolio_allocation_portfolioId_idx" ON "seedbook"."portfolio_allocation"("portfolioId");

-- AddForeignKey
ALTER TABLE "seedbook"."portfolio" ADD CONSTRAINT "portfolio_userId_fkey" FOREIGN KEY ("userId") REFERENCES "seedbook"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seedbook"."portfolio_allocation" ADD CONSTRAINT "portfolio_allocation_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "seedbook"."portfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
