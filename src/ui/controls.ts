// Visual / Piano / Tools panel controls. Each control writes through an
// actions.ts setter (same clamping as the original), and every control's UI
// (active classes, toggle tracks, slider values, labels, row visibility)
// re-syncs from `settings` by subscription — so a preset load or Reset
// Defaults updates everything with no extra code.

import { settings, type Settings } from '../state/settings.js';
import { stopAllNotes } from '../core/performance.js';
import {
    update, type Draft, type ParticleSetting, type StrikeVisual,
    MATERIAL_BUTTONS, setAnimSize, setAnimRoundness, setNoteOpacity, setNoteSpeed, setAnimColor,
    setAnimDoubleLeftColor, setAnimDoubleRightColor, setAnimDoubleSplitTuts, setAnimKeyShade, setAnimColorMode,
    setGradientColorCount, setGradientColor, setGradientIntensity, setGradientAxis, setMaterialById,
    setNoteGlowEnabled, setNoteGlowIntensity, setKeyDustIntensity, setStrikeLineColor, setStrikeLineLeftColor,
    setStrikeLineRightColor, setStrikeLineSplitTuts, setStrikeLineAuraSize, setStrikeLineVisualSetting,
    setMotionSpeed, setStrikeLineFx, setStrikeReactionIntensity, setParticleSetting, setDustColor,
    setDustDoubleLeftColor, setDustDoubleRightColor, setDustDoubleSplitTuts, setDustBlendMode,
    setKeyGlowEnabled, setKeyGlowIntensity, setWhiteKeyColor, setBlackKeyColor,
    setPianoTheme, applyGraphicQuality, setKeyLabelScale, setBlackKeyWidthPercent,
    setBlackKeyHeightPercent, setBlackKeyEdgeDepthPercent, setPianoVisibilityPercent, setPianoHeightPercent,
    setPianoLift, setTranspose,
} from './actions.js';
import { mountColorPad, updateColorPadValue, type ColorIntent } from './color.js';
import { byId, setText, setActive, setShown, slider, syncSlider, onClick, onInput, watch } from './dom.js';

const pct = (n: number): string => n + '%';

function bindRange(ids: readonly string[], fn: (d: Draft, value: string) => void): void {
    for (const id of ids) onInput(id, value => update(d => fn(d, value)));
}
function bindToggle(ids: readonly string[], fn: (d: Draft, s: Readonly<Settings>) => void): void {
    for (const id of ids) onClick(id, () => update(d => fn(d, settings.get())));
}
/** Keeps a set of sliders + labels showing one numeric setting. */
function watchSliders(key: keyof Settings, pairs: readonly [string, string | null][], format: (n: number) => string, toSlider: (n: number) => number = n => n): void {
    const bindings = pairs.map(([r, l]) => slider(r, l));
    watch([key], s => {
        const n = s[key] as number;
        const shown = toSlider(n);
        for (const b of bindings) syncSlider(b, shown, format(shown));
    });
}
function watchTrack(key: keyof Settings, ids: readonly string[]): void {
    const els = ids.map(id => byId(id));
    watch([key], s => { for (const el of els) setActive(el, !!s[key]); });
}

