import { useDebtsStore } from "@web/features/debts/stores/debts-store";
import { useInvestmentStore } from "@web/features/investments/stores/investment-store";
import { useRealAssetsStore } from "@web/features/real-assets/stores/real-assets-store";
import { useSavingsStore } from "@web/features/savings/stores/savings-store";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useProgressStore } from "../stores/progress-store";
import { startAutoProgressTracking } from "./auto-progress-tracker";

describe("auto-progress-tracker", () => {
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    // 모든 store 초기화
    useInvestmentStore.getState().resetStore?.();
    useSavingsStore.getState().resetStore?.();
    useRealAssetsStore.getState().resetStore?.();
    useDebtsStore.setState({ debts: [], lastDebtId: 0 });
    useProgressStore.getState().clearProgressPoints();

    // 타이머 mock 설정
    vi.useFakeTimers();
  });

  afterEach(() => {
    // cleanup 함수 실행
    if (cleanup) {
      cleanup();
      cleanup = undefined;
    }

    // 타이머 복원
    vi.restoreAllMocks();
  });

  it("투자 금액 변경 시 progress point가 자동 생성된다", async () => {
    cleanup = startAutoProgressTracking();

    // 투자 추가
    useInvestmentStore.getState().addInvestmentWithTypeAndOwner("증권계좌", "홍길동");
    const investments = useInvestmentStore.getState().investments;
    const investmentId = investments[0]?.id || 1;

    // 투자 금액 업데이트
    useInvestmentStore.getState().updateInvestment(investmentId, "currentValue", 100000);

    // debounce 대기 (500ms)
    vi.advanceTimersByTime(500);

    // progress point 생성 확인
    const points = useProgressStore.getState().progressPoints;
    expect(points.length).toBe(1);
    expect(points[0]?.investments).toBe(100000);
    expect(points[0]?.totalAssets).toBe(100000);
  });

  it("저축 금액 변경 시 progress point가 자동 생성된다", async () => {
    cleanup = startAutoProgressTracking();

    // 저축 추가
    useSavingsStore.getState().addSavingsWithTypeAndOwner("예금", "홍길동");
    const savings = useSavingsStore.getState().savings;
    const savingsId = savings[0]?.id || 1;

    // 저축 금액 업데이트
    useSavingsStore.getState().updateSavings(savingsId, "balance", 50000);

    // debounce 대기
    vi.advanceTimersByTime(500);

    // progress point 생성 확인
    const points = useProgressStore.getState().progressPoints;
    expect(points.length).toBe(1);
    expect(points[0]?.savings).toBe(50000);
    expect(points[0]?.totalAssets).toBe(50000);
  });

  it("실물자산 금액 변경 시 progress point가 자동 생성된다", async () => {
    cleanup = startAutoProgressTracking();

    // 실물자산 추가
    useRealAssetsStore.getState().addRealAsset();
    const realAssets = useRealAssetsStore.getState().realAssets;
    const assetId = realAssets[0]?.id || 1;

    // 실물자산 금액 업데이트
    useRealAssetsStore.getState().updateRealAsset(assetId, "currentValue", 200000);

    // debounce 대기
    vi.advanceTimersByTime(500);

    // progress point 생성 확인
    const points = useProgressStore.getState().progressPoints;
    expect(points.length).toBe(1);
    expect(points[0]?.realAssets).toBe(200000);
    expect(points[0]?.totalAssets).toBe(200000);
  });

  it("대출 금액 변경 시 progress point가 자동 생성된다", async () => {
    cleanup = startAutoProgressTracking();

    // 대출 추가
    useDebtsStore.getState().addDebt();
    const loans = useDebtsStore.getState().debts;
    const loanId = loans[0]?.id || 1;

    // 대출 금액 업데이트
    useDebtsStore.getState().updateDebt(loanId, "amount", 30000);

    // debounce 대기
    vi.advanceTimersByTime(500);

    // progress point 생성 확인
    const points = useProgressStore.getState().progressPoints;
    expect(points.length).toBe(1);
    expect(points[0]?.loans).toBe(30000);
    expect(points[0]?.netAssets).toBe(-30000); // 총자산 0 - 대출 30000
  });

  it("여러 store 동시 변경 시 하나의 progress point로 병합된다 (debounce)", async () => {
    cleanup = startAutoProgressTracking();

    // 투자 추가
    useInvestmentStore.getState().addInvestmentWithTypeAndOwner("증권계좌", "홍길동");
    const investments = useInvestmentStore.getState().investments;
    const investmentId = investments[0]?.id || 1;
    useInvestmentStore.getState().updateInvestment(investmentId, "currentValue", 100000);

    // 100ms 후 저축 추가
    vi.advanceTimersByTime(100);
    useSavingsStore.getState().addSavingsWithTypeAndOwner("예금", "홍길동");
    const savings = useSavingsStore.getState().savings;
    const savingsId = savings[0]?.id || 1;
    useSavingsStore.getState().updateSavings(savingsId, "balance", 50000);

    // 200ms 후 대출 추가
    vi.advanceTimersByTime(200);
    useDebtsStore.getState().addDebt();
    const loans = useDebtsStore.getState().debts;
    const loanId = loans[0]?.id || 1;
    useDebtsStore.getState().updateDebt(loanId, "amount", 30000);

    // 마지막 변경으로부터 500ms 대기
    vi.advanceTimersByTime(500);

    // 하나의 progress point만 생성되어야 함
    const points = useProgressStore.getState().progressPoints;
    expect(points.length).toBe(1);
    expect(points[0]?.investments).toBe(100000);
    expect(points[0]?.savings).toBe(50000);
    expect(points[0]?.loans).toBe(30000);
    expect(points[0]?.totalAssets).toBe(150000); // 투자 + 저축
    expect(points[0]?.netAssets).toBe(120000); // 총자산 - 대출
  });

  it("같은 날짜의 progress point는 병합된다", async () => {
    cleanup = startAutoProgressTracking();

    // 첫 번째 변경
    useInvestmentStore.getState().addInvestmentWithTypeAndOwner("증권계좌", "홍길동");
    const investments = useInvestmentStore.getState().investments;
    const investmentId = investments[0]?.id || 1;
    useInvestmentStore.getState().updateInvestment(investmentId, "currentValue", 100000);

    vi.advanceTimersByTime(500);

    // 같은 날 두 번째 변경
    useInvestmentStore.getState().updateInvestment(investmentId, "currentValue", 150000);

    vi.advanceTimersByTime(500);

    // 같은 날짜는 병합되어 1개만 존재
    const points = useProgressStore.getState().progressPoints;
    expect(points.length).toBe(1);
    expect(points[0]?.investments).toBe(150000); // 최신 값으로 업데이트
  });

  it("cleanup 함수 호출 시 구독이 해제된다", async () => {
    cleanup = startAutoProgressTracking();

    // cleanup 호출
    cleanup();
    cleanup = undefined;

    // 변경사항 발생
    useInvestmentStore.getState().addInvestmentWithTypeAndOwner("증권계좌", "홍길동");
    const investments = useInvestmentStore.getState().investments;
    const investmentId = investments[0]?.id || 1;
    useInvestmentStore.getState().updateInvestment(investmentId, "currentValue", 100000);

    vi.advanceTimersByTime(500);

    // progress point가 생성되지 않아야 함
    const points = useProgressStore.getState().progressPoints;
    expect(points.length).toBe(0);
  });

  it("총액이 변하지 않으면 progress point가 생성되지 않는다", async () => {
    cleanup = startAutoProgressTracking();

    // 투자 추가 (currentValue는 0)
    useInvestmentStore.getState().addInvestmentWithTypeAndOwner("증권계좌", "홍길동");
    const investments = useInvestmentStore.getState().investments;
    const investmentId = investments[0]?.id || 1;

    // 이름만 변경 (총액은 변화 없음)
    useInvestmentStore.getState().updateInvestment(investmentId, "accountName", "새 이름");

    vi.advanceTimersByTime(500);

    // progress point가 생성되지 않아야 함
    const points = useProgressStore.getState().progressPoints;
    expect(points.length).toBe(0);
  });

  it("계좌 삭제 시 이전 날짜의 progress point들은 유지되어야 함", async () => {
    cleanup = startAutoProgressTracking();

    // 테스트 시작 날짜 설정
    vi.setSystemTime(new Date("2024-01-01"));

    // 첫 번째 날짜에 투자 추가
    useInvestmentStore.getState().addInvestmentWithTypeAndOwner("증권계좌", "홍길동");
    const investments = useInvestmentStore.getState().investments;
    const investmentId = investments[0]?.id || 1;
    useInvestmentStore.getState().updateInvestment(investmentId, "currentValue", 100000);

    vi.advanceTimersByTime(500);

    // 날짜 변경 (다음 날로)
    vi.setSystemTime(new Date("2024-01-02"));

    // 두 번째 날짜에 저축 추가
    useSavingsStore.getState().addSavingsWithTypeAndOwner("예금", "홍길동");
    const savings = useSavingsStore.getState().savings;
    const savingsId = savings[0]?.id || 1;
    useSavingsStore.getState().updateSavings(savingsId, "balance", 50000);

    vi.advanceTimersByTime(500);

    // 세 번째 날짜에 실물자산 추가
    vi.setSystemTime(new Date("2024-01-03"));
    useRealAssetsStore.getState().addRealAsset();
    const realAssets = useRealAssetsStore.getState().realAssets;
    const assetId = realAssets[0]?.id || 1;
    useRealAssetsStore.getState().updateRealAsset(assetId, "currentValue", 200000);

    vi.advanceTimersByTime(500);

    // progress point 3개 생성 확인
    let points = useProgressStore.getState().progressPoints;
    expect(points.length).toBe(3);
    expect(points[0]?.date).toBe("2024-01-01");
    expect(points[0]?.investments).toBe(100000);
    expect(points[1]?.date).toBe("2024-01-02");
    expect(points[1]?.savings).toBe(50000);
    expect(points[2]?.date).toBe("2024-01-03");
    expect(points[2]?.realAssets).toBe(200000);

    // 네 번째 날짜에 투자 계좌 삭제
    vi.setSystemTime(new Date("2024-01-04"));
    useInvestmentStore.getState().removeInvestment(investmentId);

    vi.advanceTimersByTime(500);

    // 계좌 삭제 시 새로운 progress point가 생성되지만
    // 이전 날짜의 progress point들은 유지되어야 함
    points = useProgressStore.getState().progressPoints;
    expect(points.length).toBe(4); // 새로운 progress point가 추가됨
    expect(points[0]?.date).toBe("2024-01-01"); // 첫 번째 날짜 유지
    expect(points[0]?.investments).toBe(100000); // 기존 값 유지
    expect(points[1]?.date).toBe("2024-01-02"); // 두 번째 날짜 유지
    expect(points[1]?.savings).toBe(50000); // 기존 값 유지
    expect(points[2]?.date).toBe("2024-01-03"); // 세 번째 날짜 유지
    expect(points[2]?.realAssets).toBe(200000); // 기존 값 유지
    expect(points[3]?.date).toBe("2024-01-04"); // 새로운 progress point
    expect(points[3]?.investments).toBe(0); // 삭제 후 0
    expect(points[3]?.savings).toBe(50000); // 기존 유지
    expect(points[3]?.realAssets).toBe(200000); // 기존 유지
  });

  it("저축 계좌 삭제 시 progress point가 업데이트된다", async () => {
    cleanup = startAutoProgressTracking();

    // 저축 추가 및 금액 설정
    useSavingsStore.getState().addSavingsWithTypeAndOwner("예금", "홍길동");
    const savings = useSavingsStore.getState().savings;
    const savingsId = savings[0]?.id || 1;
    useSavingsStore.getState().updateSavings(savingsId, "balance", 50000);

    vi.advanceTimersByTime(500);

    // progress point 생성 확인
    let points = useProgressStore.getState().progressPoints;
    expect(points.length).toBe(1);
    expect(points[0]?.savings).toBe(50000);
    expect(points[0]?.totalAssets).toBe(50000);

    // 저축 계좌 삭제
    useSavingsStore.getState().removeSavings(savingsId);

    vi.advanceTimersByTime(500);

    // 계좌 삭제 시 새로운 progress point가 생성되어 기존 값이 업데이트됨
    points = useProgressStore.getState().progressPoints;
    expect(points.length).toBe(1);
    expect(points[0]?.savings).toBe(0); // 삭제 후 0으로 업데이트
    expect(points[0]?.totalAssets).toBe(0); // 삭제 후 0으로 업데이트
  });

  it("실물자산 삭제 시 progress point가 업데이트된다", async () => {
    cleanup = startAutoProgressTracking();

    // 실물자산 추가 및 금액 설정
    useRealAssetsStore.getState().addRealAsset();
    const realAssets = useRealAssetsStore.getState().realAssets;
    const assetId = realAssets[0]?.id || 1;
    useRealAssetsStore.getState().updateRealAsset(assetId, "currentValue", 200000);

    vi.advanceTimersByTime(500);

    // progress point 생성 확인
    let points = useProgressStore.getState().progressPoints;
    expect(points.length).toBe(1);
    expect(points[0]?.realAssets).toBe(200000);
    expect(points[0]?.totalAssets).toBe(200000);

    // 실물자산 삭제
    useRealAssetsStore.getState().removeRealAsset(assetId);

    vi.advanceTimersByTime(500);

    // 계좌 삭제 시 새로운 progress point가 생성되어 기존 값이 업데이트됨
    points = useProgressStore.getState().progressPoints;
    expect(points.length).toBe(1);
    expect(points[0]?.realAssets).toBe(0); // 삭제 후 0으로 업데이트
    expect(points[0]?.totalAssets).toBe(0); // 삭제 후 0으로 업데이트
  });

  it("대출 삭제 시 progress point가 업데이트된다", async () => {
    cleanup = startAutoProgressTracking();

    // 대출 추가 및 금액 설정
    useDebtsStore.getState().addDebt();
    const loans = useDebtsStore.getState().debts;
    const loanId = loans[0]?.id || 1;
    useDebtsStore.getState().updateDebt(loanId, "amount", 30000);

    vi.advanceTimersByTime(500);

    // progress point 생성 확인
    let points = useProgressStore.getState().progressPoints;
    expect(points.length).toBe(1);
    expect(points[0]?.loans).toBe(30000);
    expect(points[0]?.netAssets).toBe(-30000);

    // 대출 삭제
    useDebtsStore.getState().removeDebt(loanId);

    vi.advanceTimersByTime(500);

    // 계좌 삭제 시 새로운 progress point가 생성되어 기존 값이 업데이트됨
    points = useProgressStore.getState().progressPoints;
    expect(points.length).toBe(1);
    expect(points[0]?.loans).toBe(0); // 삭제 후 0으로 업데이트
    expect(points[0]?.netAssets).toBe(0); // 삭제 후 0으로 업데이트
  });
});
