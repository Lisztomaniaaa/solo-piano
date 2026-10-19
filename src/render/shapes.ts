// Instanced 2D shape renderer: rounded/chamfered rects with solid or
// multi-stop gradient fills, borders, and CSS-style gaussian box-shadows
// (outer and inset). Everything the old DOM keyboard and the 2D note canvas
// drew is expressed as these primitives.

import { compileProgram, InstanceBuffer, uniforms, type RGBA } from './gl.js';

export const enum ShapeKind {
    Fill = 0,
    Border = 1,
    Shadow = 2,
    InsetShadow = 3,
}

export const enum GradDir {
    Vertical = 0,   // top -> bottom
    Horizontal = 1, // left -> right
}

const STRIDE = 40;

const VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 a_corner;
layout(location=1) in vec4 a_rect;
layout(location=2) in vec4 a_radii;
layout(location=3) in vec4 a_cut;
layout(location=4) in vec4 a_inset;
layout(location=5) in vec4 a_c0;
layout(location=6) in vec4 a_c1;
layout(location=7) in vec4 a_c2;
layout(location=8) in vec4 a_c3;
layout(location=9) in vec4 a_stops;
layout(location=10) in vec4 a_params;
uniform vec2 u_viewport;
uniform vec2 u_offset;
out vec2 v_pos;
flat out vec4 v_rect;
flat out vec4 v_radii;
flat out vec4 v_cut;
flat out vec4 v_inset;
flat out vec4 v_c0;
flat out vec4 v_c1;
flat out vec4 v_c2;
flat out vec4 v_c3;
flat out vec4 v_stops;
flat out vec4 v_params;
void main(){
    float kind = a_params.x;
    float sigma = a_params.z;
    float pad = 1.5;
    if (kind == 2.0) pad += sigma * 3.0;
    vec2 lo = a_rect.xy - pad;
    vec2 hi = a_rect.xy + a_rect.zw + pad;
    vec2 p = mix(lo, hi, a_corner);
    v_pos = p;
    v_rect = a_rect; v_radii = a_radii; v_cut = a_cut; v_inset = a_inset;
    v_c0 = a_c0; v_c1 = a_c1; v_c2 = a_c2; v_c3 = a_c3; v_stops = a_stops; v_params = a_params;
    vec2 clip = ((p + u_offset) / u_viewport) * 2.0 - 1.0;
    gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}`;

const FS = `#version 300 es
precision highp float;
in vec2 v_pos;
flat in vec4 v_rect;
flat in vec4 v_radii;
flat in vec4 v_cut;
flat in vec4 v_inset;
flat in vec4 v_c0;
flat in vec4 v_c1;
flat in vec4 v_c2;
flat in vec4 v_c3;
flat in vec4 v_stops;
flat in vec4 v_params;
uniform sampler2D u_gradTex;
uniform float u_gradRows;
uniform float u_pxScale;
out vec4 outColor;

// Signed distance to a rect with per-corner radii (tl, tr, br, bl). Negative inside.
float sdRoundRect(vec2 p, vec4 rect, vec4 r){
    vec2 c = rect.xy + rect.zw * 0.5;
    vec2 h = rect.zw * 0.5;
    vec2 q = p - c;
    float rad = q.x < 0.0 ? (q.y < 0.0 ? r.x : r.w) : (q.y < 0.0 ? r.y : r.z);
    rad = min(rad, min(h.x, h.y));
    vec2 d = abs(q) - h + rad;
    return min(max(d.x, d.y), 0.0) + length(max(d, 0.0)) - rad;
}

