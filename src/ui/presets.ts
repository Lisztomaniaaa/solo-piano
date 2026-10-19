// Presets & persistence. A preset is a JSON snapshot of the settings (plus the
// metronome state and the schema-version markers older loaders key off).
// Loading one runs the original applySettings migration/validation on a
// draft and commits it in one settings.set.

import { settings, defaultSettings, type Settings, type ChordTier, DEFAULT_ACCENT_WHITE, DEFAULT_ACCENT_BLACK, DEFAULT_CHORD_COLORS } from '../state/settings.js';
import { runtime } from '../state/runtime.js';
import { SF_URLS, applyAudioDefaults } from '../audio/index.js';
import { getMetronomeState, applyMetronomeState } from '../input/index.js';
import {
    draft, commit, type Draft, setAnimSize, setAnimColor, setAnimDoubleLeftColor, setAnimDoubleRightColor,
    setAnimDoubleSplitTuts, setAnimKeyShade, setMaterialById, setAnimColorMode, setGradientColorCount,
    setGradientIntensity, setGradientAxis, setAnimShape, setAnimRoundness, setNoteOpacity, setNoteSpeed,
    setKeyDustIntensity, setStrikeLineColor, setStrikeLineLeftColor, setStrikeLineRightColor,
    setStrikeLineSplitTuts, setDustColor, setDustDoubleLeftColor, setDustDoubleRightColor,
    setDustDoubleSplitTuts, setStrikeReactionIntensity, setStrikeLineAuraSize, setStrikeLineVisualSetting,
    setParticleSetting, setDustBlendMode, setMotionSpeed, setPianoHeightPercent, setBlackKeyWidthPercent,
    setBlackKeyHeightPercent, setBlackKeyEdgeDepthPercent, setPianoVisibilityPercent, setPianoLift,
    setWhiteKeyColor, setBlackKeyColor, setKeyGlowEnabled, setKeyGlowIntensity, setNoteGlowEnabled,
    setNoteGlowIntensity, setChordTextScale, setKeyLabelScale, setChordDisplayColors, setPianoTheme,
    setBgFitMode, setBgPositionMode, applyGraphicQuality, defaultPianoHeightPercent,
    midiToTuts, STRING_TUTS_MIDI_OFFSET,
} from './actions.js';
import { setBgSlider } from './background.js';
import { NO_COLOR, normalizeHexColor } from './color.js';
import { showToast } from './toast.js';
import { toggle, setVisualPanelPage } from './panels.js';
import { byId } from './dom.js';

const STRING_RANGE_SETTINGS_VERSION = 2;
// Presets older than this came from the old particle/strike engine.
const FX_SETTINGS_VERSION = 4;
const STRING_FADE_DEFAULT = 5.0;
const STORAGE_RESET_KEYS = ['papiano_memory_autosave_v2', 'papiano_memory_options_v2', 'papiano_settings'];
const STORAGE_SCHEMA_VERSION = 2;

const LABEL_MODES = ['off', 'note', 'qwerty', 'octave', 'number', 'solfege', 'japanese'];
const CHORD_TIERS: readonly string[] = ['basic', 'medium', 'pro', 'expert', 'max'];

// Style (material) and Colour Mode used to be one "animStyle" value. Every
// legacy alias resolves to a current material; a few also imply a Colour Mode.
const LEGACY_STYLE: Record<string, string> = {
    default: 'single', single: 'single', metalic: 'single', crystal3d: 'single', clean: 'single', cleanNeon: 'single',
    rainbow2: 'single', rainbowV2: 'single', rainbow: 'single', glow: 'single', neon: 'single', double: 'single',
    gradient: 'single',
    batik: 'single', // retired, no visual replacement
    // Retired materials resolve onto Glass, the closest current replacement.
    glass: 'glass', glassmorphism: 'glass', holographic: 'glass', glossy: 'glass',
    metallic: 'glass', flake: 'glass', liquid: 'glass', liquid1: 'glass', liquid2: 'glass',
    bronze: 'glass', clarity: 'glass', copper: 'glass', crystal: 'glass',
};
const LEGACY_STYLE_TO_MODE: Record<string, string> = { rainbow2: 'rainbow', rainbowV2: 'rainbow', rainbow: 'rainbow', double: 'double' };
const STYLE_BUTTON: Record<string, string> = { single: 'mSingle', outline: 'mOutline', midnight: 'mMidnight', glass: 'mGlass', chrome: 'mChrome' };
const own = (o: object, k: unknown): boolean => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);

