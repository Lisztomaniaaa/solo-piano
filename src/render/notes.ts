// Falling notes: a bar spawns at the strike line on key-down, grows upward
// while the key is held, then detaches and rises off the top of the stage.
// Model and timing ported from the 2D renderer's addFallingNote/anim/
// drawFallingNote; drawing goes to NoteRenderer (materials) or PathRenderer
// (Sketch / 8-bit themes).

import { isBlackKey, type KeyboardLayout } from '../core/geometry.js';
import type { Settings } from '../state/settings.js';
import {
    animBaseColorForMidi, flatRgbFor, gradientTForY, noteAccentColors, safeHex,
    type Accent, type ColorContext, type RGB,
} from './colors.js';
import { Material, NoteRenderer } from './note-shader.js';
import { PathRenderer, type ColorAt } from './paths.js';

const MIN_NOTE_HEIGHT = 14;
const MAX_NOTE_HEIGHT = 400;
const MAX_HELD_NOTE_MS = 7000;
const NOTE_SEAM_PX = 2;
const NOTE_MIN_VISIBLE_PX = 2;
const NOTE_TRAVEL_MAX_SEC = 7.5;
const NOTE_TRAVEL_MIN_SEC = 1.5;
export const NOTE_GLOW_MAX_PAD = 14;

interface FallingNote {
    midi: number;
    bottomY: number;
    y: number;
    height: number;
    style: Settings['material'];
    styleResolved: Settings['material'];
    shape: Settings['animShape'];
    roundness: number;
    opacity: number;
    base: string;
    accent: Accent | null;
    recolorKey: number;
    growing: boolean;
    grownAtMs: number;
    auraSeed: number;
    prevInColumn: FallingNote | null;
    dead: boolean;
}

function clampPct(v: number, fallback = 0): number {
    const raw = Number(v);
    return Math.max(0, Math.min(100, Math.round(Number.isFinite(raw) ? raw : fallback)));
}

export interface NotesFrame {
    s: Readonly<Settings>;
    layout: KeyboardLayout;
    stageWidth: number;
    stageHeight: number;
    now: number;
    dt: number;
    dpr: number;
    heavyFx: boolean;
    fallingCap: number;
    isHeld: (keyMidi: number) => boolean;
}

export class FallingNotes {
    private notes: FallingNote[] = [];
    private byMidi = new Map<number, FallingNote[]>();

    constructor(private renderer: NoteRenderer, private paths: PathRenderer) {}

    get count(): number {
        return this.notes.length;
    }

    private colorCtx(s: Readonly<Settings>, stageHeight: number): ColorContext {
        return { s, stageHeight };
    }

    /** resolveAnimStyle: heavy materials collapse to Single when heavy FX are off. */
    private static resolveStyle(style: Settings['material'], heavyFx: boolean): Settings['material'] {
        if (!heavyFx) return 'single';
        return style;
    }

    /** addFallingNote */
    add(midi: number, s: Readonly<Settings>, stageHeight: number, heavyFx: boolean): void {
        if (!Number.isFinite(midi) || midi < 21 || midi > 108) return;
        const bottomY = stageHeight;
        if (bottomY <= 6) return;
        const existing = this.byMidi.get(midi);
        let prevInColumn: FallingNote | null = null;
        if (existing) {
            for (const e of existing) if (e.growing) e.growing = false;
            for (let i = existing.length - 1; i >= 0; i--) {
                const e = existing[i]!;
                if (!e.dead) { prevInColumn = e; break; }
            }
        }
        const ctx = this.colorCtx(s, stageHeight);
        const f: FallingNote = {
            midi,
            bottomY,
            y: bottomY - MIN_NOTE_HEIGHT,
            height: MIN_NOTE_HEIGHT,
            style: s.material,
            styleResolved: FallingNotes.resolveStyle(s.material, heavyFx),
            shape: s.animShape,
            roundness: s.animRoundness,
            opacity: s.noteOpacity,
            base: animBaseColorForMidi(ctx, midi),
            accent: null,
            recolorKey: -1,
            growing: true,
            grownAtMs: performance.now(),
            auraSeed: Math.random(),
            prevInColumn,
            dead: false,
        };
        f.accent = noteAccentColors(ctx, f.midi, f.y, f.height);
        this.notes.push(f);
        let list = this.byMidi.get(midi);
        if (!list) { list = []; this.byMidi.set(midi, list); }
        list.push(f);
    }

