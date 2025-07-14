"use client";

import { useId } from "react";
import { ChartData } from "@web/features/savings/utils/chart-utils";
import { numberToKorean } from "@web/utils/number-format";

interface SavingsDonutChartProps {
  data: ChartData[];
  totalAmount: string;
}

export function SavingsDonutChart({ data, totalAmount }: SavingsDonutChartProps) {
  const id = useId();

  // 총 각도 (원: 360도)
  const FULL_CIRCLE = 360;
  // 도넛 차트의 중심점과 반지름
  const CENTER = 50;
  const RADIUS = 40;
  // 도넛 차트의 두께
  const THICKNESS = 25;

  // 각 세그먼트의 시작 각도를 계산
  let startAngle = 0;

  // 총 합계를 계산
  const total = data.reduce((sum, item) => sum + item.amount, 0);

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
    const innerRadius = RADIUS - THICKNESS;
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

  return (
    <div className="flex flex-col items-center">
      <div className="relative flex items-center justify-center mb-4">
        <svg width="100%" height="100%" viewBox="0 0 100 100" className="w-48 h-48">
          <defs>
            {data.map((item, index) => (
              <linearGradient
                key={`gradient-${id}-${index}`}
                id={`gradient-${id}-${index}`}
                x1="0%"
                y1="0%"
                x2="100%"
                y2="100%"
              >
                <stop offset="0%" stopColor={item.color} stopOpacity="0.8" />
                <stop offset="100%" stopColor={item.color} stopOpacity="1" />
              </linearGradient>
            ))}
          </defs>

          {data.length === 0 ? (
            // 데이터가 없는 경우 빈 도넛 차트
            <circle
              cx={CENTER}
              cy={CENTER}
              r={RADIUS - THICKNESS / 2}
              strokeWidth={THICKNESS}
              stroke="#e5e7eb" // 회색으로 빈 도넛 표시
              fill="none"
            />
          ) : (
            // 각 데이터 항목에 대한 도넛 세그먼트 생성
            data.map((item, index) => {
              const percentage = (item.amount / total) * 100;
              const sweep = (percentage / 100) * FULL_CIRCLE;
              const endAngle = startAngle + sweep;
              const path = createSectorPath(startAngle, endAngle);

              // 다음 세그먼트를 위해 시작 각도 업데이트
              const currentStartAngle = startAngle;
              startAngle = endAngle;

              return (
                <path
                  key={`sector-${id}-${index}`}
                  d={path}
                  fill={`url(#gradient-${id}-${index})`}
                  stroke="#ffffff"
                  strokeWidth="0.5"
                  data-tip={`${item.accountName}: ${item.amount.toLocaleString()}원 (${percentage.toFixed(1)}%)`}
                />
              );
            })
          )}

          {/* 중앙 텍스트 - 총 금액 */}
          <text
            x={CENTER}
            y={CENTER - 2}
            textAnchor="middle"
            dominantBaseline="middle"
            className="text-lg font-bold fill-current dark:fill-white"
            fontSize="8"
          >
            {data.length > 0 ? numberToKorean(totalAmount) : "0"}
          </text>
          <text
            x={CENTER}
            y={CENTER + 8}
            textAnchor="middle"
            dominantBaseline="middle"
            className="text-xs fill-gray-500 dark:fill-gray-400"
            fontSize="4"
          >
            총 금액
          </text>
        </svg>
      </div>

      {/* 범례 */}
      <div className="w-full grid grid-cols-2 gap-2 mt-4">
        {data.map((item, index) => (
          <div key={`legend-${index}`} className="flex items-center text-sm">
            <div
              className="w-3 h-3 rounded-sm mr-2 flex-shrink-0"
              style={{ backgroundColor: item.color }}
            />
            <div className="truncate">{item.accountName}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
