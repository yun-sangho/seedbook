import AuthenticationServices
import Capacitor
import CryptoKit
import Foundation

/// 네이티브 Sign in with Apple. identity token(JWT)을 웹에 넘기고, 웹이 서버 `signIn.social({ idToken })` 로
/// 보낸다 (apps/mobile/src/lib/native/social-login.ts).
///
/// - 이름·이메일 범위를 요청하지 않는다 — 서버는 `sub` 만 쓴다 (apps/web/lib/auth-privacy.ts).
/// - nonce 는 SHA-256 (hex) 으로 요청에 넣는다. 토큰에는 그 해시가 들고, 서버가 원래 값과 맞춰 본다.
/// - 취소는 `CANCELLED` 코드로 거절한다.
@objc(SeedbookAppleSignInPlugin)
public class SeedbookAppleSignInPlugin: CAPPlugin, CAPBridgedPlugin, ASAuthorizationControllerDelegate,
    ASAuthorizationControllerPresentationContextProviding {
    public let identifier = "SeedbookAppleSignInPlugin"
    public let jsName = "SeedbookAppleSignIn"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "signIn", returnType: CAPPluginReturnPromise)
    ]

    private var pendingCall: CAPPluginCall?
    private var controller: ASAuthorizationController?

    @objc func isAvailable(_ call: CAPPluginCall) {
        call.resolve(["available": true])
    }

    @objc func signIn(_ call: CAPPluginCall) {
        guard let nonce = call.getString("nonce"), !nonce.isEmpty else {
            return call.reject("nonce is required")
        }
        DispatchQueue.main.async {
            if let previous = self.pendingCall {
                previous.reject("another sign-in started", "CANCELLED")
            }
            let request = ASAuthorizationAppleIDProvider().createRequest()
            request.requestedScopes = []
            request.nonce = Self.sha256Hex(nonce)
            let controller = ASAuthorizationController(authorizationRequests: [request])
            controller.delegate = self
            controller.presentationContextProvider = self
            self.pendingCall = call
            self.controller = controller
            controller.performRequests()
        }
    }

    public func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        bridge?.webView?.window ?? ASPresentationAnchor()
    }

    public func authorizationController(controller: ASAuthorizationController,
                                        didCompleteWithAuthorization authorization: ASAuthorization) {
        defer { finish() }
        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
              let tokenData = credential.identityToken,
              let token = String(data: tokenData, encoding: .utf8) else {
            pendingCall?.reject("Apple did not return an identity token")
            return
        }
        pendingCall?.resolve(["idToken": token])
    }

    public func authorizationController(controller: ASAuthorizationController,
                                        didCompleteWithError error: Error) {
        defer { finish() }
        if let authError = error as? ASAuthorizationError, authError.code == .canceled {
            pendingCall?.reject("cancelled", "CANCELLED")
        } else {
            pendingCall?.reject(error.localizedDescription, nil, error)
        }
    }

    private func finish() {
        pendingCall = nil
        controller = nil
    }

    private static func sha256Hex(_ value: String) -> String {
        SHA256.hash(data: Data(value.utf8)).map { String(format: "%02x", $0) }.joined()
    }
}
