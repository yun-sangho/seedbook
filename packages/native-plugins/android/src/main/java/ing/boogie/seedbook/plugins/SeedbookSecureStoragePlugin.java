package ing.boogie.seedbook.plugins;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * 로그인 세션 토큰 같은 작은 비밀 값을 Android Keystore 의 AES 키로 암호화해 SharedPreferences 에 둔다
 * (apps/mobile/src/lib/native/session-token.ts).
 *
 * <p>키는 Keystore 밖으로 나오지 않는다. 백업으로 다른 기기에 옮겨진 값은 키가 없어 풀리지 않으므로 없는
 * 값으로 보고 지운다. 생체 인증 로그인의 금고와 달리 꺼낼 때 프롬프트가 없다 — 요청마다 읽는 값이다.
 */
@CapacitorPlugin(name = "SeedbookSecureStorage")
public class SeedbookSecureStoragePlugin extends Plugin {

    private static final String KEYSTORE = "AndroidKeyStore";
    private static final String KEY_ALIAS = "seedbook_secure_storage";
    private static final String PREFS = "seedbook_secure_storage";
    private static final String TRANSFORMATION = "AES/GCM/NoPadding";
    private static final int IV_LENGTH = 12;
    private static final int TAG_BITS = 128;

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private SecretKey key() throws Exception {
        KeyStore keyStore = KeyStore.getInstance(KEYSTORE);
        keyStore.load(null);
        if (keyStore.containsAlias(KEY_ALIAS)) {
            return ((KeyStore.SecretKeyEntry) keyStore.getEntry(KEY_ALIAS, null)).getSecretKey();
        }
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE);
        generator.init(
            new KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build()
        );
        return generator.generateKey();
    }

    @PluginMethod
    public void get(PluginCall call) {
        String key = call.getString("key");
        if (key == null) {
            call.reject("key is required");
            return;
        }
        String stored = prefs().getString(key, null);
        JSObject result = new JSObject();
        if (stored == null) {
            result.put("value", JSObject.NULL);
            call.resolve(result);
            return;
        }
        try {
            byte[] data = Base64.decode(stored, Base64.NO_WRAP);
            ByteBuffer buffer = ByteBuffer.wrap(data);
            byte[] iv = new byte[IV_LENGTH];
            buffer.get(iv);
            byte[] cipherText = new byte[buffer.remaining()];
            buffer.get(cipherText);
            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(TAG_BITS, iv));
            result.put("value", new String(cipher.doFinal(cipherText), StandardCharsets.UTF_8));
        } catch (Exception e) {
            // 풀 수 없는 값 (백업에서 복원됐거나 키가 사라짐) — 없는 값으로 보고 지운다.
            prefs().edit().remove(key).apply();
            result.put("value", JSObject.NULL);
        }
        call.resolve(result);
    }

    @PluginMethod
    public void set(PluginCall call) {
        String key = call.getString("key");
        String value = call.getString("value");
        if (key == null || value == null) {
            call.reject("key and value are required");
            return;
        }
        try {
            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.ENCRYPT_MODE, key());
            byte[] iv = cipher.getIV();
            byte[] cipherText = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
            byte[] data = ByteBuffer.allocate(iv.length + cipherText.length).put(iv).put(cipherText).array();
            if (!prefs().edit().putString(key, Base64.encodeToString(data, Base64.NO_WRAP)).commit()) {
                call.reject("could not save");
                return;
            }
            call.resolve();
        } catch (Exception e) {
            call.reject("could not encrypt", e);
        }
    }

    @PluginMethod
    public void remove(PluginCall call) {
        String key = call.getString("key");
        if (key == null) {
            call.reject("key is required");
            return;
        }
        prefs().edit().remove(key).commit();
        call.resolve();
    }
}
