// Mouse / touch on the keyboard (press, glissando, multi-touch) and the
// #swipeStrip pan with momentum and snap. The keyboard is drawn on a canvas;
// #pianoWrap is a transparent box over it that receives the pointer events and
// hit-testing goes through `view`.

import { pressKey, releaseKey, isInputReady } from '../core/performance.js';
import { view } from '../core/view.js';
import { runtime } from '../state/runtime.js';

/** pointerId -> key it is holding. */
const pointerNoteMap = new Map<number, number>();

// ── Keyboard pointers ────────────────────────────────────────────────────

function hitTestPiano(clientX: number, clientY: number): number | null {
    return view.clientToKey(clientX, clientY);
}

let pianoWrap: HTMLElement | null = null;

function onPianoPointerDown(e: PointerEvent): void {
    e.preventDefault();
    if (!isInputReady()) return;
    const midi = hitTestPiano(e.clientX, e.clientY);
    if (midi === null) return;
    pointerNoteMap.set(e.pointerId, midi);
    pressKey(midi);
    try { pianoWrap!.setPointerCapture(e.pointerId); } catch { /* ignore */ }
}

// Moves are coalesced to one hit-test per pointer per frame. Positions are
// stored in reused objects so a glissando allocates nothing per event.
interface PendingPos { x: number; y: number; set: boolean }
const glissandoPendingPointers = new Map<number, PendingPos>();
let glissandoRafScheduled = false;

function flushGlissandoPointerMoves(): void {
    glissandoRafScheduled = false;
    for (const [pid, pos] of glissandoPendingPointers) {
        if (!pos.set) continue;
        pos.set = false;
        const prevNote = pointerNoteMap.get(pid);
        if (prevNote === undefined) continue;
        const midi = hitTestPiano(pos.x, pos.y);
        if (midi === null) {
            releaseKey(prevNote);
            pointerNoteMap.delete(pid);
            continue;
        }
        if (midi !== prevNote) {
            // Swept past this note mid-drag (not a final release): fast
            // release so a glissando under sustain doesn't stack a full long
            // tail per note it slides across.
            releaseKey(prevNote, true);
            pointerNoteMap.set(pid, midi);
            pressKey(midi);
        }
    }
}

function onPianoPointerMove(e: PointerEvent): void {
    if (!pointerNoteMap.has(e.pointerId)) return;
    e.preventDefault();
    let pos = glissandoPendingPointers.get(e.pointerId);
    if (!pos) {
        pos = { x: 0, y: 0, set: false };
        glissandoPendingPointers.set(e.pointerId, pos);
    }
    pos.x = e.clientX;
    pos.y = e.clientY;
    pos.set = true;
    if (!glissandoRafScheduled) {
        glissandoRafScheduled = true;
        requestAnimationFrame(flushGlissandoPointerMoves);
    }
}

function pianoPointerEnd(e: PointerEvent): void {
    const note = pointerNoteMap.get(e.pointerId);
    if (note !== undefined) {
        releaseKey(note);
        pointerNoteMap.delete(e.pointerId);
    }
    glissandoPendingPointers.delete(e.pointerId);
}

// Fallback: if setPointerCapture failed, pointerup/cancel lands on window
// rather than #pianoWrap and the note would hang.
function windowPianoPointerEndFallback(e: PointerEvent): void {
    if (!pointerNoteMap.has(e.pointerId)) return;
    pianoPointerEnd(e);
}

export function releasePointerHolds(): void {
    if (pointerNoteMap.size) {
        const pending = [...pointerNoteMap.values()];
        pointerNoteMap.clear();
        for (const midi of pending) {
            try { releaseKey(midi); } catch { /* ignore */ }
        }
    }
    glissandoPendingPointers.clear();
}

// ── Swipe strip ──────────────────────────────────────────────────────────
// Drag in px; the committed scroll position `viewOffset` is in whole white
// keys. While dragging the keyboard follows the finger (runtime.viewOffset is
// fractional), then momentum and a 120ms snap settle on a whole key.

let swipeActive = false;
let swipeStartX = 0;
let swipeVelocity = 0;
let swipePrevX = 0;
let swipePrevTime = 0;
let swipeRafId = 0;
let swipeVisualOffset = 0;
let swipeSnapRafId = 0;
let viewOffset = 0;            // committed offset, white keys
let currentTransformPx = 0;

function whiteKeyWidth(): number {
    return view.layout.whiteWidth;
}

function getSwipeMaxOffset(): number {
    return view.layout.maxViewOffset;
}

function getViewOffsetPx(offset: number): number {
    return Math.max(0, offset || 0) * whiteKeyWidth();
}

function hasSwipeRange(): boolean {
    return whiteKeyWidth() > 0 && getSwipeMaxOffset() > 0.0001;
}

// Scroll position in px. Not clamped at 0: dragging past the left edge
// rubber-bands (negative px), as the CSS transform did.
function swipeSetTransform(px: number): void {
    if (!hasSwipeRange()) px = 0;
    currentTransformPx = px;
    const w = whiteKeyWidth();
    const units = w > 0 ? px / w : 0;
    runtime.set({ viewOffset: Math.min(getSwipeMaxOffset(), units) });
}

function swipeGetBase(): number {
    return hasSwipeRange() ? getViewOffsetPx(viewOffset) : 0;
}

function swipeClampOffset(offset: number): number {
    return Math.max(0, Math.min(getSwipeMaxOffset(), offset));
}

