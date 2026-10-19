// Auto Velocity engine — humanized dynamics for velocity-less input (QWERTY /
// mouse / touch). Port of js/shared/auto-velocity.js. Only the harmonic
// context (which notes are sounding, what chord they imply) is supplied by
// the caller per note — see chordContext() in autoVelocity.ts.
//
// Three modes:
//  · arpeggio — notes read as a broken-chord/melodic line. Chord tones are
//    weighted by harmonic function (root/5th anchor, 3rd/7th colour,
//    extensions furthest), plus a melodic contour arc (ascending run
//    crescendos, descending diminuendos) and a leap accent.
//  · block    — notes read as a simultaneous chord: top (melody) voice
//    loudest, bottom (bass) fairly present, inner voices recede.
//  · mix      — classifies each gesture by onset timing and dispatches to
//    whichever of the two models fits.
// Harmonic tension (tritone or raised 5th) gets a small extra push in both.

export type AutoVelMode = 'arpeggio' | 'block' | 'mix';

export interface ChordInfo {
    root: number;       // 0-11 pitch class
    pcs: Set<number>;   // pitch classes relative to root
}

export interface VelocityContext {
    chordInfo: ChordInfo | null;
    gestureNotes: number[] | null;
}

const CFG = {
    base: 0.70, min: 0.38, max: 0.99,
    chordMs: 40,        // onsets closer than this read as one simultaneous gesture
    phraseGapMs: 800,   // silence that starts a new phrase
    runMs: 130,         // inter-onset gap that reads as a fast run/arpeggio
    rootFifthBoost: 0.10,
    colorToneDip: 0.07,
    extensionDip: 0.04,
    contourBase: 0.03, contourPerNote: 0.014, contourMax: 0.11,
    leapBoost: 0.07,
    melodyBoost: 0.17,
    bassBoost: 0.10,
    innerDip: 0.10,
    tensionBoost: 0.055,
};

const STATE = {
    mode: 'mix' as AutoVelMode,
    lastTime: -1e9, lastMidi: -1, lastVel: CFG.base,
    phraseNotes: 0,
    runDir: 0, runLen: 0,
    drift: 0,
};

export function setMode(mode: string): void {
    if (mode === 'arpeggio' || mode === 'block' || mode === 'mix') STATE.mode = mode;
}
export function getMode(): AutoVelMode {
    return STATE.mode;
}

export function reset(): void {
    STATE.lastTime = -1e9; STATE.lastMidi = -1; STATE.lastVel = CFG.base;
    STATE.phraseNotes = 0; STATE.runDir = 0; STATE.runLen = 0; STATE.drift = 0;
}

// Shared per-note groundwork: slow correlated drift, phrase arch, and a slight
// register tilt. Same for every mode — the "human" layer underneath.
// Returns v; the onset gap is left in humanGap to avoid a per-note allocation.
let humanGap = 0;
function humanBase(midi: number, now: number): number {
    const s = STATE;
    const gap = now - s.lastTime;
    humanGap = gap;
    if (gap > CFG.phraseGapMs) { s.phraseNotes = 0; s.runDir = 0; s.runLen = 0; }
    s.phraseNotes++;
    s.drift = Math.max(-0.06, Math.min(0.06, s.drift + (Math.random() - 0.5) * 0.022));
    let v = CFG.base + s.drift;
    v += Math.sin(Math.min(1, s.phraseNotes / 16) * Math.PI) * 0.05;
    v += Math.max(-0.05, Math.min(0.06, (midi - 62) * 0.0022));
    return v;
}

function roleWeight(midi: number, chordInfo: ChordInfo | null): number {
    if (!chordInfo) return 0;
    const iv = ((midi - chordInfo.root) % 12 + 12) % 12;
    if (iv === 0 || iv === 7) return CFG.rootFifthBoost;                          // root / 5th
    if (iv === 3 || iv === 4 || iv === 10 || iv === 11) return -CFG.colorToneDip; // 3rd / 7th
    return -CFG.extensionDip;                                                     // 9th/11th/13th/etc
}

// Tension = a tritone relative to the root (dominant/diminished function) or
// a raised 5th (augmented).
function tensionFlag(chordInfo: ChordInfo | null): boolean {
    if (!chordInfo) return false;
    const pcs = chordInfo.pcs;
    const hasTritone = pcs.has(6);
    const dom7 = pcs.has(4) && pcs.has(10);
    const dim = pcs.has(3) && pcs.has(6);
    const aug = pcs.has(4) && pcs.has(8);
    return hasTritone || dom7 || dim || aug;
}

function velocityArpeggio(midi: number, now: number, chordInfo: ChordInfo | null): number {
    const s = STATE;
    let v = humanBase(midi, now);
    const gap = humanGap;
    v += roleWeight(midi, chordInfo);
    if (tensionFlag(chordInfo)) v += CFG.tensionBoost;

    const interval = s.lastMidi >= 0 ? midi - s.lastMidi : 0;
    if (Math.abs(interval) >= 7) v += Math.min(CFG.leapBoost, (Math.abs(interval) - 6) * 0.01);

    if (gap < CFG.runMs && interval !== 0) {
        // The longer a directional run goes, the more it leans into its own
        // direction.
        const dir = interval > 0 ? 1 : -1;
        s.runLen = (dir === s.runDir) ? s.runLen + 1 : 1;
        s.runDir = dir;
        v += dir * Math.min(CFG.contourMax, CFG.contourBase + s.runLen * CFG.contourPerNote);
    } else { s.runDir = 0; s.runLen = 0; }

    if (interval === 0 && s.lastMidi === midi && gap < 450) v = Math.min(v, Math.max(0.52, s.lastVel - 0.03));

    v += (Math.random() + Math.random() - 1) * 0.022;
    v = Math.max(CFG.min, Math.min(CFG.max, v));
    s.lastTime = now; s.lastMidi = midi; s.lastVel = v;
    return v;
}

// gestureNotes = sorted MIDI array of the notes known so far to be part of
// this simultaneous chord (including the note being voiced now).
function velocityBlock(midi: number, now: number, chordInfo: ChordInfo | null, gestureNotes: number[] | null): number {
    let v = humanBase(midi, now);
    if (gestureNotes && gestureNotes.length >= 2) {
        const top = gestureNotes[gestureNotes.length - 1];
        const bottom = gestureNotes[0];
        if (midi === top) v += CFG.melodyBoost;
        else if (midi === bottom) v += CFG.bassBoost;
        else v -= CFG.innerDip;
    }
    if (tensionFlag(chordInfo)) v += CFG.tensionBoost;
    v += (Math.random() + Math.random() - 1) * 0.02;
    v = Math.max(CFG.min, Math.min(CFG.max, v));
    STATE.lastTime = now; STATE.lastMidi = midi; STATE.lastVel = v;
    return v;
}

export function velocityFor(midi: number, opts?: Partial<VelocityContext>): number {
    const chordInfo = (opts && opts.chordInfo) || null;
    const gestureNotes = (opts && opts.gestureNotes) || null;
    const now = performance.now();
    const mode = STATE.mode;
    if (mode === 'block') return velocityBlock(midi, now, chordInfo, gestureNotes);
    if (mode === 'arpeggio') return velocityArpeggio(midi, now, chordInfo);
    // mix: onset-gap gesture classification.
    const gap = now - STATE.lastTime;
    const looksLikeBlock = gap <= CFG.chordMs && gestureNotes && gestureNotes.length >= 2;
    return looksLikeBlock ? velocityBlock(midi, now, chordInfo, gestureNotes)
        : velocityArpeggio(midi, now, chordInfo);
}
