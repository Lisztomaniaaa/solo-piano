// Owns the WebGL canvas and the frame loop. Everything visual on the stage
// and keyboard is drawn here in one pass per frame:
//
//   stage (scissored to the falling-notes area)
//     octave lines -> particles (V1, behind) -> falling notes ->
//     particles (V2, in front) + contact flares -> strike line
//   #pianoWrap's upward shadow
//   keyboard (scissored to the keys)
//     resting keys -> pressed overlay -> key light -> labels -> separators

import { view } from '../core/view.js';
import { heldKeys, performanceEvents } from '../core/performance.js';
import { WHITE_MIDIS, isBlackKey, whiteIndexOf } from '../core/geometry.js';
import { settings, type Settings } from '../state/settings.js';
import { runtime } from '../state/runtime.js';
import { ShapeKind, ShapeRenderer } from './shapes.js';
import { TextRenderer } from './text.js';
import { KeyboardRenderer, type PressedKey } from './keyboard.js';
import { buildKeyboardLayout, computeStageGeometry, type StageGeometry } from './stage-layout.js';
import { parseColor } from './gl.js';
import { NoteRenderer } from './note-shader.js';
import { PathRenderer } from './paths.js';
import { FallingNotes } from './notes.js';
import { AuraRenderer } from './aura-shader.js';
import { StrikeLineRenderer, gfxScale } from './strike-line.js';
import { Particles } from './particles.js';
import { SpriteAtlas } from './sprites.js';
import { CachedLayer } from './offscreen.js';

const DPR_CAP_DEFAULT = 2;

export class Renderer {
    readonly canvas: HTMLCanvasElement;
    readonly gl: WebGL2RenderingContext;
    private shapes!: ShapeRenderer;
    private text!: TextRenderer;
    private keyboard!: KeyboardRenderer;
    private sketchAtlas!: SpriteAtlas;
    private restingKeys!: CachedLayer;
    private strikeStatic!: CachedLayer;
    private noteShader!: NoteRenderer;
    private paths!: PathRenderer;
    private notes!: FallingNotes;
    private aura!: AuraRenderer;
    private strikeLine!: StrikeLineRenderer;
    private particles!: Particles;
    private contextLost = false;
    /** Bumped on every settings/layout change; part of the static layers' cache keys. */
    private version = 0;
    /** Perf governor scale (1 = full resolution). */
    govScale = 1;
    /** #strikeLineHit.on — set by the particle system while an emitter is held. */
    hitOn = false;
    private geo!: StageGeometry;
    private dpr = 1;
    private rafId = 0;
    private lastFrame = 0;
    private dirty = true;
    private lastPianoHeight = '';
    private lastPianoLift = '';
    private readonly pressed = new Map<number, PressedKey>();
    private readonly coarsePointer = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    private readonly reducedMotion = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
    /** Resolves the overlay colour for a press (Follow Falling Notes). */
    keyColorFor: (keyMidi: number) => string | null = () => null;

