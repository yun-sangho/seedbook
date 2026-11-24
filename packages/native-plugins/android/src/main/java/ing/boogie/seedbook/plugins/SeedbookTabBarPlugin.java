package ing.boogie.seedbook.plugins;

import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.LayerDrawable;
import android.view.ContextThemeWrapper;
import android.view.Gravity;
import android.view.Menu;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import androidx.coordinatorlayout.widget.CoordinatorLayout;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.WebViewListener;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.material.bottomnavigation.BottomNavigationView;
import com.google.android.material.navigation.NavigationBarView;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONObject;

/**
 * 하단 탭바(Material BottomNavigationView)를 WebView 위에 올린다. 항목·선택·표시는 웹
 * (apps/web/lib/native/tab-bar.ts)이 정하고, 누른 탭은 tabSelect 로 알린다. 화면 전환은 웹이 한다.
 */
@CapacitorPlugin(name = "SeedbookTabBar")
public class SeedbookTabBarPlugin extends Plugin {

    private static class Tab {

        final String key;
        /** 탭을 바꾸지 않고 동작만 하는 항목 (더보기) */
        final boolean isAction;

        Tab(String key, boolean isAction) {
            this.key = key;
            this.isAction = isAction;
        }
    }

    /** SEED 토큰: bg.layerDefault, fg.neutral, fg.neutralSubtle, bg.neutralWeak, stroke.neutralSubtle */
    private enum Palette {
        LIGHT("#FFFFFF", "#1A1C20", "#868B94", "#F3F4F5", "#0D000000"),
        DARK("#16171B", "#F3F4F5", "#B0B3BA", "#2B2E35", "#0DFFFFFF");

        final int background;
        final int selected;
        final int unselected;
        final int indicator;
        final int divider;

        Palette(String background, String selected, String unselected, String indicator, String divider) {
            this.background = Color.parseColor(background);
            this.selected = Color.parseColor(selected);
            this.unselected = Color.parseColor(unselected);
            this.indicator = Color.parseColor(indicator);
            this.divider = Color.parseColor(divider);
        }
    }

    private BottomNavigationView nav;
    private final List<Tab> tabs = new ArrayList<>();
    private Palette palette;
    /** 코드로 바꾼 선택을 웹 이벤트로 돌려보내지 않는다 */
    private boolean programmatic = false;
    /** 웹이 원하는 표시 상태 */
    private boolean wantVisible = false;
    /** 키보드가 뜨면 탭바가 그 위로 따라 올라오지 않게 숨긴다 */
    private boolean imeVisible = false;

    @Override
    public void load() {
        // 새 페이지(로그아웃 뒤 로그인 화면, 약관 등)를 열면 이전 페이지의 탭바를 내린다.
        // 탭바가 필요한 페이지는 다시 setState 를 부른다.
        getBridge()
            .addWebViewListener(
                new WebViewListener() {
                    @Override
                    public void onPageStarted(WebView webView) {
                        wantVisible = false;
                        applyVisibility();
                    }
                }
            );
    }

    @PluginMethod
    public void configure(PluginCall call) {
        JSArray items = call.getArray("items", new JSArray());
        getActivity()
            .runOnUiThread(() -> {
                ensureNav();
                Menu menu = nav.getMenu();
                // 메뉴를 채우는 동안 첫 항목이 자동 선택된다.
                programmatic = true;
                menu.clear();
                tabs.clear();
                for (int i = 0; i < items.length(); i++) {
                    JSONObject item = items.optJSONObject(i);
                    if (item == null) continue;
                    int id = tabs.size();
                    tabs.add(new Tab(item.optString("key"), item.optBoolean("action")));
                    menu.add(Menu.NONE, id, id, item.optString("label")).setIcon(iconRes(item.optString("icon")));
                }
                programmatic = false;
                call.resolve();
            });
    }

    @PluginMethod
    public void setState(PluginCall call) {
        String selected = call.getString("selected");
        boolean visible = Boolean.TRUE.equals(call.getBoolean("visible", false));
        boolean dark = Boolean.TRUE.equals(call.getBoolean("dark", false));
        getActivity()
            .runOnUiThread(() -> {
                if (nav == null) {
                    call.reject("configure first");
                    return;
                }
                applyPalette(dark ? Palette.DARK : Palette.LIGHT);
                select(selected);
                wantVisible = visible;
                applyVisibility();
                resolveHeight(call);
            });
    }

