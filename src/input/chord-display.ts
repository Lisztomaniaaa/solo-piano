// On-screen chord readout (#chordDisplay): detector tier, throttled detection,
// text scale and colours.
//
// Chord state = keys currently lit (heldKeys, the original pressStartTimes:
// pointer = touched key, QWERTY/MIDI = transposed key) plus anything released within the last
// CHORD_RELEASE_GRACE_MS, independent of sustain. Real hands (and touch/QWERTY
// input) roll a chord in over a few dozen ms; the fixed grace lets a rolled
// chord read as one without the old sustain-driven blurred-cluster problem.

import { performanceEvents, heldKeys, recentReleases } from '../core/performance.js';
import { settings, DEFAULT_CHORD_COLORS } from '../state/settings.js';
import type { ChordColors, ChordTier } from '../state/settings.js';
import { runtime } from '../state/runtime.js';
import { matchChords, formatChord } from '../theory/chords.js';
import { getBurstLevel } from '../audio/burst.js';

export const CHORD_RELEASE_GRACE_MS = 110;
const CHORD_MIN_INTERVAL = 28;

const CHORD_MODES = ['basic', 'medium', 'pro', 'expert', 'max'];
const CHORD_BUTTON_IDS: Record<ChordTier, string> = {
    off: 'chordModeOff',
    basic: 'chordModeBasic',
    medium: 'chordModeMedium',
    pro: 'chordModePro',
    expert: 'chordModeExpert',
    max: 'chordModeMax',
};

let chordEl1: HTMLElement | null = null;
let chordEl2: HTMLElement | null = null;

// ── Throttled detection ──────────────────────────────────────────────────
// requestChordUpdate() only flags the detector dirty; the work runs from a
// microtask so it reads the fully-settled note set (a chord change arrives as
// a run of releases then a run of presses in one turn). Inside the microtask a
// leading/trailing throttle keeps it at ~36 detections/sec, backing off to
// 90ms during a glissando burst (the chord can't change that fast).
let chordLastRun = 0;
let chordTrailingTimer = 0;
let chordDirty = false;
let chordFlushScheduled = false;

function runChordDetect(): void {
    chordLastRun = performance.now();
    chordDirty = false;
    try { detectAndRenderChords(); } catch { /* ignore */ }
}

function flushChordUpdate(): void {
    chordFlushScheduled = false;
    if (!chordDirty) return;
    const interval = getBurstLevel() > 14 ? 90 : CHORD_MIN_INTERVAL;
    const since = performance.now() - chordLastRun;
    if (since >= interval) {
        if (chordTrailingTimer) { clearTimeout(chordTrailingTimer); chordTrailingTimer = 0; }
        runChordDetect();
    } else if (!chordTrailingTimer) {
        chordTrailingTimer = window.setTimeout(() => {
            chordTrailingTimer = 0;
            if (chordDirty) runChordDetect();
        }, Math.max(1, interval - since));
    }
}

export function requestChordUpdate(): void {
    chordDirty = true;
    if (chordFlushScheduled) return;
    chordFlushScheduled = true;
    queueMicrotask(flushChordUpdate);
}

// ── Rendering ────────────────────────────────────────────────────────────
// Last state written to the DOM, so an unchanged reading costs no writes.
let renderedKey = '';
const noteBuf: number[] = [];

function isChordEnabled(): boolean {
    return settings.get().chordDetectorTier !== 'off';
}

function clearChordDom(): void {
    if (renderedKey === 'clear') return;
    renderedKey = 'clear';
    const el1 = chordEl1!, el2 = chordEl2!;
    el1.classList.remove('show'); el1.textContent = '';
    el1.style.color = ''; el1.style.textShadow = '';
    el2.classList.remove('show'); el2.textContent = '';
    el2.style.color = ''; el2.style.textShadow = ''; el2.style.opacity = '';
    runtime.set({ chordPrimary: '', chordSecondary: '' });
}

