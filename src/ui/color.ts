// Colour helpers and the HSV colour pad widget used by every colour picker in
// the Visual / Tools panels.

export const NO_COLOR = '__none';
// Legacy swatch palette (kept for reference by anything that still offers
// fixed swatches; the panels themselves use colour pads).
export const colors: readonly string[] = [NO_COLOR, '#ffffff', '#00e5ff', '#38bdf8', '#2979ff', '#651fff', '#8b5cf6', '#ff4081', '#ff2d75', '#ff1744', '#ff6d00', '#f7b733', '#ffea00', '#b2ff59', '#00e676'];

export type ColorIntent = 'user' | 'reset' | null;

export function normalizeHexColor(hex: unknown): string | null {
    if (!hex) return null;
    let h = String(hex).trim();
    if (!h.startsWith('#')) return null;
    h = h.slice(1);
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
    return '#' + h.toLowerCase();
}

/**
 * Readable ink for a key label sitting on the pressed-key colour: whichever of
 * near-black / near-white wins on WCAG contrast against the colour.
 */
export function keyInkFor(hex: string): string {
    const c = normalizeHexColor(hex);
    if (!c) return 'rgba(10,14,20,0.94)';
    const n = parseInt(c.slice(1), 16);
    const lin = (v: number): number => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
    const vsLightInk = 1.05 / (L + 0.05);
    const vsDarkInk = (L + 0.05) / 0.05;
    return vsDarkInk >= vsLightInk ? 'rgba(10,14,20,0.94)' : 'rgba(255,255,255,0.97)';
}

// ── Colour pad math ─────────────────────────────────────────────────────────
type Rgb = [number, number, number];

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}
function toHex2(value: number): string {
    return Math.round(clamp(value, 0, 255)).toString(16).padStart(2, '0');
}
function hexToRgb(hex: string): Rgb {
    return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}
function rgbToHex(rgb: Rgb): string {
    return `#${toHex2(rgb[0])}${toHex2(rgb[1])}${toHex2(rgb[2])}`;
}
function hslToRgb(hue: number, saturation: number, lightness: number): Rgb {
    const c = (1 - Math.abs(2 * lightness - 1)) * saturation;
    const x = c * (1 - Math.abs((hue / 60) % 2 - 1));
    const m = lightness - c / 2;
    let r = 0, g = 0, b = 0;
    if (hue < 60) { r = c; g = x; }
    else if (hue < 120) { r = x; g = c; }
    else if (hue < 180) { g = c; b = x; }
    else if (hue < 240) { g = x; b = c; }
    else if (hue < 300) { r = x; b = c; }
    else { r = c; b = x; }
    return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}
function hsvToRgb(hue: number, sat: number, val: number): Rgb {
    hue = ((hue % 360) + 360) % 360;
    sat = clamp(sat, 0, 1);
    val = clamp(val, 0, 1);
    const c = val * sat;
    const x = c * (1 - Math.abs((hue / 60) % 2 - 1));
    const m = val - c;
    let r = 0, g = 0, b = 0;
    if (hue < 60) { r = c; g = x; }
    else if (hue < 120) { r = x; g = c; }
    else if (hue < 180) { g = c; b = x; }
    else if (hue < 240) { g = x; b = c; }
    else if (hue < 300) { r = x; b = c; }
    else { r = c; b = x; }
    return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}
function rgbToHsv(rgb: Rgb): { h: number; s: number; v: number } {
    const r = rgb[0] / 255, g = rgb[1] / 255, b = rgb[2] / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const diff = max - min;
    let hue = 0;
    if (diff !== 0) {
        if (max === r) hue = ((g - b) / diff) % 6;
        else if (max === g) hue = (b - r) / diff + 2;
        else hue = (r - g) / diff + 4;
        hue *= 60;
        if (hue < 0) hue += 360;
    }
    return { h: hue, s: max === 0 ? 0 : diff / max, v: max };
}

// ── Colour pad widget ───────────────────────────────────────────────────────
export type ColorPadHandler = (color: string, intent: 'user' | 'reset') => void;

interface ColorPad {
    hue: number;
    sat: number;
    val: number;
    color: string;
    applyHsv(h: number, s: number, v: number, emit: boolean): void;
}

const pads = new Map<string, ColorPad>();

/** Moves a pad to `color` without calling its handler. */
export function updateColorPadValue(id: string, color: string | null | undefined): void {
    const pad = pads.get(id);
    if (!pad) return;
    const hsv = rgbToHsv(hexToRgb(normalizeHexColor(color) || '#ffffff'));
    pad.applyHsv(hsv.h, hsv.s, hsv.v, false);
}

/**
 * Mounts a saturation/value square + hue bar + Reset button into #id. User
 * drags/keys call `handler(color, 'user')`; Reset calls `handler(reset, 'reset')`.
 */