/** Pre-tiering chord vocabulary (off/basic/pro) -> current tiers; unknown -> null. */
function migrateLegacyChordMode(raw: unknown): ChordTier | null {
    if (raw === 'off') return 'off';
    if (raw === 'basic') return 'medium';
    if (raw === 'pro') return 'max';
    return null;
}
/** setChordMode's normalisation: unknown tokens settle on 'expert'. */
function normalizeChordTier(mode: unknown): ChordTier {
    if (mode === 'off') return 'off';
    return CHORD_TIERS.includes(mode as string) ? mode as ChordTier : 'expert';
}

type Preset = Record<string, unknown> & Partial<Settings>;

/** Snapshot saved into a preset slot. */
export function getCurrentSettings(): Record<string, unknown> {
    const s = settings.get();
    const { metronome: _metronome, ...rest } = s;
    void _metronome;
    return JSON.parse(JSON.stringify({
        ...rest,
        stringRangeSettingsVersion: STRING_RANGE_SETTINGS_VERSION,
        fxSettingsVersion: FX_SETTINGS_VERSION,
        reverbLevel: 0,
        reverbEnabled: false,
        strikeLineMotion: 'static',
        performanceMode: 'manual',
        metronome: getMetronomeState(),
    })) as Record<string, unknown>;
}

function clampTutsRange(left: unknown, right: unknown): [number, number] {
    let l = midiToTuts(left || 21);
    let r = midiToTuts(right || 108);
    if (l > r) { const t = l; l = r; r = t; }
    return [l + STRING_TUTS_MIDI_OFFSET, r + STRING_TUTS_MIDI_OFFSET];
}

