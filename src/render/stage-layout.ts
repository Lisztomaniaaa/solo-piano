// Stage/keyboard placement. The DOM still lays out `.stage` and `#pianoWrap`
// (their backgrounds and the custom background layers stay CSS); this module
// mirrors the CSS rules that size them so the renderer and hit-testing agree
// with what's on screen without reading layout every frame.
//
//   #pianoWrap: bottom-anchored, height = --piano-height, margin-bottom = --piano-lift
//   .stage:     top 0 .. bottom: calc(--piano-height + --piano-lift)

import { KeyboardLayout } from '../core/geometry.js';
import type { Settings } from '../state/settings.js';

export interface StageGeometry {
    width: number;          // CSS px of #app
    height: number;
    stageHeight: number;    // falling-notes area, top = 0
    wrapTop: number;        // #pianoWrap border-box top
    wrapHeight: number;     // --piano-height
    keyboardTop: number;    // top of the keys (below the wrap's top border)
    keyboardHeight: number;
    liftPx: number;
}

/** Max piano height: half the visual viewport (getPianoMaxHeightPx). */
export function pianoMaxHeightPx(): number {
    const vv = window.visualViewport;
    const vh = Math.max(1, Math.round(vv ? vv.height : window.innerHeight));
    return Math.max(1, Math.floor(vh * 0.5));
}

export function pianoHeightPxFor(percent: number): number {
    const pct = Math.max(0, Math.min(100, Number(percent) || 0));
    return Math.round(pianoMaxHeightPx() * pct / 100);
}

/** Theme-specific top border on #pianoWrap (Sketch 2px, 8-bit 3px). */
export function wrapTopBorder(theme: Settings['pianoTheme']): number {
    return theme === 'sketch' ? 2 : theme === '8bit' ? 3 : 0;
}

export function computeStageGeometry(s: Readonly<Settings>, appW: number, appH: number): StageGeometry {
    const wrapHeight = pianoHeightPxFor(s.pianoHeight);
    // --piano-lift is in vh, i.e. of the layout viewport height.
    const liftPx = (Math.max(0, Math.min(30, s.pianoLiftPercent)) / 100) * window.innerHeight;
    const wrapTop = appH - liftPx - wrapHeight;
    const border = wrapTopBorder(s.pianoTheme);
    return {
        width: appW,
        height: appH,
        stageHeight: Math.max(1, Math.floor(wrapTop)),
        wrapTop,
        wrapHeight,
        keyboardTop: wrapTop + border,
        keyboardHeight: Math.max(0, wrapHeight - border),
        liftPx,
    };
}

export function buildKeyboardLayout(s: Readonly<Settings>, geo: StageGeometry, viewOffset: number): KeyboardLayout {
    return new KeyboardLayout({
        viewportWidth: geo.width,
        keyboardHeight: geo.keyboardHeight,
        visibleWhiteCount: s.wCount,
        viewOffset,
        blackWidthPercent: Math.max(70, Math.min(130, s.blackKeyWidthPercent)),
        blackHeightPercent: s.blackKeyHeightPercent,
    });
}
