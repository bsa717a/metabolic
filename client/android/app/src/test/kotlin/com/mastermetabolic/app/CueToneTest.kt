package com.mastermetabolic.app

import java.io.File
import kotlin.math.PI
import kotlin.math.min
import kotlin.math.sin
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class CueToneTest {
    @Test
    fun tickMatchesIosLengthAndOpeningSamples() {
        val parsed = PcmWav.parse(CueTone.TICK.wavBytes())
        assertEquals(CueTone.SAMPLE_RATE, parsed.sampleRate)
        assertEquals(3307, parsed.frameCount)
        assertEquals(6658, CueTone.TICK.wavBytes().size)
        assertEquals(0, parsed.sampleAt(0))
        assertEquals(40, parsed.sampleAt(1))
        assertEquals(143, parsed.sampleAt(2))
        assertEquals(-8338, parsed.sampleAt(1653))
        assertEquals(-21, parsed.sampleAt(3306))
    }

    @Test
    fun goAndStopFallbacksMatchIosLengths() {
        val go = PcmWav.parse(CueTone.GO.wavBytes())
        val stop = PcmWav.parse(CueTone.STOP.wavBytes())
        assertEquals(4851, go.frameCount)
        assertEquals(52, go.sampleAt(1))
        assertEquals(22687, go.sampleAt(2425))
        assertEquals(7056, stop.frameCount)
        assertEquals(10, stop.sampleAt(1))
        assertEquals(24511, stop.sampleAt(3528))
    }

    @Test
    fun samplesFollowTheSharedPartialFormula() {
        val tone = CueTone.TICK
        val parsed = PcmWav.parse(tone.wavBytes())
        val index = 100
        val t = index.toDouble() / CueTone.SAMPLE_RATE
        var wave = 0.0
        for ((ratio, mix) in CueTone.PARTIALS) {
            wave += sin(2.0 * PI * tone.freq * ratio * t) * mix
        }
        val env = min(1.0, t * 80.0) * min(1.0, (tone.dur - t) * 20.0)
        val expected = CueTone.roundHalfAwayFromZero(wave * env * CueTone.WAV_PEAK * tone.gain)
            .coerceIn(-32767, 32767)
        assertEquals(expected, parsed.sampleAt(index))
    }

    @Test
    fun bundledClipsAreMono16Bit44100AndKeepTheListChunk() {
        val go = PcmWav.parse(bundledWav("go"))
        val stopBytes = bundledWav("stop")
        val stop = PcmWav.parse(stopBytes)
        assertEquals(44100, go.sampleRate)
        assertEquals(44100, stop.sampleRate)
        assertEquals(18901, go.frameCount)
        assertEquals(21323, stop.frameCount)
        assertTrue(String(stopBytes, Charsets.US_ASCII).contains("LIST"))
        assertTrue(go.frameCount > 1000)
    }

    private fun bundledWav(name: String): ByteArray {
        val candidates = listOf(
            File("src/main/res/raw/$name.wav"),
            File("app/src/main/res/raw/$name.wav")
        )
        val file = candidates.firstOrNull { it.isFile }
            ?: error("missing $name.wav from ${File(".").absolutePath}")
        return file.readBytes()
    }
}
