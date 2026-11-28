# 동기화 시스템 전체 점검 + 스키마 진화 구조 설계

> 작성일 2026-11-28. 결정의 원본은 이 문서다 (조사 워크트리 `research-native-deploy` 에서 옮겨 보존).

> 작성: 2026-11-28, 워크트리 `research-native-deploy` (조사 전용, 커밋하지 않음)
> 함께 볼 문서: `native-deploy.md`. 그 문서의 결론(앱 번들 구조)이 서면 여러 앱 버전이 같은 API 를 오래 쓰게 된다. 그때 동기화는 **가장 중요한 핵심 시스템**이 된다.
> 표기:
> - **확인** = 코드로 흐름을 확인했다.
> - **재현 필요** = 코드 흐름상 그렇게 되지만 테스트로 재현하지는 않았다.
> - **미확인** = 확인하지 못했다.

---

## 0. 결론

**지금 동기화 엔진의 핵심 설계는 건전하다.**

- 바뀐 항목만 보내는 outbox 와 seq 확인.
- 톰스톤.
- 커서 + version 으로 중복을 거른다.
- 저장 어댑터에서 변경을 기록하므로, 엔진이 꺼져 있어도 편집이 남는다.
- 서버 쓰기는 멱등이다.

그런데 **스키마가 바뀌는 순간 데이터를 잃는 구조적 약점**이 세 가지 있다. 그리고 같은 데이터 모양을 **8~10곳에 손으로 반복**해 적고 있어서, 스키마를 바꿀 때마다 그중 하나를 빠뜨릴 위험이 크다.

**데이터 손실 경로 (우선순위순)**

1. **[치명] local 모드 앱에서 검증에 실패한 항목은 기기에서 삭제된다.** (확인)
   - 기기 SQLite 저장(`lib/native/device-db/table-envelopes.ts`)은 서버 검증 함수(`parseInvestmentFields` 등)를 통과한 항목만 남긴다. 나머지는 `deleteMissing` 으로 **DELETE** 한다.
   - local 모드에서는 기기가 유일한 사본이다.
   - 앞으로 서버 검증이 엄격해지거나, 입력 중 값(NaN 등)이 store 에 들어가면, 다음 저장 때 계좌 전체가 사라진다.
2. **[치명] 옛 클라이언트가 모르는 필드를 지운다.** (확인)
   - 클라이언트 `fromData`/`toData` 는 아는 필드만 골라 옮긴다 (`features/*/sync/*-sync-config.ts`).
   - 서버 `parse*Fields` 는 빠진 필드를 기본값으로 채운다 (`sellCostPercent ?? 0`). 하위 목록(보유 종목·배분·기록)은 매번 통째로 지우고 다시 넣는다 (`writeInvestmentChildren`, `writeChildren`).
   - 결과: 새 버전이 더한 필드를, 옛 버전 기기가 편집 한 번으로 기본값으로 되돌린다. pull 을 타고 모든 기기로 퍼진다.
3. **[높음] local → cloud 전환 때 검증 실패 항목이 조용히 사라진다.** (재현 필요)
   - 업로드 번역기는 깨진 항목을 `continue` 로 건너뛴다.
   - 전환 뒤 cloud 첫 로드는 "서버 + outbox 에 있는 항목"으로 목록을 새로 만든다 (`mergePullResponse` 전체 pull 분기).
   - 그래서 건너뛴 항목은 기기에서도 빠진다.
4. **[높음] 서버가 거부한 편집이 사용자에게 알림 없이 사라진다.** (확인)
   - `rejected` 면 커서를 지우고 전체 pull 로 서버 상태로 되돌린다 (`applyMutationResults` → `pull()`).
   - 의도된 동작이지만 표시가 없다. 버전 어긋남 때는 정상 편집이 거부될 수 있다.
5. **[중간] 계좌 단위 마지막 저장이 이김 + 하위 목록 통째 교체.** (확인, 정책상 의도)
   - 오프라인 기기가 보유 종목 A 를, 다른 기기가 B 를 고치면, 나중에 올라온 쪽이 계좌 전체를 덮어 다른 편집이 사라진다.
   - 앱 번들로 오프라인 편집이 쉬워지면 실제로 일어나기 쉬워진다.

**권장 구조 한 줄**: 도메인마다 **엔티티 정의 하나**(`packages/domain`)에서 서버 검증·DB 행 변환·클라이언트 변환·기기 SQLite 매핑·백업 형식을 모두 끌어낸다. 그리고 다섯 가지 규칙으로 고정한다.

- **절대 지우지 않는다**: 검증 실패는 격리하고 삭제하지 않는다.
- **모르는 필드는 보존한다**: 왕복할 때 그대로 돌려준다.
- **빠진 필드는 건드리지 않는다**: 서버는 받은 필드만 바꾼다.
- **서버 쓰기 경로는 하나다**: envelope 번역기를 걷어내고 mutation 으로 일원화한다.
- **옛 클라이언트 재생 테스트**: 과거 버전의 payload 를 픽스처로 남겨 매번 돌린다.

