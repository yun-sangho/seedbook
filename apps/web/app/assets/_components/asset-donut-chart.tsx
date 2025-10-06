import { ChartContainer, ChartTooltip } from "@web/components/ui/chart";
import { numberToKorean } from "@web/utils/number-format";
import { Cell, Label, Pie, PieChart } from "recharts";

interface AssetData {
  name: string;
  value: number;
  fill: string;
}

interface AssetDonutChartProps {
  chartData: AssetData[];
  netAssets: number;
}

export function AssetDonutChart({ chartData, netAssets }: AssetDonutChartProps) {
  // 차트 설정을 동적으로 생성
  const chartConfig = chartData.reduce(
    (config, item) => {
      config[item.name] = {
        label: item.name,
        color: item.fill,
      };
      return config;
    },
    {} as Record<string, { label: string; color: string }>
  );

  return (
    <ChartContainer config={chartConfig} className="mx-auto aspect-square max-h-[400px]">
      <PieChart>
        <ChartTooltip
          content={({ active, payload }) => {
            if (active && payload && payload.length && payload[0]) {
              const data = payload[0].payload as AssetData;
              return (
                <div className="rounded-lg border bg-background p-3 shadow-md">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: data.fill }} />
                    <span className="font-semibold">{data.name}</span>
                  </div>
                  <div className="text-lg font-bold">{numberToKorean(data.value.toString())}</div>
                </div>
              );
            }
            return null;
          }}
        />
        <Pie
          data={chartData}
          dataKey="value"
          nameKey="name"
          innerRadius={120}
          outerRadius={160}
          strokeWidth={2}
        >
          {chartData.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.fill} />
          ))}
          <Label
            content={({ viewBox }) => {
              if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                return (
                  <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                    <tspan
                      x={viewBox.cx}
                      y={(viewBox.cy ?? 0) - 10}
                      className="fill-foreground text-sm font-medium"
                    >
                      순자산
                    </tspan>
                    <tspan
                      x={viewBox.cx}
                      y={(viewBox.cy ?? 0) + 15}
                      className="fill-foreground text-2xl font-bold"
                    >
                      {numberToKorean(netAssets.toString())}
                    </tspan>
                  </text>
                );
              }
            }}
          />
        </Pie>
      </PieChart>
    </ChartContainer>
  );
}