    constructor(container: HTMLElement) {
        this.canvas = document.createElement('canvas');
        this.canvas.id = 'glStage';
        container.appendChild(this.canvas);
        const gl = this.canvas.getContext('webgl2', {
            alpha: true,
            premultipliedAlpha: true,
            antialias: true,
            depth: false,
            stencil: false,
            preserveDrawingBuffer: false,
            powerPreference: 'high-performance',
        });
        if (!gl) throw new Error('WebGL2 is not available');
        this.gl = gl;
        this.createGlResources();
        // A GPU reset loses every GL object. Keep the context restorable and
        // rebuild from scratch when it comes back (notes in flight are dropped).
        this.canvas.addEventListener('webglcontextlost', e => {
            e.preventDefault();
            this.contextLost = true;
            if (this.rafId) cancelAnimationFrame(this.rafId);
            this.rafId = 0;
        });
        this.canvas.addEventListener('webglcontextrestored', () => {
            this.contextLost = false;
            this.createGlResources();
            this.updateLayout();
            this.invalidate();
        });

        this.watchFonts();
        this.resize();
        window.addEventListener('resize', () => this.resize(), { passive: true });
        window.visualViewport?.addEventListener('resize', () => this.resize(), { passive: true });
        settings.subscribe(null, () => {
            this.updateLayout();
            this.invalidate();
        });
        // syncFallingNoteVisualState: notes already in flight follow colour/material changes.
        settings.subscribe([
            'material', 'animColorMode', 'animColor', 'animColorSplit', 'animDoubleLeftColor', 'animDoubleRightColor',
            'animDoubleSplitTuts', 'animKeyShade', 'gradientColorCount', 'gradientColors', 'gradientIntensity',
            'gradientAxis', 'graphicQuality',
        ], s => this.notes.resync(s, this.geo.stageHeight, s.graphicQuality !== 'potato'));
        // Potato renders at 1x.
        settings.subscribe(['graphicQuality'], () => this.resize());
        runtime.subscribe(['viewOffset'], () => {
            this.updateLayout();
            this.invalidate();
        });
        performanceEvents.on('press', e => {
            if (e.keyMidi < 21 || e.keyMidi > 108) return;
            this.pressed.set(e.keyMidi, { color: this.keyColorFor(e.keyMidi) });
            const st = settings.get();
            if (st.isAnimOn) this.notes.add(e.keyMidi, st, this.geo.stageHeight, st.graphicQuality !== 'potato');
            this.particles.start(e.keyMidi, st, view.layout, this.particleBudget());
            this.invalidate();
        });
        performanceEvents.on('release', e => {
            this.pressed.delete(e.keyMidi);
            this.notes.release(e.keyMidi);
            this.particles.stop(e.keyMidi);
            this.invalidate();
        });
        // Stop All silences notes but keys stay lit until their own key-up.
        performanceEvents.on('stopAll', () => {
            this.notes.stopGrowing();
            this.particles.clear();
            this.invalidate();
        });
    }

    /**
     * Labels are baked into the text atlas, so a web font that arrives after
     * the first bake would leave fallback-font glyphs behind. Ask for the label
     * faces up front and re-bake whenever a font finishes loading.
     */
    private watchFonts(): void {
        const fonts = document.fonts;
        if (!fonts) return;
        const rebake = () => {
            this.text.clear();
            this.version++;
            this.invalidate();
        };
        fonts.addEventListener('loadingdone', rebake);
        const faces = ['700 12px Quicksand', '800 12px Quicksand', '900 12px Quicksand', "800 12px 'JetBrains Mono'"];
        void Promise.all(faces.map(f => fonts.load(f).catch(() => []))).then(rebake);
    }

    private createGlResources(): void {
        const gl = this.gl;
        this.shapes = new ShapeRenderer(gl);
        this.text = new TextRenderer(gl);
        this.text.setDpr(this.dpr);
        this.sketchAtlas = new SpriteAtlas(gl, '/images/sketch/keys-atlas.png', () => { this.version++; this.invalidate(); });
        this.restingKeys = new CachedLayer(gl);
        this.strikeStatic = new CachedLayer(gl);
        this.keyboard = new KeyboardRenderer(this.shapes, this.text, this.sketchAtlas);
        this.noteShader = new NoteRenderer(gl);
        this.paths = new PathRenderer(gl);
        this.notes = new FallingNotes(this.noteShader, this.paths);
        this.aura = new AuraRenderer(gl);
        this.strikeLine = new StrikeLineRenderer(this.shapes, this.aura);
        this.particles = new Particles(gl);
        this.text.beforeClear = () => this.text.flush(this.geo.width, this.geo.height);
        this.strikeLine.flushShapes = () => this.shapes.flush(this.geo.width, this.geo.height, this.dpr);
        this.strikeLine.flushAura = () => this.aura.flush(this.geo.width, this.geo.height, this.shapes.gradients.texture, this.shapes.gradients.rows);
    }

