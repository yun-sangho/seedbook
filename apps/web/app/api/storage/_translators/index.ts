import type { CloudStoreKey } from "@web/lib/storage-mode";
import { assetPlanTranslator } from "./asset-plan";
import { debtsTranslator } from "./debts";
import { investmentTranslator } from "./investment";
import { portfolioTranslator } from "./portfolio";
import { progressTranslator } from "./progress";
import { realAssetsTranslator } from "./real-assets";
import { savingsTranslator } from "./savings";
import type { DomainTranslator } from "./types";

/**
 * store key → domain translator 매핑.
 * API 라우트가 `params.key` 를 통해 어떤 도메인을 다룰지 결정할 때 사용한다.
 */
export const TRANSLATORS: Record<CloudStoreKey, DomainTranslator> = {
  "investment-storage": investmentTranslator,
  "savings-storage": savingsTranslator,
  "debts-storage": debtsTranslator,
  "real-assets-storage": realAssetsTranslator,
  "asset-plan-storage": assetPlanTranslator,
  "progress-storage": progressTranslator,
  "portfolio-storage": portfolioTranslator,
};

export type { DomainTranslator, Envelope } from "./types";
