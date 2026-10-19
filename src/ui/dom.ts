// Small DOM helpers shared by the panel modules. Every write is guarded so a
// control that already shows the value is left alone (no redundant style or
// text writes, no layout invalidation).

import { settings, type Settings } from '../state/settings.js';

export function byId<T extends HTMLElement = HTMLElement>(id: string): T | null {
    return document.getElementById(id) as T | null;
}

export function setText(el: HTMLElement | null, text: string): void {
    if (el && el.textContent !== text) el.textContent = text;
}

export function setRangeValue(el: HTMLInputElement | null, value: number | string): void {
    if (!el) return;
    const v = String(value);
    if (el.value !== v) el.value = v;
}

export function setActive(el: Element | null, on: boolean): void {
    if (el && el.classList.contains('active') !== on) el.classList.toggle('active', on);
}

export function setShown(el: HTMLElement | null, visible: boolean): void {
    if (!el) return;
    const v = visible ? '' : 'none';
    if (el.style.display !== v) el.style.display = v;
}

/** Binds a slider + "N%"-style label pair to one setting. */
export interface SliderBinding {
    range: HTMLInputElement | null;
    label: HTMLElement | null;
}

export function slider(rangeId: string, labelId: string | null): SliderBinding {
    return { range: byId<HTMLInputElement>(rangeId), label: labelId ? byId(labelId) : null };
}

export function syncSlider(b: SliderBinding, value: number, text: string): void {
    setRangeValue(b.range, value);
    setText(b.label, text);
}

export function onClick(id: string, fn: (ev: MouseEvent) => void): void {
    const el = byId(id);
    if (el) el.addEventListener('click', fn);
}

export function onInput(id: string, fn: (value: string) => void): void {
    const el = byId<HTMLInputElement>(id);
    if (el) el.addEventListener('input', () => fn(el.value));
}

/** Subscribes to `keys` and also runs `fn` once immediately. */
export function watch(keys: readonly (keyof Settings)[], fn: (s: Readonly<Settings>) => void): void {
    settings.subscribe(keys, state => fn(state));
    fn(settings.get());
}
