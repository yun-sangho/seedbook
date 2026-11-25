package ing.boogie.seedbook;

import android.content.res.Configuration;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import androidx.core.content.ContextCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        applyBackground(getResources().getConfiguration());
    }

    /**
     * Capacitor SystemBars(8.6.0)는 DEFAULT 스타일을 시작할 때의 테마로 굳혀서, 앱이 켜진 채 시스템
     * 테마가 바뀌면 상태바 글자색이 이전 테마로 남는다. SystemBars 가 처리한 뒤(super) 다시 맞춘다.
     */
    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        boolean light = (newConfig.uiMode & Configuration.UI_MODE_NIGHT_MASK) != Configuration.UI_MODE_NIGHT_YES;
        Window window = getWindow();
        WindowInsetsControllerCompat bars = WindowCompat.getInsetsController(window, window.getDecorView());
        bars.setAppearanceLightStatusBars(light);
        bars.setAppearanceLightNavigationBars(light);
        applyBackground(newConfig);
    }

    /** 페이지가 그려지기 전의 WebView 와 시스템 바 뒤 배경 */
    private void applyBackground(Configuration configuration) {
        int color = ContextCompat.getColor(createConfigurationContext(configuration), R.color.app_background);
        View decor = getWindow().getDecorView();
        decor.setBackgroundColor(color);
        // WebView 가 없는 기기에서는 bridge 가 없다.
        if (bridge != null) bridge.getWebView().setBackgroundColor(color);
    }
}
