// Sustain sources: the toolbar Sustain button (manual latch), the space bar,
// and a MIDI CC64 pedal. Any of them active = sustain on.

import { runtime } from '../state/runtime.js';
import { audio, persist } from './state.js';
import { releaseMidiPedalHeldNotes } from './engine.js';

let holdBtn: HTMLElement | null = null;
let settingsSustainBtn: HTMLElement | null = null;

function syncButton(btn: HTMLElement, active: boolean, midiOnly: boolean, title: string): void {
    btn.classList.toggle('active', active);
    btn.classList.toggle('midi-sustain-active', midiOnly);
    if (btn.title !== title) btn.title = title;
}

function refreshSustainButton(): void {
    const { manualSustainEnabled, midiSustainPedalDown, spaceSustainHeld } = audio;
    const active = manualSustainEnabled || midiSustainPedalDown || spaceSustainHeld;
    const midiOnly = !manualSustainEnabled && midiSustainPedalDown;
    const title = midiOnly ? 'Sustain: MIDI pedal ON' : (manualSustainEnabled ? 'Sustain: Manual ON' : 'Sustain');
    if (holdBtn) syncButton(holdBtn, active, midiOnly, title);
    if (settingsSustainBtn) syncButton(settingsSustainBtn, active, midiOnly, title);
    runtime.set({
        manualSustain: manualSustainEnabled,
        spaceSustain: spaceSustainHeld,
        midiSustain: midiSustainPedalDown,
    });
}

function wasActive(): boolean {
    return audio.manualSustainEnabled || audio.midiSustainPedalDown || audio.spaceSustainHeld;
}
function nowInactive(): boolean {
    return !audio.manualSustainEnabled && !audio.midiSustainPedalDown && !audio.spaceSustainHeld;
}

export function setManualSustain(enabled: boolean): void {
    const was = wasActive();
    audio.manualSustainEnabled = !!enabled;
    persist({ manualSustainEnabled: audio.manualSustainEnabled });
    refreshSustainButton();
    if (was && nowInactive()) releaseMidiPedalHeldNotes();
}

export function setMidiSustainPedal(down: boolean, when?: number): void {
    const was = wasActive();
    audio.midiSustainPedalDown = !!down;
    refreshSustainButton();
    if (was && nowInactive()) releaseMidiPedalHeldNotes(when);
}

// Space can only ADD sustain on top of whatever's already active, never
// remove it, and releasing space only cuts sustain if nothing else is still
// holding it — like a real pedal, never a toggle.
export function setSpaceSustain(down: boolean): void {
    const was = wasActive();
    audio.spaceSustainHeld = !!down;
    refreshSustainButton();
    if (was && nowInactive()) releaseMidiPedalHeldNotes();
}

export function isSpaceSustainHeld(): boolean {
    return audio.spaceSustainHeld;
}

// Sustain button toggle. If sustain is active for the latch or the MIDI pedal
// — including a pedal whose "up" was never received — a click force-clears
// everything so the user can always turn it off.
export function toggleSustainHold(): void {
    if (audio.manualSustainEnabled || audio.midiSustainPedalDown) {
        audio.manualSustainEnabled = false;
        audio.midiSustainPedalDown = false;
        persist({ manualSustainEnabled: false });
        refreshSustainButton();
        releaseMidiPedalHeldNotes();
    } else {
        setManualSustain(true);
    }
}

export function bindSustainControls(): void {
    holdBtn = document.getElementById('holdBtn');
    settingsSustainBtn = document.getElementById('settingsSustainBtn');
    if (holdBtn) holdBtn.onclick = () => toggleSustainHold();
    settingsSustainBtn?.addEventListener('click', toggleSustainHold);
    refreshSustainButton();
}
