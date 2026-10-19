// The strike line: the neon bar at the stage's bottom edge, its six-ring
// halo, the travelling aura above it, and the white flash while keys are
// held. Ported from updateStrikeLineLine() and the #strikeLine /
// #strikeLineHit / #strikeLineAuraSegments CSS — one draw path instead of
// the eight overlapping DOM layers the audit found.

import type { Settings } from '../state/settings.js';
import { type RGBA } from './gl.js';
import { gradientColorForMidi, hexToRgb, rainbowColorForMidi } from './colors.js';
import { ShapeKind, ShapeRenderer } from './shapes.js';
import { AuraRenderer } from './aura-shader.js';

const STRING_TUTS_MAX = 88;

export function normalizeHexColor(hex: string | null | undefined): string | null {
    if (!hex) return null;
    let h = String(hex).trim();
    if (!h.startsWith('#')) return null;
    h = h.slice(1);
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
    return '#' + h.toLowerCase();
}

export function applyStrikeLineSaturation(hex: string, percent: number): string {
    const c = normalizeHexColor(hex) || '#ffffff';
    const p = Math.max(0, Math.min(100, Number(percent) || 0)) / 100;
    const n = parseInt(c.slice(1), 16);
    const r0 = (n >> 16) & 255, g0 = (n >> 8) & 255, b0 = n & 255;
    const gray = r0 * 0.299 + g0 * 0.587 + b0 * 0.114;
    const sat = p * 1.38;
    const lift = p * 10;
    const f = (v: number) => Math.max(0, Math.min(255, Math.round(gray + (v - gray) * sat + lift)));
    return '#' + [f(r0), f(g0), f(b0)].map(v => v.toString(16).padStart(2, '0')).join('');
}

function rgbaOf(hex: string, alpha: number): RGBA {
    const [r, g, b] = hexToRgb(hex);
    return [r / 255, g / 255, b / 255, alpha];
}

/** CSS filter: saturate(s) brightness(b), applied to a straight colour. */
function filterColor(c: RGBA, s: number, b: number, brightnessFirst = false): RGBA {
    const clamp = (v: number) => Math.max(0, Math.min(1, v));
    if (brightnessFirst) {
        // perf-lite writes `brightness() saturate()` — the other order.
        const lit: RGBA = [clamp(c[0] * b), clamp(c[1] * b), clamp(c[2] * b), c[3]];
        return filterColor(lit, s, 1);
    }
    const [r, g, bl] = c;
    const r1 = clamp((0.213 + 0.787 * s) * r + (0.715 - 0.715 * s) * g + (0.072 - 0.072 * s) * bl);
    const g1 = clamp((0.213 - 0.213 * s) * r + (0.715 + 0.285 * s) * g + (0.072 - 0.072 * s) * bl);
    const b1 = clamp((0.213 - 0.213 * s) * r + (0.715 - 0.715 * s) * g + (0.072 + 0.928 * s) * bl);
    return [clamp(r1 * b), clamp(g1 * b), clamp(b1 * b), c[3]];
}

/** --gfx-scale: viewport-relative scale for fixed px sizes. */
export function gfxScale(): number {
    const w = window.innerWidth || document.documentElement.clientWidth || 900;
    return Number(Math.max(0.7, Math.min(1.7, w / 900)).toFixed(3));
}

export interface StrikeLineFrame {
    s: Readonly<Settings>;
    width: number;
    stageHeight: number;
    nowMs: number;
    coarsePointer: boolean;
    /** #strikeLineHit.on: some emitter is held. */
    hitOn: boolean;
    /** Colour for the strike line's 'Follow' + Gradient/Vertical case: the note colour at the line. */
    stageHeightForGradient: number;
    /** body.perf-lite: fewer halo rings, lighter filter, cheaper aura. */
    perfLite: boolean;
}

