package com.robcolson.apstats.securekey;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.FragmentActivity;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * SecureKeyStore — biometric-gated, hardware-wrapped storage for the teacher's
 * Ed25519 signing-key JWK (ANDROID Phase 4 §3B). This plugin ONLY stores and returns
 * the JWK string; the Ed25519 signing itself stays in JS (receipt-sign.js / WebCrypto).
 *
 * The JWK is AES-256-GCM encrypted under a hardware-backed AndroidKeyStore key that
 * REQUIRES user authentication for every use, bound to the operation via a
 * BiometricPrompt.CryptoObject — so the plaintext key is only ever recoverable after a
 * fresh biometric/PIN unlock. (Android Keystore can't hardware-SIGN Ed25519, only
 * P-256; this "hardware-wrapped at rest" path keeps the whole Ed25519 stack unchanged.)
 *
 * Methods: setKey/getKey (both biometric-gated), hasKey, removeKey, isBiometricAvailable.
 */
@CapacitorPlugin(name = "SecureKeyStore")
public class SecureKeyStorePlugin extends Plugin {

    private static final String KEYSTORE = "AndroidKeyStore";
    private static final String MASTER_ALIAS = "apstats_securekey_master_v1";
    private static final String PREFS = "apstats_secure_keys";
    private static final String TRANSFORM = "AES/GCM/NoPadding";
    private static final int GCM_TAG_BITS = 128;

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private int authenticators() {
        // CryptoObject + DEVICE_CREDENTIAL together require API 30+. Below 30 use
        // BIOMETRIC_STRONG only (a device with no biometric enrollment can't unlock
        // a crypto-bound key on those versions — acceptable for a modern teacher phone).
        if (Build.VERSION.SDK_INT >= 30) {
            return BiometricManager.Authenticators.BIOMETRIC_STRONG | BiometricManager.Authenticators.DEVICE_CREDENTIAL;
        }
        return BiometricManager.Authenticators.BIOMETRIC_STRONG;
    }

    // Get or create the hardware-backed, auth-required AES master key.
    private SecretKey masterKey() throws Exception {
        KeyStore ks = KeyStore.getInstance(KEYSTORE);
        ks.load(null);
        if (ks.containsAlias(MASTER_ALIAS)) {
            return (SecretKey) ks.getKey(MASTER_ALIAS, null);
        }
        KeyGenerator kg = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE);
        KeyGenParameterSpec.Builder b = new KeyGenParameterSpec.Builder(
            MASTER_ALIAS,
            KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .setUserAuthenticationRequired(true);
        if (Build.VERSION.SDK_INT >= 30) {
            b.setUserAuthenticationParameters(0,
                KeyProperties.AUTH_BIOMETRIC_STRONG | KeyProperties.AUTH_DEVICE_CREDENTIAL);
        } else {
            // -1 = require authentication for EVERY use (must be via a CryptoObject).
            b.setUserAuthenticationValidityDurationSeconds(-1);
        }
        kg.init(b.build());
        kg.generateKey();
        return (SecretKey) ks.getKey(MASTER_ALIAS, null);
    }

    // ── setKey ───────────────────────────────────────────────────────────────
    @PluginMethod
    public void setKey(final PluginCall call) {
        final String name = call.getString("key");
        final String value = call.getString("value");
        if (name == null || value == null) { call.reject("key and value are required"); return; }
        try {
            Cipher cipher = Cipher.getInstance(TRANSFORM);
            cipher.init(Cipher.ENCRYPT_MODE, masterKey());
            authThenRun(cipher, "Save signing key", new CipherOp() {
                public void run(Cipher c) throws Exception {
                    byte[] ct = c.doFinal(value.getBytes(StandardCharsets.UTF_8));
                    byte[] iv = c.getIV();
                    prefs().edit()
                        .putString(name + ".ct", Base64.encodeToString(ct, Base64.NO_WRAP))
                        .putString(name + ".iv", Base64.encodeToString(iv, Base64.NO_WRAP))
                        .apply();
                    call.resolve();
                }
            }, call);
        } catch (Exception e) {
            call.reject("setKey failed: " + e.getMessage());
        }
    }