function swipeClampVisual(value: number): number {
    if (!hasSwipeRange()) return 0;
    const currentOffsetPx = getViewOffsetPx(viewOffset);
    const maxDragRight = currentOffsetPx;
    const maxDragLeft = getViewOffsetPx(getSwipeMaxOffset()) - currentOffsetPx;
    if (value > maxDragRight) return maxDragRight + (value - maxDragRight) * 0.25;
    if (value < -maxDragLeft) return -maxDragLeft;
    return value;
}

const easeOut = (t: number): number => 1 - Math.pow(1 - t, 3);
let snapFromPx = 0;
let snapToPx = 0;
let snapStart = 0;
function snapStep(now: number): void {
    const t = Math.min(1, (now - snapStart) / 120);
    swipeSetTransform(snapFromPx + (snapToPx - snapFromPx) * easeOut(t));
    if (t < 1) {
        swipeSnapRafId = requestAnimationFrame(snapStep);
    } else {
        swipeSnapRafId = 0;
        swipeSetTransform(snapToPx);
    }
}

function swipeSnapToNearest(): void {
    if (!hasSwipeRange()) {
        viewOffset = 0;
        swipeVisualOffset = 0;
        swipeVelocity = 0;
        swipeSetTransform(0);
        return;
    }
    const draggedWhiteKeys = -swipeVisualOffset / whiteKeyWidth();
    const targetOffset = swipeClampOffset(Math.round(viewOffset + draggedWhiteKeys));
    snapFromPx = currentTransformPx;
    snapToPx = getViewOffsetPx(targetOffset);
    viewOffset = targetOffset;
    swipeVisualOffset = 0;
    if (swipeSnapRafId) cancelAnimationFrame(swipeSnapRafId);
    snapStart = performance.now();
    swipeSnapRafId = requestAnimationFrame(snapStep);
}

function swipeMomentumScroll(): void {
    swipeRafId = 0;
    if (!hasSwipeRange()) { swipeVelocity = 0; swipeVisualOffset = 0; swipeSetTransform(0); return; }
    if (!swipeActive && Math.abs(swipeVelocity) > 0.5) {
        swipeVelocity *= 0.91;
        swipeVisualOffset = swipeClampVisual(swipeVisualOffset + swipeVelocity);
        swipeSetTransform(swipeGetBase() - swipeVisualOffset);
        if (Math.abs(swipeVelocity) < 0.9) {
            swipeVelocity = 0;
            swipeSnapToNearest();
            return;
        }
        swipeRafId = requestAnimationFrame(swipeMomentumScroll);
    }
}

function initSwipeStrip(strip: HTMLElement): void {
    strip.addEventListener('pointerdown', e => {
        e.preventDefault();
        e.stopPropagation();
        if (!hasSwipeRange()) {
            swipeActive = false;
            swipeVelocity = 0;
            swipeVisualOffset = 0;
            swipeSetTransform(0);
            return;
        }
        // Pick up scroll changes made elsewhere (key count, resize) unless a
        // momentum/snap of our own is mid-flight (its target is already committed).
        if (!swipeRafId && !swipeSnapRafId) {
            viewOffset = runtime.get().viewOffset;
            currentTransformPx = getViewOffsetPx(viewOffset);
        }
        strip.setPointerCapture(e.pointerId);
        swipeActive = true;
        swipeStartX = e.clientX;
        swipePrevX = e.clientX;
        swipePrevTime = performance.now();
        swipeVelocity = 0;
        swipeVisualOffset = 0;
        if (swipeRafId) { cancelAnimationFrame(swipeRafId); swipeRafId = 0; }
        if (swipeSnapRafId) { cancelAnimationFrame(swipeSnapRafId); swipeSnapRafId = 0; }
    }, { passive: false });

    strip.addEventListener('pointermove', e => {
        if (!swipeActive) return;
        e.preventDefault();
        e.stopPropagation();
        const now = performance.now();
        const dt = now - swipePrevTime;
        const dx = e.clientX - swipePrevX;
        if (dt > 0) swipeVelocity = dx * (16 / dt);
        swipePrevX = e.clientX;
        swipePrevTime = now;
        swipeVisualOffset = swipeClampVisual(e.clientX - swipeStartX);
        swipeSetTransform(swipeGetBase() - swipeVisualOffset);
    }, { passive: false });

    strip.addEventListener('pointerup', () => {
        if (!swipeActive) return;
        swipeActive = false;
        if (Math.abs(swipeVelocity) > 8) {
            swipeRafId = requestAnimationFrame(swipeMomentumScroll);
        } else {
            swipeSnapToNearest();
        }
    });

    strip.addEventListener('pointercancel', () => {
        if (!swipeActive) return;
        swipeActive = false;
        swipeVelocity = 0;
        swipeSnapToNearest();
    });
}

export function initPointer(): void {
    pianoWrap = document.getElementById('pianoWrap');
    if (pianoWrap) {
        pianoWrap.addEventListener('pointerdown', onPianoPointerDown, { passive: false });
        pianoWrap.addEventListener('pointermove', onPianoPointerMove, { passive: false });
        pianoWrap.addEventListener('pointerup', pianoPointerEnd, { passive: true });
        pianoWrap.addEventListener('pointercancel', pianoPointerEnd, { passive: true });
        // Capture can be lost without a pointerup (focus steal, OS gesture).
        pianoWrap.addEventListener('lostpointercapture', pianoPointerEnd, { passive: true });
    }
    window.addEventListener('pointerup', windowPianoPointerEndFallback, true);
    window.addEventListener('pointercancel', windowPianoPointerEndFallback, true);

    const strip = document.getElementById('swipeStrip');
    if (strip) initSwipeStrip(strip);
}
