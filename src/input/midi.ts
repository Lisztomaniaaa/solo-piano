// Web MIDI input (#midiBtn): note on/off with real velocity, CC64 sustain,
// hot-plug re-attach.

import { isInputReady, pressKey, releaseKey, stopAllNotes } from '../core/performance.js';
import { settings } from '../state/settings.js';
import { setMidiSustainPedal, markMidiNote } from '../audio/index.js';
import { showToast } from '../ui/toast.js';

let midiAccess: MIDIAccess | null = null;
let midiEnabled = false;
let midiBtn: HTMLElement | null = null;

function onMidiMessage(msg: MIDIMessageEvent): void {
    if (msg.data) handleMidiMessage(msg.data);
}

function attachMidiInputs(): void {
    if (!midiAccess) return;
    // Property assignment (not addEventListener) so re-running never stacks
    // duplicate listeners on the same input.
    midiAccess.inputs.forEach(input => { input.onmidimessage = onMidiMessage; });
}

function detachMidiInputs(): void {
    if (!midiAccess) return;
    midiAccess.inputs.forEach(input => { input.onmidimessage = null; });
}

function onMidiStateChange(): void {
    // A device was (un)plugged or became ready: re-scan and re-attach.
    if (midiEnabled) attachMidiInputs();
}

function setMidiUiActive(on: boolean): void {
    midiBtn?.classList.toggle('active', on);
}

// Channel 10 is deliberately NOT filtered: a live controller can legitimately
// send piano notes there.
export function handleMidiMessage(data: ArrayLike<number>): void {
    if (!data || data.length < 1) return;
    const status = data[0]! & 0xF0;
    const note = data[1]!;
    const velocity = data[2] || 0;
    // Sustain pedal (CC64): always processed, a dropped pedal-up would leave
    // released voices ringing forever.
    if (status === 0xB0 && note === 64) {
        setMidiSustainPedal(velocity >= 64);
        return;
    }
    // Note-off is always processed (releaseKey is ungated) so a note can never
    // strand; only note-on is gated on input readiness (inside pressKey).
    // markMidiNote tells the audio engine this note came from MIDI, so a
    // note-off under a held pedal keeps the piano voice until pedal-up.
    if (status === 0x80 || (status === 0x90 && velocity === 0)) {
        markMidiNote(note);
        releaseKey(note, false, note + settings.get().transpose);
        return;
    }
    if (status === 0x90 && velocity > 0) {
        if (!isInputReady()) return;
        markMidiNote(note);
        pressKey(note, velocity / 127, note + settings.get().transpose);
    }
}

function onMidiButtonClick(): void {
    if (!midiEnabled) {
        if (!('requestMIDIAccess' in navigator)) {
            setMidiUiActive(false);
            showToast('This browser does not support the Web MIDI API. Try Chrome or Edge on desktop.', { type: 'error', title: 'MIDI not supported' });
            return;
        }
        midiEnabled = true;
        setMidiUiActive(true);
        // Reuse an existing access object (instant re-enable, still hot-plug aware).
        if (midiAccess) { attachMidiInputs(); return; }
        navigator.requestMIDIAccess().then(midi => {
            midiAccess = midi;
            midi.onstatechange = onMidiStateChange;
            if (midiEnabled) attachMidiInputs(); else detachMidiInputs();
        }).catch(() => {
            midiEnabled = false;
            setMidiUiActive(false);
            showToast('MIDI access was denied or is unavailable. Check your browser permissions.', { type: 'error', title: 'MIDI unavailable' });
        });
    } else {
        midiEnabled = false;
        setMidiUiActive(false);
        detachMidiInputs();
        setMidiSustainPedal(false);
        stopAllNotes();
    }
}

export function initMidi(): void {
    midiBtn = document.getElementById('midiBtn');
    if (midiBtn) midiBtn.onclick = onMidiButtonClick;
}