interface LineColors {
    lineColor: string;
    right: string;
    stops: string[] | null;     // Follow + Gradient/Rainbow sweep
    split: boolean;
    splitPct: number;
}

export class StrikeLineRenderer {
    constructor(private shapes: ShapeRenderer, private aura: AuraRenderer) {}

    private colors(s: Readonly<Settings>, stageHeight: number): LineColors {
        const base = normalizeHexColor(s.strikeLineColor) || '#00e5ff';
        const sat = s.strikeLineSaturation;
        const follow = s.strikeLineColorFollowFallingNotes;
        const ctx = { s, stageHeight };
        let lineColor: string, right: string, stops: string[] | null = null;
        if (follow && s.animColorMode === 'gradient' && s.gradientAxis === 'vertical') {
            lineColor = right = applyStrikeLineSaturation(gradientColorForMidi(ctx, 60, stageHeight), sat);
        } else if (follow && (s.animColorMode === 'gradient' || s.animColorMode === 'rainbow')) {
            stops = [];
            for (let i = 0; i <= 12; i++) {
                const tuts = 1 + (STRING_TUTS_MAX - 1) * (i / 12);
                const midi = Math.max(1, Math.min(88, Math.round(tuts))) + 20;
                const c = s.animColorMode === 'gradient' ? gradientColorForMidi(ctx, midi) : rainbowColorForMidi(midi);
                stops.push(applyStrikeLineSaturation(c, sat));
            }
            lineColor = stops[0]!;
            right = stops[stops.length - 1]!;
        } else if (follow && s.animColorSplit) {
            lineColor = applyStrikeLineSaturation(normalizeHexColor(s.animDoubleLeftColor) || '#00e5ff', sat);
            right = applyStrikeLineSaturation(normalizeHexColor(s.animDoubleRightColor) || '#00e5ff', sat);
        } else if (follow) {
            lineColor = right = applyStrikeLineSaturation(normalizeHexColor(s.animColor) || base, sat);
        } else if (s.strikeLineColorSplit) {
            lineColor = applyStrikeLineSaturation(normalizeHexColor(s.strikeLineLeftColor) || '#00e5ff', sat);
            right = applyStrikeLineSaturation(normalizeHexColor(s.strikeLineRightColor) || '#00e5ff', sat);
        } else {
            lineColor = right = applyStrikeLineSaturation(base, sat);
        }
        const split = !stops && (follow ? s.animColorSplit : s.strikeLineColorSplit);
        const splitTuts = follow ? s.animDoubleSplitTuts : s.strikeLineSplitTuts;
        const splitPct = Math.max(0, Math.min(100, (splitTuts / STRING_TUTS_MAX) * 100));
        return { lineColor, right, stops, split, splitPct };
    }

