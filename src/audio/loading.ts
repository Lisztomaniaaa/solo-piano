// Boot loading screen (#loadingScreen) driven by the default soundfont's
// real download progress.

import { runtime } from '../state/runtime.js';
import { audio } from './state.js';
import { DEFAULT_SF_KEY, SF_URLS, SOUNDFONT_LABELS, formatMB, loadSoundfontWithProgress } from './soundfonts.js';

let entryProgress = 0;

// `detail` (e.g. "8.0MB / 36.7MB · 90%") renders on its own reserved-height
// line below `label`, so the card never reflows as the digits change width.
// An empty detail hides it via visibility (the height stays reserved).
export function setPianoEntryLoading(progress: number, label?: string, detail?: string): void {
    const loadingScreen = document.getElementById('loadingScreen');
    const loadingLabel = document.querySelector('.ld-main-label');
    const loadingDetail = document.getElementById('ldDetail');
    const ldBar1 = document.getElementById('ldBar1');
    if (!loadingScreen) return;
    entryProgress = Math.max(entryProgress, Math.max(0, Math.min(100, Number(progress) || 0)));
    loadingScreen.style.display = 'flex';
    loadingScreen.classList.remove('fade-out');
    loadingScreen.setAttribute('aria-hidden', 'false');
    document.body.classList.add('mp-entering-piano');
    if (ldBar1) {
        ldBar1.classList.toggle('done', entryProgress >= 100);
        ldBar1.style.width = entryProgress + '%';
    }
    if (label && loadingLabel) loadingLabel.textContent = label;
    if (loadingDetail) {
        if (detail) { loadingDetail.textContent = detail; loadingDetail.classList.add('show'); }
        else loadingDetail.classList.remove('show');
    }
}

export function hidePianoEntryLoading(): void {
    const loadingScreen = document.getElementById('loadingScreen');
    if (!loadingScreen) return;
    loadingScreen.classList.add('fade-out');
    loadingScreen.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('mp-entering-piano');
    window.setTimeout(() => {
        if (!document.body.classList.contains('mp-entering-piano')) loadingScreen.style.display = 'none';
    }, 260);
}

function markStageReady(): void {
    audio.stageReady = true;
    runtime.set({ pianoReady: true, loadProgress: null });
}

let started = false;
export function startBackgroundSoundfont(): void {
    if (started) return;
    started = true;
    const defaultLabel = SOUNDFONT_LABELS[DEFAULT_SF_KEY] || 'Grand Piano';
    // playSfBuffer's stageReady gate stays false until the buffers finish
    // building, so mash-key input can't chip the audio graph mid-decode.
    setPianoEntryLoading(0, 'Loading ' + defaultLabel);
    try {
        loadSoundfontWithProgress(
            DEFAULT_SF_KEY,
            SF_URLS[DEFAULT_SF_KEY],
            (decoded, total) => {
                const pct = total > 0 ? Math.round((decoded / total) * 100) : 0;
                const decoding = total > 0 && decoded >= total;
                // The bar only moves forward and earlier stages parked it at
                // 88, so remap the download onto 88-100 — and show that same
                // remapped number, not the raw pct.
                const overallPct = 88 + Math.round(pct * 0.12);
                const label = decoding ? 'Decoding samples' : ('Loading ' + defaultLabel);
                const detail = decoding ? '' : (total > 0 ? formatMB(decoded) + ' / ' + formatMB(total) + '  ·  ' + overallPct + '%' : overallPct + '%');
                runtime.set({ loadProgress: pct / 100 });
                setPianoEntryLoading(overallPct, label, detail);
            },
            ok => {
                setPianoEntryLoading(100, ok ? 'Ready' : 'Sound unavailable — continuing silent', '');
                markStageReady();
                window.setTimeout(hidePianoEntryLoading, ok ? 220 : 1400);
            },
            'piano',
        );
    } catch {
        setPianoEntryLoading(100, 'Sound unavailable');
        markStageReady();
        window.setTimeout(hidePianoEntryLoading, 1400);
    }
}

// Boot visibility guards (the original forceBootVisible + load handler): the
// app fades in and the loading screen hides unless the soundfont loader is
// showing it (body.mp-entering-piano).
function forceBootVisible(): void {
    if (document.body.classList.contains('mp-entering-piano')) return;
    const loadingScreen = document.getElementById('loadingScreen');
    const app = document.getElementById('app');
    if (app) app.classList.add('fade-in');
    if (loadingScreen) {
        loadingScreen.classList.add('fade-out');
        loadingScreen.setAttribute('aria-hidden', 'true');
        window.setTimeout(() => { loadingScreen.style.display = 'none'; }, 120);
    }
}

function onWindowLoad(): void {
    const app = document.getElementById('app');
    const loadingScreen = document.getElementById('loadingScreen');
    if (app) app.classList.add('fade-in');
    if (loadingScreen && !document.body.classList.contains('mp-entering-piano')) {
        loadingScreen.classList.add('fade-out');
        loadingScreen.setAttribute('aria-hidden', 'true');
        loadingScreen.style.display = 'none';
    }
}

export function installBootGuards(): void {
    window.addEventListener('error', () => setTimeout(forceBootVisible, 0));
    window.addEventListener('unhandledrejection', () => setTimeout(forceBootVisible, 0));
    window.setTimeout(forceBootVisible, 5200);
    if (document.readyState === 'complete') onWindowLoad();
    else window.addEventListener('load', onWindowLoad);
}

export { forceBootVisible };
