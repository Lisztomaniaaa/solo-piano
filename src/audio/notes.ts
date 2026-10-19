// Wires the note hub to the voice engine (the original press()/release()
// audio half, plus the MIDI note-on/off pedal handling).

import { performanceEvents } from '../core/performance.js';
import { settings } from '../state/settings.js';
import { resumeIfSuspended } from './context.js';
import { audio } from './state.js';
import { markInputBurst } from './burst.js';
import { midiPedalHeldNotes, playNote, stopAllVoices, stopNote } from './engine.js';

// Notes whose next press/release comes from a MIDI device. The original MIDI
// handler differs from pointer/QWERTY input: a note-on clears the note from
// the pedal-held set, and a note-off with the CC64 pedal down parks the piano
// voice (released on pedal-up) while the layer voice releases immediately.
const midiFlagged = new Set<number>();

/** Call right before pressKey/releaseKey for a note coming from a MIDI device. */
export function markMidiNote(noteMidi: number): void {
    midiFlagged.add(noteMidi);
}

export function bindNoteHub(): void {
    performanceEvents.on('press', e => {
        markInputBurst();
        resumeIfSuspended();
        if (midiFlagged.delete(e.noteMidi)) midiPedalHeldNotes.delete(e.noteMidi);
        playNote(e.noteMidi, settings.get().transpose, e.velocity);
    });
    performanceEvents.on('release', e => {
        markInputBurst();
        const n = e.noteMidi;
        if (midiFlagged.delete(n)) {
            stopNote(n, false, undefined, 'string');
            if (audio.midiSustainPedalDown) midiPedalHeldNotes.add(n);
            else stopNote(n, false, undefined, 'piano');
            return;
        }
        stopNote(n, !!e.fast);
    });
    performanceEvents.on('stopAll', () => stopAllVoices());
}