// ── Piano panel / Tools "Piano" ─────────────────────────────────────────────
function bindPianoControls(): void {
    bindRange(['blackKeyWidthRange'], setBlackKeyWidthPercent);
    bindRange(['blackKeyHeightRange'], setBlackKeyHeightPercent);
    bindRange(['blackKeyEdgeDepthRange'], setBlackKeyEdgeDepthPercent);
    bindRange(['pianoVisibilityRange'], setPianoVisibilityPercent);
    watchSliders('blackKeyWidthPercent', [['blackKeyWidthRange', 'blackKeyWidthVal']], pct);
    watchSliders('blackKeyHeightPercent', [['blackKeyHeightRange', 'blackKeyHeightVal']], pct);
    watchSliders('blackKeyEdgeDepthPercent', [['blackKeyEdgeDepthRange', 'blackKeyEdgeDepthVal']], pct);
    watchSliders('pianoVisibilityPercent', [['pianoVisibilityRange', 'pianoVisibilityVal']], pct);

    // Two sliders drive Piano Height (Tools + Piano panel).
    for (const id of ['hRange', 'keyPanelHRange']) {
        const el = byId<HTMLInputElement>(id);
        if (!el) continue;
        const apply = (): void => update(d => setPianoHeightPercent(d, el.value));
        el.addEventListener('input', apply);
        el.addEventListener('change', apply);
    }
    watchSliders('pianoHeight', [['hRange', 'hVal'], ['keyPanelHRange', 'keyPanelHVal']], pct);

    const lift = byId<HTMLInputElement>('pianoLiftRange');
    if (lift) {
        const apply = (): void => update(d => setPianoLift(d, lift.value));
        lift.addEventListener('input', apply);
        lift.addEventListener('change', apply);
    }
    watchSliders('pianoLiftPercent', [['pianoLiftRange', 'pianoLiftVal']], pct);

    // Key labels (main panel + Tools copy).
    document.querySelectorAll<HTMLElement>('.label-selector-vertical').forEach(selector => {
        selector.addEventListener('click', ev => {
            const opt = (ev.target as Element).closest<HTMLElement>('.label-option-vertical');
            if (opt && selector.contains(opt)) settings.set({ labelMode: opt.dataset.mode ?? '' });
        });
    });
    const labelOptions = Array.from(document.querySelectorAll<HTMLElement>('.label-option-vertical'));
    watch(['labelMode'], s => { for (const opt of labelOptions) setActive(opt, opt.dataset.mode === s.labelMode); });

    bindRange(['keyLabelSizeRange'], setKeyLabelScale);
    watchSliders('keyLabelScale', [['keyLabelSizeRange', 'keyLabelSizeVal']], pct);

    // Transpose stepper (toolbar).
    onClick('tUp', () => changeTranspose(1));
    onClick('tDown', () => changeTranspose(-1));
    const tVal = byId('tVal');
    watch(['transpose'], s => setText(tVal, String(s.transpose)));
}

/** Toolbar transpose (also used by the global arrow-key shortcut). */
export function changeTranspose(delta: number): void {
    update(d => setTranspose(d, d.transpose + delta));
    stopAllNotes();
}

// ── Falling notes ───────────────────────────────────────────────────────────
const COLOR_MODE_BUTTONS: Record<string, Settings['animColorMode']> = {
    mModeSingle: 'single', mModeDouble: 'double', mModeGradient: 'gradient', mModeRainbow: 'rainbow',
};
const GLOWLESS_MATERIALS = new Set(['outline', 'midnight']);

