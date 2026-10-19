// Every settings "setter" the panels expose, with the exact clamping and
// normalisation of the original solo-piano.js setters. They operate on a
// mutable Draft so compound flows (theme switch, preset load, factory reset)
// can chain many setters in the original order and commit one notification.
// Rendering is NOT done here: the renderer reads `settings`, and the panel
// controls re-sync from `settings` via subscriptions (see controls.ts).

import {
    settings, type Settings, type Material, type ColorMode, type PianoTheme, type GraphicQuality,
    DEFAULT_ACCENT_WHITE, DEFAULT_ACCENT_BLACK, DEFAULT_CHORD_COLORS, isPortraitOrientation,
} from '../state/settings.js';
import { NO_COLOR, normalizeHexColor, type ColorIntent } from './color.js';

export type Draft = Settings;

export function draft(): Draft {
    const s = settings.get();
    return {
        ...s,
        gradientColors: [...s.gradientColors],
        chordDisplayColors: { ...s.chordDisplayColors },
        sfEffectSettings: { sf1: { ...s.sfEffectSettings.sf1 }, sf2: { ...s.sfEffectSettings.sf2 } },
    };
}

function sameValue(a: unknown, b: unknown): boolean {
    if (Object.is(a, b)) return true;
    if (a && b && typeof a === 'object' && typeof b === 'object') return JSON.stringify(a) === JSON.stringify(b);
    return false;
}

/** Writes only the keys that actually differ, in one store notification. */
export function commit(d: Draft): void {
    const cur = settings.get() as unknown as Record<string, unknown>;
    const next = d as unknown as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    let any = false;
    for (const key of Object.keys(next)) {
        if (!sameValue(cur[key], next[key])) { patch[key] = next[key]; any = true; }
    }
    if (any) settings.set(patch as Partial<Settings>);
}

export function update(fn: (d: Draft) => void): void {
    const d = draft();
    fn(d);
    commit(d);
}

// ── Shared clamps ───────────────────────────────────────────────────────────
export const STRING_TUTS_MIN = 1;
export const STRING_TUTS_MAX = 88;
export const STRING_TUTS_MIDI_OFFSET = 20;

export function clampStringTuts(value: unknown, fallback: number): number {
    const parsed = Math.round(Number(value));
    const safe = Number.isFinite(parsed) ? parsed : fallback;
    return Math.max(STRING_TUTS_MIN, Math.min(STRING_TUTS_MAX, safe));
}
export function midiToTuts(midi: unknown): number {
    return clampStringTuts((Number(midi) || 0) - STRING_TUTS_MIDI_OFFSET, 1);
}
function clampPercentValue(value: unknown, fallback = 0): number {
    const raw = Number(value);
    const safe = Number.isFinite(raw) ? raw : fallback;
    return Math.max(0, Math.min(100, Math.round(safe)));
}
function clampPianoCustomPercent(value: unknown, fallback: number, min: number, max: number): number {
    const parsed = Math.round(Number(value));
    const safe = Number.isFinite(parsed) ? parsed : fallback;
    return Math.max(min, Math.min(max, safe));
}
const round0 = (v: unknown, min: number, max: number): number => Math.max(min, Math.min(max, Math.round(Number(v) || 0)));
const int0 = (v: unknown, min: number, max: number): number => Math.max(min, Math.min(max, parseInt(String(v), 10) || 0));

// ── Piano height / key-count law ───────────────────────────────────────────
// Showing fewer keys makes each key wider, so the piano height (and the black
// key bevel) follow a partial share of the width gain:
//     gain = 52 / visibleWhiteKeys;  height = gain ^ GAMMA
// GAMMA fits "88 keys at 40% reads like 33 keys at 60%": ln(60/40)/ln(52/20).
// The bevel takes gain^(GAMMA-1). Both scales are 1.0 on the full board.
//
// Height and Edge Depth each keep a REFERENCE (their value on the full
// 52-key board). The setting is the number in force right now; whenever the
// count changes it is recomputed FROM the reference, so 52 -> 20 -> 52 lands
// back exactly where it started instead of drifting.
const PIANO_REF_WHITE_KEYS = 52;
const PIANO_KEYCOUNT_GAMMA = 0.4243;
let pianoHeightRefPercent = 50;
let blackKeyEdgeRefPercent = 40;

