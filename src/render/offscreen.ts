// Offscreen layers the size of the canvas: draw into one, then composite it
// over the canvas in one pass. LayerTarget gives CSS-style group opacity
// (#piano's Piano Visibility) and an isolated blend space (the additive
// particle layer); CachedLayer keeps its contents between frames so static
// art (resting keys, the strike line's halo) is only redrawn when it changes.

import { compileProgram, uniforms } from './gl.js';

const VS = `#version 300 es
layout(location=0) in vec2 a_corner;
out vec2 v_uv;
void main(){ v_uv = a_corner; gl_Position = vec4(a_corner * 2.0 - 1.0, 0.0, 1.0); }`;
const FS = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_tex;
uniform float u_alpha;
out vec4 outColor;
void main(){ outColor = texture(u_tex, v_uv) * u_alpha; }`;

export class LayerTarget {
    private fbo: WebGLFramebuffer | null = null;
    private tex: WebGLTexture | null = null;
    protected w = 0;
    protected h = 0;
    private prog: WebGLProgram;
    private vao: WebGLVertexArrayObject;
    private u: Record<'u_tex' | 'u_alpha', WebGLUniformLocation | null>;

    constructor(protected gl: WebGL2RenderingContext) {
        this.prog = compileProgram(gl, VS, FS);
        this.u = uniforms(gl, this.prog, ['u_tex', 'u_alpha'] as const);
        this.vao = gl.createVertexArray()!;
        gl.bindVertexArray(this.vao);
        const corner = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, corner);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.bindVertexArray(null);
    }

    /** Returns true when the backing texture had to be (re)allocated. */
    protected ensure(w: number, h: number): boolean {
        const gl = this.gl;
        if (this.fbo && this.w === w && this.h === h) return false;
        if (!this.tex) this.tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        if (!this.fbo) this.fbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.tex, 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        this.w = w;
        this.h = h;
        return true;
    }

    /** Redirects drawing into the layer and clears it (inside the current scissor). */
    begin(canvasW: number, canvasH: number): void {
        const gl = this.gl;
        this.ensure(canvasW, canvasH);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
        gl.viewport(0, 0, canvasW, canvasH);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
    }

    /** Stops drawing into the layer. */
    finish(canvasW: number, canvasH: number): void {
        const gl = this.gl;
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, canvasW, canvasH);
    }

    /** Composites the layer over the canvas (premultiplied) at `alpha`. */
    composite(alpha = 1): void {
        const gl = this.gl;
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.useProgram(this.prog);
        gl.bindVertexArray(this.vao);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.tex);
        gl.uniform1i(this.u.u_tex, 0);
        gl.uniform1f(this.u.u_alpha, alpha);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.bindVertexArray(null);
    }

    end(canvasW: number, canvasH: number, alpha = 1): void {
        this.finish(canvasW, canvasH);
        this.composite(alpha);
    }
}

/** A layer whose contents persist until invalidated. */
export class CachedLayer extends LayerTarget {
    private key = '';

    /**
     * Redraws the layer with `draw` when `key` changed (or the canvas was
     * resized), then composites it. `draw` must restore the default blend.
     */
    use(key: string, canvasW: number, canvasH: number, draw: () => void, alpha = 1): void {
        const resized = this.w !== canvasW || this.h !== canvasH;
        if (resized || key !== this.key) {
            this.begin(canvasW, canvasH);
            draw();
            this.finish(canvasW, canvasH);
            this.key = key;
        }
        this.composite(alpha);
    }

    invalidate(): void {
        this.key = '';
    }
}
