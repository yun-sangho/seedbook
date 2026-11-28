# 네이티브 앱 배포 구조 — 조사와 권장안

> 작성일 2026-11-28. 결정의 원본은 이 문서다 (조사 워크트리 `research-native-deploy` 에서 옮겨 보존).

> 작성: 2026-11-28, 워크트리 `research-native-deploy` (조사 전용, 커밋하지 않음)
>
> **전제 (사용자 확인)**
> 1. 네이티브 앱이 출시되면 **모바일 웹·PWA 는 유지하지 않는다.** 웹은 소개 페이지 + API 만 남는다.
> 2. 앱은 **아직 정식 출시 전이라 정식 사용자가 없다.** 지킬 옛 클라이언트나 옮길 사용자 데이터가 없다.
> 3. Capacitor 의 한계 때문이라면 다른 방식도 열려 있다.
>
> **표기**: 출처 없이 "추론"이라 쓴 것은 문서·코드로 직접 확인하지 못한 판단이다. "미확인"은 확인하지 못한 사실이다.
>
> **구성**
> - **Part A** — 최종 권장 구조와 PR 계획 (이것만 읽어도 됨).
> - **Part B** — 원격 WebView 셸을 유지할 때의 문제 분석·대책 (조사 원문). 번들 구조로 가도 그대로 쓰는 항목은 Part A 에서 가리킨다.

---

# Part A. 최종 권장안

## A0. 결론

**Capacitor 는 유지하고, "원격 URL 로 웹을 띄우는 방식"을 버린다.**

- `/m` 을 Next 에서 떼어 **Vite SPA**(`apps/mobile` 안)로 만든다.
- 그 빌드를 **앱 바이너리에 번들해 같이 릴리스**한다.
- 서버(Next)는 소개 페이지·법적 문서·인증·`/api` 만 맡는다.
- OTA(무심사 번들 업데이트)는 출시 뒤 필요해질 때 붙인다 (Capawesome Live Update, 자체 호스팅).
- **출시 전인 지금 전환한다.** 출시 뒤에는 옛 앱(원격 셸)을 위한 호환 기간이 생겨 비용이 몇 배가 된다.

**왜 Capacitor 를 버리지 않나**

- 지금 겪는 문제(배포 중 502, 옛 청크 흰 화면, iOS 서비스 워커, 4.2 심사 위험)는 전부 **`server.url` 원격 로드 방식의 문제**다. Capacitor 자체의 한계가 아니다.
  - Capacitor 공식 문서도 `server.url` 은 "live-reload 용이며 production 용이 아니다"라고 적는다. https://capacitorjs.com/docs/config
- Capacitor 를 쓰면 기존 자산을 거의 그대로 가져간다.
  - React 19, zustand, stackflow, SEED Design, three.js, 그리고 기기 저장소를 그대로 쓴다. 기기 저장소는 SQLite 계층(`lib/device-storage.ts`, `lib/native/device-db/*`)과 네이티브 탭바·생체인증 플러그인이다.
- 대안은 이득에 비해 비용이 크다 (§A2).
  - React Native·Expo 는 SEED Design·stackflow·DOM UI 를 다시 짜야 해 수개월이 든다.
  - Hotwire Native 는 원격 로드라 같은 문제가 남는다.
  - Tauri 2 모바일은 성숙도가 미확인이다.

**모드별 효과**

- **local 모드**: 앱 UI 가 기기 안에 있다. 그래서 로그인 토큰을 기기가 갖고 있으면 서버가 죽어 있어도, 오프라인이어도 자기 데이터를 연다.
  - 지금 구조에서는 세션 확인(`/api/auth/get-session`)이 실패하면 계정 자리가 안 열려 local 데이터도 못 본다 (§B5.1).
  - local 모드는 "기기가 유일한 사본"이라는 성격과 번들 구조가 가장 잘 맞는다.
- **cloud 모드**: 서버 배포 중에도 화면은 그대로 돈다. 동기화만 재시도 대기열에서 기다린다.
  - 남는 과제는 "앱 번들 버전 ↔ API 버전" 호환 하나로 줄어든다. 이건 규칙과 테스트로 관리할 수 있다 (§A4).

## A1. 목표 구조

```
apps/
  web/        Next.js — 소개(/), 약관·개인정보(/legal), 인증(/api/auth/*), API(/api/*), 개발용 dev-login
              (app/m · proxy.ts 의 UA rewrite · serwist · /offline 제거)
  mobile/     Capacitor 프로젝트 + Vite React SPA (지금의 /m 트리)
              webDir = dist (번들), server.url 없음 (개발 때만 live-reload)
  stock-crawler/
packages/
  domain/     (신규) 서버·앱 공용 순수 로직 — *-record.ts(행 변환·검증), account-snapshot-values,
              동기화 타입, 계산 utils. 지금 /m 클라이언트가 @web/server/* 를 import 하는 7곳이 대상
  database/   서버 전용 (Drizzle)
```

- **웹 번들은 앱에만 들어간다.** 모바일 웹을 유지하지 않으므로 웹 서버가 SPA 를 `/m` 에 따로 서빙할 필요가 없다.
  - 휴대폰 브라우저로 들어오면 소개 페이지에서 스토어 링크를 보여 준다.
  - 개발·QA 는 Vite dev 서버를 브라우저로 연다. **에뮬레이터를 켜 둘 필요가 없다** (아래 "개발 흐름").

### 개발 흐름 (번들 구조에서)

- **평소 개발 = 브라우저**: `pnpm dev` 가 Next(API, 슬롯 포트)와 Vite(UI)를 함께 띄운다. 데스크탑 브라우저(ego-browser)의 모바일 뷰포트로 화면을 본다. 지금 `/m` 을 브라우저로 보는 것과 같다.
  - Vite dev 서버가 `/api` 를 Next 로 프록시한다 → 브라우저에서는 같은 origin 이라 쿠키 세션·"개발용 빠른 로그인"이 그대로 된다. CORS·bearer 는 앱 빌드에서만 쓴다.
  - 리소스: Next 는 API 만 컴파일하고 UI 는 Vite 가 맡아, 지금(Next turbopack 이 `/m` 전체 컴파일)과 비슷하거나 가볍다.
  - 기기 저장소: 브라우저에서는 **WASM SQLite**(sql.js 등)로 앱과 같은 `records` 테이블·`CHECK` 제약을 돌린다 (동기화 설계 §2.5·§5.7 이 SQLite 제약에 기대므로, localStorage 폴백보다 앱과 동작이 같다).
- **에뮬레이터·시뮬레이터가 필요한 때만** 켠다:
  - 네이티브 플러그인(탭바·생체인증·SQLite 드라이버)을 고칠 때, OAuth 딥링크, safe area·키보드·제스처 같은 기기 동작, 릴리스 전 확인.
  - 이때도 `cap run --live-reload` 로 앱이 Vite dev 서버를 보게 해 다시 빌드하지 않는다.
  - iOS 시뮬레이터 약 1~2GB, Android 에뮬레이터 약 2~4GB 메모리. 워크트리마다 켜지 않고 필요한 작업 하나에서만.
- **CI**: 단위·통합 테스트는 node SQLite 드라이버로 돈다. 시뮬레이터 실행은 릴리스 워크플로(네이티브 8)에서 한 번.
- **API 주소**: 지금 클라이언트는 상대 경로 `/api/...` 로 약 10개 엔드포인트를 부른다 (`accountFetch`·`fetch`). 공용 `apiFetch` 하나로 모아 `API_BASE_URL` 을 붙인다.
  - `createAuthClient({ baseURL })` 도 같이 바꾼다.
- **`/m` 의 Next 결합도는 낮다** (코드로 확인):
  - `next/*` import 는 `next/dynamic` 2곳, `app/m/layout.tsx` 의 `next/headers`(CSP nonce)·`Metadata`·`Viewport` 뿐이다.
  - `MobileStack` 은 이미 `ssr:false` 클라이언트 앱이다.
  - 전체 클라이언트 코드(`app/m`·`features`·`components`·`lib`, 테스트 제외)는 약 2.8만 줄이다. 대부분 그대로 옮긴다.
  - Next `output:'export'` 보다 Vite 가 낫다:
    - export 는 proxy·`cookies()`·rewrites 를 못 쓴다.
    - 한 Next 앱으로 export 와 API 서버를 동시에 할 수 없어 어차피 빌드가 둘로 나뉜다.
    - https://nextjs.org/docs/app/guides/static-exports

### 인증 (가장 큰 변경)

- 앱 origin 이 `capacitor://localhost`(iOS)·`https://localhost`(Android)가 되고, WKWebView 는 서드파티 쿠키를 막는다. → **쿠키 세션 대신 bearer 토큰.**
  - better-auth `bearer()` 플러그인을 쓴다. 로그인 응답의 `set-auth-token` 을 받아 `Authorization: Bearer` 로 보낸다. https://www.better-auth.com/docs/plugins/bearer
  - 서버 `trustedOrigins` 와 CORS 에 두 origin 을 넣고, `Authorization` 헤더를 허용한다.
  - 토큰은 Keychain·Keystore 에 둔다. 이미 쓰는 `@capgo/capacitor-native-biometric` 의 보안 저장소나 SQLite 는 피한다.
- **이미 비슷한 장치가 있다**: `server/device-credentials/device-credential-plugin.ts` 다.
  - 생체인증 로그인용 기기 토큰 → `sign-in` 이 세션을 만든다.
  - bearer 로 바꾸면 이 흐름이 "기기 토큰 → bearer 세션 토큰"으로 자연스럽게 이어진다 (추론).
- **카카오·애플 로그인**: 지금은 WebView 안에서 `*.kakao.com`·`appleid.apple.com` 으로 이동하는 웹 OAuth 다. 번들 앱에서는 둘 중 하나로 바꾼다.
  - (a) **시스템 브라우저 OAuth + 딥링크**: `@capacitor/browser` 또는 ASWebAuthenticationSession 으로 로그인한다. 서버 콜백이 일회용 코드를 딥링크(`seedbook://auth?code=`)로 넘기고, 앱이 그 코드를 bearer 토큰으로 교환한다. 서버 코드 몇 개만 더하면 된다. **권장.**
  - (b) **네이티브 SDK**: Kakao SDK·Sign in with Apple 의 ID 토큰을 better-auth `signIn.social({ idToken })` 로 넘긴다. UX 는 가장 좋다.
    - better-auth 카카오 provider 의 idToken 지원 여부는 **미확인**이다. 애플은 지원하는 것으로 알려져 있지만 확인 필요.
  - 출처 사례: https://capawesome.io/blog/how-to-use-better-auth-in-capacitor-apps/ , https://capgo.app/blog/how-to-use-better-auth-in-capacitor-apps/
