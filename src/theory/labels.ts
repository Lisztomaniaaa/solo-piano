// Key label text for every label mode. Returns structured data; the renderer
// draws it (a `ctrl` label gets the ⌃ mark in front of `text`).

import { QWERTY_LABEL_MAP } from '../input/qwerty-map.js';

export interface KeyLabel {
    text: string;
    ctrl: boolean;
}

export const NOTE_NAME_DISPLAY = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

// Numbers / Solfège / katakana Do-Re-Mi label by scale DEGREE within the
// octave (fixed C=1/Do). A black key gets its lower white neighbour's degree
// plus '#' (C# = 1#), the movable-do convention for chromatic tones.
const DEGREE_OF_SEMITONE: Record<number, number> = { 0: 0, 2: 1, 4: 2, 5: 3, 7: 4, 9: 5, 11: 6 };
const PREV_DEGREE_OF_SEMITONE: Record<number, number> = { 1: 0, 3: 1, 6: 3, 8: 4, 10: 5 };
export const NUMBER_DEGREES = ['1', '2', '3', '4', '5', '6', '7'];
export const SOLFEGE_DEGREES = ['Do', 'Re', 'Mi', 'Fa', 'Sol', 'La', 'Si'];
export const JAPANESE_DEGREES = ['ド', 'レ', 'ミ', 'ファ', 'ソ', 'ラ', 'シ'];

const SHIFTED_DIGITS: Record<string, string> = {
    '1': '!', '2': '@', '3': '#', '4': '$', '5': '%', '6': '^', '7': '&', '8': '*', '9': '(', '0': ')',
};

const EMPTY: KeyLabel = Object.freeze({ text: '', ctrl: false });

export function formatQwertyLabel(raw: string | undefined): KeyLabel {
    if (!raw) return EMPTY;
    const v = String(raw);
    if (v.startsWith('S+')) {
        const key = v.slice(2).toUpperCase();
        return { text: SHIFTED_DIGITS[key] || key, ctrl: false };
    }
    if (v.startsWith('C+')) return { text: v.slice(2).toUpperCase(), ctrl: true };
    return { text: v.toLowerCase(), ctrl: false };
}

export function degreeLabel(midi: number, degrees: readonly string[]): string {
    const semi = midi % 12;
    const whiteDegree = DEGREE_OF_SEMITONE[semi];
    if (whiteDegree !== undefined) return degrees[whiteDegree]!;
    return degrees[PREV_DEGREE_OF_SEMITONE[semi]!]! + '#';
}

function computeLabel(midi: number, mode: string): KeyLabel {
    if (mode === 'off') return EMPTY;
    if (mode === 'qwerty') return formatQwertyLabel(QWERTY_LABEL_MAP[midi]);
    // Bare pitch letter, no octave suffix.
    if (mode === 'note') return { text: NOTE_NAME_DISPLAY[midi % 12]!, ctrl: false };
    if (mode === 'number') return { text: degreeLabel(midi, NUMBER_DEGREES), ctrl: false };
    if (mode === 'solfege') return { text: degreeLabel(midi, SOLFEGE_DEGREES), ctrl: false };
    if (mode === 'japanese') return { text: degreeLabel(midi, JAPANESE_DEGREES), ctrl: false };
    // Octave markers only: label each C (C2, C3, ...), leave the rest blank.
    if (mode === 'octave') {
        if (midi % 12 !== 0) return EMPTY;
        return { text: 'C' + (Math.floor(midi / 12) - 1), ctrl: false };
    }
    return EMPTY;
}

// Labels never change for a given (midi, mode), so each mode is computed once.
const cache = new Map<string, Map<number, KeyLabel>>();

export function keyLabel(midi: number, mode: string): KeyLabel {
    let byMidi = cache.get(mode);
    if (!byMidi) {
        byMidi = new Map();
        cache.set(mode, byMidi);
    }
    let label = byMidi.get(midi);
    if (!label) {
        label = Object.freeze(computeLabel(midi, mode));
        byMidi.set(midi, label);
    }
    return label;
}
