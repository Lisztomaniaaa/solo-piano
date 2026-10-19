// Settings side effects of relayoutAfterOrientation: a genuine portrait <->
// landscape flip snaps Piano Position / Black Key Width / Piano Height back to
// that orientation's defaults. Ordinary resize noise (soft keyboard, pinch
// zoom, window resize) fires the same events without flipping, and must not
// discard a manual tweak. The layout pass itself is the renderer's.

import { isPortraitOrientation, defaultSettings } from '../state/settings.js';
import { update, setPianoLift, setBlackKeyWidthPercent, setPianoHeightPercent, defaultPianoLiftPercent, defaultPianoHeightPercent } from './actions.js';
import { isUiLayoutLocked } from './panels.js';

let lastWasPortrait = isPortraitOrientation();

function relayoutAfterOrientation(): void {
    if (isUiLayoutLocked()) return;
    const nowPortrait = isPortraitOrientation();
    if (nowPortrait === lastWasPortrait) return;
    lastWasPortrait = nowPortrait;
    update(d => {
        setPianoLift(d, defaultPianoLiftPercent());
        setBlackKeyWidthPercent(d, defaultSettings().blackKeyWidthPercent);
        setPianoHeightPercent(d, defaultPianoHeightPercent());
    });
}

export function initOrientation(): void {
    lastWasPortrait = isPortraitOrientation();
    window.addEventListener('orientationchange', () => {
        relayoutAfterOrientation();
        for (const delay of [120, 280, 500, 800]) setTimeout(relayoutAfterOrientation, delay);
    }, { passive: true });
    const vv = window.visualViewport;
    if (vv) {
        let raf = 0;
        vv.addEventListener('resize', () => {
            if (isUiLayoutLocked()) return;
            if (raf) cancelAnimationFrame(raf);
            raf = requestAnimationFrame(relayoutAfterOrientation);
        }, { passive: true });
    }
}
