package expo.modules.ptthardware

import android.app.Activity
import android.content.res.Configuration
import android.graphics.Color
import android.graphics.Rect
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.SystemClock
import android.view.FocusFinder
import android.view.InputDevice
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.Window
import android.widget.EditText
import android.widget.ScrollView
import android.view.inspector.WindowInspector
import com.facebook.react.R
import com.facebook.react.uimanager.util.ReactFindViewUtil
import java.util.Collections
import java.util.WeakHashMap

// Adapted from aerosurf/talktome c7c57bb (Apache-2.0).
/**
 * Keypad phones without a touchscreen (e.g. Crosscall Core-P6) can move focus with the D-pad,
 * but React Native controls need an explicit focus indication and activation.
 * Talk surfaces use discrete hold events. Other controls use a normal press.
 *
 * Every window of the app gets this, not just the activity: React Native modals (the session
 * sheet) are dialogs with their own window.
 */
internal object TalkToMeKeypadNavigation {
  private val hooked = Collections.newSetFromMap(WeakHashMap<View, Boolean>())

  fun isKeypadOnly(): Boolean = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && !hasTouchscreen()

  fun install(activity: Activity) {
    // The P6 still declares android.hardware.touchscreen, so ask the input devices instead.
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return
    val decor = activity.window.decorView
    val keys = hook(decor) ?: return
    val original = activity.window.callback
    activity.window.callback = object : Window.Callback by original {
      override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        return keys.onOperatorKey(event) || original.dispatchKeyEvent(event)
      }
    }
    // A dialog taking focus from the activity is the moment a new window appeared.
    decor.viewTreeObserver.addOnWindowFocusChangeListener { hasFocus ->
      if (!hasFocus) decor.post { WindowInspector.getGlobalWindowViews().forEach(::hook) }
    }
  }

  private fun hook(root: View): WindowKeys? {
    if (!hooked.add(root)) return null
    val keys = WindowKeys(root)
    root.addOnUnhandledKeyEventListener { _, event -> keys.onUnhandledKey(event) }
    root.viewTreeObserver.addOnWindowFocusChangeListener { hasFocus -> if (!hasFocus) keys.cancel() }
    root.viewTreeObserver.addOnGlobalFocusChangeListener { old, new -> keys.onFocusChanged(old, new) }
    // A dialog window is hooked only after it took its first focus.
    root.findFocus()?.let { keys.onFocusChanged(null, it) }
    return keys
  }

  /** Visible part in root coordinates, also clipped to every ancestor (React Native views do not clip children). */
  fun visibleRect(view: View): Rect? {
    val rect = Rect()
    if (!view.getGlobalVisibleRect(rect)) return null
    val location = IntArray(2)
    var parent = view.parent
    while (parent is View) {
      // Zero-size wrappers only position their children; they do not bound what is visible.
      if (parent.width > 0 && parent.height > 0) {
        parent.getLocationInWindow(location)
        if (!rect.intersect(location[0], location[1], location[0] + parent.width, location[1] + parent.height)) return null
      }
      parent = parent.parent
    }
    return if (rect.isEmpty) null else rect
  }

  private fun hasTouchscreen(): Boolean =
    InputDevice.getDeviceIds().any { id ->
      InputDevice.getDevice(id)?.supportsSource(InputDevice.SOURCE_TOUCHSCREEN) == true
    }
}

private class FocusRing(density: Float, color: Int, stroke: Int, radius: Int) : GradientDrawable() {
  init {
    setColor(Color.TRANSPARENT)
    setStroke((stroke * density).toInt(), color)
    cornerRadius = radius * density
  }
}

/** Key handling for one window, fed with keys no view consumed. */
private class WindowKeys(private val root: View) {
  private class Press(val target: View, val downTime: Long, val x: Float, val y: Float)
  private var press: Press? = null
  private var heldTalk: String? = null
  private val capturedOperatorKeys = mutableSetOf<Int>()
  private var outlinedCard: View? = null

  private fun View.nativeId(): String? = getTag(R.id.view_tag_native_id) as? String

  private fun operatorCard(view: View?): View? {
    var current = view
    while (current != null) {
      if (current.nativeId()?.startsWith("operator-card:") == true) return current
      current = current.parent as? View
    }
    return null
  }