    // ── getKey ───────────────────────────────────────────────────────────────
    @PluginMethod
    public void getKey(final PluginCall call) {
        final String name = call.getString("key");
        if (name == null) { call.reject("key is required"); return; }
        String ctB64 = prefs().getString(name + ".ct", null);
        String ivB64 = prefs().getString(name + ".iv", null);
        if (ctB64 == null || ivB64 == null) { call.resolve(); return; } // no value → resolve undefined
        try {
            final byte[] ct = Base64.decode(ctB64, Base64.NO_WRAP);
            byte[] iv = Base64.decode(ivB64, Base64.NO_WRAP);
            Cipher cipher = Cipher.getInstance(TRANSFORM);
            cipher.init(Cipher.DECRYPT_MODE, masterKey(), new GCMParameterSpec(GCM_TAG_BITS, iv));
            authThenRun(cipher, "Unlock signing key", new CipherOp() {
                public void run(Cipher c) throws Exception {
                    byte[] pt = c.doFinal(ct);
                    JSObject ret = new JSObject();
                    ret.put("value", new String(pt, StandardCharsets.UTF_8));
                    call.resolve(ret);
                }
            }, call);
        } catch (Exception e) {
            call.reject("getKey failed: " + e.getMessage());
        }
    }

    // ── hasKey ───────────────────────────────────────────────────────────────
    @PluginMethod
    public void hasKey(PluginCall call) {
        String name = call.getString("key");
        JSObject ret = new JSObject();
        ret.put("exists", name != null && prefs().contains(name + ".ct"));
        call.resolve(ret);
    }

    // ── removeKey ────────────────────────────────────────────────────────────
    @PluginMethod
    public void removeKey(PluginCall call) {
        String name = call.getString("key");
        if (name != null) {
            prefs().edit().remove(name + ".ct").remove(name + ".iv").apply();
        }
        call.resolve();
    }

    // ── isBiometricAvailable ─────────────────────────────────────────────────
    @PluginMethod
    public void isBiometricAvailable(PluginCall call) {
        int code = BiometricManager.from(getContext()).canAuthenticate(authenticators());
        JSObject ret = new JSObject();
        ret.put("available", code == BiometricManager.BIOMETRIC_SUCCESS);
        ret.put("code", code);
        call.resolve(ret);
    }

    // ── Biometric-gated cipher run ─────────────────────────────────────────────
    private interface CipherOp { void run(Cipher cipher) throws Exception; }

    private void authThenRun(final Cipher cipher, final String title, final CipherOp op, final PluginCall call) {
        final FragmentActivity activity = (getActivity() instanceof FragmentActivity) ? (FragmentActivity) getActivity() : null;
        if (activity == null) { call.reject("no FragmentActivity for BiometricPrompt"); return; }

        final BiometricPrompt.PromptInfo info = new BiometricPrompt.PromptInfo.Builder()
            .setTitle(title)
            .setSubtitle("AP Statistics — teacher signing key")
            .setAllowedAuthenticators(authenticators())
            .build();

        activity.runOnUiThread(new Runnable() {
            public void run() {
                try {
                    BiometricPrompt prompt = new BiometricPrompt(activity,
                        ContextCompat.getMainExecutor(getContext()),
                        new BiometricPrompt.AuthenticationCallback() {
                            @Override
                            public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
                                try {
                                    Cipher c = (result.getCryptoObject() != null) ? result.getCryptoObject().getCipher() : cipher;
                                    op.run(c);
                                } catch (Exception e) {
                                    call.reject("crypto op failed: " + e.getMessage());
                                }
                            }
                            @Override
                            public void onAuthenticationError(int errorCode, CharSequence errString) {
                                call.reject("auth " + errorCode + ": " + errString);
                            }
                            // onAuthenticationFailed (a single bad fingerprint) is non-terminal; the
                            // prompt stays up. We only resolve/reject on success or terminal error.
                        });
                    prompt.authenticate(info, new BiometricPrompt.CryptoObject(cipher));
                } catch (Exception e) {
                    call.reject("biometric prompt failed: " + e.getMessage());
                }
            }
        });
    }
}
