// Text drawn from a glyph-run atlas: each distinct (string, font, colour,
// shadow) is rasterised once with Canvas 2D at device resolution and then
// drawn as a textured quad.

import { compileProgram, InstanceBuffer, uniforms } from './gl.js';

export interface TextStyle {
    font: string;          // CSS font shorthand, e.g. "800 13px Quicksand, sans-serif"
    color: string;
    letterSpacing?: number; // px
    shadows?: { x: number; y: number; blur: number; color: string }[];
}

interface AtlasEntry {
    u0: number; v0: number; u1: number; v1: number;
    w: number; h: number;  // CSS px of the baked box
    ascent: number;        // CSS px from box top to the text's vertical centre
    padL: number;          // CSS px from box left to the text's left edge
    textW: number;         // advance width, CSS px
}

const VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 a_corner;
layout(location=1) in vec4 a_rect;
layout(location=2) in vec4 a_uv;
layout(location=3) in float a_alpha;
uniform vec2 u_viewport;
out vec2 v_uv;
out float v_alpha;
void main(){
    vec2 p = a_rect.xy + a_rect.zw * a_corner;
    v_uv = mix(a_uv.xy, a_uv.zw, a_corner);
    v_alpha = a_alpha;
    vec2 clip = (p / u_viewport) * 2.0 - 1.0;
    gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}`;

const FS = `#version 300 es
precision highp float;
in vec2 v_uv;
in float v_alpha;
uniform sampler2D u_tex;
out vec4 outColor;
void main(){
    outColor = texture(u_tex, v_uv) * v_alpha;
}`;

const ATLAS_W = 2048;
const ATLAS_H = 2048;
const STRIDE = 9;

export class TextRenderer {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private tex: WebGLTexture;
    private entries = new Map<string, AtlasEntry>();
    private penX = 0;
    private penY = 0;
    private rowH = 0;
    private dirty = false;
    private dpr = 1;
    private prog: WebGLProgram;
    private vao: WebGLVertexArrayObject;
    private inst: InstanceBuffer;
    private u: Record<'u_viewport' | 'u_tex', WebGLUniformLocation | null>;

    constructor(private gl: WebGL2RenderingContext) {
        this.canvas = document.createElement('canvas');
        this.canvas.width = ATLAS_W;
        this.canvas.height = ATLAS_H;
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: false })!;
        this.tex = gl.createTexture()!;
        gl.bindTexture(gl.TEXTURE_2D, this.tex);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.canvas);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        this.prog = compileProgram(gl, VS, FS);
        this.u = uniforms(gl, this.prog, ['u_viewport', 'u_tex'] as const);
        this.inst = new InstanceBuffer(gl, STRIDE, 128);
        this.vao = gl.createVertexArray()!;
        gl.bindVertexArray(this.vao);
        const corner = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, corner);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.bindVertexArray(null);
    }

    /** Device pixel ratio the atlas rasterises at; changing it drops the atlas. */
    setDpr(dpr: number): void {
        if (Math.abs(dpr - this.dpr) < 1e-3) return;
        this.dpr = dpr;
        this.clear();
    }

    clear(): void {
        this.entries.clear();
        this.ctx.clearRect(0, 0, ATLAS_W, ATLAS_H);
        this.penX = this.penY = this.rowH = 0;
        this.dirty = true;
    }

    private entry(text: string, style: TextStyle): AtlasEntry {
        const key = text + '\u0000' + style.font + '\u0000' + style.color + '\u0000' + (style.letterSpacing ?? 0)
            + '\u0000' + JSON.stringify(style.shadows ?? []);
        const hit = this.entries.get(key);
        if (hit) return hit;
        const ctx = this.ctx;
        const dpr = this.dpr;
        ctx.font = style.font;
        ctx.letterSpacing = (style.letterSpacing ?? 0) + 'px';
        const m = ctx.measureText(text);
        const fontPx = parseFloat(/(\d+(?:\.\d+)?)px/.exec(style.font)?.[1] ?? '12');
        let padL = 2, padR = 2, padT = 2, padB = 2;
        for (const s of style.shadows ?? []) {
            padL = Math.max(padL, s.blur * 2 - s.x + 2);
            padR = Math.max(padR, s.blur * 2 + s.x + 2);
            padT = Math.max(padT, s.blur * 2 - s.y + 2);
            padB = Math.max(padB, s.blur * 2 + s.y + 2);
        }
        const textW = m.width;
        const boxH = fontPx * 1.4;
        const w = Math.ceil(textW + padL + padR);
        const h = Math.ceil(boxH + padT + padB);
        const pw = Math.ceil(w * dpr), ph = Math.ceil(h * dpr);
        if (this.penX + pw > ATLAS_W) {
            this.penX = 0;
            this.penY += this.rowH + 1;
            this.rowH = 0;
        }
        if (this.penY + ph > ATLAS_H) {
            this.clear();
        }
        const x0 = this.penX, y0 = this.penY;
        ctx.save();
        ctx.setTransform(dpr, 0, 0, dpr, x0, y0);
        ctx.font = style.font;
        ctx.letterSpacing = (style.letterSpacing ?? 0) + 'px';
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        ctx.fillStyle = style.color;
        const cy = padT + boxH / 2;
        const shadows = style.shadows ?? [];
        // CSS paints text-shadows back to front (last listed is lowest).
        for (let i = shadows.length - 1; i >= 0; i--) {
            const s = shadows[i]!;
            ctx.shadowColor = s.color;
            ctx.shadowOffsetX = s.x * dpr;
            ctx.shadowOffsetY = s.y * dpr;
            ctx.shadowBlur = s.blur * dpr;
            ctx.fillText(text, padL, cy);
        }
        ctx.shadowColor = 'transparent';
        ctx.fillText(text, padL, cy);
        ctx.restore();
        this.penX += pw + 1;
        this.rowH = Math.max(this.rowH, ph);
        this.dirty = true;
        const e: AtlasEntry = {
            u0: x0 / ATLAS_W, v0: y0 / ATLAS_H, u1: (x0 + w * dpr) / ATLAS_W, v1: (y0 + h * dpr) / ATLAS_H,
            w, h, ascent: cy, padL, textW,
        };
        this.entries.set(key, e);
        return e;
    }

    /** Measured advance width of `text` in CSS px. */
    measure(text: string, style: TextStyle): number {
        return this.entry(text, style).textW;
    }

    /** Queues `text` horizontally centred on cx with its vertical centre at cy. */
    drawCentered(text: string, style: TextStyle, cx: number, cy: number, alpha = 1): void {
        if (!text) return;
        const e = this.entry(text, style);
        const x = cx - e.textW / 2 - e.padL;
        const y = cy - e.ascent;
        const o = this.inst.alloc();
        const d = this.inst.data;
        d[o] = x; d[o + 1] = y; d[o + 2] = e.w; d[o + 3] = e.h;
        d[o + 4] = e.u0; d[o + 5] = e.v0; d[o + 6] = e.u1; d[o + 7] = e.v1;
        d[o + 8] = alpha;
    }

    flush(viewW: number, viewH: number): void {
        const gl = this.gl;
        if (this.dirty) {
            gl.bindTexture(gl.TEXTURE_2D, this.tex);
            gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.canvas);
            gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
            this.dirty = false;
        }
        if (this.inst.count === 0) return;
        gl.useProgram(this.prog);
        gl.bindVertexArray(this.vao);
        this.inst.upload();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.inst.buffer);
        const S = STRIDE * 4;
        gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, S, 0); gl.vertexAttribDivisor(1, 1);
        gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, S, 16); gl.vertexAttribDivisor(2, 1);
        gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, S, 32); gl.vertexAttribDivisor(3, 1);
        gl.uniform2f(this.u.u_viewport, viewW, viewH);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.tex);
        gl.uniform1i(this.u.u_tex, 0);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.inst.count);
        gl.bindVertexArray(null);
        this.inst.reset();
    }
}
