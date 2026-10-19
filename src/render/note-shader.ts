// Instanced falling-note bodies: every material (Default, Outline, Midnight,
// Glass, Chrome) plus the Glow halo, evaluated per pixel. Replaces the 2D
// renderer's baked sprites, halo masks and chrome patterns; the formulas are
// the same ones those bakes used, just evaluated at the note's real size.

import { compileProgram, InstanceBuffer, uniforms } from './gl.js';

export const enum Material {
    Solid = 0,
    Outline = 1,
    Midnight = 2,
    Glass = 3,
    Chrome = 4,
    MidnightCrossfade = 5,
}

export interface NoteInstance {
    x: number; y: number; w: number; h: number;
    radius: number;
    material: Material;
    variant: number;        // glass streak variant 0..3
    opacity: number;        // 0..1
    colorA: [number, number, number]; // 0..255
    colorB: [number, number, number];
    accentDir: 0 | 1 | 2;   // none / horizontal / vertical
    pad: number;            // glow bleed, CSS px (0 = no glow)
    auraColor: [number, number, number];
    auraAlpha: number;
    lineWidth: number;      // outline stroke
}

const STRIDE = 24;

const VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 a_corner;
layout(location=1) in vec4 a_rect;
layout(location=2) in vec4 a_p0;   // radius, material, variant, opacity
layout(location=3) in vec4 a_ca;   // colorA.rgb (0..1), accentDir
layout(location=4) in vec4 a_cb;   // colorB.rgb, pad
layout(location=5) in vec4 a_aura; // aura.rgb, auraAlpha
layout(location=6) in vec4 a_p1;   // lineWidth
uniform vec2 u_viewport;
out vec2 v_pos;
flat out vec4 v_rect; flat out vec4 v_p0; flat out vec4 v_ca; flat out vec4 v_cb; flat out vec4 v_aura; flat out vec4 v_p1;
void main(){
    float pad = a_cb.w + 1.5;
    vec2 lo = a_rect.xy - pad;
    vec2 hi = a_rect.xy + a_rect.zw + pad;
    vec2 p = mix(lo, hi, a_corner);
    v_pos = p;
    v_rect = a_rect; v_p0 = a_p0; v_ca = a_ca; v_cb = a_cb; v_aura = a_aura; v_p1 = a_p1;
    vec2 clip = (p / u_viewport) * 2.0 - 1.0;
    gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}`;

const FS = `#version 300 es
precision highp float;
in vec2 v_pos;
flat in vec4 v_rect; flat in vec4 v_p0; flat in vec4 v_ca; flat in vec4 v_cb; flat in vec4 v_aura; flat in vec4 v_p1;
uniform float u_pxScale;
uniform sampler2D u_chromeField;
uniform vec2 u_chromeOffset;
out vec4 outColor;

float sdRoundRect(vec2 p, vec4 rect, float r){
    vec2 h = rect.zw * 0.5;
    vec2 q = p - (rect.xy + h);
    r = min(r, min(h.x, h.y));
    vec2 d = abs(q) - h + r;
    return min(max(d.x, d.y), 0.0) + length(max(d, 0.0)) - r;
}
float cover(float d){
    float aa = 0.5 / u_pxScale;
    return clamp(0.5 - d / (2.0 * aa), 0.0, 1.0);
}
vec4 over(vec4 top, vec4 base){ return top + base * (1.0 - top.a); }
vec4 pm(vec3 c, float a){ return vec4(c * a, a); }

