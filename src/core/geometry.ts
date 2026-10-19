// Keyboard geometry: the single source of truth for where every key is.
// Rendering, hit-testing, falling notes and particles all read from here.
//
// Units: a "white unit" is one white-key width. Black keys follow real piano
// geometry instead of sitting on the white-key boundary: the top of the C–E
// group is split into 5 equal slots (C, C#, D, D#, E) and the F–B group into
// 7 (F, F#, G, G#, A, A#, B), with each black key centred in its slot.

export const FIRST_MIDI = 21;  // A0
export const LAST_MIDI = 108;  // C8
export const KEY_COUNT = LAST_MIDI - FIRST_MIDI + 1;
export const WHITE_KEY_COUNT = 52;

/** Real-piano black key width as a fraction of a white key (~13.7 / 23.5 mm). */
export const BLACK_WIDTH_RATIO = 0.58;

const BLACK_PCS = new Set([1, 3, 6, 8, 10]);
// Centre of each pitch class, in white units from the octave's C.
const PC_CENTER: number[] = [
    0.5,              // C
    3 * 1.5 / 5,      // C#  (slot 2 of 5 in C–E)
    1.5,              // D
    3 * 3.5 / 5,      // D#  (slot 4 of 5)
    2.5,              // E
    3.5,              // F
    3 + 4 * 1.5 / 7,  // F#  (slot 2 of 7 in F–B)
    4.5,              // G
    3 + 4 * 3.5 / 7,  // G#  (slot 4 of 7)
    5.5,              // A
    3 + 4 * 5.5 / 7,  // A#  (slot 6 of 7)
    6.5,              // B
];

export function isBlackKey(midi: number): boolean {
    return BLACK_PCS.has(((midi % 12) + 12) % 12);
}

/** Centre of a key in white units, with A0's left edge at 0. */
export function keyCenterUnits(midi: number): number {
    const pc = ((midi % 12) + 12) % 12;
    const octaveC = midi - pc;                  // midi of this octave's C
    // A0 (21) is white index 0, so C1 (24) is white index 2 and C0 sits at -5.
    const cWhiteIndex = ((octaveC - 24) / 12) * 7 + 2;
    return cWhiteIndex + PC_CENTER[pc]!;
}

const whiteIndexByMidi = new Map<number, number>();
export const WHITE_MIDIS: number[] = [];
export const BLACK_MIDIS: number[] = [];
for (let m = FIRST_MIDI; m <= LAST_MIDI; m++) {
    if (isBlackKey(m)) {
        BLACK_MIDIS.push(m);
    } else {
        whiteIndexByMidi.set(m, WHITE_MIDIS.length);
        WHITE_MIDIS.push(m);
    }
}

export function whiteIndexOf(midi: number): number | undefined {
    return whiteIndexByMidi.get(midi);
}

export interface KeyRect {
    midi: number;
    black: boolean;
    x: number;      // left edge, CSS px in stage space
    width: number;
    height: number; // from the top of the keyboard
}

export interface LayoutInput {
    viewportWidth: number;      // CSS px
    keyboardHeight: number;     // CSS px (white key length)
    visibleWhiteCount: number;  // 3..52
    viewOffset: number;         // white units scrolled from A0 (may be fractional)
    blackWidthPercent: number;  // 100 = BLACK_WIDTH_RATIO
    blackHeightPercent: number; // % of white key length
}

export class KeyboardLayout {
    readonly whiteWidth: number;
    readonly blackWidth: number;
    readonly blackHeight: number;
    readonly offsetPx: number;
    readonly totalWidth: number;

    constructor(readonly input: LayoutInput) {
        const count = Math.max(1, Math.min(WHITE_KEY_COUNT, input.visibleWhiteCount));
        this.whiteWidth = input.viewportWidth / count;
        this.blackWidth = this.whiteWidth * BLACK_WIDTH_RATIO * (input.blackWidthPercent / 100);
        this.blackHeight = input.keyboardHeight * (input.blackHeightPercent / 100);
        this.offsetPx = input.viewOffset * this.whiteWidth;
        this.totalWidth = WHITE_KEY_COUNT * this.whiteWidth;
    }

    get keyboardHeight(): number {
        return this.input.keyboardHeight;
    }

    /** Largest valid viewOffset for this zoom level, in white units. */
    get maxViewOffset(): number {
        return Math.max(0, WHITE_KEY_COUNT - Math.max(1, Math.min(WHITE_KEY_COUNT, this.input.visibleWhiteCount)));
    }

    /** Key centre in stage CSS px. */
    centerX(midi: number): number {
        return keyCenterUnits(midi) * this.whiteWidth - this.offsetPx;
    }

    keyWidth(midi: number): number {
        return isBlackKey(midi) ? this.blackWidth : this.whiteWidth;
    }

    rect(midi: number): KeyRect {
        const black = isBlackKey(midi);
        const width = black ? this.blackWidth : this.whiteWidth;
        const x = black
            ? this.centerX(midi) - width / 2
            : whiteIndexByMidi.get(midi)! * this.whiteWidth - this.offsetPx;
        return { midi, black, x, width, height: black ? this.blackHeight : this.input.keyboardHeight };
    }

    /** First and last white index that are at least partly visible. */
    visibleWhiteRange(): [number, number] {
        const first = Math.max(0, Math.floor(this.input.viewOffset));
        const last = Math.min(WHITE_KEY_COUNT - 1, Math.ceil(this.input.viewOffset + this.input.visibleWhiteCount));
        return [first, last];
    }

    /**
     * Key under a point. `x` is stage CSS px; `y` is CSS px from the top of
     * the keyboard. Returns null outside the keyboard.
     */
    hitTest(x: number, y: number): number | null {
        if (y < 0 || y > this.input.keyboardHeight) return null;
        const units = (x + this.offsetPx) / this.whiteWidth;
        if (units < 0 || units >= WHITE_KEY_COUNT) return null;
        if (y <= this.blackHeight) {
            const half = this.blackWidth / 2;
            // Only the black keys on either side of this white key can overlap it.
            const whiteIdx = Math.floor(units);
            for (const midi of [WHITE_MIDIS[whiteIdx]! - 1, WHITE_MIDIS[whiteIdx]! + 1]) {
                if (midi < FIRST_MIDI || midi > LAST_MIDI || !isBlackKey(midi)) continue;
                const c = this.centerX(midi);
                if (x >= c - half && x <= c + half) return midi;
            }
        }
        return WHITE_MIDIS[Math.floor(units)] ?? null;
    }
}
