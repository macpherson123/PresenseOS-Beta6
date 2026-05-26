package com.presenceoslite

import android.view.View
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.ViewGroupManager

/**
 * PresenceSwipePagerViewManager
 *
 * Bridges PresenceSwipePagerView to React Native using standard list-based
 * ViewGroupManager semantics. Earlier versions hard-coded a 3-slot array,
 * which broke whenever Fabric remounted children at sequential indices
 * (e.g., index=3,4,5 after a re-render) — those views were silently dropped,
 * leaving the swipe-target page blank.
 *
 * Commands:
 *   setPage(page: Int, animated: Boolean)
 */
class PresenceSwipePagerViewManager : ViewGroupManager<PresenceSwipePagerView>() {

    override fun getName() = "PresenceSwipePager"

    override fun createViewInstance(context: ThemedReactContext): PresenceSwipePagerView =
        PresenceSwipePagerView(context)

    // ── Child routing (standard list semantics) ───────────────────────────────

    override fun addView(parent: PresenceSwipePagerView, child: View, index: Int) {
        parent.attachChildAt(child, index)
    }

    override fun getChildAt(parent: PresenceSwipePagerView, index: Int): View? =
        parent.rnChildren.getOrNull(index)

    override fun getChildCount(parent: PresenceSwipePagerView): Int = parent.rnChildren.size

    override fun removeViewAt(parent: PresenceSwipePagerView, index: Int) {
        parent.detachChildAt(index)
    }

    // ── Events ────────────────────────────────────────────────────────────────

    override fun getExportedCustomDirectEventTypeConstants(): Map<String, Any> = mapOf(
        "topPageChange" to mapOf("registrationName" to "onPageChange")
    )

    // ── Commands (imperative control from JS) ─────────────────────────────────

    override fun getCommandsMap(): Map<String, Int> = mapOf(
        "setPage" to SET_PAGE_COMMAND
    )

    override fun receiveCommand(root: PresenceSwipePagerView, commandId: String?, args: ReadableArray?) {
        when (commandId) {
            "setPage" -> {
                val page = args?.getInt(0) ?: 1
                val animated = args?.getBoolean(1) ?: true
                root.setPage(page, animated)
            }
        }
    }

    override fun receiveCommand(root: PresenceSwipePagerView, commandId: Int, args: ReadableArray?) {
        when (commandId) {
            SET_PAGE_COMMAND -> {
                val page = args?.getInt(0) ?: 1
                val animated = args?.getBoolean(1) ?: true
                root.setPage(page, animated)
            }
        }
    }

    companion object {
        const val SET_PAGE_COMMAND = 1
    }
}
