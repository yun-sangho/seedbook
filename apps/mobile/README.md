# @seedbook/mobile — 네이티브 앱 셸 (Capacitor)

iOS·Android 앱은 **운영 서버(`https://seedbook.boogie.ing`)를 WebView 로 띄우는 셸**이다. 화면은
웹의 모바일 트리(`apps/web/app/m`)를 그대로 쓴다. 웹을 배포하면 앱 화면도 바로 바뀌므로, 스토어
재심사는 네이티브 쪽(아이콘·권한·플러그인·설정)이 바뀔 때만 필요하다.

```
capacitor.config.ts          서버 주소, UA 표시(SeedbookApp), 앱 안에서 열 외부 도메인
www-src/                     서버에 못 닿을 때 보여줄 로컬 페이지 (error.html)
scripts/build-www.mjs        www-src → www (서버 주소 치환). `pnpm sync` 가 실행
scripts/generate-native-images.mjs  웹 로고로 아이콘·스플래시 생성
ios/  android/               네이티브 프로젝트 (커밋 대상)
```

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

로컬 서버로 띄우기 (같은 Wi-Fi 의 실제 기기나 시뮬레이터에서 호스트 `pnpm dev` 에 접속):

```bash
CAP_SERVER_URL=http://<맥 LAN IP>:3001 pnpm --filter @seedbook/mobile sync
```

`capacitor.config.json` 은 sync 때 만들어져 커밋되지 않는다 — 운영 주소로 돌아가려면 env 없이 다시
`sync` 한다. 개발 로그인(`/api/auth/dev-login`)은 dev 서버에서만 동작한다.

## 확인이 필요한 것 (실기기)

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
| 계정 삭제 | 앱 안 더보기 → 회원 탈퇴                                                     | 동일 + 웹 URL                                                                     |
