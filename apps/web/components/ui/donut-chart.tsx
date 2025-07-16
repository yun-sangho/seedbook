"use client";

import { useId } from "react";
import { ChartData } from "@web/features/assets/utils/chart-utils";
import { numberToKorean } from "@web/utils/number-format";

interface DonutChartProps {
  data: ChartData[];
  totalAmount: number;
  size?: number; // 차트 크기(px)
  thickness?: number; // 도넛 두께 (전체 크기의 %)
  centerContent?: React.ReactNode; // 중앙에 표시할 컨텐츠
}

export function DonutChart({
  data,
  totalAmount,
  size = 200,
  thickness = 25,
  centerContent,
}: DonutChartProps) {
  const id = useId();

  // 차트 관련 상수
  const FULL_CIRCLE = 360;
  const CENTER = size / 2;
  const RADIUS = (size / 2) * 0.9; // 약간의 여백
  const THICKNESS_PX = RADIUS * (thickness / 100);

  // 각 세그먼트의 시작 각도를 계산
  let startAngle = 0;

  // SVG 경로 생성 헬퍼 함수
  const createSectorPath = (startAngle: number, endAngle: number) => {
    // 라디안으로 변환
    const startRad = ((startAngle - 90) * Math.PI) / 180;
    const endRad = ((endAngle - 90) * Math.PI) / 180;

    // 외부 호의 시작점과 끝점 좌표 계산
    const x1 = CENTER + RADIUS * Math.cos(startRad);
    const y1 = CENTER + RADIUS * Math.sin(startRad);
    const x2 = CENTER + RADIUS * Math.cos(endRad);
    const y2 = CENTER + RADIUS * Math.sin(endRad);

    // 내부 호의 시작점과 끝점 좌표 계산
    const innerRadius = RADIUS - THICKNESS_PX;
    const x3 = CENTER + innerRadius * Math.cos(endRad);
    const y3 = CENTER + innerRadius * Math.sin(endRad);
    const x4 = CENTER + innerRadius * Math.cos(startRad);
    const y4 = CENTER + innerRadius * Math.sin(startRad);

    // 큰 호인지 확인 (180도 이상인 경우)
    const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0;

    // SVG 경로 문자열
    return `
      M ${x1} ${y1}
      A ${RADIUS} ${RADIUS} 0 ${largeArcFlag} 1 ${x2} ${y2}
      L ${x3} ${y3}
      A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${x4} ${y4}
      Z
    `;
  };

  // 데이터가 없는 경우
  if (data.length === 0 || totalAmount === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle
            cx={CENTER}
            cy={CENTER}
            r={RADIUS}
            fill="none"
            stroke="#e5e7eb"
            strokeWidth={THICKNESS_PX}
          />
          {centerContent && (
            <foreignObject
              x={CENTER - RADIUS + THICKNESS_PX}
              y={CENTER - RADIUS + THICKNESS_PX}
              width={2 * (RADIUS - THICKNESS_PX)}
              height={2 * (RADIUS - THICKNESS_PX)}
              className="flex items-center justify-center text-center"
            >
              <div className="flex flex-col items-center justify-center w-full h-full">
                {centerContent}
              </div>
            </foreignObject>
          )}
        </svg>
        <div className="mt-4 text-sm text-gray-500">데이터가 없습니다</div>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col items-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* 도넛 차트 세그먼트 */}
        {data.map((item, index) => {
          const segmentPercentage = totalAmount > 0 ? item.amount / totalAmount : 0;
          const segmentAngle = FULL_CIRCLE * segmentPercentage;
          const endAngle = startAngle + segmentAngle;
          const path = createSectorPath(startAngle, endAngle);
          const definedColor = item.color || "#3B82F6"; // 기본 색상

          // 다음 세그먼트의 시작 각도 업데이트
          const currentStartAngle = startAngle;
          startAngle = endAngle;

          return (
            <path
              key={`${id}-segment-${index}`}
              d={path}
              fill={definedColor}
              strokeWidth={0.5}
              stroke="#ffffff"
              className="transition-opacity hover:opacity-80"
            >
              <title>{`${item.name}: ${numberToKorean(
                item.amount.toString()
              )} (${(segmentPercentage * 100).toFixed(1)}%)`}</title>
            </path>
          );
        })}

        {/* 중앙 컨텐츠 */}
        {centerContent && (
          <foreignObject
            x={CENTER - RADIUS + THICKNESS_PX}
            y={CENTER - RADIUS + THICKNESS_PX}
            width={2 * (RADIUS - THICKNESS_PX)}
            height={2 * (RADIUS - THICKNESS_PX)}
          >
            <div className="flex flex-col items-center justify-center w-full h-full">
              {centerContent}
            </div>
          </foreignObject>
        )}
      </svg>
    </div>
  );
}
