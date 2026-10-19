// Voice engine: layer buffers, playSfBuffer, the voice pool, release
// profiles, playNote/stopNote/stopAllNotes and sustain-tail bookkeeping.

import { audioCtx, IS_MOBILE_AUDIO, masterGain, reverbNode, buildReverb } from './context.js';
import { audio, STRING_FADE_DEFAULT } from './state.js';
import { getBurstLevel } from './burst.js';
import { updateVelocityMeter } from './velocityMeter.js';
import type { SfBufferMap, SfEntry } from './sf2.js';

export type Layer = 'piano' | 'string';

// ---- Note names ----
const NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
export function midiNoteToName(midi: number): string {
    const oct = Math.floor(midi / 12) - 1;
    return NAMES[midi % 12] + oct;
}
const NOTE_NAME_TABLE: string[] = [];
for (let m = 0; m < 128; m++) NOTE_NAME_TABLE[m] = midiNoteToName(m);
function noteNameFor(midi: number): string {
    return midi >= 0 && midi < 128 ? NOTE_NAME_TABLE[midi] : midiNoteToName(midi);
}

// ---- Layer buffers + decoded-soundfont cache ----
let sfBuffers: SfBufferMap = {};
let stringBuffers: SfBufferMap = {};
let loadedSfKey: string | null = null;
let stringLoadedSfKey: string | null = null;

// A decoded piano SF2 holds ~100-190 MB of Float32 PCM. Phones keep only the
// active font (memory pressure surfaces as audio crackle); desktop keeps a
// small convenience cache.
const MAX_CACHED_SOUNDFONTS = IS_MOBILE_AUDIO ? 1 : 4;
export const soundfontBufferCache = new Map<string, SfBufferMap>();

export function countBufferMap(buffers: SfBufferMap | null | undefined): number {
    return Object.keys(buffers || {}).length;
}
function cloneBufferMap(buffers: SfBufferMap | null | undefined): SfBufferMap {
    return Object.assign({}, buffers || {});
}
export function getLayerBuffers(layer: Layer): SfBufferMap {
    return layer === 'string' ? stringBuffers : sfBuffers;
}
export function setLayerBuffers(layer: Layer, buffers: SfBufferMap, sfKey: string | null): void {
    if (layer === 'string') {
        stringBuffers = cloneBufferMap(buffers);
        stringLoadedSfKey = sfKey;
    } else {
        sfBuffers = cloneBufferMap(buffers);
        loadedSfKey = sfKey;
    }
}
export function getLoadedKey(layer: Layer): string | null {
    return layer === 'string' ? stringLoadedSfKey : loadedSfKey;
}
export function cacheSoundfontBuffers(sfKey: string, buffers: SfBufferMap): void {
    if (!sfKey || !buffers || countBufferMap(buffers) === 0) return;
    if (soundfontBufferCache.has(sfKey)) soundfontBufferCache.delete(sfKey);
    soundfontBufferCache.set(sfKey, cloneBufferMap(buffers));
    while (soundfontBufferCache.size > MAX_CACHED_SOUNDFONTS) {
        const oldestKey = soundfontBufferCache.keys().next().value as string;
        soundfontBufferCache.delete(oldestKey);
    }
}
export function useCachedSoundfont(sfKey: string, layer: Layer = 'piano'): boolean {
    const cached = soundfontBufferCache.get(sfKey);
    if (!cached) return false;
    soundfontBufferCache.delete(sfKey);
    soundfontBufferCache.set(sfKey, cached);
    setLayerBuffers(layer, cached, sfKey);
    return countBufferMap(getLayerBuffers(layer)) > 0;
}
function hasLayerBuffers(layer: Layer): boolean {
    const loadedKey = layer === 'string' ? stringLoadedSfKey : loadedSfKey;
    const buffers = layer === 'string' ? stringBuffers : sfBuffers;
    return !!loadedKey && !!buffers && Object.keys(buffers).length > 0;
}

// ---- Gain laws ----
// Perceptual velocity curve: quadratic amplitude (~ the SF2/FluidSynth
// convention) gives ~24 dB between pp and ff with ff at full level; the
// small floor keeps pianissimo audible on phone speakers.
export function velocityGain(vel: number): number {
    const v = Math.max(0, Math.min(1, vel || 0.8));
    return 0.06 + 0.94 * v * v;
}

