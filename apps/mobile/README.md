# @seedbook/mobile — 네이티브 앱 셸 (Capacitor)

iOS·Android 앱은 **운영 서버(`https://seedbook.boogie.ing`)를 WebView 로 띄우는 셸**이다. 화면은
웹의 모바일 트리(`apps/web/app/m`)를 그대로 쓴다. 웹을 배포하면 앱 화면도 바로 바뀌므로, 스토어
재심사는 네이티브 쪽(아이콘·권한·플러그인·설정)이 바뀔 때만 필요하다.

```
capacitor.config.ts          서버 주소, UA 표시(SeedbookApp), 앱 안에서 열 외부 도메인
www-src/                     서버에 못 닿을 때 보여줄 로컬 페이지 (error.html)
scripts/build-www.mjs        www-src → www (서버 주소 치환). `pnpm sync` 가 실행
ios/  android/               네이티브 프로젝트 (커밋 대상)
```

앱 아이콘·스플래시는 웹 아이콘과 같은 원본(`apps/web/brand/mark.svg`)에서 루트 `pnpm brand:icons`
(`scripts/generate-brand-icons.mjs`)로 만든다. 직접 고치지 말고 원본을 바꾼 뒤 다시 실행한다.

웹과 맞물리는 곳: `apps/web/lib/device.ts` 의 `NATIVE_APP_UA_MARKER` 가 `appendUserAgent` 와 같아야
한다. 웹은 이 표시로 iPad 앱에도 모바일 UI 를 주고, PWA 설치 안내를 숨긴다.

## 처음 한 번: 개발 도구

- **iOS**: Xcode 설치 후 시뮬레이터 구성요소와 iOS 플랫폼을 받는다.

  ```bash
  sudo xcodebuild -runFirstLaunch
  xcodebuild -downloadPlatform iOS
  ```

  Swift Package Manager 를 쓰므로 CocoaPods 는 필요 없다.
- **Android**: Android Studio 설치 → SDK Manager 에서 최신 SDK·Build-Tools. JDK 는 Android Studio
  내장(JBR)을 쓴다.

## 실행

```bash
pnpm --filter @seedbook/mobile sync        # www 생성 + 네이티브 프로젝트에 설정 반영
pnpm --filter @seedbook/mobile open:ios    # Xcode 로 열어 시뮬레이터/기기 실행
pnpm --filter @seedbook/mobile open:android
```

로컬 dev 서버로 띄우기 — 기기에서 본 호스트 주소를 쓴다:

```bash
CAP_SERVER_URL=http://localhost:4001 pnpm mobile:sync   # iOS 시뮬레이터
adb reverse tcp:4001 tcp:4001 && \
  CAP_SERVER_URL=http://localhost:4001 pnpm mobile:sync # Android 에뮬레이터·USB 기기
CAP_SERVER_URL=http://<맥 LAN IP>:4001 pnpm mobile:sync # 같은 Wi-Fi 의 실기기
```

`localhost` 가 아닌 http 주소(`10.0.2.2`, LAN IP)는 보안 컨텍스트가 아니라 `crypto.randomUUID` 가
없어 계좌 추가 같은 쓰기가 실패한다. Android 는 `adb reverse` 로 localhost 를 쓰는 게 좋다.

Next dev 서버는 localhost 가 아닌 호스트의 개발용 리소스를 막는다. `10.0.2.2` 는
`next.config.js` 의 `allowedDevOrigins` 에 들어 있고, 실기기는
`NEXT_DEV_ALLOWED_ORIGINS=<맥 LAN IP> pnpm dev` 로 띄운다.

Android 빌드는 **JDK 21** 이 필요하다 (Capacitor 8 / Gradle 8.14 는 JDK 25 에서 돌지 않는다):

```bash
brew install openjdk@21
JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./gradlew assembleDebug  # android/ 에서
```

Android Studio 에서는 Settings → Build Tools → Gradle → Gradle JDK 를 21 로 고른다.