  fun onOperatorKey(event: KeyEvent): Boolean {
    val focused = root.findFocus()
    if (event.keyCode == KeyEvent.KEYCODE_DPAD_CENTER && event.action == KeyEvent.ACTION_UP) {
      heldTalk?.let {
        heldTalk = null
        TalkToMeKeyboardView.dispatchKeypad("TalkUp", it)
        return true
      }
    }
    if (event.action == KeyEvent.ACTION_UP && capturedOperatorKeys.remove(event.keyCode)) return true
    val scope = focusScope()
    val id = focused?.nativeId()
    val target = id?.takeIf { it.startsWith("operator-talk:") }?.removePrefix("operator-talk:")
    val card = operatorCard(focused)?.nativeId()?.removePrefix("operator-card:")
    if (scope === root && focused !is EditText && event.action == KeyEvent.ACTION_DOWN) {
      when (event.keyCode) {
        KeyEvent.KEYCODE_DPAD_CENTER -> {
          if (heldTalk != null) return true
          if (target != null && event.repeatCount == 0 && TalkToMeKeyboardView.dispatchKeypad("TalkDown", target)) {
            heldTalk = target
            return true
          }
        }
        KeyEvent.KEYCODE_CALL, KeyEvent.KEYCODE_MENU, KeyEvent.KEYCODE_SOFT_LEFT -> {
          if (!TalkToMeKeypadNavigation.isKeypadOnly()) return false
          if (event.repeatCount > 0) return event.keyCode in capturedOperatorKeys
          val action = if (event.keyCode == KeyEvent.KEYCODE_CALL) "ToggleMute" else "OpenVolume"
          if (TalkToMeKeyboardView.dispatchKeypad(action, target ?: card)) {
            capturedOperatorKeys.add(event.keyCode)
            return true
          }
        }
      }
    }
    return false
  }

  fun onUnhandledKey(event: KeyEvent): Boolean {
    val focused = root.findFocus()
    if (TalkToMeKeyboardView.dispatchUnfocused(event, focused)) return true
    if (event.keyCode == KeyEvent.KEYCODE_DPAD_CENTER && focused !is EditText) return pressFocused(event, focused)
    val direction = focusDirection(event.keyCode) ?: return false
    if (heldTalk != null) return true
    return event.action == KeyEvent.ACTION_DOWN && moveFocus(focused, direction)
  }

  fun onFocusChanged(old: View?, new: View?) {
    if (old?.foreground is FocusRing) old.foreground = null
    outlinedCard?.let { if (it.foreground is FocusRing) it.foreground = null }
    outlinedCard = null
    if (new == null) return
    // Modals give first focus to their full-window backdrop (tap outside = close): OK there
    // would close them at once, and no arrow finds anything beyond it. Start on a control.
    val control = focusScope()?.let(::controls)?.takeIf { new in it.backdrops }?.reachable?.firstOrNull()
    if (control != null) {
      new.post { if (new.isFocused) control.requestFocus() }
      return
    }
    val card = operatorCard(new)
    val talkControl = new.nativeId()?.startsWith("operator-talk:") == true
    val accent = Color.rgb(61, 214, 245) // matches the hardware PTT marker
    if (card != null && drawFocus(card, accent, 2, 6)) {
      outlinedCard = card
      // Secondary controls still need their own focus cue to show what OK will activate.
      if (new !== card && !talkControl) drawFocus(new, accent, 2, 6)
      return
    }
    val dark = (new.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) ==
      Configuration.UI_MODE_NIGHT_YES
    drawFocus(new, if (talkControl) accent else if (dark) Color.rgb(10, 132, 255) else Color.rgb(0, 122, 255))
  }

  private fun drawFocus(view: View, color: Int, stroke: Int = 3, radius: Int = 10): Boolean {
    // The 2 px shortcut listener and hidden views get no ring.
    if (view.foreground != null || view.width <= 4 || view.height <= 4 ||
      TalkToMeKeypadNavigation.visibleRect(view) == null
    ) return false
    view.foreground = FocusRing(view.resources.displayMetrics.density, color, stroke, radius)
    return true
  }

  /**
   * Small screens clip some controls completely (target talk zones at 480x360), and Android's
   * own focus search would park on them, or on a backdrop. Search with those views taken out.
   */
  private fun moveFocus(focused: View?, direction: Int): Boolean {
    val scope = focusScope() ?: return false
    val from = focused?.takeIf { it.isDescendantOf(scope) }
    val controls = controls(scope)
    // Everything lies inside a backdrop, so no direction leads anywhere from it.
    if (from != null && from in controls.backdrops) return controls.reachable.firstOrNull()?.requestFocus() == true
    val hidden = scope.getFocusables(View.FOCUS_FORWARD).filter {
      it !== from && it !is TalkToMeKeyboardView && it !in controls.reachable &&
        (it in controls.backdrops || !it.isInScrollView(scope))
    }
    val modes = hidden.map { it.focusable }
    hidden.forEach { it.focusable = View.NOT_FOCUSABLE }
    try {
      val next = FocusFinder.getInstance().findNextFocus(scope, from, direction)
      // Nothing visible that way: swallow the key rather than let Android pick a hidden view.
      return next?.requestFocus(direction) == true || hidden.isNotEmpty()
    } finally {
      hidden.forEachIndexed { index, view -> view.focusable = modes[index] }
    }
  }