// Fader law for the Main / Layer Volume sliders: a square law, like a mixing
// console fader. -12 dB at the midpoint ~ half perceived loudness; full scale
// stays exactly 1.0.
export function volumeGain(t: number): number {
    const c = Math.max(0, Math.min(1, t));
    if (c <= 0) return 0;
    return c * c;
}

// Per-preset output trim. Measured on one identical passage the packaged
// piano presets spread over 10 dB RMS; trimming each to a common RMS target
// collapses that to 0.6 dB with no clipped samples. Presets not listed
// (strings, orchestral, other) stay at unity — they were not measured, and
// several sustain indefinitely, so a piano-derived target wouldn't fit.
const SF_LEVEL_TRIM: Record<string, number> = {
    grandPiano: 1.35,
    salamander: 1.86,
    atmosGrand: 1.35,
    pfBright: 0.77,
    pfSoft: 0.91,
    pfEPiano: 0.47,
};
export function sfLevelTrim(sfKey: string): number {
    const t = SF_LEVEL_TRIM[sfKey];
    return (typeof t === 'number' && t > 0) ? t : 1;
}

// ---- Voices ----
interface Voice {
    key: number;
    layer: Layer;
    fadeSec: number;
    masterGain: GainNode;
    filterNode: BiquadFilterNode | null;
    sendGain: GainNode | null;
    released: boolean;
    sfSrc: AudioBufferSourceNode;
    startedAt: number;
    silentAt: number;
    naturalEndAt: number;
    ended: boolean;
}

/** Active voice per key. String-layer keys are offset so both layers share one map. */
const STRING_KEY_OFFSET = 1000;
const activeNotes = new Map<number, Voice>();
let activeVoices: Voice[] = [];

// Strings double the voice count and their tails ring for the whole fade.
// Each extra stereo voice costs ~0.39 ms CPU per second of audio, so desktop
// runs 76 (enforced for real by stealVoice). Phones underrun well before
// that: 40 matches the web pianos that stay glitch-free on phones.
const MAX_ACTIVE_VOICES = IS_MOBILE_AUDIO ? 40 : 76;
const MAX_RELEASE_SECONDS = 18.00;
// Safety net for looped presets with no natural end: if a note-off is ever
// lost, nothing else would silence a looped voice. A real release's stop()
// always reschedules earlier.
const LOOPED_VOICE_SAFETY_MAX_SECONDS = 45.00;
const PIANO_MIN_RELEASE_TC = 0.22;
// The release is an exponential with the TC above, so the source must live
// ~7 time constants before stop() lands below -60 dB; stopping earlier is an
// audible chop on pedal-up.
const PIANO_MIN_RELEASE_DELAY = 1.60;
const STRING_VEL_SCALE = 0.82;   // strings sit slightly under the piano
// Reclaiming a voice fades it instead of slamming it; the stop lands ~8 time
// constants after the fade starts (-70 dB) while keeping the zombie-source
// window short enough not to overshoot the pool on phones.
const VOICE_STEAL_TC = 0.05;
const VOICE_STEAL_DELAY = 0.40;

function isStringVoice(v: Voice | undefined): boolean {
    return !!v && v.layer === 'string';
}

// ---- Sustain tails ----
// Voices whose release was scheduled with a long sustain-driven decay, so
// turning sustain off can cut them short. A key maps to a LIST of tails: a
// key re-struck under the pedal leaves its previous tail ringing on purpose,
// and a one-voice map silently forgot every tail but the newest.
const sustainTailVoices = new Map<number, Voice[]>();
/** Piano keys whose MIDI note-off arrived while the MIDI pedal was down. */
export const midiPedalHeldNotes = new Set<number>();

function trackSustainTail(key: number, voice: Voice): void {
    let list = sustainTailVoices.get(key);
    if (!list) { list = []; sustainTailVoices.set(key, list); }
    // Drop finished tails first so a repeatedly re-struck key can't grow the
    // list without bound.
    for (let i = list.length - 1; i >= 0; i--) if (!list[i] || list[i].ended) list.splice(i, 1);
    if (list.indexOf(voice) === -1) list.push(voice);
}
function forgetSustainTail(key: number, voice?: Voice): void {
    if (voice === undefined) { sustainTailVoices.delete(key); return; }
    const list = sustainTailVoices.get(key);
    if (!list) return;
    const i = list.indexOf(voice);
    if (i !== -1) list.splice(i, 1);
    if (!list.length) sustainTailVoices.delete(key);
}