    private resize(): void {
        const native = Math.max(1, window.devicePixelRatio || 1);
        const cap = settings.get().graphicQuality === 'potato' ? 1 : Math.min(native, DPR_CAP_DEFAULT);
        // The governor trims resolution under sustained load, floored at 1x.
        this.dpr = Math.max(1, cap * (this.govScale > 0 ? this.govScale : 1));
        const w = Math.max(1, window.innerWidth);
        const h = Math.max(1, Math.round(window.visualViewport?.height ?? window.innerHeight));
        const app = document.getElementById('app');
        const rect = app?.getBoundingClientRect();
        const cw = Math.max(1, Math.round(rect?.width || w));
        const ch = Math.max(1, Math.round(rect?.height || h));
        this.canvas.style.width = cw + 'px';
        this.canvas.style.height = ch + 'px';
        this.canvas.width = Math.max(1, Math.round(cw * this.dpr));
        this.canvas.height = Math.max(1, Math.round(ch * this.dpr));
        this.text.setDpr(this.dpr);
        this.updateLayout();
        this.invalidate();
    }

    private updateLayout(): void {
        this.version++;
        const w = parseFloat(this.canvas.style.width) || 1;
        const h = parseFloat(this.canvas.style.height) || 1;
        const s = settings.get();
        this.geo = computeStageGeometry(s, w, h);
        // The DOM boxes (.stage / #pianoWrap backgrounds, #swipeStrip, toasts)
        // still size off these; with no key elements left under them, writing
        // them on :root is cheap.
        const ph = this.geo.wrapHeight + 'px', pl = this.geo.liftPx + 'px';
        if (ph !== this.lastPianoHeight || pl !== this.lastPianoLift) {
            this.lastPianoHeight = ph;
            this.lastPianoLift = pl;
            const root = document.documentElement.style;
            root.setProperty('--piano-height', ph);
            root.setProperty('--piano-lift', pl);
            root.setProperty('--gfx-scale', String(gfxScale()));
        }
        const layout = buildKeyboardLayout(s, this.geo, runtime.get().viewOffset);
        view.publish(layout, {
            stageLeft: 0,
            stageTop: 0,
            stageWidth: this.geo.width,
            stageHeight: this.geo.stageHeight,
            keyboardTop: this.geo.keyboardTop,
            keyboardHeight: this.geo.keyboardHeight,
        });
    }

    get geometry(): StageGeometry {
        return this.geo;
    }

    get pixelRatio(): number {
        return this.dpr;
    }

    invalidate(): void {
        this.dirty = true;
        if (this.contextLost) return;
        if (!this.rafId) this.rafId = requestAnimationFrame(t => this.frame(t));
    }

    private frame(now: number): void {
        this.rafId = 0;
        // Displays faster than ~166 Hz: skip the extra frames.
        if (this.lastFrame && now - this.lastFrame >= 0 && now - this.lastFrame < 6) {
            this.rafId = requestAnimationFrame(t => this.frame(t));
            return;
        }
        const rawMs = this.lastFrame ? now - this.lastFrame : 0;
        const dt = rawMs > 0 ? rawMs / 1000 : 1 / 60;
        this.lastFrame = now;
        if (rawMs > 0) this.governorTick(rawMs, now);
        this.dirty = false;
        this.draw(now, dt);
        if (this.dirty) this.rafId = requestAnimationFrame(t => this.frame(t));
        else this.lastFrame = 0;
    }

