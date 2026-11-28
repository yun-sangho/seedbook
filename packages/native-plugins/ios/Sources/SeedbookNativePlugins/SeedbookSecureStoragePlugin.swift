import Capacitor
import Foundation
import Security

/// 로그인 세션 토큰 같은 작은 비밀 값을 Keychain 에 둔다 (apps/mobile/src/lib/native/session-token.ts).
///
/// - 이 기기에서만, 첫 잠금 해제 뒤 읽을 수 있다 (`AfterFirstUnlockThisDeviceOnly`) — 백업·다른 기기로
///   옮겨지지 않는다.
/// - 생체 인증 로그인의 금고와 달리 꺼낼 때 프롬프트가 없다. 요청마다 읽는 값이기 때문이다.
/// - Keychain 은 앱을 지워도 남는다. 다시 설치한 첫 실행에서 지난 설치의 값을 지운다.
@objc(SeedbookSecureStoragePlugin)
public class SeedbookSecureStoragePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SeedbookSecureStoragePlugin"
    public let jsName = "SeedbookSecureStorage"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "get", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "set", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise)
    ]

    private static let service = "ing.boogie.seedbook.secure-storage"
    private static let installedMarker = "seedbook.secure-storage.installed"

    override public func load() {
        let defaults = UserDefaults.standard
        if !defaults.bool(forKey: Self.installedMarker) {
            SecItemDelete([kSecClass: kSecClassGenericPassword, kSecAttrService: Self.service] as CFDictionary)
            defaults.set(true, forKey: Self.installedMarker)
        }
    }

    private func baseQuery(_ key: String) -> [CFString: Any] {
        [kSecClass: kSecClassGenericPassword, kSecAttrService: Self.service, kSecAttrAccount: key]
    }

    @objc func get(_ call: CAPPluginCall) {
        guard let key = call.getString("key") else { return call.reject("key is required") }
        var query = baseQuery(key)
        query[kSecReturnData] = true
        query[kSecMatchLimit] = kSecMatchLimitOne
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        if status == errSecItemNotFound { return call.resolve(["value": NSNull()]) }
        guard status == errSecSuccess, let data = item as? Data, let value = String(data: data, encoding: .utf8) else {
            return call.reject("keychain read failed (\(status))")
        }
        call.resolve(["value": value])
    }

    @objc func set(_ call: CAPPluginCall) {
        guard let key = call.getString("key"), let value = call.getString("value") else {
            return call.reject("key and value are required")
        }
        SecItemDelete(baseQuery(key) as CFDictionary)
        var item = baseQuery(key)
        item[kSecValueData] = Data(value.utf8)
        item[kSecAttrAccessible] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let status = SecItemAdd(item as CFDictionary, nil)
        guard status == errSecSuccess else { return call.reject("keychain write failed (\(status))") }
        call.resolve()
    }

    @objc func remove(_ call: CAPPluginCall) {
        guard let key = call.getString("key") else { return call.reject("key is required") }
        let status = SecItemDelete(baseQuery(key) as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            return call.reject("keychain delete failed (\(status))")
        }
        call.resolve()
    }
}