export function isAnySustainActive(): boolean {
    return audio.manualSustainEnabled || audio.midiSustainPedalDown || audio.spaceSustainHeld;
}
function getActivePianoSustain(): number {
    return isAnySustainActive() ? Math.max(0, Math.min(1, audio.sustainLevel || 0)) : 0;
}

export function releaseMidiPedalHeldNotes(when?: number): void {
    if (midiPedalHeldNotes.size) {
        const notes = Array.from(midiPedalHeldNotes);
        midiPedalHeldNotes.clear();
        for (const note of notes) stopNote(note, false, when);
    }
    if (sustainTailVoices.size) {
        const voices: Voice[] = [];
        sustainTailVoices.forEach(list => { for (let i = 0; i < list.length; i++) voices.push(list[i]); });
        sustainTailVoices.clear();
        const quick = getReleaseProfile(false, 0);
        for (const voice of voices) forceQuickStop(voice, quick.tc, quick.delay);
    }
}

// ---- playSfBuffer ----
function playSfBuffer(soundMidi: number, vel: number, key: number, layer: Layer, when?: number): boolean {
    // Boot gate: buffers may be half-built while the loader is visible.
    if (!audio.stageReady) return false;
    const entry: SfEntry | undefined = getLayerBuffers(layer)[noteNameFor(soundMidi)];
    if (!entry) return false;
    const buf = entry.buffer;
    const src = audioCtx.createBufferSource();
    src.buffer = buf;
    if (entry.rate && entry.rate !== 1) src.playbackRate.value = entry.rate;
    // Looped zones sustain indefinitely while held; the release envelope
    // still shapes the tail on note-off.
    if (entry.loop) {
        src.loop = true;
        src.loopStart = entry.loopStart!;
        src.loopEnd = entry.loopEnd!;
    }
    const gainNode = audioCtx.createGain();
    const isString = layer === 'string';
    const fx = isString ? audio.sfEffectSettings.sf2 : audio.sfEffectSettings.sf1;
    const volume = volumeGain(isString ? audio.stringVolume : audio.pianoVolume);
    // Per-voice ceiling: an ff piano note peaks just under full scale before
    // the master headroom, so a single note never needs the limiter.
    const layerBoost = isString ? 0.7 : 1.15;
    // `when` (audio-clock seconds) allows sample-accurate scheduled onsets.
    const now = Math.max(audioCtx.currentTime, when || 0);
    const trim = sfLevelTrim(isString ? audio.currentStringSf : audio.currentSf);
    const peak = Math.max(0.0002, velocityGain(vel) * layerBoost * volume * (entry.gainMul || 1) * trim);
    // Tiny attack ramp: a hard step on the first sample is an audible click.
    gainNode.gain.setValueAtTime(0.0001, now);
    gainNode.gain.linearRampToValueAtTime(peak, now + 0.006);
    let envSilentAt = 0;
    let voiceNaturalEndAt = Infinity;
    if (entry.env) {
        // SF2 volume envelope: hold at peak, then decay toward sustain. SF2
        // decay is linear-in-dB over 100 dB = exponential in amplitude, so
        // setTargetAtTime with tc = decaySec * 8.686/100 reproduces it.
        const holdEnd = now + 0.006 + entry.env.holdSec;
        const decayTc = Math.max(0.05, entry.env.decaySec * 0.08686);
        gainNode.gain.setTargetAtTime(Math.max(0.0001, peak * entry.env.susLin), holdEnd, decayTc);
        // Past hold + 6.9 tc the voice is below -60 dB, so enforceVoiceLimit
        // may lazily reclaim it.
        if (entry.env.susLin < 0.001) envSilentAt = holdEnd + decayTc * 6.9 + 0.25;
    }
    // A non-looped sample can never ring past its own length. Without a
    // scheduled fade the source just runs out of PCM mid-waveform (a click
    // plus the note vanishing) — every treble note is a short recording.
    // A real release overrides this via cancelScheduledValues.
    if (!entry.loop) {
        const naturalDurSec = buf.duration / (entry.rate || 1);
        voiceNaturalEndAt = now + naturalDurSec;
        const fadeLead = Math.min(0.6, Math.max(0.05, naturalDurSec * 0.08));
        const fadeStartAt = Math.max(now + 0.02, voiceNaturalEndAt - fadeLead);
        gainNode.gain.setTargetAtTime(0.0001, fadeStartAt, fadeLead / 5);
    }
    // SF2-authored lowpass: without it the raw sample plays brighter/harsher
    // than the preset author intended. Kept on the voice so the whole chain
    // can be unwired when the source ends.
    let filterNode: BiquadFilterNode | null = null;
    let sendGain: GainNode | null = null;
    if (entry.filterHz) {
        filterNode = audioCtx.createBiquadFilter();
        filterNode.type = 'lowpass';
        filterNode.frequency.value = entry.filterHz;
        filterNode.Q.value = entry.filterQ || 0.707;
        src.connect(filterNode);
        filterNode.connect(gainNode);
    } else {
        src.connect(gainNode);
    }
    gainNode.connect(masterGain);
    if ((fx.reverb || 0) > 0) {
        if (!reverbNode) buildReverb();
        if (reverbNode) {
            sendGain = audioCtx.createGain();
            sendGain.gain.value = Math.min(0.85, Math.max(0, fx.reverb * 0.85));
            gainNode.connect(sendGain);
            sendGain.connect(reverbNode);
        }
    }
    const voice: Voice = {
        key,
        layer,
        fadeSec: isString ? (audio.sfEffectSettings.sf2.fadeSec || STRING_FADE_DEFAULT) : 0,
        masterGain: gainNode,
        filterNode,
        sendGain,
        released: false,
        sfSrc: src,
        startedAt: now,
        silentAt: envSilentAt,
        naturalEndAt: voiceNaturalEndAt,
        ended: false,
    };
    src.onended = () => cleanupVoiceRef(voice);
    src.start(now);
    if (entry.loop) { try { src.stop(now + LOOPED_VOICE_SAFETY_MAX_SECONDS); } catch { /* ignore */ } }
    activeNotes.set(key, voice);
    activeVoices.push(voice);
    enforceVoiceLimit();
    return true;
}

