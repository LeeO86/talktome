package expo.modules.ptthardware

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Crosscall Settings queries manifest receivers to populate its PTT and SOS app pickers. */
class CrosscallPttDiscoveryReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    // The active PTT controller receives the same broadcast and owns dispatch.
  }
}