- **오프라인 열람**: 토큰과 "마지막 확인 사용자 id"를 기기에 두고, 앱 시작 때 서버 확인을 기다리지 않고 계정 자리(`activateAccount`)를 연다.
  - 서버가 **401** 을 주면 그때 닫고 로그인 화면으로 간다.
  - 네트워크 오류·5xx 는 열어 둔 채 재시도한다.
  - 앱 잠금(생체인증)이 오프라인 열람을 지킨다.

## A2. 대안 비교

| 안                                             | 내용                               | 코드 재사용                   | 배포 어긋남             | local 모드 오프라인  | 1인+에이전트 유지 비용                                                                      | 판단                              |
| ---------------------------------------------- | ---------------------------------- | ----------------------------- | ----------------------- | -------------------- | ------------------------------------------------------------------------------------------- | --------------------------------- |
| 지금 (원격 셸)                                 | `server.url`                       | 100%                          | 매 배포 (§B 전반)       | 불가                 | 낮아 보이지만 무중단·skew 장치가 계속 늘어남                                                | 출시 전에 벗어난다                |
| **A. Capacitor + Vite SPA 번들 (+나중에 OTA)** | 앱에 UI 번들, 서버는 API           | ~95%                          | 번들 ↔ API 호환만       | 가능                 | 낮음                                                                                        | **권장**                          |
| B. A 와 같지만 OTA 없음                        | UI 변경 = 스토어 릴리스            | ~95%                          | 번들 ↔ API 호환만       | 가능                 | 가장 낮음. 심사 대기(보통 1~2일)가 불편                                                     | **A 의 1단계로 채택**             |
| C. Expo / React Native                         | 네이티브 UI 재작성, EAS Update OTA | utils·stores 정도             | 번들 ↔ API              | 가능                 | 재작성 수개월. DOM components(`'use dom'`)는 컴포넌트마다 별도 WebView라 앱 전체에는 부적합 | 비권장 (지금)                     |
| D. Hotwire Native                              | 네이티브 내비 + 원격 웹 화면       | 낮음 (Next 사례 없음, 미확인) | 원격 로드라 지금과 같음 | 불가                 | 중간                                                                                        | 비권장                            |
| E. Tauri 2 모바일                              | Rust 셸 + 웹 UI                    | ~90%                          | 번들 ↔ API              | 가능                 | 모바일 생태계(SQLite·OAuth·OTA)가 얇다. 팀도 2.0 때 "과하게 약속했다"고 인정                | 비권장                            |
| F. PWA 만                                      | 스토어 앱 없음                     | 100%                          | 웹 배포 skew            | iOS 저장소 축출 위험 | 낮음                                                                                        | 사용자 결정(네이티브 출시)과 반대 |

출처:

- Expo DOM components: https://docs.expo.dev/guides/dom-components/
- EAS Update 자체 서버: https://docs.expo.dev/eas-update/custom-updates-server
- Hotwire Native path configuration: https://native.hotwired.dev/overview/path-configuration
- Tauri 2.0 RC: https://v2.tauri.app/blog/tauri-2-0-0-release-candidate/
- iOS PWA 제약 (2차 자료): https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide
- 원격 셸 4.2 반려 사례: https://forum.ionicframework.com/t/apple-app-store-approval-issue-with-this/199417 , https://developer.apple.com/forums/thread/812889

**Capacitor 를 떠나야 하는 신호**: 아래가 생기면 C(Expo)를 다시 검토한다. 지금은 해당 없음.

- 네이티브 수준의 제스처·애니메이션이 제품 핵심이 될 때.
- WebView 성능(목록 수천 행, three.js)이 실기기에서 한계일 때.
- 네이티브 플러그인(지금 탭바·SQLite·생체인증)이 계속 늘어 Swift/Kotlin 유지가 웹보다 커질 때.

## A3. 릴리스 구조 — "번들과 앱을 합쳐 릴리스"

### 1단계 (출시 시점): 바이너리 = 번들, OTA 없음

- **버전 하나**: `apps/mobile/package.json` 의 `version`(semver) = 앱 marketing version. 번들 안에 `BUILD_SHA` 를 넣는다.
- **CI `mobile-release` 워크플로** (수동 또는 `mobile-v*` 태그):
  1. Vite 빌드
  2. `cap sync`
  3. iOS·Android 빌드·서명
  4. TestFlight·Play 내부 테스트 업로드
  - 서명·업로드 도구는 fastlane 이나 Xcode Cloud. 선택은 미정, 별도 조사.
- **출시 경로**: App Store 단계적 출시(7일), Play 단계 출시(%). 심사는 Apple 기준 90% 가 48시간 안이다 (2026-06 발표 보도, 2차 자료).
  - https://support.google.com/googleplay/android-developer/answer/6346149
- **강제 업데이트 게이트**: `/api/app-config` 가 `{ minSupportedVersion, latestVersion }` 를 준다.
  - 앱은 시작·복귀 때 확인한다. `minSupportedVersion` 아래면 스토어로 보내는 막는 화면을 보인다. Android 는 Play In-App Updates.
  - API 를 깨야 할 때의 마지막 수단이다.

### 2단계 (출시 뒤, UI 수정이 잦아지면): OTA 추가

- **@capawesome/capacitor-live-update** (MIT), Capawesome Cloud 없이 자체 호스팅:
  - `downloadBundle({ url, checksum, signature })` → `setNextBundle()` → 다음 시작 때 적용.
  - `ready()` 를 `readyTimeout` 안에 못 부르면 내장 번들로 자동 롤백한다.
  - 버전 확인 엔드포인트는 직접 만든다: `/api/app-bundle/latest?native=<버전>&channel=<채널>`.
  - 번들 zip 은 GitHub Release asset 이나 서버 정적 경로에 RSA 서명해서 둔다.
  - https://capawesome.io/plugins/live-update/ , https://unpkg.com/@capawesome/capacitor-live-update@8.2.3/README.md
  - 직접 운영이 번거로우면 Capawesome Cloud($9/월 1K MAU~)나 Capgo(백엔드 자체 호스팅 가능)로 옮긴다.
- **번들 ↔ 네이티브 호환**: 번들 manifest 에 `minNative` 를 둔다. 네이티브 플러그인(탭바 아이콘 등)이 바뀐 번들은 OTA 로 옛 바이너리에 보내지 않는다.
  - 지금 웹 코드가 이미 "플러그인이 없는 구버전 앱" 폴백을 갖고 있다 (탭바·SQLite). 같은 방식을 이어 간다.
- **정책**: Apple DPLA 3.3.1(B)·심사 지침 2.5.2 — 앱의 주 목적을 바꾸지 않는 JS 업데이트는 관행적으로 허용된다. 큰 기능은 스토어 릴리스로 낸다.
  - Google Play 는 WebView JS 를 실행 코드 금지에서 제외한다.
  - https://developer.apple.com/support/terms/apple-developer-program-license-agreement/ , https://support.google.com/googleplay/android-developer/answer/9888379
- OTA 를 붙이면 "번들 버전"과 "바이너리 버전"이 갈라진다. `/api/app-config` 의 기준을 **번들 버전**으로 바꾼다.

## A4. 버전 호환 규칙 (번들 구조에서 가장 중요한 운영 규칙)

번들 구조에서는 **여러 앱 번들 버전이 같은 API 를 몇 주~몇 달 동시에 쓴다.** 원격 셸 때의 "몇 시간짜리 skew"보다 길다. 그래서 아래를 CLAUDE.md 규칙으로 둔다.

1. **API 는 추가만 (expand → contract).**
   - 필드 제거·의미 변경·검증 강화는 `minSupportedVersion` 을 그 변경 이후 버전으로 올린 뒤에만 한다.
   - DB 마이그레이션도 같은 순서를 따른다 (§B2.5).
2. **빠진 필드 = 건드리지 않음.** 지금 `parseInvestmentFields` 는 `sellCostPercent ?? 0` 처럼 빠진 필드를 기본값으로 채워 **마지막 저장이 이김** upsert 를 한다 (코드로 확인).
   - 그러면 옛 번들 기기가 계좌를 고칠 때 새 필드가 0 으로 덮이고, pull 로 다른 기기에도 퍼진다. **cloud 모드의 조용한 데이터 손실**이다.
   - upsert `set` 에서 빠진 컬럼을 빼도록 바꾸고, `sync.db.test.ts` 에 "옛 모양 mutation 이 새 컬럼 보존" 테스트를 둔다 (§B5.2).
   - 다른 엔티티의 같은 패턴, 클라이언트 `mergePullResponse` 의 모르는 필드 처리는 **미확인** — 같이 확인한다.
3. **거부(rejected) 시 조용히 덮지 않기.**
   - `sendOnce` 는 `rejected > 0` 이면 서버 상태로 다시 맞춘다. 새 서버가 옛 모양을 거부하면 편집이 사라진다.
   - 거부를 상태 표시줄로 알린다. "클라이언트가 너무 옛 버전"이면 426 → 업데이트 게이트로 보낸다.
4. **기기 SQLite 스키마는 추가만.**
   - OTA 롤백(`readyTimeout`)이나 단계 출시 중단 때 옛 번들이 새 스키마를 만난다. `migrateDeviceDatabase` 는 높은 버전을 무시하므로, 추가만이면 안전하다.
   - `migrations.test.ts` 에 DROP/RENAME 금지 검사를 둔다.
5. **새로고침은 `reloadApp()` 으로만.** OTA 적용(`reload()`)·업데이트 게이트도 마찬가지다.
   - SQLite 쓰기가 비동기 대기열이라 그냥 reload 하면 local 모드의 유일한 사본이 사라질 수 있다 (`lib/device-storage.ts` 주석).
   - OTA 플러그인의 `reload()` 를 부르기 전에 `flushDeviceStorage()` 가 `true` 인지 확인한다.

## A5. local / cloud 모드별 정리 (번들 구조 기준)

