// The keyboard: resting keys, pressed-key overlay, key light, labels and the
// key separators. Ported from the DOM keyboard (#piano, #activeKeyLayer,
// #pianoSeparatorLayer) and its CSS; each block names the rule it mirrors.

import { BLACK_MIDIS, KeyboardLayout, WHITE_MIDIS, isBlackKey } from '../core/geometry.js';
import type { Settings } from '../state/settings.js';
import { mixColor, parseColor, withAlpha, type RGBA } from './gl.js';
import { GradDir, ShapeKind, ShapeRenderer } from './shapes.js';
import { TextRenderer, type TextStyle } from './text.js';
import type { SpriteAtlas } from './sprites.js';
import { keyLabel } from '../theory/labels.js';
import type { StageGeometry } from './stage-layout.js';

export interface PressedKey {
    /** Overlay colour for this press (Follow Falling Notes), or null for the accent. */
    color: string | null;
}

export interface KeyboardFrame {
    settings: Readonly<Settings>;
    layout: KeyboardLayout;
    geo: StageGeometry;
    pressed: ReadonlyMap<number, PressedKey>;
    dpr: number;
    coarsePointer: boolean;
    /** body.perf-lite: the key light drops its blur and screen blend. */
    perfLite: boolean;
    /** Flushes queued draws so later layers paint on top. */
    flush: { shapes(): void; sprites(): void; text(): void };
}

// Sketch atlas slots (images/sketch/keys-atlas.png): whites 140x880 in a row, blacks 90x520 below.
const SKETCH_WHITE_SLOT: Record<number, number> = { 0: 0, 2: 1, 4: 2, 5: 3, 7: 4, 9: 5, 11: 6 };
const SKETCH_BLACK_SLOT: Record<number, number> = { 1: 0, 3: 1, 6: 2, 8: 3, 10: 4 };

const WHITE_GRAD: [string, number][] = [
    ['#ffffff', 0], ['#fdfdfe', 0.62], ['#f7f8fa', 0.88], ['#e9ebee', 0.95], ['#f5f6f8', 1],
];
const PIANO_BG: [string, number][] = [['#ffffff', 0], ['#f7f8fa', 0.52], ['#e9ecef', 1]];
const BLACK_SHEEN: [string, number][] = [
    ['rgba(255,255,255,.22)', 0], ['rgba(255,255,255,.05)', 0.10], ['rgba(0,0,0,0)', 0.22],
    ['rgba(0,0,0,0)', 0.78], ['rgba(0,0,0,.20)', 0.92], ['rgba(0,0,0,.30)', 1],
];
const BEVEL_GRAD: [string, number][] = [['#26282d', 0], ['#3a434f', 0.40], ['#4a4e55', 0.75], ['#4a4e55', 1]];

const INK_DARK = 'rgba(10,14,20,0.94)';
const INK_LIGHT = 'rgba(255,255,255,0.97)';

/** keyInkFor: whichever label ink wins on contrast against the pressed colour. */
export function keyInkFor(hex: string): string {
    const c = parseColor(hex);
    const lin = (v: number) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
    const L = 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
    return (L + 0.05) / 0.05 >= 1.05 / (L + 0.05) ? INK_DARK : INK_LIGHT;
}

interface LabelSpec {
    fontPx: number;
    weight: string;
    letterSpacingEm: number;
    bottomPct: number;
    color: string;
    shadows: TextStyle['shadows'];
}

