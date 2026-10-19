// Solo Piano entry point.

import { Renderer } from './render/renderer.js';
import { animBaseColorForMidi } from './render/colors.js';
import { initAudio } from './audio/index.js';
import { initInput } from './input/index.js';
import { initUI } from './ui/index.js';
import { setInputReady } from './core/performance.js';
import { settings } from './state/settings.js';
import { showToast } from './ui/toast.js';

function boot(): void {
    const app = document.getElementById('app');
    if (!app) return;
    let renderer: Renderer;
    try {
        renderer = new Renderer(app);
    } catch (err) {
        showToast('This browser does not support WebGL 2, which the piano needs to draw.', { type: 'error' });
        throw err;
    }
    // Key colour under Follow Falling Notes: the colour a note has as it lands.
    renderer.keyColorFor = keyMidi => {
        const s = settings.get();
        if (!s.keyColorFollowFallingNotes) return null;
        return animBaseColorForMidi({ s, stageHeight: renderer.geometry.stageHeight }, keyMidi, renderer.geometry.stageHeight);
    };

    initUI();
    initInput();
    void initAudio();
    document.body.classList.add('solo-mode');
    setInputReady(true);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
