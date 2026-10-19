// Audio system entry point: SoundFont playback, sustain, effects, the
// soundfont picker/loading overlay, Auto Velocity and the boot loader.

import { settings, type Settings } from '../state/settings.js';
import { audio, persist, isSelfWrite, cloneFx, STRING_FADE_DEFAULT } from './state.js';
import { audioCtx } from './context.js';
import { getLoadedKey } from './engine.js';
import { bindVelocityMeter } from './velocityMeter.js';
import { bindSustainControls, setManualSustain, setMidiSustainPedal } from './sustain.js';
import {
    SF_URLS, bindSoundfontUI, loadSoundfont, setStringLayerEnabled, updateSoundfontPickerUI,
} from './soundfonts.js';
import {
    applyCurrentSfEffects, bindAudioControls, updateSfEffectUI, updateStringRangeUI,
} from './controls.js';
import { bindAutoVelocity, setAutoVelocity, setAutoVelocityMode } from './autoVelocity.js';
import { bindNoteHub } from './notes.js';
import { installBootGuards, startBackgroundSoundfont } from './loading.js';

export { setMidiSustainPedal, setSpaceSustain, toggleSustainHold, setManualSustain } from './sustain.js';
export { getSoundfontName, selectSf, setStringLayerEnabled, updateSoundfontPickerUI, SF_URLS, SOUNDFONT_LABELS } from './soundfonts.js';
export { setSfPanelTab, updateSfEffectUI, applyCurrentSfEffects, changeStringTranspose, setPianoVolumeValue, setStringVolumeValue } from './controls.js';
export { playNote, stopNote, velocityGain, volumeGain } from './engine.js';
export { setAutoVelocity, setAutoVelocityMode, autoVelocityFor } from './autoVelocity.js';
export { getBurstLevel } from './burst.js';
export { markMidiNote } from './notes.js';
export { setPianoEntryLoading, hidePianoEntryLoading, forceBootVisible } from './loading.js';
export { stopAllNotes } from '../core/performance.js';

export function getAudioContext(): AudioContext {
    return audioCtx;
}

/** Copies the audio fields of `settings` into the live engine state. */
function readSettings(s: Readonly<Settings>): void {
    audio.sfEffectSettings = cloneFx(s.sfEffectSettings);
    audio.currentSf = s.currentSf;
    audio.currentStringSf = s.currentStringSf;
    audio.pianoVolume = s.pianoVolume;
    audio.stringVolume = s.stringVolume;
    audio.stringRangeLeft = s.stringRangeLeft;
    audio.stringRangeRight = s.stringRangeRight;
    audio.stringEnabled = s.stringEnabled;
}

/**
 * The audio half of the original applyFactoryDefaults(): resets every audio
 * setting. Note it does NOT load grandPiano if another piano soundfont is
 * loaded (only the selection/label changes), exactly like the original.
 * Call it before (or instead of) settings.set(defaultSettings()).
 */
export function applyAudioDefaults(): void {
    audio.sfEffectSettings = {
        sf1: { sustain: 1.00, reverb: 0.00 },
        sf2: { fadeSec: 5.00, reverb: 0.00, transpose: 0 },
    };
    audio.currentSf = 'grandPiano';
    audio.currentStringSf = 'strViolin';
    audio.pianoVolume = 0.80;
    audio.stringVolume = 0.80;
    persist({
        sfEffectSettings: cloneFx(audio.sfEffectSettings),
        currentSf: audio.currentSf,
        currentStringSf: audio.currentStringSf,
        pianoVolume: audio.pianoVolume,
        stringVolume: audio.stringVolume,
    });
    setManualSustain(false);
    setMidiSustainPedal(false);
    audio.stringRangeLeft = 21;
    audio.stringRangeRight = 108;
    persist({ stringRangeLeft: 21, stringRangeRight: 108 });
    audio.stringEnabled = false;
    setStringLayerEnabled(false, true);
    updateSoundfontPickerUI();
    updateSfEffectUI();
    applyCurrentSfEffects();
    setAutoVelocity(false);
    setAutoVelocityMode('mix');
}

const AUDIO_KEYS: (keyof Settings)[] = [
    'currentSf', 'currentStringSf', 'stringEnabled', 'stringRangeLeft', 'stringRangeRight',
    'sustainLevel', 'manualSustainEnabled', 'sfEffectSettings', 'pianoVolume', 'stringVolume',
    'autoVelocityEnabled', 'autoVelocityMode',
];