function bindNotesControls(): void {
    bindToggle(['animTrack', 'settingsAnimTrack'], (d, s) => { d.isAnimOn = !s.isAnimOn; });
    watchTrack('isAnimOn', ['animTrack', 'settingsAnimTrack']);
    bindToggle(['noteGlowTrack', 'settingsNoteGlowTrack'], (d, s) => setNoteGlowEnabled(d, !s.noteGlowEnabled));
    watchTrack('noteGlowEnabled', ['noteGlowTrack', 'settingsNoteGlowTrack']);
    bindToggle(['animKeyShadeTrack'], (d, s) => setAnimKeyShade(d, !s.animKeyShade));
    watchTrack('animKeyShade', ['animKeyShadeTrack']);

    bindRange(['sizeRange', 'settingsSizeRange'], setAnimSize);
    watchSliders('animSize', [['sizeRange', 'animSizeVal'], ['settingsSizeRange', 'settingsAnimSizeVal']], pct);
    bindRange(['animRoundRange'], setAnimRoundness);
    watchSliders('animRoundness', [['animRoundRange', 'animRoundVal']], pct);
    bindRange(['noteOpacityRange'], setNoteOpacity);
    watchSliders('noteOpacity', [['noteOpacityRange', 'noteOpacityVal']], pct);
    bindRange(['noteSpeedRange'], setNoteSpeed);
    watchSliders('noteSpeed', [['noteSpeedRange', 'noteSpeedVal']], pct);
    // The glow slider shows half the stored 0..200 intensity.
    bindRange(['noteGlowIntensityRange', 'settingsNoteGlowIntensityRange'], (d, v) => setNoteGlowIntensity(d, (parseInt(v, 10) || 0) * 2));
    watchSliders('noteGlowIntensity', [['noteGlowIntensityRange', 'noteGlowIntensityVal'], ['settingsNoteGlowIntensityRange', 'settingsNoteGlowIntensityVal']], pct, n => Math.round(n / 2));
    bindRange(['animDoubleSplitRange'], setAnimDoubleSplitTuts);
    watchSliders('animDoubleSplitTuts', [['animDoubleSplitRange', null]], String);

    // Colour Mode (Visual panel buttons + Tools copies).
    for (const [id, mode] of Object.entries(COLOR_MODE_BUTTONS)) {
        document.querySelectorAll<HTMLElement>(`[data-color-mode-target="${id}"], #${id}`).forEach(el => {
            el.addEventListener('click', () => update(d => setAnimColorMode(d, mode)));
        });
    }
    // Material (Visual panel buttons + Tools copies).
    for (const id of Object.keys(MATERIAL_BUTTONS)) onClick(id, () => update(d => setMaterialById(d, id)));
    const toolsMaterialBtns = Array.from(document.querySelectorAll<HTMLElement>('.settings-anim-style'));
    for (const btn of toolsMaterialBtns) btn.addEventListener('click', () => update(d => setMaterialById(d, btn.dataset.styleTarget ?? '')));

    const modeEls = Object.keys(COLOR_MODE_BUTTONS).map(id => [byId(id), COLOR_MODE_BUTTONS[id]] as const);
    const modeTargets = Array.from(document.querySelectorAll<HTMLElement>('[data-color-mode-target]'));
    const materialEls = Object.keys(MATERIAL_BUTTONS).map(id => [byId(id), MATERIAL_BUTTONS[id]] as const);
    const rows = {
        glow: ['rowNoteGlow', 'rowNoteGlowIntensity', 'rowSettingsNoteGlow'].map(id => byId(id)),
        keyShade: byId('rowAnimKeyShade'),
        color: byId('rowAnimColor'),
        split: byId('rowAnimDoubleSplit'),
        splitColors: byId('rowAnimDoubleColors'),
        gradient: ['rowAnimGradient', 'rowAnimGradientSettings', 'rowAnimAxis', 'rowAnimAxisSettings'].map(id => byId(id)),
    };
    // updateAnimModeControls + updateAnimMode
    watch(['material', 'animColorMode', 'animColorSplit'], s => {
        const glowOk = !GLOWLESS_MATERIALS.has(s.material);
        for (const el of rows.glow) setShown(el, glowOk);
        const showColor = s.animColorMode === 'single' && !s.animColorSplit;
        const showSplit = s.animColorMode === 'double' || s.animColorSplit;
        const showGradient = s.animColorMode === 'gradient';
        setShown(rows.keyShade, !(showGradient || s.animColorMode === 'rainbow'));
        setShown(rows.color, showColor);
        setShown(rows.split, showSplit);
        setActive(rows.split, showSplit);
        setShown(rows.splitColors, showSplit);
        setActive(rows.splitColors, showSplit);
        for (const el of rows.gradient) setShown(el, showGradient);
        for (const [el, mode] of modeEls) setActive(el, mode === s.animColorMode);
        for (const btn of modeTargets) setActive(btn, COLOR_MODE_BUTTONS[btn.dataset.colorModeTarget ?? ''] === s.animColorMode);
        for (const [el, mat] of materialEls) setActive(el, mat === s.material);
        for (const btn of toolsMaterialBtns) setActive(btn, MATERIAL_BUTTONS[btn.dataset.styleTarget ?? ''] === s.material);
    });

    // Gradient
    const spreadBtns = Array.from(document.querySelectorAll<HTMLElement>('.gradientSpread-btn, .settingsGradientSpread-btn'));
    for (const btn of spreadBtns) btn.addEventListener('click', () => update(d => setGradientColorCount(d, btn.dataset.count)));
    bindRange(['gradientIntensityRange', 'settingsGradientIntensityRange'], setGradientIntensity);
    watchSliders('gradientIntensity', [['gradientIntensityRange', 'gradientIntensityVal'], ['settingsGradientIntensityRange', 'settingsGradientIntensityVal']], pct);
    const axisBtns = Array.from(document.querySelectorAll<HTMLElement>('.gradient-axis-btn'));
    for (const btn of axisBtns) btn.addEventListener('click', () => update(d => setGradientAxis(d, btn.dataset.axis)));
    watch(['gradientAxis'], s => { for (const btn of axisBtns) setActive(btn, btn.dataset.axis === s.gradientAxis); });

    const gradientRows = [1, 2, 3].map(i => byId('rowGradientColor' + i));
    let editingGradientPad = false;
    // Pads are (re)mounted from the current colours whenever the stop count or
    // the colours change from outside the pads (preset / defaults), as the
    // original setGradientColorCount did; the Reset value is the colour at mount.
    const mountGradientPads = (s: Readonly<Settings>): void => {
        for (let i = 0; i < s.gradientColorCount; i++) {
            const idx = i;
            mountColorPad('gridGradientColor' + (idx + 1), `Color ${idx + 1}`, s.gradientColors[idx], c => {
                editingGradientPad = true;
                try { update(d => setGradientColor(d, idx, c)); } finally { editingGradientPad = false; }
                updateColorPadValue('gridGradientColor' + (idx + 1), settings.get().gradientColors[idx]);
            }, s.gradientColors[idx]!);
        }
    };
    settings.subscribe(['gradientColorCount', 'gradientColors'], (s, changed) => {
        if (changed.has('gradientColorCount') || !editingGradientPad) mountGradientPads(s);
    });
    watch(['gradientColorCount'], s => {
        for (const btn of spreadBtns) setActive(btn, Number(btn.dataset.count) === s.gradientColorCount);
        gradientRows.forEach((row, i) => setShown(row, i + 1 <= s.gradientColorCount));
    });
    mountGradientPads(settings.get());
}