    /**
     * Draws one phase of the strike line, in z-order: 'below' (multi-colour
     * aura at z24 and the key flash at z26), 'static' (halo + bar, cacheable
     * until settings change) and 'above' (the single-colour aura, which sits
     * inside the bar's stacking context above its background).
     */
    draw(f: StrikeLineFrame, phase: 'below' | 'static' | 'above'): void {
        const { s, width: W } = f;
        if (!s.strikeLineEnabled) return;
        const potato = s.graphicQuality === 'potato';
        const c = this.colors(s, f.stageHeightForGradient);
        const intensity = (Math.max(0, Math.min(100, Math.round(s.strikeLineBrightness))) / 100) * 2;
        const opacityLevel = Math.max(0, Math.min(100, Math.round(s.strikeLineOpacity))) / 100;
        const auraLevel = Math.max(0, Math.min(200, Number(s.strikeLineAuraSize) || 0)) / 100;
        const px = Math.max(1, Math.min(10, Math.round(Number(s.keyDustIntensity) || 2)));
        const th = px * gfxScale();
        const lineTop = f.stageHeight - th;
        const multi = !!c.stops || c.split;
        const smokeOn = !potato && auraLevel > 0.001 && opacityLevel > 0.001;

        // Aura metrics (getStrikeLineAuraMetrics).
        const auraH = Math.round(33 * auraLevel);
        const auraBlur = Math.round(8 * auraLevel);
        const shadowH = Math.round(12 * auraLevel);
        const shadowBlur = Math.round(6 * auraLevel);
        const smokeAlphaA = opacityLevel * auraLevel * 0.54;
        const smokeAlphaB = opacityLevel * auraLevel * 0.34;
        const shadowAlphaA = opacityLevel * auraLevel * 0.40;
        const shadowAlphaB = opacityLevel * auraLevel * 0.22;

        // Motion: 0% -> 7.2s per tile, 100% -> 1.6s; 0 stops the aura.
        const dur = Number((7.2 - (s.motionSpeed / 100) * 5.6).toFixed(2));
        const moving = s.motionSpeed > 0;
        const phaseLinear = moving ? ((f.nowMs / 1000) % dur) / dur : 0;
        const steps = Math.max(8, Math.round(dur * 20));
        const phaseSteps = moving ? Math.floor(phaseLinear * steps) / steps : 0;

        const mask1: [number, number, number] = [1, 0.86, 0.28];
        const mask1Stops: [number, number] = [0.42, 0.78];

        // ── #strikeLineAuraSegments (multi-colour aura; z24, outside the bar's filter) ──
        if (phase === 'below' && multi && smokeOn) {
            const auraStops = c.stops
                ? c.stops.map((col, i, arr) => ({ pct: i / (arr.length - 1), color: col }))
                : [{ pct: c.splitPct / 200, color: c.lineColor }, { pct: (c.splitPct + (100 - c.splitPct) / 2) / 100, color: c.right }];
            const tintRow = (alpha: number) => this.shapes.gradients.row(auraStops.map(st => [rgbaOf(st.color, alpha), st.pct] as [RGBA, number]));
            const rowA = tintRow(Math.min(0.66, shadowAlphaA));
            const rowB = tintRow(Math.min(0.42, shadowAlphaB));
            const white = (a: number): RGBA => [1, 1, 1, a];
            const blurA = f.coarsePointer ? 4 : f.perfLite ? 4 : auraBlur;
            const blurC = f.coarsePointer ? 3 : f.perfLite ? 4 : shadowBlur;
            const boxL = -0.18 * W, boxW = W * 1.36;
            this.aura.add({
                x: boxL, y: lineTop - auraH, w: boxW, h: auraH, tile: 190, offset: phaseSteps * 190,
                ellipse: [0.22, 1.5, 1.18], radialColor: white(Math.min(0.42, smokeAlphaA * 0.55)), radialStop: 0.6,
                linear: [0, 0, 0, 0, 0], linearStops: [0, 0], mask: mask1, maskStops: mask1Stops,
                blur: blurA, opacity: 0.5, tintRow: rowA, tintAlphaMul: 1,
            });
            this.aura.add({
                x: boxL, y: lineTop - auraH, w: boxW, h: auraH, tile: 300, offset: phaseSteps * 300,
                ellipse: [0.17, 1.35, 1.24], radialColor: white(Math.min(0.30, smokeAlphaB * 0.55)), radialStop: 0.58,
                linear: [0, 0, 0, 0, 0], linearStops: [0, 0], mask: mask1, maskStops: mask1Stops,
                blur: blurA, opacity: 0.5, tintRow: -1, tintAlphaMul: 1,
            });
            const cH = shadowH * 1.25;
            this.aura.add({
                x: -0.14 * W, y: lineTop - cH, w: W * 1.28, h: cH, tile: 240, offset: phaseSteps * 240,
                ellipse: [0.26, 1.3, 1.2], radialColor: white(Math.min(0.34, shadowAlphaA * 0.55)), radialStop: 0.6,
                linear: [0, 0, 0, 0, 0], linearStops: [0, 0], mask: [0.95, 0.45, 0.45], maskStops: [0.58, 0.58],
                blur: blurC, opacity: 0.4, tintRow: rowB, tintAlphaMul: 1,
            });
            this.flushAura(f);
        }

        // ── #strikeLineHit (z26): white flash while a key is held ──
        if (phase === 'below' && f.hitOn && !potato) {
            const hitA = 0.34;
            const col = rgbaOf(c.lineColor, 1);
            const add = (blur: number, color: RGBA) => this.shapes.add({ x: 0, y: lineTop, w: W, h: th, kind: ShapeKind.Shadow, sigma: blur / 2, colors: [[color[0], color[1], color[2], color[3] * hitA]] });
            add(38, col); add(18, col); add(6, [1, 1, 1, 1]);
            this.shapes.add({ x: 0, y: lineTop, w: W, h: th, colors: [[1, 1, 1, hitA]] });
        }

        // ── #strikeLine group (z30): halo + bar + single-colour aura, under one filter ──
        const fs = f.perfLite ? 1.18 : 1 + intensity * 0.55, fb = f.perfLite ? 1.28 : 1 + intensity * 0.10;
        const g = Math.min(1, opacityLevel); // the element's own opacity
        const F = (col: RGBA): RGBA => {
            const out = filterColor(col, fs, fb, f.perfLite);
            return [out[0], out[1], out[2], out[3] * g];
        };
        const radius = Math.min(999, th / 2);
        const radii: [number, number, number, number] = [radius, radius, radius, radius];
        if (phase === 'static' && !multi) {
            const lc = c.lineColor;
            if (f.perfLite && !f.coarsePointer) {
                const lcol = rgbaOf(lc, 1);
                for (const [blur, col] of [[30, lcol], [14, lcol], [6, [1, 1, 1, 1] as RGBA], [2, [1, 1, 1, 1] as RGBA]] as [number, RGBA][]) {
                    this.shapes.add({ x: 0, y: lineTop, w: W, h: th, radii, kind: ShapeKind.Shadow, sigma: blur / 2, colors: [F(col)] });
                }
            } else if (f.coarsePointer) {
                const cyan: RGBA = [0, 229 / 255, 1, 0.35];
                this.shapes.add({ x: 0, y: lineTop, w: W, h: th, radii, kind: ShapeKind.Shadow, sigma: 9, colors: [F(cyan)] });
                this.shapes.add({ x: 0, y: lineTop, w: W, h: th, radii, kind: ShapeKind.Shadow, sigma: 4, colors: [F(rgbaOf(lc, 1))] });
            } else {
                const rings: [number, number][] = [
                    [Math.round(10 + intensity * 134), Math.min(0.28, opacityLevel * intensity * 0.21)],
                    [Math.round(8 + intensity * 94), Math.min(0.44, opacityLevel * intensity * 0.34)],
                    [Math.round(6 + intensity * 58), Math.min(0.66, opacityLevel * intensity * 0.52)],
                    [Math.round(4 + intensity * 32), Math.min(0.88, opacityLevel * intensity * 0.72)],
                    [Math.round(2 + intensity * 15), Math.min(1, opacityLevel * intensity * 0.94)],
                    [2, Math.min(0.84, opacityLevel * (0.12 + intensity * 0.60))],
                ];
                for (const [blur, alpha] of rings) {
                    this.shapes.add({ x: 0, y: lineTop, w: W, h: th, radii, kind: ShapeKind.Shadow, sigma: blur / 2, colors: [F(rgbaOf(lc, alpha))] });
                }
            }
        }
        // Bar background.
        if (phase === 'static') {
            if (c.stops) {
                const row = this.shapes.gradients.row(c.stops.map((col, i, arr) => [F(rgbaOf(col, 1)), i / (arr.length - 1)] as [RGBA, number]));
                this.shapes.add({ x: 0, y: lineTop, w: W, h: th, radii, colors: [[1, 1, 1, 1]], gradRow: row, dir: 1 });
            } else if (c.split) {
                const lo = Math.max(0, c.splitPct - 3) / 100, hi = Math.min(100, c.splitPct + 3) / 100;
                const L = F(rgbaOf(c.lineColor, 1)), R = F(rgbaOf(c.right, 1));
                this.shapes.add({ x: 0, y: lineTop, w: W, h: th, radii, colors: [L, L, R, R], stops: [0, lo, hi, 1], dir: 1 });
            } else {
                this.shapes.add({ x: 0, y: lineTop, w: W, h: th, radii, colors: [F(rgbaOf(c.lineColor, 1))] });
            }
        }
        if (phase === 'below' || phase === 'static') this.flushShapes(f);

        // Single-colour aura: ::before, .sl-wave-b, ::after (inside the bar's filter + opacity).
        if (phase === 'above' && !multi && smokeOn) {
            const lc = c.lineColor;
            const smokeA = F(rgbaOf(lc, Math.min(0.82, smokeAlphaA)));
            const smokeB = F(rgbaOf(lc, Math.min(0.58, smokeAlphaB)));
            const shA = F(rgbaOf(lc, Math.min(0.66, shadowAlphaA)));
            const shB = F(rgbaOf(lc, Math.min(0.42, shadowAlphaB)));
            const over = (pct: number) => pct * W + 340;
            const blurA = f.coarsePointer ? 4 : f.perfLite ? 4 : auraBlur;
            const blurC = f.coarsePointer ? 3 : f.perfLite ? 4 : shadowBlur;
            this.aura.add({
                x: -over(0.18), y: lineTop - auraH, w: W + 2 * over(0.18), h: auraH, tile: 190, offset: phaseLinear * 190,
                ellipse: [0.22, 1.5, 1.18], radialColor: smokeA, radialStop: 0.6,
                linear: [shA[0], shA[1], shA[2], shA[3], shB[3]], linearStops: [0.40, 0.88],
                mask: mask1, maskStops: mask1Stops, blur: blurA, opacity: 0.5, tintRow: -1, tintAlphaMul: 1,
            });
            if (!f.perfLite) this.aura.add({
                x: -over(0.18), y: lineTop - auraH, w: W + 2 * over(0.18), h: auraH, tile: 300, offset: phaseLinear * 300,
                ellipse: [0.17, 1.35, 1.24], radialColor: smokeB, radialStop: 0.58,
                linear: [0, 0, 0, 0, 0], linearStops: [0, 0],
                mask: mask1, maskStops: mask1Stops, blur: blurA, opacity: 0.5, tintRow: -1, tintAlphaMul: 1,
            });
            const cH = shadowH * 1.25;
            this.aura.add({
                x: -over(0.14), y: lineTop - cH, w: W + 2 * over(0.14), h: cH, tile: 240, offset: phaseLinear * 240,
                ellipse: [0.26, 1.3, 1.2], radialColor: shA, radialStop: 0.6,
                linear: [shB[0], shB[1], shB[2], shB[3], 0], linearStops: [0.80, 0.80],
                mask: [0.95, 0.45, 0.45], maskStops: [0.58, 0.58], blur: blurC, opacity: 0.4, tintRow: -1, tintAlphaMul: 1,
            });
            this.flushAura(f);
        }
    }

    /** True while the aura is animating (the frame loop must keep running). */
    isAnimating(s: Readonly<Settings>): boolean {
        return s.strikeLineEnabled && s.graphicQuality !== 'potato' && s.motionSpeed > 0
            && s.strikeLineAuraSize > 0 && s.strikeLineOpacity > 0;
    }

    // Set by the renderer so layers flush in z-order.
    flushShapes: (f: StrikeLineFrame) => void = () => {};
    flushAura: (f: StrikeLineFrame) => void = () => {};
}