---

## 1. 현재 구조 지도

### 1.1 데이터가 오가는 길 (확인)

```
store (zustand persist, 버전: 투자 6 · 포트폴리오 3 · 리밸런싱 1)
  │  createHybridStorage (lib/hybrid-storage.ts) — 모드는 페이지 로드 때 한 번 고정
  ├─ local 모드 ─ accountStorage ─┬─ 브라우저: localStorage 에 envelope JSON 그대로
  │                               └─ 앱: table-envelopes.ts → 서버 record 함수로 검증·행 변환 → SQLite 테이블
  │                                    (읽을 때 envelope version 4/3 으로 돌려줌 → store migrate 가 매번 돎)
  └─ cloud 모드 ─ 캐시(위와 같은 저장소) + recordPersistedChange → outbox(SyncMeta, accountStorage)
         │ EntitySyncRunner / entity-sync-engine.ts
         ├─ POST /api/sync/mutations → applyMutation → parse*Fields → createEntityRepo.upsert/remove
         │      (LWW upsert, version+1, writeChildren 통째 교체, afterChange: 계좌↔포트폴리오 연결)
         └─ GET /api/sync/pull?since= → updatedAt > since-5s 인 행 + listOrder → mergePull

모드 전환 (lib/storage-migration.ts)
  local→cloud: 로컬 envelope ∪ GET /api/storage/[key] → PUT /api/storage/[key] (_translators → repo.upsert, 빠진 id 톰스톤)
  cloud→local: GET envelope ∪ 로컬 → 기기 저장
  백업 가져오기·데모 데이터: 같은 envelope 번역기
```

### 1.2 데이터 모양이 적혀 있는 곳 — 스키마 변경 하나에 고칠 곳

| #   | 위치                                                                                           | 역할                               |
| --- | ---------------------------------------------------------------------------------------------- | ---------------------------------- |
| 1   | `packages/database/src/schema.ts` + drizzle 마이그레이션                                       | 서버 테이블                        |
| 2   | `server/<domain>/*-record.ts` (`parse*Fields`, `*FieldsToColumns`, `*RowToData`, `*ChildRows`) | 서버 검증·행 변환 (기기도 이걸 씀) |
| 3   | `server/<domain>/*-sync.ts` (`conflictSet`, `writeChildren`, `toData`)                         | 서버 저장 규칙                     |
| 4   | `features/<domain>/sync/*-sync-config.ts` (`toData`/`fromData`)                                | 클라이언트 ↔ 전송 형식             |
| 5   | `features/<domain>/types` + store persist `migrate`                                            | 클라이언트 모델·로컬 캐시 진화     |
| 6   | `app/api/storage/_translators/*.ts` (envelope VERSION)                                         | 모드 전환·백업 경로                |
| 7   | `lib/native/device-db/migrations.ts` + `table-envelopes.ts` (SQL 문 직접 작성)                 | 앱 SQLite                          |
| 8   | `lib/storage-merge.ts` (`LIST_FIELDS`, 식물 규칙)                                              | 모드 전환 병합                     |
| 9   | 백업 형식 2.0 + `seed-data/user-data.json` ×2                                                  | 백업·시드                          |
| 10  | `packages/database/src/account-portfolio-links.ts` 등 파생 규칙                                | 서버 파생 데이터                   |

`sellCostPercent` 하나를 더할 때도 1~9 대부분을 손으로 고쳐야 했다.

- `migrations.test.ts` 가 7 의 컬럼을 서버와 비교하는 것 말고는 **서로 맞는지 검사하는 장치가 없다.**
- 예: 4 에서 필드를 빠뜨려도 테스트가 통과한다. 그 결과가 손실 경로 2 다.

### 1.3 "버전"이 다섯 종류다

1. **store persist version**: 투자 6, 포트폴리오 3, 리밸런싱 1. 로컬 캐시 모양.
2. **envelope VERSION**: 번역기·기기는 투자 4, 포트폴리오 3. 서버·기기가 돌려주는 모양. store 가 매번 4→6 migrate 를 돈다.
3. **행 `version`**: 동기화 중복 제거용.
4. **기기 스키마 version**: SQLite 마이그레이션.
5. **drizzle 마이그레이션 번호**.

**전송 프로토콜 버전과 클라이언트 버전은 어디에도 없다.** 그래서 서버가 "이 요청은 옛 클라이언트가 보냈다"는 걸 알 수 없다.

---

## 2. 점검 결과 (영역별)

심각도: 치명 / 높음 / 중간 / 낮음.

### 2.1 저장·검증

