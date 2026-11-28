import type { HarvestItem } from "@mobile/features/portfolio/utils/plant-season";
import { readWishHistory } from "@mobile/features/portfolio/utils/portfolio-plant";
import { listOf, text } from "@mobile/lib/sync/normalize-values";

/** 저장 전 값 정리 — 레코드 정의가 받는 값으로. 모르는 필드는 남긴다. */
export function normalizeHarvest(item: HarvestItem): HarvestItem {
  return {
    ...item,
    // open enum — 새 앱이 더한 종류도 그대로 둔다 (지우면 그 값을 덮어쓴다).
    sourceType: (text(item.sourceType) || "portfolio") as HarvestItem["sourceType"],
    sourceId: text(item.sourceId),
    sourceName: text(item.sourceName),
    wish: text(item.wish),
    plantName: text(item.plantName),
    wishHistory: readWishHistory(item.wishHistory),
    goals: listOf(item.goals),
    doneAt: typeof item.doneAt === "string" ? item.doneAt : null,
  };
}
