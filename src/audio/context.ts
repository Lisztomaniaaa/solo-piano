// AudioContext, master chain and the reverb send.

type AudioContextCtor = typeof AudioContext;
const AudioContextClass: AudioContextCtor =
    window.AudioContext || (window as unknown as { webkitAudioContext: AudioContextCtor }).webkitAudioContext;

export const IS_MOBILE_AUDIO = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');

// 'balanced' on every platform. 'interactive' asks for the smallest hardware
// buffer, so the audio thread underruns (audible crackle) the moment anything
// else — falling notes, particles, the canvas — competes for CPU. Measured
// level was never the issue (dense pedalled passages peak at 0.58 with zero
// clipped samples), so the intermittent crackle is a missed deadline; the
// extra few ms of output latency buys a buffer that survives a frame of
// contention and stays far below where key response starts to feel detached.
export const audioCtx: AudioContext = (() => {
    try { return new AudioContextClass({ latencyHint: 'balanced' }); }
    catch { return new AudioContextClass(); }
})();

export const masterGain = audioCtx.createGain();
// Master chain: gain (headroom) -> one gentle limiter -> transparent
// overshoot guard -> DAC. Do NOT put a glue compressor back here: the old
// chain (compressor threshold -12 dB / knee 24 with WebAudio's implicit
// makeup gain, a 1.15 makeup stage, a -0.5 dB brickwall, then a tanh(2x)
// WaveShaper) was itself the distortion — knee 24 compresses nearly all
// musical content, and tanh(2x) boosted everything by +6 dB and saturated
// anything above ~0.3. With honest per-voice staging (velocityGain /
// layerBoost in playSfBuffer) the mix rarely exceeds the limiter threshold,
// and the guard curve below stays inaudible: unity up to 0.85, then a smooth
// bend that asymptotes at 0.995 so no transient stack can hard-clip the DAC.
// 1.328125 = 0.85 / volumeGain(0.80): the volume sliders start at 80%, so
// 1.328125 x 0.80^2 = 0.85 — exactly the calibrated level — while leaving
// +3.9 dB of deliberate boost above the default.
masterGain.gain.value = 1.328125;
const masterLimiter = audioCtx.createDynamicsCompressor();
try {
    masterLimiter.threshold.value = -5.0;
    // Through dense pedalled passages this stage holds 5-9 dB of reduction
    // continuously, so its timing is part of the sound. A wider knee spreads
    // that reduction over a gradual onset.
    masterLimiter.knee.value = 8.0;
    masterLimiter.ratio.value = 10.0;
    // 8 ms: longer than the period of the lowest note on the keyboard (A0 =
    // 18 ms at 55 Hz would be distorted by a 2 ms attack tracking inside the
    // waveform), while still following a piano transient's envelope.
    masterLimiter.attack.value = 0.008;
    // 400 ms: slow enough that gain recovery between notes stops registering
    // as pumping.
    masterLimiter.release.value = 0.40;
} catch { /* ignore */ }
const masterSoftClip = audioCtx.createWaveShaper();
(() => {
    const N = 4096, curve = new Float32Array(N);
    const KNEE = 0.85, RANGE = 0.145; // ceiling = KNEE + RANGE = 0.995
    for (let i = 0; i < N; i++) {
        const x = (i / (N - 1)) * 2 - 1;
        const a = Math.abs(x);
        // Identity below the knee; tanh bend above it with a continuous first
        // derivative at the knee.
        curve[i] = a <= KNEE ? x : Math.sign(x) * (KNEE + RANGE * Math.tanh((a - KNEE) / RANGE));
    }
    masterSoftClip.curve = curve;
    // Oversampling only matters during rare overshoot; skip it on phones where
    // the resampler's audio-thread budget is better spent on voices.
    try { masterSoftClip.oversample = IS_MOBILE_AUDIO ? 'none' : '2x'; } catch { /* ignore */ }
})();
// Phones skip the limiter: with honest per-voice staging it barely engaged,
// and its per-sample envelope math is pure audio-thread cost. The guard curve
// still guarantees no hard clipping.
if (IS_MOBILE_AUDIO) {
    masterGain.connect(masterSoftClip);
} else {
    masterGain.connect(masterLimiter);
    masterLimiter.connect(masterSoftClip);
}
masterSoftClip.connect(audioCtx.destination);

export function resumeIfSuspended(): void {
    if (audioCtx.state === 'suspended') audioCtx.resume();
}

// ---- Reverb send ----
// Room impulse: noise through a one-pole lowpass whose cutoff keeps falling as
// the tail decays (a real room absorbs highs faster than lows), under an
// exponential envelope, after a short pre-delay that keeps the wash off the
// attack. The old full-scale white-noise impulse added a fizzy, grainy wash
// that sounded like crackle. 1.4 s keeps a natural piano space while costing
// ~30% less than 2.2 s (convolution is the single most expensive node here).
// The impulse is L2-normalised by hand instead of ConvolverNode.normalize,
// which keys off power and made this damped tail louder — pushing the
// soft-clip into audible saturation. Shaping and loudness stay independent.
export let reverbNode: ConvolverNode | null = null;
export let reverbGain: GainNode | null = null;

export function buildReverb(): void {
    if (reverbNode) return;
    const sr = audioCtx.sampleRate;
    const len = Math.floor(sr * 1.4);
    const pre = Math.floor(sr * 0.012);
    const buf = audioCtx.createBuffer(2, len, sr);
    for (let c = 0; c < 2; c++) {
        const d = buf.getChannelData(c);
        let lp = 0, energy = 0;
        for (let i = pre; i < len; i++) {
            const t = (i - pre) / (len - pre);
            lp += (0.34 - 0.28 * t) * ((Math.random() * 2 - 1) - lp);
            d[i] = lp * Math.exp(-6.2 * t);
            energy += d[i] * d[i];
        }
        const norm = energy > 0 ? 1 / Math.sqrt(energy) : 1;
        for (let i = pre; i < len; i++) d[i] *= norm;
    }
    reverbNode = audioCtx.createConvolver();
    reverbNode.normalize = false;
    reverbNode.buffer = buf;
    reverbGain = audioCtx.createGain(); reverbGain.gain.value = 0.65;
    reverbNode.connect(reverbGain); reverbGain.connect(masterGain);
}

// Both layers at 0% reverb: tear the convolver down instead of leaving it
// wired into the master chain costing audio-thread time for the rest of the
// session. playSfBuffer rebuilds it lazily when a voice needs it again.
export function teardownReverb(): void {
    if (!reverbNode) return;
    try { reverbNode.disconnect(); } catch { /* ignore */ }
    try { if (reverbGain) reverbGain.disconnect(); } catch { /* ignore */ }
    reverbNode = null;
    reverbGain = null;
}
