import type { HarvestItem } from "@mobile/features/portfolio/utils/plant-season";
import { numberToKorean } from "@mobile/utils/number-format";
import { kstDateString } from "@seedbook/domain/kst";
import type { PlantKind } from "../plant-3d/plant-options";

/** 바구니(수확 기록)의 카드 하나. */
export interface BasketCard {
  id: string;
  kind: PlantKind;
  /** 하고 싶은 일 (비어 있었으면 안내 문구). */
  wish: string;
  /** 어느 포트폴리오의 몇 번째 계절. */
  source: string;
  /** 첫 목표를 이룬 날 ~ 수확한 날 (KST). */
  period: string;
  /** 이룬 목표 금액 (만원 단위). */
  goals: string[];
  /** 하고 싶은 일을 "했어요" 한 날 (KST). 아직이면 null. */
  doneOn: string | null;
}

/** KST 날짜 "YYYY.MM.DD". */
function kstDay(iso: string): string {
  return kstDateString(new Date(iso)).replace(/-/g, ".");
}

/** 수확 기록 → 바구니 카드. 최근 수확이 앞. */
export function basketCards(harvests: readonly HarvestItem[]): BasketCard[] {
  return [...harvests]
    .sort((a, b) => Date.parse(b.harvestedAt) - Date.parse(a.harvestedAt))
    .map((h) => {
      const start = h.goals[0]?.reachedAt ?? h.harvestedAt;
      return {
        id: h.id,
        kind: h.plantKind,
        wish: h.wish || "하고 싶은 일 없이 수확했어요",
        source: `${h.sourceName || "이름 없는 포트폴리오"} · ${h.season}번째 계절`,
        period: `${kstDay(start)} ~ ${kstDay(h.harvestedAt)}`,
        goals: h.goals.map((g) => numberToKorean(g.amount)),
        doneOn: h.doneAt === null ? null : kstDay(h.doneAt),
      };
    });
}
