"use client";

import { ReactNode, useState } from "react";
import {
  closestCenter,
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { cn } from "@web/lib/utils";

interface SortableListProps<T> {
  items: T[];
  onReorder: (items: T[]) => void;
  children: ReactNode;
  getItemId: (item: T) => string | number;
  renderDragOverlay?: (activeId: string | number) => ReactNode;
  className?: string;
}

/**
 * 모바일과 데스크톱에서 모두 사용 가능한 드래그 앤 드롭 정렬 리스트
 *
 * 사용 예시:
 * ```tsx
 * <SortableList
 *   items={investments}
 *   onReorder={(reordered) => setInvestmentOrder(reordered)}
 *   getItemId={(item) => item.id}
 *   className="ml-8" // 드래그 핸들 공간 확보를 위한 왼쪽 여백
 * >
 *   {investments.map((item) => (
 *     <SortableItem key={item.id} id={item.id}>
 *       <InvestmentItemComponent item={item} />
 *     </SortableItem>
 *   ))}
 * </SortableList>
 * ```
 */
export function SortableList<T>({
  items,
  onReorder,
  children,
  getItemId,
  renderDragOverlay,
  className,
}: SortableListProps<T>) {
  const [activeId, setActiveId] = useState<string | number | null>(null);

  // 모바일과 데스크톱 모두 지원하는 센서 설정
  const sensors = useSensors(
    // 마우스/터치 드래그를 위한 포인터 센서
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // 8px 이동 후 드래그 시작 (클릭과 구분)
      },
    }),
    // 터치 디바이스 최적화
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200, // 200ms 누르고 있으면 드래그 시작
        tolerance: 5, // 5px 이내 움직임 허용
      },
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = items.findIndex((item) => getItemId(item) === active.id);
      const newIndex = items.findIndex((item) => getItemId(item) === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        // 배열 재정렬
        const newItems = [...items];
        const [movedItem] = newItems.splice(oldIndex, 1);
        newItems.splice(newIndex, 0, movedItem!);
        onReorder(newItems);
      }
    }

    setActiveId(null);
  };

  const handleDragCancel = () => {
    setActiveId(null);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <SortableContext
        items={items.map((item) => getItemId(item))}
        strategy={verticalListSortingStrategy}
      >
        <div className={cn("flex flex-col gap-3", className)}>{children}</div>
      </SortableContext>

      {/* 드래그 중 미리보기 오버레이 */}
      <DragOverlay>
        {activeId && renderDragOverlay ? (
          renderDragOverlay(activeId)
        ) : activeId ? (
          <div className="opacity-50">Dragging...</div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
