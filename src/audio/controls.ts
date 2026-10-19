// Controls inside #sfPanel / #audioPanel (and their Settings-hub twins):
// effect sliders, layer transpose, volumes, the string-layer key range, and
// the Main/Layer page tabs.

import { audioCtx, reverbGain, teardownReverb } from './context.js';
import { audio, persist, cloneFx, STRING_FADE_DEFAULT } from './state.js';
import {
    STRING_TUTS_MAX, STRING_TUTS_MIN, clampStringRange, clampStringTuts, getStringTranspose,
    midiNoteToName, midiToTuts, tutsToMidi,
} from './engine.js';

function el<T extends HTMLElement = HTMLElement>(id: string): T | null {
    return document.getElementById(id) as T | null;
}
function setText(node: HTMLElement | null, text: string): void {
    if (node && node.textContent !== text) node.textContent = text;
}
function setValue(node: HTMLInputElement | null, value: string): void {
    if (node && node.value !== value) node.value = value;
}

function persistFx(): void {
    persist({ sfEffectSettings: cloneFx(audio.sfEffectSettings), sustainLevel: audio.sustainLevel });
}

function ensureSf2(): void {
    if (!audio.sfEffectSettings.sf2) audio.sfEffectSettings.sf2 = { fadeSec: STRING_FADE_DEFAULT, reverb: 0, transpose: 0 };
}

// ---- Effects ----
export function applyCurrentSfEffects(): void {
    const fx = audio.sfEffectSettings.sf1 || { sustain: 1.00, reverb: 0 };
    audio.sustainLevel = Math.max(0, Math.min(1, fx.sustain || 0));
    ensureSf2();
    const sf2 = audio.sfEffectSettings.sf2;
    if (sf2.fadeSec === undefined) sf2.fadeSec = STRING_FADE_DEFAULT;
    if (sf2.transpose === undefined) sf2.transpose = 0;
    audio.reverbLevel = Math.round(Math.max(audio.sfEffectSettings.sf1.reverb || 0, sf2.reverb || 0) * 100);
    audio.reverbEnabled = audio.reverbLevel > 0;
    if (audio.reverbEnabled) {
        if (reverbGain) reverbGain.gain.setTargetAtTime(0.65, audioCtx.currentTime, 0.05);
    } else {
        teardownReverb();
    }
    persist({ sustainLevel: audio.sustainLevel });
}

interface EffectEls {
    sustainSf1Range: HTMLInputElement | null; sustainSf1Val: HTMLElement | null;
    reverbSf1Range: HTMLInputElement | null; reverbSf1Val: HTMLElement | null;
    reverbSf2Range: HTMLInputElement | null; reverbSf2Val: HTMLElement | null;
    sustainSf2Range: HTMLInputElement | null; sustainSf2Val: HTMLElement | null;
    sf2TransposeVal: HTMLElement | null;
    pianoVolRange: HTMLInputElement | null; pianoVolVal: HTMLElement | null;
    stringVolRange: HTMLInputElement | null; stringVolVal: HTMLElement | null;
    settingsPianoVolRange: HTMLInputElement | null; settingsPianoVolVal: HTMLElement | null;
    settingsStringVolRange: HTMLInputElement | null; settingsStringVolVal: HTMLElement | null;
    settingsSustainSf1Range: HTMLInputElement | null; settingsSustainSf1Val: HTMLElement | null;
    settingsSustainSf2Range: HTMLInputElement | null; settingsSustainSf2Val: HTMLElement | null;
}
let E: EffectEls | null = null;
function effectEls(): EffectEls {
    if (E) return E;
    E = {
        sustainSf1Range: el('sustainSf1Range'), sustainSf1Val: el('sustainSf1Val'),
        reverbSf1Range: el('reverbSf1Range'), reverbSf1Val: el('reverbSf1Val'),
        reverbSf2Range: el('reverbSf2Range'), reverbSf2Val: el('reverbSf2Val'),
        sustainSf2Range: el('sustainSf2Range'), sustainSf2Val: el('sustainSf2Val'),
        sf2TransposeVal: el('sf2TransposeVal'),
        pianoVolRange: el('pianoVolRange'), pianoVolVal: el('pianoVolVal'),
        stringVolRange: el('stringVolRange'), stringVolVal: el('stringVolVal'),
        settingsPianoVolRange: el('settingsPianoVolRange'), settingsPianoVolVal: el('settingsPianoVolVal'),
        settingsStringVolRange: el('settingsStringVolRange'), settingsStringVolVal: el('settingsStringVolVal'),
        settingsSustainSf1Range: el('settingsSustainSf1Range'), settingsSustainSf1Val: el('settingsSustainSf1Val'),
        settingsSustainSf2Range: el('settingsSustainSf2Range'), settingsSustainSf2Val: el('settingsSustainSf2Val'),
    };
    return E;
}

