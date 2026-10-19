// Toast notifications in #toastWrap (styles: .toast / .t-<type> in solo-piano.css).

export type ToastType = 'info' | 'error' | 'success';

export interface ToastOptions {
    type?: ToastType;
    title?: string;
    duration?: number;
}

const DEFAULT_TITLES: Record<ToastType, string> = {
    info: 'Notice',
    error: 'Something went wrong',
    success: 'Done',
};
const ICONS: Record<ToastType, string> = { info: 'i', error: '!', success: '✓' };

export function showToast(message: string, opts: ToastOptions = {}): HTMLElement | null {
    const wrap = document.getElementById('toastWrap');
    if (!wrap) return null;
    const type = opts.type ?? 'info';
    const duration = opts.duration ?? (type === 'error' ? 5000 : 3200);

    const el = document.createElement('div');
    el.className = 'toast t-' + type;
    const icon = document.createElement('div');
    icon.className = 'toast-icon';
    icon.textContent = ICONS[type];
    const body = document.createElement('div');
    body.className = 'toast-body';
    const title = document.createElement('div');
    title.className = 'toast-title';
    title.textContent = opts.title ?? DEFAULT_TITLES[type];
    const msg = document.createElement('div');
    msg.className = 'toast-msg';
    msg.textContent = message;
    body.append(title, msg);
    const bar = document.createElement('div');
    bar.className = 'toast-bar';
    bar.style.animationDuration = duration + 'ms';
    el.append(icon, body, bar);
    wrap.appendChild(el);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('show')));

    let done = false;
    const dismiss = () => {
        if (done) return;
        done = true;
        el.classList.remove('show');
        el.classList.add('hide');
        window.setTimeout(() => el.remove(), 360);
    };
    el.addEventListener('click', dismiss);
    window.setTimeout(dismiss, duration);
    return el;
}