// Gaussian-blurred rounded box (same as shapes.ts).
vec4 erf4(vec4 x){
    vec4 s = sign(x), a = abs(x);
    x = 1.0 + (0.278393 + (0.230389 + 0.078108 * (a * a)) * a) * a;
    x *= x;
    return s - s / (x * x);
}
float gaussian(float x, float sigma){ return exp(-(x * x) / (2.0 * sigma * sigma)) / (2.5066283 * sigma); }
float boxShadowX(float x, float y, float sigma, float corner, vec2 halfSize){
    float delta = min(halfSize.y - corner - abs(y), 0.0);
    float curved = halfSize.x - corner + sqrt(max(0.0, corner * corner - delta * delta));
    vec2 integral = 0.5 + 0.5 * erf4(vec4((x + vec2(-curved, curved)) * (sqrt(0.5) / sigma), 0.0, 0.0)).xy;
    return integral.y - integral.x;
}
float roundedBoxShadow(vec2 lower, vec2 upper, vec2 p, float sigma, float corner){
    vec2 center = (lower + upper) * 0.5;
    vec2 halfSize = (upper - lower) * 0.5;
    p -= center;
    float low = p.y - halfSize.y;
    float high = p.y + halfSize.y;
    float start = clamp(-3.0 * sigma, low, high);
    float end = clamp(3.0 * sigma, low, high);
    float step = (end - start) / 4.0;
    float y = start + step * 0.5;
    float value = 0.0;
    for (int i = 0; i < 4; i++) {
        value += boxShadowX(p.x, p.y - y, sigma, corner, halfSize) * gaussian(y, sigma) * step;
        y += step;
    }
    return value;
}

vec3 lite(vec3 c, float m){ return c + (1.0 - c) * m; }

// Glass: tinted veil, two edge glows, a slanted streak, and a soft double rim.
vec4 glass(vec3 c, vec2 lp, vec2 size, float r, float variant, float inside){
    vec4 acc = vec4(0.0);
    // veil 0.30 / 0.20 @45% / 0.34
    float ty = clamp(lp.y / size.y, 0.0, 1.0);
    float va = ty < 0.45 ? mix(0.30, 0.20, ty / 0.45) : mix(0.20, 0.34, (ty - 0.45) / 0.55);
    acc = over(pm(c, va), acc);
    float edgeW = max(2.0, size.x * 0.32);
    vec3 l2 = lite(c, 0.20);
    float tl = clamp(lp.x / edgeW, 0.0, 1.0);
    if (lp.x < edgeW) acc = over(pm(mix(l2, c, tl), mix(0.80, 0.0, tl)), acc);
    float tr = clamp((size.x - lp.x) / edgeW, 0.0, 1.0);
    if (lp.x > size.x - edgeW) acc = over(pm(mix(l2, c, tr), mix(0.80, 0.0, tr)), acc);
    if (size.x >= 9.0) {
        float off = variant < 0.5 ? 0.30 : variant < 1.5 ? 0.42 : variant < 2.5 ? 0.24 : 0.36;
        float cx = size.x * off;
        float sw = max(1.6, size.x * 0.16);
        float k = lp.y / size.y;
        float left = cx - sw * 0.4 - sw * 0.5 * k;
        float right = cx + sw * 0.6 - sw * 0.5 * k;
        float slope = sqrt(1.0 + (0.5 * sw / size.y) * (0.5 * sw / size.y));
        float sd = max(left - lp.x, lp.x - right) / slope;
        float sa = ty < 0.5 ? mix(0.32, 0.10, ty / 0.5) : mix(0.10, 0.26, (ty - 0.5) / 0.5);
        acc = over(pm(vec3(1.0), sa * cover(sd)), acc);
    }
    acc *= inside;
    // Rim: path inset by rimW/2; wide faint stroke under a narrow brighter one.
    float rimW = max(1.2, min(2.0, size.x * 0.07));
    vec4 rimRect = vec4(rimW * 0.5, rimW * 0.5, max(1.0, size.x - rimW), max(1.0, size.y - rimW));
    float dr = abs(sdRoundRect(lp, rimRect, max(0.0, r - rimW * 0.5)));
    vec3 l55 = lite(c, 0.55);
    acc = over(pm(l55, 0.26 * cover(dr - (rimW + 1.2) * 0.5)), acc);
    acc = over(pm(l55, 0.50 * cover(dr - rimW * 0.5)), acc);
    return acc;
}