/** The original applySettings, as a migration onto a draft of the current settings. */
function migratePreset(raw: Preset, d: Draft): void {
    let s: Preset = raw;
    // Old particle/strike engine: drop its calibration sliders so the new
    // engine's defaults apply. Colours and toggles are the user's intent.
    if (Number(s.fxSettingsVersion || 0) < FX_SETTINGS_VERSION) {
        s = { ...s };
        for (const k of ['particleCount', 'particleSize', 'particleOpacity', 'particleSpeed', 'particleTurbulence', 'particleFade',
            'strikeLineBrightness', 'strikeLineOpacity', 'strikeLineAuraSize', 'strikeLineDustSize', 'strikeLineDustAmount', 'dustBlendMode',
            'dustColor', 'motionSpeed', 'strikeReactionEnabled', 'strikeReactionIntensity']) delete s[k];
    }
    const wc = Number(s.wCount);
    d.wCount = (Number.isFinite(wc) && wc >= 3 && wc <= 52) ? wc : 52;
    if (s.transpose !== undefined) d.transpose = Math.max(-12, Math.min(12, s.transpose as number));
    if (s.animSize !== undefined) {
        // Legacy presets stored Note Size as px capped at 20; scale onto 0-100%.
        const rawSize = Number(s.animSize);
        setAnimSize(d, Number.isFinite(rawSize) && rawSize <= 20 ? Math.round((rawSize / 20) * 100) : rawSize);
    }
    if (s.labelMode !== undefined) d.labelMode = LABEL_MODES.includes(s.labelMode as string) ? s.labelMode as string : 'octave';

    // Audio
    const fx = d.sfEffectSettings;
    const sfx = s.sfEffectSettings as { sf1?: object; sf2?: Record<string, unknown> } | undefined;
    if (sfx) {
        if (sfx.sf1) Object.assign(fx.sf1, sfx.sf1);
        if (sfx.sf2) {
            const loadedSf2: Record<string, unknown> = { ...sfx.sf2 };
            if (loadedSf2.fadeSec === undefined && loadedSf2.sustain !== undefined) loadedSf2.fadeSec = Math.max(0.1, Math.min(10.0, (loadedSf2.sustain as number) * 10.0));
            delete loadedSf2.sustain;
            Object.assign(fx.sf2, loadedSf2);
        }
    } else if (s.sustainLevel !== undefined) {
        fx.sf1.sustain = s.sustainLevel as number;
    }
    if (s.pianoVolume !== undefined) d.pianoVolume = Math.min(1, s.pianoVolume as number);
    else if (s.masterVolume !== undefined) d.pianoVolume = Math.min(1, s.masterVolume as number);
    if (s.stringVolume !== undefined) d.stringVolume = s.stringVolume as number;
    d.manualSustainEnabled = !!s.manualSustainEnabled;
    if (Number(s.stringRangeSettingsVersion || 0) < STRING_RANGE_SETTINGS_VERSION) {
        d.stringRangeLeft = 21;
        d.stringRangeRight = 108;
    } else {
        if (s.stringRangeLeft !== undefined) d.stringRangeLeft = s.stringRangeLeft as number;
        if (s.stringRangeRight !== undefined) d.stringRangeRight = s.stringRangeRight as number;
    }
    [d.stringRangeLeft, d.stringRangeRight] = clampTutsRange(d.stringRangeLeft, d.stringRangeRight);
    d.stringEnabled = !!s.stringEnabled;
    // applyCurrentSfEffects
    d.sustainLevel = Math.max(0, Math.min(1, fx.sf1.sustain || 0));
    if (fx.sf2.fadeSec === undefined) fx.sf2.fadeSec = STRING_FADE_DEFAULT;
    if (fx.sf2.transpose === undefined) fx.sf2.transpose = 0;

    // Falling notes
    if (s.isAnimOn !== undefined) d.isAnimOn = !!s.isAnimOn;
    // A saved customAnimNote (even white) restores as the user's choice;
    // older presets take the legacy value path.
    if (s.customAnimNote !== undefined) setAnimColor(d, (s.customAnimNote as string | null) || '#ffffff', s.customAnimNote ? 'user' : 'reset');
    else setAnimColor(d, s.animColor !== undefined ? s.animColor as string : '#ffffff', null);
    setAnimDoubleLeftColor(d, s.animDoubleLeftColor !== undefined ? s.animDoubleLeftColor : '#0099ff');
    setAnimDoubleRightColor(d, s.animDoubleRightColor !== undefined ? s.animDoubleRightColor : '#0099ff');
    setAnimDoubleSplitTuts(d, s.animDoubleSplitTuts !== undefined ? s.animDoubleSplitTuts : 44);
    setAnimKeyShade(d, s.animKeyShade !== undefined ? s.animKeyShade : true);
    if (s.material !== undefined) {
        const resolved = own(LEGACY_STYLE, s.material) ? LEGACY_STYLE[s.material as string]! : s.material;
        setMaterialById(d, own(STYLE_BUTTON, resolved) ? STYLE_BUTTON[resolved as string]! : 'mSingle');
    }
    if (s.animColorMode !== undefined) setAnimColorMode(d, s.animColorMode);
    else if (s.material !== undefined && own(LEGACY_STYLE_TO_MODE, s.material)) setAnimColorMode(d, LEGACY_STYLE_TO_MODE[s.material as string]);
    else if (s.animColorSplit !== undefined) setAnimColorMode(d, s.animColorSplit ? 'double' : 'single');
    else setAnimColorMode(d, 'single');
    if (Array.isArray(s.gradientColors)) {
        const gc = s.gradientColors as unknown[];
        d.gradientColors = [0, 1, 2].map(i => normalizeHexColor(gc[i]) || d.gradientColors[i]!);
    }
    setGradientColorCount(d, s.gradientColorCount !== undefined ? s.gradientColorCount : 2);
    setGradientIntensity(d, s.gradientIntensity !== undefined ? s.gradientIntensity : 70);
    setGradientAxis(d, s.gradientAxis !== undefined ? s.gradientAxis : 'horizontal');
    if (s.animShape !== undefined) setAnimShape(d, s.animShape);
    setAnimRoundness(d, s.animRoundness !== undefined ? s.animRoundness : d.animRoundness);
    setNoteOpacity(d, s.noteOpacity !== undefined ? s.noteOpacity : d.noteOpacity);
    setNoteSpeed(d, s.noteSpeed !== undefined ? s.noteSpeed : d.noteSpeed);

    // Strike line & particles
    setKeyDustIntensity(d, s.keyDustIntensity !== undefined ? s.keyDustIntensity : d.keyDustIntensity);
    setStrikeLineColor(d, s.strikeLineColor !== undefined ? s.strikeLineColor : d.strikeLineColor);
    setStrikeLineLeftColor(d, s.strikeLineLeftColor !== undefined ? s.strikeLineLeftColor : '#0099ff');
    setStrikeLineRightColor(d, s.strikeLineRightColor !== undefined ? s.strikeLineRightColor : '#0099ff');
    setStrikeLineSplitTuts(d, s.strikeLineSplitTuts !== undefined ? s.strikeLineSplitTuts : 44);
    d.strikeLineColorSplit = !!s.strikeLineColorSplit;
    d.strikeLineColorFollowFallingNotes = !!s.strikeLineColorFollowFallingNotes;
    d.keyColorFollowFallingNotes = !!s.keyColorFollowFallingNotes;
    setDustColor(d, s.dustColor !== undefined ? s.dustColor : d.dustColor);
    setDustDoubleLeftColor(d, s.dustDoubleLeftColor !== undefined ? s.dustDoubleLeftColor : '#0099ff');
    setDustDoubleRightColor(d, s.dustDoubleRightColor !== undefined ? s.dustDoubleRightColor : '#0099ff');
    setDustDoubleSplitTuts(d, s.dustDoubleSplitTuts !== undefined ? s.dustDoubleSplitTuts : 44);
    d.dustColorSplit = !!s.dustColorSplit;
    d.dustColorFollowFallingNotes = !!s.dustColorFollowFallingNotes;
    if (s.strikeLineEnabled !== undefined) d.strikeLineEnabled = !!s.strikeLineEnabled;
    if (s.strikeReactionEnabled !== undefined) d.strikeReactionEnabled = !!s.strikeReactionEnabled;
    setStrikeReactionIntensity(d, s.strikeReactionIntensity !== undefined ? s.strikeReactionIntensity : d.strikeReactionIntensity);
    if (s.strikeLineDustEnabled !== undefined) d.strikeLineDustEnabled = !!s.strikeLineDustEnabled;
    setStrikeLineAuraSize(d, s.strikeLineAuraSize !== undefined ? s.strikeLineAuraSize : d.strikeLineAuraSize);
    setStrikeLineVisualSetting(d, 'brightness', s.strikeLineBrightness !== undefined ? s.strikeLineBrightness : d.strikeLineBrightness);
    setStrikeLineVisualSetting(d, 'opacity', s.strikeLineOpacity !== undefined ? s.strikeLineOpacity : d.strikeLineOpacity);
    setStrikeLineVisualSetting(d, 'saturation', s.strikeLineSaturation !== undefined ? s.strikeLineSaturation : d.strikeLineSaturation);
    if (s.strikeLineDustSize !== undefined) setParticleSetting(d, 'size', s.strikeLineDustSize);
    else if (s.strikeLineDustAmount !== undefined) {
        const amount = Number(s.strikeLineDustAmount);
        setParticleSetting(d, 'size', amount <= 2 ? [25, 50, 100][Math.max(0, Math.min(2, Math.round(amount || 0)))] : s.strikeLineDustAmount);
    } else setParticleSetting(d, 'size', d.strikeLineDustSize);
    setParticleSetting(d, 'count', s.particleCount !== undefined ? s.particleCount : d.particleCount);
    setParticleSetting(d, 'size', s.particleSize !== undefined ? s.particleSize : d.strikeLineDustSize);
    setParticleSetting(d, 'opacity', s.particleOpacity !== undefined ? s.particleOpacity : d.particleOpacity);
    setParticleSetting(d, 'speed', s.particleSpeed !== undefined ? s.particleSpeed : d.particleSpeed);
    setParticleSetting(d, 'turbulence', s.particleTurbulence !== undefined ? s.particleTurbulence : d.particleTurbulence);
    setParticleSetting(d, 'saturation', s.particleSaturation !== undefined ? s.particleSaturation : d.particleSaturation);
    setParticleSetting(d, 'fade', s.particleFade !== undefined ? s.particleFade : d.particleFade);
    setDustBlendMode(d, s.dustBlendMode !== undefined ? s.dustBlendMode : d.dustBlendMode);
    setMotionSpeed(d, s.motionSpeed !== undefined ? s.motionSpeed : d.motionSpeed);
    d.currentGlassColor = normalizeHexColor(s.currentGlassColor) || '#ffffff';

    // Piano geometry. A preset either carries a height or it does not.
    const savedPianoHeight = Number(s.pianoHeight);
    setPianoHeightPercent(d, Number.isFinite(savedPianoHeight) ? savedPianoHeight : defaultPianoHeightPercent());
    setBlackKeyWidthPercent(d, s.blackKeyWidthPercent !== undefined ? s.blackKeyWidthPercent : 100);
    setBlackKeyHeightPercent(d, s.blackKeyHeightPercent !== undefined ? s.blackKeyHeightPercent : 60);
    setBlackKeyEdgeDepthPercent(d, s.blackKeyEdgeDepthPercent !== undefined ? s.blackKeyEdgeDepthPercent : 40);
    setPianoVisibilityPercent(d, s.pianoVisibilityPercent !== undefined ? s.pianoVisibilityPercent : 100);
    setPianoLift(d, s.pianoLiftPercent !== undefined ? s.pianoLiftPercent : 0);

    // Key colours
    if (s.customWhiteKey !== undefined) setWhiteKeyColor(d, (s.customWhiteKey as string | null) || NO_COLOR, s.customWhiteKey ? 'user' : 'reset');
    else setWhiteKeyColor(d, s.accentWhite !== undefined ? s.accentWhite as string : NO_COLOR, null);
    if (s.customBlackKey !== undefined) setBlackKeyColor(d, (s.customBlackKey as string | null) || NO_COLOR, s.customBlackKey ? 'user' : 'reset');
    else setBlackKeyColor(d, s.accentBlack !== undefined ? s.accentBlack as string : NO_COLOR, null);
    setKeyGlowEnabled(d, s.keyGlowEnabled !== undefined ? !!s.keyGlowEnabled : false);
    setKeyGlowIntensity(d, s.keyGlowIntensity !== undefined ? s.keyGlowIntensity : 50);
    setNoteGlowEnabled(d, s.noteGlowEnabled !== undefined ? !!s.noteGlowEnabled : false);
    setNoteGlowIntensity(d, s.noteGlowIntensity !== undefined ? s.noteGlowIntensity : 35);
    d.octaveLinesEnabled = s.octaveLinesEnabled !== undefined ? !!s.octaveLinesEnabled : true;
    setChordTextScale(d, s.chordTextScale !== undefined ? s.chordTextScale : 100);
    setKeyLabelScale(d, s.keyLabelScale !== undefined ? s.keyLabelScale : 100);
    if (s.customChordColor !== undefined) setChordDisplayColors(d, s.chordDisplayColors || DEFAULT_CHORD_COLORS, s.customChordColor ? 'user' : 'reset');
    else if (s.chordDisplayColors) setChordDisplayColors(d, s.chordDisplayColors, null);
    if (s.pianoTheme !== undefined) setPianoTheme(d, s.pianoTheme, false);

    // Chord tier: new field first, then the pre-rollout 3-tier field.
    if (s.chordDetectorTier !== undefined) d.chordDetectorTier = normalizeChordTier(s.chordDetectorTier);
    else if (s.chordDetectorMode !== undefined) {
        const legacy = migrateLegacyChordMode(s.chordDetectorMode);
        if (legacy) d.chordDetectorTier = normalizeChordTier(legacy);
    }
    d.autoVelocityEnabled = s.autoVelocityEnabled !== undefined ? !!s.autoVelocityEnabled : false;
    if (s.autoVelocityMode !== undefined) {
        const m = s.autoVelocityMode;
        d.autoVelocityMode = (m === 'arpeggio' || m === 'block' || m === 'mix') ? m : 'mix';
    }
    if (s.perfHudEnabled !== undefined) d.perfHudEnabled = !!s.perfHudEnabled;
    // Only Potato and Default exist; old 'ultra' maps to Default, every other tier to Potato.
    if (s.graphicQuality !== undefined) applyGraphicQuality(d, (s.graphicQuality === 'default' || (s.graphicQuality as unknown) === 'ultra') ? 'default' : 'potato', false);
    if (s.bgFitMode) setBgFitMode(d, s.bgFitMode);
    if (s.bgPositionMode) setBgPositionMode(d, s.bgPositionMode);
    if (s.bgOpacity !== undefined) setBgSlider(d, 'bgOpacity', s.bgOpacity);
    if (s.bgDim !== undefined) setBgSlider(d, 'bgDim', s.bgDim);
    if (s.bgBlur !== undefined) setBgSlider(d, 'bgBlur', s.bgBlur);
    if (s.currentSf && own(SF_URLS, s.currentSf)) d.currentSf = s.currentSf as string;
    if (s.currentStringSf && own(SF_URLS, s.currentStringSf)) d.currentStringSf = s.currentStringSf as string;
}

