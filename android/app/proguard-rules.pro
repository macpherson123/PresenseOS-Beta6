# PresenceOS beta 5 — release ProGuard / R8 rules.
# Order: framework keeps first, then libraries we depend on, then app-level
# tightening (strip logs, remove debug info).

# ── React Native core ─────────────────────────────────────────────────────────
-keep,allowobfuscation @interface com.facebook.proguard.annotations.DoNotStrip
-keep,allowobfuscation @interface com.facebook.proguard.annotations.KeepGettersAndSetters
-keep,allowobfuscation @interface com.facebook.common.internal.DoNotStrip

-keep @com.facebook.proguard.annotations.DoNotStrip class *
-keep @com.facebook.common.internal.DoNotStrip class *
-keepclassmembers class * {
    @com.facebook.proguard.annotations.DoNotStrip *;
    @com.facebook.common.internal.DoNotStrip *;
}

-keep class * implements com.facebook.react.bridge.JavaScriptModule { *; }
-keep class * implements com.facebook.react.bridge.NativeModule { *; }
-keepclassmembers class * { @com.facebook.react.uimanager.annotations.ReactProp <methods>; }
-keepclassmembers class * { @com.facebook.react.uimanager.annotations.ReactPropGroup <methods>; }

-keep class com.facebook.react.** { *; }
-dontwarn com.facebook.react.**

# Hermes
-keep class com.facebook.hermes.unicode.** { *; }
-keep class com.facebook.jni.** { *; }

# New architecture (TurboModules, Fabric)
-keep class com.facebook.react.turbomodule.** { *; }
-keep class com.facebook.react.fabric.** { *; }
-keep class com.facebook.react.bridge.** { *; }
-keep class com.facebook.react.uimanager.** { *; }

# ── Reanimated / Gesture Handler ──────────────────────────────────────────────
-keep class com.swmansion.reanimated.** { *; }
-keep class com.swmansion.rnscreens.** { *; }
-keep class com.swmansion.gesturehandler.** { *; }

# ── Expo modules (catch-all for all expo-* libs autolinked) ───────────────────
-keep class expo.modules.** { *; }
-keep class expo.core.** { *; }
-dontwarn expo.modules.**

# ── react-native-webview ──────────────────────────────────────────────────────
-keep class com.reactnativecommunity.webview.** { *; }

# ── react-native-webrtc (used for calling) ────────────────────────────────────
-keep class org.webrtc.** { *; }
-keep class com.oney.WebRTCModule.** { *; }
-dontwarn org.webrtc.**

# ── socket.io / okhttp / okio (signalling + HTTP transport) ───────────────────
-keep class io.socket.** { *; }
-keep class okhttp3.** { *; }
-keep class okio.** { *; }
-dontwarn okhttp3.**
-dontwarn okio.**
-dontwarn org.codehaus.mojo.animal_sniffer.**

# ── NFC ───────────────────────────────────────────────────────────────────────
-keep class community.revteltech.nfc.** { *; }

# ── QR / SVG ──────────────────────────────────────────────────────────────────
-keep class com.horcrux.svg.** { *; }

# ── async-storage ─────────────────────────────────────────────────────────────
-keep class com.reactnativecommunity.asyncstorage.** { *; }

# ── slider / safe-area / screens (already listed but explicit) ────────────────
-keep class com.reactnativecommunity.slider.** { *; }
-keep class com.th3rdwave.safeareacontext.** { *; }

# ── PresenceOS native modules ─────────────────────────────────────────────────
# Anything under our own package that gets called from JS must survive R8.
-keep class com.presenceoslite.** { *; }

# ── Kotlin metadata ───────────────────────────────────────────────────────────
-keep class kotlin.Metadata { *; }
-keep class kotlin.coroutines.Continuation { *; }
-keepclassmembers class **$$serializer { *; }

# ── Strip debug / log calls from release binary ───────────────────────────────
# This removes plaintext breadcrumbs that show up in `strings app-release.apk`.
-assumenosideeffects class android.util.Log {
    public static int v(...);
    public static int d(...);
    public static int i(...);
    public static int w(...);
    public static int e(...);
}
-assumenosideeffects class java.io.PrintStream {
    public *** println(...);
    public *** print(...);
}

# ── Obfuscation hardening ─────────────────────────────────────────────────────
# Remove source-file + line-number attributes — stack traces become opaque.
# If you need readable crash reports later, switch to -renamesourcefileattribute
# plus uploading mapping.txt to your crash backend.
-renamesourcefileattribute SourceFile
-keepattributes SourceFile,LineNumberTable

# Enable the most aggressive renaming R8 supports.
-repackageclasses ''
-allowaccessmodification
-overloadaggressively