| 심각도 | 발견                                                              | 근거                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------ | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 치명   | 기기 SQLite 저장이 검증 실패 항목을 DELETE (local 모드 유일 사본) | `table-envelopes.ts` `investmentStatements`: `parseInvestmentFields` 실패 → `ids` 에서 빠짐 → `deleteMissing("investment_account", ids)`. 하위 테이블은 전부 지우고 통과한 것만 다시 넣는다. 포트폴리오(`parsePortfolioFields` → `deleteMissing("portfolio")`)·리밸런싱(`parseRebalancingFields` → `deleteMissing("rebalancing")`)도 같은 패턴 (확인, 실제 재현 테스트는 PR 1 에서)                                                                           |
| 높음   | store 에 검증 밖 값이 들어갈 수 있다                              | `investmentsSyncConfig.toData` 주석: "입력 도중의 NaN 은 0 으로 보낸다". 동기화 경로는 정리하지만 기기 저장은 store 원본을 검증한다. store API 는 NaN 을 막지 않는다: `updateStockHolding(…, "quantity", "")` → `parseNumericString("")` = `parseFloat("")` = NaN (확인). 지금 `/m` 의 수량 시트는 숫자를 넘겨서, 현재 화면 경로로 바로 일어나지는 않는 것으로 보인다 (호출부 1곳 확인). **잠재 위험**: 다른 입력 경로가 생기거나 검증을 강화하면 바로 터진다 |
| 높음   | 검증 강화 = 기존 데이터 거부                                      | 서버·기기가 같은 `parse*` 를 쓰므로, 규칙을 엄격하게 하면 이미 저장된 데이터가 다음 저장 때 거부·삭제된다                                                                                                                                                                                                                                                                                                                                                     |

### 2.2 전송·호환

| 심각도 | 발견                                             | 근거                                                                                                                |
| ------ | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| 치명   | 모르는 필드 누락 → 기본값으로 덮어씀 (루트 컬럼) | `fromData` 가 아는 필드만 옮김, `parseInvestmentFields` 가 `?? 0`, `createEntityRepo.upsert` 가 `set: columns` 전체 |
| 치명   | 하위 목록의 새 필드도 사라짐                     | `writeInvestmentChildren` 이 delete 후 insert. 루트 컬럼만 "빠지면 유지"로 바꿔도 holdings 의 새 필드는 지워진다    |
| 높음   | 프로토콜·클라이언트 버전 식별 없음               | 요청 헤더·payload 어디에도 없음 → 서버가 옛 클라이언트를 구분하거나 막을 수 없다                                    |
| 높음   | 거부가 조용히 처리됨                             | `sendOnce`: `rejected > 0` 이면 `pull()` 로 덮고 `markSaved`. 사용자 표시 없음, 서버 로그 없음                      |
| 중간   | 거부 사유가 `invalid` 하나                       | 어느 필드가 왜 틀렸는지 없음 → 운영 중 원인 추적 불가                                                               |

### 2.3 변경 피드 (pull)

| 심각도 | 발견                                                          | 근거                                                                                                                                                                        |
| ------ | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 중간   | 커서가 앱 서버 시계(`new Date()`) 기반 `updatedAt` + 5초 겹침 | `entity-repo.ts`, `pull.ts`. 트랜잭션이 5초 넘게 늦게 커밋되거나, 웹 컨테이너가 둘이 되어(blue/green) 시계가 다르면 변경을 놓칠 수 있다. 지금 규모·단일 컨테이너에서는 낮음 |
| 중간   | 톰스톤·`versions` 맵이 계속 자람                              | 정리 정책 없음. 톰스톤을 지우려면 "커서가 너무 오래됨 → 전체 다시 받기" 응답이 먼저 있어야 한다                                                                             |
| 낮음   | pull 이 한 번에 전체를 돌려줌 (페이지 없음)                   | 데이터가 작아 당장은 문제없음                                                                                                                                               |
| 낮음   | `listOrder` 는 version·톰스톤 없이 LWW                        | 정책상 충분                                                                                                                                                                 |

### 2.4 동시성·충돌

| 심각도      | 발견                                                              | 근거                                                                                                                                                                                                                                         |
| ----------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 중간 → 낮음 | 계좌·포트폴리오 단위 LWW, 하위 목록 통째 교체                     | 정책(`types.ts` "자산은 본인만 수정") 상 의도. 오프라인이 길어지면 두 기기의 다른 보유 종목 편집 중 하나가 사라진다. 동시 편집이 드물어 충돌보다 "옛 앱·오래된 사본이 하위 목록의 새 필드를 덮는" 쪽이 실제 위험 (sync-architecture.md §0.1) |
| 낮음        | 포트폴리오 식물은 서버가 "더 자란 쪽"을 지킴 (`keepFurtherPlant`) | 필드 단위 병합의 좋은 선례. 일반화할 가치가 있다                                                                                                                                                                                             |
| 낮음        | mutation 마다 따로 트랜잭션, 요청 중간 실패 시 전체 재전송        | 멱등이라 안전 (확인)                                                                                                                                                                                                                         |

### 2.5 모드 전환·쓰기 경로

