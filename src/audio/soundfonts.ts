// Soundfont catalog, loading, the picker in #sfPanel, the #sfLoadingOverlay,
// the string-layer toggle and the Custom SF2 test bench.

import { audioCtx, IS_MOBILE_AUDIO, resumeIfSuspended } from './context.js';
import { audio, persist } from './state.js';
import {
    type Layer, cacheSoundfontBuffers, clearLayer, countBufferMap, getLayerBuffers, getLoadedKey,
    releaseStringVoices, setLayerBuffers, soundfontBufferCache, useCachedSoundfont,
} from './engine.js';
import { buildBufferMap, fetchCached, listPresets, type PresetInfo, type ProgressFn, type SfBufferMap } from './sf2.js';
import { updateSfEffectUI, updateStringRangeUI } from './controls.js';
import { stopAllNotes } from '../core/performance.js';

// Slot IDs map to soundfonts/pack/*.sf2 (see SOUNDFONTS.md). Labels drive the
// picker and the "Current" chip. Custom SF2 presets register themselves here
// under synthetic "usersf2:BANK:PROGRAM" keys.
export const SOUNDFONT_LABELS: Record<string, string> = {
    grandPiano: 'Grand Piano',
    sal1: 'Concert Grand',
    atmosGrand: 'Atmos Grand',
    pfBright: 'Bright Grand',
    pfSoft: 'Soft Piano',
    pfEPiano: 'E-Piano',
    strViolin: 'Violin',
    strCello: 'Cello',
    strEnsemble: 'Strings',
    strSlow: 'Slow Strings',
    strPizz: 'Pizzicato',
    orcHorn: 'French Horns',
    orcTrumpet: 'Trumpet',
    orcTrombone: 'Trombone',
    orcFlute: 'Flute',
    orcTimpani: 'Timpani',
    othNylon: 'Nylon Guitar',
    othSteel: 'Steel Guitar',
    othBass: 'Fingered Bass',
    othVibraphone: 'Vibraphone',
    othMarimba: 'Marimba',
    othChoir: 'Choir Aahs',
    othOrgan: 'Church Organ',
};

export const SF2_BASE = '/soundfonts/pack/';
export const SF_URLS: Record<string, string> = {
    grandPiano: SF2_BASE + 'grandPiano.sf2',
    sal1: SF2_BASE + 'salamander.sf2',
    atmosGrand: SF2_BASE + 'atmosGrand.sf2',
    pfBright: SF2_BASE + 'pfBright.sf2',
    pfSoft: SF2_BASE + 'pfSoft.sf2',
    pfEPiano: SF2_BASE + 'pfEPiano.sf2',
    strViolin: SF2_BASE + 'strViolin.sf2',
    strCello: SF2_BASE + 'strCello.sf2',
    strEnsemble: SF2_BASE + 'strEnsemble.sf2',
    strSlow: SF2_BASE + 'strSlow.sf2',
    strPizz: SF2_BASE + 'strPizz.sf2',
    orcHorn: SF2_BASE + 'orcHorn.sf2',
    orcTrumpet: SF2_BASE + 'orcTrumpet.sf2',
    orcTrombone: SF2_BASE + 'orcTrombone.sf2',
    orcFlute: SF2_BASE + 'orcFlute.sf2',
    orcTimpani: SF2_BASE + 'orcTimpani.sf2',
    othNylon: SF2_BASE + 'othNylon.sf2',
    othSteel: SF2_BASE + 'othSteel.sf2',
    othBass: SF2_BASE + 'othBass.sf2',
    othVibraphone: SF2_BASE + 'othVibraphone.sf2',
    othMarimba: SF2_BASE + 'othMarimba.sf2',
    othChoir: SF2_BASE + 'othChoir.sf2',
    othOrgan: SF2_BASE + 'othOrgan.sf2',
};

export const DEFAULT_SF_KEY = 'grandPiano';

export function getSoundfontName(sfKey: string): string {
    return SOUNDFONT_LABELS[sfKey] || 'SoundFont';
}

/** Formats a byte count as e.g. "12.3MB". */
export function formatMB(bytes: number): string {
    return (bytes / (1024 * 1024)).toFixed(1) + 'MB';
}

// ---- Picker UI ----
let mainCurrentEl: HTMLElement | null = null;
let layerCurrentEl: HTMLElement | null = null;

