"use client";

import { ReactNode } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@web/lib/utils";
import { GripVertical } from "lucide-react";

interface SortableItemProps {
  id: string | number;
  children: ReactNode;
  showHandle?: boolean;
  className?: string;
}

/**
 * 정렬 가능한 개별 아이템 컴포넌트
 *
 * showHandle={true}로 설정하면 왼쪽에 드래그 핸들(≡)이 표시됩니다.
 */
export function SortableItem({ id, children, showHandle = true, className }: SortableItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn("relative group", isDragging && "z-50", className)}
    >
      {showHandle && (
        <div
          className={cn(
            "absolute -left-6 md:-left-8 top-1/2 -translate-y-1/2 z-10",
            "cursor-grab active:cursor-grabbing",
            "text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300",
            "touch-none select-none",
            "opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
          )}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="w-5 h-5" />
        </div>
      )}

      <div>{children}</div>
    </div>
  );
}