function effectiveVisibleWhiteCount(wCount: number): number {
    return Math.max(1, Math.min(PIANO_REF_WHITE_KEYS, Math.round(Number(wCount) || 52)));
}
function keyWidthGain(wCount: number): number {
    return PIANO_REF_WHITE_KEYS / effectiveVisibleWhiteCount(wCount);
}
function keyCountHeightScale(wCount: number): number { return Math.pow(keyWidthGain(wCount), PIANO_KEYCOUNT_GAMMA); }
function keyCountEdgeScale(wCount: number): number { return Math.pow(keyWidthGain(wCount), PIANO_KEYCOUNT_GAMMA - 1); }

export function getPianoMaxHeightPx(): number {
    const vv = window.visualViewport;
    const vh = Math.max(1, Math.round(vv ? vv.height : window.innerHeight));
    return Math.max(1, Math.floor(vh * 0.50));
}
// The setting is a PERCENT. The >100 branch is a one-way migration for presets
// saved when this was stored as raw pixels (re-read against the current viewport).
export function normalizePianoHeightPercent(value: unknown): number {
    const raw = Number(value);
    if (!Number.isFinite(raw)) return 0;
    if (raw > 100) {
        const maxPx = getPianoMaxHeightPx();
        return Math.round((Math.max(0, Math.min(maxPx, raw)) / maxPx) * 100);
    }
    return Math.max(0, Math.min(100, Math.round(raw)));
}
export function defaultPianoHeightPercent(): number { return isPortraitOrientation() ? 15 : 40; }
export function defaultPianoLiftPercent(): number { return isPortraitOrientation() ? 18 : 0; }

/** Slider / preset / defaults entry point: also moves the reference. */
export function setPianoHeightPercent(d: Draft, value: unknown): void {
    const eff = normalizePianoHeightPercent(value);
    pianoHeightRefPercent = eff / keyCountHeightScale(d.wCount);
    d.pianoHeight = eff;
}
export function setBlackKeyEdgeDepthPercent(d: Draft, value: unknown): void {
    const eff = clampPianoCustomPercent(value, 40, 10, 100);
    blackKeyEdgeRefPercent = eff / keyCountEdgeScale(d.wCount);
    d.blackKeyEdgeDepthPercent = eff;
}
/** The only place the key-count law is applied: rewrites the two settings from their references. */
export function reflowPianoForKeyCount(d: Draft): void {
    // Clamped to 0..100 BEFORE normalisation, which would read >100 as legacy pixels.
    d.pianoHeight = normalizePianoHeightPercent(Math.max(0, Math.min(100, Math.round(pianoHeightRefPercent * keyCountHeightScale(d.wCount)))));
    d.blackKeyEdgeDepthPercent = clampPianoCustomPercent(Math.round(blackKeyEdgeRefPercent * keyCountEdgeScale(d.wCount)), 40, 10, 100);
}
/** Seeds the references from the current settings (boot). */
export function initPianoReferences(): void {
    const s = settings.get();
    pianoHeightRefPercent = s.pianoHeight / keyCountHeightScale(s.wCount);
    blackKeyEdgeRefPercent = s.blackKeyEdgeDepthPercent / keyCountEdgeScale(s.wCount);
}

