"use client";

import { useState } from "react";
import Link from "next/link";

export default function RealAssetsPage() {
  const [assets, setAssets] = useState([
    { id: 1, type: "", name: "", location: "", purchaseAmount: "", currentValue: "", purchaseDate: "", note: "" }
  ]);

  const addAssetItem = () => {
    const newId = assets.length > 0 ? Math.max(...assets.map(item => item.id)) + 1 : 1;
    setAssets([...assets, { id: newId, type: "", name: "", location: "", purchaseAmount: "", currentValue: "", purchaseDate: "", note: "" }]);
  };

  const removeAssetItem = (id: number) => {
    setAssets(assets.filter(item => item.id !== id));
  };

  const handleChange = (id: number, field: string, value: string) => {
    setAssets(assets.map(item => 
      item.id === id ? { ...item, [field]: value } : item
    ));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Submitted real assets data:", assets);
    // Here you would save the data to your backend
  };

  const assetTypes = ["부동산", "자동차", "귀금속", "예술품", "기타"];

  return (
    <main className="flex flex-col items-center min-h-screen p-8 md:p-24">
      <div className="w-full max-w-4xl">
        <div className="mb-8">
          <Link href="/assets" className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 flex items-center gap-1">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 18-6-6 6-6"/>
            </svg>
            돌아가기
          </Link>
        </div>

        <div className="mb-10">
          <h1 className="text-3xl font-bold mb-4">실물자산 정보 입력</h1>
          <p className="text-gray-600 dark:text-gray-400">
            부동산, 자동차, 귀금속 등의 실물자산 정보를 입력해주세요
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          {assets.map((item) => (
            <div key={item.id} className="mb-8 p-6 bg-white dark:bg-gray-800 rounded-xl shadow-sm">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium">실물자산 항목 #{item.id}</h3>
                {assets.length > 1 && (
                  <button 
                    type="button"
                    onClick={() => removeAssetItem(item.id)}
                    className="text-red-500 hover:text-red-700 dark:hover:text-red-400"
                  >
                    삭제
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    자산 유형
                  </label>
                  <select
                    value={item.type}
                    onChange={(e) => handleChange(item.id, "type", e.target.value)}
                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700"
                    required
                  >
                    <option value="">자산 유형 선택</option>
                    {assetTypes.map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    자산명
                  </label>
                  <input
                    type="text"
                    value={item.name}
                    onChange={(e) => handleChange(item.id, "name", e.target.value)}
                    placeholder="자산 이름 또는 설명"
                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    위치/소재지
                  </label>
                  <input
                    type="text"
                    value={item.location}
                    onChange={(e) => handleChange(item.id, "location", e.target.value)}
                    placeholder="주소 또는 보관 장소"
                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700"
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    구매 금액 (원)
                  </label>
                  <input
                    type="text"
                    value={item.purchaseAmount}
                    onChange={(e) => handleChange(item.id, "purchaseAmount", e.target.value)}
                    placeholder="구매 시 금액"
                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    현재 평가금액 (원)
                  </label>
                  <input
                    type="text"
                    value={item.currentValue}
                    onChange={(e) => handleChange(item.id, "currentValue", e.target.value)}
                    placeholder="현재 시장 가치"
                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700"
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    구매일
                  </label>
                  <input
                    type="date"
                    value={item.purchaseDate}
                    onChange={(e) => handleChange(item.id, "purchaseDate", e.target.value)}
                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700"
                  />
                </div>
                
                <div className="space-y-2 md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    메모
                  </label>
                  <textarea
                    value={item.note}
                    onChange={(e) => handleChange(item.id, "note", e.target.value)}
                    placeholder="추가 정보"
                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700"
                    rows={2}
                  />
                </div>
              </div>
            </div>
          ))}

          <div className="mb-8">
            <button
              type="button"
              onClick={addAssetItem}
              className="w-full p-3 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-400 dark:hover:border-gray-500 transition-colors"
            >
              + 실물자산 항목 추가하기
            </button>
          </div>

          <div className="flex justify-end gap-4">
            <Link 
              href="/assets" 
              className="px-6 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              취소
            </Link>
            <button
              type="submit"
              className="px-6 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors"
            >
              저장하기
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