// updateKeyLabelStyle: per-mode font size, weight, offset and colour.
function labelSpec(mode: string, black: boolean, whiteW: number, blackW: number, scale: number): LabelSpec {
    let spec: LabelSpec;
    const color = black ? 'rgba(255,255,255,0.98)' : 'rgba(82,86,92,0.82)';
    if (mode === 'qwerty') {
        spec = {
            fontPx: black ? Math.max(11, Math.min(blackW * 0.46, 18)) : Math.max(13, Math.min(whiteW * 0.43, 21)),
            weight: black ? '900' : '800',
            letterSpacingEm: black ? 0.025 : 0.015,
            bottomPct: black ? 12 : 6,
            color,
            shadows: black
                ? [{ x: 0, y: 1, blur: 0, color: 'rgba(0,0,0,0.95)' }, { x: 0, y: 0, blur: 5, color: 'rgba(255,255,255,0.22)' }]
                : [{ x: 0, y: 1, blur: 0, color: 'rgba(255,255,255,0.78)' }],
        };
    } else if (mode === 'octave') {
        spec = { fontPx: Math.max(4, Math.min(whiteW * 0.62, 12)), weight: '800', letterSpacingEm: -0.02, bottomPct: 6, color, shadows: [] };
    } else if (mode === 'number' || mode === 'solfege' || mode === 'japanese') {
        spec = {
            fontPx: black ? Math.max(6, Math.min(blackW * 0.24, 11)) : Math.max(11, Math.min(whiteW * 0.475, 29)),
            weight: '700', letterSpacingEm: black ? -0.02 : 0, bottomPct: black ? 7 : 6, color, shadows: [],
        };
    } else {
        spec = {
            fontPx: black ? Math.max(6, Math.min(blackW * 0.36, 15)) : Math.max(11, Math.min(whiteW * 0.475, 29)),
            weight: '700', letterSpacingEm: 0, bottomPct: black ? 7 : 6, color, shadows: [],
        };
    }
    if (scale !== 100) spec.fontPx *= scale / 100;
    return spec;
}

export class KeyboardRenderer {
    constructor(private shapes: ShapeRenderer, private text: TextRenderer, private sketchAtlas: SpriteAtlas | null) {}

    private grad(stops: [string, number][]): number {
        return this.shapes.gradients.row(stops.map(([c, p]) => [parseColor(c), p] as [RGBA, number]));
    }

    /** Box-shadow blur radius -> gaussian sigma, as browsers draw it. */
    private static sigma(blur: number): number {
        return blur / 2;
    }

    private metrics(f: KeyboardFrame) {
        const { layout, geo, settings: s } = f;
        const kw = layout.whiteWidth;                       // --kw
        return {
            top: geo.keyboardTop,
            H: geo.keyboardHeight,
            W: kw,
            kw,
            bw: layout.blackWidth,
            bh: layout.blackHeight,
            facePx: kw * (s.blackKeyEdgeDepthPercent / 100), // --bk-face
        };
    }

    /**
     * The resting keyboard (#piano): background, keys and their labels. Its
     * pixels only depend on settings, layout and which black keys are down,
     * so the renderer caches it and composites it at #piano's opacity.
     */
    drawResting(f: KeyboardFrame): void {
        const { top, H, W, kw, bw, bh, facePx } = this.metrics(f);
        if (H <= 0) return;
        const s = f.settings;
        // #piano background (shows only where keys don't cover).
        this.shapes.add({ x: 0, y: top, w: f.geo.width, h: H, colors: [[1, 1, 1, 1]], gradRow: this.grad(PIANO_BG), dir: GradDir.Vertical });
        if (s.pianoTheme === 'sketch') this.drawSketchKeys(f, top, H, bh);
        else if (s.pianoTheme === '8bit') this.draw8bitKeys(f, top, H, bh);
        else this.drawDefaultKeys(f, top, H, kw, bw, bh, facePx);
        f.flush.shapes();
        f.flush.sprites();
        // Resting labels live inside their keys; a pressed key's overlay covers its own.
        this.drawLabels(f, top, H, W, bw, bh, facePx, false);
        f.flush.text();
    }

    /** Everything above the resting keys: pressed overlay, its labels, the separators. */
    drawActive(f: KeyboardFrame): void {
        const { top, H, W, bw, bh, facePx } = this.metrics(f);
        if (H <= 0) return;
        // ── Pressed-key overlay (#activeKeyLayer) ──────────────────────────
        this.drawPressedOverlay(f, top, H, bw, bh);
        f.flush.shapes();
        // The overlay mirrors pressed keys' labels above the colour, in contrasting ink.
        this.drawLabels(f, top, H, W, bw, bh, facePx, true);
        f.flush.text();
        // ── Separators (#pianoSeparatorLayer): drawn above everything. ─────
        this.drawSeparators(f, top, H, bh);
        f.flush.shapes();
    }