function syncOptionButtons(layer: Layer, activeKey: string): void {
    document.querySelectorAll<HTMLElement>(`.sf-option[data-layer="${layer}"]`)
        .forEach(btn => btn.classList.toggle('active', btn.dataset.sfKey === activeKey));
}

export function updateSoundfontPickerUI(): void {
    if (mainCurrentEl) mainCurrentEl.textContent = getSoundfontName(audio.currentSf);
    if (layerCurrentEl) layerCurrentEl.textContent = getSoundfontName(audio.currentStringSf);
    syncOptionButtons('piano', audio.currentSf);
    syncOptionButtons('string', audio.currentStringSf);
}

// ---- Loading ----
const soundfontLoadSeq: Record<Layer, number> = { piano: 0, string: 0 };
const SF2_LOAD_TIMEOUT_MS = 60000;

interface CustomSf2State {
    arrayBuffer: ArrayBuffer;
    filename: string;
    presets: PresetInfo[];
}
let customSf2: CustomSf2State | null = null;

// Each slot is a self-contained single-preset .sf2 in soundfonts/pack/,
// parsed in the browser; fetchCached persists the raw bytes in IndexedDB.
function loadLocalSf2(url: string, onProgress: ProgressFn | null, signal?: AbortSignal): Promise<SfBufferMap | null> {
    return fetchCached(url, onProgress, signal).then(arrayBuffer => {
        resumeIfSuspended();
        const res = buildBufferMap(arrayBuffer, audioCtx, { mono: IS_MOBILE_AUDIO });
        return res && res.map ? res.map : null;
    });
}

export function loadSoundfont(sfKey: string, url: string, callback: ((ok: boolean) => void) | null, layer: Layer = 'piano'): void {
    loadSoundfontWithProgress(sfKey, url, null, ok => { if (callback) callback(ok); }, layer);
}

export function loadSoundfontWithProgress(
    sfKey: string,
    url: string,
    onProgress: ProgressFn | null,
    onDone: ((ok: boolean) => void) | null,
    layer: Layer = 'piano',
    signal?: AbortSignal,
): void {
    const isReady = () => getLoadedKey(layer) === sfKey && countBufferMap(getLayerBuffers(layer)) > 0;
    if (isReady()) { if (onDone) onDone(true); return; }
    if (useCachedSoundfont(sfKey, layer)) {
        const total = countBufferMap(getLayerBuffers(layer));
        if (onProgress) onProgress(total, total);
        if (onDone) onDone(total > 0);
        return;
    }

    const seq = ++soundfontLoadSeq[layer];
    let settled = false;
    let timeoutId = 0;
    const done = (ok: boolean) => {
        if (settled || seq !== soundfontLoadSeq[layer]) return;
        settled = true;
        clearTimeout(timeoutId);
        if (onDone) onDone(!!ok && isReady());
    };
    if (signal) {
        if (signal.aborted) { done(false); return; }
        signal.addEventListener('abort', () => done(false), { once: true });
    }

    if (typeof url === 'string' && url.indexOf('usersf2:') === 0) {
        // Custom SF2 preset: "usersf2:BANK:PROGRAM"; the raw bytes are kept
        // from the file the user opened. The parse is CPU-bound, so it runs
        // on a later task to keep the UI responsive.
        const state = customSf2;
        const parts = url.split(':');
        const bank = parts.length >= 3 ? parseInt(parts[1], 10) : NaN;
        const program = parts.length >= 3 ? parseInt(parts[2], 10) : NaN;
        if (!state || !state.arrayBuffer || !Number.isFinite(bank) || !Number.isFinite(program)) {
            done(false);
            return;
        }
        if (onProgress) onProgress(1, 100);
        timeoutId = window.setTimeout(() => done(false), 45000);
        window.setTimeout(() => {
            if (settled || seq !== soundfontLoadSeq[layer]) return;
            try {
                resumeIfSuspended();
                const res = buildBufferMap(state.arrayBuffer, audioCtx, { bank, program, mono: IS_MOBILE_AUDIO });
                if (res && res.map) {
                    cacheSoundfontBuffers(sfKey, res.map);
                    setLayerBuffers(layer, res.map, sfKey);
                    if (onProgress) onProgress(100, 100);
                    done(true);
                } else {
                    done(false);
                }
            } catch {
                done(false);
            }
        }, 40);
        return;
    }

    if (typeof url === 'string' && /\.sf2($|\?)/i.test(url)) {
        timeoutId = window.setTimeout(() => done(false), SF2_LOAD_TIMEOUT_MS);
        loadLocalSf2(url, onProgress, signal).then(map => {
            if (settled || seq !== soundfontLoadSeq[layer]) return;
            if (map) {
                cacheSoundfontBuffers(sfKey, map);
                setLayerBuffers(layer, map, sfKey);
            }
            done(!!map);
        }).catch(() => done(false));
        return;
    }

    // Every catalog entry is an .sf2 or a usersf2: key, so nothing else loads.
    done(false);
}