export function updateSfEffectUI(): void {
    ensureSf2();
    const e = effectEls();
    const fx = audio.sfEffectSettings;
    const pctOf = (v: number) => Math.round((v || 0) * 100);
    const s1 = pctOf(fx.sf1.sustain), r1 = pctOf(fx.sf1.reverb), r2 = pctOf(fx.sf2.reverb);
    setValue(e.sustainSf1Range, String(s1)); setText(e.sustainSf1Val, s1 + '%');
    setValue(e.reverbSf1Range, String(r1)); setText(e.reverbSf1Val, r1 + '%');
    setValue(e.reverbSf2Range, String(r2)); setText(e.reverbSf2Val, r2 + '%');
    const fadeSec = Math.max(0.1, Math.min(10.0, Number(fx.sf2.fadeSec) || STRING_FADE_DEFAULT));
    const fadeTxt = fadeSec.toFixed(1);
    setValue(e.sustainSf2Range, fadeTxt); setText(e.sustainSf2Val, fadeTxt + 's');
    if (e.sf2TransposeVal) {
        const st = getStringTranspose();
        setText(e.sf2TransposeVal, (st > 0 ? '+' : '') + st);
    }
    const pv = Math.round(audio.pianoVolume * 100);
    const sv = Math.round(audio.stringVolume * 100);
    setValue(e.pianoVolRange, String(pv)); setText(e.pianoVolVal, pv + '%');
    setValue(e.stringVolRange, String(sv)); setText(e.stringVolVal, sv + '%');
    setValue(e.settingsPianoVolRange, String(pv)); setText(e.settingsPianoVolVal, pv + '%');
    setValue(e.settingsStringVolRange, String(sv)); setText(e.settingsStringVolVal, sv + '%');
    setValue(e.settingsSustainSf1Range, String(s1)); setText(e.settingsSustainSf1Val, s1 + '%');
    setValue(e.settingsSustainSf2Range, fadeTxt); setText(e.settingsSustainSf2Val, fadeTxt + 's');
}

export function setSfPanelTab(tab: string): void {
    const normalized = tab === 'sf1' ? 'main' : (tab === 'sf2' ? 'layer' : (tab === 'layer' ? 'layer' : 'main'));
    document.querySelectorAll<HTMLElement>('.sf-tab').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === normalized));
    document.querySelectorAll('.sf-page').forEach(page => page.classList.remove('active'));
    const pageMap: Record<string, string> = { main: 'sfPageMain', layer: 'sfPageLayer' };
    const page = el(pageMap[normalized] || 'sfPageMain');
    if (page) page.classList.add('active');
}

// Layer/pad transpose stepper, scoped to the layer soundfont only.
export function changeStringTranspose(delta: number): void {
    ensureSf2();
    audio.sfEffectSettings.sf2.transpose = Math.max(-12, Math.min(12, getStringTranspose() + delta));
    updateSfEffectUI();
    persistFx();
}

export function setPianoVolumeValue(value: string | number): void {
    audio.pianoVolume = Math.max(0, Math.min(1, parseInt(String(value), 10) / 100));
    updateSfEffectUI();
    persist({ pianoVolume: audio.pianoVolume });
}
export function setStringVolumeValue(value: string | number): void {
    audio.stringVolume = Math.max(0, Math.min(1, parseInt(String(value), 10) / 100));
    updateSfEffectUI();
    persist({ stringVolume: audio.stringVolume });
}

// ---- String layer key range ----
let R: {
    val: HTMLElement | null; leftInput: HTMLInputElement | null; rightInput: HTMLInputElement | null;
    leftLabel: HTMLElement | null; rightLabel: HTMLElement | null; slider: HTMLElement | null;
} | null = null;
function rangeEls() {
    if (R) return R;
    R = {
        val: el('stringRangeVal'),
        leftInput: el<HTMLInputElement>('stringLeftTutsRange'),
        rightInput: el<HTMLInputElement>('stringRightTutsRange'),
        leftLabel: el('stringLeftTutsLabel'),
        rightLabel: el('stringRightTutsLabel'),
        slider: el('stringRangeSlider'),
    };
    return R;
}