    private drawDefaultKeys(f: KeyboardFrame, top: number, H: number, kw: number, bw: number, bh: number, facePx: number): void {
        const { layout, geo, pressed } = f;
        const sh = this.shapes;
        const [firstW, lastW] = layout.visibleWhiteRange();
        // ── White keys ─────────────────────────────────────────────────────
        const whiteRow = this.grad(WHITE_GRAD);
        for (let i = firstW; i <= lastW; i++) {
            const midi = WHITE_MIDIS[i]!;
            const r = layout.rect(midi);
            const y = top;
            if (f.coarsePointer) {
                sh.add({ x: r.x, y, w: r.width, h: H, radii: [0, 0, 2, 2], colors: [parseColor('#f8fafb')] });
            } else {
                sh.add({ x: r.x, y, w: r.width, h: H, radii: [0, 0, 2, 2], colors: [[1, 1, 1, 1]], gradRow: whiteRow });
                // inset 0 1px 0 #fff, inset 0 -1px 0 rgba(6,17,31,.10)
                sh.add({ x: r.x, y, w: r.width, h: H, radii: [0, 0, 2, 2], kind: ShapeKind.InsetShadow, inset: [0, 1, 0, 0], colors: [[1, 1, 1, 1]] });
                sh.add({ x: r.x, y, w: r.width, h: H, radii: [0, 0, 2, 2], kind: ShapeKind.InsetShadow, inset: [0, -1, 0, 0], colors: [parseColor('rgba(6,17,31,.10)')] });
            }
        }

        // ── Black keys ─────────────────────────────────────────────────────
        const cut = bh > 0 ? Math.max(0, Math.min(1, 1 - facePx / bh)) : 1 - f.settings.blackKeyEdgeDepthPercent / 100; // --bk-cut
        const bodyRow = this.grad([
            ['#454850', 0], ['#333b47', 0.03], ['#33363c', 0.09], ['#1d2430', 0.20], ['#191b1f', 0.58],
            ['#10151c', cut], ['#16181c', cut], ['#050506', 1],
        ]);
        const sheenRow = this.grad(BLACK_SHEEN);
        const bevelRow = this.grad(BEVEL_GRAD);
        const leftX = -bw, rightX = geo.width + bw;
        for (const midi of BLACK_MIDIS) {
            const r = layout.rect(midi);
            if (r.x > rightX || r.x + r.width < leftX) continue;
            const x = r.x, y = top, w = r.width;
            const active = pressed.has(midi);
            if (f.coarsePointer) {
                if (!active) {
                    sh.add({ x: x + 1, y: y + 2, w, h: bh, radii: [0, 0, 4, 4], kind: ShapeKind.Shadow, sigma: KeyboardRenderer.sigma(3), colors: [parseColor('rgba(0,0,0,0.35)')] });
                }
            } else if (!active) {
                // calc(kw*.05) calc(kw*.09) calc(kw*.16) rgba(0,0,0,.45)
                sh.add({ x: x + kw * 0.05, y: y + kw * 0.09, w, h: bh, radii: [0, 0, 4, 4], kind: ShapeKind.Shadow, sigma: KeyboardRenderer.sigma(kw * 0.16), colors: [parseColor('rgba(0,0,0,.45)')] });
            }
            // Body: vertical gradient under the left-to-right sheen.
            sh.add({ x, y, w, h: bh, radii: [0, 0, 4, 4], colors: [[1, 1, 1, 1]], gradRow: bodyRow });
            sh.add({ x, y, w, h: bh, radii: [0, 0, 4, 4], colors: [[1, 1, 1, 1]], gradRow: sheenRow, dir: GradDir.Horizontal });
            if (!f.coarsePointer && !active) {
                // inset calc(kw*.04) 0 calc(kw*.04) rgba(255,255,255,.05); inset calc(kw*-.04) 0 calc(kw*.07) rgba(0,0,0,.55)
                sh.add({ x, y, w, h: bh, radii: [0, 0, 4, 4], kind: ShapeKind.InsetShadow, inset: [kw * 0.04, 0, 0, 0], sigma: KeyboardRenderer.sigma(kw * 0.04), colors: [parseColor('rgba(255,255,255,.05)')] });
                sh.add({ x, y, w, h: bh, radii: [0, 0, 4, 4], kind: ShapeKind.InsetShadow, inset: [-kw * 0.04, 0, 0, 0], sigma: KeyboardRenderer.sigma(kw * 0.07), colors: [parseColor('rgba(0,0,0,.55)')] });
            }
            // 1px side borders: left rgba(255,255,255,.16), right rgba(0,0,0,.55)
            sh.add({ x, y, w, h: bh, radii: [0, 0, 4, 4], kind: ShapeKind.Border, inset: [1, 0, 0, 0], colors: [parseColor('rgba(255,255,255,.16)')] });
            sh.add({ x, y, w, h: bh, radii: [0, 0, 4, 4], kind: ShapeKind.Border, inset: [0, 0, 1, 0], colors: [parseColor('rgba(0,0,0,.55)')] });
            if (!active) {
                // ::after — the chamfer face: trapezoid, top border, 34% top radii.
                const px = x + 1, pw = w - 2;
                const faceTop = y + bh - facePx;
                sh.add({
                    x: px, y: faceTop, w: pw, h: facePx, radii: [pw * 0.34, pw * 0.34, 0, 0],
                    cut: [pw * 0.2, facePx, pw * 0.2, facePx], colors: [[1, 1, 1, 1]], gradRow: bevelRow,
                });
                sh.add({
                    x: px, y: faceTop, w: pw, h: facePx, radii: [pw * 0.34, pw * 0.34, 0, 0],
                    cut: [pw * 0.2, facePx, pw * 0.2, facePx], kind: ShapeKind.Border, inset: [0, Math.max(1, Math.round(kw * 0.02 * f.dpr)) / f.dpr, 0, 0],
                    colors: [parseColor('rgba(195,204,217,0.28)')],
                });
                // ::before — the curved highlight line just above the face.
                const bLeft = px + pw * 0.03, bW = pw * 0.94;
                const bH = Math.max(bh * 0.03, kw * 0.10);
                const lineW = Math.max(1, Math.round(kw * 0.026 * f.dpr)) / f.dpr;
                sh.add({
                    x: bLeft, y: faceTop - bH, w: bW, h: bH, radii: [0, 0, bW * 0.22, bH * 0.22],
                    kind: ShapeKind.Border, inset: [0, 0, 0, lineW], colors: [parseColor('rgba(159,169,185,0.65)')],
                });
            }
        }

    }