export function setPianoLift(d: Draft, value: unknown): void {
    d.pianoLiftPercent = round0(value, 0, 30);
}
// Black key width is a % of the real-piano geometric width (default 100).
export function setBlackKeyWidthPercent(d: Draft, value: unknown): void {
    d.blackKeyWidthPercent = clampPianoCustomPercent(value, 100, 70, 130);
}
export function setBlackKeyHeightPercent(d: Draft, value: unknown): void {
    d.blackKeyHeightPercent = clampPianoCustomPercent(value, 60, 45, 75);
}
export function setPianoVisibilityPercent(d: Draft, value: unknown): void {
    d.pianoVisibilityPercent = clampPianoCustomPercent(value, 100, 0, 100);
}
export function setTranspose(d: Draft, value: number): void {
    d.transpose = Math.max(-12, Math.min(12, value));
}
export function setKeyLabelScale(d: Draft, pct: unknown): void {
    d.keyLabelScale = Math.max(50, Math.min(200, Math.round(Number(pct)) || 100));
}
export function setChordTextScale(d: Draft, pct: unknown): void {
    d.chordTextScale = Math.max(50, Math.min(200, Math.round(Number(pct)) || 100));
}

// ── Falling notes ───────────────────────────────────────────────────────────
export function setAnimSize(d: Draft, value: unknown): void {
    d.animSize = Math.max(0, Math.min(100, parseInt(String(value), 10) || 0));
}
export function setAnimRoundness(d: Draft, value: unknown): void {
    d.animRoundness = round0(value, 0, 100);
    d.animShape = 'rounded';
}
export function setAnimShape(d: Draft, shape: unknown): void {
    d.animShape = 'rounded';
    setAnimRoundness(d, shape === 'rect' ? 0 : d.animRoundness);
}
export function setNoteOpacity(d: Draft, value: unknown): void {
    d.noteOpacity = Math.max(10, Math.min(100, Math.round(Number(value) || 100)));
}
export function setNoteSpeed(d: Draft, value: unknown): void {
    d.noteSpeed = clampPercentValue(value, 100);
}
export function setAnimColor(d: Draft, color: string | null | undefined, intent: ColorIntent): void {
    const nextColor = normalizeHexColor(color) || '#ffffff';
    if (intent === 'user') d.customAnimNote = nextColor;
    else if (intent === 'reset') d.customAnimNote = null;
    else if (color === null || color === undefined) d.customAnimNote = null;
    else d.customAnimNote = nextColor.toLowerCase() === '#ffffff' ? null : nextColor;
    d.animColor = nextColor;
    d.currentGlassColor = nextColor;
}
export function setAnimDoubleLeftColor(d: Draft, color: unknown): void {
    d.animDoubleLeftColor = normalizeHexColor(color) || '#ffffff';
}
export function setAnimDoubleRightColor(d: Draft, color: unknown): void {
    d.animDoubleRightColor = normalizeHexColor(color) || '#ffffff';
}
export function setAnimDoubleSplitTuts(d: Draft, value: unknown): void {
    d.animDoubleSplitTuts = clampStringTuts(value, d.animDoubleSplitTuts || 44);
}
export function setAnimKeyShade(d: Draft, on: unknown): void {
    d.animKeyShade = !!on;
}
export function setAnimColorMode(d: Draft, mode: unknown): void {
    if (mode !== 'single' && mode !== 'double' && mode !== 'gradient' && mode !== 'rainbow') return;
    d.animColorMode = mode as ColorMode;
    // 'double' is still backed by the animColorSplit boolean underneath.
    d.animColorSplit = mode === 'double';
}
export function setGradientColorCount(d: Draft, n: unknown): void {
    d.gradientColorCount = Math.max(1, Math.min(3, Math.round(Number(n) || 1)));
}
export function setGradientColor(d: Draft, index: number, color: unknown): void {
    d.gradientColors[index] = normalizeHexColor(color) || d.gradientColors[index]!;
}
export function setGradientIntensity(d: Draft, v: unknown): void {
    d.gradientIntensity = round0(v, 0, 100);
}
export function setGradientAxis(d: Draft, axis: unknown): void {
    if (axis === 'mix') axis = 'vertical'; // retired blend axis
    if (axis !== 'horizontal' && axis !== 'vertical') return;
    d.gradientAxis = axis;
}
/** Material buttons are addressed by element id, as in the original. */
export const MATERIAL_BUTTONS: Record<string, Material> = {
    mSingle: 'single', mOutline: 'outline', mMidnight: 'midnight', mGlass: 'glass', mChrome: 'chrome',
};
export function setMaterialById(d: Draft, id: string): void {
    if (id === 'mRainbowV2') id = 'mRainbow';
    const mode = Object.prototype.hasOwnProperty.call(MATERIAL_BUTTONS, id) ? MATERIAL_BUTTONS[id] : undefined;
    if (!mode) return;
    d.material = mode;
}
export function setNoteGlowEnabled(d: Draft, on: unknown): void { d.noteGlowEnabled = !!on; }
export function setNoteGlowIntensity(d: Draft, v: unknown): void { d.noteGlowIntensity = int0(v, 0, 200); }