    /** markFallingReleased */
    release(midi: number): void {
        const list = this.byMidi.get(midi);
        if (!list || !list.length) return;
        let target: FallingNote | null = null;
        let targetIndex = -1;
        let w = 0;
        for (const f of list) {
            if (f.dead) continue;
            if (f.growing) { target = f; targetIndex = w; }
            list[w++] = f;
        }
        list.length = w;
        if (target) target.growing = false;
        if (targetIndex >= 0 && targetIndex < list.length) {
            const item = list.splice(targetIndex, 1)[0]!;
            list.push(item);
        }
        if (!list.length) this.byMidi.delete(midi);
    }

    /** stopAllNotes: every growing note detaches. */
    stopGrowing(): void {
        for (const f of this.notes) f.growing = false;
        this.byMidi.clear();
    }

    /** syncFallingNoteVisualState: re-resolve style and colour of notes in flight. */
    resync(s: Readonly<Settings>, stageHeight: number, heavyFx: boolean): void {
        const ctx = this.colorCtx(s, stageHeight);
        for (const f of this.notes) {
            f.style = s.material;
            f.styleResolved = FallingNotes.resolveStyle(s.material, heavyFx);
            f.base = animBaseColorForMidi(ctx, f.midi, f.y);
            f.accent = noteAccentColors(ctx, f.midi, f.y, f.height);
        }
    }

    clear(): void {
        this.notes.length = 0;
        this.byMidi.clear();
    }

    private unregisterDead(): void {
        for (const [midi, list] of this.byMidi) {
            let w = 0;
            for (const f of list) if (!f.dead) list[w++] = f;
            list.length = w;
            if (!w) this.byMidi.delete(midi);
        }
    }

    /** Advances and draws every note. Returns true while any note is alive. */
    update(fr: NotesFrame): boolean {
        const { s, now } = fr;
        const stageH = Math.max(120, fr.stageHeight || 600);
        const t = clampPct(s.noteSpeed, 100) / 100;
        const travel = NOTE_TRAVEL_MAX_SEC - t * (NOTE_TRAVEL_MAX_SEC - NOTE_TRAVEL_MIN_SEC);
        const rise = (stageH / travel) * fr.dt;
        const maxNoteH = Math.max(MAX_NOTE_HEIGHT, fr.stageHeight || MAX_NOTE_HEIGHT);
        let live = false;
        for (const f of this.notes) {
            if (f.dead) continue;
            // Backstop for a lost key-up: a note only grows while its key is held.
            if (f.growing && !fr.isHeld(f.midi)) f.growing = false;
            if (f.growing && now - f.grownAtMs > MAX_HELD_NOTE_MS) f.growing = false;
            if (f.growing) {
                if (f.height < maxNoteH) {
                    f.height = Math.min(f.height + rise, maxNoteH);
                    f.y = f.bottomY - f.height;
                }
            } else {
                f.y -= rise;
                f.bottomY -= rise;
            }
            if (f.y + f.height < 0) { f.dead = true; continue; }
            this.draw(f, fr);
            live = true;
        }
        if (this.notes.length > 40) {
            let w = 0, removed = false;
            for (const f of this.notes) { if (!f.dead) this.notes[w++] = f; else removed = true; }
            this.notes.length = w;
            if (removed) this.unregisterDead();
        }
        // Live-note ceiling: only released (non-growing) notes are culled, oldest first.
        if (this.notes.length > fr.fallingCap) {
            let toCull = this.notes.length - fr.fallingCap;
            for (const f of this.notes) {
                if (toCull <= 0) break;
                if (!f.dead && !f.growing) { f.dead = true; toCull--; }
            }
            this.notes = this.notes.filter(f => !f.dead);
            this.unregisterDead();
        }
        if (!live) { this.notes.length = 0; this.byMidi.clear(); }
        return live;
    }

