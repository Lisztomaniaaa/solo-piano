// Runtime state that is not part of a preset.

import { Store } from './store.js';

export interface RuntimeState {
    /** Horizontal scroll of the keyboard, in white-key units from A0. */
    viewOffset: number;
    /** Sustain from the toolbar button, the space bar, or a MIDI pedal. */
    manualSustain: boolean;
    spaceSustain: boolean;
    midiSustain: boolean;
    /** Soundfont loading, 0..1, or null when idle. */
    loadProgress: number | null;
    /** True once the default soundfont has loaded and input is accepted. */
    pianoReady: boolean;
    /** Chord names currently shown. */
    chordPrimary: string;
    chordSecondary: string;
}

export const runtime = new Store<RuntimeState>({
    viewOffset: 0,
    manualSustain: false,
    spaceSustain: false,
    midiSustain: false,
    loadProgress: null,
    pianoReady: false,
    chordPrimary: '',
    chordSecondary: '',
});

export function isSustainActive(): boolean {
    const r = runtime.get();
    return r.manualSustain || r.spaceSustain || r.midiSustain;
}