    /** Sketch: white keys are paper with a per-pitch-class pencil outline; black keys are ink art. */
    private drawSketchKeys(f: KeyboardFrame, top: number, H: number, bh: number): void {
        const { layout, geo } = f;
        const [firstW, lastW] = layout.visibleWhiteRange();
        const atlas = this.sketchAtlas;
        for (let i = firstW; i <= lastW; i++) {
            const r = layout.rect(WHITE_MIDIS[i]!);
            this.shapes.add({ x: r.x, y: top, w: r.width, h: H, colors: [[1, 1, 1, 1]] });
        }
        if (!atlas) return;
        for (let i = firstW; i <= lastW; i++) {
            const midi = WHITE_MIDIS[i]!;
            const r = layout.rect(midi);
            const slot = SKETCH_WHITE_SLOT[midi % 12]!;
            atlas.draw(r.x, top, r.width, H, slot * 140, 0, 140, 880);
        }
        for (const midi of BLACK_MIDIS) {
            const r = layout.rect(midi);
            if (r.x > geo.width || r.x + r.width < 0) continue;
            const slot = SKETCH_BLACK_SLOT[midi % 12]!;
            atlas.draw(r.x, top, r.width, bh, slot * 90, 880, 90, 520);
        }
    }

    /** 8-bit: flat cartridge colours, 1px border, hard inset bevel, chamfered top corners. */
    private draw8bitKeys(f: KeyboardFrame, top: number, H: number, bh: number): void {
        const { layout, geo } = f;
        const sh = this.shapes;
        const [firstW, lastW] = layout.visibleWhiteRange();
        const kw = layout.whiteWidth;
        // keys-hairline-compact: narrow keys drop the border and the chamfer.
        const compact = kw < 14;
        const border = compact ? 0 : Math.max(0.5, Math.min(kw * 0.045, 1));
        const bevel = Math.max(0.5, Math.min(kw * 0.06, 2));
        const key = (x: number, y: number, w: number, h: number, chamfer: number, fill: string, edge: string, lite: string, dark: string) => {
            const cut: [number, number, number, number] = compact ? [0, 0, 0, 0] : [chamfer, chamfer, chamfer, chamfer];
            sh.add({ x, y, w, h, cut, colors: [parseColor(fill)] });
            const ix = x + border, iy = y + border, iw = w - border * 2, ih = h - border * 2;
            const litC = parseColor(lite), darkC = parseColor(dark);
            sh.add({ x: ix, y: iy, w: iw, h: ih, cut, kind: ShapeKind.InsetShadow, inset: [bevel, 0, 0, 0], colors: [litC] });
            sh.add({ x: ix, y: iy, w: iw, h: ih, cut, kind: ShapeKind.InsetShadow, inset: [0, bevel, 0, 0], colors: [litC] });
            sh.add({ x: ix, y: iy, w: iw, h: ih, cut, kind: ShapeKind.InsetShadow, inset: [-bevel, 0, 0, 0], colors: [darkC] });
            sh.add({ x: ix, y: iy, w: iw, h: ih, cut, kind: ShapeKind.InsetShadow, inset: [0, -bevel, 0, 0], colors: [darkC] });
            if (border > 0) sh.add({ x, y, w, h, cut, kind: ShapeKind.Border, inset: [border, border, border, border], colors: [parseColor(edge)] });
        };
        for (let i = firstW; i <= lastW; i++) {
            const r = layout.rect(WHITE_MIDIS[i]!);
            key(r.x, top, r.width, H, 3, '#f4ecd8', '#241a3a', 'rgba(255,255,255,0.5)', 'rgba(36,26,58,0.3)');
        }
        for (const midi of BLACK_MIDIS) {
            const r = layout.rect(midi);
            if (r.x > geo.width || r.x + r.width < 0) continue;
            key(r.x, top, r.width, bh, 2, '#241a3a', '#160f2a', 'rgba(169,127,240,0.4)', 'rgba(0,0,0,0.45)');
        }
    }