// The audio half of the original applySettings(), run when someone else (a
// preset load) writes these fields. Legacy-preset migrations that need the
// raw payload (stringRangeSettingsVersion < 2 -> full range, masterVolume ->
// pianoVolume) belong to the preset loader before it calls settings.set.
function onSettingsChanged(s: Readonly<Settings>, changed: ReadonlySet<keyof Settings>): void {
    if (isSelfWrite()) return;
    if (changed.has('sfEffectSettings') && s.sfEffectSettings) {
        const fx = audio.sfEffectSettings;
        if (s.sfEffectSettings.sf1) fx.sf1 = Object.assign(fx.sf1, s.sfEffectSettings.sf1);
        if (s.sfEffectSettings.sf2) {
            const loadedSf2 = Object.assign({}, s.sfEffectSettings.sf2) as SfEffectSf2Legacy;
            if (loadedSf2.fadeSec === undefined && loadedSf2.sustain !== undefined) loadedSf2.fadeSec = Math.max(0.1, Math.min(10.0, loadedSf2.sustain * 10.0));
            delete loadedSf2.sustain;
            fx.sf2 = Object.assign(fx.sf2, loadedSf2);
        }
    } else if (changed.has('sustainLevel')) {
        audio.sfEffectSettings.sf1.sustain = s.sustainLevel;
    }
    if (changed.has('pianoVolume')) audio.pianoVolume = Math.min(1, s.pianoVolume);
    if (changed.has('stringVolume')) audio.stringVolume = s.stringVolume;
    if (changed.has('manualSustainEnabled')) setManualSustain(!!s.manualSustainEnabled);
    if (changed.has('stringRangeLeft') || changed.has('stringRangeRight')) {
        audio.stringRangeLeft = s.stringRangeLeft;
        audio.stringRangeRight = s.stringRangeRight;
        updateStringRangeUI();
    }
    if (changed.has('stringEnabled')) audio.stringEnabled = !!s.stringEnabled;
    if (changed.has('sfEffectSettings') || changed.has('sustainLevel') || changed.has('pianoVolume') || changed.has('stringVolume')) {
        updateSfEffectUI();
        applyCurrentSfEffects();
    }
    if (changed.has('autoVelocityEnabled')) setAutoVelocity(!!s.autoVelocityEnabled);
    if (changed.has('autoVelocityMode')) setAutoVelocityMode(s.autoVelocityMode);
    if (changed.has('currentSf') || changed.has('currentStringSf') || changed.has('stringEnabled')) {
        if (s.currentSf && SF_URLS[s.currentSf]) audio.currentSf = s.currentSf;
        if (s.currentStringSf && SF_URLS[s.currentStringSf]) audio.currentStringSf = s.currentStringSf;
        updateSoundfontPickerUI();
        if (audio.currentSf !== getLoadedKey('piano') && SF_URLS[audio.currentSf]) loadSoundfont(audio.currentSf, SF_URLS[audio.currentSf], null, 'piano');
        setStringLayerEnabled(audio.stringEnabled, true);
    }
}

interface SfEffectSf2Legacy { fadeSec?: number; reverb: number; transpose: number; sustain?: number }

let initialized = false;
export async function initAudio(): Promise<void> {
    if (initialized) return;
    initialized = true;
    readSettings(settings.get());
    if (!audio.sfEffectSettings.sf2) audio.sfEffectSettings.sf2 = { fadeSec: STRING_FADE_DEFAULT, reverb: 0, transpose: 0 };

    bindVelocityMeter();
    bindSoundfontUI();
    bindAudioControls();
    bindSustainControls();
    bindAutoVelocity();

    // Original boot order: string layer + range + picker, effect UI, then the
    // boot-time applyFactoryDefaults(false) (here: from the current settings).
    setStringLayerEnabled(audio.stringEnabled, true);
    updateStringRangeUI();
    updateSoundfontPickerUI();
    updateSfEffectUI();
    applyCurrentSfEffects();
    const s = settings.get();
    setManualSustain(!!s.manualSustainEnabled);
    setMidiSustainPedal(false);
    setAutoVelocity(!!s.autoVelocityEnabled);
    setAutoVelocityMode(s.autoVelocityMode);

    settings.subscribe(AUDIO_KEYS, onSettingsChanged);
    bindNoteHub();
    installBootGuards();
    startBackgroundSoundfont();
}