export function applySettings(s: unknown): void {
    if (!s || typeof s !== 'object') return;
    const preset = s as Preset;
    try {
        const d = draft();
        migratePreset(preset, d);
        commit(d);
        if (preset.metronome) applyMetronomeState(preset.metronome);
    } catch { /* a malformed preset leaves the current settings as they were */ }
}

// ── Factory defaults ────────────────────────────────────────────────────────
/**
 * Reset Defaults. Mirrors applyFactoryDefaults: everything back to the
 * defaults EXCEPT what the original never reset (Falling Notes on/off, the
 * performance HUD, background fit/position/sliders, metronome), with the
 * colour setters' "custom" derivation, the Default theme switch (which
 * restores FX toggles saved before entering Sketch/8-bit) and the Default
 * graphics tier's FX defaults applied last, in the original order.
 */
export function applyFactoryDefaults(clearSavedState: boolean): void {
    const cur = settings.get();
    const def = defaultSettings();
    const d: Draft = {
        ...def,
        pianoTheme: cur.pianoTheme,
        isAnimOn: cur.isAnimOn,
        perfHudEnabled: cur.perfHudEnabled,
        bgFitMode: cur.bgFitMode,
        bgPositionMode: cur.bgPositionMode,
        bgOpacity: cur.bgOpacity,
        bgDim: cur.bgDim,
        bgBlur: cur.bgBlur,
    };
    if (cur.metronome !== undefined) d.metronome = cur.metronome;
    deriveDefaultColors(d);
    setPianoHeightPercent(d, d.pianoHeight);
    setBlackKeyEdgeDepthPercent(d, d.blackKeyEdgeDepthPercent);
    setPianoTheme(d, 'default', true);
    setChordDisplayColors(d, DEFAULT_CHORD_COLORS, null);
    applyGraphicQuality(d, 'auto', true);
    // Audio engine state (sustain latch/pedal, layer, soundfont selection).
    applyAudioDefaults();
    commit(d);
    runtime.set({ viewOffset: 0 });
    if (clearSavedState) clearStoredSettings();
}

