import Capacitor
import UIKit

/// 하단 탭바(UITabBar)를 WebView 위에 올린다. 항목·선택·표시는 웹(apps/web/lib/native/tab-bar.ts)이
/// 정하고, 누른 탭은 tabSelect 로 알린다. 화면 전환은 웹이 한다.
@objc(SeedbookTabBarPlugin)
public class SeedbookTabBarPlugin: CAPPlugin, CAPBridgedPlugin, UITabBarDelegate {
    public let identifier = "SeedbookTabBarPlugin"
    public let jsName = "SeedbookTabBar"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "configure", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setState", returnType: CAPPluginReturnPromise)
    ]

    private struct Tab {
        let key: String
        /// 탭을 바꾸지 않고 동작만 하는 항목 (더보기)
        let isAction: Bool
    }

    /// SEED fg.neutral (gray-1000) / fg.neutralSubtle (gray-700), 라이트·다크
    private static let selectedColor = color(light: 0x1A1C20, dark: 0xF3F4F5)
    private static let unselectedColor = color(light: 0x868B94, dark: 0xB0B3BA)
    private static let fadeDuration = 0.2

    private var tabBar: UITabBar?
    private var tabs: [Tab] = []
    private var selectedIndex: Int?
    /// 웹이 마지막으로 원한 표시 상태. 숨김 애니메이션이 끝날 때 다시 본다.
    private var wantVisible = false
    private var loadingObservation: NSKeyValueObservation?

    override public func load() {
        // 새 페이지(로그아웃 뒤 로그인 화면, 약관 등)를 열면 이전 페이지의 탭바를 내린다.
        // 탭바가 필요한 페이지는 다시 setState 를 부른다.
        loadingObservation = webView?.observe(\.isLoading, options: [.new]) { [weak self] _, change in
            guard change.newValue == true else { return }
            DispatchQueue.main.async { self?.setVisible(false) }
        }
    }

    @objc func configure(_ call: CAPPluginCall) {
        let items = (call.getArray("items") as? [[String: Any]]) ?? []
        DispatchQueue.main.async {
            let bar = self.ensureTabBar()
            self.tabs = items.map {
                Tab(key: $0["key"] as? String ?? "", isAction: $0["action"] as? Bool ?? false)
            }
            self.selectedIndex = nil
            bar.items = items.enumerated().map { index, item in
                let symbol = Self.symbol(item["icon"] as? String ?? "")
                return UITabBarItem(
                    title: item["label"] as? String,
                    image: UIImage(systemName: symbol),
                    tag: index
                )
            }
            call.resolve()
        }
    }

    @objc func setState(_ call: CAPPluginCall) {
        let selected = call.getString("selected")
        let visible = call.getBool("visible") ?? false
        let dark = call.getBool("dark") ?? false
        DispatchQueue.main.async {
            guard let bar = self.tabBar else {
                call.reject("configure first")
                return
            }
            bar.overrideUserInterfaceStyle = dark ? .dark : .light
            if let index = self.tabs.firstIndex(where: { $0.key == selected }) {
                self.selectedIndex = index
                self.applySelection()
            }
            self.setVisible(visible)
            call.resolve(["height": self.height()])
        }
    }

    public func tabBar(_ tabBar: UITabBar, didSelect item: UITabBarItem) {
        guard tabs.indices.contains(item.tag) else { return }
        let tab = tabs[item.tag]
        if tab.isAction {
            applySelection()
        } else {
            selectedIndex = item.tag
        }
        notifyListeners("tabSelect", data: ["key": tab.key])
    }

    private func applySelection() {
        guard let bar = tabBar, let items = bar.items, let index = selectedIndex,
              items.indices.contains(index), bar.selectedItem !== items[index] else { return }
        bar.selectedItem = items[index]
    }

    private func setVisible(_ visible: Bool) {
        wantVisible = visible
        guard let bar = tabBar else { return }
        if visible {
            if bar.isHidden {
                bar.alpha = 0
                bar.isHidden = false
            }
            UIView.animate(withDuration: Self.fadeDuration) { bar.alpha = 1 }
        } else if !bar.isHidden {
            UIView.animate(
                withDuration: Self.fadeDuration,
                animations: { bar.alpha = 0 },
                completion: { _ in
                    if !self.wantVisible { bar.isHidden = true }
                }
            )
        }
    }

    private func ensureTabBar() -> UITabBar {
        if let tabBar { return tabBar }
        let bar = UITabBar()
        bar.delegate = self
        bar.tintColor = Self.selectedColor
        bar.unselectedItemTintColor = Self.unselectedColor
        bar.isHidden = true
        bar.translatesAutoresizingMaskIntoConstraints = false
        // CAPBridgeViewController 의 view 가 곧 WebView 다.
        if let view = bridge?.viewController?.view {
            view.addSubview(bar)
            NSLayoutConstraint.activate([
                bar.leadingAnchor.constraint(equalTo: view.leadingAnchor),
                bar.trailingAnchor.constraint(equalTo: view.trailingAnchor),
                bar.bottomAnchor.constraint(equalTo: view.bottomAnchor)
            ])
        }
        tabBar = bar
        return bar
    }

    /// 탭바 윗변부터 화면 바닥까지 (바닥 safe area 포함). pt 는 웹 CSS px 와 같다.
    private func height() -> CGFloat {
        guard let bar = tabBar, let view = bar.superview else { return 0 }
        view.layoutIfNeeded()
        return bar.frame.height
    }

    /// 웹 아이콘 이름(TabIcon) → SF Symbol
    private static func symbol(_ icon: String) -> String {
        switch icon {
        case "house": return "house.fill"
        case "linechart": return "chart.line.uptrend.xyaxis"
        case "arrows": return "arrow.up.arrow.down"
        case "barchart": return "chart.bar.xaxis"
        case "more": return "ellipsis"
        default: return "circle.fill"
        }
    }

    private static func color(light: Int, dark: Int) -> UIColor {
        UIColor { traits in
            let rgb = traits.userInterfaceStyle == .dark ? dark : light
            return UIColor(
                red: CGFloat((rgb >> 16) & 0xFF) / 255,
                green: CGFloat((rgb >> 8) & 0xFF) / 255,
                blue: CGFloat(rgb & 0xFF) / 255,
                alpha: 1
            )
        }
    }
}
