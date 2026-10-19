// Visible key count: 34/56/88 presets and a custom −/+ stepper stage a count,
// Apply commits it to settings.wCount (and reflows Piano Height / Black Key
// Edge Depth through the key-count law in actions.ts).

import { settings } from '../state/settings.js';
import { runtime } from '../state/runtime.js';
import { WHITE_MIDIS, WHITE_KEY_COUNT } from '../core/geometry.js';
import { update, reflowPianoForKeyCount } from './actions.js';
import { byId, setText, setActive } from './dom.js';

let pendingWCount = settings.get().wCount;
let presetBtns: HTMLElement[] = [];
let applyBtns: HTMLElement[] = [];
let wCEls: (HTMLElement | null)[] = [];

/** Number of keys (white + black) spanned by `count` white keys starting at `offset`. */
export function whiteCountToTuts(count: number, offset?: number): number {
    const totalWhite = WHITE_KEY_COUNT;
    const whiteCount = Math.max(1, Math.min(totalWhite, Math.round(Number(count) || settings.get().wCount)));
    const start = Math.max(0, Math.min(totalWhite - whiteCount, Math.round(Number(offset ?? runtime.get().viewOffset) || 0)));
    const end = Math.min(totalWhite - 1, start + whiteCount - 1);
    return Math.max(1, WHITE_MIDIS[end]! - WHITE_MIDIS[start]! + 1);
}

function refreshKeyPresetUI(): void {
    const wCount = settings.get().wCount;
    for (const btn of presetBtns) {
        const keyCount = parseInt(btn.dataset.keyCount ?? '', 10);
        setActive(btn, keyCount === pendingWCount);
        setText(btn, String(whiteCountToTuts(keyCount)));
    }
    const visibleTuts = whiteCountToTuts(pendingWCount);
    for (const el of wCEls) setText(el, String(visibleTuts));
    const dirty = pendingWCount !== wCount;
    for (const btn of applyBtns) {
        if (btn.classList.contains('pending') !== dirty) btn.classList.toggle('pending', dirty);
        setText(btn, dirty ? ('Apply ' + visibleTuts + ' Keys') : 'Keys Applied');
    }
}

export function stageVisibleKeyCount(count: unknown): void {
    pendingWCount = Math.max(3, Math.min(52, parseInt(String(count), 10) || pendingWCount || settings.get().wCount));
    refreshKeyPresetUI();
}

export function stepVisibleKeyCount(delta: number): void {
    stageVisibleKeyCount(pendingWCount + delta);
}

export function applyVisibleKeyCount(): void {
    const wCount = settings.get().wCount;
    const next = Math.max(3, Math.min(52, parseInt(String(pendingWCount), 10) || wCount));
    if (next === wCount) { refreshKeyPresetUI(); return; }
    update(d => {
        d.wCount = next;
        reflowPianoForKeyCount(d);
    });
    // Keep the scroll inside the new range (0 when nothing is left to swipe).
    const maxOffset = Math.max(0, WHITE_KEY_COUNT - Math.max(1, Math.min(WHITE_KEY_COUNT, Math.round(next))));
    const offset = runtime.get().viewOffset;
    runtime.set({ viewOffset: maxOffset > 0 ? Math.max(0, Math.min(maxOffset, offset)) : 0 });
    refreshKeyPresetUI();
}

export function initKeyCount(): void {
    presetBtns = Array.from(document.querySelectorAll<HTMLElement>('.key-preset-btn'));
    applyBtns = Array.from(document.querySelectorAll<HTMLElement>('.key-apply-btn'));
    wCEls = [byId('wC'), byId('settingsWC')];
    for (const btn of presetBtns) btn.addEventListener('click', () => stageVisibleKeyCount(btn.dataset.keyCount));
    const steppers: [string, number][] = [['wU', 1], ['wD', -1], ['settingsWU', 1], ['settingsWD', -1]];
    for (const [id, delta] of steppers) {
        const btn = byId(id);
        if (!btn) continue;
        btn.addEventListener('click', () => stepVisibleKeyCount(delta));
        btn.addEventListener('keydown', event => {
            if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
            event.preventDefault();
            stepVisibleKeyCount((event.key === 'ArrowUp' || event.key === 'ArrowRight') ? 1 : -1);
        });
    }
    byId('keyApply')?.addEventListener('click', applyVisibleKeyCount);
    byId('settingsKeyApply')?.addEventListener('click', applyVisibleKeyCount);

    // A preset / Reset Defaults moves wCount directly: the staged count follows.
    settings.subscribe(['wCount'], s => { pendingWCount = s.wCount; refreshKeyPresetUI(); });
    // Button captions depend on where the keyboard is scrolled. Coalesced to
    // one pass per frame; the guarded writes make an unchanged caption free.
    let raf = 0;
    runtime.subscribe(['viewOffset'], () => {
        if (raf) return;
        raf = requestAnimationFrame(() => { raf = 0; refreshKeyPresetUI(); });
    });
    pendingWCount = settings.get().wCount;
    refreshKeyPresetUI();
}