|                          | local 모드                                                                                              | cloud 모드                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 앱 시작                  | 서버 왕복 없이 토큰 + 마지막 사용자로 계정 자리를 연다 → **완전 오프라인 열람**                         | 같다. 화면은 기기 캐시로 뜨고 pull 은 뒤에서                                             |
| 서버 배포 중             | 영향 없음. 시세·일별 기록 채우기만 다음 기회로 미룬다 (5xx 때 마지막 기록일을 올리지 않는지 **미확인**) | mutation 이 재시도 대기열에서 기다린다 → **backoff·제한 시간 필요** (지금 없음, §B5.2-3) |
| 앱 업데이트 (스토어·OTA) | SQLite 데이터는 origin·번들과 무관해 그대로 남는다. 원격 셸 → 번들 전환 때도 SQLite 는 유지             | 동기화 대기열도 SQLite 라 유지. 옛 번들 ↔ 새 API 는 §A4                                  |
| 로그아웃·401             | 계정 자리를 닫는다. 데이터는 기기에 남는다 (지금과 같음)                                                | 같다                                                                                     |
| 시세                     | 마지막 시세 캐시(`device_kv`)로 평가액을 보인다. "시세 기준 시각" 표시 권장                             | 같다                                                                                     |

- 모바일 웹·PWA 를 접으므로 **브라우저 localStorage 의 local 모드 데이터 이전**이 필요하지만, 정식 사용자가 없어 할 일이 없다.
  - 개발 시나리오 데이터는 시드(`pnpm db:seed:reset`)·"데모 데이터 불러오기"로 다시 만든다.
- 웹을 접으면서 서비스 워커(serwist), `/offline`, PWA manifest·iOS 스플래시(`lib/ios-splash.ts`), proxy 의 UA rewrite 가 모두 필요 없어진다. §B6 의 SW 고민도 사라진다.

## A6. 서버 배포는 어떻게 바뀌나

번들 구조에서는 서버 배포의 짧은 502 가 "흰 화면"이 아니라 "동기화 몇 초 지연"이 된다. 그래서 Part B 의 무거운 장치 일부는 필요 없어진다.

| Part B 대책                                       | 번들 구조에서                                                                                    |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `/api/health` + compose healthcheck + `up --wait` | **유지** — 배포 성공 판정·머지 큐 확인에 필요 (S)                                                |
| 마이그레이션 one-shot 선행 + expand/contract      | **유지·더 중요** — 옛 번들이 오래 남는다 (S~M)                                                   |
| Caddy `lb_try_duration`                           | **유지** — 설정 한 줄로 짧은 틈을 흡수 (S)                                                       |
| blue/green 2색 web                                | **선택** — 사용자 수가 늘고 배포 중 API 실패가 눈에 띄면 그때. DB 풀은 web 6 으로 미리 줄여 둔다 |
| `/_next/static` 누적 보존                         | **불필요** — 앱 UI 가 서버 정적 자산을 쓰지 않는다                                               |
| `deploymentId`·ChunkLoadError reload·버전 폴링    | **불필요** (앱). 소개 페이지는 정적에 가까워 영향 작음. 대신 §A3 업데이트 게이트                 |
| Caddy 점검 페이지·`error.html` 재시도             | **불필요** — 앱이 원격 페이지를 열지 않는다. 앱 안 API 오류 표시로 대체                          |
| 동기화 backoff·제한 시간                          | **유지** (M)                                                                                     |
| 빠진 필드 보존 (§A4-2)                            | **유지·최우선** (M)                                                                              |
| 서비스 워커 정리                                  | 웹 `/m` 제거와 함께 **serwist 삭제**                                                             |

## A7. 워크플로 구조 (서비스별 분리 고민과 PR #87)

산출물이 셋으로 나뉜다: **서버(web=Next API+소개)**, **crawler**, **모바일(번들·바이너리)**.