    // ── Perf governor (perfGovernorTick): sheds resolution under sustained
    // slow frames and recovers once frames are fast again. ──
    private emaMs = 1000 / 60;
    private govLastChange = 0;
    private slowStreak = 0;
    private fastStreak = 0;
    /** body.perf-lite: the governor is meaningfully under pressure. */
    get perfLite(): boolean {
        return this.govScale < 0.78;
    }
    private governorTick(frameMs: number, now: number): void {
        if (!(frameMs > 0) || frameMs > 240) return;
        const BUDGET = 20.5, HEADROOM = 13.6, COOLDOWN = 850, MIN = 0.6, MAX = 1.0;
        this.emaMs += (frameMs - this.emaMs) * 0.12;
        if (this.emaMs > BUDGET) { this.slowStreak++; this.fastStreak = 0; }
        else if (this.emaMs < HEADROOM) { this.fastStreak++; this.slowStreak = 0; }
        else { if (this.slowStreak) this.slowStreak--; if (this.fastStreak) this.fastStreak--; }
        if (now - this.govLastChange < COOLDOWN) return;
        let changed = false;
        if (this.slowStreak >= 3 && this.govScale > MIN) {
            const overrun = this.emaMs / BUDGET;
            const step = overrun >= 2.5 ? 0.40 : overrun >= 1.6 ? 0.26 : 0.16;
            this.govScale = Math.max(MIN, this.govScale - step);
            changed = true;
        } else if (this.fastStreak >= 10 && this.govScale < MAX) {
            this.govScale = Math.min(MAX, this.govScale + 0.14);
            changed = true;
        }
        if (changed) {
            this.govLastChange = now;
            this.slowStreak = this.fastStreak = 0;
            this.resize();
        }
    }

    private particleBudget() {
        return { stageWidth: this.geo.width, stageHeight: this.geo.stageHeight, dpr: this.dpr, areaMul: this.pixelBudgetScale(), govScale: this.govScale };
    }

    /** getCanvasPixelBudgetScale */
    private pixelBudgetScale(): number {
        const area = Math.max(1, this.geo.width * this.geo.stageHeight * this.dpr * this.dpr);
        return Math.max(0.28, Math.min(1, (390 * 844 * 4) / area));
    }

    private draw(now: number, dt: number): void {
        const gl = this.gl;
        const W = this.geo.width, H = this.geo.height;
        gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        gl.disable(gl.SCISSOR_TEST);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

        const g = this.geo;
        const s = settings.get();

        // ── Stage ────────────────────────────────────────────────────────
        this.scissor(0, 0, W, g.stageHeight);
        const potato = s.graphicQuality === 'potato';
        this.drawOctaveLines(s, g.stageHeight);
        this.shapes.flush(W, H, this.dpr);
        // Particles: V1 ('glow') behind the notes, V2 ('solid') in front.
        const dustLive = this.particles.update({ s, layout: view.layout, now, dt: Math.min(dt, 0.042), ...this.particleBudget() });
        const dustInFront = s.dustBlendMode === 'solid';
        if (!dustInFront) this.particles.render(W, H, this.canvas.width, this.canvas.height);
        const notesLive = this.notes.update({
            s, layout: view.layout, stageWidth: W, stageHeight: g.stageHeight, now, dt: Math.min(dt, 0.042),
            dpr: this.dpr, heavyFx: !potato,
            fallingCap: Math.max(24, Math.round((potato ? 260 : 1400) * this.pixelBudgetScale())),
            isHeld: m => heldKeys.has(m),
        });
        // Chrome's pattern drifts 2 px/s horizontally and 3 px/s vertically.
        const chromeSec = this.reducedMotion?.matches ? 0 : now / 1000;
        const span = 256 * 3.2;
        this.noteShader.flush(W, H, this.dpr, [(chromeSec * 2) % span, (chromeSec * 3) % span], s.material === 'chrome');
        this.paths.flush(W, H);
        if (dustInFront) this.particles.render(W, H, this.canvas.width, this.canvas.height);
        if (notesLive || dustLive) this.dirty = true;
        this.hitOn = this.particles.anyHeld;

        const slFrame = {
            s, width: W, stageHeight: g.stageHeight, nowMs: now, coarsePointer: this.coarsePointer,
            hitOn: this.hitOn, stageHeightForGradient: g.stageHeight, perfLite: this.perfLite,
        };
        const cw = this.canvas.width, ch = this.canvas.height;
        this.strikeLine.draw(slFrame, 'below');
        // The halo and bar only change with settings/layout: drawn once, then reused.
        this.strikeStatic.use(
            [this.version, this.dpr, this.perfLite ? 1 : 0].join('|'),
            cw, ch, () => this.strikeLine.draw(slFrame, 'static'),
        );
        this.strikeLine.draw(slFrame, 'above');
        if (this.strikeLine.isAnimating(s)) this.dirty = true;

        // #pianoWrap box-shadow: 0 -10px 28px rgba(0,0,0,.34) (cast up over the stage).
        if (s.pianoTheme === 'default') {
            this.shapes.add({ x: 0, y: g.wrapTop - 10, w: W, h: g.wrapHeight, kind: ShapeKind.Shadow, sigma: 14, colors: [parseColor('rgba(0,0,0,.34)')] });
        } else if (s.pianoTheme === '8bit') {
            // box-shadow: 0 -2px 0 #a97ff0
            this.shapes.add({ x: 0, y: g.wrapTop - 2, w: W, h: 2, colors: [parseColor('#a97ff0')] });
        }
        this.scissor(0, 0, W, g.wrapTop);
        this.shapes.flush(W, H, this.dpr);

        // Keyboard, clipped like #pianoWrap{overflow:hidden}.
        this.scissor(0, g.keyboardTop, W, g.keyboardHeight);
        const kbFrame = {
            settings: s,
            layout: view.layout,
            geo: g,
            pressed: this.pressed,
            dpr: this.dpr,
            coarsePointer: this.coarsePointer,
            perfLite: this.perfLite,
            flush: {
                shapes: () => this.shapes.flush(W, H, this.dpr),
                sprites: () => this.sketchAtlas.flush(W, H),
                text: () => this.text.flush(W, H),
            },
        };
        // Resting keys depend on which black keys are down (a pressed black key
        // drops its shadow and bevel); white presses only touch the overlay.
        let blackDown = '';
        for (const m of this.pressed.keys()) if (isBlackKey(m)) blackDown += m + ',';
        // #piano{opacity}: the cached layer is composited at Piano Visibility.
        const visibility = Math.max(0, Math.min(100, s.pianoVisibilityPercent)) / 100;
        this.restingKeys.use(
            [this.version, this.dpr, this.text.generation, this.sketchAtlas.ready ? 1 : 0, blackDown].join('|'),
            cw, ch, () => this.keyboard.drawResting(kbFrame), visibility,
        );
        this.keyboard.drawActive(kbFrame);
        gl.disable(gl.SCISSOR_TEST);
    }