// ── Strike line ─────────────────────────────────────────────────────────────
function bindStrikeLineControls(): void {
    // Two on/off toggles and two thickness sliders drive the same settings.
    bindToggle(['strikeLineEnabledTrack', 'settingsStrikeLineTrack'], (d, s) => setStrikeLineFx(d, 'strikeLine', !s.strikeLineEnabled));
    watchTrack('strikeLineEnabled', ['strikeLineEnabledTrack', 'settingsStrikeLineTrack']);
    bindToggle(['strikeReactionTrack'], (d, s) => setStrikeLineFx(d, 'strikeReaction', !s.strikeReactionEnabled));
    watchTrack('strikeReactionEnabled', ['strikeReactionTrack']);
    bindRange(['strikeReactionRange'], setStrikeReactionIntensity);
    watchSliders('strikeReactionIntensity', [['strikeReactionRange', 'strikeReactionVal']], pct);

    bindRange(['settingsKeyDustRange', 'strikeLineSizeRange'], setKeyDustIntensity);
    watchSliders('keyDustIntensity', [['settingsKeyDustRange', 'settingsKeyDustVal'], ['strikeLineSizeRange', 'strikeLineSizeVal']], n => n + 'px');
    bindRange(['strikeLineAuraRange'], setStrikeLineAuraSize);
    watchSliders('strikeLineAuraSize', [['strikeLineAuraRange', 'strikeLineAuraVal']], pct);
    const visuals: [StrikeVisual, keyof Settings, string][] = [
        ['brightness', 'strikeLineBrightness', 'strikeLineBrightness'],
        ['opacity', 'strikeLineOpacity', 'strikeLineOpacity'],
        ['saturation', 'strikeLineSaturation', 'strikeLineSaturation'],
    ];
    for (const [name, key, prefix] of visuals) {
        bindRange([prefix + 'Range'], (d, v) => setStrikeLineVisualSetting(d, name, v));
        watchSliders(key, [[prefix + 'Range', prefix + 'Val']], pct);
    }
    bindRange(['strikeLineMotionRange'], setMotionSpeed);
    watchSliders('motionSpeed', [['strikeLineMotionRange', 'strikeLineMotionVal']], pct);
    bindRange(['strikeLineSplitRange'], setStrikeLineSplitTuts);
    watchSliders('strikeLineSplitTuts', [['strikeLineSplitRange', null]], String);

    bindToggle(['strikeLineColorSplitTrack'], (d, s) => { d.strikeLineColorSplit = !s.strikeLineColorSplit; });
    watchTrack('strikeLineColorSplit', ['strikeLineColorSplitTrack']);
    bindToggle(['strikeLineColorFollowFallingTrack'], (d, s) => { d.strikeLineColorFollowFallingNotes = !s.strikeLineColorFollowFallingNotes; });
    watchTrack('strikeLineColorFollowFallingNotes', ['strikeLineColorFollowFallingTrack']);

    // updateStrikeLineColorModeControls: following Falling Notes makes the
    // line's own colour controls moot.
    const rowColor = byId('rowStrikeLineColor');
    const rowSplitTuts = byId('rowStrikeLineSplitTuts');
    const rowSplitColors = byId('rowStrikeLineSplitColors');
    watch(['strikeLineColorFollowFallingNotes', 'strikeLineColorSplit'], s => {
        const showSplit = !s.strikeLineColorFollowFallingNotes && s.strikeLineColorSplit;
        setShown(rowColor, !(s.strikeLineColorFollowFallingNotes || s.strikeLineColorSplit));
        setShown(rowSplitTuts, showSplit);
        setActive(rowSplitTuts, showSplit);
        setShown(rowSplitColors, showSplit);
        setActive(rowSplitColors, showSplit);
    });
}