    private void select(String key) {
        for (int i = 0; i < tabs.size(); i++) {
            if (!tabs.get(i).key.equals(key)) continue;
            if (nav.getSelectedItemId() != i) {
                programmatic = true;
                nav.setSelectedItemId(i);
                programmatic = false;
            }
            return;
        }
    }

    private void applyVisibility() {
        if (nav == null) return;
        nav.setVisibility(wantVisible && !imeVisible ? View.VISIBLE : View.GONE);
    }

    private void applyPalette(Palette next) {
        if (palette == next) return;
        palette = next;
        int dividerPx = Math.max(1, Math.round(getActivity().getResources().getDisplayMetrics().density));
        LayerDrawable background = new LayerDrawable(
            new Drawable[] { new ColorDrawable(next.background), new ColorDrawable(next.divider) }
        );
        background.setLayerGravity(1, Gravity.TOP | Gravity.FILL_HORIZONTAL);
        background.setLayerHeight(1, dividerPx);
        nav.setBackground(background);
        ColorStateList tint = new ColorStateList(
            new int[][] { new int[] { android.R.attr.state_checked }, new int[] {} },
            new int[] { next.selected, next.unselected }
        );
        nav.setItemIconTintList(tint);
        nav.setItemTextColor(tint);
        nav.setItemActiveIndicatorColor(ColorStateList.valueOf(next.indicator));
    }

    private void ensureNav() {
        if (nav != null) return;
        nav = new BottomNavigationView(
            new ContextThemeWrapper(getActivity(), com.google.android.material.R.style.Theme_Material3_Light_NoActionBar)
        );
        nav.setLabelVisibilityMode(NavigationBarView.LABEL_VISIBILITY_LABELED);
        // 경계는 SEED 처럼 윗줄(divider)로만 그린다.
        nav.setElevation(0);
        // 아이템 사이 빈 곳을 눌러도 아래 WebView 로 터치가 새지 않게 한다.
        nav.setClickable(true);
        nav.setVisibility(View.GONE);
        nav.setOnItemSelectedListener(item -> {
            if (programmatic) return true;
            int index = item.getItemId();
            if (index < 0 || index >= tabs.size()) return false;
            Tab tab = tabs.get(index);
            JSObject data = new JSObject();
            data.put("key", tab.key);
            notifyListeners("tabSelect", data);
            return !tab.isAction;
        });
        nav.setOnItemReselectedListener(item -> {});

        ViewGroup parent = (ViewGroup) getBridge().getWebView().getParent();
        CoordinatorLayout.LayoutParams params = new CoordinatorLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        );
        params.gravity = Gravity.BOTTOM;
        parent.addView(nav, params);

        // insets 리스너는 BottomNavigationView 의 바닥 여백 처리·Capacitor SystemBars 와 겹치므로 쓰지 않고,
        // 레이아웃이 바뀔 때 키보드 표시 여부만 본다.
        View root = getActivity().getWindow().getDecorView();
        root
            .getViewTreeObserver()
            .addOnGlobalLayoutListener(() -> {
                WindowInsetsCompat insets = ViewCompat.getRootWindowInsets(root);
                boolean ime = insets != null && insets.isVisible(WindowInsetsCompat.Type.ime());
                if (ime == imeVisible) return;
                imeVisible = ime;
                applyVisibility();
            });
    }

    /** 탭바 높이(바닥 시스템 바 여백 포함)를 CSS px 로 돌려준다. 레이아웃이 끝난 뒤 잰다. */
    private void resolveHeight(PluginCall call) {
        nav.post(() -> {
            float density = getActivity().getResources().getDisplayMetrics().density;
            int px = nav.getVisibility() == View.VISIBLE ? nav.getHeight() : 0;
            JSObject result = new JSObject();
            // 0 이면 웹이 이전 값을 그대로 쓴다.
            result.put("height", Math.round(px / density));
            call.resolve(result);
        });
    }

    /** 웹 아이콘 이름(TabIcon) → drawable */
    private static int iconRes(String icon) {
        switch (icon) {
            case "house":
                return R.drawable.ic_tab_house;
            case "linechart":
                return R.drawable.ic_tab_linechart;
            case "arrows":
                return R.drawable.ic_tab_arrows;
            case "barchart":
                return R.drawable.ic_tab_barchart;
            default:
                return R.drawable.ic_tab_more;
        }
    }
}
