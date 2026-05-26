package com.presenceoslite

import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp

class SwipeUpDetectorViewManager : SimpleViewManager<SwipeUpDetectorView>() {

    override fun getName() = "SwipeUpDetector"

    override fun createViewInstance(context: ThemedReactContext): SwipeUpDetectorView =
        SwipeUpDetectorView(context)

    @ReactProp(name = "distanceThreshold")
    fun setDistanceThreshold(view: SwipeUpDetectorView, dp: Float) {
        view.distanceThreshold = dp * view.resources.displayMetrics.density
    }

    @ReactProp(name = "velocityThreshold")
    fun setVelocityThreshold(view: SwipeUpDetectorView, pxPerSec: Float) {
        view.velocityThreshold = pxPerSec
    }

    override fun getExportedCustomDirectEventTypeConstants(): Map<String, Any> = mapOf(
        "topSwipeUp" to mapOf("registrationName" to "onSwipeUp")
    )
}