function detectAndRenderChords(): void {
    if (!isChordEnabled()) return;
    if (!chordEl1 || !chordEl2) return;
    const notes = noteBuf;
    notes.length = 0;
    for (const m of heldKeys.keys()) notes.push(m);
    if (recentReleases.size) {
        const now = performance.now();
        for (const [m, ts] of recentReleases) {
            if (now - ts <= CHORD_RELEASE_GRACE_MS) {
                if (!notes.includes(m)) notes.push(m);
            } else {
                recentReleases.delete(m);
            }
        }
    }
    if (notes.length < 3) { clearChordDom(); return; }
    notes.sort((a, b) => a - b);
    let matches: ReturnType<typeof matchChords> = [];
    try { matches = matchChords(notes, settings.get().chordDetectorTier) || []; } catch { matches = []; }
    if (matches.length === 0) { clearChordDom(); return; }

    const color = settings.get().customChordColor || '#0099ff';
    // Sketch and 8-bit are flat looks where the glow renders as a ghost.
    const bodyCl = document.body.classList;
    const isFlatTheme = bodyCl.contains('theme-sketch') || bodyCl.contains('theme-8bit');
    const shadow = isFlatTheme ? 'none' : ('0 2px 12px rgba(0,0,0,0.8), 0 0 20px ' + color + '55');
    const primary = formatChord(matches[0]!);
    const secondary = matches.length >= 2 ? formatChord(matches[1]!) : '';
    const key = primary + '\u0000' + secondary + '\u0000' + color + '\u0000' + shadow;
    if (key === renderedKey) return;
    renderedKey = key;

    const el1 = chordEl1, el2 = chordEl2;
    el1.textContent = primary;
    el1.style.setProperty('color', color, 'important');
    el1.style.setProperty('text-shadow', shadow, 'important');
    el1.classList.add('show');
    if (secondary) {
        el2.textContent = secondary;
        el2.style.setProperty('color', color, 'important');
        el2.style.setProperty('text-shadow', shadow, 'important');
        el2.style.setProperty('opacity', '0.6', 'important');
        el2.classList.add('show');
    } else {
        el2.classList.remove('show'); el2.textContent = '';
        el2.style.textShadow = ''; el2.style.opacity = '';
    }
    runtime.set({ chordPrimary: primary, chordSecondary: secondary });
}

// ── Detector tier ────────────────────────────────────────────────────────
// Storage: 'papianoChordModeV2' holds the tier token; 'papianoChordOn' the
// on/off flag. The legacy 'papianoChordMode' key used the old 3-tier scheme
// (off/basic/pro), whose 'basic' is now 'medium' and 'pro' is now 'max'; it is
// migrated once and removed.
function migrateLegacyChordMode(raw: string): ChordTier | null {
    if (raw === 'off') return 'off';
    if (raw === 'basic') return 'medium';
    if (raw === 'pro') return 'max';
    return null;
}

function normalizeTier(mode: string): ChordTier {
    if (mode === 'off' || CHORD_MODES.includes(mode)) return mode as ChordTier;
    // Unknown token: the 'expert' shipping default.
    return 'expert';
}

export function setChordMode(mode: string): void {
    const tier = normalizeTier(mode);
    if (settings.get().chordDetectorTier === tier) applyChordTier(tier);
    else settings.set({ chordDetectorTier: tier });
}

function applyChordTier(tier: ChordTier): void {
    try { localStorage.setItem('papianoChordOn', tier !== 'off' ? '1' : '0'); } catch { /* ignore */ }
    try { localStorage.setItem('papianoChordModeV2', tier); } catch { /* ignore */ }
    if (tier === 'off') {
        if (chordEl1) { chordEl1.classList.remove('show'); chordEl1.textContent = ''; }
        if (chordEl2) { chordEl2.classList.remove('show'); chordEl2.textContent = ''; }
        renderedKey = 'off';
        runtime.set({ chordPrimary: '', chordSecondary: '' });
    }
    syncChordModeUI();
    requestChordUpdate();
}

function syncChordModeUI(): void {
    const current = settings.get().chordDetectorTier;
    for (const m of Object.keys(CHORD_BUTTON_IDS) as ChordTier[]) {
        document.getElementById(CHORD_BUTTON_IDS[m])?.classList.toggle('active', current === m);
    }
}

function loadSavedChordMode(): void {
    try {
        const saved = localStorage.getItem('papianoChordModeV2');
        if (saved === 'off' || (saved !== null && CHORD_MODES.includes(saved))) { setChordMode(saved); return; }
        const legacy = localStorage.getItem('papianoChordMode');
        if (legacy !== null) {
            const migrated = migrateLegacyChordMode(legacy);
            try { localStorage.removeItem('papianoChordMode'); } catch { /* ignore */ }
            if (migrated) { setChordMode(migrated); return; }
        }
        // No tier saved: only the on/off flag applies (tier stays at default).
        if (localStorage.getItem('papianoChordOn') === '0') settings.set({ chordDetectorTier: 'off' });
    } catch { /* ignore */ }
    syncChordModeUI();
}

// ── Text scale ───────────────────────────────────────────────────────────
// 50%–200% multiplier via --chord-scale, so the CSS font-size calc picks it up.
let appliedTextScale = -1;
function applyChordTextScale(n: number): void {
    if (n === appliedTextScale) return;
    appliedTextScale = n;
    document.documentElement.style.setProperty('--chord-scale', (n / 100).toFixed(3));
    const slider = document.getElementById('chordTextSizeRange') as HTMLInputElement | null;
    if (slider && Number(slider.value) !== n) slider.value = String(n);
    const label = document.getElementById('chordTextSizeVal');
    if (label) label.textContent = n + '%';
}

export function setChordTextScale(pct: number | string): void {
    const n = Math.max(50, Math.min(200, Math.round(Number(pct)) || 100));
    settings.set({ chordTextScale: n });
    applyChordTextScale(n);
}

