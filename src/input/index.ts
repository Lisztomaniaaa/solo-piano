// Input entry point: QWERTY, pointer/touch + swipe, Web MIDI, chord display
// and the metronome.

import { initQwerty, releaseQwertyHolds } from './qwerty.js';
import { initPointer, releasePointerHolds } from './pointer.js';
import { initMidi } from './midi.js';
import { initChordDisplay } from './chord-display.js';
import { initMetronome } from './metronome.js';

export { QWERTY_LABEL_MAP } from './qwerty-map.js';
export {
    requestChordUpdate, setChordMode, setChordTextScale, setChordDisplayColors,
    bindChordColorControls, CHORD_RELEASE_GRACE_MS,
} from './chord-display.js';
export type { ColorPadApi, ColorIntent } from './chord-display.js';
export { getMetronomeState, applyMetronomeState } from './metronome.js';
export type { MetronomeState } from './metronome.js';
export { handleMidiMessage } from './midi.js';

// When the tab loses visibility the browser stops delivering pointerup/keyup,
// so a note held at that moment would stay stuck. Drain every live input hold.
export function releaseAllLiveInputHolds(): void {
    releasePointerHolds();
    releaseQwertyHolds();
}

export function initInput(): void {
    initChordDisplay();
    initQwerty();
    initPointer();
    initMidi();
    initMetronome();

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) releaseAllLiveInputHolds();
    }, { passive: true });
    // pagehide catches tab close / bfcache freeze, which on mobile Safari is
    // not always preceded by visibilitychange.
    window.addEventListener('pagehide', releaseAllLiveInputHolds, { passive: true });
}