| 심각도 | 발견                                          | 근거                                                                                                                                                                                                      |
| ------ | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 높음   | 서버 쓰기 경로가 둘 (mutation / envelope PUT) | 번역기가 `investmentRepo.upsert` 를 재사용해 규칙은 대체로 같다. 다만 "목록에 없는 id 톰스톤", list order·`holdingsSortOption` 덮어쓰기 같은 다른 의미가 있다. 스키마가 바뀌면 두 경로를 같이 고쳐야 한다 |
| 높음   | local→cloud 전환에서 깨진 항목 누락 (§0-3)    | 번역기 `if (!fields) continue` + 전환 뒤 전체 pull 이 outbox 밖 로컬 항목을 버림                                                                                                                          |
| 중간   | 업로드 GET→PUT 사이 경쟁                      | 다른 기기가 그 사이에 엔티티 동기화로 바꾼 값을 GET 시점의 값으로 다시 쓴다. 전환은 드물어 낮은 빈도                                                                                                      |
| 낮음   | 전환 실패 시 재시도해도 수렴                  | 합치기가 멱등이라고 주석에 적혀 있다 (확인)                                                                                                                                                               |

### 2.6 운영·관측

| 심각도 | 발견                                                                                                            |
| ------ | --------------------------------------------------------------------------------------------------------------- |
| 높음   | 거부·실패·재시도 횟수를 서버도 클라이언트도 기록하지 않는다. 운영 중 "누구 데이터가 왜 사라졌나"를 답할 수 없다 |
| 중간   | 재시도 backoff·제한 시간 없음 (`native-deploy.md` §B5.2)                                                        |
| 중간   | 동기화 테이블 백업·복원 절차(Supabase PITR 여부) 문서 없음 (미확인)                                             |

### 2.7 잘 되어 있는 것 (유지)

- outbox 의 seq 확인으로 "보내는 동안 다시 바뀐 편집"을 지키고, 엔티티당 최신 하나만 보낸다.
- 저장 어댑터에서 변경을 기록하므로 엔진·로그인 상태와 무관하게 편집이 남는다.
- 계정별 저장 자리, 다른 사용자의 outbox 는 버린다.
- 서버 upsert·delete 가 멱등이고, 남의 id 는 `forbidden` 이다.
- pull 겹침 구간과 version 으로 중복을 거른다.
- 식물 단계 "내려가지 않음" 규칙은 서버·모드 전환 병합 양쪽에 있다.
- 기기 스키마가 서버 컬럼과 같은지 테스트한다.

---

## 3. 목표 구조 — 스키마가 바뀌어도 계속 안정적인 동기화

### 3.1 원칙 (CLAUDE.md "동기화 규칙"으로 고정)

1. **사용자 데이터는 검증 때문에 지우지 않는다.**
   - 검증 실패는 정리(normalize)하거나 격리(quarantine)한다. 삭제는 사용자의 삭제 동작과 톰스톤으로만 일어난다.
2. **모르는 것은 보존한다.**
   - 클라이언트는 서버에서 받은 엔티티의 모르는 필드를 그대로 갖고 있다가 보낼 때 돌려준다. 하위 항목도 id 별로 같다.
3. **빠진 것은 바꾸지 않는다.**
   - 서버는 payload 에 **있는 필드만** 갱신한다. 새 행을 만들 때만 기본값을 쓴다.
   - 하위 목록은 "보낸 목록에 없는 id 는 삭제, 있는 id 는 받은 필드만 갱신"으로 병합한다.
4. **추가 → 이전 → 정리 (expand/contract).**
   - 필드 이름 변경·삭제·의미 변경·검증 강화는 `minSupportedVersion` 을 올린 뒤에 한다. 전송 형식에서 필드를 재사용하지 않는다.
5. **쓰기 경로는 하나다.**
   - 서버 자산 테이블에 쓰는 것은 `applyMutation` 뿐이다. 모드 전환·백업 가져오기·데모 데이터는 mutation 묶음으로 바꿔 보낸다.
6. **모든 거부는 보인다.**
   - 서버는 거부 사유(필드 경로 포함)를 돌려주고 로그를 남긴다. 클라이언트는 거부된 편집을 기기에 격리하고, 홈에 "일부 변경을 저장하지 못했어요"만 표시한다 (건수·목록 없음, sync-architecture.md §5.8).

### 3.2 엔티티 정의 한 곳 (`packages/domain`)

도메인마다 정의 하나를 둔다. 라이브러리 없이 작은 자체 DSL 로 쓰거나 zod 4 를 쓴다. 의존성 추가는 판단이 필요하다.