export function updateStringRangeUI(): void {
    clampStringRange();
    const leftTuts = midiToTuts(audio.stringRangeLeft);
    const rightTuts = midiToTuts(audio.stringRangeRight);
    const leftPct = ((leftTuts - STRING_TUTS_MIN) / (STRING_TUTS_MAX - STRING_TUTS_MIN)) * 100;
    const rightPct = ((rightTuts - STRING_TUTS_MIN) / (STRING_TUTS_MAX - STRING_TUTS_MIN)) * 100;
    const r = rangeEls();
    setText(r.val, 'Keys ' + leftTuts + ' - ' + rightTuts);
    setValue(r.leftInput, String(leftTuts));
    setValue(r.rightInput, String(rightTuts));
    setText(r.leftLabel, 'L ' + midiNoteToName(audio.stringRangeLeft));
    setText(r.rightLabel, 'R ' + midiNoteToName(audio.stringRangeRight));
    if (r.slider) {
        r.slider.style.setProperty('--string-range-left', leftPct + '%');
        r.slider.style.setProperty('--string-range-right', rightPct + '%');
    }
}

function setStringRangeTuts(edge: 'left' | 'right', value: string): void {
    let leftTuts = midiToTuts(audio.stringRangeLeft);
    let rightTuts = midiToTuts(audio.stringRangeRight);
    const next = clampStringTuts(value, edge === 'left' ? leftTuts : rightTuts);
    if (edge === 'left') leftTuts = Math.min(next, rightTuts);
    else rightTuts = Math.max(next, leftTuts);
    audio.stringRangeLeft = tutsToMidi(leftTuts);
    audio.stringRangeRight = tutsToMidi(rightTuts);
    updateStringRangeUI();
    persist({ stringRangeLeft: audio.stringRangeLeft, stringRangeRight: audio.stringRangeRight });
}

// ---- Bindings ----
export function bindAudioControls(): void {
    const r = rangeEls();
    if (r.leftInput) r.leftInput.oninput = ev => setStringRangeTuts('left', (ev.target as HTMLInputElement).value);
    if (r.rightInput) r.rightInput.oninput = ev => setStringRangeTuts('right', (ev.target as HTMLInputElement).value);

    document.querySelectorAll<HTMLElement>('.sf-tab').forEach(btn => { btn.onclick = () => setSfPanelTab(btn.dataset.tab || ''); });

    const e = effectEls();
    const fxRanges: [HTMLInputElement | null, string][] = [
        [e.sustainSf1Range, 'sustainSf1Range'],
        [e.reverbSf1Range, 'reverbSf1Range'],
        [e.sustainSf2Range, 'sustainSf2Range'],
        [e.reverbSf2Range, 'reverbSf2Range'],
    ];
    for (const [input, id] of fxRanges) {
        if (!input) continue;
        input.oninput = () => {
            if (id === 'sustainSf2Range') {
                audio.sfEffectSettings.sf2.fadeSec = Math.max(0.1, Math.min(10.0, parseFloat(input.value) || STRING_FADE_DEFAULT));
            } else {
                const val = parseInt(input.value, 10) / 100;
                const isReverb = id.startsWith('reverb');
                if (id.includes('Sf2')) audio.sfEffectSettings.sf2.reverb = val;
                else if (isReverb) audio.sfEffectSettings.sf1.reverb = val;
                else audio.sfEffectSettings.sf1.sustain = val;
            }
            updateSfEffectUI();
            applyCurrentSfEffects();
            persistFx();
        };
    }

    const up = el('sf2TransposeUp');
    const down = el('sf2TransposeDown');
    if (up) up.onclick = () => changeStringTranspose(1);
    if (down) down.onclick = () => changeStringTranspose(-1);

    if (e.pianoVolRange) e.pianoVolRange.oninput = ev => setPianoVolumeValue((ev.target as HTMLInputElement).value);
    if (e.stringVolRange) e.stringVolRange.oninput = ev => setStringVolumeValue((ev.target as HTMLInputElement).value);
    if (e.settingsPianoVolRange) e.settingsPianoVolRange.oninput = ev => setPianoVolumeValue((ev.target as HTMLInputElement).value);
    if (e.settingsStringVolRange) e.settingsStringVolRange.oninput = ev => setStringVolumeValue((ev.target as HTMLInputElement).value);
    if (e.settingsSustainSf1Range) e.settingsSustainSf1Range.oninput = ev => {
        audio.sfEffectSettings.sf1.sustain = parseInt((ev.target as HTMLInputElement).value, 10) / 100;
        applyCurrentSfEffects();
        updateSfEffectUI();
        persistFx();
    };
    if (e.settingsSustainSf2Range) e.settingsSustainSf2Range.oninput = ev => {
        audio.sfEffectSettings.sf2.fadeSec = Math.max(0.1, Math.min(10.0, parseFloat((ev.target as HTMLInputElement).value) || 10.0));
        updateSfEffectUI();
        persistFx();
    };
}