    private glowPad(s: Readonly<Settings>): number {
        if (!s.noteGlowEnabled) return 0;
        return (Math.max(0, Math.min(200, s.noteGlowIntensity)) / 100) * NOTE_GLOW_MAX_PAD;
    }

    /** drawFallingNote */
    private draw(f: FallingNote, fr: NotesFrame): void {
        const { s, layout } = fr;
        const x = layout.centerX(f.midi);
        const kw = layout.whiteWidth > 0 ? layout.whiteWidth : 20;
        const eff = Math.max(4, kw * (Math.max(0, Math.min(100, Number(s.animSize) || 0)) / 100));
        const w = isBlackKey(f.midi) ? eff * 0.7 : eff;
        const roundPct = Math.max(0, Math.min(100, Number(f.roundness ?? 100)));
        const noteAlpha = Math.max(0.1, Math.min(1, Number(f.opacity ?? 100) / 100));
        const onsetY = f.bottomY;
        let h = Math.max(MIN_NOTE_HEIGHT, f.height);
        const prev = f.prevInColumn;
        if (prev && !prev.dead) {
            const room = onsetY - prev.bottomY - NOTE_SEAM_PX;
            if (room < h) h = Math.max(NOTE_MIN_VISIBLE_PX, room);
        }
        const x0 = x - w * 0.5;
        const y = onsetY - h;
        if (y > fr.stageHeight || y + h < 0) return;
        if (x0 > fr.stageWidth || x0 + w < 0) return;

        // Vertical-axis Gradient recolours only when the note crosses a band.
        if (s.gradientAxis !== 'horizontal' && s.animColorMode === 'gradient') {
            const key = gradientTForY(y, fr.stageHeight) * 4096 + gradientTForY(y + h, fr.stageHeight);
            if (f.recolorKey !== key) {
                f.recolorKey = key;
                const ctx = this.colorCtx(s, fr.stageHeight);
                f.base = animBaseColorForMidi(ctx, f.midi, y);
                f.accent = noteAccentColors(ctx, f.midi, y, h);
            }
        }

        if (s.pianoTheme === 'sketch') {
            this.drawSketch(f, x0, y, w, h, onsetY, noteAlpha, fr.now);
            return;
        }
        if (s.pianoTheme === '8bit') {
            this.draw8bit(f, x0, y, w, h, noteAlpha);
            return;
        }

        const shape = f.shape || 'rounded';
        const isRounded = shape === 'rounded' && roundPct > 0;
        const rv = isRounded ? Math.min(8, w * 0.45, h * 0.35) * (roundPct / 100) : 0;
        const style = f.styleResolved || f.style;
        const rgb = flatRgbFor(f.base || s.animColor || '#ffffff');
        const glowPad = this.glowPad(s);
        const accent = f.accent;
        const takesGlow = style !== 'outline' && style !== 'midnight';
        const pad = takesGlow ? glowPad : 0;
        const auraAlpha = Math.min(0.85, 0.30 + (pad / NOTE_GLOW_MAX_PAD) * 0.32);
        const mid = (a: RGB, b: RGB): RGB => [Math.round((a[0] + b[0]) / 2), Math.round((a[1] + b[1]) / 2), Math.round((a[2] + b[2]) / 2)];

        let material: Material;
        let colorA: RGB = rgb, colorB: RGB = rgb;
        let accentDir: 0 | 1 | 2 = 0;
        let aura: RGB = rgb;
        let lineWidth = 0;
        const useAccent = (acc: Accent) => {
            colorA = acc.rgbA; colorB = acc.rgbB;
            accentDir = acc.dir === 'h' ? 1 : 2;
            aura = mid(acc.rgbA, acc.rgbB);
        };
        switch (style) {
            case 'outline':
                material = Material.Outline;
                lineWidth = Math.max(Math.min(1.5, 2 / (fr.dpr || 1)), Math.min(w * 0.16, 4));
                if (accent) useAccent(accent);
                break;
            case 'midnight':
                if (accent && accent.dir === 'h') { material = Material.MidnightCrossfade; useAccent(accent); }
                else { material = Material.Midnight; if (accent) useAccent(accent); }
                break;
            case 'glass': {
                material = Material.Glass;
                // An accent whose endpoints are equal is not an accent.
                if (accent && (accent.rgbA[0] !== accent.rgbB[0] || accent.rgbA[1] !== accent.rgbB[1] || accent.rgbA[2] !== accent.rgbB[2])) useAccent(accent);
                break;
            }
            case 'chrome':
                material = Material.Chrome;
                break;
            default:
                material = Material.Solid;
                if (accent) useAccent(accent);
        }
        this.renderer.add({
            x: x0, y, w, h, radius: rv, material,
            variant: Math.floor((f.auraSeed || 0) * 4), opacity: noteAlpha,
            colorA, colorB, accentDir, pad, auraColor: aura, auraAlpha: pad > 0.5 ? auraAlpha : 0, lineWidth,
        });
    }

