import Link from "next/link";
import { Card, CardContent } from "@web/components/ui/card";
import { TabsContent, TabsTrigger } from "@web/components/ui/tabs";
import { numberToKorean } from "@web/utils/number-format";
import { ChevronRight } from "lucide-react";

interface AssetTabSectionProps {
  value: string;
  label: string;
  total: number;
  detailUrl: string;
  items: Array<{
    id: string | number;
    primaryText: string;
    secondaryText: string;
    value: number;
  }>;
  emptyMessage: string;
}

export function EmptyAssetState() {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-center text-gray-500 dark:text-gray-400">아직 등록된 자산이 없습니다.</p>
      </CardContent>
    </Card>
  );
}

export function AssetTabTrigger({ value, label }: { value: string; label: string }) {
  return (
    <TabsTrigger value={value} className="text-base">
      {label}
    </TabsTrigger>
  );
}

export function AssetTabContent({
  value,
  detailUrl,
  items,
  emptyMessage,
}: Omit<AssetTabSectionProps, "label" | "total">) {
  return (
    <TabsContent value={value} className="mt-4">
      <div className="flex justify-end mb-3">
        <Link
          href={detailUrl}
          className="flex items-center text-sm text-blue-600 dark:text-blue-400 hover:underline"
        >
          상세 보기
          <ChevronRight className="w-4 h-4 ml-1" />
        </Link>
      </div>
      <div className="space-y-3">
        {items.length === 0 ? (
          <p className="text-center text-gray-500 dark:text-gray-400 py-4">{emptyMessage}</p>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              className="flex justify-between items-center p-4 bg-gray-50 dark:bg-gray-700 rounded-lg"
            >
              <div>
                <h4 className="font-medium">{item.primaryText}</h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">{item.secondaryText}</p>
              </div>
              <div className="text-right">
                <p className="font-semibold">{numberToKorean(item.value.toString())}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </TabsContent>
  );
}