`capacitor.config.json` 은 sync 때 만들어져 커밋되지 않는다 — 운영 주소로 돌아가려면 env 없이 다시
`sync` 한다. 개발 로그인(`/api/auth/dev-login`)은 dev 서버에서만 동작한다.

## 기기 저장소

앱은 WebView localStorage 를 쓰지 않는다 (OS 가 저장 공간이 부족할 때 지울 수 있다). 모든 기기 데이터는
**SQLite** (`@capacitor-community/sqlite`, DB 이름 `seedbook`) 에 둔다. 웹 쪽 진입점은
`apps/web/lib/device-storage.ts`.

- 자산 데이터(local 모드 데이터, cloud 모드 캐시)는 **서버 Postgres 와 같은 테이블·컬럼**
  (`investment_account`, `stock_holding`, `cash_item`, `investment_record`, `portfolio`,
  `portfolio_allocation`, `rebalancing`, `user_preference`) 에 저장한다. 기기에는
  한 사람의 데이터만 있어 `userId`·`version`·`deletedAt` 은 없다. 행 변환은 서버와 같은 함수
  (`packages/domain/src/v1/<domain>-record.ts`) 를 쓴다 — `lib/native/device-db/table-envelopes.ts`.
- 서버에 없는 기기 상태(시세 캐시, 동기화 대기열, 앱 잠금, 화면 설정)는 `device_kv`. 저장소 모드는
  서버처럼 `user_preference.storageMode`.
- 스키마는 `lib/native/device-db/migrations.ts` 의 버전 목록으로 올린다. **서버 스키마가 바뀌면
  새 버전을 추가**한다 — `migrations.test.ts` 가 서버 테이블과 컬럼이 같은지 검사한다.
- 이전 앱 빌드가 localStorage 에 남긴 값은 첫 실행 때 SQLite 로 옮기고 localStorage 를 비운다.
  플러그인이 없는 빌드에서는 localStorage 로 돌아간다.

Android 에뮬레이터에서 확인:

```bash
adb exec-out run-as ing.boogie.seedbook cat databases/seedbookSQLite.db > app.db
sqlite3 app.db "select id, accountName, portfolioId from investment_account;"
```

## 하단 탭바

앱은 네이티브 탭바(iOS `UITabBar`, Android `BottomNavigationView`), 브라우저·PWA·플러그인이 없는 구버전
앱은 웹 탭바(SEED Bottom Navigation)를 쓴다. 항목·선택·표시는 웹이 정하고 네이티브는 그대로 그린다.

- 플러그인 `SeedbookTabBar`: `packages/native-plugins` (`cap sync` 가 등록한다)
- 브리지: `apps/web/lib/native/tab-bar.ts` / 화면: `apps/web/components/mobile/app-tab-bar.tsx`
- 네이티브 탭바는 WebView 위에 있어 웹 시트·다이얼로그가 열리면 내린다. SEED 가 아닌 전체 화면
  (앱 잠금)은 `data-covers-tab-bar` 를 단다.
- 아이콘(`TabIcon`)을 더하면 브리지 타입, 웹 `ICONS`, iOS `symbol`, Android `iconRes` + drawable 을 같이
  고친다. 모르는 아이콘을 받은 구버전 앱은 기본 아이콘을 그린다.

## 상태바·배경 (라이트/다크)

앱은 시스템 테마를 따른다 (앱 안 테마 설정은 없다). 상태바 글자색과 WebView 배경은 네이티브가 정하고 웹은
관여하지 않는다 — 바꾸면 **앱을 다시 배포**해야 한다.

- iOS: `SceneDelegate.swift` 의 `MainViewController`. 배경은 `AppBackground.colorset`.
- Android: `MainActivity.java`. 배경은 `values/`·`values-night/app_background.xml`. 켜진 채 테마가 바뀌면 상태바
  글자색을 다시 맞춘다 (Capacitor SystemBars 8.6.0 이 시작 때 테마로 굳힌다).
