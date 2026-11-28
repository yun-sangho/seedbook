// swift-tools-version: 5.9
import PackageDescription

// 로컬 Capacitor 플러그인. `cap sync` 가 앱의 CapApp-SPM 에 이 패키지를 넣고, 플러그인 클래스는
// @objc(<이름>) 으로 찾는다 (packageClassList).
let package = Package(
    name: "SeedbookNativePlugins",
    platforms: [.iOS(.v15)],
    products: [
        .library(name: "SeedbookNativePlugins", targets: ["SeedbookNativePlugins"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0"),
        // 카카오 로그인 (SeedbookKakaoLoginPlugin)
        .package(url: "https://github.com/kakao/kakao-ios-sdk", exact: "2.30.0")
    ],
    targets: [
        .target(
            name: "SeedbookNativePlugins",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm"),
                .product(name: "KakaoSDKCommon", package: "kakao-ios-sdk"),
                .product(name: "KakaoSDKAuth", package: "kakao-ios-sdk"),
                .product(name: "KakaoSDKUser", package: "kakao-ios-sdk")
            ],
            path: "ios/Sources/SeedbookNativePlugins")
    ]
)