// ── Strike line ─────────────────────────────────────────────────────────────
export function setKeyDustIntensity(d: Draft, value: unknown): void {
    d.keyDustIntensity = Math.max(1, Math.min(10, Math.round(Number(value) || 2)));
}
export function setStrikeLineColor(d: Draft, color: unknown): void {
    d.strikeLineColor = normalizeHexColor(color) || '#ffffff';
}
export function setStrikeLineLeftColor(d: Draft, color: unknown): void {
    d.strikeLineLeftColor = normalizeHexColor(color) || '#ffffff';
}
export function setStrikeLineRightColor(d: Draft, color: unknown): void {
    d.strikeLineRightColor = normalizeHexColor(color) || '#ffffff';
}
export function setStrikeLineSplitTuts(d: Draft, value: unknown): void {
    d.strikeLineSplitTuts = clampStringTuts(value, d.strikeLineSplitTuts || 44);
}
export function setStrikeLineAuraSize(d: Draft, value: unknown): void {
    d.strikeLineAuraSize = round0(value, 0, 200);
}
export type StrikeVisual = 'brightness' | 'opacity' | 'saturation';
export function setStrikeLineVisualSetting(d: Draft, name: StrikeVisual, value: unknown): void {
    const v = round0(value, 0, 100);
    if (name === 'brightness') d.strikeLineBrightness = v;
    else if (name === 'opacity') d.strikeLineOpacity = v;
    else d.strikeLineSaturation = v;
}
export function setMotionSpeed(d: Draft, value: unknown): void {
    d.motionSpeed = round0(value, 0, 100);
}
export type FxPart = 'strikeLine' | 'dust' | 'strikeReaction';
export function setStrikeLineFx(d: Draft, part: FxPart, value: unknown): void {
    if (part === 'strikeLine') d.strikeLineEnabled = !!value;
    else if (part === 'dust') d.strikeLineDustEnabled = !!value;
    else d.strikeReactionEnabled = !!value;
}
export function setStrikeReactionIntensity(d: Draft, value: unknown): void {
    d.strikeReactionIntensity = round0(value, 0, 100);
}

// ── Particles ───────────────────────────────────────────────────────────────
export type ParticleSetting = 'count' | 'size' | 'opacity' | 'speed' | 'turbulence' | 'saturation' | 'fade';
export function setParticleSetting(d: Draft, name: ParticleSetting, value: unknown): void {
    // Count & Size are capped at 50 (0-50 sliders); the rest stay 0-100.
    const v = round0(value, 0, (name === 'count' || name === 'size') ? 50 : 100);
    switch (name) {
        case 'count': d.particleCount = v; d.strikeLineDustAmount = v; break;
        case 'size': d.particleSize = v; d.strikeLineDustSize = v; break;
        case 'opacity': d.particleOpacity = v; break;
        case 'speed': d.particleSpeed = v; break;
        case 'turbulence': d.particleTurbulence = v; break;
        case 'saturation': d.particleSaturation = v; break;
        case 'fade': d.particleFade = v; break;
    }
}
export function setDustColor(d: Draft, color: unknown): void { d.dustColor = normalizeHexColor(color) || '#ffffff'; }
export function setDustDoubleLeftColor(d: Draft, color: unknown): void { d.dustDoubleLeftColor = normalizeHexColor(color) || '#ffffff'; }
export function setDustDoubleRightColor(d: Draft, color: unknown): void { d.dustDoubleRightColor = normalizeHexColor(color) || '#ffffff'; }
export function setDustDoubleSplitTuts(d: Draft, value: unknown): void {
    d.dustDoubleSplitTuts = clampStringTuts(value, d.dustDoubleSplitTuts || 44);
}
export function setDustBlendMode(d: Draft, mode: unknown): void {
    d.dustBlendMode = mode === 'glow' ? 'glow' : 'solid';
}