// Unwire a finished voice: connected nodes are summed on the audio thread
// every render quantum until GC, which accumulates over a long session.
function disconnectVoiceNodes(voice: Voice): void {
    try { voice.sfSrc.disconnect(); } catch { /* ignore */ }
    try { if (voice.filterNode) voice.filterNode.disconnect(); } catch { /* ignore */ }
    try { if (voice.sendGain) voice.sendGain.disconnect(); } catch { /* ignore */ }
    try { voice.masterGain.disconnect(); } catch { /* ignore */ }
}
function cleanupVoiceRef(voice: Voice): void {
    voice.ended = true;
    disconnectVoiceNodes(voice);
    if (activeNotes.get(voice.key) === voice) activeNotes.delete(voice.key);
    forgetSustainTail(voice.key, voice);
}

// Retroactively shortens a voice mid-flight, bypassing releaseVoice's
// one-shot guard. Used when sustain toggles off and for stealing.
function forceQuickStop(voice: Voice, tc: number, delay: number): void {
    if (!voice || voice.ended) return;
    const now = audioCtx.currentTime;
    try {
        const g = voice.masterGain.gain;
        g.cancelScheduledValues(now);
        g.setValueAtTime(g.value, now);
        g.setTargetAtTime(0.0001, now, tc);
    } catch { /* ignore */ }
    try { voice.sfSrc.stop(now + delay); } catch { /* ignore */ }
}

