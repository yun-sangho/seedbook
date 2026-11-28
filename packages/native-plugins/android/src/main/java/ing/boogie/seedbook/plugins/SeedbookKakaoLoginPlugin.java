package ing.boogie.seedbook.plugins;

import android.content.Context;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.kakao.sdk.auth.AuthCodeClient;
import com.kakao.sdk.auth.model.OAuthToken;
import com.kakao.sdk.common.KakaoSdk;
import com.kakao.sdk.common.model.ClientError;
import com.kakao.sdk.common.model.ClientErrorCause;
import com.kakao.sdk.user.UserApiClient;
import kotlin.Unit;
import kotlin.jvm.functions.Function2;

/**
 * 카카오 SDK 로그인. 카카오톡이 있으면 카카오톡으로, 없으면 카카오계정 화면으로 로그인하고 OIDC ID 토큰을
 * 웹에 넘긴다. 웹이 서버 signIn.social({ idToken }) 로 보낸다 (apps/mobile/src/lib/native/social-login.ts,
 * 서버 검증은 apps/web/lib/kakao-id-token.ts).
 *
 * <p>네이티브 앱 키는 앱 빌드의 문자열 리소스 kakao_native_app_key (Gradle KAKAO_NATIVE_APP_KEY) 에서 읽는다.
 * 키가 없는 빌드는 isAvailable 이 false 라 웹 OAuth 로 로그인한다. ID 토큰은 카카오 개발자 콘솔에서 OpenID
 * Connect 를 켜야 나온다. 동의 항목은 요청하지 않는다. 취소는 CANCELLED 코드로 거절한다.
 */
@CapacitorPlugin(name = "SeedbookKakaoLogin")
public class SeedbookKakaoLoginPlugin extends Plugin {

    private boolean initialized = false;

    @Override
    public void load() {
        Context context = getContext();
        int id = context.getResources().getIdentifier("kakao_native_app_key", "string", context.getPackageName());
        String key = id == 0 ? "" : context.getString(id);
        // 카카오 네이티브 앱 키는 32자리 16진수다. 키를 넣지 않은 빌드의 자리표시자는 거른다.
        if (!key.matches("^[0-9a-f]{32}$")) return;
        KakaoSdk.init(context, key);
        initialized = true;
    }

    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject result = new JSObject();
        result.put("available", initialized);
        call.resolve(result);
    }

    @PluginMethod
    public void signIn(PluginCall call) {
        if (!initialized) {
            call.reject("Kakao SDK is not configured");
            return;
        }
        String nonce = call.getString("nonce");
        if (nonce == null || nonce.isEmpty()) {
            call.reject("nonce is required");
            return;
        }
        getActivity()
            .runOnUiThread(() -> {
                UserApiClient client = UserApiClient.getInstance();
                Function2<OAuthToken, Throwable, Unit> finish = (token, error) -> {
                    settle(call, token, error);
                    return Unit.INSTANCE;
                };
                if (client.isKakaoTalkLoginAvailable(getContext())) {
                    loginWithKakaoTalk(client, nonce, (token, error) -> {
                        // 카카오톡을 열 수 없으면 카카오계정 화면으로 간다. 사용자가 취소했으면 그대로 끝낸다.
                        if (error != null && !isCancelled(error)) {
                            loginWithKakaoAccount(client, nonce, finish);
                        } else {
                            settle(call, token, error);
                        }
                        return Unit.INSTANCE;
                    });
                } else {
                    loginWithKakaoAccount(client, nonce, finish);
                }
            });
    }

    private void loginWithKakaoTalk(UserApiClient client, String nonce, Function2<OAuthToken, Throwable, Unit> callback) {
        client.loginWithKakaoTalk(getActivity(), AuthCodeClient.DEFAULT_REQUEST_CODE, nonce, callback);
    }

    private void loginWithKakaoAccount(UserApiClient client, String nonce, Function2<OAuthToken, Throwable, Unit> callback) {
        client.loginWithKakaoAccount(getActivity(), null, null, nonce, callback);
    }

    private static boolean isCancelled(Throwable error) {
        return error instanceof ClientError && ((ClientError) error).getReason() == ClientErrorCause.Cancelled;
    }

    private void settle(PluginCall call, OAuthToken token, Throwable error) {
        if (error != null) {
            if (isCancelled(error)) {
                call.reject("cancelled", "CANCELLED");
            } else {
                call.reject(error.getMessage() == null ? "Kakao login failed" : error.getMessage());
            }
            return;
        }
        String idToken = token == null ? null : token.getIdToken();
        if (idToken == null) {
            call.reject("Kakao did not return an ID token (is OpenID Connect enabled?)");
            return;
        }
        JSObject result = new JSObject();
        result.put("idToken", idToken);
        call.resolve(result);
    }
}