// Distance (positive = outside) to the top chamfer half-planes.
float sdCuts(vec2 p, vec4 rect, vec4 cut){
    float d = -1e5;
    if (cut.x > 0.0 && cut.y > 0.0) {
        vec2 a = rect.xy + vec2(cut.x, 0.0);
        vec2 b = rect.xy + vec2(0.0, cut.y);
        vec2 n = normalize(vec2(-(b.y - a.y), b.x - a.x)); // points away from the body
        if (dot(n, rect.xy + rect.zw * 0.5 - a) > 0.0) n = -n;
        d = max(d, dot(p - a, n));
    }
    if (cut.z > 0.0 && cut.w > 0.0) {
        vec2 a = vec2(rect.x + rect.z - cut.z, rect.y);
        vec2 b = vec2(rect.x + rect.z, rect.y + cut.w);
        vec2 n = normalize(vec2(-(b.y - a.y), b.x - a.x));
        if (dot(n, rect.xy + rect.zw * 0.5 - a) > 0.0) n = -n;
        d = max(d, dot(p - a, n));
    }
    return d;
}

float shapeDist(vec2 p, vec4 rect, vec4 radii, vec4 cut){
    return max(sdRoundRect(p, rect, radii), sdCuts(p, rect, cut));
}

float coverage(float d){
    // d in CSS px; antialias over one device pixel.
    float aa = 0.5 / u_pxScale;
    return clamp(0.5 - d / (2.0 * aa), 0.0, 1.0);
}

// Gaussian-blurred rounded box (Evan Wallace's approximation).
vec4 erf4(vec4 x){
    vec4 s = sign(x), a = abs(x);
    x = 1.0 + (0.278393 + (0.230389 + 0.078108 * (a * a)) * a) * a;
    x *= x;
    return s - s / (x * x);
}
float gaussian(float x, float sigma){
    return exp(-(x * x) / (2.0 * sigma * sigma)) / (2.5066283 * sigma);
}
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

vec4 gradientColor(vec2 p){
    float n = v_params.w;
    float t = v_params.y < 0.5 ? (p.y - v_rect.y) / max(v_rect.w, 1e-3) : (p.x - v_rect.x) / max(v_rect.z, 1e-3);
    t = clamp(t, 0.0, 1.0);
    if (n >= 100.0) {
        float row = n - 100.0;
        // Gradient rows are tinted by colour 0 (alpha carries group opacity).
        return texture(u_gradTex, vec2(t * (255.0 / 256.0) + 0.5 / 256.0, (row + 0.5) / u_gradRows)) * v_c0;
    }
    if (n < 1.5) return v_c0;
    vec4 c = v_c0;
    if (t <= v_stops.x) return v_c0;
    c = mix(v_c0, v_c1, clamp((t - v_stops.x) / max(v_stops.y - v_stops.x, 1e-5), 0.0, 1.0));
    if (n < 2.5 || t <= v_stops.y) return c;
    c = mix(v_c1, v_c2, clamp((t - v_stops.y) / max(v_stops.z - v_stops.y, 1e-5), 0.0, 1.0));
    if (n < 3.5 || t <= v_stops.z) return c;
    return mix(v_c2, v_c3, clamp((t - v_stops.z) / max(v_stops.w - v_stops.z, 1e-5), 0.0, 1.0));
}

