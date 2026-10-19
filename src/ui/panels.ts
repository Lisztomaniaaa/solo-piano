// Floating panels, toolbar buttons, the hide-UI logo toggle, the Sheet panel,
// fullscreen button and logo fallback.

import { showToast } from './toast.js';
import { setSfPanelTab } from '../audio/index.js';
import { byId } from './dom.js';

let panels: HTMLElement[] = [];

/** Hides every floating panel (also used before the SoundFont loading overlay). */
export function closeAllPanels(): void {
    for (const p of panels) if (p.style.display !== 'none') p.style.display = 'none';
}

/** Opens `id` exclusively, or closes it when it is already open. */
export function toggle(id: string): void {
    const p = byId(id);
    if (!p) return;
    const wasOpen = p.style.display === 'flex';
    closeAllPanels();
    p.style.display = wasOpen ? 'none' : 'flex';
}

export function openLinkedPanel(panelId: string): void {
    closeAllPanels();
    const panel = byId(panelId);
    if (panel) panel.style.display = 'flex';
}

export function openSfPanelTab(tab: string): void {
    openLinkedPanel('sfPanel');
    setSfPanelTab(tab);
}

export function setSettingsTab(tab: string): void {
    document.querySelectorAll<HTMLElement>('.settings-cat-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.settingsTab === tab));
    document.querySelectorAll<HTMLElement>('.settings-section').forEach(sec => sec.classList.toggle('active', sec.dataset.settingsSection === tab));
}

export function setVisualPanelPage(page: string): void {
    const isHub = !page || page === 'hub';
    document.querySelectorAll('.visual-hub').forEach(hub => hub.classList.toggle('active', isHub));
    document.querySelectorAll<HTMLElement>('.visual-subpage').forEach(sub => sub.classList.toggle('active', !isHub && sub.dataset.visualSubpage === page));
}

// The hide-UI toggle briefly locks viewport-driven relayouts (the panel/top
// bar fade would otherwise be read as a resize).
let uiLayoutLockUntil = 0;
export function lockUiLayout(ms = 500): void {
    uiLayoutLockUntil = performance.now() + ms;
}
export function isUiLayoutLocked(): boolean {
    return performance.now() < uiLayoutLockUntil;
}

function bindPanels(): void {
    panels = Array.from(document.querySelectorAll<HTMLElement>('.floating-panel'));
    document.querySelectorAll<HTMLElement>('[data-visual-open]').forEach(btn => {
        btn.addEventListener('click', () => setVisualPanelPage(btn.dataset.visualOpen ?? ''));
    });
    document.querySelectorAll<HTMLElement>('[data-visual-back]').forEach(btn => {
        btn.addEventListener('click', () => setVisualPanelPage('hub'));
    });
    document.querySelectorAll<HTMLElement>('.settings-cat-btn').forEach(btn => {
        btn.addEventListener('click', () => setSettingsTab(btn.dataset.settingsTab ?? ''));
    });
    document.querySelectorAll<HTMLElement>('[data-close-panel]').forEach(btn => {
        btn.addEventListener('click', () => toggle(btn.dataset.closePanel ?? ''));
    });

    const on = (id: string, fn: () => void): void => { byId(id)?.addEventListener('click', fn); };
    on('setBtn', () => { setSettingsTab('performance'); toggle('settingsPanel'); });
    on('colBtn', () => { setVisualPanelPage('hub'); toggle('colorPanel'); });
    on('metroBtn', () => toggle('metronomePanel'));
    on('sfBtn', () => openSfPanelTab('main'));
    on('audioBtn', () => toggle('audioPanel'));
    on('keyBtn', () => toggle('keyPanel'));
    on('sheetBtn', () => toggle('sheetPanel'));
    on('faqBtn', () => toggle('faqPanel'));
    on('settingsFullscreenBtn', () => byId('fsBtn')?.click());
    on('settingsMidiBtn', () => byId('midiBtn')?.click());

    byId('logoToggle')?.addEventListener('click', () => {
        lockUiLayout(600);
        document.body.classList.toggle('hide-ui');
    });

    // Vertical wheel scrolls the toolbar horizontally when it overflows.
    const topPanelScroller = byId('panel');
    if (topPanelScroller) {
        topPanelScroller.addEventListener('wheel', e => {
            if (!e.deltaY) return;
            if (topPanelScroller.scrollWidth <= topPanelScroller.clientWidth) return;
            topPanelScroller.scrollLeft += e.deltaY;
            e.preventDefault();
        }, { passive: false });
    }
}

// Sheet text persists across reloads (key shared with Multiplayer's copy).
function bindSheetPanel(): void {
    const ta = byId<HTMLTextAreaElement>('sheetTextArea');
    if (!ta) return;
    const KEY = 'papianoQwertySheetText';
    try { ta.value = localStorage.getItem(KEY) || ''; } catch { /* storage unavailable */ }
    ta.addEventListener('input', () => {
        try { localStorage.setItem(KEY, ta.value); } catch { /* ignore */ }
    });
    byId('sheetPasteBtn')?.addEventListener('click', async () => {
        // clipboard.readText needs a user gesture and may be denied; the
        // textarea gets focus either way so a manual Ctrl+V still works.
        try {
            const text = await navigator.clipboard.readText();
            if (text) {
                ta.value = text;
                try { localStorage.setItem(KEY, ta.value); } catch { /* ignore */ }
            }
        } catch {
            showToast('Couldn’t read the clipboard — try pasting into the box directly (Ctrl+V).');
        }
        ta.focus();
    });
    byId('sheetClearBtn')?.addEventListener('click', () => {
        ta.value = '';
        try { localStorage.removeItem(KEY); } catch { /* ignore */ }
        ta.focus();
    });
}

// ── Fullscreen button ───────────────────────────────────────────────────────
interface VendorDocument extends Document {
    webkitFullscreenElement?: Element | null;
    mozFullScreenElement?: Element | null;
    msFullscreenElement?: Element | null;
}
interface VendorElement extends HTMLElement {
    webkitRequestFullscreen?: () => Promise<void> | void;
    mozRequestFullScreen?: () => Promise<void> | void;
    msRequestFullscreen?: () => Promise<void> | void;
}

function bindFullscreen(): void {
    const fsBtn = byId('fsBtn');
    if (!fsBtn) return;
    let fsRequested = false;
    let fsTimer: number | undefined;
    const doc = document as VendorDocument;

    const apiFullscreen = (): boolean =>
        !!(doc.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement || doc.msFullscreenElement);
    const displayModeFullscreen = (): boolean =>
        matchMedia('(display-mode: fullscreen)').matches || matchMedia('(display-mode: standalone)').matches;
    const viewportLooksFullscreen = (): boolean => {
        const vv = window.visualViewport;
        const vw = Math.round(vv ? vv.width : window.innerWidth);
        const vh = Math.round(vv ? vv.height : window.innerHeight);
        const sw = Math.max(1, Math.round(screen.width || 1));
        const sh = Math.max(1, Math.round(screen.height || 1));
        const saw = Math.max(1, Math.round(screen.availWidth || sw));
        const sah = Math.max(1, Math.round(screen.availHeight || sh));
        const area = vw * vh;
        const nearScreen = area >= sw * sh * 0.92 || area >= saw * sah * 0.96;
        const nearHeight = vh >= Math.min(sh, sah) * 0.96 || vh >= Math.max(sh, sah) * 0.92;
        const nearWidth = vw >= Math.min(sw, saw) * 0.96 || vw >= Math.max(sw, saw) * 0.92;
        return nearScreen || (nearWidth && nearHeight);
    };
    const nativeFullscreen = (): boolean => apiFullscreen() || displayModeFullscreen() || viewportLooksFullscreen();
    const update = (): void => {
        const nativeOn = nativeFullscreen();
        if (nativeOn) fsRequested = true;
        if (!nativeOn && fsRequested && !document.hasFocus()) fsRequested = false;
        const on = nativeOn || fsRequested;
        document.documentElement.classList.toggle('papiano-fullscreen', on);
        document.body.classList.toggle('papiano-fullscreen', on);
        fsBtn.classList.toggle('fs-hidden', on);
        const display = on ? 'none' : 'inline-flex';
        if (fsBtn.style.display !== display) fsBtn.style.display = display;
        if (fsBtn.textContent !== 'Fullscreen') fsBtn.textContent = 'Fullscreen';
        fsBtn.title = 'Fullscreen';
    };
    const scheduleChecks = (): void => {
        clearInterval(fsTimer);
        let ticks = 0;
        fsTimer = window.setInterval(() => {
            update();
            ticks++;
            if (ticks > 16) clearInterval(fsTimer);
        }, 180);
    };
    fsBtn.addEventListener('click', () => {
        const el = document.documentElement as VendorElement;
        fsRequested = true;
        update();
        const req = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen;
        if (req) {
            const result = req.call(el);
            if (result && typeof result.catch === 'function') result.catch(() => {});
        }
        setTimeout(() => {
            if (!nativeFullscreen()) fsRequested = false;
            update();
        }, 1400);
        scheduleChecks();
    });
    for (const evt of ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange', 'visibilitychange']) {
        document.addEventListener(evt, () => {
            if (!nativeFullscreen()) fsRequested = false;
            update();
        });
    }
    for (const evt of ['resize', 'orientationchange', 'pageshow']) {
        window.addEventListener(evt, () => {
            if (!nativeFullscreen()) fsRequested = false;
            setTimeout(update, 80);
        }, { passive: true });
    }
    update();
}

function bindLogoFallback(): void {
    const img = document.querySelector<HTMLImageElement>('.brand-icon img');
    if (!img) return;
    const fallback = (): void => { img.closest('.brand-icon')?.classList.add('logo-fallback'); };
    img.addEventListener('error', fallback, { once: true });
    if (img.complete && img.naturalWidth === 0) fallback();
}

export function initPanels(): void {
    bindPanels();
    bindSheetPanel();
    bindFullscreen();
    bindLogoFallback();
}
