# @seedbook/mobile — 앱 화면 (Vite SPA) + 네이티브 앱 셸 (Capacitor)

이 패키지에는 두 가지가 있다.

1. **앱 화면** — Vite + React SPA (`src/`, `index.html`, `vite.config.ts`). 옛 Next `/m` 트리를 옮긴 것이다.
   - 개발: 루트 `pnpm dev` 가 이 Vite dev 서버(슬롯 web 포트)와 Next(apps/web, API 포트)를 함께 띄운다.
     Vite 가 앱 경로(`/assets/...`)는 SPA 로, 그 밖(`/api`·소개·약관·아이콘)은 Next 로 넘긴다.
   - 운영 모바일 웹: 웹 이미지가 `vite build` 결과(`dist/`)를 `apps/web/public/_app` 으로 복사해 Next 가
     앱 경로에 `index.html` 을 준다 (`apps/web/proxy.ts`).
   - 테스트: `pnpm --filter @seedbook/mobile test`.
2. **네이티브 앱** — iOS·Android 앱은 위 앱 화면의 빌드(`dist/`)를 **바이너리에 담아** 앱 origin
   (iOS `capacitor://localhost`, Android `https://localhost`) 에서 띄우고, API 는 운영 서버
   (`https://seedbook.boogie.ing`, CORS·bearer 토큰) 를 부른다 (`src/lib/native/bundled-app.ts`).
   - 화면을 고치면 **앱을 다시 내야** 앱에 반영된다 (웹 배포는 모바일 웹만 바꾼다). 앱 버전은
     `package.json` `version` = iOS `MARKETING_VERSION` = Android `versionName` (`src/lib/app-version.test.ts`).
   - 서버에 닿지 않아도 화면은 뜨고, 마지막으로 확인한 로그인으로 기기 데이터를 연다 (`src/lib/offline-session.ts`).
     서버가 세션이 없다고 답할 때만 로그인 화면으로 간다.
   - 옛 앱이 더는 동작할 수 없으면 서버 `apps/web/lib/app-config.ts` 의 `minSupportedVersion` 을 올린다 —
     그보다 낮은 앱은 업데이트 화면으로 막힌다 (`src/components/update-gate.tsx`).
   - 카카오·Apple 로그인은 네이티브 SDK 로만 한다 (웹 OAuth 는 서버 주소로 돌아와 번들을 떠난다).
     플러그인이 없는 수단(Android 의 Apple, 카카오 키 없는 빌드)은 로그인 화면에 안 보인다.

```
src/                         앱 화면 (main.tsx 시작점, app/_stack 화면 스택, features·components·lib)
index.html · vite.config.ts  앱 HTML(메타·CSP)·dev 서버(프록시)·빌드 설정
capacitor.config.ts          webDir(dist), UA 표시(SeedbookApp), dev live-reload 주소
ios/  android/               네이티브 프로젝트 (커밋 대상)
```

앱 아이콘·스플래시는 웹 아이콘과 같은 원본(`apps/web/brand/mark.svg`)에서 루트 `pnpm brand:icons`
(`scripts/generate-brand-icons.mjs`)로 만든다. 직접 고치지 말고 원본을 바꾼 뒤 다시 실행한다.

앱 화면과 셸이 맞물리는 곳: `src/lib/device.ts` 의 `NATIVE_APP_UA_MARKER` 가 `appendUserAgent` 와 같아야
한다. 웹 서버는 이 표시로 iPad 앱에도 모바일 UI 를 주고, 앱은 PWA 설치 안내를 숨긴다.

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
pnpm --filter @seedbook/mobile sync        # vite build (dist) + 네이티브 프로젝트에 번들·설정 반영
pnpm --filter @seedbook/mobile open:ios    # Xcode 로 열어 시뮬레이터/기기 실행
pnpm --filter @seedbook/mobile open:android
```

## Seedbook Dev (개발용 앱, 앱 QA 는 이것으로)

출시 앱과 **나란히 설치되는** 개발용 앱이다. 운영이 아니라 이 맥의 dev 서버(같은 Wi-Fi, `http://<맥 LAN IP>:<슬롯 web 포트>`,
슬롯 DB)에 붙어 실제 데이터와 완전히 나뉜다. 앱 QA 는 Seedbook Dev 를 사용자 아이폰에 깔아서 한다 — 시뮬레이터·에뮬레이터는
띄우지 않는다 (리소스 절약).

```bash
pnpm dev                                            # 이 체크아웃의 dev 서버 (먼저)
pnpm --filter @seedbook/mobile dev:ios-device       # 빌드 → 연결된 아이폰에 설치·실행
pnpm --filter @seedbook/mobile dev:android-device   # adb 로 연결된 Android 기기 (dev 빌드 타입)
```

