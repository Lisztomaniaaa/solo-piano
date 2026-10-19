// The strike line's travelling aura: tiled radial "crests" over a linear base
// glow, masked toward the top and softened by a vertical blur. One instance
// per aura layer replaces the old ::before / .sl-wave-b / ::after (and their
// multi-colour copies on #strikeLineAuraSegments).

import { compileProgram, InstanceBuffer, uniforms } from './gl.js';

export interface AuraLayer {
    x: number; y: number; w: number; h: number;  // box (the pseudo-element)
    tile: number;           // repeat-x tile width, px
    offset: number;         // horizontal scroll of the tile, px
    ellipse: [number, number, number]; // radial: rx% of tile, ry% of h, centre y% of h
    radialColor: [number, number, number, number]; // straight rgba at the centre
    radialStop: number;     // where the radial reaches transparent (0..1)
    linear: [number, number, number, number, number]; // rgba at bottom, alpha at mid
    linearStops: [number, number]; // mid stop, end stop (from the bottom, 0..1)
    mask: [number, number, number]; // alpha at the bottom, at maskStops[0], at maskStops[1]; 0 at the top
    maskStops: [number, number];
    blur: number;           // CSS blur radius (= sigma), px
    opacity: number;
    /** Gradient atlas row the radials are screened over (multi-colour), or -1. */
    tintRow: number;
    tintAlphaMul: number;
}

const STRIDE = 32;

const VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 a_corner;
layout(location=1) in vec4 a_box;
layout(location=2) in vec4 a_tile;      // tile, offset, blur, opacity
layout(location=3) in vec4 a_ell;       // rx%, ry%, cy%, radialStop
layout(location=4) in vec4 a_rc;        // radial colour
layout(location=5) in vec4 a_lc;        // linear colour (bottom)
layout(location=6) in vec4 a_lin;       // midAlpha, midStop, endStop, tintRow
layout(location=7) in vec4 a_mask;      // m0, m1, m2, tintAlphaMul
layout(location=8) in vec4 a_mstops;    // s1, s2, extentX (0 = box only)
uniform vec2 u_viewport;
out vec2 v_pos;
flat out vec4 v_box; flat out vec4 v_tile; flat out vec4 v_ell; flat out vec4 v_rc; flat out vec4 v_lc;
flat out vec4 v_lin; flat out vec4 v_mask; flat out vec4 v_mstops;
void main(){
    // The boxes overhang the stage on purpose (they scroll); only shade what's on screen.
    vec2 lo = vec2(max(a_box.x, 0.0), a_box.y);
    vec2 hi = vec2(min(a_box.x + a_box.z, u_viewport.x), a_box.y + a_box.w);
    vec2 p = mix(lo, hi, a_corner);
    v_pos = p;
    v_box = a_box; v_tile = a_tile; v_ell = a_ell; v_rc = a_rc; v_lc = a_lc; v_lin = a_lin; v_mask = a_mask; v_mstops = a_mstops;
    vec2 clip = (p / u_viewport) * 2.0 - 1.0;
    gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}`;

const FS = `#version 300 es
precision highp float;
in vec2 v_pos;
flat in vec4 v_box; flat in vec4 v_tile; flat in vec4 v_ell; flat in vec4 v_rc; flat in vec4 v_lc;
flat in vec4 v_lin; flat in vec4 v_mask; flat in vec4 v_mstops;
uniform sampler2D u_gradTex;
uniform float u_gradRows;
out vec4 outColor;

vec4 pm(vec4 c){ return vec4(c.rgb * c.a, c.a); }
vec4 screenBlend(vec4 top, vec4 base){
    // background-blend-mode: screen between layers, then the result over nothing.
    vec3 s = top.rgb + base.rgb - top.rgb * base.rgb;
    return vec4(s, top.a + base.a - top.a * base.a);
}

