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
 * SecureKeyStore — hardware-wrapped storage for an Ed25519 signing-key JWK. This
 * plugin ONLY stores and returns the JWK string; the Ed25519 signing itself stays in
 * JS (receipt-sign.js / WebCrypto). The JWK is AES-256-GCM encrypted under a
 * hardware-backed AndroidKeyStore master key. (Android Keystore can't hardware-SIGN
 * Ed25519, only P-256; this "hardware-wrapped at rest" path keeps the Ed25519 stack
 * unchanged.)
 *
 * TWO key classes, selected per call by `requireAuth` (default true):
 *   - requireAuth=true  (TEACHER key, Phase 4): the master key REQUIRES user auth for
 *     every use, bound via a BiometricPrompt.CryptoObject — the plaintext is only
 *     recoverable after a fresh biometric/PIN unlock. A teacher key MINTS grades, so
 *     it earns the gate.
 *   - requireAuth=false (STUDENT key, offline-grading mesh Phase 2.5): the master key
 *     has NO user-auth flag, so encrypt/decrypt is silent — no biometric prompt. A
 *     student key only signs SUBMISSIONS (the teacher re-grades them), so on a SHARED
 *     classroom device a student must NOT need the teacher's fingerprint. The roster
 *     password is the auth; the key just makes mesh submissions attributable. Still
 *     wrapped at rest (protected from other apps; not from a rooted device — acceptable
 *     for the classroom threat model).
 *
 * The two classes use SEPARATE master aliases, so a label stored with one requireAuth
 * value must be read with the SAME value (callers keep this consistent per label).
 *
 * Methods: setKey/getKey (requireAuth + caller-provided title/subtitle), hasKey,
 * removeKey, isBiometricAvailable.
 */
@CapacitorPlugin(name = "SecureKeyStore")
public class SecureKeyStorePlugin extends Plugin {

    private static final String KEYSTORE = "AndroidKeyStore";
    private static final String MASTER_ALIAS = "apstats_securekey_master_v1";               // auth-required (teacher)
    private static final String MASTER_ALIAS_NOAUTH = "apstats_securekey_master_noauth_v1";  // no user-auth (student)
    private static final String PREFS = "apstats_secure_keys";
    private static final String TRANSFORM = "AES/GCM/NoPadding";
    private static final int GCM_TAG_BITS = 128;
    private static final String DEFAULT_SUBTITLE = "AP Statistics signing key";

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

    // Get or create the hardware-backed AES master key. requireAuth picks the alias:
    // the auth-gated teacher master, or the silent student master (no user-auth flag).
    private SecretKey masterKey(boolean requireAuth) throws Exception {
        String alias = requireAuth ? MASTER_ALIAS : MASTER_ALIAS_NOAUTH;
        KeyStore ks = KeyStore.getInstance(KEYSTORE);
        ks.load(null);
        if (ks.containsAlias(alias)) {
            return (SecretKey) ks.getKey(alias, null);
        }
        KeyGenerator kg = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE);
        KeyGenParameterSpec.Builder b = new KeyGenParameterSpec.Builder(
            alias,
            KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256);
        if (requireAuth) {
            b.setUserAuthenticationRequired(true);
            if (Build.VERSION.SDK_INT >= 30) {
                b.setUserAuthenticationParameters(0,
                    KeyProperties.AUTH_BIOMETRIC_STRONG | KeyProperties.AUTH_DEVICE_CREDENTIAL);
            } else {
                // -1 = require authentication for EVERY use (must be via a CryptoObject).
                b.setUserAuthenticationValidityDurationSeconds(-1);
            }
        }
        // requireAuth=false → no setUserAuthenticationRequired → silent encrypt/decrypt.
        kg.init(b.build());
        kg.generateKey();
        return (SecretKey) ks.getKey(alias, null);
    }

    // ── setKey ───────────────────────────────────────────────────────────────
    @PluginMethod
    public void setKey(final PluginCall call) {
        final String name = call.getString("key");
        final String value = call.getString("value");
        if (name == null || value == null) { call.reject("key and value are required"); return; }
        final boolean requireAuth = call.getBoolean("requireAuth", true);
        final String title = call.getString("title", "Save signing key");
        final String subtitle = call.getString("subtitle", DEFAULT_SUBTITLE);
        try {
            Cipher cipher = Cipher.getInstance(TRANSFORM);
            cipher.init(Cipher.ENCRYPT_MODE, masterKey(requireAuth));
            CipherOp op = new CipherOp() {
                public void run(Cipher c) throws Exception {
                    byte[] ct = c.doFinal(value.getBytes(StandardCharsets.UTF_8));
                    byte[] iv = c.getIV();
                    prefs().edit()
                        .putString(name + ".ct", Base64.encodeToString(ct, Base64.NO_WRAP))
                        .putString(name + ".iv", Base64.encodeToString(iv, Base64.NO_WRAP))
                        .apply();
                    call.resolve();
                }
            };
            if (requireAuth) authThenRun(cipher, title, subtitle, op, call);
            else runDirect(cipher, op, call);
        } catch (Exception e) {
            call.reject("setKey failed: " + e.getMessage());
        }
    }

    // ── getKey ───────────────────────────────────────────────────────────────
    @PluginMethod
    public void getKey(final PluginCall call) {
        final String name = call.getString("key");
        if (name == null) { call.reject("key is required"); return; }
        final boolean requireAuth = call.getBoolean("requireAuth", true);
        final String title = call.getString("title", "Unlock signing key");
        final String subtitle = call.getString("subtitle", DEFAULT_SUBTITLE);
        String ctB64 = prefs().getString(name + ".ct", null);
        String ivB64 = prefs().getString(name + ".iv", null);
        if (ctB64 == null || ivB64 == null) { call.resolve(); return; } // no value → resolve undefined
        try {
            final byte[] ct = Base64.decode(ctB64, Base64.NO_WRAP);
            byte[] iv = Base64.decode(ivB64, Base64.NO_WRAP);
            Cipher cipher = Cipher.getInstance(TRANSFORM);
            cipher.init(Cipher.DECRYPT_MODE, masterKey(requireAuth), new GCMParameterSpec(GCM_TAG_BITS, iv));
            CipherOp op = new CipherOp() {
                public void run(Cipher c) throws Exception {
                    byte[] pt = c.doFinal(ct);
                    JSObject ret = new JSObject();
                    ret.put("value", new String(pt, StandardCharsets.UTF_8));
                    call.resolve(ret);
                }
            };
            if (requireAuth) authThenRun(cipher, title, subtitle, op, call);
            else runDirect(cipher, op, call);
        } catch (Exception e) {
            call.reject("getKey failed: " + e.getMessage());
        }
    }

    // A silent cipher run for the non-auth (student) key class — no BiometricPrompt.
    private void runDirect(Cipher cipher, CipherOp op, PluginCall call) {
        try { op.run(cipher); }
        catch (Exception e) { call.reject("crypto op failed: " + e.getMessage()); }
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

    private void authThenRun(final Cipher cipher, final String title, final String subtitle, final CipherOp op, final PluginCall call) {
        final FragmentActivity activity = (getActivity() instanceof FragmentActivity) ? (FragmentActivity) getActivity() : null;
        if (activity == null) { call.reject("no FragmentActivity for BiometricPrompt"); return; }

        final BiometricPrompt.PromptInfo info = new BiometricPrompt.PromptInfo.Builder()
            .setTitle(title)
            .setSubtitle(subtitle)
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
