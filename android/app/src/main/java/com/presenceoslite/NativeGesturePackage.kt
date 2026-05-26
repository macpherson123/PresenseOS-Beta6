package com.presenceoslite

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

/**
 * NativeGesturePackage
 *
 * Registers:
 *   - PresenceSwipePager  → ViewPager2-based 3-panel horizontal swipe
 *   - SwipeUpDetector     → Native upward fling detector for rotary trigger
 *
 * Add to MainApplication.kt getPackages():
 *   packages.add(NativeGesturePackage())
 */
class NativeGesturePackage : ReactPackage {

    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
        emptyList()

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> =
        listOf(
            PresenceSwipePagerViewManager(),
            SwipeUpDetectorViewManager(),
        )
}
