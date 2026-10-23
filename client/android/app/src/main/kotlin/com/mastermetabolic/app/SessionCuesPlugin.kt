package com.mastermetabolic.app

import android.util.Log
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * Same JS name as the iOS plugin (`registerPlugin('SessionCues')`).
 * Registered from [MainActivity] before the Capacitor bridge starts.
 */
@CapacitorPlugin(name = "SessionCues")
class SessionCuesPlugin : Plugin() {
    private val cues = CueAudioPlayer()

    @PluginMethod
    fun prime(call: PluginCall) = runCue(call, "prime") { cues.prime(context) }

    @PluginMethod
    fun playTick(call: PluginCall) = runCue(call, "tick") { cues.playTick(context) }

    @PluginMethod
    fun playGo(call: PluginCall) = runCue(call, "go") { cues.playGo(context) }

    @PluginMethod
    fun playStop(call: PluginCall) = runCue(call, "stop") { cues.playStop(context) }

    override fun handleOnDestroy() {
        cues.release()
        super.handleOnDestroy()
    }

    private fun runCue(call: PluginCall, kind: String, block: () -> Unit) {
        try {
            block()
            call.resolve()
        } catch (error: Exception) {
            Log.w(TAG, "native $kind failed", error)
            call.reject(error.message ?: "native $kind unavailable")
        }
    }

    companion object {
        private const val TAG = "sessionCues"
    }
}