vec3 hsl2rgb(float h, float s, float l){
    s /= 100.0; l /= 100.0;
    vec3 n = vec3(0.0, 8.0, 4.0);
    vec3 k = mod(n + h / 30.0, 12.0);
    float a = s * min(l, 1.0 - l);
    return l - a * max(vec3(-1.0), min(min(k - 3.0, 9.0 - k), vec3(1.0)));
}
vec3 rgb2hsl(vec3 c){
    float mx = max(max(c.r, c.g), c.b), mn = min(min(c.r, c.g), c.b);
    float h = 0.0, s = 0.0, l = (mx + mn) * 0.5;
    if (mx != mn) {
        float d = mx - mn;
        s = l > 0.5 ? d / (2.0 - mx - mn) : d / (mx + mn);
        if (mx == c.r) h = (c.g - c.b) / d + (c.g < c.b ? 6.0 : 0.0);
        else if (mx == c.g) h = (c.b - c.r) / d + 2.0;
        else h = (c.r - c.g) / d + 4.0;
        h *= 60.0;
    }
    return vec3(h, s * 100.0, l * 100.0);
}
// Chrome: warped-noise field (rx, ridge) coloured through a 4-stop HSL ramp.
vec3 chrome(vec3 c){
    vec2 f = texture(u_chromeField, (v_pos - u_chromeOffset) / (256.0 * 3.2)).rg;
    float t = f.r, ridge = f.g;
    vec3 hsl = rgb2hsl(c);
    vec3 r0 = hsl2rgb(hsl.x, hsl.y * 0.90, 16.0);
    vec3 r1 = hsl2rgb(hsl.x, hsl.y, 34.0);
    vec3 r2 = hsl2rgb(hsl.x, hsl.y * 0.85, 62.0);
    vec3 r3 = hsl2rgb(hsl.x, hsl.y * 0.80, 12.0);
    float xr = t * 3.0;
    float si = xr < 2.0 ? floor(xr) : 2.0;
    float fr = xr - si;
    vec3 a = si < 0.5 ? r0 : si < 1.5 ? r1 : r2;
    vec3 b = si < 0.5 ? r1 : si < 1.5 ? r2 : r3;
    float k = 0.42 + ridge * 0.85;
    float spec = ridge * ridge * ridge * 0.62 * 165.0 / 255.0;
    return min((a + (b - a) * fr) * k + spec, vec3(1.0));
}

vec3 midnightTone(vec3 c, float m){ return m >= 0.0 ? c + (1.0 - c) * m : c * -m; }
vec3 midnight(vec3 a, vec3 b, bool vert, float t){
    // 4 stops: lite .25 @0, base @.32, dark .42 @.72, dark .14 @1; vertical
    // accents take each stop's colour from wherever the pair has got to.
    vec3 c0 = midnightTone(vert ? a : a, 0.25);
    vec3 c1 = midnightTone(vert ? mix(a, b, 0.32) : a, 0.0);
    vec3 c2 = midnightTone(vert ? mix(a, b, 0.72) : a, -0.42);
    vec3 c3 = midnightTone(vert ? b : a, -0.14);
    if (t <= 0.32) return mix(c0, c1, t / 0.32);
    if (t <= 0.72) return mix(c1, c2, (t - 0.32) / 0.40);
    return mix(c2, c3, (t - 0.72) / 0.28);
}

