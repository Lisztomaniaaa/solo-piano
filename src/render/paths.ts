// Per-vertex-coloured triangles for hand-built paths: Sketch's wobbled
// outlines and 8-bit's stair-stepped blocks.

import { compileProgram, uniforms } from './gl.js';

const VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 a_pos;
layout(location=1) in vec4 a_color; // premultiplied
uniform vec2 u_viewport;
out vec4 v_color;
void main(){
    v_color = a_color;
    vec2 clip = (a_pos / u_viewport) * 2.0 - 1.0;
    gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}`;
const FS = `#version 300 es
precision highp float;
in vec4 v_color;
out vec4 outColor;
void main(){ outColor = v_color; }`;

export type ColorAt = (x: number, y: number) => [number, number, number, number]; // straight rgba 0..1

export class PathRenderer {
    private prog: WebGLProgram;
    private vao: WebGLVertexArrayObject;
    private buf: WebGLBuffer;
    private data = new Float32Array(6 * 4096);
    private n = 0; // vertices
    private u: Record<'u_viewport', WebGLUniformLocation | null>;

    constructor(private gl: WebGL2RenderingContext) {
        this.prog = compileProgram(gl, VS, FS);
        this.u = uniforms(gl, this.prog, ['u_viewport'] as const);
        this.vao = gl.createVertexArray()!;
        this.buf = gl.createBuffer()!;
        gl.bindVertexArray(this.vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 24, 0);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 24, 8);
        gl.bindVertexArray(null);
    }

    private vert(x: number, y: number, c: [number, number, number, number], alpha: number): void {
        if ((this.n + 1) * 6 > this.data.length) {
            const next = new Float32Array(this.data.length * 2);
            next.set(this.data);
            this.data = next;
        }
        const o = this.n++ * 6;
        const a = c[3] * alpha;
        const d = this.data;
        d[o] = x; d[o + 1] = y; d[o + 2] = c[0] * a; d[o + 3] = c[1] * a; d[o + 4] = c[2] * a; d[o + 5] = a;
    }

    tri(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, color: ColorAt, alpha = 1): void {
        this.vert(ax, ay, color(ax, ay), alpha);
        this.vert(bx, by, color(bx, by), alpha);
        this.vert(cx, cy, color(cx, cy), alpha);
    }

    rect(x: number, y: number, w: number, h: number, color: ColorAt, alpha = 1): void {
        if (w <= 0 || h <= 0) return;
        this.tri(x, y, x + w, y, x, y + h, color, alpha);
        this.tri(x + w, y, x + w, y + h, x, y + h, color, alpha);
    }

    /** Fills a simple polygon that is star-shaped around its centroid (fan). */
    fillFan(pts: number[], color: ColorAt, alpha = 1): void {
        const n = pts.length / 2;
        if (n < 3) return;
        let cx = 0, cy = 0;
        for (let i = 0; i < n; i++) { cx += pts[i * 2]!; cy += pts[i * 2 + 1]!; }
        cx /= n; cy /= n;
        for (let i = 0; i < n; i++) {
            const j = (i + 1) % n;
            this.tri(cx, cy, pts[i * 2]!, pts[i * 2 + 1]!, pts[j * 2]!, pts[j * 2 + 1]!, color, alpha);
        }
    }

    /** Strokes a closed polyline with mitered joins (miter limit 10, like Canvas). */
    strokeClosed(pts: number[], width: number, color: ColorAt, alpha = 1): void {
        const n = pts.length / 2;
        if (n < 2) return;
        const hw = width / 2;
        const outer: number[] = [], inner: number[] = [];
        for (let i = 0; i < n; i++) {
            const px = pts[((i - 1 + n) % n) * 2]!, py = pts[((i - 1 + n) % n) * 2 + 1]!;
            const x = pts[i * 2]!, y = pts[i * 2 + 1]!;
            const nx = pts[((i + 1) % n) * 2]!, ny = pts[((i + 1) % n) * 2 + 1]!;
            let d0x = x - px, d0y = y - py, d1x = nx - x, d1y = ny - y;
            const l0 = Math.hypot(d0x, d0y) || 1, l1 = Math.hypot(d1x, d1y) || 1;
            d0x /= l0; d0y /= l0; d1x /= l1; d1y /= l1;
            const n0x = -d0y, n0y = d0x, n1x = -d1y, n1y = d1x;
            let mx = n0x + n1x, my = n0y + n1y;
            const ml = Math.hypot(mx, my);
            let scale: number;
            if (ml < 1e-6) { mx = n1x; my = n1y; scale = hw; }
            else {
                mx /= ml; my /= ml;
                const cos = mx * n1x + my * n1y;
                scale = hw / Math.max(cos, 0.1);
            }
            outer.push(x + mx * scale, y + my * scale);
            inner.push(x - mx * scale, y - my * scale);
        }
        for (let i = 0; i < n; i++) {
            const j = (i + 1) % n;
            const ax = outer[i * 2]!, ay = outer[i * 2 + 1]!, bx = outer[j * 2]!, by = outer[j * 2 + 1]!;
            const cx = inner[i * 2]!, cy = inner[i * 2 + 1]!, dx = inner[j * 2]!, dy = inner[j * 2 + 1]!;
            this.tri(ax, ay, bx, by, cx, cy, color, alpha);
            this.tri(bx, by, dx, dy, cx, cy, color, alpha);
        }
    }

    get count(): number {
        return this.n;
    }

    flush(viewW: number, viewH: number): void {
        if (this.n === 0) return;
        const gl = this.gl;
        gl.useProgram(this.prog);
        gl.bindVertexArray(this.vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
        gl.bufferData(gl.ARRAY_BUFFER, this.data.subarray(0, this.n * 6), gl.DYNAMIC_DRAW);
        gl.uniform2f(this.u.u_viewport, viewW, viewH);
        gl.drawArrays(gl.TRIANGLES, 0, this.n);
        gl.bindVertexArray(null);
        this.n = 0;
    }
}
