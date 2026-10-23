package com.mastermetabolic.app

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import android.util.Log
import java.io.IOException
import kotlin.math.max

/**
 * In-process cue player. WebView audio requests focus and pauses the user's
 * music, which is why ticks and the Go/Stop clips play here instead.
 *
 * [MIX_WITH_OTHERS] is media usage with sonification content. This class never
 * asks the system for exclusive playback, so other apps are not paused and are
 * not asked to lower their volume. That is the Android v1 port of iOS
 * `.playback` + `.mixWithOthers`.
 */
class CueAudioPlayer {
    private val lock = Any()
    private var tick: Clip? = null
    private var go: Clip? = null
    private var stop: Clip? = null

    fun prime(context: Context) {
        synchronized(lock) {
            if (tick != null && go != null && stop != null) return
            val app = context.applicationContext
            var builtTick: Clip? = null
            var builtGo: Clip? = null
            var builtStop: Clip? = null
            try {
                builtTick = tick ?: build(CueTone.TICK.wavBytes())
                builtGo = go ?: build(clipOrTone(app, "go", CueTone.GO))
                builtStop = stop ?: build(clipOrTone(app, "stop", CueTone.STOP))
                tick = builtTick
                go = builtGo
                stop = builtStop
            } catch (error: RuntimeException) {
                if (tick == null) builtTick?.release()
                if (go == null) builtGo?.release()
                if (stop == null) builtStop?.release()
                throw error
            }
        }
    }

    fun playTick(context: Context) = play(context, "tick")

    fun playGo(context: Context) = play(context, "go")

    fun playStop(context: Context) = play(context, "stop")

    fun release() {
        synchronized(lock) {
            tick?.release()
            go?.release()
            stop?.release()
            tick = null
            go = null
            stop = null
        }
    }

    private fun play(context: Context, kind: String) {
        synchronized(lock) {
            try {
                prime(context)
                val clip = when (kind) {
                    "tick" -> tick
                    "go" -> go
                    "stop" -> stop
                    else -> null
                } ?: error(unavailable(kind))
                if (clip.track.playState == AudioTrack.PLAYSTATE_PLAYING) {
                    clip.track.pause()
                }
                // The first play is already at frame 0. Later plays must rewind
                // a static buffer; stop() does not move that head.
                if (clip.started && clip.track.setPlaybackHeadPosition(0) != AudioTrack.SUCCESS) {
                    error(unavailable(kind))
                }
                clip.track.play()
                clip.started = true
            } catch (error: RuntimeException) {
                throw IllegalStateException(unavailable(kind), error)
            }
        }
    }

    private fun clipOrTone(context: Context, name: String, tone: CueTone): ByteArray {
        val clip = loadClip(context, name)
        if (clip != null) return clip
        Log.w(TAG, "$name.wav missing; using generated tone")
        return tone.wavBytes()
    }

    private fun loadClip(context: Context, name: String): ByteArray? {
        val bytes = readRaw(context, name) ?: readAsset(context, "public/audio/$name.wav") ?: return null
        return try {
            val parsed = PcmWav.parse(bytes)
            if (parsed.frameCount <= 0) null else bytes
        } catch (error: RuntimeException) {
            Log.w(TAG, "$name.wav unusable; using generated tone", error)
            null
        }
    }

    private fun readRaw(context: Context, name: String): ByteArray? {
        val id = context.resources.getIdentifier(name, "raw", context.packageName)
        if (id == 0) return null
        return try {
            context.resources.openRawResource(id).use { it.readBytes() }
        } catch (error: IOException) {
            Log.w(TAG, "raw $name unreadable", error)
            null
        }
    }

    private fun readAsset(context: Context, path: String): ByteArray? {
        return try {
            context.assets.open(path).use { it.readBytes() }
        } catch (_: IOException) {
            null
        }
    }

    private fun build(wav: ByteArray): Clip {
        val parsed = PcmWav.parse(wav)
        val min = AudioTrack.getMinBufferSize(
            parsed.sampleRate,
            AudioFormat.CHANNEL_OUT_MONO,
            AudioFormat.ENCODING_PCM_16BIT
        )
        if (min <= 0) error("AudioTrack buffer unavailable")
        val bufferSize = max(min, parsed.pcm.size).let { size -> if (size % 2 == 0) size else size + 1 }
        val pcm = if (parsed.pcm.size == bufferSize) parsed.pcm else parsed.pcm.copyOf(bufferSize)
        val track = AudioTrack.Builder()
            .setAudioAttributes(MIX_WITH_OTHERS)
            .setAudioFormat(
                AudioFormat.Builder()
                    .setSampleRate(parsed.sampleRate)
                    .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                    .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                    .build()
            )
            .setTransferMode(AudioTrack.MODE_STATIC)
            .setBufferSizeInBytes(bufferSize)
            .build()
        try {
            if (track.state != AudioTrack.STATE_INITIALIZED) error("AudioTrack uninitialized")
            track.setVolume(1f)
            val written = track.write(pcm, 0, pcm.size)
            if (written != pcm.size) error("AudioTrack short write")
            return Clip(track)
        } catch (error: RuntimeException) {
            track.release()
            throw error
        }
    }

    private class Clip(val track: AudioTrack) {
        var started: Boolean = false

        fun release() {
            track.release()
        }
    }

    private fun unavailable(kind: String): String {
        return when (kind) {
            "tick" -> "native tick unavailable"
            "go" -> "native Go clip unavailable"
            "stop" -> "native Stop clip unavailable"
            else -> "native cue unavailable"
        }
    }

    companion object {
        private const val TAG = "sessionCues"

        /**
         * Shared with music. No audio-focus request is made anywhere in this player.
         */
        private val MIX_WITH_OTHERS: AudioAttributes = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_MEDIA)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()
    }
}