- `capacitor.config.ts` 에 고정 `backgroundColor` 를 넣지 않는다.

## Android 시스템 뒤로가기

`@capacitor/app` 의 `backButton` 을 웹이 받는다 (`apps/web/lib/native/system-back.ts`): 열린 시트·다이얼로그
닫기 → 스택 한 화면 뒤로 → 루트(탭 화면·로그인 화면)에서는 앱 내리기. 앱 잠금 중에는 앱만 내린다.
약관·카카오 로그인처럼 다른 문서로 넘어가면 WebView 뒤로가기로 동작한다. 플러그인이 없는 구버전 앱에서는
웹이 아무것도 하지 않는다 (뒤로가기 = 앱 내리기).

## 확인이 필요한 것 (실기기)

- **로그인 복귀 체크리스트** (iOS·Android 각각, 카카오톡 설치/미설치):
  - [ ] 카카오 계정(ID/비밀번호) 로그인 → 앱 안에서 홈이 열리고 앱을 다시 켜도 로그인 상태
  - [ ] "카카오톡으로 로그인" → 카카오톡에서 동의 → **앱으로** 돌아오는지(시스템 브라우저가 아닌지), 세션이 남는지
  - [ ] 카카오톡에서 취소하거나 그냥 앱으로 돌아왔을 때 로그인 버튼을 다시 누를 수 있는지
  - [ ] 카카오 로그인 화면에서 뒤로가기(Android 시스템 뒤로, iOS 는 빠져나올 방법) → 로그인 화면
  - [ ] 상세 URL 에서 로그인이 풀렸을 때 로그인 뒤 같은 화면으로 돌아오는지
  - [ ] 로그인 직후 Android 뒤로가기가 카카오 화면으로 되돌아가지 않고 앱을 내리는지
  - [ ] 로그아웃 → 다른 계정 로그인 때 이전 계정의 탭·상세 화면이 남지 않는지
- **카카오 로그인**: 앱 안 WebView 에서 카카오 계정(ID/비밀번호) 로그인은 같은 도메인 쿠키로 세션이
  남는다. "카카오톡으로 로그인" 은 카카오톡 앱으로 넘어갔다가 **시스템 브라우저로 돌아올 수 있어**
  세션이 앱에 안 남을 수 있다. 문제가 되면 카카오 네이티브 SDK 로 토큰을 받아 서버와 교환하는 연결이
  필요하다.
- **Apple 로그인**: 서버에 APPLE_* env 를 넣으면 로그인 화면에 버튼이 나온다 (`.env.example`).
- 서비스 워커: iOS WKWebView 에서는 App-Bound Domains 없이는 등록되지 않는다. 온라인 전용 앱이라
  기능에는 영향이 없다.

## 스토어 제출 체크리스트

|           | App Store                                                                    | Google Play                                                                       |
| --------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 계정      | Apple Developer Program (연 $99). 사업자(부기클럽) 명의면 D-U-N-S 번호 필요  | Play Console ($25). 신규 개인 계정은 테스터 12명 × 14일 비공개 테스트 후 프로덕션 |
| 앱 ID     | `ing.boogie.seedbook` (App ID 에 Sign in with Apple 체크)                    | 같은 applicationId                                                                |
| 서명      | Xcode 자동 서명 (Team 선택)                                                  | 업로드 키 생성 → Play App Signing                                                 |
| 개인정보  | App Privacy 라벨, 개인정보처리방침 URL `https://seedbook.boogie.ing/privacy` | 데이터 보안 양식, 같은 URL, 계정 삭제 URL/설명                                    |
| 심사 메모 | 송금·거래 기능 없는 자산 기록 도구, 테스트 계정, 앱 전용 기능(4.2) 설명      | 금융 기능 신고서: 해당 없음(기록 도구)                                            |
| 계정 삭제 | 앱 안 프로필 버튼 → 설정 → 탈퇴하기                                          | 동일 + 웹 URL                                                                     |