```ts
// packages/domain/src/entities/investment.ts (개념 예시)
export const investmentEntity = defineEntity({
  name: "investment",
  table: "investment_account",
  fields: {
    accountName: text({ max: 100 }),
    currency: text(),
    currentValue: money(), // NaN/Infinity → 0 으로 정리 (거부 아님)
    sellCostPercent: percent({ since: 3, default: 0, clamp: [0, 99.99] }),
    note: text({ default: "" }),
  },
  children: {
    holdings: collection("stock_holding", {
      id: uuid(),
      fields: { ticker: text(), quantity: decimal(), memo: text({ default: "" }) },
    }),
  },
});
```

이 정의 하나에서 아래를 끌어낸다. 손으로 쓰던 것들을 대체한다.

| 끌어낼 것                                                                                 | 대체하는 지금 코드                         |
| ----------------------------------------------------------------------------------------- | ------------------------------------------ |
| `parse(data)` → `{ fields(있는 것만), normalized, errors[] }` (필드 단위 오류, 정리 규칙) | `parse*Fields`                             |
| `toColumns(fields, { mode: "insert" \| "patch" })` — patch 는 있는 필드만                 | `*FieldsToColumns`, `conflictSet` 의 기본  |
| `rowToData(row, children)`                                                                | `*RowToData`                               |
| 클라이언트 `toWire(item, preserved)` / `fromWire(id, data)` → `{ item, preserved }`       | `*-sync-config.ts` `toData`/`fromData`     |
| 기기 SQLite `columns`·upsert 문                                                           | `table-envelopes.ts` 손 SQL                |
| 백업 형식 `export`/`import`                                                               | 번역기·백업 코드                           |
| 필드 `since` (어느 프로토콜 버전에 생겼나)                                                | 없음 → 옛 클라이언트 재생 테스트 자동 생성 |

**보존 방식 (원칙 2)**

- 클라이언트 store 항목에 `__wire?: Record<string, unknown>` (서버에서 받은 원본 중 모르는 키만)를 붙인다.
- 하위 항목도 `holdings[i].__wire` 를 둔다.
- `toWire` 는 `{ ...__wire, ...알고 있는 필드 }` 로 보낸다.
- UI 코드는 `__wire` 를 모른다. persist 에도 같이 저장되어 앱을 다시 켜도 남는다.

**서버 하위 목록 병합 (원칙 3)**

- `writeChildren` 을 "id 별 upsert (patch) + 보낸 목록에 없는 id 삭제"로 바꾼다.
- 하위 행 id 는 이미 클라이언트 UUID 라 바로 할 수 있다 (`stock_holding.id`, `cash_item.id`, `portfolio_allocation.id`).
- `investment_record` 처럼 id 가 없는 하위 행(날짜 키)은 `(accountId, date)` 를 키로 한다.

### 3.3 전송 프로토콜에 버전을 넣는다

- 요청 헤더: `x-seedbook-client: <앱 번들 버전>`, `x-seedbook-sync: <프로토콜 버전 정수>`.
- 서버 처리:
  - `protocol < MIN_SYNC_PROTOCOL` 이면 `426` + `{ minSupportedVersion }` → 클라이언트는 업데이트 화면을 띄우고 outbox 는 유지한다.
  - 지원 범위 안의 옛 프로토콜은 **정규화 어댑터**를 거친다. 예: v2 가 `fee` 를 `sellCostPercent` 로 바꿨다면 v1 payload 를 v2 로 바꾼다. 어댑터는 `packages/domain/src/protocol/v1-to-v2.ts` 처럼 버전마다 하나.
- pull 응답에 `{ protocol, serverTime }` 을 넣는다. 클라이언트가 자기보다 새 프로토콜을 받으면 모르는 필드를 보존만 한다 (원칙 2).
- 거부 응답: `{ status: "rejected", reason: "invalid", errors: [{ path: "holdings.2.quantity", code: "not_finite" }] }`.

### 3.4 클라이언트 엔진 보강

- **거부 격리**:
  - 거부된 mutation 은 outbox 에서 지우지 않고 `quarantine` 으로 옮긴다 (`SyncMeta.quarantine[id] = { data, errors, at }`).
  - 화면에는 "저장하지 못한 변경 n건 · 보기"를 띄운다. 사용자가 고치거나 버린다.
  - 서버 상태로 되돌리는 것은 사용자가 "버리기"를 눌렀을 때만 한다.
- **재시도**: 제한 시간 15s, 5xx·네트워크 오류 때 지수 backoff(1s→60s, 지터). 401·426 은 멈춘다.
- **정리를 저장 앞단으로**:
  - store 가 저장할 때 엔티티 정의의 `normalize` 를 거쳐 NaN·범위 밖 값을 정리한다.
  - 기기 저장소는 **검증 실패로 지우지 않는다**. 정의로 정리할 수 없는 항목은 원본 JSON 을 `device_kv` 의 `quarantine.<entity>.<id>` 에 둔다. 그리고 기존 행은 그대로 둔다.

### 3.5 서버 변경 피드 보강 (2단계, 필요해질 때)