// ---- #sfLoadingOverlay ----
// The AbortController of whichever overlay load is in flight, so Cancel
// always cancels the most recent one.
let sfLoadAbortController: AbortController | null = null;
let overlayEl: HTMLElement | null = null;
let overlayNameEl: HTMLElement | null = null;
let sfBarEl: HTMLElement | null = null;
let sfPctEl: HTMLElement | null = null;
let sfBytesEl: HTMLElement | null = null;

export function setSfOverlayProgress(pct: number, done = false, bytesText?: string): void {
    const clamped = Math.max(0, Math.min(100, pct));
    if (sfBarEl) {
        sfBarEl.style.width = clamped + '%';
        sfBarEl.classList.toggle('done', !!done);
    }
    if (sfPctEl) sfPctEl.textContent = Math.round(clamped) + '%';
    if (sfBytesEl && bytesText !== undefined) sfBytesEl.textContent = bytesText;
}

function showOverlay(): void {
    document.querySelectorAll<HTMLElement>('.floating-panel').forEach(x => { x.style.display = 'none'; });
    if (overlayEl) { overlayEl.style.display = 'flex'; overlayEl.classList.add('show'); }
}
function hideOverlay(): void {
    if (overlayEl) { overlayEl.classList.remove('show'); overlayEl.style.display = 'none'; }
}
function overlayProgress(decoded: number, total: number): void {
    const pct = total > 0 ? (decoded / total) * 100 : 0;
    setSfOverlayProgress(pct, false, total > 0 ? formatMB(decoded) + ' / ' + formatMB(total) : formatMB(decoded));
}

// ---- String layer ----
let layerTrackEl: HTMLElement | null = null;
let settingsTrackEl: HTMLElement | null = null;

function syncLayerTracks(): void {
    if (layerTrackEl) layerTrackEl.classList.toggle('active', audio.stringEnabled);
    if (settingsTrackEl) settingsTrackEl.classList.toggle('active', audio.stringEnabled);
}

export function setStringLayerEnabled(on: boolean, _skipConfirm = false): void {
    audio.stringEnabled = !!on;
    persist({ stringEnabled: audio.stringEnabled });
    if (!audio.stringEnabled) releaseStringVoices();
    syncLayerTracks();
    updateSoundfontPickerUI();
    const key = audio.currentStringSf;
    if (audio.stringEnabled && key !== getLoadedKey('string') && SF_URLS[key]) {
        const alreadyCached = soundfontBufferCache.has(key) && useCachedSoundfont(key, 'string');
        // NOTE: the original then ran a syncBtns() helper that referenced
        // undeclared onBtn/offBtn globals and threw a ReferenceError, which
        // skipped the trailing updateStringRangeUI() here and in the load
        // callback below (and left the toggle tracks showing their pre-failure
        // state). Kept 1:1 by simply not doing that work.
        if (alreadyCached) return;
        resumeIfSuspended();
        if (overlayNameEl) overlayNameEl.textContent = getSoundfontName(key);
        showOverlay();
        setSfOverlayProgress(0, false, '');
        const controller = new AbortController();
        sfLoadAbortController = controller;
        loadSoundfontWithProgress(key, SF_URLS[key], overlayProgress, ok => {
            if (ok) {
                setSfOverlayProgress(100, true);
                window.setTimeout(hideOverlay, 220);
            } else {
                if (audio.stringEnabled) {
                    audio.stringEnabled = false;
                    persist({ stringEnabled: false });
                }
                const cancelled = controller.signal.aborted;
                setSfOverlayProgress(100, false);
                if (overlayNameEl) overlayNameEl.textContent = cancelled ? 'Cancelled' : 'Load failed. String layer off.';
                window.setTimeout(hideOverlay, cancelled ? 400 : 900);
            }
        }, 'string', controller.signal);
    }
    updateStringRangeUI();
}