/** The default colours go through the setters with no intent, which marks non-white ones as custom. */
function deriveDefaultColors(d: Draft): void {
    setAnimColor(d, '#0099ff', null);
    setWhiteKeyColor(d, DEFAULT_ACCENT_WHITE, null);
    setBlackKeyColor(d, DEFAULT_ACCENT_BLACK, null);
    setChordDisplayColors(d, DEFAULT_CHORD_COLORS, null);
}

/** Boot: the original ran applyFactoryDefaults once at startup, leaving the custom* flags derived. */
export function applyBootDefaults(): void {
    const s = settings.get();
    if (s.customWhiteKey || s.customBlackKey || s.customAnimNote || s.customChordColor) return;
    const d = draft();
    setAnimColor(d, d.animColor, null);
    setWhiteKeyColor(d, d.accentWhite, null);
    setBlackKeyColor(d, d.accentBlack, null);
    setChordDisplayColors(d, d.chordDisplayColors, null);
    commit(d);
}

// ── Legacy storage helpers ──────────────────────────────────────────────────
export function clearStoredSettings(): void {
    for (const key of STORAGE_RESET_KEYS) {
        try { localStorage.removeItem(key); } catch { /* ignore */ }
    }
}
export function normalizeStoredPayload(payload: unknown): Record<string, unknown> | null {
    if (!payload || typeof payload !== 'object') return null;
    const p = payload as { version?: unknown; data?: unknown };
    if (p.version !== STORAGE_SCHEMA_VERSION || !p.data || typeof p.data !== 'object') return null;
    return p.data as Record<string, unknown>;
}
export function readStoredPayload(key: string): Record<string, unknown> | null {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return normalizeStoredPayload(JSON.parse(raw));
}
export function writeStoredPayload(key: string, data: unknown): void {
    localStorage.setItem(key, JSON.stringify({ version: STORAGE_SCHEMA_VERSION, savedAt: Date.now(), data }));
}