- `updatedAt` 을 앱 시계 대신 **DB 시계**(`now()`/`clock_timestamp()` — 트랜잭션 안)로 찍는다. 그러면 웹 컨테이너가 여럿이어도 같은 시계를 쓴다.
- 톰스톤 정리:
  - (결정 변경) 톰스톤은 지우지 않고 계속 보관한다 (sync-architecture.md §4.3).
  - 커서가 그보다 오래된 클라이언트에는 `resetRequired: true` 를 돌려준다. 클라이언트는 outbox 를 유지한 채 전체 pull 한다.
- 데이터가 커지면 pull 페이지(`limit` + 다음 커서)를 추가한다.
- 커밋 순서 문제를 근본적으로 없애려면 변경 로그 테이블 + 스냅샷(xmin) 기반 커서를 쓴다. 지금 규모에서는 과하다. 서버 쪽에서 동기화 테이블에 쓰는 작업(crawler 등)이 생기면 다시 검토한다.

### 3.6 쓰기 경로 일원화

- **local→cloud 전환**: 로컬 전체를 mutation 묶음으로 보낸다 (100개씩, 같은 엔진). 서버 envelope GET 은 쓰지 않고 전체 pull 결과와 병합한다.
  - 병합 규칙("로컬 우선 합집합, 식물은 더 자란 쪽")은 `storage-merge.ts` 를 그대로 쓰되, 입력은 엔티티 목록이다.
- **cloud→local 전환**: 전체 pull → 로컬 병합 → 기기 저장 (지금과 같음, envelope GET 대신 pull).
- **백업 가져오기·데모 데이터**: 백업 파일 → 엔티티 정의로 정규화 → mutation 묶음.
- 이렇게 하면 `app/api/storage/[key]` 와 `_translators/` 는 자산 도메인에서 **없앨 수 있다** (preferences 같은 비동기화 store 만 남김). 서버 쓰기 규칙(version+1, afterChange, 소유 확인)이 한 곳에 모인다.
- 기기 SQLite 쪽 `table-envelopes.ts` 는 남는다 (로컬 저장 형식). 다만 엔티티 정의에서 SQL 을 만들어 손 SQL 을 줄인다.

### 3.7 테스트 구조 — "옛 클라이언트 재생"

1. **골든 payload 픽스처**: `packages/domain/fixtures/protocol-v<N>/<entity>.json`.
   - 프로토콜 버전을 올릴 때마다 그 시점 클라이언트가 보내던 mutation 과 받던 pull 을 남긴다. 지우지 않는다.
2. **보존 테스트** (DB 통합, `*.db.test.ts`):
   - 최신 클라이언트로 모든 필드를 채워 저장한다.
   - 옛 픽스처 payload 로 같은 id 를 수정한다.
   - 옛 payload 에 없던 필드(루트·하위)가 그대로인지 확인한다. **손실 경로 2 의 회귀 테스트.**
3. **왕복 테스트** (단위): 정의에서 무작위 엔티티를 만든다.
   - `fromWire(toWire(x))` 가 원래 값과 같은지 본다.
   - 모르는 필드를 섞은 서버 데이터가 `fromWire → 편집 → toWire` 뒤에도 남는지 본다.
4. **기기 저장 무손실 테스트**: 검증 실패 항목·NaN·범위 밖 값을 넣고 저장해도 기존 행과 원본이 남는지 본다. **손실 경로 1 의 회귀 테스트.**
5. **오래된 기기 시나리오**: 오래 오프라인이던 옛 버전 기기가 돌아와 push·pull 할 때 새 필드·삭제·자기 편집이 모두 남는지 본다 (sync-architecture.md §9).
6. **정의 일관성 테스트**: 정의의 필드 목록 ↔ drizzle 스키마 ↔ 기기 SQLite 컬럼 ↔ 백업 형식이 같은지 본다. 지금 `migrations.test.ts` 를 확장한다.

### 3.8 스키마 변경 절차 (CLAUDE.md 체크리스트)

1. 엔티티 정의에 필드를 추가한다 (`since: <다음 프로토콜>`, `default`).
2. `db:generate` 로 마이그레이션을 만든다 (nullable 이거나 default). 기기 마이그레이션 버전을 추가한다.
3. 프로토콜 버전을 올리고, 직전 버전 골든 픽스처를 고정한다.
4. 테스트 3.7 의 1~6 이 통과하는지 본다.
5. 서버를 먼저 배포한다 → 앱 번들 릴리스(또는 OTA).
6. **정리(contract)**: `minSupportedVersion` 을 올리고, 옛 클라이언트 비율을 확인한 뒤 별도 PR 로 한다.

---

## 4. 단계별 PR 계획

공수: S/M/L. 모두 mergeApproval 대상이다 (sync·device-db·database·CLAUDE.md). 서로 `lib/sync`·`server/sync` 를 고치므로 **직렬**로 한다 (CLAUDE.md 태스크 판단 기준).