루트 `scripts/dev-app.mjs` 가 슬롯 web 포트(`pnpm wt:info`)와 맥 LAN IP(en0)를 찾아 dev 서버가 응답하는지 보고,
`vite build --mode development` (`SEEDBOOK_API_BASE_URL` = 그 주소, "개발용 빠른 로그인" 이 보인다) → `cap sync`
(`SEEDBOOK_DEV_APP=1`) → fastlane `dev` lane (xcodebuild `-configuration Dev -destination id=<아이폰>` + `devicectl install`)
을 돌린다. 기기·팀 ID 는 자동으로 찾고 `SEEDBOOK_IOS_DEVICE`·`APPLE_TEAM_ID`·`SEEDBOOK_DEV_HOST` 로 바꿀 수 있다.
처음에는 아이폰에 "로컬 네트워크" 권한을 허용한다. 출시 빌드용 번들로 되돌릴 때는 env 없이 `pnpm sync` 한다.

|             | 출시 앱                | Seedbook Dev                                                                                   |
| ----------- | ---------------------- | ---------------------------------------------------------------------------------------------- |
| 번들 ID     | `ing.boogie.seedbook`  | `ing.boogie.seedbook.dev` (Android `applicationIdSuffix ".dev"`)                               |
| 구성        | iOS Debug·Release      | iOS `Dev` 빌드 구성 (`Info-Dev.plist`, `AppIconDev`), Android `dev` 빌드 타입 (`src/dev`)      |
| 이름·아이콘 | Seedbook               | Seedbook Dev, 아이콘에 DEV (`pnpm brand:icons` 가 같이 만든다)                                 |
| API 서버    | 운영                   | 맥 dev 서버 (http) — ATS `NSAllowsLocalNetworking`·Android cleartext·mixed content 는 Dev 에만 |
| 서명        | 배포 (fastlane `beta`) | 개발 서명 (iOS 자동 서명, Android 디버그 키)                                                   |

`src/lib/native/dev-app-config.test.ts` 가 Dev 의 예외가 출시 구성에 새지 않고 `Info-Dev.plist` 가 `Info.plist` 와
이름·Dev 블록 말고는 같은지 확인한다 — `Info.plist` 를 고치면 `Info-Dev.plist` 도 같이 고친다.

dev 서버의 Vite 는 CORS 를 Next 에 맡긴다 (`vite.config.ts` `server.cors: false`) — Vite 기본 CORS 는 앱 origin
(`capacitor://localhost`) 의 preflight 를 막는다.

로그인:

- **개발용 빠른 로그인**: 바로 된다 (`/api/auth/dev-login` 의 `set-auth-token`).
- **카카오**: 로컬 `.env.local` 에 `KAKAO_NATIVE_APP_KEY` (스크립트가 빌드에도 넣는다) + 카카오 콘솔 플랫폼에 iOS 번들
  `ing.boogie.seedbook.dev`, Android 패키지 `ing.boogie.seedbook.dev` 와 디버그 키 해시
  (`keytool -exportcert -alias androiddebugkey -keystore ~/.android/debug.keystore -storepass android | openssl sha1 -binary | openssl base64`).
  출시 앱과 같은 카카오 URL 스킴(`kakao<키>`)을 쓰므로 둘 다 깔린 iOS 에서 "카카오톡으로 로그인" 은 다른 앱으로 돌아올 수
  있다 — 카카오 계정(ID/비밀번호) 로그인으로 확인한다.
- **Apple**: 로컬 `.env.local` 에 `APPLE_*` 네 값. 개발 서버는 Dev 번들 ID 토큰도 받는다 (`apps/web/lib/apple-auth.ts`).
  App ID 는 처음 빌드 때 Xcode 자동 서명이 만든다 (Sign in with Apple entitlement 포함).

화면만 빨리 고칠 때는 아래 live-reload 도 쓸 수 있다.

화면을 다시 빌드하지 않고 고치려면 live-reload 로 로컬 앱 dev 서버를 띄운다 — 기기에서 본 호스트 주소를 쓴다 (4001 은 메인 체크아웃의 앱 dev 서버(Vite). 워크트리는
`pnpm wt:info` 의 web 포트):

```bash
CAP_SERVER_URL=http://localhost:4001 pnpm mobile:sync   # iOS 시뮬레이터
adb reverse tcp:4001 tcp:4001 && \
  CAP_SERVER_URL=http://localhost:4001 pnpm mobile:sync # Android 에뮬레이터·USB 기기
CAP_SERVER_URL=http://<맥 LAN IP>:4001 pnpm mobile:sync # 같은 Wi-Fi 의 실기기
```

`localhost` 가 아닌 http 주소(`10.0.2.2`, LAN IP)는 보안 컨텍스트가 아니라 `crypto.randomUUID` 가
없어 계좌 추가 같은 쓰기가 실패한다. Android 는 `adb reverse` 로 localhost 를 쓰는 게 좋다.

