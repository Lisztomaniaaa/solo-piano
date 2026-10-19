// Where the stage and keyboard currently sit on screen. The renderer owns the
// layout and publishes it here; input code reads it for hit-testing and
// scrolling.

import { KeyboardLayout, WHITE_KEY_COUNT } from './geometry.js';
import { runtime } from '../state/runtime.js';

export interface ViewRects {
    /** Stage (falling-notes area) in client CSS px. strikeY is its bottom edge. */
    stageLeft: number;
    stageTop: number;
    stageWidth: number;
    stageHeight: number;
    /** Keyboard top edge in client CSS px. */
    keyboardTop: number;
    keyboardHeight: number;
}

type LayoutListener = (layout: KeyboardLayout, rects: ViewRects) => void;

let currentLayout: KeyboardLayout = new KeyboardLayout({
    viewportWidth: 1,
    keyboardHeight: 1,
    visibleWhiteCount: WHITE_KEY_COUNT,
    viewOffset: 0,
    blackWidthPercent: 100,
    blackHeightPercent: 60,
});
let currentRects: ViewRects = {
    stageLeft: 0, stageTop: 0, stageWidth: 1, stageHeight: 1, keyboardTop: 1, keyboardHeight: 1,
};
const listeners = new Set<LayoutListener>();

export const view = {
    get layout(): KeyboardLayout {
        return currentLayout;
    },
    get rects(): Readonly<ViewRects> {
        return currentRects;
    },

    /** Called by the renderer whenever geometry changes. */
    publish(layout: KeyboardLayout, rects: ViewRects): void {
        currentLayout = layout;
        currentRects = rects;
        for (const fn of listeners) fn(layout, rects);
    },

    onChange(fn: LayoutListener): () => void {
        listeners.add(fn);
        return () => listeners.delete(fn);
    },

    /** Key under a client-space point, or null. */
    clientToKey(clientX: number, clientY: number): number | null {
        const r = currentRects;
        return currentLayout.hitTest(clientX - r.stageLeft, clientY - r.keyboardTop);
    },

    /** True when the point is on the keyboard itself. */
    isOnKeyboard(clientX: number, clientY: number): boolean {
        const r = currentRects;
        return clientY >= r.keyboardTop && clientY <= r.keyboardTop + r.keyboardHeight
            && clientX >= r.stageLeft && clientX <= r.stageLeft + r.stageWidth;
    },

    /** Scrolls the keyboard; `offset` is in white-key units and is clamped. */
    setViewOffset(offset: number): void {
        const max = currentLayout.maxViewOffset;
        runtime.set({ viewOffset: Math.max(0, Math.min(max, offset)) });
    },
};