// ── Keys ────────────────────────────────────────────────────────────────────
export function setKeyGlowEnabled(d: Draft, on: unknown): void { d.keyGlowEnabled = !!on; }
export function setKeyGlowIntensity(d: Draft, v: unknown): void { d.keyGlowIntensity = int0(v, 0, 100); }

// The custom* flags record "the user explicitly chose this colour":
//   'user'  -> picked in the pad (incl. white) -> custom
//   'reset' -> pad's Reset button              -> not custom
//   null    -> preset load / defaults          -> custom unless white
function customFromIntent(color: string | null, intent: ColorIntent): string | null {
    if (intent === 'user') return (color === NO_COLOR || color === null) ? null : (normalizeHexColor(color) || null);
    if (intent === 'reset' || color === NO_COLOR || color === null) return null;
    const n = normalizeHexColor(color) || null;
    return (n && n.toLowerCase() !== '#ffffff') ? n : null;
}
export function setWhiteKeyColor(d: Draft, color: string | null, intent: ColorIntent): void {
    d.customWhiteKey = customFromIntent(color, intent);
    d.accentWhite = (color === NO_COLOR || color === null) ? '#ffffff' : (normalizeHexColor(color) || '#ffffff');
}
export function setBlackKeyColor(d: Draft, color: string | null, intent: ColorIntent): void {
    d.customBlackKey = customFromIntent(color, intent);
    d.accentBlack = (color === NO_COLOR || color === null) ? '#ffffff' : (normalizeHexColor(color) || '#ffffff');
}
export function setChordDisplayColors(d: Draft, colors: { primary?: unknown; secondary?: unknown } | null | undefined, intent: ColorIntent): void {
    const source = colors || {};
    const primary = normalizeHexColor(source.primary) || DEFAULT_CHORD_COLORS.primary;
    const secondary = normalizeHexColor(source.secondary) || DEFAULT_CHORD_COLORS.secondary;
    d.chordDisplayColors = { primary, secondary };
    if (intent === 'user') d.customChordColor = primary;
    else if (intent === 'reset') d.customChordColor = null;
    else d.customChordColor = (primary.toLowerCase() !== '#ffffff' || secondary.toLowerCase() !== '#ffffff') ? primary : null;
}

// ── Theme ───────────────────────────────────────────────────────────────────
export const THEMES: readonly PianoTheme[] = ['default', 'sketch', '8bit'];
// Snapshot of the FX toggles taken on the first hop away from Default, put
// back verbatim on return (Sketch/8-bit force them off).
let preThemeFx: { strikeLine: boolean; dust: boolean; strikeReaction: boolean; noteGlow: boolean; keyGlow: boolean } | null = null;

