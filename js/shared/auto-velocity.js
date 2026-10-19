// Papiano Auto Velocity engine — humanized dynamics for velocity-less input
// (QWERTY / mouse / touch). Shared across Solo, Multiplayer, Learn Song, and
// Visualizer instead of four independent copies, since the shaping math is
// identical everywhere; only the harmonic context (which notes are currently
// sounding, and what chord they imply) is engine-local, because chord
// detection (matchChords/CHORD_DB, pressStartTimes) already lives separately
// in each engine file. Callers build that context and pass it in per note —
// see _autoVelChordContext() in each engine file.
//
// Three selectable modes instead of one blended heuristic:
//  · arpeggio    — notes read as a broken-chord/melodic line. Chord tones are
//    weighted by harmonic function (root/5th = structural anchor, 3rd/7th =
//    color, 9th/11th/13th = furthest extension — the same skeleton/color/
//    extension hierarchy taught for voicing), plus a real melodic contour
//    arc (ascending run crescendos, descending diminuendos) and a leap
//    accent, instead of a flat ± nudge regardless of shape.
//  · block       — notes read as a simultaneous chord. Classical SATB
//    voicing balance: the top (melody) voice is loudest, the bottom (bass)
//    voice is the harmonic foundation and stays fairly present, inner
//    voices recede — not just "highest note wins, everything else flat."
//  · mix         — classifies each gesture by onset timing (the same
//    chord-vs-run gap heuristic the old single model used) and dispatches
//    to whichever of the two specialist models actually fits, instead of
//    one generic curve trying to cover both cases at once.
// Harmonic tension (dominant/diminished/augmented — anything built on a
// tritone, or a raised 5th) gets a small extra push in both modes: real
// playing leans into a chord that wants to resolve.
(function () {
'use strict';

const CFG = {
    base: 0.70, min: 0.38, max: 0.99,
    chordMs: 40,        // onsets closer than this read as one simultaneous gesture
    phraseGapMs: 800,   // silence that starts a new phrase
    runMs: 130,         // inter-onset gap that reads as a fast run/arpeggio
    rootFifthBoost: 0.10,   // root/5th: harmonic skeleton, lands firm
    colorToneDip: 0.07,     // 3rd/7th: the chord's color, sits back a touch
    extensionDip: 0.04,     // 9th/11th/13th/etc: furthest from the anchor
    contourBase: 0.03, contourPerNote: 0.014, contourMax: 0.11,
    leapBoost: 0.07,
    melodyBoost: 0.17,  // block: top voice (melody)
    bassBoost: 0.10,    // block: bottom voice (harmonic foundation)
    innerDip: 0.10,     // block: middle voices recede
    tensionBoost: 0.055
};

const STATE = {
    mode: 'mix',
    lastTime: -1e9, lastMidi: -1, lastVel: CFG.base,
    phraseNotes: 0,
    runDir: 0, runLen: 0,
    drift: 0
};

function setMode(mode){
    if (mode === 'arpeggio' || mode === 'block' || mode === 'mix') STATE.mode = mode;
}
function getMode(){ return STATE.mode; }

function reset(){
    STATE.lastTime = -1e9; STATE.lastMidi = -1; STATE.lastVel = CFG.base;
    STATE.phraseNotes = 0; STATE.runDir = 0; STATE.runLen = 0; STATE.drift = 0;
}

// Shared per-note groundwork: slow correlated drift, phrase arch (dynamics
// rise into a phrase and settle past its peak), and a slight register tilt
// (treble reads brighter, bass rounder). Same for every mode — this is the
// "human" layer underneath whichever harmonic shaping applies on top.
function _humanBase(midi, now){
    const s = STATE;
    const gap = now - s.lastTime;
    if (gap > CFG.phraseGapMs){ s.phraseNotes = 0; s.runDir = 0; s.runLen = 0; }
    s.phraseNotes++;
    s.drift = Math.max(-0.06, Math.min(0.06, s.drift + (Math.random() - 0.5) * 0.022));
    let v = CFG.base + s.drift;
    v += Math.sin(Math.min(1, s.phraseNotes / 16) * Math.PI) * 0.05;
    v += Math.max(-0.05, Math.min(0.06, (midi - 62) * 0.0022));
    return { v, gap };
}

// chordInfo = { root: 0-11 pitch class, pcs: Set<0-11> } describing the
// harmony implied by the currently-sounding note set, or null if fewer than
// 3 notes are active (no chord to weigh roles against).
function _roleWeight(midi, chordInfo){
    if (!chordInfo) return 0;
    const iv = ((midi - chordInfo.root) % 12 + 12) % 12;
    if (iv === 0 || iv === 7) return CFG.rootFifthBoost;               // root / 5th
    if (iv === 3 || iv === 4 || iv === 10 || iv === 11) return -CFG.colorToneDip; // 3rd / 7th
    return -CFG.extensionDip;                                          // 9th/11th/13th/etc
}

// Tension = a tritone is present relative to the root (dominant or
// diminished function) or the 5th is raised a semitone (augmented) — the
// actual interval content that makes a chord want to resolve, not a chord-
// name string match.
function _tensionFlag(chordInfo){
    if (!chordInfo) return false;
    const pcs = chordInfo.pcs;
    const hasTritone = pcs.has(6);
    const dom7 = pcs.has(4) && pcs.has(10);
    const dim = pcs.has(3) && pcs.has(6);
    const aug = pcs.has(4) && pcs.has(8);
    return hasTritone || dom7 || dim || aug;
}

function _velocityArpeggio(midi, now, chordInfo){
    const s = STATE;
    const { v: base, gap } = _humanBase(midi, now);
    let v = base;
    v += _roleWeight(midi, chordInfo);
    if (_tensionFlag(chordInfo)) v += CFG.tensionBoost;

    const interval = s.lastMidi >= 0 ? midi - s.lastMidi : 0;
    if (Math.abs(interval) >= 7) v += Math.min(CFG.leapBoost, (Math.abs(interval) - 6) * 0.01);

    if (gap < CFG.runMs && interval !== 0){
        // Real contour arc: the longer a directional run goes, the more it
        // leans into its own direction (crescendo climbing, diminuendo
        // falling) instead of a flat per-note nudge.
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

// gestureNotes = sorted MIDI array of the notes currently known to be part
// of this simultaneous chord (including the note being voiced right now).
// Only the notes struck so far can be weighed — the very first note of a
// fresh chord can't yet know it'll end up under two more, so it lands at
// base and later notes voice themselves relative to what's already down.
// That's an inherent real-time constraint, not a shortcut.
function _velocityBlock(midi, now, chordInfo, gestureNotes){
    const { v: base } = _humanBase(midi, now);
    let v = base;
    if (gestureNotes && gestureNotes.length >= 2){
        const top = gestureNotes[gestureNotes.length - 1];
        const bottom = gestureNotes[0];
        if (midi === top) v += CFG.melodyBoost;
        else if (midi === bottom) v += CFG.bassBoost;
        else v -= CFG.innerDip;
    }
    if (_tensionFlag(chordInfo)) v += CFG.tensionBoost;
    v += (Math.random() + Math.random() - 1) * 0.02;
    v = Math.max(CFG.min, Math.min(CFG.max, v));
    STATE.lastTime = now; STATE.lastMidi = midi; STATE.lastVel = v;
    return v;
}

function velocityFor(midi, opts){
    opts = opts || {};
    const chordInfo = opts.chordInfo || null;
    const gestureNotes = opts.gestureNotes || null;
    const now = performance.now();
    const mode = STATE.mode;
    if (mode === 'block') return _velocityBlock(midi, now, chordInfo, gestureNotes);
    if (mode === 'arpeggio') return _velocityArpeggio(midi, now, chordInfo);
    // mix: same onset-gap gesture classification the old single model used,
    // now dispatching to the specialist that actually fits instead of one
    // blended curve for both cases.
    const gap = now - STATE.lastTime;
    const looksLikeBlock = gap <= CFG.chordMs && gestureNotes && gestureNotes.length >= 2;
    return looksLikeBlock ? _velocityBlock(midi, now, chordInfo, gestureNotes)
                           : _velocityArpeggio(midi, now, chordInfo);
}

window.PapianoAutoVelocity = { setMode, getMode, reset, velocityFor };
})();