  private class Controls(val reachable: List<View>, val backdrops: List<View>)

  /**
   * Visible controls in tab order, split off the backdrops: a control every other one lies
   * inside, like a modal's tap-outside-to-close area (it starts below the status bar, so it
   * does not cover the whole window).
   */
  private fun controls(scope: ViewGroup): Controls {
    val visible = scope.getFocusables(View.FOCUS_FORWARD)
      .filter { it !is TalkToMeKeyboardView }
      .mapNotNull { view -> TalkToMeKeypadNavigation.visibleRect(view)?.let { view to it } }
    val (backdrops, reachable) = visible.partition { (_, rect) ->
      visible.size > 1 && visible.all { (_, other) -> rect.contains(other) }
    }
    return Controls(reachable.map { it.first }, backdrops.map { it.first })
  }

  /**
   * The Android session sheet is an overlay in the same window (App.tsx); the operator screen
   * underneath stays focusable, so keypad focus belongs inside the sheet while it is shown.
   */
  private fun focusScope(): ViewGroup? {
    val group = root as? ViewGroup ?: return null
    return (ReactFindViewUtil.findView(group, FOCUS_SCOPE_ID) as? ViewGroup)?.takeIf { it.isShown } ?: group
  }

  /** A key-up can get lost with the window (dialog, app switch); never leave a finger down. */
  fun cancel() {
    capturedOperatorKeys.clear()
    release(MotionEvent.ACTION_CANCEL)
    heldTalk?.let { TalkToMeKeyboardView.dispatchKeypad("TalkUp", it) }
    heldTalk = null
  }

  private fun pressFocused(event: KeyEvent, focused: View?): Boolean {
    when (event.action) {
      KeyEvent.ACTION_DOWN -> {
        if (press != null) return true
        if (event.repeatCount > 0 || focused == null || focused is TalkToMeKeyboardView) return false
        // Focus left behind under the sheet: a touch there would land on the sheet instead.
        val scope = focusScope() ?: return false
        if (!focused.isDescendantOf(scope)) return false
        // Touch the visible part only, so a partly clipped control never presses its neighbour.
        val visible = TalkToMeKeypadNavigation.visibleRect(focused) ?: return false
        val next = Press(focused.rootView, SystemClock.uptimeMillis(), visible.exactCenterX(), visible.exactCenterY())
        press = next
        touch(next, MotionEvent.ACTION_DOWN)
        return true
      }
      KeyEvent.ACTION_UP -> return release(MotionEvent.ACTION_UP)
    }
    return false
  }

  private fun release(action: Int): Boolean {
    val current = press ?: return false
    press = null
    touch(current, action)
    return true
  }

  private fun touch(press: Press, action: Int) {
    val properties = MotionEvent.PointerProperties().apply {
      id = 0
      toolType = MotionEvent.TOOL_TYPE_FINGER
    }
    val coords = MotionEvent.PointerCoords().apply {
      x = press.x
      y = press.y
      pressure = 1f
      size = 1f
    }
    val event = MotionEvent.obtain(
      press.downTime, SystemClock.uptimeMillis(), action, 1, arrayOf(properties), arrayOf(coords),
      0, 0, 1f, 1f, 0, 0, InputDevice.SOURCE_TOUCHSCREEN, 0,
    )
    // Root (window) coordinates, which is what the window's root view expects.
    press.target.dispatchTouchEvent(event)
    event.recycle()
  }

  private companion object {
    const val FOCUS_SCOPE_ID = "keypad-focus-scope"

    fun View.isDescendantOf(ancestor: View): Boolean {
      var current: View? = this
      while (current != null) {
        if (current === ancestor) return true
        current = current.parent as? View
      }
      return false
    }

    fun View.isInScrollView(scope: View): Boolean {
      var ancestor = parent
      while (ancestor is View && ancestor !== scope) {
        if (ancestor is ScrollView) return true
        ancestor = ancestor.parent
      }
      return false
    }

    fun focusDirection(keyCode: Int): Int? = when (keyCode) {
      KeyEvent.KEYCODE_DPAD_UP -> View.FOCUS_UP
      KeyEvent.KEYCODE_DPAD_DOWN -> View.FOCUS_DOWN
      KeyEvent.KEYCODE_DPAD_LEFT -> View.FOCUS_LEFT
      KeyEvent.KEYCODE_DPAD_RIGHT -> View.FOCUS_RIGHT
      else -> null
    }
  }
}
