// Live audio state. The engine reads these plain fields on the hot path; the
// persisted ones are mirrored into `settings` through persist().

import { settings, type Settings, type SfEffectSettings } from '../state/settings.js';

export const STRING_FADE_DEFAULT = 5.0; // layer fade acts like the layer's sustain/release

export const audio = {
    currentSf: 'grandPiano',
    currentStringSf: 'strViolin',
    stringEnabled: false,
    sustainLevel: 1.00,
    reverbLevel: 0,
    reverbEnabled: false,
    pianoVolume: 0.80,
    stringVolume: 0.80,
    stringRangeLeft: 21,
    stringRangeRight: 108,
    manualSustainEnabled: false,
    midiSustainPedalDown: false,
    // Spacebar-held sustain — distinct from manualSustainEnabled (the
    // persistent click latch) so holding space can only ever ADD sustain.
    spaceSustainHeld: false,
    // Reverb ships OFF: it is the single most expensive node in the graph.
    sfEffectSettings: {
        sf1: { sustain: 1.00, reverb: 0.00 },
        sf2: { fadeSec: 5.00, reverb: 0.00, transpose: 0 },
    } as SfEffectSettings,
    // Playback gate: false until the boot soundfont finished building, so
    // mash-key input can't hammer the graph mid-decode.
    stageReady: false,
};

let selfWrite = 0;
/** Writes audio-owned fields to settings without re-triggering our own subscription. */
export function persist(patch: Partial<Settings>): void {
    selfWrite++;
    try { settings.set(patch); } finally { selfWrite--; }
}
export function isSelfWrite(): boolean {
    return selfWrite > 0;
}

export function cloneFx(fx: SfEffectSettings): SfEffectSettings {
    return { sf1: { ...fx.sf1 }, sf2: { ...fx.sf2 } };
}