export function notifyPreset(message: string, type: 'success' | 'error' | 'info' = 'success'): void {
    showToast(message, { type, title: 'Preset' });
}

export function resetDefaultsFromMemory(): void {
    applyFactoryDefaults(true);
    notifyPreset('Defaults restored');
}

function bindMemoryControls(): void {
    byId('memoryResetDefaultsBtn')?.addEventListener('click', resetDefaultsFromMemory);
    byId('resetBtn')?.addEventListener('click', resetDefaultsFromMemory);
    // "Save My Preset" in Tools opens the Preset subpage (saving needs a name).
    byId('saveBtn')?.addEventListener('click', () => {
        setVisualPanelPage('preset');
        toggle('colorPanel');
    });
}

// ── Preset slots (this browser's localStorage) ─────────────────────────────
interface PresetSlot { id: string; name: string; data: unknown }

function initPresetLocal(): void {
    const PRESET_STORAGE_KEY = 'soloPianoPresets';
    const PRESET_MAX_SLOTS = 5;
    let presetSlots: PresetSlot[] = [];
    const slotListEl = byId('presetSlotList');
    const emptyHintEl = byId('presetEmptyHint');
    const countBadgeEl = byId('presetCountBadge');
    const newRowEl = byId('presetNewRow');
    const maxHintEl = byId('presetMaxHint');
    const newNameInputEl = byId<HTMLInputElement>('presetNewNameInput');
    const saveNewBtnEl = byId('presetSaveNewBtn');
    const confirmModalEl = byId('presetConfirmModal');
    const confirmTitleEl = byId('presetConfirmTitle');
    const confirmTextEl = byId('presetConfirmText');
    const confirmYesEl = byId('presetConfirmYes');
    const confirmNoEl = byId('presetConfirmNo');
    let confirmYesHandler: (() => void) | null = null;

    const escapeHtml = (s: unknown): string =>
        String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

    // In-panel Yes/No confirmation before saving or deleting a preset.
    const showPresetConfirm = (title: string, text: string, onYes: () => void, opts: { yesLabel?: string; danger?: boolean }): void => {
        if (!confirmModalEl || !confirmYesEl) { onYes(); return; }
        if (confirmTitleEl) confirmTitleEl.textContent = title;
        if (confirmTextEl) confirmTextEl.textContent = text;
        confirmYesEl.textContent = opts.yesLabel || 'Yes';
        confirmYesEl.classList.toggle('preset-confirm-danger', !!opts.danger);
        confirmYesHandler = onYes;
        confirmModalEl.style.display = '';
    };
    const hidePresetConfirm = (): void => {
        if (!confirmModalEl) return;
        confirmModalEl.style.display = 'none';
        confirmYesHandler = null;
    };
    confirmYesEl?.addEventListener('click', () => {
        const fn = confirmYesHandler;
        hidePresetConfirm();
        if (typeof fn === 'function') fn();
    });
    confirmNoEl?.addEventListener('click', hidePresetConfirm);

    const parsePresetField = (raw: unknown): PresetSlot[] => {
        if (Array.isArray(raw)) return raw as PresetSlot[];
        if (typeof raw === 'string') {
            try { const p: unknown = JSON.parse(raw); return Array.isArray(p) ? p as PresetSlot[] : []; } catch { return []; }
        }
        return [];
    };

    const svgLoad = '<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z" /></svg>';
    const svgDelete = '<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6" /></svg>';
    const renderPresetSlots = (): void => {
        if (!slotListEl) return;
        if (countBadgeEl) countBadgeEl.textContent = presetSlots.length + '/' + PRESET_MAX_SLOTS;
        if (emptyHintEl) emptyHintEl.style.display = presetSlots.length ? 'none' : '';
        if (newRowEl) newRowEl.style.display = presetSlots.length >= PRESET_MAX_SLOTS ? 'none' : '';
        if (maxHintEl) maxHintEl.style.display = presetSlots.length >= PRESET_MAX_SLOTS ? '' : 'none';
        slotListEl.innerHTML = presetSlots.map(slot => (
            '<div class="preset-slot-row" data-preset-id="' + slot.id + '">' +
                '<span class="preset-slot-name">' + escapeHtml(slot.name) + '</span>' +
                '<button class="preset-slot-btn preset-slot-load-btn" type="button" title="Load preset" data-action="load">' + svgLoad + '</button>' +
                '<button class="preset-slot-btn preset-slot-delete-btn" type="button" title="Delete preset" data-action="delete">' + svgDelete + '</button>' +
            '</div>'
        )).join('');
    };
    const fetchPresetSlots = (): void => {
        let raw: string | null = null;
        try { raw = localStorage.getItem(PRESET_STORAGE_KEY); } catch { /* ignore */ }
        presetSlots = parsePresetField(raw);
        renderPresetSlots();
    };
    const storePresetSlots = (): boolean => {
        try {
            localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(presetSlots));
            return true;
        } catch {
            return false;
        }
    };
    const doSaveNewPresetSlot = (cleanName: string): void => {
        const slot: PresetSlot = {
            id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
            name: cleanName,
            data: getCurrentSettings(),
        };
        presetSlots.push(slot);
        if (!storePresetSlots()) {
            presetSlots.pop();
            notifyPreset('Failed to save', 'error');
            return;
        }
        renderPresetSlots();
        notifyPreset('Saved "' + cleanName + '"');
        if (newNameInputEl) newNameInputEl.value = '';
    };
    const saveNewPresetSlot = (name: string): void => {
        if (presetSlots.length >= PRESET_MAX_SLOTS) { notifyPreset('Max ' + PRESET_MAX_SLOTS + ' presets — delete one first', 'error'); return; }
        const cleanName = String(name || '').trim().slice(0, 60) || 'Untitled';
        showPresetConfirm('Save preset?', 'Save your current piano settings as "' + cleanName + '"?', () => doSaveNewPresetSlot(cleanName), { yesLabel: 'Save' });
    };
    const loadPresetSlot = (id: string): void => {
        const slot = presetSlots.find(s => s.id === id);
        if (!slot) { notifyPreset('Preset not found', 'error'); return; }
        try {
            applySettings(slot.data);
            notifyPreset('Loaded "' + slot.name + '"');
        } catch {
            notifyPreset('Failed to load preset', 'error');
        }
    };
    const deletePresetSlotLocal = (id: string): void => {
        const prev = presetSlots;
        presetSlots = presetSlots.filter(s => s.id !== id);
        if (!storePresetSlots()) {
            presetSlots = prev;
            notifyPreset('Failed to delete', 'error');
            return;
        }
        renderPresetSlots();
        notifyPreset('Preset deleted');
    };

    slotListEl?.addEventListener('click', ev => {
        const btn = (ev.target as Element).closest<HTMLElement>('.preset-slot-btn');
        if (!btn) return;
        const row = btn.closest<HTMLElement>('.preset-slot-row');
        const id = row && row.dataset.presetId;
        if (!id) return;
        if (btn.classList.contains('preset-slot-load-btn')) {
            loadPresetSlot(id);
        } else if (btn.classList.contains('preset-slot-delete-btn')) {
            const slot = presetSlots.find(s => s.id === id);
            const label = slot ? slot.name : 'this preset';
            showPresetConfirm('Delete preset?', 'Delete "' + label + '"? This cannot be undone.', () => deletePresetSlotLocal(id), { yesLabel: 'Delete', danger: true });
        }
    });
    saveNewBtnEl?.addEventListener('click', () => saveNewPresetSlot(newNameInputEl ? newNameInputEl.value : ''));
    newNameInputEl?.addEventListener('keydown', ev => {
        if (ev.key === 'Enter') { ev.preventDefault(); saveNewPresetSlot(newNameInputEl.value); }
    });
    fetchPresetSlots();
}

export function initPresets(): void {
    bindMemoryControls();
    initPresetLocal();
    // Boot sequence of the original: drop any legacy stored settings.
    clearStoredSettings();
}