void main(){
    float kind = v_params.x;
    vec4 color;
    float a;
    if (kind < 0.5) {
        a = coverage(shapeDist(v_pos, v_rect, v_radii, v_cut));
        color = gradientColor(v_pos);
    } else if (kind < 1.5) {
        float outer = shapeDist(v_pos, v_rect, v_radii, v_cut);
        vec4 inner = vec4(v_rect.xy + v_inset.xy, v_rect.zw - v_inset.xy - v_inset.zw);
        vec4 ir = max(v_radii - vec4(max(v_inset.x, v_inset.y), max(v_inset.z, v_inset.y), max(v_inset.z, v_inset.w), max(v_inset.x, v_inset.w)), 0.0);
        float innerD = sdRoundRect(v_pos, inner, ir);
        a = coverage(outer) * (1.0 - coverage(innerD));
        color = gradientColor(v_pos);
    } else if (kind < 2.5) {
        float sigma = max(v_params.z, 0.01);
        if (v_params.z < 0.05) a = coverage(sdRoundRect(v_pos, v_rect, v_radii));
        else a = roundedBoxShadow(v_rect.xy, v_rect.xy + v_rect.zw, v_pos, sigma, max(max(v_radii.x, v_radii.y), max(v_radii.z, v_radii.w)));
        color = v_c0;
    } else {
        // Inset shadow: inside the shape, darkened where the offset hole doesn't reach.
        float inside = coverage(shapeDist(v_pos, v_rect, v_radii, v_cut));
        vec4 hole = vec4(v_rect.xy + v_inset.xy, v_rect.zw);
        float sigma = v_params.z;
        float holeCov;
        if (sigma < 0.05) holeCov = coverage(sdRoundRect(v_pos, hole, v_radii));
        else holeCov = roundedBoxShadow(hole.xy, hole.xy + hole.zw, v_pos, sigma, max(max(v_radii.x, v_radii.y), max(v_radii.z, v_radii.w)));
        a = inside * (1.0 - holeCov);
        color = v_c0;
    }
    float alpha = color.a * a;
    outColor = vec4(color.rgb * alpha, alpha);
}`;

export interface ShapeSpec {
    x: number; y: number; w: number; h: number;
    radii?: [number, number, number, number];
    cut?: [number, number, number, number];
    inset?: [number, number, number, number];
    colors: RGBA[];
    stops?: number[];
    dir?: GradDir;
    kind?: ShapeKind;
    sigma?: number;
    gradRow?: number;
}

const ZERO4: [number, number, number, number] = [0, 0, 0, 0];

export class ShapeRenderer {
    private prog: WebGLProgram;
    private vao: WebGLVertexArrayObject;
    private inst: InstanceBuffer;
    private u: Record<'u_viewport' | 'u_offset' | 'u_gradTex' | 'u_gradRows' | 'u_pxScale', WebGLUniformLocation | null>;
    readonly gradients: GradientAtlas;

    constructor(private gl: WebGL2RenderingContext) {
        this.prog = compileProgram(gl, VS, FS);
        this.u = uniforms(gl, this.prog, ['u_viewport', 'u_offset', 'u_gradTex', 'u_gradRows', 'u_pxScale'] as const);
        this.inst = new InstanceBuffer(gl, STRIDE, 512);
        this.gradients = new GradientAtlas(gl);

        this.vao = gl.createVertexArray()!;
        gl.bindVertexArray(this.vao);
        const corner = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, corner);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.inst.buffer);
        gl.bufferData(gl.ARRAY_BUFFER, this.inst.data.byteLength, gl.DYNAMIC_DRAW);
        this.bindInstanceAttribs();
        gl.bindVertexArray(null);
    }

    private bindInstanceAttribs(): void {
        const gl = this.gl;
        for (let i = 0; i < 10; i++) {
            const loc = i + 1;
            gl.enableVertexAttribArray(loc);
            gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, STRIDE * 4, i * 16);
            gl.vertexAttribDivisor(loc, 1);
        }
    }

    get count(): number {
        return this.inst.count;
    }

    add(s: ShapeSpec): void {
        if (s.w <= 0 || s.h <= 0) return;
        const o = this.inst.alloc();
        const d = this.inst.data;
        d[o] = s.x; d[o + 1] = s.y; d[o + 2] = s.w; d[o + 3] = s.h;
        const r = s.radii ?? ZERO4;
        d[o + 4] = r[0]; d[o + 5] = r[1]; d[o + 6] = r[2]; d[o + 7] = r[3];
        const c = s.cut ?? ZERO4;
        d[o + 8] = c[0]; d[o + 9] = c[1]; d[o + 10] = c[2]; d[o + 11] = c[3];
        const ins = s.inset ?? ZERO4;
        d[o + 12] = ins[0]; d[o + 13] = ins[1]; d[o + 14] = ins[2]; d[o + 15] = ins[3];
        const n = Math.min(4, s.colors.length);
        for (let i = 0; i < 4; i++) {
            const col = s.colors[Math.min(i, n - 1)]!;
            d[o + 16 + i * 4] = col[0]; d[o + 17 + i * 4] = col[1]; d[o + 18 + i * 4] = col[2]; d[o + 19 + i * 4] = col[3];
        }
        const st = s.stops;
        d[o + 32] = st?.[0] ?? 0; d[o + 33] = st?.[1] ?? 1; d[o + 34] = st?.[2] ?? 1; d[o + 35] = st?.[3] ?? 1;
        d[o + 36] = s.kind ?? ShapeKind.Fill;
        d[o + 37] = s.dir ?? GradDir.Vertical;
        d[o + 38] = s.sigma ?? 0;
        d[o + 39] = s.gradRow !== undefined ? 100 + s.gradRow : n;
    }

    /** Draws everything queued since the last flush, then clears the queue. */
    flush(viewW: number, viewH: number, pxScale: number, offsetX = 0, offsetY = 0): void {
        if (this.inst.count === 0) return;
        const gl = this.gl;
        gl.useProgram(this.prog);
        gl.bindVertexArray(this.vao);
        this.inst.upload();
        // The buffer may have been reallocated; rebind the pointers to it.
        gl.bindBuffer(gl.ARRAY_BUFFER, this.inst.buffer);
        this.bindInstanceAttribs();
        gl.uniform2f(this.u.u_viewport, viewW, viewH);
        gl.uniform2f(this.u.u_offset, offsetX, offsetY);
        gl.uniform1f(this.u.u_pxScale, pxScale);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.gradients.texture);
        gl.uniform1i(this.u.u_gradTex, 0);
        gl.uniform1f(this.u.u_gradRows, this.gradients.rows);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.inst.count);
        gl.bindVertexArray(null);
        this.inst.reset();
    }
}

/** CSS gradient stops baked into rows of a 256-wide texture (for >4 stops). */
export class GradientAtlas {
    readonly rows = 64;
    readonly texture: WebGLTexture;
    private next = 0;
    private byKey = new Map<string, number>();
    private keyOfRow: (string | undefined)[] = [];
    /** Bumped whenever a row is reused for different stops. */
    generation = 0;
    private pixels = new Uint8Array(256 * 64 * 4);

    constructor(private gl: WebGL2RenderingContext) {
        this.texture = gl.createTexture()!;
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, this.rows, 0, gl.RGBA, gl.UNSIGNED_BYTE, this.pixels);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }

    /** Returns the row for a list of [colour, position 0..1] stops (CSS semantics). */
    row(stops: [RGBA, number][]): number {
        const key = JSON.stringify(stops);
        const hit = this.byKey.get(key);
        if (hit !== undefined) return hit;
        const row = this.next++ % this.rows;
        const stale = this.keyOfRow[row];
        if (stale !== undefined) {
            // The row is being reused: forget the stops it held.
            this.byKey.delete(stale);
            this.generation++;
        }
        this.keyOfRow[row] = key;
        const px = this.pixels;
        for (let i = 0; i < 256; i++) {
            const t = i / 255;
            let c = stops[0]![0];
            if (t >= stops[stops.length - 1]![1]) c = stops[stops.length - 1]![0];
            else {
                for (let s = 0; s < stops.length - 1; s++) {
                    const [ca, pa] = stops[s]!;
                    const [cb, pb] = stops[s + 1]!;
                    if (t >= pa && t <= pb) {
                        const k = pb > pa ? (t - pa) / (pb - pa) : 1;
                        // Interpolate in premultiplied space like CSS does.
                        const aa = ca[3] + (cb[3] - ca[3]) * k;
                        const mixp = (x: number, y: number) => (x * ca[3] * (1 - k) + y * cb[3] * k) / (aa || 1);
                        c = [mixp(ca[0], cb[0]), mixp(ca[1], cb[1]), mixp(ca[2], cb[2]), aa];
                        break;
                    }
                }
            }
            const o = (row * 256 + i) * 4;
            px[o] = Math.round(c[0] * 255); px[o + 1] = Math.round(c[1] * 255);
            px[o + 2] = Math.round(c[2] * 255); px[o + 3] = Math.round(c[3] * 255);
        }
        const gl = this.gl;
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, row, 256, 1, gl.RGBA, gl.UNSIGNED_BYTE, px, row * 256 * 4);
        this.byKey.set(key, row);
        return row;
    }
}
