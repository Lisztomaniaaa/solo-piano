// Textured quads from an image atlas (the Sketch theme's pencil key art).

import { compileProgram, InstanceBuffer, uniforms } from './gl.js';

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
void main(){ outColor = texture(u_tex, v_uv) * v_alpha; }`;

const STRIDE = 9;

export class SpriteAtlas {
    private tex: WebGLTexture;
    private prog: WebGLProgram;
    private vao: WebGLVertexArrayObject;
    private inst: InstanceBuffer;
    private u: Record<'u_viewport' | 'u_tex', WebGLUniformLocation | null>;
    width = 1;
    height = 1;
    ready = false;

    constructor(private gl: WebGL2RenderingContext, url: string, onReady: () => void) {
        this.tex = gl.createTexture()!;
        this.prog = compileProgram(gl, VS, FS);
        this.u = uniforms(gl, this.prog, ['u_viewport', 'u_tex'] as const);
        this.inst = new InstanceBuffer(gl, STRIDE, 64);
        this.vao = gl.createVertexArray()!;
        gl.bindVertexArray(this.vao);
        const corner = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, corner);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.bindVertexArray(null);
        const img = new Image();
        img.onload = () => {
            gl.bindTexture(gl.TEXTURE_2D, this.tex);
            gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
            gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
            gl.generateMipmap(gl.TEXTURE_2D);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            this.width = img.naturalWidth;
            this.height = img.naturalHeight;
            this.ready = true;
            onReady();
        };
        img.src = url;
    }

    /** Draws the atlas region (sx, sy, sw, sh in atlas px) stretched over a rect. */
    draw(x: number, y: number, w: number, h: number, sx: number, sy: number, sw: number, sh: number, alpha = 1): void {
        if (!this.ready) return;
        const o = this.inst.alloc();
        const d = this.inst.data;
        d[o] = x; d[o + 1] = y; d[o + 2] = w; d[o + 3] = h;
        d[o + 4] = sx / this.width; d[o + 5] = sy / this.height;
        d[o + 6] = (sx + sw) / this.width; d[o + 7] = (sy + sh) / this.height;
        d[o + 8] = alpha;
    }

    flush(viewW: number, viewH: number): void {
        if (this.inst.count === 0) return;
        const gl = this.gl;
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
