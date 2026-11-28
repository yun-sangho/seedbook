"use client";

import { useMemo } from "react";
import { ActionButton } from "@mobile/seed-design/ui/action-button";
import {
  BottomSheetBody,
  BottomSheetContent,
  BottomSheetRoot,
} from "@mobile/seed-design/ui/bottom-sheet";
import { useHarvestStore } from "../stores/harvest-store";
import { type BasketCard, basketCards } from "../utils/basket";
import { PlantAvatar } from "./plant-avatar";

/**
 * 바구니 — 수확한 계절마다 카드 하나: 식물(꽃·열매), 하고 싶은 일, 걸린 기간, 이룬 목표 다섯 개.
 * 하고 싶은 일을 해냈으면 "했어요" 로 날짜를 남긴다 (다시 누르면 취소).
 */
export function BasketSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const harvests = useHarvestStore((s) => s.harvests);
  const toggleDone = useHarvestStore((s) => s.toggleHarvestDone);
  const cards = useMemo(() => basketCards(harvests), [harvests]);
  return (
    <BottomSheetRoot open={open} onOpenChange={onOpenChange}>
      <BottomSheetContent title="바구니" showHandle>
        <BottomSheetBody>
          {cards.length === 0 ? (
            <p className="t4-regular text-fg-neutral-subtle py-x6 text-center">
              목표 다섯 개를 이루고 수확하면 여기에 담겨요
            </p>
          ) : (
            <ul className="flex flex-col gap-x3 pb-x4">
              {cards.map((card) => (
                <BasketCardItem
                  key={card.id}
                  card={card}
                  onToggleDone={() => toggleDone(card.id)}
                />
              ))}
            </ul>
          )}
        </BottomSheetBody>
      </BottomSheetContent>
    </BottomSheetRoot>
  );
}

function BasketCardItem({ card, onToggleDone }: { card: BasketCard; onToggleDone: () => void }) {
  return (
    <li className="border-stroke-neutral-muted rounded-r3 flex gap-x3 border p-x4">
      <span className="shrink-0">
        <PlantAvatar stage="bloom" kind={card.kind} ripe size={56} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="t5-bold break-words">{card.wish}</p>
        <p className="t3-regular text-fg-neutral-subtle mt-x1">{card.source}</p>
        <p className="t3-regular text-fg-neutral-subtle tabular-nums">{card.period}</p>
        <p className="t3-regular text-fg-neutral-muted mt-x1 tabular-nums">
          목표 {card.goals.join(" → ")}
        </p>
        <div className="mt-x3">
          <ActionButton
            variant={card.doneOn === null ? "neutralWeak" : "neutralSolid"}
            size="xsmall"
            onClick={onToggleDone}
            aria-pressed={card.doneOn !== null}
            aria-label={`${card.wish} 했어요`}
          >
            {card.doneOn === null ? "했어요" : `✓ 했어요 · ${card.doneOn}`}
          </ActionButton>
        </div>
      </div>
    </li>
  );
}
