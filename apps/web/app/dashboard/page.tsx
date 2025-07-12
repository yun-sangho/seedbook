import Link from "next/link";

export default function DashboardPage() {
  // This would be populated from your backend API
  const assetSummary = {
    savings: 25000000,
    investments: 45000000,
    realAssets: 350000000,
    loans: -120000000,
    totalNetWorth: 300000000
  };

  return (
    <main className="flex flex-col items-center min-h-screen p-8 md:p-24">
      <div className="w-full max-w-4xl">
        <div className="mb-8">
          <Link href="/assets" className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 flex items-center gap-1">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 18-6-6 6-6"/>
            </svg>
            자산 입력으로 돌아가기
          </Link>
        </div>

        <div className="mb-10">
          <h1 className="text-3xl font-bold mb-4">자산 대시보드</h1>
          <p className="text-gray-600 dark:text-gray-400">
            자산, 부채 현황과 순자산 가치를 한눈에 확인하세요
          </p>
        </div>

        <div className="mb-8 p-6 bg-white dark:bg-gray-800 rounded-xl shadow-sm">
          <h2 className="text-xl font-bold mb-6">순자산 요약</h2>

          <div className="mb-6 p-5 bg-gray-50 dark:bg-gray-700 rounded-lg">
            <h3 className="text-lg font-medium mb-4">총 순자산</h3>
            <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">
              {new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(assetSummary.totalNetWorth)}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 border border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-900/20 rounded-lg">
              <h3 className="text-md font-medium mb-2">총 자산</h3>
              <p className="text-xl font-bold text-green-600 dark:text-green-400">
                {new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(assetSummary.savings + assetSummary.investments + assetSummary.realAssets)}
              </p>
            </div>

            <div className="p-4 border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20 rounded-lg">
              <h3 className="text-md font-medium mb-2">총 부채</h3>
              <p className="text-xl font-bold text-red-600 dark:text-red-400">
                {new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(Math.abs(assetSummary.loans))}
              </p>
            </div>
          </div>
        </div>

        <div className="mb-8 p-6 bg-white dark:bg-gray-800 rounded-xl shadow-sm">
          <h2 className="text-xl font-bold mb-6">자산 분류</h2>

          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-blue-500 rounded-full"></div>
                <span>저축</span>
              </div>
              <div className="flex flex-col items-end">
                <span className="font-semibold">
                  {new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(assetSummary.savings)}
                </span>
                <span className="text-sm text-gray-500">
                  {Math.round(assetSummary.savings / (assetSummary.savings + assetSummary.investments + assetSummary.realAssets) * 100)}%
                </span>
              </div>
            </div>

            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-green-500 rounded-full"></div>
                <span>투자</span>
              </div>
              <div className="flex flex-col items-end">
                <span className="font-semibold">
                  {new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(assetSummary.investments)}
                </span>
                <span className="text-sm text-gray-500">
                  {Math.round(assetSummary.investments / (assetSummary.savings + assetSummary.investments + assetSummary.realAssets) * 100)}%
                </span>
              </div>
            </div>

            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-amber-500 rounded-full"></div>
                <span>실물자산</span>
              </div>
              <div className="flex flex-col items-end">
                <span className="font-semibold">
                  {new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(assetSummary.realAssets)}
                </span>
                <span className="text-sm text-gray-500">
                  {Math.round(assetSummary.realAssets / (assetSummary.savings + assetSummary.investments + assetSummary.realAssets) * 100)}%
                </span>
              </div>
            </div>

            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-red-500 rounded-full"></div>
                <span>대출</span>
              </div>
              <div className="flex flex-col items-end">
                <span className="font-semibold text-red-600">
                  {new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(Math.abs(assetSummary.loans))}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-center">
          <Link 
            href="/assets" 
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            자산 정보 업데이트하기
          </Link>
        </div>
      </div>
    </main>
  );
}