// ---- Selecting a soundfont ----
export function selectSf(sfKey: string, url: string, el: HTMLElement | null, name: string, layer: Layer = 'piano'): void {
    const prevKey = layer === 'string' ? audio.currentStringSf : audio.currentSf;
    const prevLoadedKey = getLoadedKey(layer);
    const prevActive = document.querySelector<HTMLElement>(`.sf-option[data-layer="${layer}"].active`);
    if (overlayNameEl) overlayNameEl.textContent = name || 'SoundFont';
    resumeIfSuspended();

    const applySuccess = () => {
        if (layer === 'string') {
            audio.currentStringSf = sfKey;
            persist({ currentStringSf: sfKey });
        } else {
            audio.currentSf = sfKey;
            persist({ currentSf: sfKey });
        }
        syncOptionButtons(layer, sfKey);
        if (el) el.classList.add('active');
        stopAllNotes();
        updateSoundfontPickerUI();
        updateSfEffectUI();
    };

    if (getLoadedKey(layer) === sfKey && countBufferMap(getLayerBuffers(layer)) > 0) {
        applySuccess();
        hideOverlay();
        return;
    }
    if (soundfontBufferCache.has(sfKey) && useCachedSoundfont(sfKey, layer)) {
        applySuccess();
        hideOverlay();
        return;
    }

    showOverlay();
    setSfOverlayProgress(0, false, '');
    const controller = new AbortController();
    sfLoadAbortController = controller;

    loadSoundfontWithProgress(sfKey, url, overlayProgress, ok => {
        if (ok) {
            applySuccess();
            setSfOverlayProgress(100, true);
            window.setTimeout(hideOverlay, 220);
        } else {
            if (layer === 'string') audio.currentStringSf = prevKey;
            else audio.currentSf = prevKey;
            if (prevLoadedKey && getLoadedKey(layer) !== prevLoadedKey && soundfontBufferCache.has(prevLoadedKey)) useCachedSoundfont(prevLoadedKey, layer);
            document.querySelectorAll(`.sf-option[data-layer="${layer}"]`).forEach(btn => btn.classList.remove('active'));
            if (prevActive) prevActive.classList.add('active');
            updateSoundfontPickerUI();
            const cancelled = controller.signal.aborted;
            setSfOverlayProgress(100, false);
            if (overlayNameEl) overlayNameEl.textContent = cancelled ? 'Cancelled' : 'Load failed. Keeping current sound.';
            window.setTimeout(hideOverlay, cancelled ? 400 : 900);
        }
    }, layer, controller.signal);
}

