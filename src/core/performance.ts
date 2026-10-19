// The hub every note goes through. Input sources (QWERTY, pointer, MIDI) call
// pressKey/releaseKey; audio, visuals and the chord detector subscribe to the
// resulting events.
//
// Three numbers describe a press, matching the original press(n, el, visualNote):
//   noteMidi  - the note the input produced (n). Audio keys its voices and the
//               string-layer range on this.
//   soundMidi - noteMidi + transpose: the pitch that sounds.
//   keyMidi   - the key lit on screen (visualNote). Pointer input lights the
//               touched key (keyMidi = noteMidi); QWERTY and MIDI light the
//               transposed key (keyMidi = noteMidi + transpose). May fall
//               outside 21..108 (a MIDI note off the keyboard still sounds).

import { Emitter } from './emitter.js';
import { settings } from '../state/settings.js';

export interface PressEvent {
    keyMidi: number;
    noteMidi: number;
    soundMidi: number;
    velocity: number;   // 0..1
    time: number;       // performance.now()
}

export interface ReleaseEvent {
    keyMidi: number;
    noteMidi: number;
    soundMidi: number;
    /** True for a key swept over mid-glissando: use the short release tail. */
    fast: boolean;
    time: number;
}

export interface PerformanceEvents extends Record<string, unknown> {
    press: PressEvent;
    release: ReleaseEvent;
    /** Fired for every press/release so throttled consumers can re-read state. */
    activity: { time: number };
    /** stopAllNotes(): cut every voice and drop all held/visual note state. */
    stopAll: { time: number };
}

export const performanceEvents = new Emitter<PerformanceEvents>();

/** Keys currently lit: keyMidi -> press time (the original pressStartTimes). */
export const heldKeys = new Map<number, number>();
/** Recently released keys: keyMidi -> release time (chord detector's grace window). */
export const recentReleases = new Map<number, number>();

let inputReady = false;
export function setInputReady(ready: boolean): void {
    inputReady = ready;
}
export function isInputReady(): boolean {
    return inputReady;
}

/** Velocity provider; auto-velocity replaces this when enabled. */
let velocityFor: (noteMidi: number) => number = () => 0.8;
export function setVelocityProvider(fn: (noteMidi: number) => number): void {
    velocityFor = fn;
}

export const MIN_KEY = 21;
export const MAX_KEY = 108;

/** press(n, el, visualNote): `visualMidi` defaults to the note itself. */
export function pressKey(noteMidi: number, velocity?: number, visualMidi?: number): void {
    if (!inputReady) return;
    const time = performance.now();
    const keyMidi = visualMidi ?? noteMidi;
    const soundMidi = noteMidi + settings.get().transpose;
    const vel = velocity ?? velocityFor(noteMidi);
    heldKeys.set(keyMidi, time);
    recentReleases.delete(keyMidi);
    performanceEvents.emit('press', { keyMidi, noteMidi, soundMidi, velocity: vel, time });
    performanceEvents.emit('activity', { time });
}

// Release is deliberately not gated on inputReady: a note that got in must
// always be allowed back out, or it would hang. Idempotent, like the original.
export function releaseKey(noteMidi: number, fast = false, visualMidi?: number): void {
    const time = performance.now();
    const keyMidi = visualMidi ?? noteMidi;
    const soundMidi = noteMidi + settings.get().transpose;
    heldKeys.delete(keyMidi);
    recentReleases.set(keyMidi, time);
    performanceEvents.emit('release', { keyMidi, noteMidi, soundMidi, fast, time });
    performanceEvents.emit('activity', { time });
}

/**
 * The original stopAllNotes(): audio cuts every voice (short release),
 * visuals drop pressed keys / growing notes / emitters, and the chord
 * readout clears. Inputs keep their own held maps; their later key-ups are
 * harmless because releaseKey is idempotent.
 */
export function stopAllNotes(): void {
    const time = performance.now();
    heldKeys.clear();
    recentReleases.clear();
    performanceEvents.emit('stopAll', { time });
    performanceEvents.emit('activity', { time });
}