// ── Colours ──────────────────────────────────────────────────────────────
export type ColorIntent = 'user' | 'reset' | null;

/** The colour-pad widget, provided by the UI module. */
export interface ColorPadApi {
    /** Mounts a pad into #id. `handler` gets the intent: 'user' for a drag/key, 'reset' for its Reset button. */
    mount(id: string, label: string, initialColor: string,
        handler: (color: string, intent: 'user' | 'reset') => void, resetColor: string): void;
    /** Display-only update (does not call the handler). */
    update(id: string, color: string): void;
}

let colorPad: ColorPadApi | null = null;

export function normalizeHexColor(hex: unknown): string | null {
    if (!hex) return null;
    let h = String(hex).trim();
    if (!h.startsWith('#')) return null;
    h = h.slice(1);
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
    return '#' + h.toLowerCase();
}

function hexToRgbaString(hex: string, alpha: number): string {
    const c = normalizeHexColor(hex) || '#ffffff';
    const n = parseInt(c.slice(1), 16);
    const a = Math.max(0, Math.min(1, Number(alpha) || 0));
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/**
 * `intent`: 'user' marks the colour as custom, 'reset' clears the custom flag,
 * null (programmatic restore) treats anything but white as custom.
 */
export function setChordDisplayColors(colors: Partial<ChordColors> | null | undefined, intent: ColorIntent = null): void {
    const source = colors || {};
    const primary = normalizeHexColor(source.primary) || DEFAULT_CHORD_COLORS.primary;
    const secondary = normalizeHexColor(source.secondary) || DEFAULT_CHORD_COLORS.secondary;
    let customChordColor: string | null;
    if (intent === 'user') customChordColor = primary;
    else if (intent === 'reset') customChordColor = null;
    else customChordColor = (primary !== '#ffffff' || secondary !== '#ffffff') ? primary : null;
    settings.set({ chordDisplayColors: { primary, secondary }, customChordColor });
    applyChordColors(settings.get().chordDisplayColors);
}

let appliedColorsKey = '';
function applyChordColors(c: ChordColors): void {
    const key = c.primary + c.secondary;
    if (key === appliedColorsKey) return;
    appliedColorsKey = key;
    const root = document.documentElement.style;
    root.setProperty('--chord-primary', c.primary);
    root.setProperty('--chord-secondary', c.secondary);
    root.setProperty('--chord-glow', hexToRgbaString(c.primary, 0.36));
    if (colorPad) {
        colorPad.update('chordPrimaryColor', c.primary);
        colorPad.update('chordSecondaryColor', c.secondary);
    }
}

/** Mounts the chord colour pads; call once the colour-pad widget exists. */
export function bindChordColorControls(pad: ColorPadApi): void {
    colorPad = pad;
    const current = (): ChordColors => settings.get().chordDisplayColors;
    pad.mount('chordPrimaryColor', 'Primary', current().primary,
        (color, intent) => setChordDisplayColors({ ...current(), primary: color }, intent), DEFAULT_CHORD_COLORS.primary);
    pad.mount('chordSecondaryColor', 'Secondary', current().secondary,
        (color, intent) => setChordDisplayColors({ ...current(), secondary: color }, intent), DEFAULT_CHORD_COLORS.secondary);
    document.getElementById('chordColorReset')?.addEventListener('click', () => setChordDisplayColors(DEFAULT_CHORD_COLORS));
    appliedColorsKey = '';
    setChordDisplayColors(current());
}

// ── Init ─────────────────────────────────────────────────────────────────
export function initChordDisplay(): void {
    chordEl1 = document.getElementById('chordPrimary');
    chordEl2 = document.getElementById('chordSecondary');

    // 'activity' also fires on stopAll, so a full stop clears the readout.
    performanceEvents.on('activity', requestChordUpdate);
    performanceEvents.on('release', () => {
        // Nothing else is guaranteed to touch chord state once the grace
        // window lapses, so schedule one follow-up read to drop the note.
        setTimeout(requestChordUpdate, CHORD_RELEASE_GRACE_MS + 30);
    });

    for (const m of Object.keys(CHORD_BUTTON_IDS) as ChordTier[]) {
        document.getElementById(CHORD_BUTTON_IDS[m])?.addEventListener('click', () => setChordMode(m));
    }
    document.getElementById('chordTextSizeRange')?.addEventListener('input', e => {
        setChordTextScale((e.target as HTMLInputElement).value);
    });

    settings.subscribe(['chordDetectorTier'], s => applyChordTier(s.chordDetectorTier));
    settings.subscribe(['chordTextScale'], s => applyChordTextScale(s.chordTextScale));
    settings.subscribe(['chordDisplayColors'], s => applyChordColors(s.chordDisplayColors));

    loadSavedChordMode();
    setChordTextScale(settings.get().chordTextScale);
    applyChordColors(settings.get().chordDisplayColors);
}