// ── Particles ───────────────────────────────────────────────────────────────
function bindParticleControls(): void {
    bindToggle(['particleEnabledTrack', 'settingsDustTrack'], (d, s) => setStrikeLineFx(d, 'dust', !s.strikeLineDustEnabled));
    watchTrack('strikeLineDustEnabled', ['particleEnabledTrack', 'settingsDustTrack']);
    bindToggle(['dustColorFollowFallingTrack'], (d, s) => { d.dustColorFollowFallingNotes = !s.dustColorFollowFallingNotes; });
    watchTrack('dustColorFollowFallingNotes', ['dustColorFollowFallingTrack']);
    bindToggle(['dustColorSplitTrack'], (d, s) => { d.dustColorSplit = !s.dustColorSplit; });
    watchTrack('dustColorSplit', ['dustColorSplitTrack']);

    onClick('dustBlendGlow', () => update(d => setDustBlendMode(d, 'glow')));
    onClick('dustBlendSolid', () => update(d => setDustBlendMode(d, 'solid')));
    const glowBtn = byId('dustBlendGlow');
    const solidBtn = byId('dustBlendSolid');
    watch(['dustBlendMode'], s => {
        setActive(glowBtn, s.dustBlendMode === 'glow');
        setActive(solidBtn, s.dustBlendMode === 'solid');
    });

    const particle: [ParticleSetting, keyof Settings, string][] = [
        ['count', 'particleCount', 'particleCount'],
        ['size', 'particleSize', 'particleSize'],
        ['opacity', 'particleOpacity', 'particleOpacity'],
        ['speed', 'particleSpeed', 'particleSpeed'],
        ['turbulence', 'particleTurbulence', 'particleTurbulence'],
        ['saturation', 'particleSaturation', 'particleSaturation'],
        ['fade', 'particleFade', 'particleFade'],
    ];
    for (const [name, key, prefix] of particle) {
        bindRange([prefix + 'Range'], (d, v) => setParticleSetting(d, name, v));
        const pairs: [string, string | null][] = [[prefix + 'Range', prefix + 'Val']];
        // Tools "Particle Count" mirrors particleCount (syncStrikeLineFxButtons).
        if (name === 'count') pairs.push(['settingsDustAmountRange', 'settingsDustAmountVal']);
        watchSliders(key, pairs, pct);
    }
    bindRange(['settingsDustAmountRange'], (d, v) => setParticleSetting(d, 'count', v));

    bindRange(['dustDoubleSplitRange'], setDustDoubleSplitTuts);
    watchSliders('dustDoubleSplitTuts', [['dustDoubleSplitRange', null]], String);

    // updateDustModeControls
    const rowDustColor = byId('rowDustColor');
    const rowSplit = byId('rowDustDoubleSplit');
    const rowSplitColors = byId('rowDustDoubleColors');
    watch(['dustColorFollowFallingNotes', 'dustColorSplit'], s => {
        const showSplit = !s.dustColorFollowFallingNotes && s.dustColorSplit;
        setShown(rowDustColor, !(s.dustColorFollowFallingNotes || s.dustColorSplit));
        setShown(rowSplit, showSplit);
        setActive(rowSplit, showSplit);
        setShown(rowSplitColors, showSplit);
        setActive(rowSplitColors, showSplit);
    });
}