| 순서   | PR                                                                                                                                                      | 고치는 손실 경로 | 공수           |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | -------------- |
| 1      | `fix(web): never delete device rows that fail validation` — table-envelopes 가 검증 실패 항목을 지우지 않고 원본을 격리, 재현 테스트 먼저               | 1 (치명)         | M              |
| 2      | `fix(web): normalize items before persisting` — NaN·범위 밖 값을 store 저장 앞에서 정리 (지금의 `num()` 규칙을 공용 함수로)                             | 1·3 예방         | S              |
| 3      | `fix(web): keep fields the client did not send` — 서버 upsert patch(있는 필드만), 하위 목록 id 별 병합, 클라이언트 `__wire` 보존, 보존·왕복 테스트      | 2 (치명)         | L              |
| 4      | `feat(web): surface rejected sync changes` — 거부 사유 경로, quarantine, 상태 표시, 서버 로그                                                           | 4                | M              |
| 5      | `fix(web): keep invalid local items when switching to cloud` — 전환 때 건너뛴 항목을 quarantine 으로, 재현 테스트                                       | 3                | S~M            |
| 6      | `feat(web): retry sync with backoff and timeouts`                                                                                                       | 운영             | M              |
| 7      | `feat: sync protocol and client version headers` — `x-seedbook-sync`·`x-seedbook-client`, 426, `/api/app-config` 와 연결                                | 호환 기반        | M              |
| 8      | `refactor: entity definitions in packages/domain` — 투자부터 한 도메인씩, 정의 → parse/toColumns/rowToData/toWire/fromWire/기기 SQL. 정의 일관성 테스트 | 구조             | L (도메인당 M) |
| 9      | `refactor(web): one write path for asset data` — 모드 전환·백업·데모를 mutation 으로, 자산 번역기 제거                                                  | 구조             | L              |
| 10     | `test: golden payload fixtures and two-device simulation`                                                                                               | 회귀 방지        | M              |
| 11     | `docs: sync rules and schema change checklist` (CLAUDE.md)                                                                                              | 절차             | S              |
| (나중) | DB 시계 `updatedAt`, 톰스톤 GC + `resetRequired`, pull 페이지                                                                                           | 2.3              | M              |
| (선택) | 하위 항목 단위 동기화 (보유 종목을 독립 엔티티로)                                                                                                       | 2.4              | L              |

**순서의 이유**

- 1·2·3 은 **지금 데이터를 잃는 버그**라 구조 작업보다 먼저 한다. 정식 사용자가 없는 지금도 출시 전에 반드시 닫아야 한다.
- 8·9 는 구조 개편이라 3 의 테스트(보존·왕복)를 안전망으로 깔고 한다.
- 앱 번들 전환(`native-deploy.md` §A8)과의 순서:
  - 3·7 은 **번들 앱 첫 출시 전에** 들어가야 한다. 출시 뒤에는 첫 버전이 영원히 "옛 클라이언트"로 남는다.
  - 8·9 는 출시 전후 어느 쪽이든 된다.

**총 공수 (추론)**: 1~7 약 1.5~2주, 8~10 약 2주.

---

## 5. 결정이 필요한 것

> **사용자 결정 (2026-11-28)**: ① 진행은 메인이 새 워크트리로 태스크 순서대로 ② 충돌 단위 = **하위 항목 단위 동기화** (§4 '선택' 항목을 필수로 올림 — 보유 종목·현금·배분·리밸런싱 작업을 독립 엔티티로) ③ 엔티티 정의 = **자체 소형 DSL**. 남은 것: 격리 UX 위치, 톰스톤 보존 기간.

1. **충돌 단위**: 지금처럼 계좌 단위 LWW(+하위 목록 id 병합)로 충분한지, 아니면 보유 종목 단위 동기화(§4 선택)까지 갈지. 권장: 3 의 id 병합까지만 하고, 오프라인 편집 손실 보고가 생기면 그때.
2. **엔티티 정의 도구**: 자체 소형 DSL(의존성 없음) vs zod 4 (검증·타입이 익숙하지만 코덱·`since`·SQL 생성은 직접 붙여야 함). 권장: 자체 DSL. 필드 타입이 10종 미만이라 작다.
3. **격리된 데이터의 UX**: "저장하지 못한 변경" 화면을 어디에 둘지 (설정 > 동기화 상태 권장).
4. **톰스톤 보존 기간** → 결정: 계속 보관.

## 6. 미확인

- NaN·범위 밖 값이 실제로 store 에 저장되는 UI 경로 (손실 경로 1 이 지금 바로 일어나는지).
- local→cloud 전환 누락(손실 경로 3)의 재현.
- Supabase 백업·PITR 설정.
- 백업 형식 2.0 의 버전 필드와 옛 백업 가져오기 호환 범위.

## 7. 재현 결과 (로컬 테스트, 커밋 안 함)

`apps/web/lib/native/device-db/zz-sync-audit-repro.test.ts` (워크트리에만 있음). **5개 모두 통과 = 손실이 재현됨.** PR 1·3 의 RED 테스트로 그대로 쓸 수 있다.

