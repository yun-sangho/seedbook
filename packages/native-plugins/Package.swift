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
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0")
    ],
    targets: [
        .target(
            name: "SeedbookNativePlugins",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm")
            ],
            path: "ios/Sources/SeedbookNativePlugins")
    ]
)