// ── Piano keys (Visual > Piano Keys) ───────────────────────────────────────
function bindKeyboardControls(): void {
    bindToggle(['octaveLinesTrack'], (d, s) => { d.octaveLinesEnabled = !s.octaveLinesEnabled; });
    watchTrack('octaveLinesEnabled', ['octaveLinesTrack']);
    bindToggle(['keyGlowTrack'], (d, s) => setKeyGlowEnabled(d, !s.keyGlowEnabled));
    watchTrack('keyGlowEnabled', ['keyGlowTrack']);
    bindToggle(['keyColorFollowFallingTrack'], (d, s) => { d.keyColorFollowFallingNotes = !s.keyColorFollowFallingNotes; });
    watchTrack('keyColorFollowFallingNotes', ['keyColorFollowFallingTrack']);
    bindRange(['keyGlowIntensityRange'], setKeyGlowIntensity);
    watchSliders('keyGlowIntensity', [['keyGlowIntensityRange', 'keyGlowIntensityVal']], pct);
}

// ── Colour pads ─────────────────────────────────────────────────────────────
function pad(id: string, label: string, initial: string, reset: string, fn: (d: Draft, color: string, intent: ColorIntent) => void): void {
    mountColorPad(id, label, initial, (color, intent) => update(d => fn(d, color, intent)), reset);
}
function watchPad(id: string, key: keyof Settings): void {
    settings.subscribe([key], s => updateColorPadValue(id, s[key] as string));
}

function bindColorPads(): void {
    const s = settings.get();
    pad('gridWhiteTuts', 'White Key Color', s.customWhiteKey || '#ffffff', '#ffffff', setWhiteKeyColor);
    pad('gridBlackTuts', 'Black Key Color', s.customBlackKey || '#ffffff', '#ffffff', setBlackKeyColor);
    pad('gridAnim', 'Note Color', s.customAnimNote || s.animColor || '#ffffff', '#ffffff', setAnimColor);
    pad('gridAnimDoubleLeft', 'Left Color', s.animDoubleLeftColor, '#0099ff', (d, c) => setAnimDoubleLeftColor(d, c));
    pad('gridAnimDoubleRight', 'Right Color', s.animDoubleRightColor, '#0099ff', (d, c) => setAnimDoubleRightColor(d, c));
    pad('gridStrikeLine', 'Strike Color', s.strikeLineColor || '#0099ff', '#0099ff', (d, c) => setStrikeLineColor(d, c));
    pad('gridStrikeLineLeft', 'Left Color', s.strikeLineLeftColor, '#0099ff', (d, c) => setStrikeLineLeftColor(d, c));
    pad('gridStrikeLineRight', 'Right Color', s.strikeLineRightColor, '#0099ff', (d, c) => setStrikeLineRightColor(d, c));
    pad('gridDust', 'Particle Color', s.dustColor || '#0099ff', '#0099ff', (d, c) => setDustColor(d, c));
    pad('gridDustDoubleLeft', 'Left Color', s.dustDoubleLeftColor, '#0099ff', (d, c) => setDustDoubleLeftColor(d, c));
    pad('gridDustDoubleRight', 'Right Color', s.dustDoubleRightColor, '#0099ff', (d, c) => setDustDoubleRightColor(d, c));
    watchPad('gridAnimDoubleLeft', 'animDoubleLeftColor');
    watchPad('gridAnimDoubleRight', 'animDoubleRightColor');
    watchPad('gridStrikeLine', 'strikeLineColor');
    watchPad('gridStrikeLineLeft', 'strikeLineLeftColor');
    watchPad('gridStrikeLineRight', 'strikeLineRightColor');
    watchPad('gridDust', 'dustColor');
    watchPad('gridDustDoubleLeft', 'dustDoubleLeftColor');
    watchPad('gridDustDoubleRight', 'dustDoubleRightColor');
    // syncColorPadsToEffectiveColors: the custom-aware pads show the user's
    // custom colour when there is one, else the effective/default colour.
    // (The chord colour pads are synced by input/chord-display.ts.)
    watch(['customWhiteKey', 'accentWhite', 'customBlackKey', 'accentBlack', 'customAnimNote', 'animColor'], st => {
        updateColorPadValue('gridWhiteTuts', st.customWhiteKey || '#ffffff');
        updateColorPadValue('gridBlackTuts', st.customBlackKey || '#ffffff');
        updateColorPadValue('gridAnim', st.customAnimNote || st.animColor || '#ffffff');
    });
}