    private accentFor(midi: number, f: KeyboardFrame): string {
        const p = f.pressed.get(midi);
        if (p?.color) return p.color;
        return isBlackKey(midi) ? f.settings.accentBlack : f.settings.accentWhite;
    }

    private drawPressedOverlay(f: KeyboardFrame, top: number, H: number, bw: number, bh: number): void {
        const sh = this.shapes;
        const { layout, settings: s } = f;
        const glowOn = s.keyGlowEnabled && s.pianoTheme === 'default';
        const n = Math.max(0, Math.min(100, s.keyGlowIntensity));
        const spread = (n / 50) * 1.75;
        const glowOpacity = Math.min(1, Number(((n / 100) * 1.75).toFixed(2)));

        const pieces: { midi: number; black: boolean }[] = [];
        for (const midi of f.pressed.keys()) pieces.push({ midi, black: isBlackKey(midi) });

        const addGlow = (x: number, y: number, w: number, h: number, accent: RGBA, radii: [number, number, number, number], mul = 1, scales = [12, 28, 48], alphas = [0.92, 0.74, 0.56]) => {
            const white: RGBA = [1, 1, 1, 1];
            const tones = [mixColor(accent, white, 0.78), mixColor(accent, white, 0.58), mixColor(accent, white, 0.38)];
            for (let i = 2; i >= 0; i--) {
                sh.add({ x, y, w, h, radii, kind: ShapeKind.Shadow, sigma: (scales[i]! * spread) / 2, colors: [withAlpha(tones[i]!, alphas[i]! * mul)] });
            }
        };

        // z0: white bottom glow shells, z1: white pieces, z3: black pieces.
        if (glowOn) {
            for (const p of pieces) {
                if (p.black) continue;
                const r = layout.rect(p.midi);
                const accent = parseColor(this.accentFor(p.midi, f));
                addGlow(r.x, top + bh, r.width, H - bh, accent, [0, 0, 2, 2], 0.792, [10, 22, 38], [0.82, 0.60, 0.40]);
            }
        }
        for (const p of pieces) {
            if (p.black) continue;
            const g = this.whitePieceGeometry(p.midi, layout);
            const accent = parseColor(this.accentFor(p.midi, f));
            if (glowOn && g.topW > 0) addGlow(g.topLeft, top, g.topW, bh, accent, [0, 0, 0, 0]);
            // The bottom piece's own drop-shadow is clipped away by its clip-path,
            // so below the black keys only the glow shell lights the neighbours.
            // Top piece between the neighbouring black keys, bottom piece across the
            // whole key. The bottom piece's tapered corners show the pressed key's
            // own `.white.active` background, which is the same accent, so the
            // bottom reads as one full-width block.
            // The top piece runs 1px into the bottom one so their antialiased
            // edges don't leave a light seam where they meet.
            if (g.topW > 0) sh.add({ x: g.topLeft, y: top, w: g.topW, h: bh + 1, colors: [accent] });
            sh.add({ x: g.left, y: top + bh, w: g.width, h: H - bh, radii: [0, 0, 2, 2], colors: [accent] });
        }
        for (const p of pieces) {
            if (!p.black) continue;
            const r = layout.rect(p.midi);
            const accent = parseColor(this.accentFor(p.midi, f));
            if (glowOn) addGlow(r.x, top, r.width, bh, accent, [0, 0, 2, 2]);
            sh.add({ x: r.x, y: top, w: r.width, h: bh, radii: [0, 0, 2, 2], colors: [accent] });
        }

        // z4/z5: key light — a blurred, masked white highlight screened onto the key.
        if (glowOn) {
            const lightAlpha = (f.perfLite ? 0.82 : 0.95) * glowOpacity;
            for (const p of pieces) {
                const accent = parseColor(this.accentFor(p.midi, f));
                const light = mixColor([1, 1, 1, 1], accent, 0.84);
                let x: number, w: number, y: number, h: number;
                if (p.black) {
                    const r = layout.rect(p.midi);
                    const pad = Math.max(3, bw * 0.34);
                    x = r.x - pad; w = bw + pad * 2; y = top - 2; h = H * 0.60;
                } else {
                    const g = this.whitePieceGeometry(p.midi, layout);
                    if (g.topW <= 0) continue;
                    x = g.topLeft; w = g.topW; y = top - 1; h = H * 0.52;
                }
                // The light is blurred by ~25px inside a box only a key wide and then
                // masked back to that box, so most of it spreads out and is cut
                // away; what remains is a soft wash, measured against the DOM
                // version at about a quarter (white) / an eighth (black) of the
                // unblurred light, peaking a third of the way down.
                const a = lightAlpha * (p.black ? 0.13 : 0.26);
                sh.add({
                    x, y, w, h, colors: [withAlpha(light, a * 0.85), withAlpha(light, a), withAlpha(light, a * 0.6), withAlpha(light, 0)],
                    stops: [0, 0.35, 0.75, 1],
                });
            }
        }
    }