    private fillFor(f: FallingNote, x0: number, y: number, w: number, h: number): ColorAt {
        if (f.accent) {
            const { rgbA, rgbB, dir } = f.accent;
            return (px, py) => {
                const t = dir === 'h' ? Math.max(0, Math.min(1, (px - x0) / w)) : Math.max(0, Math.min(1, (py - y) / h));
                return [(rgbA[0] + (rgbB[0] - rgbA[0]) * t) / 255, (rgbA[1] + (rgbB[1] - rgbA[1]) * t) / 255, (rgbA[2] + (rgbB[2] - rgbA[2]) * t) / 255, 1];
            };
        }
        const c = flatRgbFor(f.base || '#ffffff');
        const col: [number, number, number, number] = [(c[0] | 0) / 255, (c[1] | 0) / 255, (c[2] | 0) / 255, 1];
        return () => col;
    }

    /** drawSketchFallingNote: doubled, jittered ink outline over a flat fill. */
    private drawSketch(f: FallingNote, x: number, y: number, w: number, h: number, onsetY: number, alpha: number, nowMs: number): void {
        const seed = (f.midi * 97 + Math.round(onsetY)) % 100000;
        const t = nowMs / 1000;
        const rnd = (n: number) => { const v = Math.sin(n) * 43758.5453; return v - Math.floor(v); };
        const j = (n: number) => {
            const still = (rnd(seed + n) - 0.5) * Math.min(1.3, w * 0.06);
            const breathe = Math.sin(seed * 0.53 + n * 0.9 + t * 0.0165) * Math.min(0.28, w * 0.014);
            return still + breathe;
        };
        const lineW = Math.max(1.2, w * 0.05);
        const ink = safeHex('#2a2a28', '#2a2a28');
        const inkCol: [number, number, number, number] = [ink[0] / 255, ink[1] / 255, ink[2] / 255, 1];
        const fill = this.fillFor(f, x, y, w, h);
        const vSegs = Math.max(1, Math.round(h / 42));
        for (let pass = 0; pass < 2; pass++) {
            const o = pass === 0 ? 0.5 : -0.5;
            const pts: number[] = [x + j(1 + pass * 10) + o, y + j(2 + pass * 10) + o];
            pts.push(x + w + j(3 + pass * 10) + o, y + j(4 + pass * 10) + o);
            if (vSegs > 1) {
                for (let sIdx = 1; sIdx < vSegs; sIdx++) {
                    const fy = y + (h * sIdx) / vSegs;
                    pts.push(x + w + j(200 + pass * 50 + sIdx * 3) + o, fy + j(201 + pass * 50 + sIdx * 3) + o);
                }
            }
            pts.push(x + w + j(5 + pass * 10) + o, y + h + j(6 + pass * 10) + o);
            pts.push(x + j(7 + pass * 10) + o, y + h + j(8 + pass * 10) + o);
            if (vSegs > 1) {
                for (let sIdx = vSegs - 1; sIdx >= 1; sIdx--) {
                    const fy = y + (h * sIdx) / vSegs;
                    pts.push(x + j(300 + pass * 50 + sIdx * 3) + o, fy + j(301 + pass * 50 + sIdx * 3) + o);
                }
            }
            if (pass === 0) this.paths.fillFan(pts, fill, alpha);
            this.paths.strokeClosed(pts, lineW, () => inkCol, alpha);
        }
    }

