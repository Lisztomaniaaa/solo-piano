// Performance Monitor: an FPS readout in #perfHud, measured with its own rAF
// loop and refreshed every ~700ms. Driven by settings.perfHudEnabled.

import { settings } from '../state/settings.js';
import { update } from './actions.js';
import { byId, onClick, setActive, watch } from './dom.js';

let enabled = false;
let fps = 0;
let frames = 0;
let lastTs = performance.now();
let rafId = 0;
let fpsEl: HTMLElement | null = null;

function updateHudText(): void {
    if (fpsEl) fpsEl.textContent = `${Math.round(fps || 0)} FPS`;
}

function loop(ts: number): void {
    if (!enabled) { rafId = 0; return; }
    frames++;
    const elapsed = ts - lastTs;
    if (elapsed >= 700) {
        fps = frames * 1000 / elapsed;
        frames = 0;
        lastTs = ts;
        updateHudText();
    }
    rafId = requestAnimationFrame(loop);
}

export function initPerfHud(): void {
    const hud = byId('perfHud');
    fpsEl = hud ? hud.querySelector<HTMLElement>('.perf-fps') : null;
    const track = byId('perfTrack');
    onClick('perfTrack', () => update(d => { d.perfHudEnabled = !settings.get().perfHudEnabled; }));
    watch(['perfHudEnabled'], s => {
        enabled = s.perfHudEnabled;
        setActive(track, enabled);
        if (hud) hud.classList.toggle('show', enabled);
        if (enabled) {
            frames = 0;
            lastTs = performance.now();
            updateHudText();
            if (!rafId) rafId = requestAnimationFrame(loop);
        }
    });
    window.addEventListener('online', updateHudText);
    window.addEventListener('offline', updateHudText);
}
