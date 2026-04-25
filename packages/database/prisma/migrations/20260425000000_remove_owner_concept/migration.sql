-- ============================================================================
-- Remove "owner" concept from asset domain
-- ============================================================================
-- Drops accountOwner / loanOwner / assetOwner columns and the
-- RealAssetCustomOwner table. Service is pre-launch; no data migration.

ALTER TABLE "seedbook"."investment_account" DROP COLUMN "accountOwner";
ALTER TABLE "seedbook"."savings_account"    DROP COLUMN "accountOwner";
ALTER TABLE "seedbook"."debt"               DROP COLUMN "loanOwner";
ALTER TABLE "seedbook"."real_asset"         DROP COLUMN "assetOwner";
DROP TABLE "seedbook"."real_asset_custom_owner";