앱 dev 서버(Vite)는 모든 네트워크 주소에서 듣는다 (`vite.config.ts` `server.host`). Vite 가 넘기는 Next 페이지
(소개·약관)의 개발용 리소스는 Next 가 localhost 가 아닌 호스트에서 막는다 — `10.0.2.2` 는
`next.config.js` 의 `allowedDevOrigins` 에 들어 있고, 실기기는 `NEXT_DEV_ALLOWED_ORIGINS=<맥 LAN IP> pnpm dev` 로 띄운다.

Android 빌드는 **JDK 21** 이 필요하다 (Capacitor 8 / Gradle 8.14 는 JDK 25 에서 돌지 않는다):

```bash
brew install openjdk@21
JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./gradlew assembleDebug  # android/ 에서
```

Android Studio 에서는 Settings → Build Tools → Gradle → Gradle JDK 를 21 로 고른다.

`capacitor.config.json` 은 sync 때 만들어져 커밋되지 않는다 — 번들로 돌아가려면 env 없이 다시
`sync` 한다. 개발 로그인(`/api/auth/dev-login`)은 dev 서버에서만 동작한다.

## 기기 저장소

앱은 WebView localStorage 를 쓰지 않는다 (OS 가 저장 공간이 부족할 때 지울 수 있다). 모든 기기 데이터는
**SQLite** (`@capacitor-community/sqlite`, DB 이름 `seedbook`) 에 둔다. 웹 쪽 진입점은
`apps/mobile/src/lib/device-storage.ts`.

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
- 브리지: `apps/mobile/src/lib/native/tab-bar.ts` / 화면: `apps/mobile/src/components/mobile/app-tab-bar.tsx`
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

`@capacitor/app` 의 `backButton` 을 웹이 받는다 (`apps/mobile/src/lib/native/system-back.ts`): 열린 시트·다이얼로그
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
- **Apple 로그인**: 서버에 APPLE_* env 를 넣으면 로그인 화면에 버튼이 나온다 (`.env.example`).
- 서비스 워커: 번들 앱은 등록하지 않는다 (화면을 이미 기기에 갖고 있다). 모바일 웹만 쓴다.

## 릴리스 (TestFlight · Play)

`.github/workflows/mobile-release.yml` 이 fastlane(`fastlane/Fastfile`, `Gemfile`)으로 빌드·서명·업로드한다. main push 때는
돌지 않는다 (앱 화면 빌드·테스트는 `ci.yml`). macOS 러너는 비싸서 아래 두 경우에만 돈다.

- **수동**: Actions → Mobile release → Run workflow (`platform`: ios / android / both, `upload` 를 끄면 iOS 는 서명 없이
  빌드만). `gh workflow run mobile-release.yml -f platform=ios`
- **태그**: `apps/mobile/package.json` 의 `version` 을 올려 머지한 뒤 그 커밋에 `mobile-v<version>` 태그를 push 한다
  (`git tag mobile-v1.0.0 && git push origin mobile-v1.0.0`). 태그와 버전이 다르면 실패한다. 태그는 iOS·Android 둘 다.

순서: `ci.yml` 전체 통과 → `vite build`(번들에 커밋 sha, `SEEDBOOK_APP_BUILD`) → `cap sync <플랫폼>` → fastlane.

**버전**: marketing version = `package.json` `version` 하나. 빌드 번호 = 워크플로 run number (iOS `CFBundleVersion`,
Android `versionCode`). 프로젝트 파일의 `1.0`/`1` 은 로컬 개발용 기본값이라 고치지 않는다. 워크플로 파일 이름을 바꾸면
run number 가 1 부터 다시 시작하니 바꾸지 않는다.

**iOS 서명** — match 를 쓰지 않는다 (인증서용 git 레포·스토리지가 없다):

- 배포 인증서: Apple Distribution 인증서 하나를 `.p12` 로 Secret 에 둔다. 매 실행 같은 인증서를 임시 키체인에 넣어
  인증서가 늘지 않는다. 만료(1년)되면 새로 만들어 Secret 만 바꾼다.
- 프로필: App Store Connect API 키로 매 실행 받는다 (`get_provisioning_profile`, 유효한 것이 있으면 재사용, 레포에 두지 않음).
- 쓰지 않은 방식: 자동 서명 archive 는 새 러너마다 Apple Development 인증서를 새로 만들어 한도에 걸린다. ad-hoc archive +
  클라우드 관리 인증서 export 는 Xcode 27 SDK 가 SPM 타깃의 ad-hoc 서명을 거부하고, 서명 없는 archive 는 entitlements
  (Sign in with Apple)가 빠진다.

