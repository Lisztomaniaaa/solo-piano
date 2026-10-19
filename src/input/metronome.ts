// Metronome (#metronomePanel and the Practice settings copy of its controls).
// State is mirrored into settings.metronome so presets save/restore it.

import { settings } from '../state/settings.js';
import { audioCtx } from '../audio/context.js';

export interface MetronomeState {
    bpm: number;
    beats: number;
    sound: string;
}

let metroBpm = 120;
let metroBeats = 4;
let metroSound = 'click';
let metroRunning = false;
let metroTimer = 0;
let metroCurBeat = 0;

let bpmNum: HTMLElement | null = null;
let bpmSlider: HTMLInputElement | null = null;
let startBtn: HTMLElement | null = null;
let settingsBpmNum: HTMLElement | null = null;
let settingsBpmSlider: HTMLInputElement | null = null;
let settingsStartBtn: HTMLElement | null = null;
let dotsEl: HTMLElement | null = null;
let metroBtn: HTMLElement | null = null;
let dots: HTMLElement[] = [];
let beatBtns: HTMLElement[] = [];
let soundBtns: HTMLElement[] = [];

function syncSettings(): void {
    const cur = settings.get().metronome;
    if (cur && cur.bpm === metroBpm && cur.beats === metroBeats && cur.sound === metroSound) return;
    settings.set({ metronome: { bpm: metroBpm, beats: metroBeats, sound: metroSound } });
}

function buildDots(): void {
    if (!dotsEl) return;
    dotsEl.innerHTML = '';
    dots = [];
    for (let i = 0; i < metroBeats; i++) {
        const d = document.createElement('div');
        d.className = 'metro-dot' + (i === 0 ? ' accent' : '');
        dotsEl.appendChild(d);
        dots.push(d);
    }
}

function updateBpm(v: number): void {
    metroBpm = Math.max(20, Math.min(300, v));
    if (bpmNum) bpmNum.textContent = String(metroBpm);
    if (bpmSlider) bpmSlider.value = String(metroBpm);
    if (settingsBpmNum) settingsBpmNum.textContent = String(metroBpm);
    if (settingsBpmSlider) settingsBpmSlider.value = String(metroBpm);
    if (metroRunning) { stopMetro(); startMetro(); }
    syncSettings();
}

function tickSound(): void {
    try {
        const ctx = audioCtx;
        if (ctx.state === 'suspended') void ctx.resume();
        const now = ctx.currentTime;
        const isAccent = metroCurBeat === 0;
        const master = ctx.createGain();
        master.gain.setValueAtTime(isAccent ? 0.42 : 0.28, now);
        master.gain.exponentialRampToValueAtTime(0.001, now + 0.055);
        master.connect(ctx.destination);

        if (metroSound === 'beep') {
            const osc = ctx.createOscillator();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(isAccent ? 1320 : 980, now);
            osc.connect(master);
            osc.start(now);
            osc.stop(now + 0.055);
            return;
        }

        if (metroSound === 'hihat') {
            const len = Math.floor(ctx.sampleRate * 0.035);
            const buf = ctx.createBuffer(1, len, ctx.sampleRate);
            const data = buf.getChannelData(0);
            for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.4);
            const src = ctx.createBufferSource();
            const hp = ctx.createBiquadFilter();
            hp.type = 'highpass';
            hp.frequency.setValueAtTime(isAccent ? 6200 : 7600, now);
            src.buffer = buf;
            src.connect(hp);
            hp.connect(master);
            src.start(now);
            return;
        }

        // 'click' and 'wood'
        const osc = ctx.createOscillator();
        const toneGain = ctx.createGain();
        const bp = ctx.createBiquadFilter();
        const isWood = metroSound === 'wood';
        osc.type = isWood ? 'square' : 'triangle';
        osc.frequency.setValueAtTime(isWood ? (isAccent ? 880 : 660) : (isAccent ? 1850 : 1450), now);
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(isWood ? (isAccent ? 980 : 760) : (isAccent ? 2100 : 1650), now);
        bp.Q.setValueAtTime(isWood ? 5 : 7, now);
        toneGain.gain.setValueAtTime(1, now);
        toneGain.gain.exponentialRampToValueAtTime(0.001, now + (isWood ? 0.042 : 0.032));
        osc.connect(bp);
        bp.connect(toneGain);
        toneGain.connect(master);
        osc.start(now);
        osc.stop(now + (isWood ? 0.045 : 0.035));
    } catch { /* ignore */ }
}

function flashDot(): void {
    const beatIndex = metroCurBeat;
    for (const d of dots) d.classList.remove('beat');
    const dot = dots[beatIndex];
    if (dot) {
        dot.classList.add('beat');
        setTimeout(() => dot.classList.remove('beat'), 80);
    }
}

function tick(): void {
    tickSound();
    flashDot();
    metroCurBeat = (metroCurBeat + 1) % metroBeats;
}

function scheduleNext(): void {
    if (!metroRunning) return;
    metroTimer = window.setTimeout(() => { tick(); scheduleNext(); }, 60000 / metroBpm);
}