// Unblurred layer content at a point (premultiplied), 0 outside the box.
vec4 content(vec2 p){
    vec4 box = v_box;
    if (p.y < box.y || p.y > box.y + box.w) return vec4(0.0);
    float lx = p.x - box.x - v_tile.y;
    float tile = v_tile.x;
    float tx = lx - floor(lx / tile) * tile;
    float ly = p.y - box.y;
    vec2 c = vec2(tile * 0.5, box.w * v_ell.z);
    vec2 r = vec2(tile * v_ell.x, box.w * v_ell.y);
    float d = length((vec2(tx, ly) - c) / r);
    float k = clamp(d / v_ell.w, 0.0, 1.0);
    // CSS interpolates to 'transparent' in premultiplied space: the hue holds.
    vec4 radial = pm(vec4(v_rc.rgb, v_rc.a * (1.0 - k)));
    float tb = (box.y + box.w - p.y) / box.w;  // 0 at the bottom, 1 at the top
    vec4 linear = vec4(0.0);
    if (v_lin.z > 0.0) {
        float a;
        if (tb <= v_lin.y) a = mix(v_lc.a, v_lin.x, tb / max(v_lin.y, 1e-5));
        else a = mix(v_lin.x, 0.0, clamp((tb - v_lin.y) / max(v_lin.z - v_lin.y, 1e-5), 0.0, 1.0));
        linear = pm(vec4(v_lc.rgb, a));
    }
    if (v_lin.w >= 0.0) {
        float u = clamp((p.x - box.x) / max(box.z, 1.0), 0.0, 1.0);
        vec4 tint = texture(u_gradTex, vec2(u * (255.0 / 256.0) + 0.5 / 256.0, (v_lin.w + 0.5) / u_gradRows));
        tint = vec4(tint.rgb * tint.a, tint.a) * v_mask.w;
        return screenBlend(radial, tint);
    }
    return radial + linear * (1.0 - radial.a);
}

void main(){
    float sigma = v_tile.z;
    vec4 col;
    if (sigma < 0.5) {
        col = content(v_pos);
    } else {
        // Vertical gaussian, 9 taps across +-2 sigma.
        col = vec4(0.0);
        float wsum = 0.0;
        for (int i = -4; i <= 4; i++) {
            float o = float(i) * sigma * 0.5;
            float w = exp(-(o * o) / (2.0 * sigma * sigma));
            col += content(v_pos + vec2(0.0, o)) * w;
            wsum += w;
        }
        col /= wsum;
    }
    // mask-image (from the bottom): m0 @0, m1 @s1, m2 @s2, 0 @1.
    float tb = clamp((v_box.y + v_box.w - v_pos.y) / v_box.w, 0.0, 1.0);
    float m;
    if (tb <= v_mstops.x) m = mix(v_mask.x, v_mask.y, tb / max(v_mstops.x, 1e-5));
    else if (tb <= v_mstops.y) m = mix(v_mask.y, v_mask.z, (tb - v_mstops.x) / max(v_mstops.y - v_mstops.x, 1e-5));
    else m = mix(v_mask.z, 0.0, (tb - v_mstops.y) / max(1.0 - v_mstops.y, 1e-5));
    outColor = col * m * v_tile.w;
}`;

export class AuraRenderer {
    private prog: WebGLProgram;
    private vao: WebGLVertexArrayObject;
    private inst: InstanceBuffer;
    private u: Record<'u_viewport' | 'u_gradTex' | 'u_gradRows', WebGLUniformLocation | null>;

    constructor(private gl: WebGL2RenderingContext) {
        this.prog = compileProgram(gl, VS, FS);
        this.u = uniforms(gl, this.prog, ['u_viewport', 'u_gradTex', 'u_gradRows'] as const);
        this.inst = new InstanceBuffer(gl, STRIDE, 8);
        this.vao = gl.createVertexArray()!;
        gl.bindVertexArray(this.vao);
        const corner = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, corner);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.bindVertexArray(null);
    }

    add(l: AuraLayer): void {
        if (l.w <= 0 || l.h <= 0) return;
        const o = this.inst.alloc();
        const d = this.inst.data;
        d.set([
            l.x, l.y, l.w, l.h,
            l.tile, l.offset, l.blur, l.opacity,
            l.ellipse[0], l.ellipse[1], l.ellipse[2], l.radialStop,
            ...l.radialColor,
            l.linear[0], l.linear[1], l.linear[2], l.linear[3],
            l.linear[4], l.linearStops[0], l.linearStops[1], l.tintRow,
            l.mask[0], l.mask[1], l.mask[2], l.tintAlphaMul,
            l.maskStops[0], l.maskStops[1], 0, 0,
        ], o);
    }

    flush(viewW: number, viewH: number, gradTex: WebGLTexture, gradRows: number): void {
        if (this.inst.count === 0) return;
        const gl = this.gl;
        gl.useProgram(this.prog);
        gl.bindVertexArray(this.vao);
        this.inst.upload();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.inst.buffer);
        const S = STRIDE * 4;
        for (let i = 0; i < 8; i++) {
            gl.enableVertexAttribArray(i + 1);
            gl.vertexAttribPointer(i + 1, 4, gl.FLOAT, false, S, i * 16);
            gl.vertexAttribDivisor(i + 1, 1);
        }
        gl.uniform2f(this.u.u_viewport, viewW, viewH);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, gradTex);
        gl.uniform1i(this.u.u_gradTex, 0);
        gl.uniform1f(this.u.u_gradRows, gradRows);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.inst.count);
        gl.bindVertexArray(null);
        this.inst.reset();
    }
}
