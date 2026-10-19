// WebGL2 helpers shared by every layer.

export function compileProgram(gl: WebGL2RenderingContext, vsSrc: string, fsSrc: string): WebGLProgram {
    const compile = (type: number, src: string): WebGLShader => {
        const sh = gl.createShader(type)!;
        gl.shaderSource(sh, src);
        gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS) && !gl.isContextLost()) {
            const log = gl.getShaderInfoLog(sh);
            gl.deleteShader(sh);
            throw new Error('Shader compile failed: ' + log);
        }
        return sh;
    };
    const vs = compile(gl.VERTEX_SHADER, vsSrc);
    const fs = compile(gl.FRAGMENT_SHADER, fsSrc);
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS) && !gl.isContextLost()) {
        throw new Error('Program link failed: ' + gl.getProgramInfoLog(prog));
    }
    return prog;
}

export function uniforms<K extends string>(gl: WebGL2RenderingContext, prog: WebGLProgram, names: readonly K[]): Record<K, WebGLUniformLocation | null> {
    const out = {} as Record<K, WebGLUniformLocation | null>;
    for (const n of names) out[n] = gl.getUniformLocation(prog, n);
    return out;
}

/** Growable Float32 instance buffer. */
export class InstanceBuffer {
    data: Float32Array;
    count = 0;
    private glBuf: WebGLBuffer;
    private glCapacity = 0;

    constructor(private gl: WebGL2RenderingContext, readonly stride: number, initial = 256) {
        this.data = new Float32Array(stride * initial);
        this.glBuf = gl.createBuffer()!;
    }

    get buffer(): WebGLBuffer {
        return this.glBuf;
    }

    reset(): void {
        this.count = 0;
    }

    /** Returns the float offset of a new instance slot. */
    alloc(): number {
        if ((this.count + 1) * this.stride > this.data.length) {
            const next = new Float32Array(this.data.length * 2);
            next.set(this.data);
            this.data = next;
        }
        return this.count++ * this.stride;
    }

    upload(): void {
        const gl = this.gl;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.glBuf);
        const bytes = this.count * this.stride * 4;
        if (bytes > this.glCapacity) {
            this.glCapacity = this.data.byteLength;
            gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW);
        }
        if (bytes > 0) gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.data, 0, this.count * this.stride);
    }
}

/** Parses '#rgb', '#rrggbb', 'rgb()', 'rgba()' into 0..1 floats. */
export type RGBA = [number, number, number, number];

const colorCache = new Map<string, RGBA>();
export function parseColor(input: string): RGBA {
    const hit = colorCache.get(input);
    if (hit) return hit;
    let out: RGBA = [1, 1, 1, 1];
    const s = input.trim();
    if (s[0] === '#') {
        let h = s.slice(1);
        if (h.length === 3 || h.length === 4) h = h.split('').map(c => c + c).join('');
        const n = parseInt(h.slice(0, 6), 16);
        const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
        if (Number.isFinite(n)) out = [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, a];
    } else {
        const m = s.match(/rgba?\(([^)]+)\)/);
        if (m) {
            const parts = m[1]!.split(/[\s,/]+/).filter(Boolean).map(Number);
            out = [(parts[0] ?? 255) / 255, (parts[1] ?? 255) / 255, (parts[2] ?? 255) / 255, parts[3] ?? 1];
        } else if (s === 'transparent') {
            out = [0, 0, 0, 0];
        } else if (s === 'white') {
            out = [1, 1, 1, 1];
        } else if (s === 'black') {
            out = [0, 0, 0, 1];
        }
    }
    if (colorCache.size > 512) colorCache.clear();
    colorCache.set(input, out);
    return out;
}

export function rgba(r: number, g: number, b: number, a = 1): RGBA {
    return [r / 255, g / 255, b / 255, a];
}

/** CSS color-mix(in srgb, a p%, b) on 0..1 colours. */
export function mixColor(a: RGBA, b: RGBA, pA: number): RGBA {
    const pB = 1 - pA;
    return [a[0] * pA + b[0] * pB, a[1] * pA + b[1] * pB, a[2] * pA + b[2] * pB, a[3] * pA + b[3] * pB];
}

export function withAlpha(c: RGBA, a: number): RGBA {
    return [c[0], c[1], c[2], c[3] * a];
}