function startMetro(): void {
    metroCurBeat = 0;
    metroRunning = true;
    tick();
    scheduleNext();
    if (startBtn) { startBtn.textContent = 'Stop'; startBtn.classList.add('running'); }
    if (settingsStartBtn) { settingsStartBtn.textContent = 'Stop'; settingsStartBtn.classList.add('running'); }
    metroBtn?.classList.add('active');
}

function stopMetro(): void {
    clearTimeout(metroTimer);
    metroTimer = 0;
    metroRunning = false;
    metroCurBeat = 0;
    for (const d of dots) d.classList.remove('beat');
    if (startBtn) { startBtn.textContent = 'Start'; startBtn.classList.remove('running'); }
    if (settingsStartBtn) { settingsStartBtn.textContent = 'Start'; settingsStartBtn.classList.remove('running'); }
    metroBtn?.classList.remove('active');
}

function toggleMetro(): void {
    if (metroRunning) stopMetro(); else startMetro();
}

function applyBeats(n: unknown): void {
    metroBeats = Math.max(1, Math.min(12, parseInt(String(n), 10) || 4));
    for (const b of beatBtns) b.classList.toggle('active', parseInt(b.dataset.beats ?? '', 10) === metroBeats);
    buildDots();
    metroCurBeat = 0;
}

function applySound(name: unknown): void {
    metroSound = (name as string) || 'click';
    for (const b of soundBtns) b.classList.toggle('active', b.dataset.sound === metroSound);
}

export function getMetronomeState(): MetronomeState {
    return { bpm: metroBpm, beats: metroBeats, sound: metroSound };
}

export function applyMetronomeState(st: Partial<MetronomeState> | null | undefined): void {
    if (!st || typeof st !== 'object') return;
    if (st.bpm !== undefined) updateBpm(parseInt(String(st.bpm), 10) || metroBpm);
    if (st.beats !== undefined) applyBeats(st.beats);
    if (st.sound !== undefined) applySound(st.sound);
    syncSettings();
}

export function initMetronome(): void {
    bpmNum = document.getElementById('metroBpmNum');
    bpmSlider = document.getElementById('metroBpmSlider') as HTMLInputElement | null;
    startBtn = document.getElementById('metroStartBtn');
    settingsBpmNum = document.getElementById('settingsMetroBpmNum');
    settingsBpmSlider = document.getElementById('settingsMetroBpmSlider') as HTMLInputElement | null;
    settingsStartBtn = document.getElementById('settingsMetroStartBtn');
    dotsEl = document.getElementById('metroDots');
    metroBtn = document.getElementById('metroBtn');
    beatBtns = Array.from(document.querySelectorAll<HTMLElement>('.metro-beat-btn'));
    soundBtns = Array.from(document.querySelectorAll<HTMLElement>('.metro-sound-btn'));

    if (startBtn) startBtn.onclick = toggleMetro;
    if (settingsStartBtn) settingsStartBtn.onclick = toggleMetro;

    document.querySelectorAll<HTMLElement>('.settings-metro-bpm').forEach(btn => {
        btn.onclick = () => updateBpm(metroBpm + parseInt(btn.dataset.delta ?? '', 10));
    });
    if (settingsBpmSlider) settingsBpmSlider.oninput = e => updateBpm(parseInt((e.target as HTMLInputElement).value, 10));
    const bind = (id: string, delta: number): void => {
        const el = document.getElementById(id);
        if (el) el.onclick = () => updateBpm(metroBpm + delta);
    };
    bind('metroBpmUp', 1);
    bind('metroBpmDown', -1);
    bind('metroBpmUp10', 10);
    bind('metroBpmDown10', -10);
    document.querySelectorAll<HTMLElement>('.metro-bpm-btn').forEach(btn => {
        btn.addEventListener('keydown', event => {
            if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
            event.preventDefault();
            updateBpm(metroBpm + (event.key === 'ArrowUp' ? 1 : -1));
        });
    });
    if (bpmSlider) bpmSlider.oninput = e => updateBpm(parseInt((e.target as HTMLInputElement).value, 10));

    for (const btn of beatBtns) {
        btn.onclick = () => {
            metroBeats = parseInt(btn.dataset.beats ?? '', 10);
            for (const b of beatBtns) b.classList.remove('active');
            btn.classList.add('active');
            buildDots();
            metroCurBeat = 0;
            syncSettings();
        };
    }
    for (const btn of soundBtns) {
        btn.onclick = () => {
            metroSound = btn.dataset.sound ?? '';
            for (const b of soundBtns) b.classList.remove('active');
            btn.classList.add('active');
            syncSettings();
        };
    }

    // A preset load writes settings.metronome; apply it when it differs.
    settings.subscribe(['metronome'], s => {
        const m = s.metronome;
        if (!m) return;
        if (m.bpm === metroBpm && m.beats === metroBeats && m.sound === metroSound) return;
        applyMetronomeState(m);
    });

    buildDots();
    if (settings.get().metronome) applyMetronomeState(settings.get().metronome);
}