```
pnpm --filter @seedbook/web exec vitest run lib/native/device-db/zz-sync-audit-repro.test.ts
 Test Files  1 passed (1)
      Tests  5 passed (5)
```

| 테스트                                                   | 결과                                              |
| -------------------------------------------------------- | ------------------------------------------------- |
| 기기 저장: `currentValue` NaN(JSON 직렬화로 null)인 계좌 | 이미 있던 계좌 A 가 SQLite 에서 **삭제**          |
| 기기 저장: `sellCostPercent: 100` (서버 검증 범위 밖)    | 계좌 **삭제**                                     |
| 기기 저장: 보유 종목 하나의 수량 NaN                     | 계좌 **전체 삭제**                                |
| 서버 parse: `sellCostPercent` 없는 옛 payload            | `toColumns.sellCostPercent === 0` → LWW 로 덮어씀 |
| 클라이언트 `fromData → toData` 왕복                      | 서버가 더한 루트 필드·보유 종목 필드가 **버려짐** |

- 손실 경로 1·2 는 **확인**으로 올린다.
- 손실 경로 3(모드 전환)은 같은 parse 실패 → `continue` 경로라 원인은 같다. 전환 흐름 전체의 재현은 PR 3(태스크 아래)에서 테스트로 한다.

## 8. 등록한 태스크 (hwt 장부, 메인이 판단)

| 태스크   | 내용                                                                           | 순서           |
| -------- | ------------------------------------------------------------------------------ | -------------- |
| T0026071 | 손실 막기 1 — 기기 저장 무삭제·격리 + 저장 전 값 정리 (§4 PR1·2)               | 1              |
| T0026042 | 손실 막기 2 — patch upsert·하위 목록 id 병합·모르는 필드 보존 (§4 PR3)         | 2 (`after:` 1) |
| T0026150 | 거부 격리·표시 + 모드 전환 누락 + 재시도 (§4 PR4~6)                            | 3              |
| T0026167 | 프로토콜·클라이언트 버전 헤더 + 426 (§4 PR7)                                   | 4              |
| T0026183 | 엔티티 정의 일원화 + 쓰기 경로 하나 + 재생 테스트 + CLAUDE.md 규칙 (§4 PR8~11) | 5              |

모두 `lib/sync`·`server/sync`·device-db 를 건드리므로 CLAUDE.md 기준 직렬(`after:`)이 맞다. 1·2 와 4 는 **번들 앱 첫 출시 전**에 끝나야 한다.

## 9. CLAUDE.md 에 넣을 "동기화 규칙" 초안 (T0026183 에서 반영, 지금 바로 써도 됨)

> 공용 규칙 문서는 mergeApproval 대상이라 이 워크트리에서 고치지 않았다. 아래를 그대로 붙여 넣을 수 있다.

```markdown
## 동기화 규칙 (스키마를 바꿀 때 반드시 지킬 것)

동기화는 여러 앱 버전이 같은 API 를 몇 달씩 함께 쓰는 핵심 시스템이다. 한 번 잃은 사용자 데이터는 되살릴 수 없다.

- **검증 실패로 지우지 않는다.** 기기 저장·서버 저장·모드 전환·백업 가져오기 모두, 모양이 틀린 항목은 정리(normalize)하거나 격리하고 기존 데이터를 그대로 둔다. 삭제는 사용자의 삭제 동작(톰스톤)으로만.
- **빠진 필드는 바꾸지 않는다.** 서버 upsert 는 payload 에 있는 필드만 갱신한다(새 행일 때만 기본값). 하위 목록은 id 별 병합(보낸 목록에 없는 id 만 삭제).
- **모르는 필드는 보존한다.** 클라이언트는 서버에서 받은 모르는 필드(루트·하위)를 갖고 있다가 보낼 때 돌려준다.
- **추가 → 이전 → 정리.** 필드·컬럼은 추가만(nullable 또는 default). 이름 변경·삭제·의미 변경·검증 강화는 `minSupportedVersion` 을 올린 뒤 별도 PR. 전송 필드 이름을 재사용하지 않는다. 기기 SQLite 마이그레이션도 추가만.
- **스키마 변경 체크리스트**: 엔티티 정의(필드 `since`·`default`) → `db:generate` → 기기 마이그레이션 버전 → 동기화 프로토콜 버전 + 직전 버전 골든 payload 고정 → 보존·왕복·기기 무손실 테스트 → 서버 먼저 배포 → 앱 릴리스.
- **거부는 보이게.** 거부 사유(필드 경로)를 돌려주고 로그에 남기며, 클라이언트는 거부된 편집을 격리해 사용자에게 보인다. 서버 상태로 조용히 덮지 않는다.
- **새로고침은 `reloadApp()` 으로만** (SQLite 쓰기 대기열 flush).
```
