import type { CloudStoreKey } from "@web/lib/storage-mode";
import { investmentTranslator } from "./investment";
import { portfolioTranslator } from "./portfolio";
import { rebalancingTranslator } from "./rebalancing";
import type { DomainTranslator } from "./types";

/**
 * store key → domain translator 매핑.
 * API 라우트가 `params.key` 를 통해 어떤 도메인을 다룰지 결정할 때 사용한다.
 */
export const TRANSLATORS: Record<CloudStoreKey, DomainTranslator> = {
  "investment-storage": investmentTranslator,
  "portfolio-storage": portfolioTranslator,
  "rebalancing-storage": rebalancingTranslator,
};

export type { DomainTranslator, Envelope } from "./types";