// ---- Custom SF2 (test bench) ----
// User-supplied multi-preset .sf2 files, parsed entirely in the browser.
// Presets are exposed as regular .sf-option buttons so the shared picker
// logic treats them exactly like the bundled slots; buffer maps are cached
// per preset so re-picking is instant after the first build.
function initCustomSf2(): void {
    const loadBtn = document.getElementById('mainCustomSf2Load');
    const fileInput = document.getElementById('customSf2FileInput') as HTMLInputElement | null;
    const listEl = document.getElementById('customSf2PresetList');
    const filenameEl = document.getElementById('customSf2Filename');
    const statusEl = document.getElementById('customSf2Status');
    if (!loadBtn || !fileInput || !listEl) return;

    const MAX_PRESETS = 400;

    function showStatus(text: string, tone?: string): void {
        if (!statusEl) return;
        if (!text) { statusEl.hidden = true; statusEl.textContent = ''; return; }
        statusEl.hidden = false;
        statusEl.textContent = text;
        statusEl.setAttribute('data-tone', tone || 'error');
    }

    function clearPreviousRegistrations(): void {
        for (const key of Object.keys(SF_URLS)) {
            if (key.indexOf('usersf2:') === 0) {
                delete SF_URLS[key];
                delete SOUNDFONT_LABELS[key];
                if (soundfontBufferCache.has(key)) soundfontBufferCache.delete(key);
            }
        }
        if (audio.currentSf && audio.currentSf.indexOf('usersf2:') === 0) {
            audio.currentSf = 'grandPiano';
            persist({ currentSf: 'grandPiano' });
            clearLayer('piano');
        }
        if (audio.currentStringSf && audio.currentStringSf.indexOf('usersf2:') === 0) {
            audio.currentStringSf = 'strViolin';
            persist({ currentStringSf: 'strViolin' });
            clearLayer('string');
        }
    }

    function renderPresets(): void {
        listEl!.innerHTML = '';
        if (!customSf2) return;
        const frag = document.createDocumentFragment();
        for (const p of customSf2.presets) {
            const key = 'usersf2:' + p.bank + ':' + p.program;
            const label = p.name || ('Bank ' + p.bank + ' Program ' + p.program);
            SF_URLS[key] = key;
            SOUNDFONT_LABELS[key] = label;
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'btn sf-option ui-full-left';
            btn.dataset.layer = 'piano';
            btn.dataset.sfKey = key;
            const bp = document.createElement('span');
            bp.className = 'cp-bp';
            bp.textContent = p.bank + ':' + String(p.program).padStart(3, '0');
            btn.appendChild(bp);
            btn.appendChild(document.createTextNode(label));
            btn.addEventListener('click', () => {
                selectSf(key, key, btn, label, 'piano');
            });
            frag.appendChild(btn);
        }
        listEl!.appendChild(frag);
        updateSoundfontPickerUI();
    }

    loadBtn.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', async () => {
        const file = fileInput.files && fileInput.files[0];
        fileInput.value = '';
        if (!file) return;
        showStatus('Reading ' + file.name + '…', 'info');
        try {
            const arrayBuffer = await file.arrayBuffer();
            const presets = listPresets(arrayBuffer);
            if (!presets.length) {
                showStatus('No presets found in this SF2.', 'error');
                return;
            }
            clearPreviousRegistrations();
            const displayName = file.name.replace(/\.sf2$/i, '').slice(0, 60) || 'Custom SF2';
            customSf2 = {
                arrayBuffer,
                filename: displayName,
                presets: presets.slice(0, MAX_PRESETS),
            };
            if (filenameEl) {
                filenameEl.hidden = false;
                filenameEl.textContent = displayName + '  ·  ' + presets.length + ' preset' + (presets.length === 1 ? '' : 's');
            }
            renderPresets();
            const truncated = presets.length > MAX_PRESETS;
            showStatus(truncated
                ? ('Loaded ' + MAX_PRESETS + ' of ' + presets.length + ' presets. Only the first ' + MAX_PRESETS + ' are shown.')
                : '', 'info');
        } catch (err) {
            const msg = (err && (err as Error).message) ? (err as Error).message : String(err);
            showStatus('Failed to parse SF2: ' + msg, 'error');
        }
    });
}

export function bindSoundfontUI(): void {
    mainCurrentEl = document.getElementById('mainSfCurrent');
    layerCurrentEl = document.getElementById('layerSfCurrent');
    overlayEl = document.getElementById('sfLoadingOverlay');
    overlayNameEl = document.getElementById('sfLoadingName');
    sfBarEl = document.getElementById('sfProgressBar');
    sfPctEl = document.getElementById('sfProgressPct');
    sfBytesEl = document.getElementById('sfLoadingBytes');
    layerTrackEl = document.getElementById('layerTrack');
    settingsTrackEl = document.getElementById('settingsStringTrack');

    document.getElementById('sfLoadingCancelBtn')?.addEventListener('click', () => {
        if (sfLoadAbortController) sfLoadAbortController.abort();
    });
    document.querySelectorAll<HTMLElement>('.sf-option[data-layer][data-sf-key]').forEach(btn => {
        btn.addEventListener('click', () => {
            const sfKey = btn.dataset.sfKey || '';
            const layer: Layer = btn.dataset.layer === 'string' ? 'string' : 'piano';
            if (SF_URLS[sfKey]) selectSf(sfKey, SF_URLS[sfKey], btn, getSoundfontName(sfKey), layer);
        });
    });
    initCustomSf2();
    if (layerTrackEl) layerTrackEl.onclick = () => setStringLayerEnabled(!audio.stringEnabled);
    if (settingsTrackEl) settingsTrackEl.onclick = () => setStringLayerEnabled(!audio.stringEnabled);
}