export function mountColorPad(id: string, label: string, initialColor: string | null | undefined, handler: ColorPadHandler, resetColor: string): void {
    const host = document.getElementById(id);
    if (!host) return;
    const resetValue = normalizeHexColor(resetColor) || '#ffffff';
    const startColor = normalizeHexColor(initialColor) || resetValue;
    host.classList.add('color-pad-host');
    host.innerHTML = `
        <div class="color-pad-widget">
            <div class="color-pad-head"><span>${label}</span><span class="color-pad-value"></span></div>
            <div class="color-pad-sv" role="slider" aria-label="${label}" tabindex="0"><div class="color-pad-dot"></div></div>
            <div class="color-pad-hue" role="slider" aria-label="${label} hue" tabindex="0"><div class="color-pad-hue-dot"></div></div>
            <div class="color-pad-actions"><span class="color-pad-chip"></span><button class="color-pad-reset" type="button">Reset</button></div>
        </div>`;
    const sv = host.querySelector<HTMLElement>('.color-pad-sv')!;
    const dot = host.querySelector<HTMLElement>('.color-pad-dot')!;
    const hueBar = host.querySelector<HTMLElement>('.color-pad-hue')!;
    const hueDot = host.querySelector<HTMLElement>('.color-pad-hue-dot')!;
    const value = host.querySelector<HTMLElement>('.color-pad-value')!;
    const reset = host.querySelector<HTMLElement>('.color-pad-reset')!;

    const syncUI = (emit: boolean): void => {
        const color = rgbToHex(hsvToRgb(pad.hue, pad.sat, pad.val));
        pad.color = color;
        host.style.setProperty('--pad-color', color);
        dot.style.left = `${pad.sat * 100}%`;
        dot.style.top = `${(1 - pad.val) * 100}%`;
        hueDot.style.left = `${(pad.hue / 360) * 100}%`;
        const hueHex = rgbToHex(hslToRgb(pad.hue, 1, 0.5));
        sv.style.background =
            'linear-gradient(to bottom, rgba(0,0,0,0) 0%, #000 100%),' +
            `linear-gradient(to right, #fff 0%, ${hueHex} 100%)`;
        value.textContent = color;
        if (emit) handler(color, 'user');
    };
    const pad: ColorPad = {
        hue: 0, sat: 0, val: 1, color: startColor,
        applyHsv(h, s, v, emit) {
            pad.hue = ((h % 360) + 360) % 360;
            pad.sat = clamp(s, 0, 1);
            pad.val = clamp(v, 0, 1);
            syncUI(emit);
        },
    };
    pads.set(id, pad);

    // Pointer drag with window-level listeners so a finger leaving the pad is
    // still tracked; always preventDefault so it never turns into a scroll.
    const makeDragger = (target: HTMLElement, applyFromXY: (x: number, y: number) => void): void => {
        let pid = -1;
        const onMove = (event: PointerEvent): void => {
            if (event.pointerId !== pid) return;
            event.preventDefault();
            applyFromXY(event.clientX, event.clientY);
        };
        const onUp = (event: PointerEvent): void => {
            if (event.pointerId !== pid) return;
            try { target.releasePointerCapture(pid); } catch { /* ignore */ }
            pid = -1;
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp, true);
            window.removeEventListener('pointercancel', onUp, true);
        };
        target.addEventListener('pointerdown', (event: PointerEvent) => {
            if (event.button !== undefined && event.button !== 0) return;
            pid = event.pointerId;
            try { target.setPointerCapture(pid); } catch { /* ignore */ }
            event.preventDefault();
            applyFromXY(event.clientX, event.clientY);
            window.addEventListener('pointermove', onMove, { passive: false });
            window.addEventListener('pointerup', onUp, true);
            window.addEventListener('pointercancel', onUp, true);
        });
    };
    makeDragger(sv, (cx, cy) => {
        const rect = sv.getBoundingClientRect();
        pad.sat = clamp((cx - rect.left) / rect.width, 0, 1);
        pad.val = 1 - clamp((cy - rect.top) / rect.height, 0, 1);
        syncUI(true);
    });
    makeDragger(hueBar, cx => {
        const rect = hueBar.getBoundingClientRect();
        pad.hue = clamp((cx - rect.left) / rect.width, 0, 1) * 360;
        syncUI(true);
    });
    sv.addEventListener('keydown', event => {
        const step = event.shiftKey ? 0.08 : 0.03;
        let s = pad.sat;
        let v = pad.val;
        if (event.key === 'ArrowLeft') s -= step;
        else if (event.key === 'ArrowRight') s += step;
        else if (event.key === 'ArrowUp') v += step;
        else if (event.key === 'ArrowDown') v -= step;
        else if (event.key === 'Home') { s = 0; v = 1; }
        else if (event.key === 'End') { s = 1; v = 0; }
        else return;
        event.preventDefault();
        pad.sat = clamp(s, 0, 1);
        pad.val = clamp(v, 0, 1);
        syncUI(true);
    });
    hueBar.addEventListener('keydown', event => {
        const step = event.shiftKey ? 18 : 6;
        let h = pad.hue;
        if (event.key === 'ArrowLeft') h -= step;
        else if (event.key === 'ArrowRight') h += step;
        else return;
        event.preventDefault();
        pad.hue = ((h % 360) + 360) % 360;
        syncUI(true);
    });
    reset.addEventListener('click', () => {
        updateColorPadValue(id, resetValue);
        handler(resetValue, 'reset');
    });
    updateColorPadValue(id, startColor);
}