void main(){
    vec4 rect = v_rect;
    float r = v_p0.x;
    float material = v_p0.y;
    float variant = v_p0.z;
    float opacity = v_p0.w;
    vec3 ca = v_ca.rgb, cb = v_cb.rgb;
    float accentDir = v_ca.w;
    float pad = v_cb.w;
    vec2 lp = v_pos - rect.xy;
    float d = sdRoundRect(v_pos, rect, r);
    float inside = cover(d);
    float tx = clamp(lp.x / rect.z, 0.0, 1.0);
    float ty = clamp(lp.y / rect.w, 0.0, 1.0);
    float tAcc = accentDir > 1.5 ? ty : tx;
    bool hasAcc = accentDir > 0.5;

    vec4 col = vec4(0.0);
    // Glow halo under the body (styles with glow only; pad == 0 otherwise).
    if (pad > 0.5) {
        vec2 rel = v_pos - (rect.xy - pad);
        if (rel.x >= 0.0 && rel.y >= 0.0 && rel.x <= rect.z + pad * 2.0 && rel.y <= rect.w + pad * 2.0) {
            float sigma = max(1.0, pad * 0.4);
            float halo = roundedBoxShadow(rect.xy, rect.xy + rect.zw, v_pos, sigma, r);
            col = pm(v_aura.rgb, v_aura.a * clamp(halo, 0.0, 1.0));
        }
    }

    vec4 body;
    if (material < 0.5) {
        vec3 c = hasAcc ? mix(ca, cb, tAcc) : ca;
        body = pm(c, inside);
    } else if (material < 1.5) {
        float lw = v_p1.x;
        float ring = inside * (1.0 - cover(sdRoundRect(v_pos, vec4(rect.xy + lw, rect.zw - 2.0 * lw), max(0.0, r - lw))));
        vec3 c = hasAcc ? mix(ca, cb, tAcc) : ca;
        body = pm(c, ring);
    } else if (material < 2.5) {
        body = pm(midnight(ca, cb, hasAcc, ty), inside);
    } else if (material < 3.5) {
        vec4 ga = glass(ca, lp, rect.zw, r, variant, inside);
        if (hasAcc) {
            vec4 gb = glass(cb, lp, rect.zw, r, variant, inside);
            body = ga * (1.0 - tAcc) + gb * tAcc;
        } else body = ga;
    } else if (material < 4.5) {
        body = pm(chrome(ca), inside);
    } else {
        // Midnight with a horizontal accent: each endpoint baked, cross-faded.
        vec3 a = midnight(ca, ca, false, ty);
        vec3 b = midnight(cb, cb, false, ty);
        body = pm(mix(a, b, tx), inside);
    }
    col = over(body, col);
    outColor = col * opacity;
}`;

export class NoteRenderer {
    private prog: WebGLProgram;
    private vao: WebGLVertexArrayObject;
    private inst: InstanceBuffer;
    private u: Record<'u_viewport' | 'u_pxScale' | 'u_chromeField' | 'u_chromeOffset', WebGLUniformLocation | null>;
    private chromeTex: WebGLTexture | null = null;

    constructor(private gl: WebGL2RenderingContext) {
        this.prog = compileProgram(gl, VS, FS);
        this.u = uniforms(gl, this.prog, ['u_viewport', 'u_pxScale', 'u_chromeField', 'u_chromeOffset'] as const);
        this.inst = new InstanceBuffer(gl, STRIDE, 256);
        this.vao = gl.createVertexArray()!;
        gl.bindVertexArray(this.vao);
        const corner = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, corner);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.bindVertexArray(null);
    }

    get count(): number {
        return this.inst.count;
    }

    add(n: NoteInstance): void {
        const o = this.inst.alloc();
        const d = this.inst.data;
        d[o] = n.x; d[o + 1] = n.y; d[o + 2] = n.w; d[o + 3] = n.h;
        d[o + 4] = n.radius; d[o + 5] = n.material; d[o + 6] = n.variant; d[o + 7] = n.opacity;
        d[o + 8] = n.colorA[0] / 255; d[o + 9] = n.colorA[1] / 255; d[o + 10] = n.colorA[2] / 255; d[o + 11] = n.accentDir;
        d[o + 12] = n.colorB[0] / 255; d[o + 13] = n.colorB[1] / 255; d[o + 14] = n.colorB[2] / 255; d[o + 15] = n.pad;
        d[o + 16] = n.auraColor[0] / 255; d[o + 17] = n.auraColor[1] / 255; d[o + 18] = n.auraColor[2] / 255; d[o + 19] = n.auraAlpha;
        d[o + 20] = n.lineWidth; d[o + 21] = 0; d[o + 22] = 0; d[o + 23] = 0;
    }

    private ensureChromeTexture(): WebGLTexture {
        if (this.chromeTex) return this.chromeTex;
        const gl = this.gl;
        const { rx, ridge, size } = bakeChromeField();
        const px = new Uint8Array(size * size * 4);
        for (let i = 0; i < size * size; i++) {
            px[i * 4] = Math.round(Math.max(0, Math.min(1, rx[i]!)) * 255);
            px[i * 4 + 1] = Math.round(Math.max(0, Math.min(1, ridge[i]!)) * 255);
            px[i * 4 + 3] = 255;
        }
        const tex = gl.createTexture()!;
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, px);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
        this.chromeTex = tex;
        return tex;
    }

    flush(viewW: number, viewH: number, pxScale: number, chromeOffset: [number, number], needChrome: boolean): void {
        if (this.inst.count === 0) return;
        const gl = this.gl;
        gl.useProgram(this.prog);
        gl.bindVertexArray(this.vao);
        this.inst.upload();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.inst.buffer);
        const S = STRIDE * 4;
        for (let i = 0; i < 6; i++) {
            gl.enableVertexAttribArray(i + 1);
            gl.vertexAttribPointer(i + 1, 4, gl.FLOAT, false, S, i * 16);
            gl.vertexAttribDivisor(i + 1, 1);
        }
        gl.uniform2f(this.u.u_viewport, viewW, viewH);
        gl.uniform1f(this.u.u_pxScale, pxScale);
        gl.uniform2f(this.u.u_chromeOffset, chromeOffset[0], chromeOffset[1]);
        if (needChrome) {
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, this.ensureChromeTexture());
            gl.uniform1i(this.u.u_chromeField, 0);
        }
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.inst.count);
        gl.bindVertexArray(null);
        this.inst.reset();
    }
}

// ── Chrome field: periodic domain-warped value noise, baked once. ────────
const CHROME_SHEET_PX = 256;
const CHROME_PERIOD = 2;
const CHROME_WARP = 2.3;

const CHROME_PERM = (() => {
    const p = new Uint8Array(512);
    const base = new Uint8Array(256);
    for (let i = 0; i < 256; i++) base[i] = i;
    let s = 1337 >>> 0;
    for (let i = 255; i > 0; i--) {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        const j = s % (i + 1);
        const t = base[i]!; base[i] = base[j]!; base[j] = t;
    }
    for (let i = 0; i < 512; i++) p[i] = base[i & 255]!;
    return p;
})();
const chFade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
const chLerp = (a: number, b: number, t: number) => a + t * (b - a);
function chGrad(h: number, x: number, y: number): number {
    const g = h & 7, u = g < 4 ? x : y, v = g < 4 ? y : x;
    return ((g & 1) ? -u : u) + ((g & 2) ? -2 * v : 2 * v);
}
function chNoise2(x: number, y: number, period: number): number {
    const P = period < 1 ? 1 : period;
    const fx = Math.floor(x), fy = Math.floor(y);
    const xf = x - fx, yf = y - fy;
    const X = ((fx % P) + P) % P, Y = ((fy % P) + P) % P;
    const X1 = (X + 1) % P, Y1 = (Y + 1) % P;
    const u = chFade(xf), v = chFade(yf);
    const pm = CHROME_PERM;
    const aa = pm[pm[X]! + Y]!, ab = pm[pm[X]! + Y1]!;
    const ba = pm[pm[X1]! + Y]!, bb = pm[pm[X1]! + Y1]!;
    const x1 = chLerp(chGrad(aa, xf, yf), chGrad(ba, xf - 1, yf), u);
    const x2 = chLerp(chGrad(ab, xf, yf - 1), chGrad(bb, xf - 1, yf - 1), u);
    return (chLerp(x1, x2, v) + 1) / 2;
}
function chFbm(x: number, y: number, oct: number, period: number): number {
    let t = 0, a = 0.5, f = 1, m = 0;
    for (let i = 0; i < oct; i++) {
        t += chNoise2(x * f, y * f, period * f) * a;
        m += a; a *= 0.5; f *= 2;
    }
    return t / m;
}
function bakeChromeField(): { rx: Float32Array; ridge: Float32Array; size: number } {
    const N = CHROME_SHEET_PX, P = CHROME_PERIOD, w = CHROME_WARP;
    const rxA = new Float32Array(N * N);
    const ridgeA = new Float32Array(N * N);
    for (let y = 0; y < N; y++) {
        const ny = (y / N) * P;
        for (let x = 0; x < N; x++) {
            const nx = (x / N) * P;
            const qx = chFbm(nx, ny, 3, P);
            const qy = chFbm(nx + 5.2, ny + 1.3, 3, P);
            const rx = chFbm(nx + w * qx + 1.7, ny + w * qy + 9.2, 3, P);
            const ry = chFbm(nx + w * qx + 8.3, ny + w * qy + 2.8, 3, P);
            const v = chFbm(nx + w * rx, ny + w * ry, 4, P);
            const i = y * N + x;
            rxA[i] = rx;
            ridgeA[i] = Math.pow(1 - Math.abs(v * 2 - 1), 1.7);
        }
    }
    return { rx: rxA, ridge: ridgeA, size: N };
}