// ── Theme ───────────────────────────────────────────────────────────────────
function bindThemeControls(): void {
    const btns: [string, Settings['pianoTheme']][] = [['themeDefault', 'default'], ['themeSketch', 'sketch'], ['theme8bit', '8bit']];
    for (const [id, theme] of btns) onClick(id, () => update(d => setPianoTheme(d, theme, true)));
    const els = btns.map(([id, theme]) => [byId(id), theme] as const);
    // theme-sketch / theme-8bit body classes restyle and hide panel rows (CSS).
    watch(['pianoTheme'], s => {
        document.body.classList.toggle('theme-sketch', s.pianoTheme === 'sketch');
        document.body.classList.toggle('theme-8bit', s.pianoTheme === '8bit');
        for (const [el, theme] of els) setActive(el, theme === s.pianoTheme);
    });
}

// ── Graphics quality ────────────────────────────────────────────────────────
// Potato hides (and its defaults switch off) the heavy-FX menus.
const LOW_HIDDEN_ROWS = ['rowAnimEffect', 'rowKeyGlow', 'rowKeyGlowIntensity'];
const LOW_HIDDEN_SELECTORS = ['[data-visual-open="particle"]', '[data-visual-open="strikeLine"]'];

function bindGraphicsControls(): void {
    const btns: [string, Settings['graphicQuality']][] = [['gfxPotato', 'potato'], ['gfxDefault', 'default']];
    for (const [id, q] of btns) onClick(id, () => update(d => applyGraphicQuality(d, q, true)));
    const btnEls = btns.map(([id, q]) => [byId(id), q] as const);
    const rows = LOW_HIDDEN_ROWS.map(id => byId(id));
    const menus = LOW_HIDDEN_SELECTORS.map(sel => document.querySelector<HTMLElement>(sel));
    const glassEls = [document.querySelector<HTMLElement>('.top'), ...Array.from(document.querySelectorAll<HTMLElement>('.floating-panel'))];
    watch(['graphicQuality'], s => {
        const isLow = s.graphicQuality === 'potato';
        for (const [el, q] of btnEls) setActive(el, q === s.graphicQuality);
        for (const row of rows) setShown(row, !isLow);
        for (const el of menus) setShown(el, !isLow);
        for (const el of glassEls) {
            if (!el) continue;
            const filter = isLow ? 'none'
                : el.classList.contains('floating-panel') ? 'blur(22px) saturate(145%)' : 'blur(14px) saturate(138%)';
            el.style.backdropFilter = filter;
            el.style.setProperty('-webkit-backdrop-filter', filter);
        }
    });
}

export function initControls(): void {
    bindPianoControls();
    bindNotesControls();
    bindStrikeLineControls();
    bindParticleControls();
    bindKeyboardControls();
    bindColorPads();
    bindThemeControls();
    bindGraphicsControls();
}
