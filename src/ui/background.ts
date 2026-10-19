// Custom background image/video (#customBgLayer / #customBgVideo /
// #customBgDimLayer). These layers are plain DOM behind the stage, styled via
// the --custom-bg-* variables. Fit/position/opacity/dim/blur are settings; the
// chosen file itself is session-only (an object URL).

import type { Settings } from '../state/settings.js';
import { update, setBgFitMode, setBgPositionMode } from './actions.js';
import { byId, setActive, slider, syncSlider, watch } from './dom.js';

let customBgUrl: string | null = null;

function clampSlider(value: unknown, max: number, fallback: number): number {
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(0, Math.min(max, Math.round(n))) : fallback;
}

/** Background slider values, clamped like the original applyBgImageSettings. */
export function setBgSlider(d: Settings, key: 'bgOpacity' | 'bgDim' | 'bgBlur', value: unknown): void {
    d[key] = clampSlider(value, key === 'bgBlur' ? 20 : 100, d[key]);
}

export function initBackground(): void {
    const layer = byId('customBgLayer');
    const video = byId<HTMLVideoElement>('customBgVideo');
    const input = byId<HTMLInputElement>('bgImgInput');
    const removeBtn = byId('bgImgRemove');
    const root = document.documentElement.style;

    const clearVideo = (): void => {
        if (!video) return;
        video.pause();
        video.removeAttribute('src');
        video.load();
        video.classList.remove('active');
    };

    // An image (incl. animated GIF) paints as a CSS background; a video needs
    // the <video> layer. The two are mutually exclusive.
    input?.addEventListener('change', () => {
        const file = input.files && input.files[0];
        if (!file) return;
        if (customBgUrl) URL.revokeObjectURL(customBgUrl);
        customBgUrl = URL.createObjectURL(file);
        if (file.type.startsWith('video/')) {
            if (layer) { layer.style.backgroundImage = ''; layer.classList.remove('active'); }
            if (video) {
                video.src = customBgUrl;
                video.classList.add('active');
                video.play().catch(() => {});
            }
        } else {
            clearVideo();
            if (layer) {
                layer.style.backgroundImage = `url('${customBgUrl}')`;
                layer.classList.add('active');
            }
        }
        if (removeBtn) removeBtn.style.display = '';
        byId('app')?.classList.add('has-custom-bg');
        input.value = '';
    });
    removeBtn?.addEventListener('click', () => {
        if (layer) { layer.style.backgroundImage = ''; layer.classList.remove('active'); }
        clearVideo();
        if (customBgUrl) URL.revokeObjectURL(customBgUrl);
        customBgUrl = null;
        removeBtn.style.display = 'none';
        byId('app')?.classList.remove('has-custom-bg');
    });

    const sliders: ['bgOpacity' | 'bgDim' | 'bgBlur', string, string][] = [
        ['bgOpacity', 'bgOpacityRange', 'bgOpacityVal'],
        ['bgDim', 'bgDimRange', 'bgDimVal'],
        ['bgBlur', 'bgBlurRange', 'bgBlurVal'],
    ];
    const bindings = sliders.map(([key, rangeId, labelId]) => {
        const b = slider(rangeId, labelId);
        b.range?.addEventListener('input', () => update(d => setBgSlider(d, key, b.range!.value)));
        return [key, b] as const;
    });
    const fitBtns = Array.from(document.querySelectorAll<HTMLElement>('.bg-fit-btn'));
    const posBtns = Array.from(document.querySelectorAll<HTMLElement>('.bg-pos-btn'));
    for (const btn of fitBtns) btn.addEventListener('click', () => update(d => setBgFitMode(d, btn.dataset.bgFit)));
    for (const btn of posBtns) btn.addEventListener('click', () => update(d => setBgPositionMode(d, btn.dataset.bgPosition)));

    watch(['bgOpacity', 'bgDim', 'bgBlur'], s => {
        root.setProperty('--custom-bg-opacity', String(s.bgOpacity / 100));
        root.setProperty('--custom-bg-dim', String(s.bgDim / 100));
        root.setProperty('--custom-bg-blur', s.bgBlur + 'px');
        root.setProperty('--custom-bg-scale', s.bgBlur > 0 ? '1.04' : '1');
        for (const [key, b] of bindings) syncSlider(b, s[key], s[key] + (key === 'bgBlur' ? 'px' : '%'));
    });
    watch(['bgFitMode'], s => {
        if (layer) layer.style.backgroundSize = s.bgFitMode === 'stretch' ? '100% 100%' : s.bgFitMode;
        if (video) video.style.objectFit = s.bgFitMode === 'stretch' ? 'fill' : s.bgFitMode;
        for (const btn of fitBtns) setActive(btn, btn.dataset.bgFit === s.bgFitMode);
    });
    watch(['bgPositionMode'], s => {
        const pos = s.bgPositionMode === 'top' ? 'center top' : (s.bgPositionMode === 'bottom' ? 'center bottom' : 'center center');
        if (layer) layer.style.backgroundPosition = pos;
        if (video) video.style.objectPosition = pos;
        for (const btn of posBtns) setActive(btn, btn.dataset.bgPosition === s.bgPositionMode);
    });
}
