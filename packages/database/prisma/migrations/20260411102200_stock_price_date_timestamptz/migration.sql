-- 기존 DATE 컬럼은 "KST 기준 거래일" 을 의미했다 (크롤러는 KST 16:30 트리거라
-- UTC 기준 같은 달력일이었음). 새 TIMESTAMPTZ(3) 컬럼은 "해당 거래일의 KST 자정"
-- 을 canonical instant 로 저장한다. 즉 `'2026-04-10'::date` 를 그대로
-- `timestamptz` 로 캐스팅하면 세션 TZ (= UTC) 기준 00:00 으로 해석되어 9h 어긋난다.
-- `AT TIME ZONE 'Asia/Seoul'` 로 명시해서 KST 자정으로 변환한다.
ALTER TABLE "StockPrice"
  ALTER COLUMN "date" SET DATA TYPE TIMESTAMPTZ(3)
  USING "date"::timestamp AT TIME ZONE 'Asia/Seoul';
