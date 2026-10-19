// Computer-keyboard input: QWERTY notes (with Shift/Ctrl layers), space-bar
// sustain and arrow-key transpose.

import { pressKey, releaseKey, isInputReady, stopAllNotes } from '../core/performance.js';
import { settings } from '../state/settings.js';
import { runtime } from '../state/runtime.js';
import { setSpaceSustain } from '../audio/index.js';
import { QWERTY_INPUT_MAP } from './qwerty-map.js';

/**
 * event.code -> what it pressed, so keyup releases the same note even if
 * Shift/Ctrl or the transpose changed meanwhile. `visual` is the lit key
 * (note + transpose at press time).
 */
interface QwertyHold { midi: number; visual: number }
const qwertyHeldByCode = new Map<string, QwertyHold>();
const qwertyIgnoreTargets = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

function getKeyboardBaseKey(e: KeyboardEvent): string {
    const code = e.code;
    if (!code) return '';
    if (code.startsWith('Key')) return code.slice(3).toUpperCase();
    if (code.startsWith('Digit')) return code.slice(5);
    return '';
}

function getQwertyRawFromEvent(e: KeyboardEvent): string {
    const base = getKeyboardBaseKey(e);
    if (!base) return '';
    if (e.ctrlKey) return 'C+' + base;
    if (e.shiftKey) return 'S+' + base;
    return /^[A-Z]$/.test(base) ? base.toLowerCase() : base;
}

function shouldSkipQwertyInput(e: KeyboardEvent): boolean {
    const t = e.target as HTMLElement | null;
    if (!t) return false;
    return qwertyIgnoreTargets.has(t.tagName) || t.isContentEditable;
}

// Same as the toolbar's changeTranspose: clamp, then stop everything (even
// when the value was already at its limit).
function changeTranspose(delta: number): void {
    settings.set({ transpose: Math.max(-12, Math.min(12, settings.get().transpose + delta)) });
    stopAllNotes();
}

function onKeyDown(e: KeyboardEvent): void {
    // Focus / repeat guard runs first, so a space typed into a text field
    // stays a literal space.
    if (shouldSkipQwertyInput(e) || e.repeat) return;

    // Space holds sustain while held (a pedal, not a toggle). It can only
    // ADD sustain on top of the manual latch / MIDI pedal.
    if (e.code === 'Space') {
        // Let a focused button/link still be "clicked" by space.
        const activeTag = document.activeElement && document.activeElement.tagName;
        if (activeTag === 'BUTTON' || activeTag === 'A') return;
        e.preventDefault();
        setSpaceSustain(true);
        return;
    }

    // Arrow-key transpose: Left/Right a semitone, Up/Down an octave. Skipped
    // when the key-count stepper has focus (it has its own arrow behaviour).
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        const activeId = document.activeElement && document.activeElement.id;
        if (activeId === 'wU' || activeId === 'wD' || activeId === 'settingsWU' || activeId === 'settingsWD') return;
        e.preventDefault();
        const delta = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1
            : e.key === 'ArrowUp' ? 12 : -12;
        changeTranspose(delta);
        return;
    }

    if (!isInputReady()) return;
    const midi = QWERTY_INPUT_MAP.get(getQwertyRawFromEvent(e));
    if (!midi) return;
    e.preventDefault();
    if (qwertyHeldByCode.has(e.code)) return;
    const visual = midi + settings.get().transpose;
    qwertyHeldByCode.set(e.code, { midi, visual });
    pressKey(midi, undefined, visual);
}

function onKeyUp(e: KeyboardEvent): void {
    if (e.code === 'Space') {
        setSpaceSustain(false);
        return;
    }
    const held = qwertyHeldByCode.get(e.code);
    if (!held) return;
    e.preventDefault();
    releaseKey(held.midi, false, held.visual);
    qwertyHeldByCode.delete(e.code);
}

export function releaseQwertyHolds(): void {
    if (!qwertyHeldByCode.size) return;
    const pending = [...qwertyHeldByCode.values()];
    qwertyHeldByCode.clear();
    for (const { midi, visual } of pending) {
        try { releaseKey(midi, false, visual); } catch { /* ignore */ }
    }
}

export function initQwerty(): void {
    window.addEventListener('keydown', onKeyDown, { passive: false, capture: false });
    window.addEventListener('keyup', onKeyUp, { passive: false, capture: false });
    window.addEventListener('blur', () => {
        releaseQwertyHolds();
        // A backgrounded window never gets the keyup for a held space.
        if (runtime.get().spaceSustain) setSpaceSustain(false);
    }, { passive: true });
}
