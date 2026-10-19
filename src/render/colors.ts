// Falling-note colour resolution (Colour Mode: single / double / gradient /
// rainbow, black-key shade, gradient intensity). Ported 1:1 from the 2D
// renderer; colours are 0..255 RGB triples unless noted.

import { isBlackKey } from '../core/geometry.js';
import type { Settings } from '../state/settings.js';

export type RGB = [number, number, number];

export function hexToRgb(hex: string): RGB {
    let h = hex.trim().replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function safeHex(hex: string | null | undefined, fallback: string): RGB {
    return hexToRgb(hex || fallback);
}

function toHex(r: number, g: number, b: number): string {
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

export function hslToHex(h: number, s: number, l: number): string {
    h = ((h % 360) + 360) % 360;
    s = Math.max(0, Math.min(100, s)) / 100;
    l = Math.max(0, Math.min(100, l)) / 100;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let r: number, g: number, b: number;
    if (h < 60) { r = c; g = x; b = 0; }
    else if (h < 120) { r = x; g = c; b = 0; }
    else if (h < 180) { r = 0; g = c; b = x; }
    else if (h < 240) { r = 0; g = x; b = c; }
    else if (h < 300) { r = x; g = 0; b = c; }
    else { r = c; g = 0; b = x; }
    const hx = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
    return `#${hx(r)}${hx(g)}${hx(b)}`;
}

/** Luma-preserving saturate + brighten, rounded and clamped to bytes. */
function satBright(r0: number, g0: number, b0: number, sat: number, bright: number): RGB {
    const luma = r0 * 0.299 + g0 * 0.587 + b0 * 0.114;
    const f = (v: number) => {
        const o = (luma + (v - luma) * sat) * bright;
        return o < 0 ? 0 : o > 255 ? 255 : (o + 0.5) | 0;
    };
    return [f(r0), f(g0), f(b0)];
}

const STRING_TUTS_MIDI_OFFSET = 20;
export function midiToTuts(midi: number): number {
    const t = Math.round((Number(midi) || 0) - STRING_TUTS_MIDI_OFFSET);
    return Math.max(1, Math.min(88, Number.isFinite(t) ? t : 1));
}

export const RAINBOW_NOTE_COLORS: string[] = (() => {
    const out: string[] = [];
    for (let pc = 0; pc < 12; pc++) out.push(hslToHex((pc / 12) * 360, 85, 55));
    return out;
})();

export function rainbowColorForMidi(midi: number): string {
    return RAINBOW_NOTE_COLORS[((Math.round(midi) % 12) + 12) % 12]!;
}

export function shadeBlackKeyHex(hex: string): string {
    const [r, g, b] = safeHex(hex, '#ffffff');
    return toHex(...satBright(r, g, b, 1.12, 0.74));
}

const VERTICAL_SWEEP_BUCKETS = 96;

/** Everything colour resolution needs besides the note itself. */
export interface ColorContext {
    s: Readonly<Settings>;
    stageHeight: number;
}

function gradientTForMidi(midi: number): number {
    return Math.max(0, Math.min(1, Math.max(0, midi - 21) / 88));
}
export function gradientTForY(y: number, stageHeight: number): number {
    const h = stageHeight > 0 ? stageHeight : 600;
    const t = Math.max(0, Math.min(1, y / h));
    return Math.round(t * VERTICAL_SWEEP_BUCKETS) / VERTICAL_SWEEP_BUCKETS;
}

export function gradientColorForMidi(ctx: ColorContext, midi: number, y?: number): string {
    const s = ctx.s;
    const t = s.gradientAxis === 'vertical' && y != null ? gradientTForY(y, ctx.stageHeight) : gradientTForMidi(midi);
    const count = Math.max(1, Math.min(3, s.gradientColorCount | 0));
    const stops: RGB[] = [];
    for (let i = 0; i < count; i++) stops.push(safeHex(s.gradientColors[i], '#0099ff'));
    let r: number, g: number, b: number;
    if (stops.length === 1) {
        [r, g, b] = stops[0]!;
    } else {
        const segT = t * (stops.length - 1);
        const i0 = Math.max(0, Math.min(stops.length - 2, Math.floor(segT)));
        const localT = segT - i0;
        const a = stops[i0]!, c = stops[i0 + 1]!;
        // Blend in linear light so the midpoint reads as the perceptual midpoint.
        const toLin = (v: number) => Math.pow(v / 255, 2.2);
        const toSrgb = (v: number) => Math.pow(v < 0 ? 0 : v > 1 ? 1 : v, 1 / 2.2) * 255;
        r = toSrgb(toLin(a[0]) + (toLin(c[0]) - toLin(a[0])) * localT);
        g = toSrgb(toLin(a[1]) + (toLin(c[1]) - toLin(a[1])) * localT);
        b = toSrgb(toLin(a[2]) + (toLin(c[2]) - toLin(a[2])) * localT);
    }
    const it = Math.max(0, Math.min(100, s.gradientIntensity)) / 100;
    return toHex(...satBright(r, g, b, 0.5 + it * 0.9, 0.72 + it * 0.5));
}

/** getAnimBaseColorForMidi */
export function animBaseColorForMidi(ctx: ColorContext, midi: number, y?: number): string {
    const s = ctx.s;
    if (s.animColorMode === 'gradient') return gradientColorForMidi(ctx, midi, y);
    if (s.animColorMode === 'rainbow') return rainbowColorForMidi(midi);
    let base: string;
    if (s.animColorMode === 'double' || s.animColorSplit) {
        base = midiToTuts(midi) < s.animDoubleSplitTuts ? s.animDoubleLeftColor : s.animDoubleRightColor;
    } else {
        base = s.animColor || '#ffffff';
    }
    if (s.animKeyShade && isBlackKey(midi)) base = shadeBlackKeyHex(base);
    return base;
}

export interface Accent {
    rgbA: RGB;
    rgbB: RGB;
    dir: 'h' | 'v';
}

/** fallingNoteAccentColors: Gradient mode's per-note colour pair, else null. */
export function noteAccentColors(ctx: ColorContext, midi: number, y: number, h: number): Accent | null {
    if (ctx.s.animColorMode !== 'gradient') return null;
    if (ctx.s.gradientAxis === 'horizontal') {
        return {
            rgbA: safeHex(gradientColorForMidi(ctx, midi - 0.5, y + h * 0.5), '#78dcff'),
            rgbB: safeHex(gradientColorForMidi(ctx, midi + 0.5, y + h * 0.5), '#78dcff'),
            dir: 'h',
        };
    }
    return {
        rgbA: safeHex(gradientColorForMidi(ctx, midi, y), '#78dcff'),
        rgbB: safeHex(gradientColorForMidi(ctx, midi, y + h), '#78dcff'),
        dir: 'v',
    };
}

const solidCache = new Map<string, RGB>();
/** The flat body colour a note is drawn with (near-white -> cool white, else tuned). */
export function flatRgbFor(baseHex: string): RGB {
    let rgb = solidCache.get(baseHex);
    if (rgb === undefined) {
        const rgb0 = safeHex(baseHex, '#78dcff');
        const nearWhite = rgb0[0] >= 235 && rgb0[1] >= 235 && rgb0[2] >= 235;
        rgb = nearWhite ? [240, 248, 255] : satBright(rgb0[0], rgb0[1], rgb0[2], 1.18, 1.16);
        if (solidCache.size > 64) solidCache.clear();
        solidCache.set(baseHex, rgb);
    }
    return rgb;
}