- **서버·crawler**: `deploy.yml` 하나에 job 을 나눈다.
  - 순서: `changes → checks → build(matrix) → migrate(one-shot, 마이그레이션 바뀐 때만) → deploy-web / deploy-crawler`.
  - 파일을 쪼개면 "web 이 마이그레이션을 기다림"을 `workflow_run` 체인으로 맞춰야 해서 오히려 복잡해진다.
  - **PR #87**(마지막 성공 배포 기준 빌드 판단)은 그대로 유효하다. 파일을 쪼갤 경우 기준을 서비스별 job 단위로 잡아야 한다.
  - 머지 큐 배포 확인은 `/api/health` 의 `version == 머지 sha` 비교가 더 정확하다 (#87 이후 별도 PR).
- **모바일**: 별도 `mobile-release.yml`.
  - 트리거는 수동 또는 `mobile-v*` 태그다. main push 마다 스토어에 올리지 않는다.
  - main push 때는 CI 에서 SPA 빌드·테스트만 돈다.
  - OTA 단계에서는 main 머지 때 서명 번들을 "beta" 채널에 올리고, 수동 승격으로 "production" 채널에 올린다.
  - 머지 큐(`hwt mq`)는 서버 배포만 확인한다. 앱 출시는 사람이 결정한다.
- **API 변경 PR 순서**: 서버를 먼저 배포한다(expand) → 앱 번들 → contract 는 `minSupportedVersion` 을 올린 뒤에 한다.

## A8. 단계별 PR 계획 (출시 전 전환)

공수: S(≤반나절) / M(1~2일) / L(3일+). "승인" = `.hwt.json` mergeApproval 에 걸림. 위에서 아래 순서로 한다.

| #         | PR                                                           | 내용                                                                                                                                                                              | 위험                                                                  | 공수 | 승인                       |
| --------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ---- | -------------------------- |
| 1         | `refactor(web): route client API calls through one base URL` | `apiFetch`/`accountFetch` 에 `API_BASE_URL`, auth client `baseURL`. 동작 변화 없음                                                                                                | 빠뜨린 상대 경로 → grep 테스트로 막기                                 | S    | 아님                       |
| 2         | `refactor: move shared record logic to packages/domain`      | `/m` 이 import 하는 `@web/server/*` 7곳(record·consents·legal-versions·device-credential 타입)과 `account-snapshot-values` 를 공용 패키지로                                       | import 경로 대량 변경, 서버 번들 영향                                 | M    | 일부 (device-db·sync 경로) |
| 3         | `fix(web): keep fields omitted by older clients`             | §A4-2. 빠진 필드는 upsert set 에서 제외 + 회귀 테스트, pull 필드 보존 확인                                                                                                        | 동기화 핵심                                                           | M    | 승인                       |
| 4         | `feat(web): bearer sessions for the native app`              | better-auth `bearer()`, `trustedOrigins`·CORS, 토큰 보안 저장, device-credential 연계, 시스템 브라우저 OAuth + 딥링크 코드 교환 (카카오·애플)                                     | **인증 — 가장 큼.** 계정 격리·토큰 탈취·리다이렉트 검증               | L    | 승인                       |
| 5         | `feat(mobile): build the /m tree as a Vite SPA`              | `apps/mobile` 에 Vite + 기존 화면, `next/dynamic` → `React.lazy`, 레이아웃 메타(테마색·뷰포트)를 index.html 로, CSP 는 앱 정적 meta 로, dev 서버 + QA 흐름 (CLAUDE.md QA 절 수정) | 화면 회귀 → 기존 vitest 를 같이 옮김, ego-browser 로 Vite dev 화면 QA | L    | CLAUDE.md → 승인           |
| 6         | `feat(mobile): bundle the SPA and drop server.url`           | `webDir=dist`, `server.url` 은 dev live-reload 때만, `error.html` 제거, 오프라인 계정 열기(§A1), 업데이트 게이트 `/api/app-config`                                                | 오프라인 열기 = 인증 경로                                             | M    | 승인 (auth·device-db)      |
| 7         | `feat(web): retry sync with backoff and timeouts`            | 제한 시간, 5xx·네트워크 backoff, pull 오류 재시도, 거부 알림                                                                                                                      | 재시도 폭주 → 지터·상한                                               | M    | 승인                       |
| 8         | `chore(web): remove the mobile web tree and PWA`             | `app/m`·proxy UA rewrite·serwist·`/offline`·manifest·ios-splash 제거, 휴대폰 브라우저 → 소개 + 스토어 링크                                                                        | 데스크탑 개발용 `seedbook.view` 쿠키 흐름 정리                        | M    | CLAUDE.md → 승인           |
| 9         | `chore: health check, one-shot migrations, Caddy retry`      | `/api/health`(version 포함), compose healthcheck·`up --wait`, `migrate` one-shot, `DB_POOL_MAX` 6, `lb_try_duration`(서버 Caddy 반영은 사용자 승인 뒤 수동)                       | 배포 순서 실수                                                        | M    | 승인                       |
| 10        | `ci: mobile release workflow`                                | Vite 빌드 → `cap sync` → 서명 → TestFlight·Play 내부 테스트. 인증서·키 Secrets 필요                                                                                               | 서명 비밀 관리                                                        | M    | 승인                       |
| 11        | `docs: version compatibility rules`                          | §A4 를 CLAUDE.md·`migrations.ts` 주석·테스트로 고정                                                                                                                               | 낮음                                                                  | S    | 승인                       |
| (출시 뒤) | OTA                                                          | §A3 2단계                                                                                                                                                                         | 2.5.2 해석                                                            | M    | 승인                       |

**병렬·의존** (CLAUDE.md 태스크 판단 기준 적용):

- 1 → 5 → 6 → 8 은 같은 `/m` 흐름이라 직렬.
- 2 는 5 전에.
- 3·7 은 둘 다 sync 를 고쳐 직렬.
- 4 는 6 전에 끝나야 한다.
- 9·10·11 은 독립이라 병렬로 할 수 있다.
- **예상 총 공수**: 약 2~3주 (1인+에이전트, 추론). 가장 불확실한 것은 4(카카오 OAuth 딥링크)와 5(화면 회귀)다.

## A9. 결정이 필요한 것 (사용자)

1. **카카오 로그인 방식**: 시스템 브라우저 + 딥링크(권장, 서버 몇 개 추가) vs 카카오 네이티브 SDK(UX 좋음, better-auth idToken 지원 미확인).
2. **OTA 시점**: 출시와 함께 vs 출시 뒤 필요할 때 (권장: 뒤).
3. **blue/green**: 지금은 생략하고 `lb_try_duration` + healthcheck 만 할지 (권장: 생략).
4. **스토어 빌드 도구**: fastlane vs Xcode Cloud + Play 업로드 액션 (별도 조사).

## A10. 미확인 (Part A 관련)

- better-auth 카카오 provider 의 `idToken` 로그인 지원.
- better-auth `bearer()` 와 기존 `device-credential` 플러그인의 결합 방식 (세션 쿠키 대신 토큰을 돌려주게 할 수 있는지).
- Capawesome Live Update 자체 호스팅 시 버전 확인 API 를 직접 만들어야 하는 범위 (`sync()` 는 Cloud 전용).
- iOS `capacitor://localhost` origin 에서 better-auth CORS·CSRF(origin 검사) 동작.
- 앱 정적 번들 크기(three.js 포함)와 첫 실행 속도.

---

# Part B. 원격 WebView 셸 기준 분석 (조사 원문)

> 아래는 "원격 셸을 유지한다면"의 분석이다. 번들 구조로 가면 §A6 표대로 일부만 남는다. 특히 남는 것은 다음과 같다.
> - local/cloud 모드 위험 분석(§5)
> - API·마이그레이션 호환(§2.5·§3.3)
> - 서비스 워커 판단 근거(§6)
> - 무중단 배포 비교(§2.2)

---

## B0. (원격 셸 기준) 결론

**최적 구조 한 줄**: 당분간 원격 WebView 셸을 유지한다. 그 대신 **"서버는 옛 버전을 끊지 않는다 / 클라이언트는 어긋남을 스스로 회복한다 / 기기 데이터는 어떤 새로고침에서도 잃지 않는다"** 세 겹을 만든다. 앱에 `/m` 을 번들(정적 export + OTA)하는 것은 그 뒤, 조건이 맞을 때(§7) 한다.

배포 한 번이 망가뜨리는 것은 local 모드와 cloud 모드가 다르다. 그래서 권장안도 모드별로 나눠 본다.

|                           | local 모드 (기기가 유일한 사본)                                                                                            | cloud 모드 (서버가 원본, 기기는 캐시+대기열)                                                         |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 배포 중 502               | 세션 확인(`/api/auth/get-session`)이 실패하면 계정 자리(`activateAccount`)가 열리지 않는다. **자기 기기 데이터도 못 본다** | 화면도 못 보고, 보낸 mutation 이 502                                                                 |
| 옛 JS 가 남은 앱          | 기기 SQLite 스키마를 새 JS 가 올린 뒤 롤백하면, 옛 JS 가 새 스키마를 읽는다                                                | 옛 JS 가 새 서버에 옛 모양의 mutation 을 보낸다. **새 필드가 기본값으로 덮인다** (§5.2, 코드로 확인) |
| 자동 새로고침 (복구 수단) | `location.reload()` 하면 비동기 SQLite 쓰기 대기열이 사라진다. **데이터 손실**                                             | 대기열은 저장돼 있어 덜 위험하다. 같은 SQLite 경로라 마찬가지로 flush 가 필요                        |
| 가장 중요한 방어          | 새로고침은 반드시 `reloadApp()` (flush 후 reload). 기기 스키마는 추가만                                                    | API 는 expand/contract. 빠진 필드는 덮지 않는다. 재시도·제한 시간                                    |

**권장 순서** (PR 단위는 §8):

1. **[서버] 무중단 + 옛 청크 보존.** 헬스체크, 마이그레이션 one-shot 선행, web 2색(blue/green) 교체, Caddy `lb_try_duration` + 점검 페이지, `/_next/static` 누적 볼륨.
   - 효과: 502 와 ChunkLoadError 의 대부분이 서버만 바꿔도 사라진다. 앱 재배포가 필요 없다.
2. **[웹] 어긋남 회복.** `deploymentId`, `global-error`/`error.tsx` 의 ChunkLoadError 1회 `reloadApp()`, 버전 API + 앱 복귀 때 비교 후 안전한 시점 새로고침.
3. **[웹·서버] 동기화 호환 규칙.** 빠진 필드는 기존 값을 유지(부분 upsert), mutation 재시도 backoff·제한 시간, "클라이언트가 너무 옛 버전" 응답.
4. **[웹] local 모드 오프라인 열람.** 서버가 5xx·네트워크 오류일 때 마지막으로 확인된 계정(`seedbook.owner`)의 기기 데이터를 연다. 401 일 때는 열지 않는다.
5. **[앱 릴리스] `error.html` 시간 기반 재시도.** Android 는 502 에서 `error.html` 로 가는데, `online` 이벤트만 기다려 영영 재시도하지 않는다.
6. **[서비스 워커]** iOS 는 의존하지 않는다 (App-Bound Domains 는 도입하지 않음). 네이티브 앱에서는 SW 를 등록하지 않는 쪽을 권한다.
7. **[중장기]** `/m` 번들 + OTA(Capawesome Live Update 자체 호스팅 또는 Capgo) 는 §7 의 조건 중 하나가 생기면 시작한다.

---

## B1. 현재 상태 — 코드로 확인한 근거

### 1.1 배포·인프라

- `.github/workflows/deploy.yml` 의 `deploy` job: `docker compose pull` → `docker compose up -d --remove-orphans` → `ps` → `image prune`.
  - 헬스 대기(`--wait`)가 없다. 컨테이너가 떴는지와 상관없이 성공으로 끝난다.
- `docker-compose.yml`:
  - `web` 은 1개다. `ports: "${WEB_PORT:-127.0.0.1:3001}:3001"` 고정, `healthcheck` 없음, `stop_grace_period` 없음.
  - `stock-crawler` 는 `DB_POOL_MAX: "1"`, `web` 은 `"8"`.
- `apps/stock-crawler/entrypoint.sh`: 컨테이너가 시작할 때 `tsx scripts/migrate.ts` 를 돈다.
  - 두 서비스를 한 번에 `up -d` 하므로 **새 web 이 뜨는 동안 마이그레이션이 같이 돈다.** 순서 보장이 없다.
- Caddyfile 은 레포에 없다 (서버에만 있음). 현재 `reverse_proxy` 옵션은 **미확인**. 운영 서버는 이번 조사에서 건드리지 않았다.
- `/api/health` 같은 헬스 엔드포인트가 없다 (`apps/web/app/api/` 에 `account-snapshots auth auth-providers legal me stocks storage sync` 뿐).
- `apps/web/Dockerfile` production stage 는 `.next/standalone` + `.next/static` + `public` 을 이미지 안에 복사한다.
  - 그래서 옛 청크는 컨테이너 교체와 함께 사라진다.

### 1.2 앱 셸

- `apps/mobile/capacitor.config.ts`: `server.url` 이 운영 주소, `errorPath: "error.html"`, `allowNavigation: ["*.kakao.com", "appleid.apple.com"]`.
- `apps/mobile/www-src/error.html`: "다시 시도" 버튼과 `window.addEventListener("online", reopen)` 만 있다. **시간 기반 재시도가 없다.**
- iOS `Info.plist` 에 `WKAppBoundDomains` 가 없다 (grep 결과 없음) → iOS WKWebView 에서 서비스 워커가 동작하지 않는 쪽이 유력하다 (§B6).

### 1.3 웹 클라이언트

- Next `16.4.6`. `next.config.js` 에 `deploymentId`/`generateBuildId`/`assetPrefix` 가 없다.
- `app/` 아래 `error.tsx`·`global-error.tsx` 가 없다.
- lazy 청크:
  - `app/m/_stack/mobile-stack.tsx` 의 `dynamic(() => import("./mobile-stack-client"), { ssr: false })` — `/m` 전체 화면이 여기 달려 있다.
  - three.js 는 `features/garden/plant-3d/*` 에서 쓰고, `app/m/assets/_components/home-mobile.tsx` 가 불러온다.
- **Next 16.4.6 은 이미 빌드 불일치를 일부 막는다.** `next/dist/client/components/router-reducer/fetch-server-response.js` 의 RSC 내비게이션 응답에서 `(x-nextjs-deployment-id 헤더 ?? flightResponse.b) !== getNavigationBuildId()` 이면 `doMpaNavigation` (전체 새로고침) 한다.
  - 하지만 stackflow 화면 전환(서버 왕복 없음)과 `import()` 청크 로드는 이 경로를 타지 않는다. 그래서 **옛 앱에서 화면을 열 때 404 → 흰 화면**이 그대로 남는다.
- `app/sw.ts` (Serwist):
  - `_next/static` 만 precache 한다.
  - `skipWaiting:false`, `clientsClaim:false`.
  - 내비게이션은 `NetworkOnly`, 실패하면 `/offline`.
  - `app/layout.tsx` 의 `SerwistProvider` 가 네이티브 앱에서도 등록한다.
- 동기화 엔진 `lib/sync/entity-sync-engine.ts`:
  - `fetch` 에 제한 시간이 없다.
  - 실패하면 `markOffline`/`markError` 만 하고, 재시도는 다음 `online`·`focus`·`visibilitychange` 이벤트나 다음 쓰기 때까지 기다린다. **backoff 타이머가 없다.**
  - pull 의 `kind:"error"` 는 조용히 return 한다.
- 기기 저장소 `lib/device-storage.ts`:
  - 앱(SQLite)은 키마다 마지막 값만 **비동기 대기열**로 쓴다.
  - `reloadApp()` = `flushDeviceStorage()`(제한 시간 있음) 후 `location.reload()`.
  - 주석: "기다리지 않고 새로고침하면 뒤에 줄 선 값이 사라진다".
- 계정 저장소 `lib/account-storage.ts`: "로그인 사용자를 알기 전(`activateAccount` 전)에는 아무것도 읽거나 쓰지 않는다". 세션 확인은 서버 왕복이다.
- 기기 DB 마이그레이션 `lib/native/device-db/migrations.ts`:
  - 적용 안 된 버전만 골라 올린다.
  - 옛 JS 는 자기보다 높은 버전 행이 있어도 에러 없이 지나간다. 롤백해도 안 깨지지만, **새 스키마가 옛 JS 에 호환될 때만** 안전하다.
- 서버 동기화 `server/sync/apply-mutation.ts` + `server/investments/investment-record.ts`:
  - 마지막 저장이 이긴다(upsert).
  - 나중에 추가된 필드는 `v.sellCostPercent ?? 0` 처럼 **없으면 기본값**으로 채워 저장한다 (§B5.2).
  - 같은 mutation 을 다시 보내면 같은 값으로 덮으니 재전송은 멱등이다 (version 만 +1).

---

## B2. 문제 1 — 배포 중 다운타임 (502)

### 2.1 원인

- `up -d` 는 옛 컨테이너를 멈춘 뒤 새 컨테이너를 만든다. 그 사이와 Next 서버가 listen 하기 전까지 Caddy → `127.0.0.1:3001` 연결이 실패해 502 가 난다.
- **플랫폼별로 보이는 것이 다르다** (Capacitor 소스로 확인):
  - **iOS**: `WebViewDelegationHandler.swift` 는 `didFail`/`didFailProvisionalNavigation` (전송 실패)에서만 `errorPath` 를 띄우고 HTTP 상태는 보지 않는다. → **Caddy 의 502 원문(빈 화면에 가까움)이 그대로 보인다.**
    - https://github.com/ionic-team/capacitor/blob/main/ios/Sources/Capacitor/WebViewDelegationHandler.swift
  - **Android**: `BridgeWebViewClient.java` 는 `onReceivedError` 와 `onReceivedHttpError` 둘 다에서, main frame 이면 `errorPath` 로 간다. → 502 면 `error.html` 이 뜬다. 하지만 기기는 온라인이라 `online` 이벤트가 오지 않아 **자동 복구가 안 된다.**
    - https://github.com/ionic-team/capacitor/blob/main/android/capacitor/src/main/java/com/getcapacitor/BridgeWebViewClient.java
  - 페이지가 뜬 뒤의 fetch/RSC 502 는 두 플랫폼 모두 `errorPath` 와 무관하다.
- Capacitor 공식 문서는 `server.url` 이 "live-reload 용이며 production 용이 아니다"라고 적는다. https://capacitorjs.com/docs/config

### 2.2 방식 비교

| 방식                                                  | 내용                                                                                                                | 장점                                                                                        | 단점                                                                                                    | 판단                      |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------- |
| A. 지금 + Caddy `lb_try_duration` 만                  | 재시작 동안 Caddy 가 연결을 다시 시도하며 요청을 붙잡음                                                             | 설정 한 줄                                                                                  | 연결 실패는 POST 도 재시도되지만, 보내진 뒤 끊긴 POST 는 재시도 안 됨. 기동이 30초 넘게 걸리면 결국 502 | 1단계로 같이 넣는다       |
| **B. 2색 compose 서비스 + 호스트 Caddy 업스트림 2개** | `web-blue`(3001)·`web-green`(3002). 쉬는 색을 `up -d --wait` → Caddy 가 헬스로 넘김 → 옛 색 `stop` (SIGTERM, grace) | Caddy 를 호스트에 그대로 둔다. 새 도구가 없다. 실패하면 옛 색이 계속 서비스(자동 롤백 효과) | 배포 스크립트(색 고르기) 필요. 겹치는 동안 DB 연결 2배                                                  | **권장**                  |
| C. docker-rollout                                     | 서비스를 2개로 scale → 헬스 대기 → 옛 컨테이너 제거                                                                 | 명령 한 줄                                                                                  | `ports:`·`container_name` 금지 → Caddy 가 Docker 네트워크 안에 있어야 함. 호스트 Caddy 구조를 바꿔야 함 | 비권장 (Caddy 이전 비용)  |
| D. kamal-proxy                                        | 전용 프록시. 헬스 통과 뒤 전환, drain, 요청 버퍼링                                                                  | 무중단 전용 설계                                                                            | Caddy 앞이나 뒤에 프록시 하나 더. TLS·운영 요소가 늘어남                                                | 비권장 (규모에 비해 과함) |

출처:

- Caddy reverse_proxy (`lb_try_duration`, `lb_try_interval`, `health_uri`, `lb_retry_match` — 기본은 GET 만 재시도, 연결 실패는 항상 재시도): https://caddyserver.com/docs/caddyfile/directives/reverse_proxy
- docker-rollout: https://github.com/wowu/docker-rollout
- kamal-proxy: https://github.com/basecamp/kamal-proxy

### 2.3 권장 구성 (B)

**Caddy** (호스트, 레포로 가져와 버전 관리 권장):

```caddyfile
seedbook.boogie.ing {
  # 옛 청크 누적 디렉토리(§B3)를 먼저 본다 — 컨테이너 교체와 무관
  @static path /_next/static/*
  handle @static {
    root * /srv/seedbook/static-archive   # 호스트 bind mount
    rewrite * {path}
    file_server
    header Cache-Control "public, max-age=31536000, immutable"
  }
  handle {
    reverse_proxy 127.0.0.1:3001 127.0.0.1:3002 {
      lb_policy first
      health_uri /api/health
      health_interval 2s
      lb_try_duration 30s
      lb_try_interval 250ms
      fail_duration 10s
    }
  }
  handle_errors 502 503 504 {
    root * /srv/seedbook/maintenance
    rewrite * /maintenance.html
    header Retry-After 5
    header Cache-Control no-store
    file_server
  }
}
```

- `lb_policy first`: 건강한 쪽 중 앞의 것을 쓴다. 두 색이 다 살아 있는 짧은 겹침 동안 어느 쪽으로 가도 같은 DB 를 쓴다.
- 점검 페이지(`maintenance.html`): 3~5초 간격 backoff 로 `location.reload()`. **iOS 의 502 원문 문제를 서버 쪽에서만으로 해결한다** (앱 재배포 불필요).
  - Android 는 `onReceivedHttpError` 때문에 점검 페이지 대신 `error.html` 로 간다 (§B2.4 필요).
  - `reverse_proxy` 의 연결 실패 502 가 `handle_errors` 로 가는지: 공식 문서는 "업스트림이 보낸 오류 응답은 `handle_errors` 를 타지 않는다" 고만 쓰고, 연결 실패 경우는 명시하지 않는다. 실무 사례는 탄다고 한다 → **미확인, 스테이징에서 확인 필요**. https://caddyserver.com/docs/caddyfile/directives/handle_errors

**compose**:

- `web-blue`/`web-green` 을 같은 이미지·env 로 두고 포트만 다르게 한다.
- `healthcheck: ["CMD","node","-e","fetch('http://127.0.0.1:3001/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]`, `start_period`.
- `stop_grace_period: 30s`.
- healthcheck·`--wait` 문법: https://docs.docker.com/reference/compose-file/workload-spec/ , https://docs.docker.com/reference/cli/docker/compose/up/

**`/api/health`**: DB 에 `select 1` 을 짧은 제한 시간으로. 실패하면 503. 동적, `no-store`. 버전(§B4)도 같이 돌려줄 수 있다.

**배포 스크립트** (서버, `scripts/` 가 아니라 compose 옆 `deploy.sh` 로 scp):

1. `docker compose run --rm migrate` (§B2.5). 실패하면 중단.
2. 활성 색 판단 (`.env` 의 `ACTIVE_WEB` 나 `docker compose ps`).
3. 쉬는 색에 새 태그로 `docker compose up -d --wait --wait-timeout 120 web-<idle>`. 실패하면 중단 (옛 색 그대로 서비스).
4. Caddy 헬스 간격(2s)의 2~3배를 기다림.
5. `docker compose stop web-<active>` (SIGTERM → grace). `.env` 에 `ACTIVE_WEB` 기록.
6. crawler 는 web 과 따로 `up -d stock-crawler`.

Next standalone 서버가 SIGTERM 에 진행 중 요청을 마무리하는지는 **미확인**이다. grace 와 Caddy 헬스 전환이 앞서 일어나게 해서 영향을 줄인다.

### 2.4 앱 쪽 (`error.html`)

- `online` 대신 **시간 기반 backoff 재시도**를 한다: 2s → 4s → 8s → … 최대 30s 로 `location.replace(SERVER_URL)`. `visibilitychange`(앱 복귀) 때도 즉시 재시도한다. 문구도 "서버 점검 중일 수 있어요"를 같이 보여 준다.
  - cross-origin `fetch` 로 헬스를 먼저 볼 수도 있다. 하지만 error.html 의 origin 이 로컬이라 CORS 설정이 필요하다. 그냥 다시 여는 게 단순하다 (추론).
- 이것은 `www/` 에 번들되므로 **앱 스토어 릴리스가 필요하다.** 서버 쪽 B 만 해도 502 자체가 거의 없어지므로 다음 네이티브 릴리스 때 끼워 넣으면 충분하다.
- Android 는 `errorPath` 페이지에서 Capacitor 플러그인을 쓸 수 없다 (공식 문서). 순수 JS 로만 만든다.

### 2.5 마이그레이션 선행 + DB 연결 한도

- **one-shot `migrate` 서비스**: crawler 이미지로 `command: migrate.ts`, `restart: "no"`, `profiles: [tools]`. 배포 스크립트 1번에서 `run --rm`.
  - crawler entrypoint 의 migrate 는 이중 안전장치로 남겨도 되지만, 동시 실행 잠금이 없으니 빼는 편이 깔끔하다.
  - drizzle `migrate()` 에 프로세스 간 잠금이 없다는 것은 공식 문서로는 **미확인**이다 (사례: https://github.com/simstudioai/sim/pull/4939).
- **expand/contract 규칙** (https://martinfowler.com/bliki/ParallelChange.html): 2색 교체 때는 옛 web 과 새 web 이 같은 스키마를 같이 쓴다. 그리고 앱은 **며칠 된 옛 JS** 가 새 서버 API 를 부른다.
  1. **expand**: 컬럼·테이블은 추가만 한다. 새 컬럼은 nullable 이거나 default 를 둔다.
  2. 코드 배포, `db:backfill:*` 실행.
  3. **contract**(drop·rename·NOT NULL 강화)는 **옛 클라이언트가 사라질 만큼 지난 뒤** 별도 PR 로 한다. 앱 기준 최소 정적 자산 보존 기간(§B3) 이상.
  - CLAUDE.md "마이그레이션 규칙"에 한 줄 추가 권장.
- **Supabase 세션 풀러**: Nano~Medium 기본 pool size 15. session 모드는 클라이언트 수가 pool size 로 묶인다.
  - https://supabase.com/docs/guides/platform/compute-and-disk , https://supabase.com/docs/guides/troubleshooting/supavisor-faq-YyP5tI
  - 지금(web 8)으로 겹치면 8+8+crawler 1 = 17 > 15 → **겹치는 동안 `EMAXCONNSESSION` 위험** (https://github.com/orgs/supabase/discussions/22305).
  - 권장: web `DB_POOL_MAX` 6 → 겹침 6+6+1 = 13. migrate(1)는 겹치기 전에 끝난다 → 최대 14.
  - postgres.js `idle_timeout: 20` 을 추가해 옛 색이 트래픽을 잃으면 연결을 빨리 반납하게 한다 (기본 0 = 닫지 않음, https://github.com/porsager/postgres). 함께 SIGTERM 때 `sql.end({ timeout: 5 })`.
  - 또는 Supabase 대시보드에서 Pool Size 를 올린다 (Micro 는 직접 연결 60).

---

## B3. 문제 2 — 버전 어긋남 (옛 청크 404, 옛 JS ↔ 새 API)

### 3.1 무엇이 되고 무엇이 안 되나

- **`deploymentId`** (https://nextjs.org/docs/app/api-reference/config/next-config-js/deploymentId):
  - 정적 자산 URL 에 `?dpl=` 을 붙이고, 내비게이션 요청·응답에 `x-deployment-id`/`x-nextjs-deployment-id` 를 주고받는다. 다르면 **hard navigation** 한다.
  - 셀프호스트에서는 Next 가 `?dpl=` 로 라우팅하지 않는다 (문서 명시). → **lazy 청크 404 는 못 막는다.** 내비게이션만 보호된다.
  - Turbopack·standalone 제약은 문서에 없다 (명시적 확인은 미확인).
  - 16.4.6 은 deploymentId 없이도 빌드 ID 로 같은 비교를 한다 (§B1.3). 그러니 `deploymentId = git sha` 로 두는 것은 "같은 커밋이면 같은 ID" 를 보장하는 정리 정도의 효과다.
- **Vercel Skew Protection** 은 플랫폼이 옛 배포로 라우팅해 주는 기능이다 (기본 최대 12h~1d). 셀프호스트에는 없다. https://vercel.com/docs/skew-protection
- **Next 공식 셀프호스트 가이드**: 정적 자산을 "기존 폴더(또는 CDN 버킷)에 계속 추가하면 버전 어긋남이 없다". https://nextjs.org/docs/app/guides/self-hosting
  - `supportsImmutableAssets` (16.3+) 는 어댑터 작성자용이라 쓰지 않는다.
- `next/dynamic` 은 `React.lazy` 를 감싸므로 청크 로드 실패가 렌더 중 throw 돼 가장 가까운 `error.tsx` 로 간다. 루트 레이아웃이면 `global-error.tsx` 로 간다.
  - https://nextjs.org/docs/app/api-reference/file-conventions/error
  - `reset()` 은 같은 404 를 다시 부르므로 소용없다 → **새로고침**이 필요하다.
  - Next 에 자동 재시도는 없다 (제안 PR #88004 는 머지되지 않음: https://github.com/vercel/next.js/pull/88004).

### 3.2 권장: 세 겹

1. **옛 정적 자산 보존 (서버, 가장 효과 큼)**:
   - web 이미지 entrypoint(또는 배포 스크립트)가 이미지 안 `apps/web/.next/static` 을 호스트 `/srv/seedbook/static-archive/_next/static` 에 **덮어쓰지 않고 복사**(`cp -rn`)한다.
   - Caddy 가 `/_next/static/*` 를 그 디렉토리에서 바로 준다 (§B2.3).
   - 청크 파일명은 내용 해시라 빌드끼리 겹치지 않는다.
   - **보존 기간 30일** (mtime 기준 GC, 배포 때 실행): 앱은 며칠~몇 주 켜진 채 남는다. 정적 자산은 수 MB 수준이라 디스크 부담이 작다 (추론, 실측 필요).
   - 대안 CDN `assetPrefix` 는 버킷·CDN 이 하나 더 늘어 규모에 비해 과하다.
   - 사례: https://ibl.ai/developer/os/deployment (릴리스별 static 보존 + ChunkLoadError reload), https://dev.to/markettrace/chunkloaderror-on-every-deploy-the-in-place-rebuild-trap-in-nextjs-standalone-1d8i
   - **이것만으로 iOS(SW 없음)도 보호된다.**
2. **ChunkLoadError 회복 (웹)**:
   - `app/global-error.tsx`, `app/m/error.tsx` 를 둔다.
   - `error.name === "ChunkLoadError"` 이거나 message 에 `Failed to load chunk`/`Loading chunk` 가 있으면 **`reloadApp()`** 을 1회 한다. `location.reload()` 가 아니다 — local 모드 데이터 보호 (§B5.1).
   - 가드: 같은 URL 은 sessionStorage 에 30초 안 1회만. 실패가 반복되면 "새 버전이 있어요 · 다시 열기" 버튼 화면을 보인다.
   - 렌더 밖 `import()` (three.js 지연 로드 등)를 위해 `window` 의 `unhandledrejection` 리스너도 둔다.
   - 사례: https://onestack.dev/docs/guides-skew-protection , https://vite.dev/guide/build (`vite:preloadError`)
3. **버전 비교 후 안전한 시점에 새로고침 (웹)**:
   - `/api/health` 또는 `/api/version` 이 `{ version: <git sha>, minClient: <sha 또는 숫자> }` 를 준다. 클라이언트는 빌드 때 박힌 자기 버전과 비교한다.
   - **비교 시점**: `visibilitychange → visible`, 앱 `App.addListener('resume')` (이미 `@capacitor/app` 있음), 30분 타이머.
   - **새로고침 시점**: ① 앱이 백그라운드에 N분(예: 10분) 넘게 있다가 돌아왔을 때, ② 열린 시트·다이얼로그·입력 중인 폼이 없을 때, ③ 스택 루트(탭 화면)일 때. 셋 다 맞으면 조용히 `reloadApp()`.
     - 아니면 다음 탭 전환 때까지 미룬다. 미루기만 하면 되는 것은 1번 보존이 받쳐 주기 때문이다.
   - **강제 시점**: 클라이언트 버전 < `minClient` (서버가 옛 클라이언트를 더는 받지 않을 때)면 미루지 않고 바로 안내 후 `reloadApp()`.
   - Next 공식 라이브러리는 없다 (미확인) — 직접 만든다.

### 3.3 옛 JS ↔ 새 API 호환 규칙 (문서로 고정)

- 클라이언트가 부르는 `/api/*` 는 **추가만** 한다. 필드 제거·의미 변경은 새 경로(`/api/sync/v2/...`)나 contract 단계에서 한다.
- 서버는 모르는 필드를 무시하고, **빠진 필드는 기존 값을 건드리지 않는다** (§B5.2).
- 정말로 깨야 하면 `minClient` 를 올리고 426(또는 409 + 코드)로 응답한다. 클라이언트는 이걸 받으면 대기열을 유지한 채 `reloadApp()`.

---

## B4. 문제 3 — 502/점검 화면 (정리)

| 위치            | 대책                                                                                                           | 배포 경로                                                     |
| --------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| 서버            | 2색 교체로 502 자체를 없앰. `lb_try_duration` 으로 짧은 틈은 Caddy 가 붙잡음                                   | 서버만                                                        |
| 서버            | `handle_errors` 점검 페이지 (자동 재시도, `Retry-After`) → 브라우저·iOS 앱                                     | 서버만                                                        |
| 앱              | `error.html` backoff 재시도 + 복귀 시 재시도 → Android 앱 (502 를 HTTP 오류로 받음), 두 플랫폼의 진짜 오프라인 | 앱 릴리스                                                     |
| 웹              | 이미 뜬 화면에서 API 502 → 동기화 재시도 (§B5.3). local 모드는 서버 없이 볼 수 있게 (§B5.1)                    | 웹 배포                                                       |
| 네이티브 (선택) | iOS `decidePolicyFor navigationResponse` 로 main frame 5xx 를 `errorPath` 로 보내기                            | 앱 릴리스 + Capacitor 확장 — 서버 점검 페이지로 충분해 비권장 |

---

## B5. local / cloud 저장 모드별 위험과 대책 (이번 조사의 핵심)

### 5.1 local 모드 — 기기가 유일한 사본

1. **새로고침 = 데이터 손실 위험.** 앱은 SQLite 쓰기를 비동기 대기열로 한다 (`createNativeDeviceStorage`).
   - 자동 복구 수단(ChunkLoadError reload, 버전 reload, 점검 후 재진입)이 모두 새로고침이므로, **전부 `reloadApp()` 을 거쳐야 한다.**
   - 린트로 막는 것을 권장: biome `noRestrictedGlobals`/`noRestrictedImports` 류로 `location.reload` 사용 금지. 가능한 규칙 지원 범위는 미확인.
   - `global-error.tsx` 는 루트 레이아웃 밖에서 렌더되지만 `reloadApp()` 은 모듈 싱글톤 `getDeviceStorage()` 를 쓰므로 호출할 수 있다 (추론, 구현 때 확인).
   - `flushDeviceStorage` 에는 제한 시간이 있어 걸려도 결국 새로고침한다. 이 경우 손실이 남는다 → 버전 reload(§B3.2-3)는 `flushDeviceStorage()` 가 `true` 일 때만 한다.
2. **서버 없이 열 수 없다.** 계정 자리는 세션 확인 뒤에만 열린다. 그래서 502·오프라인 동안 local 모드 사용자는 데이터가 기기에 있는데도 못 본다.
   - 대책: 세션 확인이 **네트워크 오류·5xx** 로 실패하면 마지막으로 확인된 계정(`seedbook.owner` 또는 마지막 활성 userId 를 기기에 기록)으로 자리를 **읽기 전용 또는 읽기·쓰기**로 연다. **401/로그아웃이면 열지 않는다.**
   - 앱 잠금(생체인증)이 이 경로를 대신 지키게 한다.
   - 인증 경로라 mergeApproval 대상이다. 다른 계정 데이터 노출이 없도록 `account-isolation` 테스트를 확장한다.
   - 이 단계가 중장기 번들(§B7)의 전제이기도 하다.
3. **기기 스키마도 expand/contract.** 기기 SQLite 마이그레이션은 웹 JS 가 돌린다.
   - 웹 롤백(옛 sha 재배포)이나 옛 청크로 떠 있는 옛 JS 가 새 스키마를 만난다. 지금 `migrateDeviceDatabase` 는 높은 버전을 무시하므로, **기기 마이그레이션은 컬럼·테이블 추가만** 해야 롤백에도 안전하다.
   - `migrations.ts` 머리 주석에 규칙을 추가하고, `migrations.test.ts` 에 "DROP/RENAME 금지" 검사를 추가하는 것을 권장한다.
4. **local 모드의 서버 의존**: 시세(`/api/stocks/*`), 일별 기록 채우기(`/api/stocks/price-history`, `account-value-history-runner`). 배포 중 5xx 면 **다음 기회로 미루기만** 해야 한다 (마지막 기록 날짜를 올리지 않음).
   - 현재 동작이 그런지는 코드 정독 필요 — **미확인**.
5. 브라우저(PWA) local 모드는 localStorage 동기 쓰기라 reload 손실은 없다.
   - 다만 **여러 탭**이 서로 다른 JS 버전이면 Zustand persist `version` 을 올린 새 탭과 옛 탭이 같은 키를 번갈아 쓴다.
   - persist 버전을 올리는 배포는 옛 탭을 `BroadcastChannel`/`storage` 이벤트로 새로고침시키는 장치가 필요하다 (추론, 현재 persist 버전 올림이 드물면 후순위).

### 5.2 cloud 모드 — 서버가 원본

1. **옛 클라이언트가 새 필드를 기본값으로 덮는다 (코드로 확인한 실제 위험).**
   - `parseInvestmentFields` 는 `sellCostPercent ?? 0` 처럼 나중에 생긴 필드가 없으면 기본값으로 채워 **upsert(마지막 저장이 이김)** 한다.
   - 예: 새 앱에서 매도 제비용률 0.3% 설정 → 업데이트 안 된 다른 기기(또는 옛 청크로 떠 있는 앱)에서 계좌 이름만 바꿈 → 서버 값이 0 으로 돌아가고, pull 로 새 기기에도 퍼진다.
   - 대책: `parseFields` 가 "빠진 필드 = 건드리지 않음"을 표현하고, upsert 의 `set` 에서 빠진 컬럼을 제외한다 (insert 때만 default).
   - 동기화 서버라 mergeApproval 대상이다. `sync.db.test.ts` 에 "옛 모양 mutation 이 새 컬럼을 보존" 테스트를 추가한다.
   - 반대 방향(새 서버 → 옛 클라이언트 pull)은 옛 클라이언트가 모르는 필드를 저장하는지 버리는지에 달렸다. 버리고 다시 upsert 하면 같은 문제가 난다. 클라이언트 `mergePullResponse` 의 필드 처리는 **미확인**이므로 같이 확인한다.
2. **mutation 거부 → 로컬 변경이 조용히 사라짐.** `sendOnce` 는 `rejected > 0` 이면 `pull()` 로 서버 상태에 다시 맞춘다.
   - 새 서버가 옛 모양을 `invalid` 로 거부하면 사용자의 편집이 경고 없이 사라진다. 그러니 **검증을 강화하는 변경도 contract 단계로 미룬다.**
   - 거부가 생기면 상태 표시줄로 알리는 것을 권장한다.
3. **재시도·제한 시간.** 배포 중 POST 가 502 를 받으면 Caddy 는 (보내진 뒤 끊긴 POST 를) 재시도하지 않는다.
   - 엔진은 `markError` 후 다음 이벤트까지 멈춘다. mutation 은 멱등(LWW upsert, §B1.3)이라 재전송이 안전하다.
   - 대책: `AbortSignal.timeout(15s)`, 5xx·네트워크 오류 때 지수 backoff (1s→2s→…→60s, 지터) 재시도, `online`·`resume` 때 즉시. 401 은 재시도하지 않는다. pull 의 `kind:"error"` 도 같은 재시도에 태운다.
   - `keepalive` 요청(64KB 제한)은 그대로 둔다.
4. **모드 전환 중 배포**: 저장소 병합(`storage-merge`)과 `/api/account-snapshots` 병합이 중간에 실패할 때 재시도해도 안전한지는 **미확인**. 병합은 같은 항목 로컬 우선이라 재실행해도 수렴할 것으로 보인다 (추론). 구현 PR 에서 테스트로 확인한다.
5. 서버 crawler 의 `investment_account_snapshot` 기록은 web 배포와 무관하다. crawler 재시작이 cron 시각과 겹치는 경우만 주의한다.

### 5.3 두 모드 공통

- 버전 reload·ChunkLoadError reload 전에 `flushDeviceStorage()` 를 하고, cloud 모드면 동기화 `flush({keepalive:true})` 도 해 둔다 (대기열은 저장돼 있으므로 필수는 아님).
- 점검 페이지·`error.html` 에서 복귀하면 처음부터 다시 로드한다. 기기 데이터는 SQLite 에 있으니 안전하다. 단, 1.의 대기열 flush 는 뜬 페이지에서만 의미가 있다.

---

## B6. 서비스 워커 전략

- **iOS**: WKWebView 의 SW 는 `WKAppBoundDomains` + `limitsNavigationsToAppBoundDomains` 일 때만 동작한다는 보고가 다수다. Apple 은 "명시적으로 켜는 지원 방법은 없다"고도 했다.
  - https://developer.apple.com/forums/thread/781744 , https://developer.apple.com/forums/thread/726686 , https://webkit.org/blog/10882/app-bound-domains/
  - 현재 앱에 해당 키가 없으므로 **iOS 앱에서는 SW 가 돌지 않는 것으로 간주한다.** 실기기 확인은 **미확인**: Safari 원격 디버거에서 `navigator.serviceWorker.controller` 확인 필요.
- **App-Bound Domains 의 대가**:
  - 최대 10개 도메인.
  - 목록 밖 이동 차단 → 카카오 OAuth(`kauth.kakao.com`, `accounts.kakao.com` 등 리다이렉트 체인), `appleid.apple.com` 을 다 넣어야 한다.
  - 대신 시스템 브라우저 인증(ASWebAuthenticationSession)으로 바꿔야 한다.
  - JS 주입·메시지 핸들러가 기본 차단돼 Capacitor 브리지에 영향이 있다.
  - → **도입하지 않는다.** 얻는 것(precache 기반 skew 보호, `/offline`)은 §B3.2 의 정적 보존과 `error.html` 이 더 싸게 준다.
- **Android**:
  - SW 가 돌고 precache 로 첫 설치 때 `_next/static` 전체(three.js 포함)를 받는다. `skipWaiting:false` 라 앱을 완전히 끌 때까지 옛 SW 가 남는다.
  - §B3.2 를 하면 SW 의 skew 보호는 필요 없다.
  - **권장**: 네이티브 앱(UA `SeedbookApp/`)에서는 `SerwistProvider` 를 끄고, 이미 등록된 SW 는 한 번 `unregister()` 한다.
  - 이득: 플랫폼 간 동작 통일, 데이터 사용 감소, "새로고침했는데 옛 SW 가 붙잡음" 같은 디버깅 난이도 제거.
  - 대가: Android 앱의 `/offline` 페이지가 사라진다 → `error.html` 이 대신한다.
  - 브라우저 PWA 는 지금 정책을 유지한다.

---

## B7. 중장기 — `/m` 을 앱에 번들 + API 만 서버

### 7.1 필요한 변경

- **정적 export 제약** (https://nextjs.org/docs/app/guides/static-exports): proxy(UA rewrite·CSP nonce), `cookies()`/`headers()`, 요청 시 서버 렌더, Route Handlers(동적), Server Actions, rewrites/redirects 를 쓸 수 없다.
  - `app/layout.tsx` 의 `headers()`(nonce), `app/m/layout.tsx` 의 서버 의존을 걷어 내야 한다.
  - `/m` 트리를 별도 빌드 타깃(같은 레포, `output:'export'` 를 env 로 켜는 두 번째 next config, 또는 `apps/app-shell`)으로 분리하는 것이 현실적이다 (추론).
  - 동적 경로 `app/m/assets/[[...slug]]` 는 `generateStaticParams` 또는 클라이언트 라우팅(stackflow 가 이미 클라이언트 스택)으로 바꾼다.
- **인증**: origin 이 `capacitor://localhost`(iOS)·`https://localhost`(Android)가 된다. WKWebView 는 서드파티 쿠키를 막는다.
  - better-auth `bearer()` 플러그인(`set-auth-token` 응답 헤더 → `Authorization: Bearer`)으로 바꾸고, 토큰은 Keychain/Keystore(이미 쓰는 생체인증 플러그인 계열)에 둔다. https://www.better-auth.com/docs/plugins/bearer
  - 카카오·애플 로그인은 시스템 브라우저 + 딥링크로 바꿔야 한다 (미확인, 별도 조사).
- **CORS**: 서버가 위 두 origin + `Authorization` 헤더를 허용한다. 또는 CapacitorHttp(네이티브 HTTP)로 우회하지만 큰 body 는 브리지 부담이 있다. https://capacitorjs.com/docs/apis/http
- **저장소 모드 영향**:
  - 기기 데이터는 이미 **SQLite(네이티브, origin 무관)** 라 origin 이 바뀌어도 local 모드 데이터는 그대로 남는다. 이것이 지금 구조의 큰 장점이다.
  - 다만 SQLite 이전의 아주 옛 빌드에서 localStorage 폴백으로 남은 데이터는 origin 이 바뀌면 못 읽는다. 전환 전에 "SQLite 로 옮김" 완료 비율을 확인한다.
  - local 모드는 번들 후 **완전 오프라인 열람**이 가능해진다 (§B5.1-2 가 전제).
  - cloud 모드는 토큰 기반 동기화가 된다.
- **OTA**:

  | 선택지                                | 자체 호스팅                                  | 비용                                        | 비고                                      |
  | ------------------------------------- | -------------------------------------------- | ------------------------------------------- | ----------------------------------------- |
  | **@capawesome/capacitor-live-update** | 가능 (`downloadBundle({url})` 로 아무 URL)   | 플러그인 MIT, 클라우드는 선택 (가격 미확인) | `ready()` 미호출 시 내장 번들로 자동 롤백 |
  | Capgo                                 | 가능 (오픈소스, 라이선스 표기 혼재 — 미확인) | Solo $14/월~                                | 채널·롤백·통계                            |
  | Ionic Appflow                         | —                                            | —                                           | 2027-12-31 서비스 종료 공지, 비권장       |
  - 출처: https://capawesome.io/plugins/live-update/ , https://capgo.app/pricing/ , https://ionic.zendesk.com/hc/en-us/articles/29907381079831
  - 정책: Apple DPLA 3.3.1(B) 는 앱의 주 목적을 바꾸지 않는 해석 코드 다운로드를 허용한다. Google Play 는 WebView 안 JavaScript 를 실행 코드 다운로드 금지에서 제외한다.
    - https://developer.apple.com/support/terms/apple-developer-program-license-agreement/ , https://support.google.com/googleplay/android-developer/answer/9888379
  - 번들 + OTA 가 되면 버전 어긋남은 "번들 버전 ↔ API 버전" 하나로 줄어든다. §B3.3 의 API 호환 규칙과 `minClient` 가 그대로 이어진다.
- **App Store 심사**: 원격 URL 셸은 4.2(최소 기능)·2.5.2 위험이 남는다 (반려 사례·Ionic 관계자 의견 있음, 판정은 심사자마다 다름). 생체인증·SQLite·네이티브 탭바가 있어 완화되지만 번들이 더 안전하다.
  - https://developer.apple.com/app-store/review/guidelines/ , https://forum.ionicframework.com/t/apple-app-store-approval-issue-with-this/199417

### 7.2 언제 하나 (아래 중 하나가 생기면 시작)

1. local 모드 사용자가 의미 있게 늘어 **오프라인 열람**이 요구사항이 될 때.
2. App Store 심사에서 4.2/2.5.2 지적을 받을 때.
3. 1~3단계 뒤에도 배포 관련 오류(흰 화면·ChunkLoadError) 보고가 계속될 때.
4. Android 원격 로드 시작 속도가 문제 될 때 (https://github.com/ionic-team/capacitor/issues/5745).

그 전까지는 원격 셸 + 1~3단계가 비용 대비 낫다. 번들 전환은 인증(쿠키→토큰·OAuth 딥링크), 레이아웃 서버 의존 제거, OTA 파이프라인까지 **수 주 규모**다.

---

## B8. 단계별 PR 나누기 안

공수: S(≤반나절) / M(1~2일) / L(3일+). "승인" = `.hwt.json` mergeApproval 에 걸림.

| #   | PR                                                          | 내용                                                                                                                                                                                                   | 위험                                                                          | 공수      | 승인                               |
| --- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- | --------- | ---------------------------------- |
| 1   | `feat(web): add health and version endpoint`                | `/api/health` (DB select 1, 제한 시간), 응답에 `version`(빌드 때 `NEXT_PUBLIC_BUILD_SHA`)·`minClient`. Dockerfile build-arg 로 sha 주입                                                                | 헬스 DB 쿼리가 풀 연결 하나를 2초마다 씀 (작음)                               | S         | Dockerfile → 승인                  |
| 2   | `chore: run migrations as a one-shot step before web`       | compose `migrate` 서비스(`profiles`), 배포 스크립트에서 `run --rm`, crawler entrypoint migrate 제거 여부 결정, CLAUDE.md 에 expand/contract 규칙                                                       | 첫 배포 순서 실수로 마이그레이션 누락 → 배포 run 로그로 확인                  | S~M       | 승인                               |
| 3   | `chore: zero-downtime blue/green web deploy`                | compose `web-blue/green` + healthcheck + `stop_grace_period`, `deploy.sh`, `DB_POOL_MAX` 6, postgres.js `idle_timeout`·SIGTERM `sql.end`, Caddyfile 을 레포로(서버 반영은 수동 1회, 사용자 승인)       | Caddy 설정 실수 = 전체 장애. 첫 전환 때 포트 3001 점유 순서. 풀 한도          | M         | 승인 (인프라)                      |
| 4   | `chore: keep old static assets across deploys`              | static-archive 복사·30일 GC, Caddy `/_next/static` file_server                                                                                                                                         | 디스크 증가(작음), 경로 실수 시 모든 청크 404 → 3과 같이 스테이징 확인        | S         | 승인                               |
| 5   | `feat(web): recover from version skew`                      | `deploymentId`=sha, `global-error.tsx`·`app/m/error.tsx` ChunkLoadError → `reloadApp()` 1회 가드, `unhandledrejection`, 버전 비교(visible/resume/30분) + 안전 시점 reload, `location.reload` 금지 린트 | 새로고침 루프 → sessionStorage 가드 + 테스트. 입력 중 reload → 안전 시점 조건 | M         | 아님 (lib/native·sync 안 건드리면) |
| 6   | `fix(web): keep fields omitted by older clients`            | `parseFields` 빠진 필드 = 미변경, upsert `set` 에서 제외, `sync.db.test.ts` 회귀 테스트, 클라이언트 pull 필드 보존 확인                                                                                | 동기화 핵심 경로. 모든 엔티티 record 를 훑어야 함                             | M         | 승인 (sync)                        |
| 7   | `feat(web): retry sync with backoff and timeouts`           | fetch 제한 시간, 5xx/네트워크 backoff, pull error 재시도, 거부 시 알림                                                                                                                                 | 재시도 폭주 → 지터·상한, 탭 숨김 시 중지                                      | M         | 승인 (lib/sync)                    |
| 8   | `feat(web): open local data when the server is unreachable` | 세션 확인이 네트워크 오류·5xx 일 때 마지막 계정 자리를 연다 (401 제외), 앱 잠금 연동, account-isolation 테스트                                                                                         | **계정 격리·인증 위험이 가장 큼** → 신중히, 사용자 결정 필요                  | M~L       | 승인 (auth)                        |
| 9   | `chore(web): skip the service worker in the native app`     | 앱 UA 면 `SerwistProvider` 끄기 + 기존 등록 해제                                                                                                                                                       | Android `/offline` 사라짐 (error.html 이 대신)                                | S         | 아님                               |
| 10  | `feat(mobile): retry error page with backoff`               | `error.html` 시간 기반 재시도·복귀 재시도·문구                                                                                                                                                         | 앱 릴리스 필요 (다음 네이티브 릴리스와 묶음)                                  | S         | 아님                               |
| 11  | 기기 스키마 규칙                                            | `migrations.ts` 규칙 주석 + DROP/RENAME 금지 테스트                                                                                                                                                    | 낮음                                                                          | S         | 승인 (device-db)                   |
| —   | (중장기) 번들 + OTA                                         | §B7                                                                                                                                                                                                    | 인증 재설계                                                                   | L (수 주) | 승인 다수                          |

**순서와 의존**:

- 1 → 2 → 3 → 4 순서로 한다. 3·4 는 같은 Caddy 변경이라 하나로 합쳐도 된다.
- 5 는 1 뒤에 언제든.
- 6·7 은 둘 다 `lib/sync`·`server/sync` 를 고치므로 CLAUDE.md 규칙상 `after:` 로 직렬.
- 8 은 사용자 결정 뒤.
- 9·11 은 독립.

**효과 대비 우선순위**: 3·4 (서버만으로 502·흰 화면 대부분 제거, 앱 재배포 불필요) > 6 (cloud 모드 조용한 데이터 덮어쓰기) > 5 > 7 > 2 > 10 > 9 > 8 > 11.

- 2 는 3 의 전제이므로 실제 머지 순서는 앞이다.

---

## B9. PR #87 과 "서비스별 워크플로 분리" 와의 관계

- **PR #87 (마지막 성공 배포 기준 빌드 대상 판단)** 은 이 안과 충돌하지 않는다. 오히려 보완한다.
  - 취소된 run 의 변경을 다음 run 이 배포하므로 "어느 커밋까지 배포됐나" 가 분명해진다. 그러면 §B3.2 의 `version`/`minClient` 와 정적 보존 GC 기준이 명확해진다.
  - `hwt mergeQueue.deploy` 의 URL 200 확인은 2색 교체 뒤에는 "배포 중에도 200" 이 되어 의미가 약해진다. `/api/health` 의 `version == 머지 sha` 확인으로 바꾸는 것을 권장한다 (#87 이후 별도 PR).
- **서비스별 워크플로 분리** (web / crawler 따로):
  - **마이그레이션이 걸린다.** 지금은 crawler 이미지가 마이그레이션을 돌리고, web 이 새 스키마를 기대해도 순서 보장이 없다.
    - 분리하면 "web 배포가 마이그레이션을 기다림"을 워크플로 사이에서 맞추기 더 어렵다 (`workflow_run` 체인 필요).
  - **권장: 워크플로 파일은 하나로 두고 job 을 서비스별로 나눈다.**
    - `changes → checks → build(matrix) → migrate(마이그레이션 바뀌었을 때만, one-shot) → deploy-web(2색) / deploy-crawler(따로, needs: migrate)`.
    - job 별 `concurrency` 로 web 과 crawler 배포가 서로 막지 않게 한다.
    - 분리의 이점(서비스별 독립 배포·로그)은 job 수준에서 대부분 얻는다.
  - 굳이 파일을 나눈다면 PR #87 의 "마지막 성공 배포" 기준도 **서비스별(마지막으로 성공한 deploy-web job 의 sha)** 이 되어야 한다. 그러지 않으면 한쪽만 성공한 run 이 기준을 잘못 올린다.
  - mergeQueue `deploy.workflows` 도 두 파일을 다 봐야 한다.

---

## B10. 미확인 목록 (구현 전 확인할 것)

- 운영 Caddyfile 의 현재 `reverse_proxy` 설정 (서버를 건드리지 않아 못 봄).
- Caddy `handle_errors` 가 `reverse_proxy` 연결 실패 502 를 잡는지.
- Next 16 standalone 서버의 SIGTERM 시 진행 중 요청 마무리 여부.
- iOS 앱에서 SW 가 실제로 안 도는지 (Safari 원격 디버거로 `navigator.serviceWorker.controller` 확인).
- Android `onReceivedHttpError` 가 Capacitor 8.6.0 빌드에서도 502 에 `errorPath` 를 띄우는지 (소스 `main` 기준 확인, 실기기 미확인).
- 클라이언트 `mergePullResponse` 가 모르는 필드를 보존하는지, 다른 엔티티 `parseFields` 에도 `?? default` 패턴이 있는지 (투자 엔티티만 확인).
- `account-value-history-runner` 가 5xx 때 마지막 기록일을 올리지 않는지.
- 저장소 모드 전환 병합이 중간 실패 뒤 재실행해도 수렴하는지.
- 정적 자산 누적 크기 실측 (빌드당 `.next/static` 크기).
- drizzle `migrate()` 동시 실행 잠금 여부 (공식 문서).
- 카카오 OAuth 리다이렉트 도메인 전체 목록, 번들 전환 시 시스템 브라우저 + 딥링크 흐름.
- Capawesome Cloud 가격, Capgo 백엔드 라이선스.
