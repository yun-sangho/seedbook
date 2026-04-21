-- AlterTable
ALTER TABLE "seedbook"."portfolio"
  ADD COLUMN "accountIds" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  ADD COLUMN "driftThresholdPercent" DOUBLE PRECISION NOT NULL DEFAULT 5;
