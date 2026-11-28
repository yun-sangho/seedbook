import Capacitor
import Foundation
import KakaoSDKAuth
import KakaoSDKCommon
import KakaoSDKUser

/// 카카오 SDK 로그인. 카카오톡이 있으면 카카오톡으로, 없으면 카카오계정 화면으로 로그인하고 OIDC ID 토큰을
/// 웹에 넘긴다. 웹이 서버 `signIn.social({ idToken })` 로 보낸다 (apps/mobile/src/lib/native/social-login.ts,
/// 서버 검증은 apps/web/lib/kakao-id-token.ts).
///
/// - 네이티브 앱 키는 Info.plist `KakaoNativeAppKey` (빌드 설정 `KAKAO_NATIVE_APP_KEY`) 에서 읽는다.
///   키가 없는 빌드는 `isAvailable` 이 false 라 웹 OAuth 로 로그인한다.
/// - ID 토큰은 카카오 개발자 콘솔에서 OpenID Connect 를 켜야 나온다. 동의 항목은 요청하지 않는다.
/// - 카카오톡에서 돌아오는 주소(`kakao<앱 키>://oauth`)는 Capacitor 가 알리는 openURL 로 받는다.
/// - 취소는 `CANCELLED` 코드로 거절한다.
@objc(SeedbookKakaoLoginPlugin)
public class SeedbookKakaoLoginPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SeedbookKakaoLoginPlugin"
    public let jsName = "SeedbookKakaoLogin"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "signIn", returnType: CAPPluginReturnPromise)
    ]

    private var initialized = false

    override public func load() {
        let key = Bundle.main.object(forInfoDictionaryKey: "KakaoNativeAppKey") as? String ?? ""
        guard Self.isAppKey(key) else { return }
        KakaoSDK.initSDK(appKey: key)
        initialized = true
        NotificationCenter.default.addObserver(
            self, selector: #selector(handleOpenURL(_:)), name: .capacitorOpenURL, object: nil)
    }

    /// 카카오 네이티브 앱 키는 32자리 16진수다. 키를 넣지 않은 빌드의 자리표시자는 거른다.
    private static func isAppKey(_ value: String) -> Bool {
        value.range(of: "^[0-9a-f]{32}$", options: .regularExpression) != nil
    }

    @objc private func handleOpenURL(_ notification: Notification) {
        guard let object = notification.object as? [String: Any], let url = object["url"] as? URL else { return }
        DispatchQueue.main.async {
            if AuthApi.isKakaoTalkLoginUrl(url) {
                _ = AuthController.handleOpenUrl(url: url)
            }
        }
    }

    @objc func isAvailable(_ call: CAPPluginCall) {
        call.resolve(["available": initialized])
    }

    @objc func signIn(_ call: CAPPluginCall) {
        guard initialized else { return call.reject("Kakao SDK is not configured") }
        guard let nonce = call.getString("nonce"), !nonce.isEmpty else {
            return call.reject("nonce is required")
        }
        DispatchQueue.main.async {
            let completion: (OAuthToken?, Error?) -> Void = { token, error in
                if let error = error {
                    if Self.isCancelled(error) {
                        call.reject("cancelled", "CANCELLED")
                    } else {
                        call.reject(error.localizedDescription, nil, error)
                    }
                    return
                }
                guard let idToken = token?.idToken else {
                    call.reject("Kakao did not return an ID token (is OpenID Connect enabled?)")
                    return
                }
                call.resolve(["idToken": idToken])
            }
            // 카카오톡을 먼저 연다. 카카오톡이 없거나 열 수 없으면(NotSupported) 카카오계정 화면으로 간다.
            UserApi.shared.loginWithKakaoTalk(nonce: nonce) { token, error in
                if let sdkError = error as? SdkError, case .ClientFailed(let reason, _) = sdkError,
                   reason == .NotSupported {
                    UserApi.shared.loginWithKakaoAccount(nonce: nonce, completion: completion)
                    return
                }
                completion(token, error)
            }
        }
    }

    private static func isCancelled(_ error: Error) -> Bool {
        guard let sdkError = error as? SdkError else { return false }
        if case .ClientFailed(let reason, _) = sdkError, reason == .Cancelled { return true }
        if case .AuthFailed(let reason, _) = sdkError, reason == .AccessDenied { return true }
        return false
    }
}