function releaseVoice(voice: Voice, releaseTC?: number, stopDelay?: number, when?: number): void {
    if (!voice || voice.released) return;
    voice.released = true;
    const now = audioCtx.currentTime;
    const tc = Math.max(0.012, releaseTC ?? 0.08);
    let delay = Math.max(0.05, Math.min(stopDelay ?? 0.3, MAX_RELEASE_SECONDS));
    // Never let a scheduled release land inside the 6 ms attack ramp —
    // cancelScheduledValues would erase the ramp and the note stays silent.
    let t = Math.max(now, when || 0);
    if (voice.startedAt) t = Math.max(t, voice.startedAt + 0.03);
    // Cap the DURATION of the ring at what a one-shot buffer can supply, but
    // never compress the decay CURVE into that window (that double-decays the
    // recording's own natural decay and flattens the sustain gradation).
    let clampedToNaturalEnd = false;
    if (Number.isFinite(voice.naturalEndAt)) {
        const maxDelay = Math.max(0.05, voice.naturalEndAt - t - 0.05);
        if (delay > maxDelay) {
            delay = maxDelay;
            clampedToNaturalEnd = true;
        }
    }
    try {
        const g = voice.masterGain.gain;
        if (t > now + 0.001) {
            // Future point: setTargetAtTime starts from the surviving
            // automation at `t`, so no value pin is needed (or possible).
            g.cancelScheduledValues(t);
            g.setTargetAtTime(0.0001, t, tc);
        } else {
            g.cancelScheduledValues(now);
            const currentGain = g.value;
            g.setValueAtTime(currentGain, now);
            g.setTargetAtTime(0.0001, now, tc);
        }
        // Click safety: cancelScheduledValues erased playSfBuffer's
        // pre-emptive end fade, so guarantee the gain reaches zero right
        // before stop() lands whatever tc and the sample do.
        if (clampedToNaturalEnd) {
            const tailLead = Math.min(0.25, Math.max(0.04, delay * 0.12));
            const tailAt = Math.max(t + 0.005, t + delay - tailLead);
            g.setTargetAtTime(0.0001, tailAt, tailLead / 5);
        }
    } catch { /* ignore */ }
    try { voice.sfSrc.stop(t + delay); } catch { setTimeout(() => cleanupVoiceRef(voice), Math.ceil((t - now + delay) * 1000) + 120); }
}

// Reclaiming a voice has to actually shorten the SOUND: releaseVoice is
// one-shot, so already-released victims go through forceQuickStop, otherwise
// the cap bounds the bookkeeping but not the live source count (the crackle).
function stealVoice(voice: Voice): void {
    if (!voice || voice.ended) return;
    if (voice.released) forceQuickStop(voice, VOICE_STEAL_TC, VOICE_STEAL_DELAY);
    else releaseVoice(voice, VOICE_STEAL_TC, VOICE_STEAL_DELAY);
}
// How audible a voice still is: current gain (attack, SF2 decay, in-flight
// release) times an age term standing in for the decay recorded inside the
// sample (~5 s amplitude time constant of a struck string).
function voiceAudibility(voice: Voice, now: number): number {
    let g = 1;
    try { g = Math.max(0, voice.masterGain.gain.value); } catch { g = 1; }
    const age = Math.max(0, now - (voice.startedAt || now));
    return g * Math.exp(-age / 5);
}

function enforceVoiceLimit(): void {
    const sweepNow = audioCtx.currentTime;
    let w = 0;
    for (let i = 0; i < activeVoices.length; i++) {
        const v = activeVoices[i];
        if (!v || v.ended) continue;
        // Lazy reclaim: a voice whose SF2 envelope decayed below -60 dB is
        // inaudible even if the key/pedal still holds it.
        if (v.silentAt && !v.released && sweepNow >= v.silentAt) releaseVoice(v, 0.05, 0.12);
        activeVoices[w++] = v;
    }
    activeVoices.length = w;
    const pianoSustainActive = (audio.manualSustainEnabled || audio.midiSustainPedalDown) && getActivePianoSustain() > 0.01;
    // The string layer runs its own multi-second fade regardless of pedal and
    // doubles the voice count, so it counts as an extended tail too.
    const extendedTailActive = pianoSustainActive || audio.stringEnabled;
    const burst = getBurstLevel();
    // Fast passages with long tails are the highest audio-thread load. Scale
    // the ceiling with burst intensity: full pool at burst 11 down to a
    // 70% (phones 45%) floor at burst 18. Real enforcement (stealVoice) does
    // the rest, so the floor stays high enough not to delete a pedalled
    // glissando.
    let burstLimit = MAX_ACTIVE_VOICES;
    if (burst > 11 && extendedTailActive) {
        const intensity = Math.min(1, (burst - 11) / 7); // 0 at 11, 1 at 18 (max)
        const floorFrac = IS_MOBILE_AUDIO ? 0.45 : 0.70;
        const frac = 1 - intensity * (1 - floorFrac);
        burstLimit = Math.max(12, Math.round(MAX_ACTIVE_VOICES * frac));
    } else if (burst > 11) {
        burstLimit = Math.max(34, MAX_ACTIVE_VOICES - 4);
    }
    if (activeVoices.length <= burstLimit) return;

    const needKill = activeVoices.length - burstLimit;
    let killed = 0;
    // Victim priority, least-audible first within each tier:
    //   pass 0: already-released voices
    //   pass 1: still-held piano voices
    //   pass 2: still-held string voices (protected last)
    for (let pass = 0; pass < 3 && killed < needKill; pass++) {
        let victimIndex = -1;
        let victimScore = Infinity;
        for (let i = 0; i < activeVoices.length; i++) {
            const v = activeVoices[i];
            if (!v || v.ended) continue;
            if (pass === 0 && !v.released) continue;
            if (pass === 1 && (v.released || isStringVoice(v))) continue;
            if (pass === 2 && v.released) continue;
            // Never steal a voice still inside its attack ramp: its gain still
            // reads ~0.0001, so it would score as the quietest in the pool.
            if (!v.released && sweepNow - (v.startedAt || sweepNow) < 0.03) continue;
            const score = voiceAudibility(v, sweepNow);
            if (score < victimScore) { victimScore = score; victimIndex = i; }
        }
        if (victimIndex < 0) continue;
        stealVoice(activeVoices[victimIndex]);
        activeVoices[victimIndex].ended = true;
        killed++;
        pass = -1;
    }
    w = 0;
    for (let i = 0; i < activeVoices.length; i++) {
        const v = activeVoices[i];
        if (v && !v.ended) activeVoices[w++] = v;
    }
    activeVoices.length = w;
}

