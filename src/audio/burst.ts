// Input burst score (0..18): how fast notes are arriving. The audio engine
// marks it on every press/release from the note hub and uses it to tighten the
// voice ceiling during glissandi. Other modules should only READ it via
// getBurstLevel(); marking it twice per event would double the score.

let inputBurstScore = 0;
let lastInputBurstAt = 0;
let inputBurstFrame = 0;
let inputBurstFrameCount = 0;

export function markInputBurst(): number {
    const now = performance.now();
    const frame = Math.floor(now / 16.7);
    inputBurstFrameCount = (frame === inputBurstFrame) ? Math.min(24, inputBurstFrameCount + 1) : 1;
    inputBurstFrame = frame;
    inputBurstScore = (now - lastInputBurstAt < 90) ? Math.min(18, inputBurstScore + 1 + (inputBurstFrameCount > 4 ? 1 : 0)) : 1;
    lastInputBurstAt = now;
    return inputBurstScore;
}

export function getBurstLevel(): number {
    const now = performance.now();
    if (now - lastInputBurstAt > 220) inputBurstScore = Math.max(0, inputBurstScore - 2);
    return inputBurstScore;
}

/** Same-frame press count, for the visual burst mode (input-burst-mode class). */
export function getBurstFrameCount(): number {
    return inputBurstFrameCount;
}
