import Link from "next/link";
import { BadgeDollarSign, Droplets, Home, Landmark } from "lucide-react";

export default function AssetsPage() {
  return (
    <main className="flex flex-col items-center min-h-screen p-8 md:p-24">
      <div className="w-full max-w-4xl">
        <div className="mb-10 text-center">
          <h1 className="text-3xl font-bold mb-4">자산 현황 입력</h1>
          <p className="text-gray-600 dark:text-gray-400">
            아래 항목을 선택하여 현재 자산 상태를 입력해주세요
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <AssetCard
            title="저축"
            description="예금, 적금, 현금 등"
            color="bg-blue-100 dark:bg-blue-900/30"
            href="/assets/savings"
            icon={<SavingsIcon />}
          />

          <AssetCard
            title="투자"
            description="주식, 채권, 펀드, 가상자산 등"
            color="bg-green-100 dark:bg-green-900/30"
            href="/assets/investments"
            icon={<InvestmentIcon />}
          />

          <AssetCard
            title="실물자산"
            description="부동산, 자동차, 귀금속 등"
            color="bg-amber-100 dark:bg-amber-900/30"
            href="/assets/real-assets"
            icon={<RealAssetsIcon />}
          />

          <AssetCard
            title="대출"
            description="주택담보대출, 신용대출, 카드대출 등"
            color="bg-red-100 dark:bg-red-900/30"
            href="/assets/loans"
            icon={<LoansIcon />}
          />
        </div>

        <div className="flex justify-center mt-10">
          <Link
            href="/dashboard"
            className="px-6 py-3 bg-gray-900 text-white rounded-lg hover:bg-gray-800 dark:bg-gray-700 dark:hover:bg-gray-600 transition-colors"
          >
            자산 대시보드 보기
          </Link>
        </div>
      </div>
    </main>
  );
}

interface AssetCardProps {
  title: string;
  description: string;
  color: string;
  href: string;
  icon: React.ReactNode;
}

function AssetCard({ title, description, color, href, icon }: AssetCardProps) {
  return (
    <Link href={href} className="block">
      <div
        className={`rounded-xl p-6 transition-all hover:shadow-md dark:hover:shadow-gray-800/30 ${color}`}
      >
        <div className="flex items-start gap-4">
          <div className="p-3 bg-white rounded-lg dark:bg-gray-800">{icon}</div>
          <div>
            <h2 className="text-xl font-semibold mb-2">{title}</h2>
            <p className="text-gray-600 dark:text-gray-400">{description}</p>
          </div>
        </div>
      </div>
    </Link>
  );
}

function SavingsIcon() {
  return <Droplets className="w-6 h-6" />;
}

function InvestmentIcon() {
  return <Landmark className="w-6 h-6" />;
}

function RealAssetsIcon() {
  return <Home className="w-6 h-6" />;
}

function LoansIcon() {
  return <BadgeDollarSign className="w-6 h-6" />;
}