/** applyDefaults=false is the preset-restore path: keep the preset's own colours. */
export function setPianoTheme(d: Draft, theme: unknown, applyDefaults = true): void {
    const prevTheme = d.pianoTheme;
    d.pianoTheme = (THEMES as readonly unknown[]).includes(theme) ? theme as PianoTheme : 'default';
    if (applyDefaults) {
        const enteringCustom = d.pianoTheme === 'sketch' || d.pianoTheme === '8bit';
        if (enteringCustom && prevTheme === 'default' && !preThemeFx) {
            preThemeFx = { strikeLine: d.strikeLineEnabled, dust: d.strikeLineDustEnabled, strikeReaction: d.strikeReactionEnabled, noteGlow: d.noteGlowEnabled, keyGlow: d.keyGlowEnabled };
        }
        if (d.pianoTheme === 'sketch') {
            setAnimColor(d, '#b23a2e', null);
            setMaterialById(d, 'mSingle');
            setKeyGlowEnabled(d, false);
            setChordDisplayColors(d, { primary: '#2a2a28', secondary: '#2a2a28' }, null);
            setWhiteKeyColor(d, '#f0b9ad', null);
            setBlackKeyColor(d, '#5a3c34', null);
        } else if (d.pianoTheme === '8bit') {
            setAnimColor(d, '#ef4f9e', null);
            setMaterialById(d, 'mSingle');
            setKeyGlowEnabled(d, false);
            setChordDisplayColors(d, { primary: '#f4c542', secondary: '#f4c542' }, null);
            setWhiteKeyColor(d, '#ef4f9e', null);
            setBlackKeyColor(d, '#b52e73', null);
        } else {
            setAnimColor(d, '#0099ff', null);
            if (preThemeFx) {
                setStrikeLineFx(d, 'strikeLine', preThemeFx.strikeLine);
                setStrikeLineFx(d, 'dust', preThemeFx.dust);
                setStrikeLineFx(d, 'strikeReaction', preThemeFx.strikeReaction);
                setNoteGlowEnabled(d, preThemeFx.noteGlow);
                setKeyGlowEnabled(d, preThemeFx.keyGlow);
                preThemeFx = null;
            } else {
                setStrikeLineFx(d, 'strikeLine', true);
                setStrikeLineFx(d, 'dust', true);
            }
            setChordDisplayColors(d, { primary: '#0099ff', secondary: '#0099ff' }, null);
            setWhiteKeyColor(d, DEFAULT_ACCENT_WHITE, null);
            setBlackKeyColor(d, DEFAULT_ACCENT_BLACK, null);
        }
    }
    // Sketch/8-bit hide these effects' controls, so they must never be left on
    // (enforced on the preset path too).
    if (d.pianoTheme === 'sketch' || d.pianoTheme === '8bit') {
        setStrikeLineFx(d, 'strikeLine', false);
        setStrikeLineFx(d, 'dust', false);
        setStrikeLineFx(d, 'strikeReaction', false);
        setNoteGlowEnabled(d, false);
        setKeyGlowEnabled(d, false);
    }
}

// ── Graphics quality ────────────────────────────────────────────────────────
// All tiers share identical percentages; Potato only keeps dust off.
const GRAPHIC_MODE_DEFAULTS: Record<GraphicQuality, { dust: boolean }> = {
    potato: { dust: false },
    default: { dust: true },
};
export function normalizeGraphicQuality(q: unknown): GraphicQuality {
    // 'auto' falls back to the fixed default tier.
    return q === 'potato' ? 'potato' : 'default';
}
export function applyGraphicQuality(d: Draft, q: unknown, applyDefaults: boolean): void {
    d.graphicQuality = normalizeGraphicQuality(q);
    if (!applyDefaults) return;
    setKeyGlowEnabled(d, false);
    setStrikeLineFx(d, 'dust', GRAPHIC_MODE_DEFAULTS[d.graphicQuality].dust);
    setParticleSetting(d, 'count', 40);
    setParticleSetting(d, 'size', 50);
    setParticleSetting(d, 'opacity', 85);
    setParticleSetting(d, 'speed', 55);
    setParticleSetting(d, 'turbulence', 55);
    setParticleSetting(d, 'saturation', 100);
    setParticleSetting(d, 'fade', 40);
    setStrikeLineAuraSize(d, 100);
    setStrikeLineVisualSetting(d, 'brightness', 100);
    setStrikeLineVisualSetting(d, 'opacity', 100);
    setStrikeLineVisualSetting(d, 'saturation', 100);
}

// ── Background ──────────────────────────────────────────────────────────────
export function setBgFitMode(d: Draft, mode: unknown): void {
    d.bgFitMode = (mode === 'contain' || mode === 'stretch') ? mode : 'cover';
}
export function setBgPositionMode(d: Draft, mode: unknown): void {
    d.bgPositionMode = (mode === 'top' || mode === 'bottom') ? mode : 'center';
}