    /** draw8bitFallingNote: grid-snapped block with stair-stepped corners and a two-tone bevel. */
    private draw8bit(f: FallingNote, x: number, y: number, w: number, h: number, alpha: number): void {
        const px = Math.max(1, Math.min(3, Math.round(Math.min(w, h) * 0.11)));
        const qx = Math.round(x / px) * px;
        const qy = Math.round(y / px) * px;
        const qw = Math.max(px * 6, Math.round(w / px) * px);
        const qh = Math.max(px * 6, Math.round(h / px) * px);
        const fill = this.fillFor(f, x, y, w, h);
        const P = this.paths;
        // Stair shape as five non-overlapping bands.
        P.rect(qx + px * 2, qy, qw - px * 4, px, fill, alpha);
        P.rect(qx + px, qy + px, qw - px * 2, px, fill, alpha);
        P.rect(qx, qy + px * 2, qw, qh - px * 4, fill, alpha);
        P.rect(qx + px, qy + qh - px * 2, qw - px * 2, px, fill, alpha);
        P.rect(qx + px * 2, qy + qh - px, qw - px * 4, px, fill, alpha);
        const outline = [
            qx + px * 2, qy, qx + qw - px * 2, qy, qx + qw - px * 2, qy + px, qx + qw - px, qy + px,
            qx + qw - px, qy + px * 2, qx + qw, qy + px * 2, qx + qw, qy + qh - px * 2, qx + qw - px, qy + qh - px * 2,
            qx + qw - px, qy + qh - px, qx + qw - px * 2, qy + qh - px, qx + qw - px * 2, qy + qh, qx + px * 2, qy + qh,
            qx + px * 2, qy + qh - px, qx + px, qy + qh - px, qx + px, qy + qh - px * 2, qx, qy + qh - px * 2,
            qx, qy + px * 2, qx + px, qy + px * 2, qx + px, qy + px, qx + px * 2, qy + px,
        ];
        const dark: [number, number, number, number] = [0x16 / 255, 0x0f / 255, 0x2a / 255, 1];
        P.strokeClosed(outline, Math.max(1, px * 0.8), () => dark, alpha);
        // Bevel bands, clipped to the stair shape.
        const bevel = Math.max(0.6, px * 0.5);
        const lite: [number, number, number, number] = [1, 1, 1, 0.32];
        const shade: [number, number, number, number] = [0, 0, 0, 0.28];
        P.rect(qx + px * 2, qy, qw - px * 4, bevel, () => lite, alpha);                 // top
        P.rect(qx, qy + px * 2, bevel, qh - px * 4, () => lite, alpha);                  // left
        P.rect(qx + px * 2, qy + qh - bevel, qw - px * 4, bevel, () => shade, alpha);    // bottom
        P.rect(qx + qw - bevel, qy + px * 2, bevel, qh - px * 4, () => shade, alpha);    // right
    }
}
