package com.mastermetabolic.app

import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.floor
import kotlin.math.min
import kotlin.math.sin

/**
 * Same motif as iOS `CueTone` and `sessionCues.ts`
 * (880 Hz tick / 1175 Hz Go / 220 Hz Stop fallback).
 * Half-away-from-zero rounding matches Swift `Double.rounded()`.
 */
data class CueTone(val freq: Double, val dur: Double, val gain: Double) {
    fun wavBytes(): ByteArray {
        val numSamples = (SAMPLE_RATE.toDouble() * dur).toInt()
        val dataSize = numSamples * 2
        val wav = ByteArray(44 + dataSize)
        val peak = min(1.0, gain)
        var offset = 44
        for (i in 0 until numSamples) {
            val t = i.toDouble() / SAMPLE_RATE
            var wave = 0.0
            for ((ratio, mix) in PARTIALS) {
                wave += sin(2.0 * PI * freq * ratio * t) * mix
            }
            val env = min(1.0, t * 80.0) * min(1.0, (dur - t) * 20.0)
            val clipped = roundHalfAwayFromZero(wave * env * WAV_PEAK * peak).coerceIn(-32767, 32767)
            wav[offset] = (clipped and 0xff).toByte()
            wav[offset + 1] = ((clipped shr 8) and 0xff).toByte()
            offset += 2
        }
        putAscii(wav, 0, "RIFF")
        putLe32(wav, 4, 36 + dataSize)
        putAscii(wav, 8, "WAVE")
        putAscii(wav, 12, "fmt ")
        putLe32(wav, 16, 16)
        putLe16(wav, 20, 1)
        putLe16(wav, 22, 1)
        putLe32(wav, 24, SAMPLE_RATE)
        putLe32(wav, 28, SAMPLE_RATE * 2)
        putLe16(wav, 32, 2)
        putLe16(wav, 34, 16)
        putAscii(wav, 36, "data")
        putLe32(wav, 40, dataSize)
        return wav
    }

    companion object {
        const val SAMPLE_RATE = 22050
        const val WAV_PEAK = 32767.0
        val TICK = CueTone(880.0, 0.15, 1.0)
        val GO = CueTone(1175.0, 0.22, 1.0)
        val STOP = CueTone(220.0, 0.32, 1.0)
        val PARTIALS = arrayOf(1.0 to 0.7, 2.0 to 0.22, 3.0 to 0.08)

        fun roundHalfAwayFromZero(value: Double): Int {
            if (value.isNaN()) return 0
            val sign = if (value < 0.0) -1 else 1
            val rounded = floor(abs(value) + 0.5)
            if (rounded > Int.MAX_VALUE) return if (sign < 0) Int.MIN_VALUE else Int.MAX_VALUE
            return rounded.toInt() * sign
        }
    }
}

/** PCM WAV reader. Walks chunks so a LIST block before `data` (stop.wav) still plays. */
object PcmWav {
    class Parsed(val sampleRate: Int, val pcm: ByteArray) {
        val frameCount: Int get() = pcm.size / 2

        fun sampleAt(index: Int): Int {
            val offset = index * 2
            val lo = pcm[offset].toInt() and 0xff
            val hi = pcm[offset + 1].toInt() and 0xff
            val unsigned = lo or (hi shl 8)
            return if (unsigned and 0x8000 != 0) unsigned - 0x10000 else unsigned
        }
    }

    fun parse(wav: ByteArray): Parsed {
        if (wav.size < 44) error("wav too small")
        if (ascii(wav, 0, 4) != "RIFF" || ascii(wav, 8, 4) != "WAVE") error("not a wav")
        var offset = 12
        var format = -1
        var channels = 0
        var sampleRate = 0
        var bits = 0
        var data: ByteArray? = null
        while (offset + 8 <= wav.size) {
            val id = ascii(wav, offset, 4)
            val size = le32(wav, offset + 4)
            val start = offset + 8
            if (size < 0 || start > wav.size || size > wav.size - start) error("bad wav chunk")
            when (id) {
                "fmt " -> {
                    if (size < 16) error("bad fmt chunk")
                    format = le16(wav, start)
                    channels = le16(wav, start + 2)
                    sampleRate = le32(wav, start + 4)
                    bits = le16(wav, start + 14)
                }
                "data" -> data = wav.copyOfRange(start, start + size)
            }
            val padded = size + (size and 1)
            offset = start + padded
        }
        if (format != 1 || channels != 1 || bits != 16 || sampleRate <= 0) error("unsupported wav")
        val pcm = data ?: error("wav missing data")
        if (pcm.size % 2 != 0) error("odd pcm length")
        return Parsed(sampleRate, pcm)
    }

    private fun ascii(bytes: ByteArray, offset: Int, length: Int): String {
        return String(bytes, offset, length, Charsets.US_ASCII)
    }

    private fun le16(bytes: ByteArray, offset: Int): Int {
        val lo = bytes[offset].toInt() and 0xff
        val hi = bytes[offset + 1].toInt() and 0xff
        return lo or (hi shl 8)
    }

    private fun le32(bytes: ByteArray, offset: Int): Int {
        val b0 = bytes[offset].toInt() and 0xff
        val b1 = bytes[offset + 1].toInt() and 0xff
        val b2 = bytes[offset + 2].toInt() and 0xff
        val b3 = bytes[offset + 3].toInt() and 0xff
        return b0 or (b1 shl 8) or (b2 shl 16) or (b3 shl 24)
    }
}

private fun putAscii(bytes: ByteArray, offset: Int, text: String) {
    for (i in text.indices) bytes[offset + i] = text[i].code.toByte()
}

private fun putLe16(bytes: ByteArray, offset: Int, value: Int) {
    bytes[offset] = (value and 0xff).toByte()
    bytes[offset + 1] = ((value shr 8) and 0xff).toByte()
}

private fun putLe32(bytes: ByteArray, offset: Int, value: Int) {
    bytes[offset] = (value and 0xff).toByte()
    bytes[offset + 1] = ((value shr 8) and 0xff).toByte()
    bytes[offset + 2] = ((value shr 16) and 0xff).toByte()
    bytes[offset + 3] = ((value shr 24) and 0xff).toByte()
}