// ---- Release profiles ----
export interface ReleaseProfile { tc: number; delay: number }

export function getReleaseProfile(isFastGliss = false, sustainPct: number = audio.sustainLevel): ReleaseProfile {
    if (isFastGliss) return { tc: 0.022, delay: 0.15 };
    const raw = Math.max(0, Math.min(1, sustainPct || 0));
    const pct = Math.pow(raw, 0.78);
    if (pct <= 0.0005) return { tc: PIANO_MIN_RELEASE_TC, delay: PIANO_MIN_RELEASE_DELAY };
    const tc = Math.min(PIANO_MIN_RELEASE_TC + pct * 3.03, 3.25);
    const delay = Math.min(PIANO_MIN_RELEASE_DELAY + pct * 13.95, 14.60);
    return { tc, delay };
}
function getStringFadeProfile(fadeSec: number, isFast = false): ReleaseProfile {
    if (isFast) return { tc: 0.018, delay: 0.12 };
    const sec = Math.max(0.1, Math.min(10.0, Number(fadeSec) || STRING_FADE_DEFAULT));
    return { tc: Math.max(0.018, Math.min(1.15, sec / 5.2)), delay: sec };
}

// Called right before re-striking a key whose previous voice may still ring.
// Under sustain, release it along the sustain curve and let the old tail ring
// under the new strike (damper-up restrike); without sustain the near-instant
// fade keeps fast repeats clean. Layer voices always follow their own Fade.
function fastReleaseActiveKey(key: number, sustainPct: number | undefined, when?: number): void {
    const voice = activeNotes.get(key);
    if (!voice) return;
    const isLayer = isStringVoice(voice);
    const pct = isLayer ? 1 : (sustainPct !== undefined ? sustainPct : getActivePianoSustain());
    if (!voice.released && pct > 0.01) {
        const profile = isLayer
            ? getStringFadeProfile(voice.fadeSec, false)
            : getReleaseProfile(false, pct);
        releaseVoice(voice, profile.tc, profile.delay, when);
        // Layer voices are never sustain tails.
        if (isLayer) forgetSustainTail(key); else trackSustainTail(key, voice);
    } else {
        releaseVoice(voice, 0.014, 0.10, when);
        forgetSustainTail(key);
    }
    activeNotes.delete(key);
}

// ---- String layer range ----
const STRING_TUTS_MIN = 1;
const STRING_TUTS_MAX = 88;
const STRING_TUTS_MIDI_OFFSET = 20;
export { STRING_TUTS_MIN, STRING_TUTS_MAX };

export function clampStringTuts(value: unknown, fallback: number): number {
    const parsed = Math.round(Number(value));
    const safe = Number.isFinite(parsed) ? parsed : fallback;
    return Math.max(STRING_TUTS_MIN, Math.min(STRING_TUTS_MAX, safe));
}
export function midiToTuts(midi: unknown): number {
    return clampStringTuts((Number(midi) || 0) - STRING_TUTS_MIDI_OFFSET, 1);
}
export function tutsToMidi(tuts: unknown): number {
    return clampStringTuts(tuts, 1) + STRING_TUTS_MIDI_OFFSET;
}
export function clampStringRange(): void {
    let leftTuts = midiToTuts(audio.stringRangeLeft || 21);
    let rightTuts = midiToTuts(audio.stringRangeRight || 108);
    if (leftTuts > rightTuts) {
        const swap = leftTuts;
        leftTuts = rightTuts;
        rightTuts = swap;
    }
    audio.stringRangeLeft = tutsToMidi(leftTuts);
    audio.stringRangeRight = tutsToMidi(rightTuts);
}
function isMidiInStringRange(midi: number): boolean {
    clampStringRange();
    return midi >= audio.stringRangeLeft && midi <= audio.stringRangeRight;
}

