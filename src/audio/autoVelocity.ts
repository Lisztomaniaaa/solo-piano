// Auto Velocity toggle + mode buttons, and the per-note harmonic context fed
// to the engine. Only replaces the fixed 0.8 default of velocity-less input
// (QWERTY / mouse / touch); real MIDI velocities are passed explicitly to
// pressKey() and never touched.

import { heldKeys, recentReleases, setVelocityProvider } from '../core/performance.js';
import { matchChords } from '../theory/chords.js';
import { settings } from '../state/settings.js';
import { persist } from './state.js';
import * as engine from './autoVelocityEngine.js';
import type { AutoVelMode as AutoVelocityMode, ChordInfo } from './autoVelocityEngine.js';

const CHORD_RELEASE_GRACE_MS = 110;
const CHORD_TIERS = ['basic', 'medium', 'pro', 'expert', 'max'];
const MODE_BUTTON_IDS: Record<AutoVelocityMode, string> = {
    arpeggio: 'autoVelModeArpeggio',
    block: 'autoVelModeBlock',
    mix: 'autoVelModeMix',
};

let autoVelocityEnabled = false;
let autoVelocityMode: AutoVelocityMode = 'mix';
let trackEl: HTMLElement | null = null;
// matchChords runs at the chord detector's last enabled tier (switching the
// detector off keeps the previous tier, as the original's chordMode did).
let chordTier = 'expert';

const fixedVelocity = (): number => 0.8;

function syncChordTier(tier: string): void {
    if (tier === 'off') return;
    chordTier = CHORD_TIERS.indexOf(tier) !== -1 ? tier : 'expert';
}

// Harmonic context for one note: held keys + anything released within the
// chord detector's grace window (so an arpeggio reads as one chord the same
// way it does on screen), plus the chord matchChords infers from that set.
// Fewer than 3 notes = no chord to weigh roles against.
const gestureSet = new Set<number>();
function chordContext(n: number): { gestureNotes: number[]; chordInfo: ChordInfo | null } {
    gestureSet.clear();
    gestureSet.add(n);
    heldKeys.forEach((_, m) => gestureSet.add(m));
    if (recentReleases.size) {
        const now = performance.now();
        recentReleases.forEach((ts, m) => { if (now - ts <= CHORD_RELEASE_GRACE_MS) gestureSet.add(m); });
    }
    const gestureNotes = Array.from(gestureSet).sort((a, b) => a - b);
    let chordInfo: ChordInfo | null = null;
    if (gestureNotes.length >= 3) {
        try {
            const matches = matchChords(gestureNotes, chordTier);
            if (matches && matches.length) {
                const root = matches[0].root;
                chordInfo = { root, pcs: new Set(gestureNotes.map(m => ((m - root) % 12 + 12) % 12)) };
            }
        } catch { /* ignore */ }
    }
    return { gestureNotes, chordInfo };
}

export function autoVelocityFor(midi: number): number {
    return engine.velocityFor(midi, chordContext(midi));
}

export function setAutoVelocityMode(mode: string): void {
    const m: AutoVelocityMode = (mode === 'arpeggio' || mode === 'block' || mode === 'mix') ? mode : 'mix';
    autoVelocityMode = m;
    engine.setMode(m);
    try { localStorage.setItem('papianoAutoVelMode', m); } catch { /* ignore */ }
    (Object.keys(MODE_BUTTON_IDS) as AutoVelocityMode[]).forEach(k => {
        const el = document.getElementById(MODE_BUTTON_IDS[k]);
        if (el) el.classList.toggle('active', k === m);
    });
    persist({ autoVelocityMode: m });
}

export function setAutoVelocity(on: boolean): void {
    autoVelocityEnabled = !!on;
    if (trackEl) trackEl.classList.toggle('active', autoVelocityEnabled);
    try { localStorage.setItem('papianoAutoVel', autoVelocityEnabled ? '1' : '0'); } catch { /* ignore */ }
    setVelocityProvider(autoVelocityEnabled ? autoVelocityFor : fixedVelocity);
    persist({ autoVelocityEnabled });
}

export function isAutoVelocityEnabled(): boolean {
    return autoVelocityEnabled;
}
export function getAutoVelocityMode(): AutoVelocityMode {
    return autoVelocityMode;
}

export function bindAutoVelocity(): void {
    trackEl = document.getElementById('autoVelTrack');
    (Object.keys(MODE_BUTTON_IDS) as AutoVelocityMode[]).forEach(k => {
        const el = document.getElementById(MODE_BUTTON_IDS[k]);
        if (el) el.addEventListener('click', () => setAutoVelocityMode(k));
    });
    if (trackEl) trackEl.onclick = () => setAutoVelocity(!autoVelocityEnabled);
    syncChordTier(settings.get().chordDetectorTier);
    settings.subscribe(['chordDetectorTier'], s => syncChordTier(s.chordDetectorTier));
}