| 이름                                                                                  | 종류            | 용도                                                                         |
| ------------------------------------------------------------------------------------- | --------------- | ---------------------------------------------------------------------------- |
| `APP_STORE_CONNECT_API_KEY_BASE64` · `_KEY_ID` · `_ISSUER_ID`                         | Secret          | 프로필 발급, TestFlight 업로드. 키 역할은 App Manager 이상 (프로필을 만든다) |
| `IOS_DIST_CERT_P12_BASE64` · `IOS_DIST_CERT_PASSWORD`                                 | Secret          | Apple Distribution 인증서 (`.p12` base64, 내보낼 때 정한 암호)               |
| `APPLE_TEAM_ID`, `KAKAO_NATIVE_APP_KEY`                                               | Variable        | 팀, 카카오 SDK 로그인 (없으면 웹 OAuth 빌드)                                 |
| `ANDROID_UPLOAD_KEYSTORE_BASE64` · `_STORE_PASSWORD` · `_KEY_ALIAS` · `_KEY_PASSWORD` | Secret          | Android 업로드 키. 없으면 서명하지 않은 `.aab`                               |
| `PLAY_SERVICE_ACCOUNT_JSON` + Variable `ANDROID_PLAY_UPLOAD=true`                     | Secret·Variable | Play 내부 테스트 업로드 (Play 계정이 생기면)                                 |

배포 인증서 만들기 (한 번, 맥에서): Xcode → Settings → Accounts → 팀 → Manage Certificates → `+` → Apple Distribution.
키체인 접근 → 내 인증서 → "Apple Distribution: …" (개인 키 포함) 을 `.p12` 로 내보내고(암호 지정) 등록한다.

```bash
base64 -i dist.p12 | gh secret set IOS_DIST_CERT_P12_BASE64
gh secret set IOS_DIST_CERT_PASSWORD      # 프롬프트에 암호 입력
rm dist.p12
```

App Store Connect 에는 앱(`ing.boogie.seedbook`)이 만들어져 있어야 하고, 내부 테스트 그룹은 "자동 배포" 를 켜 둔다 (워크플로는
빌드 처리를 기다리지 않는다). 암호화는 HTTPS 만 써서 `ITSAppUsesNonExemptEncryption = NO` (Info.plist) 로 수출 규정 질문을
건너뛴다.

**Android 업로드 키** 만들기 (한 번, 잃어버리면 Play 에 재설정 요청이 필요하니 비밀번호 관리자에 같이 보관):

```bash
keytool -genkeypair -v -keystore upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000
base64 -i upload.jks | gh secret set ANDROID_UPLOAD_KEYSTORE_BASE64
gh secret set ANDROID_UPLOAD_STORE_PASSWORD; gh secret set ANDROID_UPLOAD_KEY_ALIAS; gh secret set ANDROID_UPLOAD_KEY_PASSWORD
```

카카오 SDK 로그인을 쓰려면 업로드 키(와 Play App Signing 키)의 키 해시를 카카오 개발자 콘솔에 등록한다
(`keytool -exportcert -alias upload -keystore upload.jks | openssl sha1 -binary | openssl base64`).

**로컬에서** (Ruby 3.4+, `brew install ruby`): `apps/mobile` 에서 `bundle install` 뒤 `pnpm build && pnpm sync:ios` →
`bundle exec fastlane ios build` (서명 없이 Release archive, Apple 계정 불필요). Android 는 `pnpm sync:android` →
`JAVA_HOME=<JDK 21> ANDROID_HOME=~/Library/Android/sdk bundle exec fastlane android build`. 결과는 `build/` (gitignore).

## 스토어 제출 체크리스트

|           | App Store                                                                    | Google Play                                                                       |
| --------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 계정      | Apple Developer Program (연 $99). 사업자(부기클럽) 명의면 D-U-N-S 번호 필요  | Play Console ($25). 신규 개인 계정은 테스터 12명 × 14일 비공개 테스트 후 프로덕션 |
| 앱 ID     | `ing.boogie.seedbook` (App ID 에 Sign in with Apple 체크)                    | 같은 applicationId                                                                |
| 서명      | 위 "릴리스" — 배포 인증서 Secret + API 키 프로필                             | 업로드 키 생성 → Play App Signing                                                 |
| 개인정보  | App Privacy 라벨, 개인정보처리방침 URL `https://seedbook.boogie.ing/privacy` | 데이터 보안 양식, 같은 URL, 계정 삭제 URL/설명                                    |
| 심사 메모 | 송금·거래 기능 없는 자산 기록 도구, 테스트 계정, 앱 전용 기능(4.2) 설명      | 금융 기능 신고서: 해당 없음(기록 도구)                                            |
| 계정 삭제 | 앱 안 프로필 버튼 → 설정 → 탈퇴하기                                          | 동일 + 웹 URL                                                                     |