    /** #octaveLinesLayer: a 1-device-px line at every C key's left edge. */
    private drawOctaveLines(s: Readonly<Settings>, stageH: number): void {
        if (!s.octaveLinesEnabled) return;
        const layout = view.layout;
        const lineW = Math.max(1, Math.round(this.dpr)) / this.dpr;
        const color = s.pianoTheme === '8bit' ? parseColor('#7a4fd6')
            : s.pianoTheme === 'sketch' ? parseColor('rgba(42,42,40,0.5)') : parseColor('rgba(255,255,255,0.16)');
        for (let midi = 24; midi <= 108; midi += 12) {
            const idx = whiteIndexOf(midi);
            if (idx === undefined) continue;
            const x = Math.round(layout.rect(WHITE_MIDIS[idx]!).x * this.dpr) / this.dpr;
            if (x < -1 || x > this.geo.width + 1) continue;
            if (s.pianoTheme === 'sketch') {
                // repeating-linear-gradient: 5px ink, 7px gap.
                for (let y = 0; y < stageH; y += 12) this.shapes.add({ x, y, w: lineW, h: Math.min(5, stageH - y), colors: [color] });
            } else {
                this.shapes.add({ x, y: 0, w: lineW, h: stageH, colors: [color] });
            }
        }
    }

    private scissor(x: number, y: number, w: number, h: number): void {
        const gl = this.gl;
        const d = this.dpr;
        const ch = this.canvas.height;
        const x0 = Math.max(0, Math.floor(x * d));
        const y0 = Math.max(0, Math.floor(y * d));
        const x1 = Math.min(this.canvas.width, Math.ceil((x + w) * d));
        const y1 = Math.min(ch, Math.ceil((y + h) * d));
        gl.enable(gl.SCISSOR_TEST);
        gl.scissor(x0, ch - y1, Math.max(0, x1 - x0), Math.max(0, y1 - y0));
    }
}