// Independent semitone shift for the layer soundfont only (pads often sit an
// octave below the piano register), clamped like the main transpose.
export function getStringTranspose(): number {
    const sf2 = audio.sfEffectSettings.sf2;
    if (!sf2) return 0;
    return Math.max(-12, Math.min(12, Math.round(Number(sf2.transpose) || 0)));
}

// ---- Public note API ----
/**
 * Starts `midi` (the key) sounding at midi + transposeVal. Voices are keyed by
 * the key, not the sounding pitch, so stopNote(midi) always finds them.
 */
export function playNote(midi: number, transposeVal: number, velocity?: number, when?: number): void {
    const vel = velocity !== undefined ? velocity : 0.8;
    updateVelocityMeter(vel);
    const soundMidi = midi + (transposeVal || 0);
    fastReleaseActiveKey(midi, undefined, when);
    if (hasLayerBuffers('piano')) playSfBuffer(soundMidi, vel, midi, 'piano', when);
    if (audio.stringEnabled && isMidiInStringRange(midi) && hasLayerBuffers('string')) {
        fastReleaseActiveKey(STRING_KEY_OFFSET + midi, undefined, when);
        playSfBuffer(soundMidi + getStringTranspose(), vel * STRING_VEL_SCALE, STRING_KEY_OFFSET + midi, 'string', when);
    }
}

/**
 * `layer`, when given, restricts the release to one layer — used by the MIDI
 * pedal path so the piano voice can be parked by CC64 while the layer voice
 * still releases on its own Fade immediately.
 */
export function stopNote(midi: number, fast = false, when?: number, layer?: Layer): void {
    if (!layer || layer === 'piano') stopKey(midi, fast, when);
    if (!layer || layer === 'string') stopKey(STRING_KEY_OFFSET + midi, fast, when);
}
function stopKey(key: number, fast: boolean, when?: number): void {
    const voice = activeNotes.get(key);
    if (!voice) return;
    let profile: ReleaseProfile;
    let sustainDriven: boolean;
    if (voice.layer === 'string') {
        // The layer is governed by its own Fade setting and nothing else
        // (following the pedal let it outlive the piano by seconds). `fast`
        // is the glissando voice-pool guard and stays unconditional.
        profile = getStringFadeProfile(voice.fadeSec, !!fast);
        sustainDriven = false;
    } else {
        const activeSustain = getActivePianoSustain();
        // Sustain wins over a glissando's fast-release request.
        const effFast = !!fast && activeSustain <= 0.01;
        profile = getReleaseProfile(effFast, activeSustain);
        sustainDriven = !effFast && activeSustain > 0.01;
    }
    releaseVoice(voice, profile.tc, profile.delay, when);
    activeNotes.delete(key);
    // Track sustain-driven tails so turning sustain off can cut them short.
    if (sustainDriven) trackSustainTail(key, voice);
    else forgetSustainTail(key);
}

/** Releases every voice quickly (audio only). */
export function stopAllVoices(): void {
    activeNotes.forEach(voice => releaseVoice(voice, 0.020, 0.14));
    activeNotes.clear();
    for (const voice of activeVoices) releaseVoice(voice, 0.020, 0.14);
    activeVoices = [];
    sustainTailVoices.clear();
}

/** Releases string-layer voices when the layer is switched off. */
export function releaseStringVoices(): void {
    activeNotes.forEach((voice, key) => {
        if (voice.layer === 'string') {
            releaseVoice(voice, 0.014, 0.10);
            activeNotes.delete(key);
        }
    });
}

/** Drops a layer's buffers (custom SF2 unloaded). */
export function clearLayer(layer: Layer): void {
    if (layer === 'string') { stringBuffers = {}; stringLoadedSfKey = null; }
    else { sfBuffers = {}; loadedSfKey = null; }
}
