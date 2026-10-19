// Strike sparks and contact flares. Physics, spawn mix and shader are the
// original GL particle layer's, now drawn as instanced quads into an
// offscreen target (additive inside the layer, like the old #fxParticles
// canvas) that is then composited over the stage in one pass.

import type { KeyboardLayout } from '../core/geometry.js';
import type { Settings } from '../state/settings.js';
import { gradientColorForMidi, hexToRgb, midiToTuts, rainbowColorForMidi } from './colors.js';
import { applyStrikeLineSaturation } from './strike-line.js';
import { compileProgram, uniforms } from './gl.js';
import { LayerTarget } from './offscreen.js';

const NEON_DUST_MAX = 4096;
const MAX_FLARE_DRAWS_PER_FRAME = 32;
const DUST_EMIT_INTERVAL = 42;
const FLARE_ATTACK_MS = 60;
const FLARE_RELEASE_MS = 340;
const STRIDE = 8; // x, y, size, alpha, heat, r, g, b

interface Geom { x: number; w: number }
interface Emitter { geom: Geom; midi: number; side: number; start: number; last: number; released: number }

const VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 a_corner;
layout(location=1) in vec4 a_sprite;  // x, y, size (negative = tongue/streak), alpha
layout(location=2) in vec4 a_color;   // heat, r, g, b
uniform vec2 u_viewport;
out vec2 v_uv;
flat out float v_alpha;
flat out float v_heat;
flat out float v_shape;
flat out vec3 v_color;
void main(){
    float size = abs(a_sprite.z);
    vec2 p = a_sprite.xy + (a_corner - 0.5) * size;
    v_uv = a_corner;
    v_alpha = a_sprite.w;
    v_heat = a_color.x;
    v_shape = a_sprite.z < 0.0 ? 1.0 : 0.0;
    v_color = a_color.yzw;
    vec2 clip = (p / u_viewport) * 2.0 - 1.0;
    gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}`;

const FS = `#version 300 es
precision highp float;
in vec2 v_uv;
flat in float v_alpha;
flat in float v_heat;
flat in float v_shape;
flat in vec3 v_color;
out vec4 outColor;
void main(){
    float a; float core;
    if (v_shape < 0.5) {
        vec2 d = v_uv - vec2(0.5);
        float r2 = dot(d, d) * 4.0;
        core = exp(-r2 * 5.0);
        float halo = exp(-r2 * 1.7) * 0.52;
        float mask = smoothstep(1.0, 0.55, r2);
        a = (core + halo) * mask * v_alpha;
    } else if (v_heat < 0.0) {
        float u = v_uv.x - 0.5;
        float dy = v_uv.y - 0.5;
        float bodyH = exp(-(u * u) * 18.0) * smoothstep(0.5, 0.4, abs(u));
        float bodyV = exp(-(dy * dy) * 260.0) * smoothstep(0.5, 0.34, abs(dy));
        core = exp(-(u * u) * 46.0 - (dy * dy) * 320.0);
        a = bodyH * bodyV * v_alpha;
    } else {
        float u = v_uv.x - 0.5;
        float v = 1.0 - v_uv.y;
        float w = mix(0.30, 0.08, smoothstep(0.0, 0.85, v));
        float body = exp(-(u * u) / (w * w) * 2.6) * smoothstep(0.5, 0.34, abs(u));
        float vert = exp(-v * 2.3) * smoothstep(1.0, 0.72, v);
        core = body * exp(-v * 5.0);
        a = body * vert * v_alpha;
    }
    if (a <= 0.004) discard;
    vec3 col = mix(v_color, vec3(1.0), abs(v_heat) * core);
    outColor = vec4(col * a, a);
}`;


function clampPct(v: number, fallback = 0): number {
    const raw = Number(v);
    return Math.max(0, Math.min(100, Math.round(Number.isFinite(raw) ? raw : fallback)));
}
const sliderRatio = (v: number, fallback = 0) => clampPct(v, fallback) / 100;
const dustFade = (t: number) => (t < 0.08 ? t / 0.08 : Math.max(0, 1 - Math.pow((t - 0.08) / 0.92, 1.6)));

export interface ParticleFrame {
    s: Readonly<Settings>;
    layout: KeyboardLayout;
    stageWidth: number;
    stageHeight: number;
    dpr: number;
    now: number;
    dt: number;
    /** getCanvasPixelBudgetScale */
    areaMul: number;
    /** Governor scale (1 = no load relief). */
    govScale: number;
}

export class Particles {
    private X = new Float32Array(NEON_DUST_MAX);
    private Y = new Float32Array(NEON_DUST_MAX);
    private VX = new Float32Array(NEON_DUST_MAX);
    private VY = new Float32Array(NEON_DUST_MAX);
    private R = new Float32Array(NEON_DUST_MAX);
    private A = new Float32Array(NEON_DUST_MAX);
    private life = new Float32Array(NEON_DUST_MAX);
    private age = new Float32Array(NEON_DUST_MAX);
    private seedA = new Float32Array(NEON_DUST_MAX);
    private seedB = new Float32Array(NEON_DUST_MAX);
    private heat = new Float32Array(NEON_DUST_MAX);
    private side = new Uint8Array(NEON_DUST_MAX);
    private count = 0;
    private stealCursor = 0;
    private emitters = new Map<number, Emitter>();

    private prog: WebGLProgram;
    private vao: WebGLVertexArrayObject;
    private layer: LayerTarget;
    private buf: WebGLBuffer;
    private packed = new Float32Array((NEON_DUST_MAX + 512) * STRIDE);
    private n = 0;
    private u: Record<'u_viewport', WebGLUniformLocation | null>;

    constructor(private gl: WebGL2RenderingContext) {
        this.prog = compileProgram(gl, VS, FS);
        this.u = uniforms(gl, this.prog, ['u_viewport'] as const);
        this.layer = new LayerTarget(gl);
        const corner = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, corner);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
        this.buf = gl.createBuffer()!;
        this.vao = gl.createVertexArray()!;
        gl.bindVertexArray(this.vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, corner);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
        gl.bufferData(gl.ARRAY_BUFFER, this.packed.byteLength, gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 4, gl.FLOAT, false, STRIDE * 4, 0);
        gl.vertexAttribDivisor(1, 1);
        gl.enableVertexAttribArray(2);
        gl.vertexAttribPointer(2, 4, gl.FLOAT, false, STRIDE * 4, 16);
        gl.vertexAttribDivisor(2, 1);
        gl.bindVertexArray(null);
    }

    /** True while an emitter is held (#strikeLineHit.on). */
    get anyHeld(): boolean {
        for (const em of this.emitters.values()) if (!em.released) return true;
        return false;
    }

    get active(): boolean {
        return this.count > 0 || this.emitters.size > 0;
    }

    private geomFor(midi: number, layout: KeyboardLayout): Geom {
        const w = layout.keyWidth(midi);
        return { x: layout.centerX(midi) - w * 0.5, w };
    }

    private dustSide(midi: number, s: Readonly<Settings>): number {
        if (s.dustColorFollowFallingNotes) {
            if (!s.animColorSplit) return 0;
            return midiToTuts(midi) < s.animDoubleSplitTuts ? 0 : 1;
        }
        if (!s.dustColorSplit) return 0;
        return midiToTuts(midi) < s.dustDoubleSplitTuts ? 0 : 1;
    }

    private static animSide(midi: number, s: Readonly<Settings>): number {
        if (!s.animColorSplit) return 0;
        return midiToTuts(midi) < s.animDoubleSplitTuts ? 0 : 1;
    }

    private alloc(): number {
        if (this.count < NEON_DUST_MAX) return this.count++;
        const idx = this.stealCursor;
        this.stealCursor = (this.stealCursor + 1) % NEON_DUST_MAX;
        return idx;
    }

    /** startNeonDust */
    start(midi: number, s: Readonly<Settings>, layout: KeyboardLayout, fr: Omit<ParticleFrame, 's' | 'layout' | 'now' | 'dt'>): void {
        if (s.graphicQuality === 'potato') return;
        if (!s.strikeLineDustEnabled && !s.strikeReactionEnabled) return;
        if (midi < 21 || midi > 108) return;
        const geom = this.geomFor(midi, layout);
        const side = this.dustSide(midi, s);
        this.emitters.set(midi, { geom, midi, side, start: performance.now(), last: 0, released: 0 });
        this.spawn(geom, 12, 0.55, side, 0.30, s, layout, fr);
    }

    /** stopNeonDust */
    stop(midi: number): void {
        const em = this.emitters.get(midi);
        if (em && !em.released) em.released = performance.now();
    }

    clear(): void {
        this.emitters.clear();
    }

    /** spawnNeonDust */
    private spawn(geom: Geom, count: number, kindMix: number, side: number, fallerMix: number,
        s: Readonly<Settings>, layout: KeyboardLayout, fr: Omit<ParticleFrame, 's' | 'layout' | 'now' | 'dt'>): void {
        if (!s.strikeLineDustEnabled || s.graphicQuality === 'potato') return;
        const countLevel = sliderRatio(s.particleCount);
        const opacityLevel = sliderRatio(s.particleOpacity, 100);
        const sizeLevel = sliderRatio(s.particleSize);
        if (countLevel <= 0.005 || opacityLevel <= 0.005 || sizeLevel <= 0.005) return;
        const stageH = fr.stageHeight || window.innerHeight * 0.6;
        const govMul = fr.govScale >= 0.999 ? 1 : Math.max(0.40, fr.govScale);
        const n = Math.round(count * countLevel * 2 * govMul * fr.areaMul);
        if (n <= 0) return;
        const dustCap = Math.max(60, Math.round(16000 * fr.areaMul));
        if (this.count >= Math.min(dustCap, NEON_DUST_MAX)) return;
        const kw = Math.max(6, layout.whiteWidth || 24);
        const sizeMul = (0.35 + sizeLevel * 1.9) * (kw / 26);
        const speedMul = (0.35 + sliderRatio(s.particleSpeed) * 1.65) * kw;
        const fadeMul = 0.45 + sliderRatio(s.particleFade) * 1.7;
        const bx = geom.x + geom.w * 0.5;
        const by = stageH - 1;
        const spread = Math.max(2.5, geom.w * 0.34);
        for (let i = 0; i < n; i++) {
            const idx = this.alloc();
            const faller = Math.random() < fallerMix;
            const spark = !faller && Math.random() < kindMix;
            this.X[idx] = bx + (Math.random() - 0.5) * spread;
            this.Y[idx] = by - Math.random() * 3;
            this.seedA[idx] = Math.random() * Math.PI * 2;
            this.seedB[idx] = 0.6 + Math.random() * 0.9;
            this.age[idx] = 0;
            this.side[idx] = side ? 1 : 0;
            if (faller) {
                this.VX[idx] = (Math.random() - 0.5) * 3.2 * kw;
                this.VY[idx] = -(2.0 + Math.random() * 5.0) * speedMul;
                this.R[idx] = Math.min(10, Math.max(1.4, (1.6 + Math.random() * 2.2) * sizeMul));
                this.A[idx] = (0.55 + Math.random() * 0.35) * opacityLevel;
                this.heat[idx] = 0.45 + Math.random() * 0.40;
                this.life[idx] = (900 + Math.random() * 900) * fadeMul;
                this.seedB[idx] = -this.seedB[idx]!;
            } else if (spark) {
                this.VX[idx] = (Math.random() - 0.5) * 2.0 * kw;
                this.VY[idx] = -(3.0 + Math.random() * 7.5) * speedMul;
                this.R[idx] = Math.min(14, Math.max(1.6, (2.2 + Math.random() * 3.2) * sizeMul));
                this.A[idx] = (0.65 + Math.random() * 0.30) * opacityLevel;
                this.heat[idx] = 0.65 + Math.random() * 0.35;
                this.life[idx] = (550 + Math.random() * 750) * fadeMul;
            } else {
                this.VX[idx] = (Math.random() - 0.5) * 1.0 * kw;
                this.VY[idx] = -(1.0 + Math.random() * 2.8) * speedMul;
                this.R[idx] = Math.min(18, Math.max(2.2, (3.4 + Math.random() * 4.6) * sizeMul));
                this.A[idx] = (0.20 + Math.random() * 0.24) * opacityLevel;
                this.heat[idx] = 0.08 + Math.random() * 0.22;
                this.life[idx] = (1000 + Math.random() * 1100) * fadeMul;
            }
        }
    }

    private dustColors(s: Readonly<Settings>, stageHeight: number): [number[], number[]] {
        const ctx = { s, stageHeight };
        let c0: string, c1: string;
        if (s.dustColorFollowFallingNotes) {
            if (s.animColorMode === 'gradient') c0 = c1 = gradientColorForMidi(ctx, 64);
            else if (s.animColorMode === 'rainbow') c0 = c1 = rainbowColorForMidi(64);
            else if (s.animColorSplit) { c0 = s.animDoubleLeftColor; c1 = s.animDoubleRightColor; }
            else c0 = c1 = s.animColor || s.dustColor;
        } else {
            c0 = s.dustColorSplit ? s.dustDoubleLeftColor : s.dustColor;
            c1 = s.dustColorSplit ? s.dustDoubleRightColor : s.dustColor;
        }
        const resolve = (c: string) => {
            const rgb = hexToRgb(applyStrikeLineSaturation(c || s.dustColor || s.strikeLineColor || '#00e5ff', s.particleSaturation));
            return [rgb[0] / 255, rgb[1] / 255, rgb[2] / 255];
        };
        return [resolve(c0), resolve(c1)];
    }

    private reactionColor(s: Readonly<Settings>, stageHeight: number, side: number, midi: number | null): number[] {
        let color: string;
        if (s.animColorMode === 'gradient' && midi != null) color = gradientColorForMidi({ s, stageHeight }, midi);
        else if (s.animColorMode === 'rainbow' && midi != null) color = rainbowColorForMidi(midi);
        else if (s.animColorSplit) color = side === 1 ? (s.animDoubleRightColor || '#0099ff') : (s.animDoubleLeftColor || '#0099ff');
        else color = s.customAnimNote || s.animColor || '#0099ff';
        const rgb = hexToRgb(color);
        return [rgb[0] / 255, rgb[1] / 255, rgb[2] / 255];
    }

    private push(x: number, y: number, size: number, alpha: number, heat: number, c: number[]): void {
        if (this.n >= NEON_DUST_MAX + 512) return;
        const o = this.n++ * STRIDE;
        const p = this.packed;
        p[o] = x; p[o + 1] = y; p[o + 2] = size; p[o + 3] = alpha;
        p[o + 4] = heat; p[o + 5] = c[0]!; p[o + 6] = c[1]!; p[o + 7] = c[2]!;
    }

    /** The five flare sprites of one held key (_packOneContactFlare). */
    private packFlare(em: Emitter, now: number, iMul: number, baseY: number, c: number[]): void {
        const attack = Math.min(1, (now - em.start) / FLARE_ATTACK_MS);
        const release = em.released ? Math.pow(Math.max(0, 1 - (now - em.released) / FLARE_RELEASE_MS), 1.5) : 1;
        const env = attack * release;
        if (env <= 0.003) return;
        const g = em.geom;
        const cx = g.x + g.w * 0.5;
        const fl = 0.86 + 0.14 * (Math.sin(now * 0.021 + em.midi * 1.7) * 0.6 + Math.sin(now * 0.0093 + em.midi * 3.1) * 0.4);
        const sway = Math.sin(now * 0.0016 + em.midi * 2.1) * 0.6 + Math.sin(now * 0.0041 + em.midi * 0.7) * 0.4;
        const hEnv = 0.55 + 0.45 * env;
        const pop = 1 + 1.1 * Math.exp(-(now - em.start) / 80);
        const keyW = Math.max(8, g.w);
        this.push(cx, baseY + keyW * 1.6, keyW * 6.4, Math.min(1, 0.30 * env * fl * iMul), 0.30, c);
        this.push(cx, baseY - 1, keyW * 1.6, Math.min(1, 0.90 * env * fl * pop * iMul), 1.0, c);
        this.push(cx, baseY - 2, -keyW * 3.6, Math.min(1, 0.50 * env * fl * pop * iMul), -0.85, c);
        const h1 = keyW * 5.4 * fl * hEnv;
        this.push(cx + sway * keyW * 0.12, baseY - h1 * 0.5 + 1, -h1, Math.min(1, 0.52 * env * fl * iMul), 0.55, c);
        const h2 = keyW * 3.0 * fl * hEnv;
        this.push(cx - sway * keyW * 0.07, baseY - h2 * 0.5 + 1, -h2, Math.min(1, 0.75 * env * fl * iMul), 0.95, c);
    }

    /** updateDrawNeonDust: physics + pack. Returns true while anything is alive. */
    update(fr: ParticleFrame): boolean {
        const { s, now, dt, layout } = fr;
        this.n = 0;
        if (s.graphicQuality === 'potato' || (!s.strikeLineDustEnabled && !s.strikeReactionEnabled)) {
            this.count = 0;
            this.emitters.clear();
            return false;
        }
        if (!s.strikeLineDustEnabled) this.count = 0;
        for (const [key, em] of this.emitters) {
            if (em.released) {
                if (now - em.released > FLARE_RELEASE_MS) this.emitters.delete(key);
                continue;
            }
            em.geom = this.geomFor(em.midi, layout);
            if (now - em.last >= DUST_EMIT_INTERVAL) {
                em.last = now;
                this.spawn(em.geom, 3, 0.35, em.side, 0.15, s, layout, fr);
            }
        }
        if (!this.count && !this.emitters.size) return false;

        const kw = Math.max(6, layout.whiteWidth || 24);
        const turb = sliderRatio(s.particleTurbulence);
        const wanderAmp = 4.6 * kw * turb;
        const dragY = Math.exp(-dt * 1.15);
        const dragX = Math.exp(-dt * 2.0);
        const driftY = -0.65 * kw;
        const gravity = 5.2 * kw;
        const { X, Y, VX, VY, R, A, life, age, seedA, seedB, heat, side } = this;
        let alive = 0;
        for (let i = 0; i < this.count; i++) {
            age[i] = age[i]! + dt * 1000;
            if (age[i]! >= life[i]! || Y[i]! < -40 || Y[i]! > (fr.stageHeight || 4096) + 30) continue;
            const tLife = life[i]! > 0 ? age[i]! / life[i]! : 1;
            if (turb > 0) {
                const a = age[i]! * 0.001;
                const wander = Math.sin(a * (5.2 * seedB[i]!) + seedA[i]!) * 0.62
                    + Math.sin(a * (11.4 * seedB[i]!) + seedA[i]! * 2.3) * 0.38;
                VX[i] = VX[i]! + wander * wanderAmp * (0.30 + Math.min(1, tLife) * 0.85) * dt;
            }
            VX[i] = VX[i]! * dragX;
            if (seedB[i]! < 0) VY[i] = VY[i]! * dragY + gravity * dt;
            else VY[i] = driftY + (VY[i]! - driftY) * dragY;
            X[i] = X[i]! + VX[i]! * dt;
            Y[i] = Y[i]! + VY[i]! * dt;
            if (alive !== i) {
                X[alive] = X[i]!; Y[alive] = Y[i]!; VX[alive] = VX[i]!; VY[alive] = VY[i]!;
                R[alive] = R[i]!; A[alive] = A[i]!; life[alive] = life[i]!; age[alive] = age[i]!;
                seedA[alive] = seedA[i]!; seedB[alive] = seedB[i]!; heat[alive] = heat[i]!; side[alive] = side[i]!;
            }
            alive++;
        }
        this.count = alive;
        if (this.stealCursor >= this.count) this.stealCursor = 0;

        // Pack dust grains.
        const [c0, c1] = this.dustColors(s, fr.stageHeight);
        for (let i = 0; i < this.count; i++) {
            const t = life[i]! > 0 ? age[i]! / life[i]! : 1;
            let alpha = Math.min(1, A[i]! * dustFade(t));
            if (seedB[i]! < 0) alpha *= 0.6 + 0.4 * Math.sin(now * (0.010 - seedB[i]! * 0.012) + seedA[i]! * 7.0);
            if (alpha <= 0.015) continue;
            // Side 1 only exists while a split is active; otherwise every grain is side 0.
            const splitOn = s.dustColorFollowFallingNotes ? s.animColorSplit : s.dustColorSplit;
            this.push(X[i]!, Y[i]!, R[i]!, alpha, heat[i]!, side[i] && splitOn ? c1 : c0);
        }
        // Contact flares (Strike Reaction).
        const iMul = sliderRatio(s.strikeReactionIntensity, 55) * 1.8 * sliderRatio(s.strikeLineOpacity, 100);
        if (s.strikeReactionEnabled && s.strikeLineEnabled && this.emitters.size && iMul > 0.001) {
            const baseY = (fr.stageHeight || 1) - 1;
            if (s.animColorMode === 'gradient' || s.animColorMode === 'rainbow') {
                let left = MAX_FLARE_DRAWS_PER_FRAME;
                for (const em of this.emitters.values()) {
                    if (left-- <= 0) break;
                    this.packFlare(em, now, iMul, baseY, this.reactionColor(s, fr.stageHeight, 0, em.midi));
                }
            } else {
                for (let sd = 0; sd < 2; sd++) {
                    if (sd === 1 && !s.animColorSplit) break;
                    const c = this.reactionColor(s, fr.stageHeight, sd, null);
                    for (const em of this.emitters.values()) {
                        if (Particles.animSide(em.midi, s) !== sd) continue;
                        this.packFlare(em, now, iMul, baseY, c);
                    }
                }
            }
        }
        return this.count > 0 || this.emitters.size > 0;
    }

    /**
     * Draws the packed sprites additively into the layer, then composites the
     * layer over the canvas (premultiplied source-over), like the old canvas.
     */
    render(viewW: number, viewH: number, canvasW: number, canvasH: number): void {
        if (this.n === 0) return;
        const gl = this.gl;
        this.layer.begin(canvasW, canvasH);
        gl.blendFunc(gl.ONE, gl.ONE);
        gl.useProgram(this.prog);
        gl.bindVertexArray(this.vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.packed, 0, this.n * STRIDE);
        gl.uniform2f(this.u.u_viewport, viewW, viewH);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.n);
        gl.bindVertexArray(null);
        this.layer.end(canvasW, canvasH);
    }
}

