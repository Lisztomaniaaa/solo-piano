// Live Velocity Meter: a VU-style bar next to the Auto Velocity toggle that
// reflects the velocity fed to playNote() for every input path, so flipping
// Auto Velocity is directly, visually comparable (flat vs. fluctuating).

let fill: HTMLElement | null = null;
let label: HTMLElement | null = null;
let decayTimer = 0;
let restartRaf = 0;

export function bindVelocityMeter(): void {
    fill = document.getElementById('velMeterFill');
    label = document.getElementById('velMeterVal');
}

export function updateVelocityMeter(vel: number): void {
    const el = fill;
    if (!el) return;
    const pct = Math.round(Math.max(0, Math.min(1, vel || 0)) * 100);
    if (decayTimer) { clearTimeout(decayTimer); decayTimer = 0; }
    if (restartRaf) { cancelAnimationFrame(restartRaf); restartRaf = 0; }
    el.style.transition = 'none';
    el.style.width = pct + '%';
    if (label) label.textContent = pct + '%';
    // Restarting the width transition needs the jump frame painted first. A
    // forced layout read (offsetWidth) would flush every pending style change
    // on every note-on; a double rAF guarantees a frame boundary instead.
    restartRaf = requestAnimationFrame(() => {
        restartRaf = requestAnimationFrame(() => {
            restartRaf = 0;
            el.style.transition = 'width 0.6s ease-out';
            decayTimer = window.setTimeout(() => { el.style.width = '0%'; }, 90);
        });
    });
}