    /** White key pressed-piece geometry (renderActiveKeyOverlay). */
    private whitePieceGeometry(midi: number, layout: KeyboardLayout) {
        const r = layout.rect(midi);
        const left = r.x, width = r.width, right = left + width;
        const lb = midi - 1 >= 21 && isBlackKey(midi - 1) ? layout.rect(midi - 1) : null;
        const rb = midi + 1 <= 108 && isBlackKey(midi + 1) ? layout.rect(midi + 1) : null;
        const topLeft = lb ? Math.max(left, lb.x + lb.width) : left;
        const topRight = rb ? Math.min(right, rb.x) : right;
        const topW = Math.max(0, topRight - topLeft);
        return { left, width, topLeft, topW };
    }

    /**
     * Key labels. `pressedPass` false draws every key's resting label;
     * true draws the overlay's mirrored labels on pressed keys, in an ink that
     * contrasts with the pressed colour.
     */
    private drawLabels(f: KeyboardFrame, top: number, H: number, whiteW: number, bw: number, bh: number, facePx: number, pressedPass: boolean): void {
        const s = f.settings;
        const mode = s.labelMode;
        if (mode === 'off' || mode === 'none') return;
        const whiteSpec = labelSpec(mode, false, whiteW, bw, s.keyLabelScale);
        const blackSpec = labelSpec(mode, true, whiteW, bw, s.keyLabelScale);
        // Theme sheets override the label font, weight, colour and shadow.
        const theme = s.pianoTheme;
        const family = theme === '8bit' ? "'JetBrains Mono', ui-monospace, Menlo, Consolas, monospace" : 'Quicksand, sans-serif';
        const [firstW, lastW] = f.layout.visibleWhiteRange();
        const drawOne = (midi: number, black: boolean) => {
            const pressed = pressedPass && f.pressed.has(midi);
            if (pressedPass && !pressed) return;
            const lbl = keyLabel(midi, mode);
            if (!lbl.text) return;
            const spec = black ? blackSpec : whiteSpec;
            const r = f.layout.rect(midi);
            let color = spec.color;
            let weight = spec.weight;
            let shadows = spec.shadows;
            if (theme === 'sketch') {
                color = black ? 'rgba(233,228,216,0.92)' : '#2a2a28';
                weight = '700';
                shadows = [];
            } else if (theme === '8bit') {
                color = black ? 'rgba(244,236,216,0.85)' : '#241a3a';
                weight = '800';
                shadows = [];
            }
            if (pressed) color = keyInkFor(this.accentFor(midi, f));
            const style: TextStyle = {
                font: `${weight} ${spec.fontPx}px ${family}`,
                color,
                letterSpacing: spec.letterSpacingEm * spec.fontPx,
                shadows,
            };
            const keyH = black ? bh : H;
            const bottom = top + keyH - (black ? facePx : 0) - keyH * (spec.bottomPct / 100);
            const cx = r.x + r.width / 2;
            if (lbl.ctrl) {
                // .qwerty-ctrl-label: ⌃ (0.72em, lh .75, +1px) stacked over the key (1em, lh .9).
                const fs = spec.fontPx;
                this.text.drawCentered(lbl.text, style, cx, bottom - fs * 0.45);
                const markStyle: TextStyle = { ...style, font: `${weight} ${fs * 0.72}px ${family}`, letterSpacing: spec.letterSpacingEm * fs * 0.72 };
                this.text.drawCentered('⌃', markStyle, cx, bottom - fs * 0.9 - fs * 0.27 + 1);
            } else {
                this.text.drawCentered(lbl.text, style, cx, bottom - spec.fontPx / 2);
            }
        };
        for (let i = firstW; i <= lastW; i++) drawOne(WHITE_MIDIS[i]!, false);
        for (const midi of BLACK_MIDIS) {
            const r = f.layout.rect(midi);
            if (r.x + r.width < 0 || r.x > f.geo.width) continue;
            drawOne(midi, true);
        }
    }

    private drawSeparators(f: KeyboardFrame, top: number, H: number, bh: number): void {
        const sh = this.shapes;
        const dpr = f.dpr;
        const lineW = Math.max(1, Math.round(dpr)) / dpr;
        const px = 1 / dpr;
        const core = parseColor('rgba(8,10,13,0.80)');
        const feather = parseColor('rgba(8,10,13,0.32)');
        const [firstW, lastW] = f.layout.visibleWhiteRange();
        for (let i = Math.max(1, firstW); i <= lastW; i++) {
            const midi = WHITE_MIDIS[i]!;
            // A black key sits over this boundary's top rows when the key to the left of it is black.
            const covered = isBlackKey(midi - 1);
            const y0 = covered ? top + bh : top;
            const h = top + H - y0;
            if (h <= 0) continue;
            const xb = Math.round(f.layout.rect(midi).x * dpr) / dpr;
            const x0 = xb - Math.floor(Math.max(1, Math.round(dpr)) / 2) / dpr;
            sh.add({ x: x0 - px, y: y0, w: px, h, colors: [feather] });
            sh.add({ x: x0 + lineW, y: y0, w: px, h, colors: [feather] });
            sh.add({ x: x0, y: y0, w: lineW, h, colors: [core] });
        }
    }
}
