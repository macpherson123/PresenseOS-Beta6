package com.presenceoslite

import android.content.Context
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.recyclerview.widget.RecyclerView
import androidx.viewpager2.widget.ViewPager2
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.uimanager.events.RCTEventEmitter

/**
 * PresenceSwipePagerView
 *
 * Native ViewPager2 wrapper exposing a 3-page horizontal swipe to React Native.
 * Pages: 0 = messages (left), 1 = home (centre), 2 = settings (right).
 *
 * Children are stored in a MutableList managed via standard ViewGroup semantics
 * (add at index, remove at index). The ViewPager2 adapter renders list[position]
 * for each page slot. This matches what React Native Fabric expects from a
 * ViewGroupManager — the 3-slot fixed array we used before silently dropped
 * children whenever Fabric mounted them at indices >= 3, which is exactly what
 * caused the swipe-left-to-settings black page.
 */
class PresenceSwipePagerView(context: Context) : FrameLayout(context) {

    val viewPager: ViewPager2 = ViewPager2(context)

    val rnChildren: MutableList<View> = mutableListOf()

    init {
        viewPager.layoutParams = LayoutParams(
            LayoutParams.MATCH_PARENT,
            LayoutParams.MATCH_PARENT
        )
        viewPager.offscreenPageLimit = 2          // Keep all 3 pages in memory — no reload lag
        viewPager.adapter = PagerAdapter()

        // Start on home (centre)
        viewPager.post { if (rnChildren.size >= 2) viewPager.setCurrentItem(1, false) }

        viewPager.registerOnPageChangeCallback(object : ViewPager2.OnPageChangeCallback() {
            override fun onPageSelected(position: Int) {
                val reactContext = context as? ReactContext ?: return
                val event = Arguments.createMap().apply { putInt("page", position) }
                reactContext
                    .getJSModule(RCTEventEmitter::class.java)
                    .receiveEvent(id, "topPageChange", event)
            }
        })

        addView(viewPager)

        // ViewPager2's internal RecyclerView uses the system touch slop (~8-16dp) to decide
        // whether to intercept a touch for a horizontal page swipe. On Samsung devices with
        // noisy touch digitisers this threshold is hit during what the user intends as a
        // still tap, causing the RecyclerView to steal the event before React Native's JS
        // responder system can hand it to a Pressable component. Native Android views (Switch,
        // ScrollView) are immune because they call requestDisallowInterceptTouchEvent
        // themselves; JS-driven Pressables cannot do this across the bridge fast enough.
        // Tripling the slop means the user must move ≥3× as far horizontally before the
        // pager intercepts, allowing short taps to reach child components reliably.
        viewPager.post {
            try {
                val rv = viewPager.getChildAt(0) as? RecyclerView ?: return@post
                val field = RecyclerView::class.java.getDeclaredField("mTouchSlop")
                field.isAccessible = true
                field.setInt(rv, field.getInt(rv) * 3)
            } catch (_: Exception) { /* safe to ignore; pager still works at default slop */ }
        }
    }

    fun setPage(page: Int, animated: Boolean = true) {
        viewPager.post {
            if (page in 0 until rnChildren.size) viewPager.setCurrentItem(page, animated)
        }
    }

    fun attachChildAt(child: View, index: Int) {
        val safeIndex = index.coerceIn(0, rnChildren.size)
        rnChildren.add(safeIndex, child)
        viewPager.adapter?.notifyItemInserted(safeIndex)
        // Once all three pages are mounted, snap to the home page (centre).
        // We do this after every insert because Fabric remounts can reset to 0.
        if (rnChildren.size >= 2 && viewPager.currentItem != 1) {
            viewPager.post {
                if (rnChildren.size >= 2) viewPager.setCurrentItem(1, false)
            }
        }
    }

    fun detachChildAt(index: Int) {
        if (index !in rnChildren.indices) return
        rnChildren.removeAt(index)
        viewPager.adapter?.notifyItemRemoved(index)
    }

    inner class PagerAdapter : RecyclerView.Adapter<PagerAdapter.Holder>() {

        override fun getItemCount() = rnChildren.size

        // Unique viewType per position so RecyclerView never recycles across pages
        override fun getItemViewType(position: Int) = position

        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): Holder {
            val container = FrameLayout(context).apply {
                layoutParams = RecyclerView.LayoutParams(
                    RecyclerView.LayoutParams.MATCH_PARENT,
                    RecyclerView.LayoutParams.MATCH_PARENT
                )
            }
            return Holder(container)
        }

        override fun onBindViewHolder(holder: Holder, position: Int) {
            val container = holder.container
            container.removeAllViews()
            val child = rnChildren.getOrNull(position) ?: return
            (child.parent as? ViewGroup)?.removeView(child)
            container.addView(child, FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            ))
        }

        inner class Holder(val container: FrameLayout) : RecyclerView.ViewHolder(container)
    }
}
