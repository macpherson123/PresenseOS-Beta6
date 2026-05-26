package com.presenceoslite

import android.content.Context
import android.view.GestureDetector
import android.view.MotionEvent
import android.view.View
import androidx.core.view.GestureDetectorCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.uimanager.events.RCTEventEmitter

/**
 * SwipeUpDetectorView
 *
 * A transparent, touch-intercepting strip that detects deliberate upward flings
 * and fires an onSwipeUp event to React Native.
 *
 * Sits at the bottom of any screen that needs rotary access (settings, messages, chat).
 * Default height: 40dp (configurable via SwipeUpDetectorViewManager threshold prop).
 *
 * Upward fling = dy < -(threshold px) AND velocityY < -(velocityThreshold px/s)
 * Both conditions prevent accidental triggers during normal scrolling.
 */
class SwipeUpDetectorView(context: Context) : View(context) {

    // Minimum upward travel in pixels before considering a swipe (default ~80dp)
    var distanceThreshold: Float = 80f * context.resources.displayMetrics.density

    // Minimum upward velocity in px/s
    var velocityThreshold: Float = 400f

    private val gestureDetector = GestureDetectorCompat(context,
        object : GestureDetector.SimpleOnGestureListener() {

            override fun onDown(e: MotionEvent) = true   // Must return true to receive gestures

            override fun onFling(
                e1: MotionEvent?,
                e2: MotionEvent,
                velocityX: Float,
                velocityY: Float
            ): Boolean {
                val startY = e1?.y ?: return false
                val dy = e2.y - startY

                // Upward fling: negative dy, negative velocityY (upward)
                val isUpwardFling = dy < -distanceThreshold && velocityY < -velocityThreshold
                if (isUpwardFling) {
                    fireSwipeUp()
                    return true
                }
                return false
            }
        }
    )

    override fun onTouchEvent(event: MotionEvent): Boolean {
        return gestureDetector.onTouchEvent(event) || super.onTouchEvent(event)
    }

    private fun fireSwipeUp() {
        val reactContext = context as? ReactContext ?: return
        reactContext
            .getJSModule(RCTEventEmitter::class.java)
            .receiveEvent(id, "topSwipeUp", Arguments.createMap())
    }
}
