function forceBootVisible(){
    if(document.body.classList.contains('mp-entering-piano')) return;
    const loadingScreen = document.getElementById('loadingScreen');
    const app = document.getElementById('app');
    if(app) app.classList.add('fade-in');
    if(loadingScreen){
        loadingScreen.classList.add('fade-out');
        loadingScreen.setAttribute('aria-hidden', 'true');
        setTimeout(() => { loadingScreen.style.display = 'none'; }, 120);
    }
}
window.addEventListener('error', () => setTimeout(forceBootVisible, 0));
window.addEventListener('unhandledrejection', () => setTimeout(forceBootVisible, 0));
setTimeout(forceBootVisible, 5200);

function showToast(message, opts){
    opts = opts || {};
    const type = opts.type || 'info';
    const title = opts.title || (type === 'error' ? 'Something went wrong'
                              : type === 'success' ? 'Done'
                              : 'Notice');
    const duration = opts.duration || (type === 'error' ? 5000 : 3200);
    const wrap = document.getElementById('toastWrap');
    if(!wrap){ return; }
    const icon = type === 'error' ? '!' : type === 'success' ? '✓' : 'i';
    const el = document.createElement('div');
    el.className = 'toast t-' + type;
    el.innerHTML =
        '<div class="toast-icon">' + icon + '</div>' +
        '<div class="toast-body">' +
            '<div class="toast-title"></div>' +
            '<div class="toast-msg"></div>' +
        '</div>' +
        '<div class="toast-bar" style="animation-duration:' + duration + 'ms;"></div>';
    el.querySelector('.toast-title').textContent = title;
    el.querySelector('.toast-msg').textContent = message;
    wrap.appendChild(el);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('show')));
    let done = false;
    const dismiss = () => {
        if(done) return; done = true;
        el.classList.remove('show');
        el.classList.add('hide');
        setTimeout(() => { if(el.parentNode) el.parentNode.removeChild(el); }, 360);
    };
    el.addEventListener('click', dismiss);
    setTimeout(dismiss, duration);
    return el;
}

let pianoRuntimePrepared = false;
let pianoEntryLoadingProgress = 0;
window.__papianoPianoInputReady = false;

function setPianoInputReady(ready){
    window.__papianoPianoInputReady = !!ready;
}

function isPianoInputAllowed(){
    // No "room" to join — local tap/click/QWERTY testing is allowed as soon
    // as the piano UI has finished building.
    return window.__papianoPianoInputReady === true;
}

// `detail` (e.g. "8.0MB / 36.7MB · 90%") renders on its own reserved-height
// line below `label` — kept as a second DOM node rather than appended to
// the same string so the card never reflows between one line and two as
// the digits change width (was the actual cause of the loading screen's
// visible jank, not just the number itself). Omit/empty `detail` to hide
// it (it stays reserved via CSS visibility, not display, so hiding it
// doesn't change the card's height either).
function setPianoEntryLoading(progress, label, detail){
    const loadingScreen = document.getElementById('loadingScreen');
    const loadingLabel = document.querySelector('.ld-main-label');
    const loadingDetail = document.getElementById('ldDetail');
    const ldBar1 = document.getElementById('ldBar1');
    if(!loadingScreen) return;
    pianoEntryLoadingProgress = Math.max(pianoEntryLoadingProgress, Math.max(0, Math.min(100, Number(progress) || 0)));
    loadingScreen.style.display = 'flex';
    loadingScreen.classList.remove('fade-out');
    loadingScreen.setAttribute('aria-hidden', 'false');
    document.body.classList.add('mp-entering-piano');
    if(ldBar1){
        ldBar1.classList.toggle('done', pianoEntryLoadingProgress >= 100);
        ldBar1.style.width = pianoEntryLoadingProgress + '%';
    }
    if(label && loadingLabel) loadingLabel.textContent = label;
    if(loadingDetail){
        if(detail){ loadingDetail.textContent = detail; loadingDetail.classList.add('show'); }
        else loadingDetail.classList.remove('show');
    }
}

function hidePianoEntryLoading(){
    const loadingScreen = document.getElementById('loadingScreen');
    if(!loadingScreen) return;
    loadingScreen.classList.add('fade-out');
    loadingScreen.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('mp-entering-piano');
    setTimeout(() => {
        if(!document.body.classList.contains('mp-entering-piano')) loadingScreen.style.display = 'none';
    }, 260);
}

function preparePianoRuntimeForEntry(){
    if(pianoRuntimePrepared) return true;
    try{
        if(typeof syncCanvasSize === 'function') syncCanvasSize(true);
        if(typeof build === 'function') build();
        if(typeof ensurePianoBootVisible === 'function') ensurePianoBootVisible();
        if(typeof updateKeyHitCache === 'function') updateKeyHitCache();
        if(typeof refreshStageHeight === 'function') refreshStageHeight();
        if(typeof refreshNoteXCache === 'function') refreshNoteXCache();
        if(typeof startStageFreshWatcher === 'function') startStageFreshWatcher();
        pianoRuntimePrepared = true;
        return true;
    }catch(e){
        return false;
    }
}

async function preparePianoEntryRuntime(){
    setPianoInputReady(false);
    setPianoEntryLoading(42, 'Building Piano');
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const ready = preparePianoRuntimeForEntry();
    setPianoEntryLoading(76, 'Preparing Visuals');
    try{
        if(typeof getDustSprite === 'function'){
            const color = (typeof strikeLineColor !== 'undefined' && strikeLineColor) ? strikeLineColor : '#ffffff';
            getDustSprite(color);
        }
        if(typeof ctx2d !== 'undefined' && ctx2d){
            ctx2d.save();
            ctx2d.globalAlpha = 0;
            ctx2d.fillRect(0, 0, 1, 1);
            ctx2d.restore();
        }
    }catch(e){}
    return ready;
}

function clearPianoEntryVisualState(){
    try{
        if(typeof stopAllNotes === 'function') stopAllNotes();
        if(Array.isArray(falling)) falling.length = 0;
        if(typeof fallingByMidi !== 'undefined' && fallingByMidi) fallingByMidi.clear();
        if(typeof neonDustEmitters !== 'undefined' && neonDustEmitters) neonDustEmitters.clear();
        if(typeof pressStartTimes !== 'undefined' && pressStartTimes) pressStartTimes.clear();
        if(typeof _recentReleaseNotes !== 'undefined' && _recentReleaseNotes) _recentReleaseNotes.clear();
        if(typeof pointerNoteMap !== 'undefined' && pointerNoteMap) pointerNoteMap.clear();
        if(typeof qwertyHeldByCode !== 'undefined' && qwertyHeldByCode) qwertyHeldByCode.clear();
        if(typeof midiPedalHeldNotes !== 'undefined' && midiPedalHeldNotes) midiPedalHeldNotes.clear();
        if(typeof sustainTailVoices !== 'undefined' && sustainTailVoices) sustainTailVoices.clear();
        if(typeof pendingActiveRemoves !== 'undefined' && pendingActiveRemoves) pendingActiveRemoves.clear();
        if(typeof _keyColorMap !== 'undefined' && _keyColorMap) _keyColorMap.clear();
        document.querySelectorAll('#piano .active').forEach(el => {
            el.classList.remove('active');
            _applyKeyColor(el, '');
            if(typeof setActiveKeyOverlay === 'function') setActiveKeyOverlay(el, false);
        });
        if(typeof chordNotes !== 'undefined' && chordNotes) chordNotes.clear();
        if(typeof requestChordUpdate === 'function') requestChordUpdate();
    }catch(e){}
}

async function finalizePianoEntryRuntime(){
    setPianoEntryLoading(88, 'Syncing Layout');
    setPianoInputReady(false);
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    try{
        if(typeof markStageGeomDirty === 'function') markStageGeomDirty();
        if(typeof refreshStageHeight === 'function') refreshStageHeight();
        if(typeof updateKeyLayout === 'function') updateKeyLayout();
        if(typeof syncCanvasSize === 'function') syncCanvasSize(true);
        if(typeof updateKeyHitCache === 'function') updateKeyHitCache();
        if(typeof refreshNoteXCache === 'function') refreshNoteXCache();
        if(typeof ensureStageCanvasFresh === 'function') ensureStageCanvasFresh(true);
    }catch(e){}
    clearPianoEntryVisualState();
    await new Promise(resolve => requestAnimationFrame(resolve));
    try{
        if(typeof markStageGeomDirty === 'function') markStageGeomDirty();
        if(typeof syncCanvasSize === 'function') syncCanvasSize(true);
        if(typeof updateKeyLayout === 'function') updateKeyLayout();
        if(typeof updateKeyHitCache === 'function') updateKeyHitCache();
        if(typeof refreshNoteXCache === 'function') refreshNoteXCache();
    }catch(e){}
    setPianoInputReady(true);
    setPianoEntryLoading(100, 'Ready');
    await new Promise(resolve => setTimeout(resolve, 80));
}

window.addEventListener('load', () => {
    const app = document.getElementById('app');
    const loadingScreen = document.getElementById('loadingScreen');
    if(app) app.classList.add('fade-in');
    if(loadingScreen && !document.body.classList.contains('mp-entering-piano')){
        loadingScreen.classList.add('fade-out');
        loadingScreen.setAttribute('aria-hidden', 'true');
        loadingScreen.style.display = 'none';
    }
});

// Formats a byte count as e.g. "12.3MB" — used to show real download
// progress (not just %) while a soundfont streams in.
function formatMB(bytes){
    return (bytes / (1024 * 1024)).toFixed(1) + 'MB';
}

function startBackgroundSoundfont(){
    if (window.__papianoSoundfontStarted) return;
    window.__papianoSoundfontStarted = true;
    const DEFAULT_SF_KEY = 'grandPiano';
    const defaultLabel = (typeof SOUNDFONT_LABELS !== 'undefined' && SOUNDFONT_LABELS[DEFAULT_SF_KEY]) || 'Grand Piano';
    // Real-time soundfont progress rendered via the shared entry loader
    // (the same full-screen visual used when joining a multiplayer room).
    // playSfBuffer's window.__papianoStageReady gate stays false until the
    // buffers finish building so mash-key input can't chip the audio graph
    // mid-decode.
    if (typeof setPianoEntryLoading === 'function') setPianoEntryLoading(0, 'Loading ' + defaultLabel);
    try {
        loadSoundfontWithProgress(
            DEFAULT_SF_KEY,
            SF_URLS[DEFAULT_SF_KEY],
            (decoded, total) => {
                const pct = total > 0 ? Math.round((decoded / total) * 100) : 0;
                const decoding = total > 0 && decoded >= total;
                // setPianoEntryLoading only ever moves the bar forward
                // (Math.max against the prior value), and the prior stages
                // already parked it at 88 ("Syncing Layout"). Feeding it the
                // raw 0-100 soundfont % would leave the bar visually frozen
                // at 88 for the first 88% of the download, then jump straight
                // to 100 -- remap onto the remaining 88-100 span so it moves
                // continuously with the real download the whole way. The
                // displayed number has to use this SAME remapped value, not
                // the raw pct -- showing the raw 0-100 next to an 88-100 bar
                // is what made the counter look disconnected/reset.
                const overallPct = 88 + Math.round(pct * 0.12);
                const label = decoding ? 'Decoding samples' : ('Loading ' + defaultLabel);
                const detail = decoding ? '' : (total > 0 ? formatMB(decoded) + ' / ' + formatMB(total) + '  ·  ' + overallPct + '%' : overallPct + '%');
                if (typeof setPianoEntryLoading === 'function') setPianoEntryLoading(overallPct, label, detail);
            },
            ok => {
                if (typeof setPianoEntryLoading === 'function') {
                    setPianoEntryLoading(100, ok ? 'Ready' : 'Sound unavailable — continuing silent', '');
                }
                window.__papianoStageReady = true;
                setTimeout(() => {
                    if (typeof hidePianoEntryLoading === 'function') hidePianoEntryLoading();
                }, ok ? 220 : 1400);
            },
            'piano'
        );
    } catch (e) {
        if (typeof setPianoEntryLoading === 'function') setPianoEntryLoading(100, 'Sound unavailable');
        window.__papianoStageReady = true;
        setTimeout(() => {
            if (typeof hidePianoEntryLoading === 'function') hidePianoEntryLoading();
        }, 1400);
    }
}

const AudioContextClass = window.AudioContext || window.webkitAudioContext;
const IS_MOBILE_AUDIO = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
const audioCtx = (() => {
    // Mobile gets 'balanced': a larger hardware buffer that keeps rendering
    // ahead of the DAC even when the 120 Hz UI thread (canvas/WebGL note FX)
    // is saturated. 'interactive' asks Android for the low-latency audio path
    // whose tiny bursts underrun — audibly crackle — the moment anything
    // else competes for CPU, which is exactly the reported symptom on
    // phones at normal playing tempo. The extra ~30-60 ms of output latency
    // is below what a touchscreen note press already carries.
    // 'balanced' on every platform now, not just phones. The note above
    // already spells out why 'interactive' crackles: it asks for the smallest
    // hardware buffer available, so the audio thread underruns the moment
    // anything else competes for CPU. That reasoning was never phone-specific
    // — a laptop rendering falling notes, particles and a canvas is competing
    // for CPU too, and the report is intermittent crackle ("still CAN
    // crackle") on demanding repertoire, which is the signature of an
    // occasional missed deadline rather than of a level or gain-staging
    // problem. Measured on the desktop mix, level is not the issue: an
    // Op.25/1-shaped passage (wide arpeggio waves, both hands, pedal held,
    // ~24 notes/s) peaks at 0.58 with ZERO clipped samples, zero samples
    // even inside the soft-clip bend, and 0.1 dB of limiter reduction.
    // The extra few ms of output latency buys a buffer that survives a
    // frame of contention; it stays far below the ~20-30 ms where key
    // response starts to feel detached.
    try { return new AudioContextClass({ latencyHint: 'balanced' }); }
    catch(e) { return new AudioContextClass(); }
})();
const masterGain = audioCtx.createGain();
// Master chain: gain (headroom) -> one gentle limiter -> transparent
// overshoot guard -> DAC. The previous chain (glue compressor threshold
// -12 dB / knee 24 with WebAudio's implicit makeup gain, a 1.15 makeup
// stage, a -0.5 dB brickwall, then a tanh(2x) WaveShaper) was itself the
// distortion: knee 24 means compression from -24 dB up — nearly all
// musical content — and the tanh curve's slope at the origin is
// 0.97*2/tanh(2) = 2.01, i.e. the "safety" clipper boosted EVERYTHING by
// +6 dB and saturated anything above ~0.3. That is why output was loud,
// aggressive and dirty regardless of which soundfont was loaded.
// With honest per-voice staging (see velocityGain/layerBoost in
// playSfBuffer) the mix rarely exceeds the limiter threshold, the limiter
// only trims dense pedalled peaks, and the guard curve below stays
// mathematically inaudible: unity up to 0.85, then a smooth bend that
// asymptotes at 0.995 so no transient stack can hard-clip the DAC.
// 1.328125 = 0.85 / volumeGain(0.80). The volume sliders now start at 80%
// rather than pinned at maximum, so this restores the exact level the app was
// calibrated to: 1.328125 x 0.80^2 = 0.85, bit-for-bit what the master stage
// carried before. Pinning a volume control at its ceiling by default means the
// only direction a user can ever move it is down; starting at 80% leaves
// +3.9 dB of deliberate boost above the calibrated default, and the limiter
// and soft-clip guard below cover anyone who reaches for it. Measured after
// the per-preset level match, the loudest preset peaks at 0.749 at the
// default, so the extra travel is real headroom rather than a cliff.
masterGain.gain.value = 1.328125;
const masterLimiter = audioCtx.createDynamicsCompressor();
try {
    masterLimiter.threshold.value = -5.0;
    // Measuring the bus through dense pedalled passages shows this stage
    // holding 5-9 dB of gain reduction CONTINUOUSLY (worst on pfSoft, whose
    // recordings are the hottest), so it is not catching rare peaks — it is
    // shaping everything, and its timing constants become part of the sound.
    // A wider knee spreads that reduction over a gradual onset instead of a
    // corner the mix keeps crossing back and forth.
    masterLimiter.knee.value = 8.0;
    masterLimiter.ratio.value = 10.0;
    // 2 ms is shorter than one cycle of anything below ~500 Hz, so the old
    // attack tracked gain changes INSIDE the waveform of every bass note (A0
    // at 55 Hz has an 18 ms period). That is waveform distortion, not level
    // control, and dense low-register playing is exactly where it was worst.
    // 8 ms still follows a piano transient's envelope while staying longer
    // than the period of the lowest note on the keyboard.
    masterLimiter.attack.value = 0.008;
    // At 150 ms the gain visibly recovers between notes, which the ear hears
    // as pumping/breathing riding on the music. 400 ms is slow enough that
    // the movement stops registering as a separate sound.
    masterLimiter.release.value = 0.40;
} catch(e) {}
const masterSoftClip = audioCtx.createWaveShaper();
(function(){
    const N = 4096, curve = new Float32Array(N);
    const KNEE = 0.85, RANGE = 0.145; // ceiling = KNEE + RANGE = 0.995
    for(let i = 0; i < N; i++){
        const x = (i / (N - 1)) * 2 - 1;
        const a = Math.abs(x);
        // Identity below the knee (bit-transparent for normal playback);
        // tanh bend above it with a continuous first derivative at the knee.
        curve[i] = a <= KNEE ? x : Math.sign(x) * (KNEE + RANGE * Math.tanh((a - KNEE) / RANGE));
    }
    masterSoftClip.curve = curve;
    // The curve is identity for everything under the knee, so oversampling
    // only matters during rare overshoot; skip it on phones — the 2x/4x
    // resampler runs on the audio thread whether or not the curve bends,
    // and that budget is better spent on voices.
    try { masterSoftClip.oversample = IS_MOBILE_AUDIO ? 'none' : '2x'; } catch(e) {}
})();
// Phones skip the DynamicsCompressor stage entirely: with honest per-voice
// staging it barely engaged (mobile stress peaks ~0.8, under the soft-clip
// knee), and its per-sample envelope math is pure audio-thread cost — the
// budget the crackle comes out of. The guard curve still guarantees no
// hard clipping. Desktop keeps the limiter for extra polish.
if (IS_MOBILE_AUDIO) {
    masterGain.connect(masterSoftClip);
} else {
    masterGain.connect(masterLimiter);
    masterLimiter.connect(masterSoftClip);
}
masterSoftClip.connect(audioCtx.destination);
let reverbNode = null, reverbGain = null, reverbEnabled = false, currentSf = "grandPiano", currentStringSf = "strViolin", stringEnabled = false, sustainLevel = 1.00, reverbLevel = 0.0, pianoVolume = 0.80, stringVolume = 0.80;
// Slot IDs map 1:1 to soundfonts/pack/<slot>.sf2 (see soundfonts/pack/manifest.json).
// Labels drive the picker UI and the "Current" chip in the SoundFont panel.
const SOUNDFONT_LABELS = {
    grandPiano:'Grand Piano',
    stagePiano:'Stage Piano',
    sal1:'Concert Grand',
    atmosGrand:'Atmos Grand',
    pfBright:'Bright Grand',
    pfSoft:'Soft Piano',
    pfEPiano:'E-Piano',
    strViolin:'Violin',
    strCello:'Cello',
    strEnsemble:'Strings',
    strSlow:'Slow Strings',
    strPizz:'Pizzicato',
    orcHorn:'French Horns',
    orcTrumpet:'Trumpet',
    orcTrombone:'Trombone',
    orcFlute:'Flute',
    orcTimpani:'Timpani',
    othNylon:'Nylon Guitar',
    othSteel:'Steel Guitar',
    othBass:'Fingered Bass',
    othVibraphone:'Vibraphone',
    othMarimba:'Marimba',
    othChoir:'Choir Aahs',
    othOrgan:'Church Organ'
};
function getSoundfontName(sfKey){
    return SOUNDFONT_LABELS[sfKey] || 'SoundFont';
}
function syncInstrumentStateIfReady(){
    if(window.PapianoMultiplayer && typeof window.PapianoMultiplayer.syncInstrument === 'function') window.PapianoMultiplayer.syncInstrument();
}
function updateSoundfontPickerUI(){
    const mainCurrent = document.getElementById('mainSfCurrent');
    const layerCurrent = document.getElementById('layerSfCurrent');
    if(mainCurrent) mainCurrent.textContent = getSoundfontName(currentSf);
    if(layerCurrent) layerCurrent.textContent = getSoundfontName(currentStringSf);
    document.querySelectorAll('.sf-option[data-layer="piano"]').forEach(btn => btn.classList.toggle('active', btn.dataset.sfKey === currentSf));
    document.querySelectorAll('.sf-option[data-layer="string"]').forEach(btn => btn.classList.toggle('active', btn.dataset.sfKey === currentStringSf));
}
let midiSustainPedalDown = false;
let manualSustainEnabled = false;
// Spacebar-held sustain (QWERTY mode) -- distinct from manualSustainEnabled
// (the persistent mouse-click latch) so holding space can only ever ADD
// sustain, never remove it. See setSpaceSustain below for why.
let spaceSustainHeld = false;
const midiPedalHeldNotes = new Set();
// Voices whose release was scheduled with a long sustain-driven decay (key
// released, or re-struck, while manual/pedal sustain was on) — tracked
// separately from midiPedalHeldNotes (hardware-MIDI-only) because mouse,
// touch and QWERTY input never populated that set, so turning sustain off
// never cut their tails short: they just rang out along their original
// (up to ~15s) release curve. Cleared/force-stopped in lockstep with it.
// Maps a key to the LIST of tails it is currently holding open, not to a
// single voice. A key re-struck under the pedal leaves its previous tail
// ringing on purpose (damper-up restrike, see fastReleaseActiveKey) and
// running passages restrike the same key many times, so a one-voice-per-key
// map silently forgot every tail but the newest — those forgotten voices then
// ignored pedal-up entirely and rang out their full ~15 s release, piling
// undamped energy into the master bus for the rest of the passage.
const sustainTailVoices = new Map();
function trackSustainTail(key, voice){
    if (!voice) return;
    let list = sustainTailVoices.get(key);
    if (!list) { list = []; sustainTailVoices.set(key, list); }
    // Drop finished tails first so a repeatedly re-struck key can't grow the
    // list without bound over a long passage.
    for (let i = list.length - 1; i >= 0; i--) if (!list[i] || list[i].ended) list.splice(i, 1);
    if (list.indexOf(voice) === -1) list.push(voice);
}
function forgetSustainTail(key, voice){
    if (voice === undefined) { sustainTailVoices.delete(key); return; }
    const list = sustainTailVoices.get(key);
    if (!list) return;
    const i = list.indexOf(voice);
    if (i !== -1) list.splice(i, 1);
    if (!list.length) sustainTailVoices.delete(key);
}
function getActivePianoSustain(){
    return (manualSustainEnabled || midiSustainPedalDown || spaceSustainHeld) ? Math.max(0, Math.min(1, sustainLevel || 0)) : 0;
}
function releaseMidiPedalHeldNotes(when){
    if(midiPedalHeldNotes.size){
        const notes = Array.from(midiPedalHeldNotes);
        midiPedalHeldNotes.clear();
        notes.forEach(note => stopNote(note, false, when));
    }
    if(sustainTailVoices.size){
        const voices = [];
        sustainTailVoices.forEach(list => { if (list) for (let i = 0; i < list.length; i++) voices.push(list[i]); });
        sustainTailVoices.clear();
        const quick = getReleaseProfile(false, 0);
        voices.forEach(voice => forceQuickStop(voice, quick.tc, quick.delay));
    }
}
function refreshSustainButton(){
    const active = !!(manualSustainEnabled || midiSustainPedalDown || spaceSustainHeld);
    const midiOnly = !!(!manualSustainEnabled && midiSustainPedalDown);
    const btn = document.getElementById('holdBtn');
    if(btn){
        btn.classList.toggle('active', active);
        btn.classList.toggle('midi-sustain-active', midiOnly);
        btn.title = midiOnly ? 'Sustain: MIDI pedal ON' : (manualSustainEnabled ? 'Sustain: Manual ON' : 'Sustain');
    }
    const settingsBtn = document.getElementById('settingsSustainBtn');
    if(settingsBtn){
        settingsBtn.classList.toggle('active', active);
        settingsBtn.classList.toggle('midi-sustain-active', midiOnly);
        settingsBtn.title = midiOnly ? 'Sustain: MIDI pedal ON' : (manualSustainEnabled ? 'Sustain: Manual ON' : 'Sustain');
    }
}
function setManualSustain(enabled){
    const wasActive = manualSustainEnabled || midiSustainPedalDown || spaceSustainHeld;
    manualSustainEnabled = !!enabled;
    refreshSustainButton();
    if(wasActive && !manualSustainEnabled && !midiSustainPedalDown && !spaceSustainHeld) releaseMidiPedalHeldNotes();
    if(window.PapianoMultiplayer && typeof window.PapianoMultiplayer.sendSustainState === 'function') window.PapianoMultiplayer.sendSustainState();
}
function setMidiSustainPedal(down, when){
    const wasActive = manualSustainEnabled || midiSustainPedalDown || spaceSustainHeld;
    midiSustainPedalDown = !!down;
    refreshSustainButton();
    if(wasActive && !manualSustainEnabled && !midiSustainPedalDown && !spaceSustainHeld) releaseMidiPedalHeldNotes(when);
    if(window.PapianoMultiplayer && typeof window.PapianoMultiplayer.sendSustainState === 'function') window.PapianoMultiplayer.sendSustainState();
}
// Space (QWERTY mode) can only ADD sustain on top of whatever's already
// active, never remove it -- holding space while manualSustainEnabled or
// midiSustainPedalDown is already true is a no-op (sustain was already on),
// and releasing space only cuts it off if nothing else is still holding it
// active. This is deliberately NOT a toggle/invert: the effect of holding
// space never depends on remembering what state sustain was already in,
// matching a real pedal (pressing it never un-sustains a note that's
// already ringing for some other reason).
function setSpaceSustain(down){
    const wasActive = manualSustainEnabled || midiSustainPedalDown || spaceSustainHeld;
    spaceSustainHeld = !!down;
    isSus = manualSustainEnabled || midiSustainPedalDown || spaceSustainHeld;
    refreshSustainButton();
    if(wasActive && !manualSustainEnabled && !midiSustainPedalDown && !spaceSustainHeld) releaseMidiPedalHeldNotes();
    if(window.PapianoMultiplayer && typeof window.PapianoMultiplayer.sendSustainState === 'function') window.PapianoMultiplayer.sendSustainState();
}
// Sustain button (click mode) toggle. If sustain is active for ANY reason —
// including a MIDI pedal whose "up" was never received and got stuck down —
// a click force-clears everything so the user can always turn it off. (Before,
// a stuck MIDI flag made the click button unable to disable sustain; only a
// reload fixed it.)
function toggleSustainHold(){
    if(manualSustainEnabled || midiSustainPedalDown){
        manualSustainEnabled = false;
        midiSustainPedalDown = false;
        isSus = false;
        refreshSustainButton();
        releaseMidiPedalHeldNotes();
        if(window.PapianoMultiplayer && typeof window.PapianoMultiplayer.sendSustainState === 'function') window.PapianoMultiplayer.sendSustainState();
    } else {
        setManualSustain(true);
        isSus = true;
    }
}
let stringRangeLeft = 21;
let stringRangeRight = 108;
const sfEffectSettings = {
    // Reverb ships OFF. It is the single most expensive node in the audio
    // graph — benchmarked at more cost than sixty simultaneous voices — and
    // being on by default meant every user paid for it on every note whether
    // or not they wanted the effect. Still one slider away for anyone who does.
    sf1: { sustain: 1.00, reverb: 0.00 },
    sf2: { fadeSec: 5.00, reverb: 0.00, transpose: 0 }
};
let sfBuffers = {};
let stringBuffers = {};
let loadedSfKey = null;
let stringLoadedSfKey = null;


// Room impulse for the reverb send (on by default at 0.30, so this colours
// every note). The previous impulse was raw, FULL-SCALE white noise under a
// power-law fade — undamped broadband hiss for the entire 2.2 s tail.
// Convolving a piano with that adds a fizzy, grainy wash: measured on the
// master bus through a dense pedalled passage, it multiplied the largest
// sample-to-sample step by 5x on grandPiano (0.102 -> 0.547) and by 1.3x on
// pfSoft. Grain like that riding on every note is exactly what "crackle"
// sounds like, and it is worst on soft/sustained presets where the wash is
// loud relative to the dry signal.
//
// A real room absorbs high frequencies far faster than low ones, so build the
// tail as noise through a one-pole lowpass whose cutoff keeps falling as the
// tail decays, under an exponential (not power-law) envelope, after a short
// pre-delay that keeps the wash off the attack transient.
//
// Length matters for more than taste. Benchmarking this graph offline (wall
// clock per second of rendered audio) puts the 2.2 s convolution at ~23 ms/s
// against ~25 ms/s for SIXTY simultaneous stereo voices — the reverb was
// costing about as much as the entire rest of the instrument, on every
// preset, whether or not the passage was dense, because the send defaults to
// 0.30. A 1.4 s room is still a natural piano space and cuts that by ~30%.
// (An algorithmic comb/allpass network was prototyped as a replacement and
// only saved a further ~6 ms/s for a full rewrite's worth of tonal risk, so
// convolution stays.)
//
// The impulse is normalised here instead of by ConvolverNode.normalize. For a
// noise-like impulse the convolution's output RMS scales with the impulse's
// L2 norm, so pinning that norm makes the wet level identical no matter how
// the tail is shaped. Chrome's own normalize pass keys off the impulse's
// power, which made this damped tail markedly LOUDER than the bright one it
// replaces — measured as the master peak rising on every preset, and that
// extra level pushed the soft-clip stage into audible saturation, which is
// itself a grain source. Shaping and loudness have to stay independent.
function buildReverb() {
    if (reverbNode) return;
    const sr = audioCtx.sampleRate;
    const len = Math.floor(sr * 1.4);
    const pre = Math.floor(sr * 0.012);
    const buf = audioCtx.createBuffer(2, len, sr);
    for (let c = 0; c < 2; c++) {
        const d = buf.getChannelData(c);
        let lp = 0, energy = 0;
        for (let i = pre; i < len; i++) {
            const t = (i - pre) / (len - pre);
            lp += (0.34 - 0.28 * t) * ((Math.random() * 2 - 1) - lp);
            d[i] = lp * Math.exp(-6.2 * t);
            energy += d[i] * d[i];
        }
        const norm = energy > 0 ? 1 / Math.sqrt(energy) : 1;
        for (let i = pre; i < len; i++) d[i] *= norm;
    }
    reverbNode = audioCtx.createConvolver();
    reverbNode.normalize = false;
    reverbNode.buffer = buf;
    reverbGain = audioCtx.createGain(); reverbGain.gain.value = 0.65;
    reverbNode.connect(reverbGain); reverbGain.connect(masterGain);
}

const activeNotes = new Map();

function midiNoteToName(midi) {
    const names = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
    const oct = Math.floor(midi / 12) - 1;
    return names[midi % 12] + oct;
}

const STRING_TUTS_MIN = 1;
const STRING_TUTS_MAX = 88;
const STRING_TUTS_MIDI_OFFSET = 20;
const STRING_RANGE_SETTINGS_VERSION = 2;
// Bumped when the strike-line / particle engine is recalibrated so that saved
// slider percentages from the OLD engine (which mapped to a different visual
// scale) are re-baselined to the new defaults instead of silently producing a
// washed-out effect. User colour choices are always kept.
const FX_SETTINGS_VERSION = 4;

function clampStringTuts(value, fallback){
    const parsed = Math.round(Number(value));
    const safe = Number.isFinite(parsed) ? parsed : fallback;
    return Math.max(STRING_TUTS_MIN, Math.min(STRING_TUTS_MAX, safe));
}
function midiToTuts(midi){
    return clampStringTuts((Number(midi) || 0) - STRING_TUTS_MIDI_OFFSET, 1);
}
function tutsToMidi(tuts){
    return clampStringTuts(tuts, 1) + STRING_TUTS_MIDI_OFFSET;
}
function clampStringRange(){
    let leftTuts = midiToTuts(stringRangeLeft || 21);
    let rightTuts = midiToTuts(stringRangeRight || 108);
    if (leftTuts > rightTuts) {
        const swap = leftTuts;
        leftTuts = rightTuts;
        rightTuts = swap;
    }
    stringRangeLeft = tutsToMidi(leftTuts);
    stringRangeRight = tutsToMidi(rightTuts);
}
function updateStringRangeUI(){
    clampStringRange();
    const leftTuts = midiToTuts(stringRangeLeft);
    const rightTuts = midiToTuts(stringRangeRight);
    const leftPct = ((leftTuts - STRING_TUTS_MIN) / (STRING_TUTS_MAX - STRING_TUTS_MIN)) * 100;
    const rightPct = ((rightTuts - STRING_TUTS_MIN) / (STRING_TUTS_MAX - STRING_TUTS_MIN)) * 100;
    const val = document.getElementById('stringRangeVal');
    const leftInput = document.getElementById('stringLeftTutsRange');
    const rightInput = document.getElementById('stringRightTutsRange');
    const leftLabel = document.getElementById('stringLeftTutsLabel');
    const rightLabel = document.getElementById('stringRightTutsLabel');
    const slider = document.getElementById('stringRangeSlider');
    if (val) val.textContent = 'Keys ' + leftTuts + ' - ' + rightTuts;
    if (leftInput && leftInput.value !== String(leftTuts)) leftInput.value = leftTuts;
    if (rightInput && rightInput.value !== String(rightTuts)) rightInput.value = rightTuts;
    if (leftLabel) leftLabel.textContent = 'L ' + midiNoteToName(stringRangeLeft);
    if (rightLabel) rightLabel.textContent = 'R ' + midiNoteToName(stringRangeRight);
    if (slider) {
        slider.style.setProperty('--string-range-left', leftPct + '%');
        slider.style.setProperty('--string-range-right', rightPct + '%');
    }
}
function isMidiInStringRange(midi){
    clampStringRange();
    return midi >= stringRangeLeft && midi <= stringRangeRight;
}
function setStringRangeTuts(edge, value){
    let leftTuts = midiToTuts(stringRangeLeft);
    let rightTuts = midiToTuts(stringRangeRight);
    const next = clampStringTuts(value, edge === 'left' ? leftTuts : rightTuts);
    if (edge === 'left') leftTuts = Math.min(next, rightTuts);
    else rightTuts = Math.max(next, leftTuts);
    stringRangeLeft = tutsToMidi(leftTuts);
    stringRangeRight = tutsToMidi(rightTuts);
    updateStringRangeUI();
}
function bindStringRangeSliders(){
    const leftInput = document.getElementById('stringLeftTutsRange');
    const rightInput = document.getElementById('stringRightTutsRange');
    if (leftInput) leftInput.oninput = e => setStringRangeTuts('left', e.target.value);
    if (rightInput) rightInput.oninput = e => setStringRangeTuts('right', e.target.value);
}

const soundfontBufferCache = new Map();
// A single decoded piano SF2 holds ~100-190 MB of Float32 PCM. Keeping four
// of them cached (~0.5-0.75 GB) pushes a phone's renderer into memory
// pressure — zram/paging stalls that surface as audio crackle even at
// normal playing tempo, and got worse the more soundfonts the user tried.
// Phones keep only the active font; desktop keeps the convenience cache.
const MAX_CACHED_SOUNDFONTS = IS_MOBILE_AUDIO ? 1 : 4;
const soundfontLoadSeq = { piano: 0, string: 0 };
const SOUNDFONT_LOAD_TIMEOUT_MS = 10000;

function countBufferMap(buffers){ return Object.keys(buffers || {}).length; }

function cloneBufferMap(buffers) {
    return Object.assign({}, buffers || {});
}

function getLayerBuffers(layer) {
    return layer === 'string' ? stringBuffers : sfBuffers;
}

function setLayerBuffers(layer, buffers, sfKey) {
    if (layer === 'string') {
        stringBuffers = cloneBufferMap(buffers);
        stringLoadedSfKey = sfKey;
    } else {
        sfBuffers = cloneBufferMap(buffers);
        loadedSfKey = sfKey;
    }
}

function getLoadedKey(layer) {
    return layer === 'string' ? stringLoadedSfKey : loadedSfKey;
}

function cacheSoundfontBuffers(sfKey, buffers) {
    if (!sfKey || !buffers || countBufferMap(buffers) === 0) return;
    if (soundfontBufferCache.has(sfKey)) soundfontBufferCache.delete(sfKey);
    soundfontBufferCache.set(sfKey, cloneBufferMap(buffers));
    while (soundfontBufferCache.size > MAX_CACHED_SOUNDFONTS) {
        const oldestKey = soundfontBufferCache.keys().next().value;
        soundfontBufferCache.delete(oldestKey);
    }
}

function useCachedSoundfont(sfKey, layer='piano') {
    if (!soundfontBufferCache.has(sfKey)) return false;
    const cached = soundfontBufferCache.get(sfKey);
    soundfontBufferCache.delete(sfKey);
    soundfontBufferCache.set(sfKey, cached);
    setLayerBuffers(layer, cached, sfKey);
    return countBufferMap(getLayerBuffers(layer)) > 0;
}

function decodeAndStoreBuffers(pianoData, onProgress, onDone, sfKeyForCache, layer='piano') {
    const targetBuffers = {};
    const notes = Object.keys(pianoData || {});
    let decoded = 0;
    const total = notes.length;
    let finished = false;
    const finishOne = () => {
        if (finished) return;
        decoded++;
        if (onProgress) onProgress(decoded, total);
        if (decoded >= total) {
            finished = true;
            cacheSoundfontBuffers(sfKeyForCache, targetBuffers);
            setLayerBuffers(layer, targetBuffers, sfKeyForCache);
            if (onDone) onDone(countBufferMap(targetBuffers) > 0);
        }
    };
    if (total === 0) { if(onDone) onDone(false); return; }
    notes.forEach(note => {
        try {
            const dataUri = pianoData[note];
            const b64 = dataUri && dataUri.split(',')[1];
            if (!b64) { finishOne(); return; }
            const bin = atob(b64);
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            audioCtx.decodeAudioData(bytes.buffer.slice(0),
                buf => { targetBuffers[note] = optimizeSampleBuffer(buf); finishOne(); },
                () => { finishOne(); }
            );
        } catch(e) { finishOne(); }
    });
}

// ---- Local SF2 loader ----
// Each soundfont slot points to a self-contained single-preset .sf2 hosted in
// this repo (soundfonts/pack/*.sf2). The shared parser in
// js/shared/sf2-loader.js runs entirely in the browser, so nothing leaves the
// device. Buffer map entries carry rate/gainMul/loop metadata that
// playSfBuffer honours for indefinite sustain on held keys.
//
// Source packs — see soundfonts/pack/manifest.json for per-slot attribution
// (mostly FluidR3 GM/GM2, Frank Wen, MIT, split per instrument by
// bin/split-sf2.js; a few slots are user-provided piano SF2s used as-is).
const SF2_LOAD_TIMEOUT_MS = 60000;

function loadLocalSf2(url, onProgress, signal){
    if (!window.PapianoSF2) return Promise.reject(new Error('SF2 module missing'));
    // fetchCached persists the raw bytes across reloads (IndexedDB,
    // ETag/Last-Modified validated) instead of relying on the browser's own
    // HTTP disk cache -- see js/shared/sf2-loader.js for why. Same
    // progress-callback/AbortSignal contract as the raw fetch this replaced.
    return window.PapianoSF2.fetchCached(url, onProgress, signal).then(arrayBuffer => {
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const res = window.PapianoSF2.buildBufferMap(arrayBuffer, audioCtx, { mono: IS_MOBILE_AUDIO });
        return res && res.map ? res.map : null;
    });
}

// Phones: fold freshly decoded stereo MP3 samples (Concert Grand, legacy
// script soundfonts) down to mono — half the PCM heap, half the per-voice
// audio-thread work — and cap unlooped recordings at 15 s (fade over the
// final 1.5 s). Salamander bass notes ring 30-45 s per file; on a phone
// that is pure memory cost for a tail nobody hears under real playing.
// Desktop keeps the full stereo recordings untouched.
const MOBILE_SAMPLE_MAX_SEC = 15;
function optimizeSampleBuffer(buf){
    if (!IS_MOBILE_AUDIO || !buf) return buf;
    const maxLen = Math.floor(MOBILE_SAMPLE_MAX_SEC * buf.sampleRate);
    const outLen = Math.min(buf.length, maxLen);
    if (buf.numberOfChannels === 1 && outLen === buf.length) return buf;
    const mono = audioCtx.createBuffer(1, outLen, buf.sampleRate);
    const d = mono.getChannelData(0);
    const l = buf.getChannelData(0);
    const r = buf.numberOfChannels > 1 ? buf.getChannelData(1) : null;
    if (r) { for (let i = 0; i < outLen; i++) d[i] = (l[i] + r[i]) * 0.5; }
    else d.set(l.subarray(0, outLen));
    if (outLen < buf.length) {
        const fade = Math.min(outLen, Math.floor(1.5 * buf.sampleRate));
        for (let i = 0; i < fade; i++) d[outLen - 1 - i] *= i / fade;
    }
    return mono;
}

function loadSoundfont(sfKey, url, callback, layer='piano') {
    loadSoundfontWithProgress(sfKey, url, null, ok => { if(callback) callback(ok); }, layer);
}

function loadSoundfontWithProgress(sfKey, url, onProgress, onDone, layer='piano', signal) {
    const isReady = () => getLoadedKey(layer) === sfKey && countBufferMap(getLayerBuffers(layer)) > 0;
    if (isReady()) { if(onDone) onDone(true); return; }
    if (useCachedSoundfont(sfKey, layer)) {
        const total = countBufferMap(getLayerBuffers(layer));
        if (onProgress) onProgress(total, total);
        if (onDone) onDone(total > 0);
        return;
    }

    const seq = ++soundfontLoadSeq[layer];
    let settled = false;
    let timeoutId = 0;
    const done = ok => {
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
        // Custom SF2 preset dispatch. The URL is a synthetic
        // "usersf2:BANK:PROGRAM" string registered by the Custom SF2 picker
        // when the user opened a file; the raw ArrayBuffer lives on
        // window.__papianoCustomSf2 so this branch can build the buffer map
        // without another round-trip through the network. The parse itself
        // is CPU-bound, so we schedule it on the next task tick to keep the
        // UI responsive during multi-hundred-MB files.
        const state = window.__papianoCustomSf2;
        const parts = url.split(':');
        const bank = parts.length >= 3 ? parseInt(parts[1], 10) : NaN;
        const program = parts.length >= 3 ? parseInt(parts[2], 10) : NaN;
        if (!state || !state.arrayBuffer || !Number.isFinite(bank) || !Number.isFinite(program)){
            done(false);
            return;
        }
        if (onProgress) onProgress(1, 100);
        timeoutId = setTimeout(() => done(false), 45000);
        setTimeout(() => {
            if (settled || seq !== soundfontLoadSeq[layer]) return;
            try {
                if (audioCtx.state === 'suspended') audioCtx.resume();
                const res = window.PapianoSF2.buildBufferMap(state.arrayBuffer, audioCtx, { bank, program, mono: IS_MOBILE_AUDIO });
                if (res && res.map){
                    cacheSoundfontBuffers(sfKey, res.map);
                    setLayerBuffers(layer, res.map, sfKey);
                    if (onProgress) onProgress(100, 100);
                    done(true);
                } else {
                    done(false);
                }
            } catch(e){
                done(false);
            }
        }, 40);
        return;
    }

    if (typeof url === 'string' && /\.sf2($|\?)/i.test(url)) {
        // On-demand SF2 fetch. Only one preset is loaded at a time; the
        // browser progress bar tracks the raw byte download and the parse
        // step reports as complete once the AudioBuffers are built.
        timeoutId = setTimeout(() => done(false), SF2_LOAD_TIMEOUT_MS);
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

    const oldScript = document.getElementById('sf-script-' + layer);
    if (oldScript) oldScript.remove();
    if (!window.MIDI) window.MIDI = {};
    window.MIDI.Soundfont = {};

    const script = document.createElement('script');
    script.id = 'sf-script-' + layer;
    script.src = url;

    timeoutId = setTimeout(() => {
        try { script.remove(); } catch(e) {}
        done(false);
    }, SOUNDFONT_LOAD_TIMEOUT_MS);

    script.onload = () => {
        if (seq !== soundfontLoadSeq[layer]) return;
        const sfData = window.MIDI && window.MIDI.Soundfont;
        const key = sfData && Object.keys(sfData)[0];
        if (key && sfData[key]) {
            decodeAndStoreBuffers(sfData[key], onProgress, ok => done(ok), sfKey, layer);
            return;
        }
        done(false);
    };
    script.onerror = () => done(false);
    document.head.appendChild(script);
}

// Perceptual velocity curve. The raw MIDI velocity used to feed the gain
// linearly, which compresses the musical dynamic range into ~2 dB between
// mf and ff and makes every touch sound loud and aggressive. A quadratic
// amplitude curve (~ the SF2/FluidSynth convention) restores ~24 dB of
// span between pp and ff while keeping ff at full level; the small floor
// keeps pianissimo audible on phone speakers.
function velocityGain(vel){
    const v = Math.max(0, Math.min(1, vel || 0.8));
    return 0.06 + 0.94 * v * v;
}

// Perceptual volume taper. The Main/Layer Volume sliders used to feed the
// 0-100 position straight in as the linear amplitude multiplier, so 100%
// -> 50% was only a ~6 dB drop (barely noticeable) while 50% -> 0% covered
// the rest of the audible range in one jump — the ear hears loudness on a
// roughly logarithmic (dB) scale, not a linear amplitude one. This maps the
// slider position through an exponential (dB-linear) curve, spreading
// perceived loudness evenly across the whole travel, the same idea as
// velocityGain above but for the volume sliders instead of key velocity.
// Fader law for the Main / Layer Volume sliders: a square law, which is what
// mixing-console faders approximate and what people expect a volume control to
// feel like.
//
// This replaces a linear-in-dB curve spanning 50 dB, which put the halfway
// point at -25 dB — 5.6% amplitude, practically silent — so the entire usable
// range was crammed into the top third of the travel and the bottom two thirds
// all sounded like "off":
//
//     slider      old            new
//     100%        0.0 dB         0.0 dB
//      75%      -12.5 dB        -5.0 dB
//      50%      -25.0 dB       -12.0 dB
//      25%      -37.5 dB       -24.1 dB
//
// -12 dB at the midpoint is very close to the ~10 dB that halves perceived
// loudness, so the slider at half now sounds about half as loud, and the top
// of the travel has fine control instead of a cliff. Full scale is unchanged
// at exactly 1.0, so the default (100%) sounds identical to before — only the
// positions in between move.
function volumeGain(t){
    const c = Math.max(0, Math.min(1, t));
    if (c <= 0) return 0;
    return c * c;
}

// Per-preset output trim.
//
// Measured on one identical passage (Op.25/1-shaped: wide arpeggio waves in
// both hands, pedal held, accented melody on top) with master gain pinned at
// unity, the packaged piano presets do not sit anywhere near each other:
//
//     salamander  -21.9 dBFS RMS   peak 0.503
//     atmosGrand  -18.8            peak 0.596
//     grandPiano  -18.6            peak 0.707
//     pfSoft      -15.5            peak 0.863
//     pfBright    -14.5            peak 0.876
//     stagePiano  -14.5            peak 0.901
//     pfEPiano    -11.8            peak 0.966
//
// That is a 10 dB spread, so changing soundfont was a large, unpredictable
// jump in loudness — and it is also why the master could not simply be turned
// up: pfEPiano already had 0.3 dB of headroom left, so a flat boost would have
// driven it into the limiter and the soft clip. Distortion-by-loudness is
// exactly the failure this chain was rebuilt to get away from (see the master
// chain notes above), and a global gain would have walked straight back into
// it for the hottest presets while leaving the quietest ones still too soft.
//
// Trimming each preset to a common RMS target fixes both at once: the level
// rises where there is room to rise, and every preset lands on top of every
// other. Re-measured on the same passage at the shipping 0.85 master gain
// after two fitting passes, the spread collapses from 10.1 dB to 0.6 dB
// (-16.9 to -17.5 dBFS RMS), peaks sit between 0.57 and 0.75, and NO preset
// produces a single clipped sample or even one sample inside the soft-clip
// bend. The default preset ends up +2.5 dB louder than before; the hottest
// comes down 6.6 dB, so changing soundfont is no longer a jump in loudness.
// Presets not listed (strings, orchestral, the "other" pack) are
// left at unity: they were not measured on this passage, and several of them
// sustain indefinitely, so an RMS target taken from piano material would not
// describe them correctly.
const SF_LEVEL_TRIM = {
    grandPiano: 1.35,
    stagePiano: 0.74,
    salamander: 1.86,
    atmosGrand: 1.35,
    pfBright:   0.77,
    pfSoft:     0.91,
    pfEPiano:   0.47
};
function sfLevelTrim(sfKey){
    const t = SF_LEVEL_TRIM[sfKey];
    return (typeof t === 'number' && t > 0) ? t : 1;
}
function playSfBuffer(soundMidi, vel, activeKey, layer='piano', when) {
    // Boot gate: while the stage loader is still visible the buffers may be
    // half-built and hitting audioCtx.createBufferSource() in rapid bursts is
    // the root cause of the "mash-keys-before-ready lag". Silently drop until
    // the loader flips this flag on dismiss.
    if (!window.__papianoStageReady) return false;
    const buffers = getLayerBuffers(layer);
    const noteName = midiNoteToName(soundMidi);
    const entry = buffers[noteName];
    if (!entry) return false;
    // SF2 entries expose {buffer, rate, gainMul, loop, loopStart, loopEnd,
    // env}; legacy renderers may hand back bare AudioBuffers, so accept both.
    const buf = entry.buffer || entry;
    const src = audioCtx.createBufferSource();
    src.buffer = buf;
    if (entry.rate && entry.rate !== 1) src.playbackRate.value = entry.rate;
    // User-loaded SF2 zones can carry loop points: with the source looping, a
    // held or pedalled note sustains indefinitely, and the engine's release
    // envelope still shapes the tail on note-off.
    if (entry.loop) {
        src.loop = true;
        src.loopStart = entry.loopStart;
        src.loopEnd = entry.loopEnd;
    }
    const gainNode = audioCtx.createGain();
    const fx = layer === 'string' ? sfEffectSettings.sf2 : sfEffectSettings.sf1;
    const volume = volumeGain(layer === 'string' ? stringVolume : pianoVolume);
    // Per-voice ceiling: an ff piano note peaks just under full scale BEFORE
    // the 0.85 master headroom, so a single note never needs the limiter and
    // dense material reaches it gradually instead of arriving pre-clipped
    // (the old 1.5 boost put every forte note ~3.5 dB over full scale).
    const layerBoost = layer === 'string' ? 0.7 : 1.15;
    // `when` (audio-clock seconds) lets the MIDI-file player schedule the
    // onset sample-accurately instead of quantizing it to the rAF tick.
    const now = Math.max(audioCtx.currentTime, when || 0);
    // sfLevelTrim equalises the packaged presets against each other; without it
    // the same passage runs 10 dB louder on one soundfont than another.
    const trim = sfLevelTrim(layer === 'string' ? currentStringSf : currentSf);
    const peak = Math.max(0.0002, velocityGain(vel) * layerBoost * volume * (entry.gainMul || 1) * trim);
    // Tiny attack ramp instead of an instant jump — a hard step on the first
    // sample is an audible click/crackle, especially on fast repeated notes.
    gainNode.gain.setValueAtTime(0.0001, now);
    gainNode.gain.linearRampToValueAtTime(peak, now + 0.006);
    let envSilentAt = 0;
    let voiceNaturalEndAt = Infinity;
    if (entry.env) {
        // SF2 volume envelope: hold at peak, then decay toward the sustain
        // level. SF2 decay is a linear-in-dB ramp spanning 100 dB over
        // decaySec — exactly an exponential in amplitude, so setTargetAtTime
        // with tc = decaySec * 8.686/100 reproduces it. Without this, looped
        // piano presets rang forever at constant level under the pedal,
        // piling energy into the master bus on dense passages.
        const holdEnd = now + 0.006 + entry.env.holdSec;
        const decayTc = Math.max(0.05, entry.env.decaySec * 0.08686);
        gainNode.gain.setTargetAtTime(Math.max(0.0001, peak * entry.env.susLin), holdEnd, decayTc);
        // Envelope decaying to silence: past hold + 6.9 tc the voice is below
        // -60 dB, so enforceVoiceLimit may reclaim it (a source can only take
        // one stop() call, so the reclaim is a lazy sweep, not an early stop).
        if (entry.env.susLin < 0.001) envSilentAt = holdEnd + decayTc * 6.9 + 0.25;
    }
    // A non-looped sample can only ever play once through -- nothing (a long
    // sustain release, or even just holding the key with no release at all)
    // can make it ring past its own recorded length. Several of the piano
    // presets here are short one-shot recordings with NO sustainVolEnv
    // authored at all (grandPiano/stagePiano: 0 cB, i.e. no `entry.env`
    // above) or one too slow to matter within the sample's length
    // (salamander: -30dB over a 60s decay, barely moved within a 2-5s
    // buffer) -- so without this, the voice played at a constant, undecayed
    // level right up until AudioBufferSourceNode simply ran out of PCM data
    // and stopped, mid-waveform, on its own. That's audible as a click (the
    // stop essentially never lands on a zero-crossing) plus the note just
    // vanishing -- and every treble note is a short recording (grandPiano's
    // C7-C8 is 3.68s; salamander's C8 is 1.99s), so it doesn't take a long
    // sustain to reach it. Schedule a fade that completes strictly before
    // the buffer's natural end regardless of what release profile (if any)
    // ever gets applied later; a real release still overrides this via its
    // own cancelScheduledValues, same as it already overrides the env decay
    // above.
    if (!entry.loop) {
        const naturalDurSec = buf.duration / (entry.rate || 1);
        voiceNaturalEndAt = now + naturalDurSec;
        const fadeLead = Math.min(0.6, Math.max(0.05, naturalDurSec * 0.08));
        const fadeStartAt = Math.max(now + 0.02, voiceNaturalEndAt - fadeLead);
        gainNode.gain.setTargetAtTime(0.0001, fadeStartAt, fadeLead / 5);
    }
    // SF2-authored lowpass: without this the raw sample spectrum plays back
    // brighter/harsher than the preset author intended (see filterHz notes
    // in sf2-loader.js) — this is the main fix for soundfont output sounding
    // thin/shrill ("cempreng") next to spec-complete players.
    // Kept on the voice so disconnectVoiceNodes() can unwire the whole chain
    // when the source ends, instead of leaving it summed into masterGain / the
    // reverb bus until GC notices.
    let filterNode = null;
    let sendGain = null;
    if (entry.filterHz) {
        filterNode = audioCtx.createBiquadFilter();
        filterNode.type = 'lowpass';
        filterNode.frequency.value = entry.filterHz;
        filterNode.Q.value = entry.filterQ || 0.707;
        src.connect(filterNode);
        filterNode.connect(gainNode);
    } else {
        src.connect(gainNode);
    }
    gainNode.connect(masterGain);
    if ((fx.reverb || 0) > 0) {
        if (!reverbNode) buildReverb();
        if (reverbNode) {
            sendGain = audioCtx.createGain();
            sendGain.gain.value = Math.min(0.85, Math.max(0, fx.reverb * 0.85));
            gainNode.connect(sendGain);
            sendGain.connect(reverbNode);
        }
    }
    const key = activeKey ?? soundMidi;
    const voice = {
        key,
        layer,
        sustain: layer === 'string' ? 0 : (fx.sustain || 0),
        fadeSec: layer === 'string' ? (fx.fadeSec || STRING_FADE_DEFAULT) : 0,
        masterGain: gainNode,
        filterNode,
        sendGain,
        oscillators: [],
        released: false,
        sfSrc: src,
        startedAt: now,
        silentAt: envSilentAt,
        naturalEndAt: voiceNaturalEndAt,
        ended: false
    };
    src.onended = () => cleanupVoiceRef(voice);
    src.start(now);
    if (entry.loop) { try { src.stop(now + LOOPED_VOICE_SAFETY_MAX_SECONDS); } catch(e) {} }
    activeNotes.set(key, voice);
    activeVoices.push(voice);
    enforceVoiceLimit();
    return true;
}

let activeVoices = [];
// Strings double the voice count (piano + string per key) and their tails ring
// for the whole fade, so 42 was reclaimed constantly during normal play. With
// pedal-held tails now ringing out fully (jazz/classical pedalling), 64 was
// still reclaiming audible sustain; 96 gives those tails room to finish.
// Buffer-source voices live on the audio thread so this does not touch FPS.
// (IS_MOBILE_AUDIO is declared next to the master chain, which also uses it.)
// Phones underrun the audio thread well before 96 simultaneous buffer
// sources (each with its own gain envelope) — that underrun IS an audible
// glitch/crackle no matter how clean the gain staging is. 40 (down from 56,
// which still crackled on a Snapdragon 860 during normal-tempo songs) is in
// line with what the web pianos that stay glitch-free on phones actually
// run; with the decay envelope + steal fades the reduction is inaudible.
// Desktop keeps the full pool.
// Desktop was 96. With the cap finally being enforced (see stealVoice) that
// number stopped being notional and became a real steady-state load: the same
// offline benchmark puts each extra stereo voice at ~0.39 ms of CPU per second
// of audio, so 96 -> 76 hands back ~8 ms/s — on the order of what shortening
// the reverb saved — while still leaving far more simultaneous tails than the
// old code ever actually sustained cleanly.
const MAX_ACTIVE_VOICES = IS_MOBILE_AUDIO ? 40 : 76;
const MAX_RELEASE_SECONDS = 18.00;
// Looped presets (organ/pad-style soundfonts like Atmos Grand, whose
// sustainVolEnv is near 0 cB and so get no entry.env decay at all -- see
// sf2-loader.js) have no natural end the way a one-shot recording does. If a
// note-off is ever lost (a missed pointerup, a stuck qwerty key, a dropped
// remote/MIDI note-off) nothing else would ever silence a looped voice --
// it rings at a constant level indefinitely, which is what was reported as
// a note staying on for minutes. This is a pure safety net scheduled at
// note-on, not part of the normal release path: a real release's own
// .stop() call always reschedules an earlier stop (repeated
// AudioScheduledSourceNode.stop() calls just move the pending stop time),
// and no legitimate held note or pedal sustain runs anywhere near this long.
const LOOPED_VOICE_SAFETY_MAX_SECONDS = 45.00;
const PIANO_MIN_RELEASE_TC = 0.22;
// Minimum hold for the 0%-sustain / pedal-up damp: the release is an
// exponential with the TC above, so the source must live ~7 time constants
// before stop() lands below audibility (-60 dB). Stopping at 0.65s cut the
// buffer while the tail was still at ~5% (-26 dB) — that truncation was the
// audible on/off chop when the sustain pedal was released.
const PIANO_MIN_RELEASE_DELAY = 1.60;
// Shared so local playback and remote (RTDB) playback use identical values.
const STRING_VEL_SCALE = 0.82;   // strings sit slightly under the piano
const STRING_FADE_DEFAULT = 5.0; // layer fade acts like the layer's sustain/release
// When the cap forces us to reclaim a voice, fade it out smoothly instead of
// slamming it in 14ms — the slam was the audible string cutoff. Keep the stop
// ~8 time constants after the fade starts so the cut lands below -60 dB.
// 0.05/0.40 (was 0.10/0.75): a stolen source kept playing for 0.75 s after
// being dropped from the pool's accounting, so during dense pedalled runs the
// REAL simultaneous source count overshot MAX_ACTIVE_VOICES by dozens — and
// that overshoot is precisely what underruns a phone's audio thread. 0.40 s
// still lands the cut at -70 dB (inaudible under the passage that forced the
// steal) while halving the zombie-source window.
const VOICE_STEAL_TC = 0.05;
const VOICE_STEAL_DELAY = 0.40;
function _isStringVoice(v){ return v && (v.layer === 'string' || v.layer === 'remoteString'); }

// Unwire a finished voice from the graph. Orphaned nodes stay connected to
// masterGain (and to the reverb bus) until GC gets around to them, and a
// connected GainNode is summed on the audio thread every render quantum
// whether or not anything still feeds it. Across the few thousand notes of a
// real piece that residue is cumulative audio-thread cost for zero audio —
// the "gets worse the longer you play" half of the crackle. Only ever called
// once the source has actually ended.
function disconnectVoiceNodes(voice){
    try { if (voice.sfSrc) voice.sfSrc.disconnect(); } catch(e) {}
    try { if (voice.filterNode) voice.filterNode.disconnect(); } catch(e) {}
    try { if (voice.sendGain) voice.sendGain.disconnect(); } catch(e) {}
    try { if (voice.masterGain) voice.masterGain.disconnect(); } catch(e) {}
}
function cleanupVoiceRef(voice){
    if (!voice) return;
    voice.ended = true;
    disconnectVoiceNodes(voice);
    const current = activeNotes.get(voice.key);
    if (current === voice) activeNotes.delete(voice.key);
    forgetSustainTail(voice.key, voice);
}
// Retroactively shortens a voice mid-flight along a long sustain-driven
// decay. releaseVoice() is one-shot (flips voice.released, no-ops on a
// second call) so a plain re-release can't speed it up once scheduled —
// this cancels the pending gain ramp/stop and reschedules a quick one
// directly, bypassing that guard. Used when sustain toggles off while a
// note it was holding out has already left activeNotes.
function forceQuickStop(voice, tc, delay){
    if (!voice || voice.ended) return;
    const now = audioCtx.currentTime;
    if (voice.masterGain) {
        try {
            voice.masterGain.gain.cancelScheduledValues(now);
            voice.masterGain.gain.setValueAtTime(voice.masterGain.gain.value, now);
            voice.masterGain.gain.setTargetAtTime(0.0001, now, tc);
        } catch(e) {}
    }
    if (voice.sfSrc) {
        try { voice.sfSrc.stop(now + delay); } catch(e) {}
    } else if (voice.oscillators && voice.oscillators.length) {
        voice.oscillators.forEach(osc => { try { osc.stop(now + delay); } catch(e) {} });
    }
}
function releaseVoice(voice, releaseTC, stopDelay, when) {
    if (!voice || voice.released) return;
    voice.released = true;
    const now = audioCtx.currentTime;
    let tc = Math.max(0.012, releaseTC ?? 0.08);
    let delay = Math.max(0.05, Math.min(stopDelay ?? 0.3, MAX_RELEASE_SECONDS));
    // Scheduled releases (`when` on the audio clock) come from the MIDI-file
    // player. Never let a release land inside the 6 ms attack ramp of a
    // scheduled onset — cancelScheduledValues would erase the whole ramp and
    // the note (e.g. a zero-length MIDI note) would stay silent.
    let t = Math.max(now, when || 0);
    if (voice.startedAt) t = Math.max(t, voice.startedAt + 0.03);
    // A non-looped sample's buffer has a hard, fixed end -- no release
    // profile (sustain-scaled or otherwise) can make it ring past that,
    // however long it asks for. Clamp so the fade actually completes (and
    // stop() lands) before the buffer runs out on its own; otherwise a long
    // sustain-driven tail on a short one-shot recording (piano trebles are
    // routinely only 2-4s of actual audio) gets cut off mid-decay by the
    // buffer itself instead of by this envelope -- the click+dropout this
    // fixes. playSfBuffer also schedules its own pre-emptive fade for the
    // (rarer) case a voice never gets released at all before hitting this
    // point; this is what protects the much more common sustain-release case.
    // Cap the DURATION of the ring at what the buffer can supply -- but never
    // compress the decay CURVE into that window. Squeezing tc down to fit
    // (the old `tc = min(tc, delay/N)`) double-decays the note: these piano
    // recordings already contain their own natural decay, measured at
    // -35 dB by 2 s and -53 dB by 4 s on grandPiano C4, so layering a
    // matched-length exponential on top drove the audible tail to roughly
    // half the audio that was actually recorded, and made sustain-on vs
    // sustain-off nearly indistinguishable. Capping duration alone keeps the
    // sustain gradation intact (a 50% pedal still decays visibly faster than
    // 100%) while letting a fully-pedalled note ride the sample's own decay
    // to the end of the recording, which is exactly what a damper-up piano
    // string does.
    let clampedToNaturalEnd = false;
    if (Number.isFinite(voice.naturalEndAt)) {
        const maxDelay = Math.max(0.05, voice.naturalEndAt - t - 0.05);
        if (delay > maxDelay) {
            delay = maxDelay;
            clampedToNaturalEnd = true;
        }
    }
    if (voice.masterGain) {
        try {
            if (t > now + 0.001) {
                // Future point: setTargetAtTime picks its start value from
                // the surviving automation timeline at `t`, so no value pin
                // is needed (and none is possible — the value at `t` isn't
                // known yet).
                voice.masterGain.gain.cancelScheduledValues(t);
                voice.masterGain.gain.setTargetAtTime(0.0001, t, tc);
            } else {
                voice.masterGain.gain.cancelScheduledValues(now);
                const currentGain = voice.masterGain.gain.value;
                voice.masterGain.gain.setValueAtTime(currentGain, now);
                voice.masterGain.gain.setTargetAtTime(0.0001, now, tc);
            }
            // Click safety, stated explicitly instead of being smuggled into
            // tc. Two reasons it has to live here: cancelScheduledValues just
            // erased the identical pre-emptive fade playSfBuffer scheduled at
            // note-on, and relying on "the sample is quiet by its own end
            // anyway" would be an assumption about preset content that a
            // user-loaded SF2 need not honour. A short dedicated ramp over
            // the last fraction of the ring guarantees the gain is at zero
            // when stop() lands, whatever tc and whatever the sample does --
            // and costs no audible sustain, since it only touches the tail
            // end of a buffer that is already near silence there.
            if (clampedToNaturalEnd) {
                const tailLead = Math.min(0.25, Math.max(0.04, delay * 0.12));
                const tailAt = Math.max(t + 0.005, t + delay - tailLead);
                voice.masterGain.gain.setTargetAtTime(0.0001, tailAt, tailLead / 5);
            }
        } catch(e) {}
    }
    if (voice.sfSrc) {
        try { voice.sfSrc.stop(t + delay); } catch(e) { setTimeout(() => cleanupVoiceRef(voice), Math.ceil((t - now + delay) * 1000) + 120); }
    } else if (voice.oscillators && voice.oscillators.length > 0) {
        voice.oscillators.forEach(osc => { try { osc.stop(t + delay); } catch(e) {} });
        setTimeout(() => cleanupVoiceRef(voice), Math.ceil((t - now + delay) * 1000) + 120);
    }
}

// Reclaiming a voice has to actually shorten the SOUND, not just drop the
// bookkeeping. releaseVoice() is deliberately one-shot (`if (voice.released)
// return`) and the overflow sweep's FIRST victim tier is precisely the
// already-released voices — so every steal in that tier was a silent no-op:
// the voice left activeVoices while its AudioBufferSourceNode kept rendering
// its full sustain-driven tail, up to MAX_RELEASE_SECONDS later. Under the
// pedal nearly every pooled voice sits in that tier, so the cap stopped
// bounding anything at all: instrumenting the real graph during a 22 note/s
// pedalled passage measured 88 sources actually rendering while activeVoices
// sat pinned at 34 — the pool believed it was enforcing a limit it never
// applied, and never went on to steal a real voice either. An unbounded live
// source count is exactly what starves the audio thread, and that starvation
// is the crackle. forceQuickStop() exists to bypass the one-shot guard (it is
// already how pedal-up shortens tails), so route released victims through it.
function stealVoice(voice){
    if (!voice || voice.ended) return;
    if (voice.released) forceQuickStop(voice, VOICE_STEAL_TC, VOICE_STEAL_DELAY);
    else releaseVoice(voice, VOICE_STEAL_TC, VOICE_STEAL_DELAY);
}
// How audible a voice still is right now, so the pool sheds the note the ear
// is least likely to miss. The gain param's current value already accounts for
// the engine's own shaping (attack ramp, SF2 decay, an in-flight release); the
// age term stands in for the decay recorded INSIDE the sample itself, which no
// AudioParam models — several presets here author no volume envelope at all,
// so without it every held voice scores identically and the choice collapses
// back to array order. ~5 s is the rough amplitude time constant of a struck
// piano string in these recordings.
function voiceAudibility(voice, now){
    let g = 1;
    if (voice.masterGain) { try { g = Math.max(0, voice.masterGain.gain.value); } catch(e) { g = 1; } }
    const age = Math.max(0, now - (voice.startedAt || now));
    return g * Math.exp(-age / 5);
}
function enforceVoiceLimit() {
    const sweepNow = audioCtx.currentTime;
    let w = 0;
    for (let i = 0; i < activeVoices.length; i++) {
        const v = activeVoices[i];
        if (!v || v.ended) continue;
        // Lazy reclaim: a voice whose SF2 envelope has fully decayed (below
        // -60 dB) is inaudible even if the key/pedal still holds it — release
        // it so silent loops don't hog the pool during long pedal passages.
        if (v.silentAt && !v.released && sweepNow >= v.silentAt) releaseVoice(v, 0.05, 0.12);
        activeVoices[w++] = v;
    }
    activeVoices.length = w;
    const pianoSustainActive = (manualSustainEnabled || midiSustainPedalDown) && getActivePianoSustain() > 0.01;
    // The string layer runs its own fade independent of any pedal --
    // STRING_FADE_DEFAULT/fx.fadeSec (2-10s, user configurable) -- and it
    // doubles the voice count (piano + string per key, see MAX_ACTIVE_VOICES
    // comment above). So a fast passage with strings on keeps twice the
    // voices alive well past piano's own ~1.5s baseline release even with
    // zero sustain engaged, which a sustain-pedal-only check never accounted
    // for.
    const extendedTailActive = pianoSustainActive || stringEnabled;
    const burst = typeof getBurstLevel === 'function' ? getBurstLevel() : 0;
    // A fast passage played WITH sustain down (or with the string layer on)
    // is the highest-load case for the audio thread: every note struck stays
    // alive for its full ~15s pedal tail (getReleaseProfile's sustain-scaled
    // delay) or the string layer's own multi-second fade, instead of the
    // normal ~1.5s piano release, so the live voice count climbs toward the
    // cap fastest exactly when burst is also high. This used to exempt the
    // sustain case from any burst-based reduction at all, then (still not
    // enough) applied one flat ~15% trim regardless of how extreme the burst
    // actually was -- a fast arpeggio (burst just over 11) and a full-speed
    // glissando (burst saturated at getBurstLevel()'s max of 18) got the
    // exact same modest relief, and 96 -> 82 voices -- each a BufferSource +
    // GainNode + BiquadFilter, real per-sample audio-thread work -- was
    // nowhere near enough headroom for the glissando case: dozens of ~15s
    // voices spawned within a second or two of dragging across the keyboard,
    // still audible as crackling with voices getting stolen out from under
    // the player (reported both together, and specifically tied to
    // sustain+fast playing).
    //
    // Scale the ceiling to how extreme the burst actually is instead: linear
    // from the full pool at burst==11 down to a 35%-of-pool floor at
    // burst==18 (max). A merely-fast passage barely gets trimmed; an actual
    // glissando gets real relief. The victims are still the smooth,
    // oldest-first steal below (0.4s fade, not an abrupt cut), so a trimmed
    // pedalled glissando thins out the earliest-struck notes first while the
    // slide is still happening -- closer to how a real pedalled glissando's
    // own decay actually sounds than either extreme (no cap = crackle, or a
    // blanket fast-release on every swept note = pedal doesn't hold at all).
    //
    // The 0.35 floor this used to drop to was compensation for a cap that was
    // not actually being applied (see stealVoice): trimming the NUMBER harder
    // was the only lever that appeared to do anything, because the steals
    // themselves silenced nothing. Now that a steal really does shorten the
    // voice, 0.35 would genuinely delete two thirds of a pedalled glissando —
    // audible as notes vanishing, which is the other half of the original
    // report. Hold a much higher floor and let real enforcement do the work.
    let burstLimit = MAX_ACTIVE_VOICES;
    if (burst > 11 && extendedTailActive) {
        const intensity = Math.min(1, (burst - 11) / 7); // 0 at 11, 1 at 18 (max)
        const floorFrac = IS_MOBILE_AUDIO ? 0.45 : 0.70;
        const frac = 1 - intensity * (1 - floorFrac);
        burstLimit = Math.max(12, Math.round(MAX_ACTIVE_VOICES * frac));
    } else if (burst > 11) {
        burstLimit = Math.max(34, MAX_ACTIVE_VOICES - 4);
    }
    if (activeVoices.length <= burstLimit) return;

    const needKill = activeVoices.length - burstLimit;
    let killed = 0;
    // Victim priority, quietest-first within each tier:
    //   pass 0: already-released voices (fading out anyway)
    //   pass 1: still-held piano voices
    //   pass 2: still-held string voices (protected last — these are the tails
    //           whose abrupt removal was the audible cutoff)
    // Within a tier the victim is the least audible voice (voiceAudibility),
    // not simply the oldest. Oldest-first is only a proxy for quietest, and it
    // breaks on exactly the material that triggers stealing: a pedalled bass
    // octave struck at the top of a run is the oldest voice in the pool while
    // still being the loudest and most structurally important thing sounding,
    // so it was the first thing thrown away. Shedding by real current level
    // instead is what makes a steal inaudible rather than a dropped note.
    for (let pass = 0; pass < 3 && killed < needKill; pass++) {
        let victimIndex = -1;
        let victimScore = Infinity;
        for (let i = 0; i < activeVoices.length; i++) {
            const v = activeVoices[i];
            if (!v || v.ended) continue;
            if (pass === 0 && !v.released) continue;
            if (pass === 1 && (v.released || _isStringVoice(v))) continue;
            if (pass === 2 && v.released) continue;
            // Never steal a voice that's still inside its own attack ramp.
            // voiceAudibility() reads the gain param's CURRENT value, and a
            // voice created this same synchronous tick (playSfBuffer calls
            // enforceVoiceLimit() right after pushing it) has its gain
            // automation still sitting at the ~0.0001 floor the 6ms attack
            // ramp starts from -- scoring it as the quietest thing in the
            // whole pool, ahead of voices that are genuinely old and decayed,
            // even though it's about to be one of the loudest things
            // sounding. Killing it here cuts a note off within milliseconds
            // of it starting, audible as a click/tick right on the attack --
            // worst during dense file playback, where the pool crosses the
            // burst limit on almost every new note. 30ms is comfortably past
            // the ramp (matches releaseVoice's own startedAt+0.03 guard).
            if (!v.released && sweepNow - (v.startedAt || sweepNow) < 0.03) continue;
            const score = voiceAudibility(v, sweepNow);
            if (score < victimScore) { victimScore = score; victimIndex = i; }
        }
        if (victimIndex < 0) continue;
        stealVoice(activeVoices[victimIndex]);
        activeVoices[victimIndex].ended = true;
        killed++;
        pass = -1;
    }
    w = 0;
    for (let i = 0; i < activeVoices.length; i++) {
        const v = activeVoices[i];
        if (v && !v.ended) activeVoices[w++] = v;
    }
    activeVoices.length = w;
}

function getReleaseProfile(isFastGliss=false, sustainPct=sustainLevel) {
    if (isFastGliss) return { tc: 0.022, delay: 0.15 };
    const raw = Math.max(0, Math.min(1, sustainPct || 0));
    const pct = Math.pow(raw, 0.78);
    if (pct <= 0.0005) return { tc: PIANO_MIN_RELEASE_TC, delay: PIANO_MIN_RELEASE_DELAY };
    const tc = Math.min(PIANO_MIN_RELEASE_TC + pct * 3.03, 3.25);
    const delay = Math.min(PIANO_MIN_RELEASE_DELAY + pct * 13.95, 14.60);
    return { tc, delay };
}
function getStringFadeProfile(fadeSec, isFast=false) {
    if (isFast) return { tc: 0.018, delay: 0.12 };
    const sec = Math.max(0.1, Math.min(10.0, Number(fadeSec) || STRING_FADE_DEFAULT));
    return { tc: Math.max(0.018, Math.min(1.15, sec / 5.2)), delay: sec };
}

// Called right before re-striking a key whose previous voice may still be
// ringing. If sustain is holding that tail, chopping it in 10ms opens a
// momentary hole right before the new attack — the audible "sustain gap" on
// repeated notes — so release it along the sustain curve instead and let the
// old tail ring under the new strike, like a damper-up restrike on a real
// piano. Without sustain the near-instant fade keeps fast repeats clean.
function fastReleaseActiveKey(key, sustainPct, when){
    const voice = activeNotes.get(key);
    if (!voice) return;
    // Restriking a key reached the layer through the PIANO's sustain state:
    // the fade profile below was only used when piano sustain happened to be
    // engaged, so with the pedal up a re-struck layer voice was chopped in
    // 10 ms and its Fade setting ignored outright. Same coupling stopNote()
    // just lost, arriving by a different route. Forcing the layer down the
    // fade branch keeps Fade authoritative in both directions.
    const isLayer = _isStringVoice(voice);
    const pct = isLayer ? 1 : (sustainPct !== undefined ? sustainPct : getActivePianoSustain());
    if (!voice.released && pct > 0.01) {
        const profile = isLayer
            ? getStringFadeProfile(voice.fadeSec, false)
            : getReleaseProfile(false, pct);
        releaseVoice(voice, profile.tc, profile.delay, when);
        // Layer voices are never sustain tails, so lifting the pedal can no
        // longer force-stop one out from under its own fade.
        if (isLayer) forgetSustainTail(key); else trackSustainTail(key, voice);
    } else {
        releaseVoice(voice, 0.014, 0.10, when);
        forgetSustainTail(key);
    }
    activeNotes.delete(key);
}
function hasLayerBuffers(layer){
    const loadedKey = layer === 'string' ? stringLoadedSfKey : loadedSfKey;
    const buffers = layer === 'string' ? stringBuffers : sfBuffers;
    return !!loadedKey && !!buffers && Object.keys(buffers).length > 0;
}
// Independent octave/semitone shift for the layer/pad soundfont only --
// separate from the main Transpose control, which shifts the piano voice
// (and the whole key layout) instead. Several "pad" presets used as a
// layer sound sit naturally an octave (or more) below the piano register
// they're paired with, and until now the only way to compensate was
// re-pitching the WHOLE piano via the main transpose, which also moves
// every key label/QWERTY binding. Clamped to the same +/-12 range as the
// main transpose.
function getStringTranspose(){
    if (!sfEffectSettings.sf2) return 0;
    return Math.max(-12, Math.min(12, Math.round(Number(sfEffectSettings.sf2.transpose) || 0)));
}
function playNote(midi, transposeVal, velocity, when) {
    const vel = velocity !== undefined ? velocity : 0.8;
    if (typeof updateVelocityMeter === 'function') updateVelocityMeter(vel);
    const soundMidi = midi + (transposeVal || 0);
    fastReleaseActiveKey(midi, undefined, when);
    if (hasLayerBuffers('piano')) playSfBuffer(soundMidi, vel, midi, 'piano', when);
    if (stringEnabled && isMidiInStringRange(midi) && hasLayerBuffers('string')) {
        fastReleaseActiveKey('str:' + midi, undefined, when);
        playSfBuffer(soundMidi + getStringTranspose(), vel * STRING_VEL_SCALE, 'str:' + midi, 'string', when);
    }
}

function stopNote(midi, fast=false, when, layers) {
    // `layers`, when given, restricts release to a subset of ['piano','string']
    // instead of both -- used by the pedal-hold dispatch sites so the piano
    // voice can legitimately be parked open by a held CC64/pedal while the
    // layer/pad voice still gets its stopNote call immediately: the layer's
    // own Fade branch below is supposed to be the sole authority over it, but
    // that only holds if this function actually runs for it while the pedal
    // is still down, not just once the pedal finally lifts.
    const keys = [];
    if (!layers || layers.includes('piano')) keys.push(midi);
    if (!layers || layers.includes('string')) keys.push('str:' + midi);
    keys.forEach(key => {
        const voice = activeNotes.get(key);
        if (!voice) return;
        let profile;
        let sustainDriven;
        if (voice.layer === 'string') {
            // The layer is governed by its own Fade setting and by nothing
            // else. It used to additionally follow a real MIDI sustain pedal,
            // taking max(fade, piano release) whenever CC64 was down — so a
            // Fade set to 2 s silently became 14.63 s, measured, while the
            // piano note it was supposedly tracking stopped at 4.49 s because
            // its sample simply runs out. The layer outlived the thing it was
            // following by ten seconds, and the Fade slider was overridden
            // with no indication anywhere in the UI. Two independent sound
            // sources sharing one control is what made them fight; Fade is now
            // the single authority over the layer.
            //
            // `fast` stays, unconditionally. That flag is the glissando
            // voice-pool guard — an input-gesture concern, not a pedal one —
            // and it no longer needs a pedal exemption now that the pedal has
            // no say here at all.
            profile = getStringFadeProfile(voice.fadeSec, !!fast);
            sustainDriven = false;
        } else {
            const activeSustain = getActivePianoSustain();
            // Same reasoning as the string branch above: sustain (manual tap
            // or MIDI CC) wins over a glissando's fast-release request.
            const effFast = !!fast && activeSustain <= 0.01;
            profile = getReleaseProfile(effFast, activeSustain);
            sustainDriven = !effFast && activeSustain > 0.01;
        }
        releaseVoice(voice, profile.tc, profile.delay, when);
        activeNotes.delete(key);
        // Manual sustain and mouse/touch/QWERTY input never fed
        // midiPedalHeldNotes (hardware-MIDI-only), so without this a note
        // released here mid-sustain would ring out its full ~15s tail even
        // after the user turns sustain off. Track it so releaseMidiPedalHeldNotes()
        // can cut it short then, same as it already does for the MIDI path.
        if (sustainDriven) trackSustainTail(key, voice);
        else forgetSustainTail(key);
    });
}

function stopAllNotes() {
    activeNotes.forEach(voice => releaseVoice(voice, 0.020, 0.14));
    activeNotes.clear();
    activeVoices.forEach(voice => releaseVoice(voice, 0.020, 0.14));
    activeVoices = [];
    sustainTailVoices.clear();
    pressStartTimes.clear();
    _recentReleaseNotes.clear();

    for(let i=0;i<falling.length;i++){ if(falling[i]) falling[i].growing = false; }
    fallingByMidi.clear();
    if(typeof neonDustEmitters !== 'undefined') neonDustEmitters.clear();
    if(typeof strikeLineHit !== 'undefined' && strikeLineHit) strikeLineHit.classList.remove('on');
    // Refresh the chord readout so a full stop actually wipes the DOM too —
    // without this the last-detected chord name stayed onscreen because
    // nothing else re-runs the detector after pressStartTimes was cleared.
    if(typeof requestChordUpdate === 'function') requestChordUpdate();
}

// Holds the AbortController for whichever soundfont load is currently
// in flight through the #sfLoadingOverlay, so the Cancel button always
// cancels the right (most recent) one regardless of which of selectSf/
// setStringLayerEnabled started it.
let sfLoadAbortController = null;
function setSfOverlayProgress(pct, done=false, bytesText) {
    const sfBar = document.getElementById('sfProgressBar');
    const sfPct = document.getElementById('sfProgressPct');
    const sfBytes = document.getElementById('sfLoadingBytes');
    const clamped = Math.max(0, Math.min(100, pct));
    if (sfBar) {
        sfBar.style.width = clamped + '%';
        sfBar.classList.toggle('done', !!done);
    }
    if (sfPct) sfPct.textContent = Math.round(clamped) + '%';
    if (sfBytes && bytesText !== undefined) sfBytes.textContent = bytesText;
}
document.getElementById('sfLoadingCancelBtn')?.addEventListener('click', () => {
    if (sfLoadAbortController) sfLoadAbortController.abort();
});

function setStringLayerEnabled(on, skipConfirm=false) {
    stringEnabled = !!on;
    if (!stringEnabled) {
        activeNotes.forEach((voice, key) => {
            if (voice && voice.layer === 'string') {
                releaseVoice(voice, 0.014, 0.10);
                activeNotes.delete(key);
            }
        });
    }
    const layerTrack = document.getElementById('layerTrack');
    const settingsTrack = document.getElementById('settingsStringTrack');
    if (layerTrack) layerTrack.classList.toggle('active', stringEnabled);
    if (settingsTrack) settingsTrack.classList.toggle('active', stringEnabled);
    updateSoundfontPickerUI();
    if (stringEnabled && currentStringSf !== stringLoadedSfKey && SF_URLS[currentStringSf]) {
        const overlay = document.getElementById('sfLoadingOverlay');
        const nameEl = document.getElementById('sfLoadingName');
        const alreadyCached = soundfontBufferCache.has(currentStringSf) && useCachedSoundfont(currentStringSf, 'string');
        const syncBtns = () => {
            if (onBtn) onBtn.classList.toggle('active', stringEnabled);
            if (offBtn) offBtn.classList.toggle('active', !stringEnabled);
            if (settingsTrack) settingsTrack.classList.toggle('active', stringEnabled);
        };
        if (alreadyCached) {
            syncBtns();
            updateStringRangeUI();
            syncInstrumentStateIfReady();
            return;
        }
        if (audioCtx.state === 'suspended') audioCtx.resume();
        if (nameEl) nameEl.textContent = getSoundfontName(currentStringSf);
        document.querySelectorAll('.floating-panel').forEach(x=>x.style.display='none');
        if (overlay) { overlay.style.display='flex'; overlay.classList.add('show'); }
        setSfOverlayProgress(0, false, '');
        const controller = new AbortController();
        sfLoadAbortController = controller;
        loadSoundfontWithProgress(currentStringSf, SF_URLS[currentStringSf],
            (decoded, total) => {
                const pct = total > 0 ? (decoded / total) * 100 : 0;
                setSfOverlayProgress(pct, false, total > 0 ? formatMB(decoded) + ' / ' + formatMB(total) : formatMB(decoded));
            },
            ok => {
                if (ok) {
                    setSfOverlayProgress(100, true);
                    setTimeout(() => { if (overlay) { overlay.classList.remove('show'); overlay.style.display='none'; } }, 220);
                } else {
                    if (stringEnabled) stringEnabled = false;
                    const cancelled = controller.signal.aborted;
                    setSfOverlayProgress(100, false);
                    if (nameEl) nameEl.textContent = cancelled ? 'Cancelled' : 'Load failed. String layer off.';
                    setTimeout(() => { if (overlay) { overlay.classList.remove('show'); overlay.style.display='none'; } }, cancelled ? 400 : 900);
                }
                syncBtns();
                updateStringRangeUI();
            }, 'string', controller.signal);
    }
    updateStringRangeUI();
    syncInstrumentStateIfReady();
}

function selectSf(sfKey, url, el, name, layer='piano') {
    const prevKey = layer === 'string' ? currentStringSf : currentSf;
    const prevLoadedKey = getLoadedKey(layer);
    const prevActive = document.querySelector(`.sf-option[data-layer="${layer}"].active`);
    const overlay = document.getElementById('sfLoadingOverlay');
    const nameEl = document.getElementById('sfLoadingName');
    if (nameEl) nameEl.textContent = name || 'SoundFont';
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const applySuccess = () => {
        if (layer === 'string') currentStringSf = sfKey;
        else currentSf = sfKey;
        document.querySelectorAll(`.sf-option[data-layer="${layer}"]`).forEach(btn => btn.classList.toggle('active', btn.dataset.sfKey === sfKey));
        if (el) el.classList.add('active');
        stopAllNotes();
        updateSoundfontPickerUI();
        updateSfEffectUI();
        syncInstrumentStateIfReady();
    };

    if (getLoadedKey(layer) === sfKey && countBufferMap(getLayerBuffers(layer)) > 0) {
        applySuccess();
        if (overlay) { overlay.classList.remove('show'); overlay.style.display='none'; }
        return;
    }
    if (soundfontBufferCache.has(sfKey) && useCachedSoundfont(sfKey, layer)) {
        applySuccess();
        if (overlay) { overlay.classList.remove('show'); overlay.style.display='none'; }
        return;
    }

    document.querySelectorAll('.floating-panel').forEach(x=>x.style.display='none');
    if (overlay) { overlay.style.display='flex'; overlay.classList.add('show'); }
    setSfOverlayProgress(0, false, '');
    const controller = new AbortController();
    sfLoadAbortController = controller;

    loadSoundfontWithProgress(sfKey, url,
        (decoded, total) => {
            const pct = total > 0 ? (decoded / total) * 100 : 0;
            setSfOverlayProgress(pct, false, total > 0 ? formatMB(decoded) + ' / ' + formatMB(total) : formatMB(decoded));
        },
        ok => {
            if (ok) {
                applySuccess();
                setSfOverlayProgress(100, true);
                setTimeout(() => { if (overlay) { overlay.classList.remove('show'); overlay.style.display='none'; } }, 220);
            } else {
                if (layer === 'string') currentStringSf = prevKey;
                else currentSf = prevKey;
                if (prevLoadedKey && getLoadedKey(layer) !== prevLoadedKey && soundfontBufferCache.has(prevLoadedKey)) useCachedSoundfont(prevLoadedKey, layer);
                document.querySelectorAll(`.sf-option[data-layer="${layer}"]`).forEach(btn => btn.classList.remove('active'));
                if (prevActive) prevActive.classList.add('active');
                updateSoundfontPickerUI();
                const cancelled = controller.signal.aborted;
                setSfOverlayProgress(100, false);
                if (nameEl) nameEl.textContent = cancelled ? 'Cancelled' : 'Load failed. Keeping current sound.';
                setTimeout(() => { if (overlay) { overlay.classList.remove('show'); overlay.style.display='none'; } }, cancelled ? 400 : 900);
            }
        },
        layer, controller.signal
    );
}

document.querySelectorAll('.sf-option[data-layer][data-sf-key]').forEach(btn => {
    btn.addEventListener('click', () => {
        const sfKey = btn.dataset.sfKey;
        const layer = btn.dataset.layer === 'string' ? 'string' : 'piano';
        if (SF_URLS[sfKey]) selectSf(sfKey, SF_URLS[sfKey], btn, getSoundfontName(sfKey), layer);
    });
});

// ---- Custom SF2 (solo test bench) ----
// User-supplied .sf2 files with many presets. Parsed entirely in the browser
// via window.PapianoSF2 (see js/shared/sf2-loader.js); nothing leaves the
// device. Preset selection is exposed as regular sf-option buttons under the
// "Custom SF2" category so the shared picker handler and
// updateSoundfontPickerUI treat them exactly like the bundled slots. Buffer
// maps are cached per preset via soundfontBufferCache so re-picking is
// instant after the first build.
(function initCustomSf2(){
    const loadBtn = document.getElementById('mainCustomSf2Load');
    const fileInput = document.getElementById('customSf2FileInput');
    const listEl = document.getElementById('customSf2PresetList');
    const filenameEl = document.getElementById('customSf2Filename');
    const statusEl = document.getElementById('customSf2Status');
    if (!loadBtn || !fileInput || !listEl) return;

    const MAX_PRESETS = 400;

    function showStatus(text, tone){
        if (!statusEl) return;
        if (!text){ statusEl.hidden = true; statusEl.textContent = ''; return; }
        statusEl.hidden = false;
        statusEl.textContent = text;
        statusEl.setAttribute('data-tone', tone || 'error');
    }

    function clearPreviousRegistrations(){
        for (const key of Object.keys(SF_URLS)){
            if (key.indexOf('usersf2:') === 0){
                delete SF_URLS[key];
                delete SOUNDFONT_LABELS[key];
                if (soundfontBufferCache.has(key)) soundfontBufferCache.delete(key);
            }
        }
        if (currentSf && currentSf.indexOf('usersf2:') === 0){
            currentSf = 'grandPiano';
            sfBuffers = {};
            loadedSfKey = null;
        }
        if (currentStringSf && currentStringSf.indexOf('usersf2:') === 0){
            currentStringSf = 'strViolin';
            stringBuffers = {};
            stringLoadedSfKey = null;
        }
    }

    function renderPresets(){
        listEl.innerHTML = '';
        if (!window.__papianoCustomSf2) return;
        const presets = window.__papianoCustomSf2.presets;
        for (const p of presets){
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
            listEl.appendChild(btn);
        }
        updateSoundfontPickerUI();
    }

    loadBtn.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', async e => {
        const file = e.target.files && e.target.files[0];
        e.target.value = '';
        if (!file) return;
        if (!window.PapianoSF2 || typeof window.PapianoSF2.listPresets !== 'function'){
            showStatus('SF2 parser not ready — refresh the page.', 'error');
            return;
        }
        showStatus('Reading ' + file.name + '…', 'info');
        try {
            const arrayBuffer = await file.arrayBuffer();
            const presets = window.PapianoSF2.listPresets(arrayBuffer);
            if (!presets.length){
                showStatus('No presets found in this SF2.', 'error');
                return;
            }
            clearPreviousRegistrations();
            const displayName = file.name.replace(/\.sf2$/i, '').slice(0, 60) || 'Custom SF2';
            window.__papianoCustomSf2 = {
                arrayBuffer,
                filename: displayName,
                presets: presets.slice(0, MAX_PRESETS)
            };
            if (filenameEl){
                filenameEl.hidden = false;
                filenameEl.textContent = displayName + '  \u00b7  ' + presets.length + ' preset' + (presets.length === 1 ? '' : 's');
            }
            renderPresets();
            const truncated = presets.length > MAX_PRESETS;
            showStatus(truncated
                ? ('Loaded ' + MAX_PRESETS + ' of ' + presets.length + ' presets. Only the first ' + MAX_PRESETS + ' are shown.')
                : '', 'info');
        } catch(err){
            const msg = (err && err.message) ? err.message : String(err);
            showStatus('Failed to parse SF2: ' + msg, 'error');
        }
    });
})();

const layerTrack = document.getElementById('layerTrack');
if(layerTrack) layerTrack.onclick = () => setStringLayerEnabled(!stringEnabled);
const settingsStringTrack = document.getElementById('settingsStringTrack');
if(settingsStringTrack) settingsStringTrack.onclick = () => setStringLayerEnabled(!stringEnabled);
bindStringRangeSliders();
setStringLayerEnabled(stringEnabled, true);
updateStringRangeUI();
updateSoundfontPickerUI();

const pianoEl = document.getElementById('piano');
const activeKeyLayer = document.getElementById('activeKeyLayer');
const canvas = document.getElementById('fx');
const ctx2d = canvas.getContext('2d', { alpha: true });
ctx2d.imageSmoothingEnabled = true;
ctx2d.imageSmoothingQuality = 'high';
ctx2d.globalCompositeOperation = 'source-over';
let canvasCssW = 0, canvasCssH = 0, currentDPR = 1;
let perfGovScale = 1.0;
const PERF_DPR_FLOOR = 1.0;
function getRenderDPR(){
    const native = Math.max(1, window.devicePixelRatio || 1);
    let cap;
    try {
        const q = typeof getEffectiveGraphicQuality === 'function' ? getEffectiveGraphicQuality() : graphicQuality;
        if(q === 'potato') cap = 1;
        else if(q === 'medium') cap = Math.min(native, 1.5);
        else cap = Math.min(native, 2.0); // default / high tiers -- capped on every device so a 3-4x native DPR desktop/4K display doesn't multiply fill cost unchecked
    } catch(e){ cap = Math.min(native, 2.0); }
    // The governor is allowed to trim DPR under load on every device now --
    // it used to be a no-op on desktop's Default tier (see perfGovernorTick),
    // which let an underpowered laptop/PC render at full uncapped resolution
    // with zero adaptive relief even as frames blew past budget.
    const scaled = cap * (perfGovScale > 0 ? perfGovScale : 1);
    return scaled < PERF_DPR_FLOOR ? PERF_DPR_FLOOR : scaled;
}

let _perfEmaMs = 1000 / 60;
let _perfGovLastChange = 0;
let _perfSlowStreak = 0;
let _perfFastStreak = 0;
const PERF_BUDGET_MS = 20.5;
const PERF_HEADROOM_MS = 13.6;
const PERF_GOV_COOLDOWN = 850;
const PERF_SCALE_MIN = 0.6;
const PERF_SCALE_MAX = 1.0;
function perfGovernorTick(frameMs, now){
    // Runs on every device/tier now, including desktop's Default tier -- it
    // used to bail out unconditionally there (perfGovScale pinned to 1), so
    // a desktop/laptop that couldn't actually sustain full-resolution
    // rendering had no fallback and just kept dropping frames. The governor
    // only ever kicks in after 3 consecutive slow-frame windows and recovers
    // automatically once frames are fast again, so a machine that never
    // struggles never leaves perfGovScale=1.
    if(!(frameMs > 0) || frameMs > 240) return;
    _perfEmaMs += (frameMs - _perfEmaMs) * 0.12;
    if(_perfEmaMs > PERF_BUDGET_MS){ _perfSlowStreak++; _perfFastStreak = 0; }
    else if(_perfEmaMs < PERF_HEADROOM_MS){ _perfFastStreak++; _perfSlowStreak = 0; }
    else { if(_perfSlowStreak) _perfSlowStreak--; if(_perfFastStreak) _perfFastStreak--; }
    if(now - _perfGovLastChange < PERF_GOV_COOLDOWN) return;
    if(_perfSlowStreak >= 3 && perfGovScale > PERF_SCALE_MIN){
        // Descend by SEVERITY, not a fixed notch. A flat 0.16 step meant a
        // machine sitting at 5x the frame budget still needed three descents,
        // each gated behind 3 slow samples plus the 850ms cooldown -- about
        // three seconds of visible stutter before the resolution finally
        // dropped, and it paid that on every single page load. The overrun
        // ratio is already known here, so a machine that is clearly drowning
        // can reach the floor in one move while a marginal one still eases
        // down gently. This only ever makes the existing adaptation quicker,
        // never slower, and never fires unless the 3-slow-sample gate above
        // already passed.
        const overrun = PERF_BUDGET_MS > 0 ? (_perfEmaMs / PERF_BUDGET_MS) : 1;
        const step = overrun >= 2.5 ? 0.40 : overrun >= 1.6 ? 0.26 : 0.16;
        perfGovScale = Math.max(PERF_SCALE_MIN, perfGovScale - step);
        _applyPerfGovScale(now);
    } else if(_perfFastStreak >= 10 && perfGovScale < PERF_SCALE_MAX){
        perfGovScale = Math.min(PERF_SCALE_MAX, perfGovScale + 0.14);
        _applyPerfGovScale(now);
    }
}
function _applyPerfGovScale(now){
    _perfGovLastChange = now;
    _perfSlowStreak = 0; _perfFastStreak = 0;
    if(document.body) document.body.classList.toggle('perf-lite', perfGovScale < 0.78);
    try { if(typeof markStageGeomDirty === 'function') markStageGeomDirty(); syncCanvasSize(true); } catch(e){}
}
let transpose=0, falling=[], isAnimOn=true, isSus=true, animStyle='single', animShape='rounded', animSize=90, animRoundness=70, noteOpacity=100, noteSpeed=75, wCount=52, lastFrameTime=0, viewOffset=0, whiteKeyWidth=0;
// Color Mode — separate from Style (material/texture): Mode decides WHAT
// colour a note gets (single flat colour / left-right split / a hue
// computed from the note's position across the keyboard); Style decides
// HOW that colour is rendered (flat fill, metal, glass, etc). The two are
// orthogonal on purpose — any Style can be driven by any Mode's colour.
let animColorMode = 'single'; // 'single' | 'double' | 'gradient'
let gradientIntensity = 70;   // 0-100 -> saturation/brightness applied on top of the picked colours
// Color Spread: how many colour stops the gradient sweeps through (1-3),
// picked directly via gradientColors below -- replaces the old preset-
// palette + hue-rotation scheme with explicit user-chosen colours.
let gradientColorCount = 2;
let gradientColors = ['#0099ff', '#00e0a0', '#ffae00'];
// Axis: which position the hue sweep is driven by. 'horizontal' = across the
// keyboard (pitch, the original/only behaviour). 'vertical' = across the
// stage height (a note's current on-screen y, so the sweep travels with the
// note instead of sticking to the key). Ported from the Piano Visualizer,
// where this concept was trialled first.
let gradientAxis = 'horizontal'; // 'horizontal' | 'vertical'
const RISE_SPEED=200, MAX_NOTE_HEIGHT=400;
// Floor for a note's rendered bar height, both at spawn and at draw time --
// without this a genuinely staccato tap (held only a frame or two before
// getAnimRiseSpeed() has grown it past a couple of px) rendered as a
// near-invisible sliver. 14px keeps even the briefest tap clearly visible
// as a real note rather than a dot.
const MIN_NOTE_HEIGHT = 14;
// Hard ceiling on how long a held note may keep GROWING. Solo's
// pressStartTimes backstop below only covers LOCAL notes; a remote note whose
// note-off is lost on the wire -- and, in the other engines, any dropped
// key-up at all -- would otherwise grow until the page reloads.
// 7s is taken from the measured audio rather than taste: with the pedal fully
// down the longest any packaged preset stays audible is 5.2s (pfSoft C3 /
// salamander C4 -- their sample buffers simply end), so 7s can never cut a bar
// that is still making sound, while still bounding a genuinely stuck one.
const MAX_HELD_NOTE_MS = 7000;
// Seam between two notes that follow each other on the SAME key, in CSS px.
//
// The old behaviour was that the gap between consecutive bars equalled
// travel speed x the SILENCE between the notes, so playing fast or legato
// drove it to zero and the bars read as one long note. Deriving the gap from
// speed instead is what made everything look like it was racing: raising the
// speed to buy a visible seam changes the whole roll's tempo feel.
//
// Measured before this change, repeating one key with the renderer's own
// geometry (negative = the bars actually overlap):
//
//     period  silence   min gap   bars touching
//      300ms     60ms     +2 px      0 of 9
//      150ms     30ms     -6 px     17 of 17
//       90ms     12ms    -10 px     30 of 30
//       35ms      0ms    -10 px     44 of 44
//
// The overlap comes from MIN_NOTE_HEIGHT: a note held 12 ms is only about 3 px
// tall, gets inflated to 14, and that inflation ran DOWNWARD past its own
// onset into the note after it. So the fix is not a bigger gap, it is to stop
// a bar from ever crossing its neighbour: a note's height is capped by the
// real distance between its onset and the previous onset in the same column,
// minus this seam. That distance is speed x the note's PERIOD, which is
// exactly the space the note is entitled to — so the seam stays constant in
// pixels at any tempo and at any speed setting.
const NOTE_SEAM_PX = 2;
// Floor so an extremely dense repeat still shows something rather than
// collapsing to nothing.
const NOTE_MIN_VISIBLE_PX = 2;
// Flat px/s regardless of stage height. A previous version of this scaled
// speed by canvasCssH (relative to a ~700px reference) to try to keep the
// TIME a note takes to cross the stage consistent between a squashed
// desktop window and a tall phone screen -- but that meant a genuinely
// short stage (landscape phones, not just squashed desktop windows) got
// its raw px/s velocity throttled down too, well below what the Note
// Speed slider said, since the slider's own multiplier gets multiplied
// AGAIN by the shrunk height ratio. Motion that covers fewer px/s reads
// as slow motion to the eye no matter how the total transit time works
// out on paper, and there was no way to crank the slider back up to
// compensate -- exactly the "even at 100% it's still slow" regression on
// non-portrait/short viewports. Back to a flat constant: the same Note
// Speed setting now always means the same actual velocity, everywhere.
// Falling-note speed is a TRAVEL TIME, not a pixel rate.
//
// RISE_SPEED used to be a flat 200 px/s scaled by the slider, so how long a
// note actually took to cross the stage depended entirely on how tall the
// stage happened to be. Same 75% setting, measured:
//
//     phone landscape   312 px stage   2.00 s
//     phone portrait    675 px stage   4.33 s
//     laptop 1600x900   720 px stage   4.62 s
//     desktop 1920x1080 864 px stage   5.54 s
//
// i.e. the identical setting ran nearly 3x slower on a desktop than on a
// phone in landscape — which is exactly the "PC is slower than mobile"
// report, and it is not a performance problem at all, it is the runway being
// longer while the rate stayed fixed.
//
// Expressing it as seconds-of-runway is what piano-roll software does
// (Synthesia and friends let you set how far ahead you can see, in time),
// and it makes the setting mean the same thing on every screen and in every
// orientation: the note always takes getNoteTravelSec() to cross, whatever
// the stage height is. The slider default of 75% lands on 3.0 s, which is
// the usual lookahead those tools ship with.
const NOTE_TRAVEL_MAX_SEC = 7.5;   // slider 0%   — long runway, slow
const NOTE_TRAVEL_MIN_SEC = 1.5;   // slider 100% — short runway, fast
function getNoteTravelSec(){
    const t = sliderRatio(noteSpeed, 100);
    return NOTE_TRAVEL_MAX_SEC - t * (NOTE_TRAVEL_MAX_SEC - NOTE_TRAVEL_MIN_SEC);
}
function getNoteStageHeight(){
    return Math.max(120, canvasCssH || cachedStageHeight || knownStageH || 600);
}
function getAnimRiseSpeed(){
    return getNoteStageHeight() / getNoteTravelSec();
}
const DT_MAX = 0.042;
// Default colours for the 3 things that used to all ship the exact same
// hex (#0099ff): falling notes, white-key press, black-key press. Same blue
// family, lightness shifted per element — white keys already sit on a
// bright background so their active colour is toned down a touch; black
// keys sit on a dark background so theirs is lifted a touch; falling notes
// stay the original anchor. Purely a different starting point for the
// colour pickers — users can still repaint any of the three to anything,
// including matching them again.
const DEFAULT_ACCENT_WHITE = '#0088e0';
const DEFAULT_ACCENT_BLACK = '#29a3ff';
let cachedAnimColor = '#0099ff';
const _solidRgbCache = new Map();
let renderNow = 0;
let animDoubleLeftColor = '#0099ff';
let animDoubleRightColor = '#0099ff';
let animDoubleSplitTuts = 44;
// Split Color: an independent color-source toggle (left/right tuts split),
// orthogonal to the visual Style (Single/Glass/Outline/Midnight/Gradient).
// It used to be crammed into the Style picker as a fake "Double" style,
// which forced it to always render flat and made it mutually exclusive with
// every other style. Now it just swaps which color feeds into whichever
// style is currently drawing the falling note.
let animColorSplit = false;
// Black keys read a touch darker/richer than white keys under Single and
// Double Colour Mode -- Gradient and Rainbow already vary colour per note
// by their own logic, so this only applies where every note would
// otherwise share one flat colour (see shadeBlackKeyHex/getAnimBaseColorForMidi).
let animKeyShade = true;
function refreshAnimColor(){ cachedAnimColor = getComputedStyle(document.documentElement).getPropertyValue('--anim-color').trim() || '#ffffff'; }
function hslToHex(h, s, l){
    h = ((h % 360) + 360) % 360;
    s = Math.max(0, Math.min(100, s)) / 100;
    l = Math.max(0, Math.min(100, l)) / 100;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = l - c / 2;
    let r, g, b;
    if(h < 60){ r = c; g = x; b = 0; }
    else if(h < 120){ r = x; g = c; b = 0; }
    else if(h < 180){ r = 0; g = c; b = x; }
    else if(h < 240){ r = 0; g = x; b = c; }
    else if(h < 300){ r = x; g = 0; b = c; }
    else { r = c; g = 0; b = x; }
    const toHex = (v) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
// Gradient Mode: ONE smooth, monotonic colour sweep across the whole
// keyboard (low key -> high key) — never repeating, and always edge-to-edge
// now that Color Spread picks the STOP COUNT rather than a sweep width.
// Horizontal sweep position (0-1): a CONTINUOUS function of pitch
// (fractional midi is allowed on purpose — see fallingNoteAccentColors,
// which samples half a semitone either side of a note to blend it into its
// on-screen neighbours), so nothing here quantizes to a per-key step.
function gradientTForMidi(midi){
    const idx = Math.max(0, midi - 21);
    const totalKeys = 88;
    return Math.max(0, Math.min(1, idx / totalKeys));
}
// Vertical sweep position (0-1): the note's CURRENT on-screen y, passed by
// callers each frame so the colour travels with the note. Quantized to
// bands so consecutive frames share a colour — and therefore a sprite-cache
// key — while the note crosses one band (measured in the Visualizer, where
// this design shipped first: continuous per-frame colours defeated the
// baked-sprite cache and tanked mobile FPS).
    // Doubled from 48 -> 96 (2026-08-03): styles that never read f.accent
    // (midnight/glass -- see drawFallingNote's style dispatch) only
    // ever show ONE flat, quantized colour per note, so a coarse bucket
    // count meant a held/slow note visibly SNAPPED between colours instead
    // of drifting, user-reported as "tiba-tiba" (sudden) rather than
    // gradual. Doubling halves the visible step size. Did NOT go further:
    // this constant directly multiplies the sprite cache's (colour band x
    // height bucket) key space for those styles -- see _SPRITE_CACHE_MAX's
    // own comment on why that combinatorial pressure already needed
    // raising once before. 'solid'/'outline' don't depend on this any
    // more as of the same session -- they bake/stroke a real continuous
    // 2-colour gradient from f.accent instead, so this bucket count only
    // affects midnight/glass's smoothness now.
    const VERTICAL_SWEEP_BUCKETS = 96;
function gradientTForY(y){
    const h = canvasCssH > 0 ? canvasCssH : (cachedStageHeight || knownStageH || 600);
    const t = Math.max(0, Math.min(1, y / h));
    return Math.round(t * VERTICAL_SWEEP_BUCKETS) / VERTICAL_SWEEP_BUCKETS;
}
// Resolves the active Axis setting into a single 0-1 sweep position. `y` is
// optional — callers with no on-screen position (key-press colour, Strike
// Line, the dust "representative colour") fall back to horizontal, exactly
// the pre-Axis behaviour.
function gradientTFor(midi, y){
    if(gradientAxis === 'vertical' && y != null) return gradientTForY(y);
    return gradientTForMidi(midi);
}
// Linearly interpolates across the 1-3 user-picked Color Spread stops at
// sweep position t, then applies Intensity as a luma-preserving
// saturate+brighten pass (same shape as tuneRgbForFalling) on the blended
// result -- so Intensity still dials vividness up/down the way it always
// has, but now anchored on the actual colours the user picked instead of a
// fixed palette hue range.
function gradientColorForMidi(midi, y){
    const t = gradientTFor(midi, y);
    const count = Math.max(1, Math.min(3, gradientColorCount | 0));
    const stops = [];
    for(let i = 0; i < count; i++) stops.push(safeHex(gradientColors[i], '#0099ff'));
    let r, g, b;
    if(stops.length === 1){
        [r, g, b] = stops[0];
    } else {
        const segT = t * (stops.length - 1);
        const i0 = Math.max(0, Math.min(stops.length - 2, Math.floor(segT)));
        const localT = segT - i0;
        const a = stops[i0], c = stops[i0 + 1];
        // Blending straight in sRGB bytes is not perceptually even: sRGB
        // encodes light with a ~2.2 gamma curve, so byte-midpoint (a+c)/2 is
        // nowhere near perceived-midpoint between the two colours. Between
        // e.g. a dark blue and a bright yellow, that reads as "mostly blue"
        // for most of the width with a late, sudden swing to yellow — a 2-
        // colour gradient visually squatting closer to 70/30 than 50/50,
        // reported independently on both Horizontal and Vertical axis
        // (confirming the bug is in this shared blend, not either axis'
        // own position math). Converting to linear light, blending there,
        // then back to sRGB spreads the transition the way the eye reads it.
        const toLin = v => Math.pow(v / 255, 2.2);
        const toSrgb = v => Math.pow(v < 0 ? 0 : v > 1 ? 1 : v, 1 / 2.2) * 255;
        r = toSrgb(toLin(a[0]) + (toLin(c[0]) - toLin(a[0])) * localT);
        g = toSrgb(toLin(a[1]) + (toLin(c[1]) - toLin(a[1])) * localT);
        b = toSrgb(toLin(a[2]) + (toLin(c[2]) - toLin(a[2])) * localT);
    }
    const intensityT = Math.max(0, Math.min(100, gradientIntensity)) / 100;
    const sat = 0.5 + intensityT * 0.9;
    const bright = 0.72 + intensityT * 0.5;
    const luma = r * 0.299 + g * 0.587 + b * 0.114;
    let or = (luma + (r - luma) * sat) * bright;
    let og = (luma + (g - luma) * sat) * bright;
    let ob = (luma + (b - luma) * sat) * bright;
    or = or < 0 ? 0 : or > 255 ? 255 : (or + 0.5) | 0;
    og = og < 0 ? 0 : og > 255 ? 255 : (og + 0.5) | 0;
    ob = ob < 0 ? 0 : ob > 255 ? 255 : (ob + 0.5) | 0;
    return '#' + ((1 << 24) | (or << 16) | (og << 8) | ob).toString(16).slice(1);
}
// Rainbow: an EXPLICIT fixed colour per key — C is always the same colour,
// D always another, repeating identically every octave (12 pitch-class
// colours spaced evenly around the hue wheel). NOT Gradient with different
// math: no sweep, no Axis participation, no time animation, no randomness.
// Twelve precomputed hexes make Rainbow exactly as cheap as Single mode:
// colour lookup is an array index, and the sprite cache holds at most 12
// colour variants. (Ported from the Visualizer, where the old time-drifting
// version was both the wrong concept and the worst cache-miss case.)
const RAINBOW_NOTE_COLORS = (() => {
    const out = [];
    for(let pc = 0; pc < 12; pc++) out.push(hslToHex(pc / 12 * 360, 85, 55));
    return out;
})();
function rainbowColorForMidi(midi){
    return RAINBOW_NOTE_COLORS[((Math.round(midi) % 12) + 12) % 12];
}
// Luma-preserving darken+saturate, same shape as tuneRgbForFalling but tuned
// to read as a subtle tint shift rather than a different hue -- black keys
// come out a bit deeper/richer, not a rainbow-different colour.
function shadeBlackKeyHex(hex){
    const rgb = safeHex(hex, '#ffffff');
    const r0 = rgb[0], g0 = rgb[1], b0 = rgb[2];
    const sat = 1.12, bright = 0.74;
    const luma = r0 * 0.299 + g0 * 0.587 + b0 * 0.114;
    let r = (luma + (r0 - luma) * sat) * bright;
    let g = (luma + (g0 - luma) * sat) * bright;
    let b = (luma + (b0 - luma) * sat) * bright;
    r = r < 0 ? 0 : r > 255 ? 255 : (r + 0.5) | 0;
    g = g < 0 ? 0 : g > 255 ? 255 : (g + 0.5) | 0;
    b = b < 0 ? 0 : b > 255 ? 255 : (b + 0.5) | 0;
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}
function getAnimBaseColorForMidi(midi, y){
    if(animColorMode === 'gradient') return gradientColorForMidi(midi, y);
    if(animColorMode === 'rainbow') return rainbowColorForMidi(midi);
    let base;
    if(animColorMode === 'double' || animColorSplit) base = midiToTuts(midi) < animDoubleSplitTuts ? animDoubleLeftColor : animDoubleRightColor;
    else base = cachedAnimColor || '#ffffff';
    if(animKeyShade && isBlack(midi)) base = shadeBlackKeyHex(base);
    return base;
}
// Resolve the requested anim STYLE (material) against the active graphics
// profile: heavy materials collapse to plain 'single' when heavy FX are off
// (Potato tier), so new notes and resynced in-flight notes stay cheap there.
// Colour Mode (single/double/gradient) is untouched by this — computing a
// note's colour is negligible cost regardless of tier; only the material
// RENDERING is what gets simplified.
function resolveAnimStyle(style){
    if(typeof getGraphicProfile === 'function' && !getGraphicProfile().heavyFx) return 'single';
    // 'liquid' is retired; LEGACY_STYLE resolves saved presets holding it onto
    // Glass, so the renderer has to agree rather than fall through to the
    // unknown-style branch. 'batik' is retired the same way, onto 'single'
    // (it never had a Glass-equivalent replacement) -- see LEGACY_STYLE's
    // own comment.
    if(style === 'liquid') return 'glass';
    if(style === 'batik') return 'single';
    return style;
}
// Any setting that changes the Falling Notes colour scheme (mode switch,
// double/gradient colours, gradient params) must also refresh whichever
// OTHER elements are set to Follow Falling Notes — otherwise Strike Line's
// bar + aura (both driven by updateStrikeLineLine(), which nothing else
// happens to call on its own) go stale until some unrelated Strike Line
// setting forces a redraw, which reads to the user as "have to toggle
// Follow off/on again for it to notice the change". Piano Keys/Particles
// don't need this: they resolve their colour fresh at press/render time,
// never cached.
function refreshFollowingElements(){
    if(typeof strikeLineColorFollowFallingNotes !== 'undefined' && strikeLineColorFollowFallingNotes
        && typeof updateStrikeLineLine === 'function') updateStrikeLineLine();
}
function syncFallingNoteVisualState(){
    if(Array.isArray(falling)) falling.forEach(f => {
        if(f.remote){
            f.style = 'single';
            f.styleResolved = 'single';
            if(f.colorOverride) f.base = f.colorOverride;
            return;
        }
        f.style = animStyle;
        f.styleResolved = resolveAnimStyle(animStyle);
        f.base = getAnimBaseColorForMidi(f.midi, f.y);
        if(!f.colorOverride) f.accent = fallingNoteAccentColors(f.midi, f.y, f.height);
    });
    // Sprite cache keys already bake in color/style/size/glow (see getEffectSprite/
    // getGradientSprite), so they self-invalidate on the next draw without an
    // explicit clear -- clearing here was wiping the whole cache on every
    // continuous 'input' tick while dragging related sliders, costing FPS for
    // nothing during scrub/drag interactions.
    if(typeof ensureAnimLoop === 'function' && Array.isArray(falling) && falling.length > 0) ensureAnimLoop();
    refreshFollowingElements();
}
document.documentElement.style.setProperty('--anim-color','#ffffff');
refreshAnimColor();
const pressStartTimes = new Map();
// Short, fixed grace window: a note stays part of the chord for a brief
// moment after release, independent of sustain. Real hands (and especially
// touch-screen / QWERTY input, which can't land a block chord in one
// instant the way ten piano-trained fingers can) roll a chord's notes in
// across a few dozen milliseconds rather than landing them perfectly
// together — without this, releasing the first-pressed note before the
// last one lands would mean the full chord is never simultaneously "on"
// long enough to be read. Unlike the removed sustain-driven tracking, this
// window is fixed and universal (not tied to a toggle a player can leave
// on for minutes), so it can't reintroduce the old blurred-cluster problem.
const _recentReleaseNotes = new Map(); // midi -> performance.now() at release
const CHORD_RELEASE_GRACE_MS = 110;
// Chord detection reads ONLY pressStartTimes — notes currently under a
// finger / MIDI-driven key. It deliberately does NOT factor in the sustain
// pedal (hardware, manual, or MIDI-file): a chord name that depends on
// pedal state is unpredictable to read (the same fingers can produce a
// different chord name depending on whether Sustain happens to be on, and
// a long/dense pedal hold used to blur notes from several different
// harmonies into one nonsensical cluster read). Lift a finger and that
// note is simply no longer part of the chord, full stop — matches what's
// on screen (the key light) rather than trying to model what's still
// audible under the pedal.
const NOTE_NAME_DISPLAY = ['C','C#','D','Eb','E','F','F#','G','Ab','A','Bb','B'];

function isBlack(m) { return [1,3,6,8,10].includes(m%12); }
const ALL_WHITE = []; for(let m=21; m<=108; m++) if(!isBlack(m)) ALL_WHITE.push(m);
const C4_IDX = ALL_WHITE.indexOf(60); viewOffset = C4_IDX;
const BLACK_META = [];
ALL_WHITE.forEach((n, i) => {
    const nextMidi = n + 1;
    if (isBlack(nextMidi) && i < ALL_WHITE.length - 1) BLACK_META.push({ midi: nextMidi, whiteIndex: i });
});
const whiteIndexMap = new Map();
ALL_WHITE.forEach((midi, i) => whiteIndexMap.set(midi, i));
let whiteKeyEls = [];
let blackKeyEls = [];
// Last values updateBlackKeyEdgeVars() actually wrote onto the black keys, so it
// can skip the element loop when nothing moved. MUST be reset to null whenever
// the keys are rebuilt (buildDOM makes brand-new elements with no inline style,
// so a stale cache here would make the guard skip writing to them).
let _lastBkFace = null;
let _lastBkCut = null;
let _lastBkHeight = null;
function invalidateBlackKeyStyleCache(){ _lastBkFace = _lastBkCut = _lastBkHeight = null; }
let pianoSeparatorLayer = null;
const noteElementMap = new Map();
const activeKeyOverlayMap = new Map();
const activeOverlayNotes = new Set();
let keyHitCache = { wrapLeft: 0, wrapTop: 0, wrapBottom: 0, wrapHeight: 0, totalWidth: 0, blackBottom: 0, blackByBoundary: [], whiteEls: [] };

const QWERTY_LABEL_MAP = {"21":"C+1","22":"C+2","23":"C+3","24":"C+4","25":"C+5","26":"C+6","27":"C+7","28":"C+8","29":"C+9","30":"C+0","31":"C+Q","32":"S+3","33":"C+E","34":"S+7","35":"S+0","36":"1","37":"S+1","38":"2","39":"S+2","40":"3","41":"4","42":"S+4","43":"5","44":"S+5","45":"6","46":"S+6","47":"7","48":"8","49":"S+8","50":"9","51":"S+9","52":"0","53":"q","54":"S+Q","55":"w","56":"S+W","57":"e","58":"S+E","59":"r","60":"t","61":"S+T","62":"y","63":"S+Y","64":"u","65":"i","66":"S+I","67":"o","68":"S+O","69":"p","70":"S+P","71":"a","72":"s","73":"S+S","74":"d","75":"S+D","76":"f","77":"g","78":"S+G","79":"h","80":"S+H","81":"j","82":"S+J","83":"k","84":"l","85":"S+L","86":"z","87":"S+Z","88":"x","89":"c","90":"S+C","91":"v","92":"S+V","93":"b","94":"S+B","95":"n","96":"m","97":"C+Y","98":"C+U","99":"C+I","100":"C+O","101":"S+R","102":"S+U","103":"S+A","104":"S+F","105":"S+K","106":"S+X","107":"S+N","108":"S+M"};

function formatQwertyLabel(raw) {
    if (!raw) return '';
    const v = String(raw);
    const shifted = { '1':'!', '2':'@', '3':'#', '4':'$', '5':'%', '6':'^', '7':'&', '8':'*', '9':'(', '0':')' };
    if (v.startsWith('S+')) {
        const key = v.slice(2).toUpperCase();
        return shifted[key] || key;
    }
    if (v.startsWith('C+')) {
        const key = v.slice(2).toUpperCase();
        return '<span class="qwerty-ctrl-label"><span class="ctrl-mark">⌃</span><span class="ctrl-key">' + key + '</span></span>';
    }
    return v.toLowerCase();
}

// Numbers (numbered/movable-do notation), Solfège, and the
// katakana Do-Re-Mi variant all label by scale DEGREE within the octave
// (fixed to C=1/Do — this app has no key-transposition concept), unlike
// NOTE_NAME_DISPLAY above which is indexed by semitone. A black key gets
// its lower white neighbor's degree plus '#' (C#=1#) rather than its own
// symbol, the same convention movable-do notation uses for chromatic tones.
const DEGREE_OF_SEMITONE = { 0: 0, 2: 1, 4: 2, 5: 3, 7: 4, 9: 5, 11: 6 };
const PREV_DEGREE_OF_SEMITONE = { 1: 0, 3: 1, 6: 3, 8: 4, 10: 5 };
const NUMBER_DEGREES = ['1', '2', '3', '4', '5', '6', '7'];
const SOLFEGE_DEGREES = ['Do', 'Re', 'Mi', 'Fa', 'Sol', 'La', 'Si'];
const JAPANESE_DEGREES = ['ド', 'レ', 'ミ', 'ファ', 'ソ', 'ラ', 'シ'];

function degreeLabel(midi, degrees) {
    const semi = midi % 12;
    const whiteDegree = DEGREE_OF_SEMITONE[semi];
    if (whiteDegree !== undefined) return degrees[whiteDegree];
    return degrees[PREV_DEGREE_OF_SEMITONE[semi]] + '#';
}

function getNoteLabel(midi, mode) {
    if (mode === 'off') return '';
    if (mode === 'qwerty') return formatQwertyLabel(QWERTY_LABEL_MAP[midi]);
    if (mode === 'note') {
        // Just the pitch letter (C, C#, D, ...) with no octave suffix.
        // A "C4/D4/..." per-key label is a lot of glyph clutter on an 88-key
        // keyboard where the octave is already visually obvious from the
        // C-black-key groupings; the bare letter reads faster and lines up
        // with the unified Quicksand label style used by every other mode.
        return NOTE_NAME_DISPLAY[midi % 12];
    }
    if (mode === 'number') return degreeLabel(midi, NUMBER_DEGREES);
    if (mode === 'solfege') return degreeLabel(midi, SOLFEGE_DEGREES);
    if (mode === 'japanese') return degreeLabel(midi, JAPANESE_DEGREES);
    // Octave markers only: label the C key of every octave (C2, C3, C4, ...)
    // and leave every other key blank. Reads as an octave-boundary guide
    // without cluttering the keyboard with a name on each key.
    if (mode === 'octave') {
        if (midi % 12 !== 0) return '';
        const octave = Math.floor(midi / 12) - 1;
        return 'C' + octave;
    }
    return '';
}

// The style this produces is identical for every white label, and identical for
// every black label -- it depends only on (mode, blackKey, whiteKeyWidth,
// blackKeyWidth, keyLabelScale), never on which key it is. But it used to be
// recomputed and re-assigned per element, and updateKeyLayout calls it for all
// 88 keys: ~1200 property writes plus a text re-layout of every label, and
// font-size writes force font-metric recomputation, which is one of the more
// expensive things you can do per element on a phone.
//
// So compute it at most twice per pass (once white, once black) and skip the
// assignment when the element already carries that exact string. During a Piano
// Height or Piano Position drag no key width changes at all, so the cache key
// holds and all 88 assignments are skipped outright.
//
// The last-assigned string is stashed on the element rather than compared
// against style.cssText, because the browser normalises cssText on read, so a
// read-back would rarely string-equal what was written and the guard would
// never actually fire.
let _lblCacheKey = '';
let _lblWhiteCss = '';
let _lblBlackCss = '';
function updateKeyLabelStyle(labelEl, mode, blackKey) {
    if (!labelEl) return;
    const cacheKey = mode + '|' + (whiteKeyWidth || 0).toFixed(3) + '|'
        + getBlackKeyWidthPx().toFixed(3) + '|'
        + (typeof keyLabelScale === 'number' ? keyLabelScale : 100);
    if (cacheKey !== _lblCacheKey) { _lblCacheKey = cacheKey; _lblWhiteCss = ''; _lblBlackCss = ''; }
    const cached = blackKey ? _lblBlackCss : _lblWhiteCss;
    if (cached) {
        if (labelEl.__lblCss !== cached) { labelEl.style.cssText = cached; labelEl.__lblCss = cached; }
        return;
    }
    const opacity = mode === 'off' ? '0' : '1';
    // Unified Quicksand across every label mode — note-name, octave AND
    // QWERTY. The old monospace stack ('JetBrains Mono') for QWERTY made the
    // letters look like a different UI system had been dropped onto the
    // keyboard; matching the note-name font keeps the label layer one
    // consistent typographic voice regardless of what the user has picked.
    const fontFamily = "'Quicksand',sans-serif";
    let letterSpacing, fontWeight, textTransform, textDecorationLine,
        textDecorationThickness, textUnderlineOffset, fontSizePx,
        bottom, color, textShadow;
    if (mode === 'qwerty') {
        letterSpacing = blackKey ? '0.025em' : '0.015em';
        fontWeight = blackKey ? '900' : '800';
        textTransform = 'none';
        textDecorationLine = 'none';
        textDecorationThickness = 'auto';
        textUnderlineOffset = 'auto';
        fontSizePx = (blackKey
            ? Math.max(11, Math.min(getBlackKeyWidthPx() * 0.46, 18))
            : Math.max(13, Math.min(whiteKeyWidth * 0.43, 21)));
        bottom = blackKey ? '12%' : '6%';
        color = blackKey ? 'rgba(255,255,255,0.98)' : 'rgba(82,86,92,0.82)';
        textShadow = blackKey
            ? '0 1px 0 rgba(0,0,0,0.95), 0 0 5px rgba(255,255,255,0.22)'
            : '0 1px 0 rgba(255,255,255,0.78)';
    } else if (mode === 'octave') {
        // Unlike 'note'/'qwerty' (7px floor — those need every key legible
        // at once), octave labels are the one thing this app is willing to
        // show at all in cramped portrait layouts, so let it actually shrink
        // to whatever the key can hold instead of forcing a floor that makes
        // "C4" wider than a razor-thin 88-key white key and spilling into
        // its neighbour.
        letterSpacing = '-0.02em';
        fontWeight = '800';
        textTransform = 'none';
        textDecorationLine = 'none';
        textDecorationThickness = 'auto';
        textUnderlineOffset = 'auto';
        fontSizePx = Math.max(4, Math.min(whiteKeyWidth * 0.62, 12));
        bottom = '6%';
        // Was '' (falls through to the shared CSS default,
        // .key-label/.black-label at 0.54/0.64 alpha) -- same low-contrast
        // issue as 'note'/'number' had, now given the same fix: the
        // explicit, higher-contrast value 'qwerty' already used.
        color = blackKey ? 'rgba(255,255,255,0.98)' : 'rgba(82,86,92,0.82)';
        textShadow = '';
    } else if (mode === 'number' || mode === 'solfege' || mode === 'japanese') {
        // Black-key labels here are 2-4 chars ("1#", "Sol#", "ファ#") vs the
        // single glyph 'note' mode's 0.36 multiplier below was tuned for —
        // at that ratio "Sol#" was overflowing/squishing against its
        // neighbour. White keys keep the 'note' sizing: even "Sol"/"ファ"
        // fits fine at that width (there's no black-key-style width limit
        // pressing on them).
        letterSpacing = blackKey ? '-0.02em' : '0';
        fontWeight = '700';
        textTransform = 'none';
        textDecorationLine = 'none';
        textDecorationThickness = 'auto';
        textUnderlineOffset = 'auto';
        // White-key size bumped ~132% (0.36/22/8 -> 0.475/29/11) -- user
        // reported it read too small against 'qwerty''s size at the same
        // key width. Black keys are untouched (only the white-key size was
        // reported as an issue, and "Sol#"/"ファ#" are already tuned tight
        // above). Color also given the same explicit, higher-contrast value
        // 'qwerty' already uses below instead of falling through to the
        // shared CSS default (.key-label/.black-label at 0.54/0.64 alpha),
        // which read as too faint ("susah dilihat").
        fontSizePx = (blackKey
            ? Math.max(6, Math.min(getBlackKeyWidthPx() * 0.24, 11))
            : Math.max(11, Math.min(whiteKeyWidth * 0.475, 29)));
        bottom = blackKey ? '7%' : '6%';
        color = blackKey ? 'rgba(255,255,255,0.98)' : 'rgba(82,86,92,0.82)';
        textShadow = '';
    } else {
        letterSpacing = '0';
        fontWeight = '700';
        textTransform = 'none';
        textDecorationLine = 'none';
        textDecorationThickness = 'auto';
        textUnderlineOffset = 'auto';
        // Note-name baseline: bumped from (0.28 factor / 18 cap / 7 floor)
        // to (0.36 / 22 / 8) so C/C#/D/... reads at a comfortable size on
        // 34/56/88-key layouts, closer to the QWERTY label size. The user
        // can still fine-tune from the Label Size slider below.
        // White-key size bumped further, ~132% on top of that (0.36/22/8 ->
        // 0.475/29/11) and given the same explicit higher-contrast color
        // 'qwerty' uses -- see the 'number'/'solfege'/'japanese' branch
        // above for the full reasoning (same user report, same fix).
        fontSizePx = (blackKey
            ? Math.max(6, Math.min(getBlackKeyWidthPx() * 0.36, 15))
            : Math.max(11, Math.min(whiteKeyWidth * 0.475, 29)));
        bottom = blackKey ? '7%' : '6%';
        color = blackKey ? 'rgba(255,255,255,0.98)' : 'rgba(82,86,92,0.82)';
        textShadow = '';
    }
    // User-controlled scale (50–200%) — always applied last so it stacks on
    // top of whatever the per-mode formula produced. Guard on typeof so the
    // label pass at boot (before the state var initialises) can't NaN-out.
    if (typeof keyLabelScale === 'number' && keyLabelScale !== 100) {
        fontSizePx = fontSizePx * (keyLabelScale / 100);
    }
    // Black key labels are measured from the top of the chamfer, not from the
    // bottom of the key: --bk-face is the depth of that angled face (see the
    // black key 3D edge block in solo-piano.css), and sitting a label across
    // it costs contrast against the lighter plane and reads as sunken. Each
    // mode keeps the offset it was already tuned to — this only lifts the
    // whole set clear of the bevel, and follows automatically if the depth is
    // ever retuned. Written here rather than in CSS because this function
    // assigns cssText, so an inline bottom would beat any stylesheet rule.
    if (blackKey) {
        bottom = 'calc(var(--bk-face) + ' + bottom + ')';
    }
    const css =
        'opacity:' + opacity +
        ';font-family:' + fontFamily +
        ';letter-spacing:' + letterSpacing +
        ';font-weight:' + fontWeight +
        ';text-transform:' + textTransform +
        ';text-decoration-line:' + textDecorationLine +
        ';text-decoration-thickness:' + textDecorationThickness +
        ';text-underline-offset:' + textUnderlineOffset +
        ';font-size:' + fontSizePx + 'px' +
        ';bottom:' + bottom +
        (mode === 'qwerty' ? ';white-space:normal;overflow:visible;line-height:0.9' : '') +
        (color ? ';color:' + color : '') +
        (textShadow ? ';text-shadow:' + textShadow : '');
    if (blackKey) _lblBlackCss = css; else _lblWhiteCss = css;
    if (labelEl.__lblCss !== css) { labelEl.style.cssText = css; labelEl.__lblCss = css; }
}

// Auto-detect the input surface once at boot: a coarse-pointer / touch
// device (phone, tablet, iPhone/iPad) can't type on the piano so a keyboard
// map would be dead weight there — it defaults to octave markers, which
// double as a spatial guide for a small screen. A pointer device (desktop
// / laptop) defaults to the QWERTY map so the shortcut for each key is
// visible right away without hunting for the picker. matchMedia is the
// authoritative signal (browsers gate touch/pointer capabilities through
// it); the userAgent regex is a fallback for niche browsers that lie about
// the media query. Either signal → mobile default.
const IS_TOUCH_DEVICE = (function(){
    try {
        if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) return true;
    } catch (e) {}
    return /Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(navigator.userAgent || '');
})();
let labelMode = IS_TOUCH_DEVICE ? 'octave' : 'qwerty';
// Key Label Size (50–200%): multiplier applied to the fontSizePx computed by
// updateKeyLabelStyle for every mode. Lets the player nudge a comfortable
// reading size without picking a wider Note-Style. Persisted with the preset.
let keyLabelScale = 100;
let pianoTheme = 'default';
let blackKeyWidthPercent = 120;
let blackKeyHeightPercent = 60;
// Percent of --kw (white key width), not of the black key's own height --
// see updateBlackKeyEdgeVars() for why. 40 reproduces the old fixed
// 10%-of-height default's on-screen depth at a typical desktop kw.
let blackKeyEdgeDepthPercent = 40;
let pianoVisibilityPercent = 100;
let pianoLiftPercent = 0;

function getEffectiveVisibleWhiteCount(){
    return Math.max(1, Math.min(ALL_WHITE.length, Math.round(Number(wCount) || 52)));
}
// ── Key count -> visual proportion ───────────────────────────────────────
// Showing fewer keys across the same viewport makes every key WIDER. Nothing
// used to follow that: cutting 52 white keys down to 7 made each key 7.4x
// wider while the piano stayed exactly as tall, so the keys turned into squat
// stubs. That is the "kurangin jumlah key, ga ada efek apa-apa" report -- the
// count changed, the proportion did not.
//
// Real piano apps keep the key looking like a key, so height has to follow
// width. Not one-for-one, though: matching the aspect ratio exactly would put
// a 20-key board at 104% of the screen. What the eye wants is a PARTIAL share
// of the width gain, which is a power law.
//
//     gain   = 52 / visibleWhiteKeys        (how much wider each key got)
//     height = gain ^ GAMMA
//
// GAMMA is fitted to the proportion the user asked for -- 88 keys at 40%
// should read the same as 33 keys at 60%:
//
//     ln(60/40) / ln(52/20) = 0.4243
//
// It is a continuous curve, so it works at EVERY count, not just the three
// presets: 44 white -> 42.9%, 36 -> 46.7%, 24 -> 55.3%, 12 -> 74.1%.
//
// The bevel gets the mirror of the same law. --bk-face is measured in key
// WIDTHS, so it already takes the full `gain`; to keep its depth-to-key-height
// ratio constant it has to give back everything the height did not take,
// which is gain^(GAMMA-1). Both scales come from one number and are 1.0 at the
// full 88-key board, so the default piano is untouched.
//
// Both are pure functions of key count and viewport -- no stored state, no
// flag, nothing written back into a setting. Changing the count and changing
// it back lands on exactly the same pixels.
const PIANO_REF_WHITE_KEYS = 52;
const PIANO_KEYCOUNT_GAMMA = 0.4243;
function keyWidthGain(){
    return PIANO_REF_WHITE_KEYS / getEffectiveVisibleWhiteCount();
}
function keyCountHeightScale(){ return Math.pow(keyWidthGain(), PIANO_KEYCOUNT_GAMMA); }
function keyCountEdgeScale(){ return Math.pow(keyWidthGain(), PIANO_KEYCOUNT_GAMMA - 1); }
// Piano Height and Black Key Edge Depth are both expressed against the key
// count, so each carries a reference value: what it would read on the full
// 52-white-key board. The SETTING stays the number in force right now -- the
// one on the slider, the one that gets saved -- and the reference is what that
// number is recomputed FROM whenever the count changes.
//
// That ordering matters. Recomputing the setting from its own previous value
// would be PREVIOUS + PATCH and would drift over repeated changes; recomputing
// it from the reference is BASE + SETTINGS, so 52 -> 20 -> 52 lands back on
// exactly the number it started on. And because the setting itself moves, the
// slider never claims 40% while the piano is really at 60%.
let pianoHeightRefPercent = 50;
let blackKeyEdgeRefPercent = 40;
// The ONLY place the key-count law is applied. Everything downstream reads the
// settings literally.
function reflowPianoForKeyCount(){
    // Clamped to 0..100 HERE, before applyPianoHeight sees it. The scale can
    // legitimately push a tall piano past 100 on a short board (70% at 52
    // white keys wants 105% at 20), and normalizePianoHeightPercent treats
    // anything above 100 as a legacy PIXEL value and divides it by the
    // viewport -- which silently turned that 105 into 23%. Clamping is the
    // honest answer anyway: 100% is the whole height budget, there is nothing
    // above it to give.
    applyPianoHeight(Math.max(0, Math.min(100, Math.round(pianoHeightRefPercent * keyCountHeightScale()))), true);
    applyBlackKeyEdgeDepth(Math.round(blackKeyEdgeRefPercent * keyCountEdgeScale()), true);
}
function getSwipeMaxOffset(){
    return Math.max(0, ALL_WHITE.length - getEffectiveVisibleWhiteCount());
}
function clampOffset(){ viewOffset=Math.max(0, Math.min(getSwipeMaxOffset(), viewOffset)); }
function clampPianoCustomPercent(value, fallback, min, max){
    const parsed = Math.round(Number(value));
    const safe = Number.isFinite(parsed) ? parsed : fallback;
    return Math.max(min, Math.min(max, safe));
}
function getBlackKeyWidthRatio(){
    return Math.max(0.7, Math.min(1.3, blackKeyWidthPercent / 100));
}
function formatLayoutPx(value){
    const n = Number(value);
    if(!Number.isFinite(n)) return '0px';
    // 1e5 precision keeps device-pixel-snapped values (multiples of 1/3, 1/1.5 ...)
    // intact; coarser rounding would knock them off the device-pixel grid.
    const v = Math.abs(n) < 0.000005 ? 0 : Math.round(n * 100000) / 100000;
    return v + 'px';
}
function getLayoutDpr(){
    return Math.max(1, Math.min(4, window.devicePixelRatio || 1));
}
function getDevicePixelCssSize(){
    return 1 / getLayoutDpr();
}
// Rounds a target CSS-px line thickness up to the nearest whole device
// pixel. A true device-pixel hairline (down to ~0.25px at DPR 4) renders
// fine live, but screenshot/screen-recording pipelines (JPEG/H.264 chroma
// subsampling, downscaling) resample at a different pixel grid and can
// drop or smear anything sub-pixel — that's why a thin line looked
// present, faint, or thick at random across boundaries. Keeping it a whole
// device pixel survives that re-encoding while staying crisp live.
function getSnappedLineWidth(targetCssPx){
    const dpr = getLayoutDpr();
    const devicePx = Math.max(1, Math.ceil((Number(targetCssPx) || 1) * dpr));
    return devicePx / dpr;
}
function getSeparatorLineWidth(){
    return getSnappedLineWidth(1);
}
function snapLayoutValue(value){
    const n = Number(value);
    if(!Number.isFinite(n)) return 0;
    const dpr = getLayoutDpr();
    return Math.round(n * dpr) / dpr;
}
function getBlackKeyBaseRatio(){
    const width = Math.max(1, whiteKeyWidth || 1);
    if(width < 15) return 0.52;
    if(width < 20) return 0.56;
    if(width < 28) return 0.60;
    return 0.64;
}
function getPianoViewportWidth(){
    const vp = document.getElementById('pianoViewport');
    if(!vp) return 0;
    const r = vp.getBoundingClientRect();
    const rectW = r && Number.isFinite(r.width) ? r.width : 0;
    const layoutW = vp.clientWidth || vp.offsetWidth || 0;
    return Math.max(0, rectW || layoutW);
}
const whiteKeyEdges = [];
const whiteKeyWidths = [];
function syncWhiteKeyGeometry(viewportWidth){
    const rawWidth = Number(viewportWidth) || getPianoViewportWidth() || window.innerWidth || 1;
    const measuredWidth = Math.max(1, rawWidth);
    const visibleWhiteCount = getEffectiveVisibleWhiteCount();
    const nominalWhiteWidth = measuredWidth / visibleWhiteCount;
    const total = ALL_WHITE.length;
    whiteKeyWidth = nominalWhiteWidth;
    whiteKeyEdges.length = total + 1;
    whiteKeyWidths.length = total;
    whiteKeyEdges[0] = 0;
    for(let i=1; i<=total; i++){
        whiteKeyEdges[i] = snapLayoutValue(i * nominalWhiteWidth);
    }
    for(let i=0; i<total; i++){
        whiteKeyWidths[i] = Math.max(getDevicePixelCssSize(), whiteKeyEdges[i + 1] - whiteKeyEdges[i]);
    }
    // --kw is the black key's scale unit: every bevel dimension in
    // solo-piano.css is expressed as a fraction of it (border 0.025x, chamfer
    // border 0.02x, label offset 0.17x). Publishing it here — the one place
    // white key width is ever recomputed — keeps the 3D edge proportional at
    // every zoom level and viewport instead of breaking apart on narrow
    // screens the way fixed px bevels do.
    if(pianoEl) pianoEl.style.setProperty('--kw', nominalWhiteWidth + 'px');
    updateBlackKeyEdgeVars();
    // Sketch/8-bit's ink border and chamfer cut scale down with --kw (see
    // solo-piano.css), but browsers floor a *rendered* solid border at
    // ~1 CSS px regardless of how small the calc() asks for -- past that
    // floor the border simply eats the whole key on a packed mobile
    // viewport (88 keys at ~7px each leaves under 2px of white showing
    // beside a black key). Below that width there's no CSS fix, so drop
    // the border/chamfer overlay outright and fall back to flat colour
    // fill only, the same way Default theme stays legible without one.
    document.body.classList.toggle('keys-hairline-compact', nominalWhiteWidth < 14);
}
// The chamfer's own depth (--bk-face) used to be a plain percentage,
// resolved against the black key's own height. That looked fine on a
// typical desktop where keys are short and wide, but fell apart in
// portrait: the piano's height comes from viewport HEIGHT while its width
// (and so --kw) comes from viewport WIDTH divided across the key count --
// two independent axes. In portrait --kw collapses (keys go from a ~6.5:1
// height:width ratio on desktop to ~22:1 on a narrow phone) while key
// height barely moves, so a height-relative face stayed the same absolute
// depth while the key it sat on got razor-thin -- the same percentage that
// read as a shallow, believable bevel on desktop read as a tall spike on
// a phone. Sizing the face off --kw instead (the same unit the border and
// clip-path taper already use) keeps the face's own proportions constant
// relative to the key's width regardless of orientation, so one number
// works everywhere instead of needing a different setting per orientation.
//
// --bk-cut (where the body gradient hands off to the chamfer, so the
// wedge the taper's clip-path exposes at the corners shows a matching dark
// tone instead of an arbitrary mid-gradient color) still has to be
// expressed as a percentage, because it's consumed inside a background
// gradient on the black key itself, where percentages resolve against the
// key's own rendered height -- a different box than --bk-face's calc(kw *
// ratio) now targets. So this converts the face's absolute px depth into
// the equivalent percentage of the key's actual height, recomputed
// whenever either dependency (kw, piano height, or black key height%)
// changes, instead of the two being linked by a fixed formula that only
// held at one specific aspect ratio.
// Writes every black-key-dependent value straight onto the 36 black key
// elements, NOT onto #piano or :root.
//
// This is the same rule applyPianoGeom documents, and it is what makes the
// Black Key Height / Edge Depth sliders (and the key-count change, which also
// recomputes these) hit 60fps. Measured on a Poco X3 Pro-like profile
// (393px @2.75 DPR, 6x CPU throttle), driving a slider at full speed and
// sampling presented frames:
//
//   --black-key-height on :root ............ 20 fps
//   the same variable on #piano ............ 30 fps
//   values written per black key element ... 60 fps
//
// A custom property is inherited, so setting one on #piano (the parent of all
// 88 white + 36 black keys) dirties the computed style of every one of them.
// Writing onto the 36 elements that actually consume the value costs 36 cheap
// self-invalidations instead. Note this is NOT about the gradients being
// expensive to paint -- flattening every key background to a solid colour was
// measured and changed nothing; the cost is the style-recalc walk itself.
//
// --bk-face/--bk-cut are consumed by `.black` and its ::before/::after (which
// inherit from their own element, so per-key scoping reaches them), and by the
// --piano-black-body gradient on `.black` itself.
//
// --kw is deliberately left on #piano: it measured 59.5fps there, so moving it
// would be churn for no gain.
function updateBlackKeyEdgeVars(){
    if(!pianoEl) return;
    // Literally the setting. The key-count law is applied once, up in
    // reflowPianoForKeyCount, by moving the setting itself -- so what the
    // slider reads is always what is actually being drawn.
    const effectiveEdgeDepthPercent = blackKeyEdgeDepthPercent;
    const facePx = (whiteKeyWidth || 0) * (effectiveEdgeDepthPercent / 100);
    const pianoHeightPx = parseFloat(currentPianoHeightPx) || 0;
    const hPct = (typeof blackKeyHeightPercent === 'number' ? blackKeyHeightPercent : 60);
    const keyHeightPx = pianoHeightPx * (hPct / 100);
    const cutPercent = keyHeightPx > 0
        ? Math.max(0, Math.min(100, 100 - (facePx / keyHeightPx * 100)))
        : (100 - effectiveEdgeDepthPercent);
    const faceStr = facePx.toFixed(2) + 'px';
    const cutStr = cutPercent.toFixed(2) + '%';
    const heightStr = hPct + '%';
    // Only touch a property whose value actually changed. This matters a lot on
    // slow hardware: writing all three onto all 36 keys measured 22.3ms at 6x
    // CPU throttle, and the three have genuinely different dependencies, so most
    // interactions only move one of them --
    //   --bk-face: whiteKeyWidth x edgeDepth%  (NOT height -- so it is constant
    //              through a whole Black Key Height or Piano Height drag)
    //   --bk-cut:  depends on height as well
    //   height:    the Black Key Height slider only
    // The element loop is skipped entirely when nothing moved, which is the
    // common case for repeat calls from updateKeyLayout.
    const faceChanged = faceStr !== _lastBkFace;
    const cutChanged = cutStr !== _lastBkCut;
    const heightChanged = heightStr !== _lastBkHeight;
    if(faceChanged || cutChanged || heightChanged){
        for(let i=0; i<blackKeyEls.length; i++){
            const b = blackKeyEls[i];
            if(!b) continue;
            if(faceChanged) b.style.setProperty('--bk-face', faceStr);
            if(cutChanged) b.style.setProperty('--bk-cut', cutStr);
            // Replaces the old `--black-key-height` on :root. `.black`'s
            // stylesheet rule (height: var(--black-key-height, 60%)) carries no
            // !important, so this inline height wins.
            if(heightChanged) b.style.height = heightStr;
        }
        _lastBkFace = faceStr;
        _lastBkCut = cutStr;
        _lastBkHeight = heightStr;
    }
    // The pressed-key overlay pieces (.active-key-black / .active-key-white-top
    // / .active-key-white-bottom / .active-key-white-bottom-glow) also size
    // themselves off --black-key-height, but they live in #activeKeyLayer -- a
    // SIBLING of #piano -- so they cannot inherit it from a key. Give that one
    // layer the variable; its only children are the pooled overlay divs, so the
    // invalidation is negligible. Without this, changing Black Key Height left
    // every pressed-key highlight stuck at the 60% default.
    if(activeKeyLayer) activeKeyLayer.style.setProperty('--black-key-height', heightStr);
    // Same reason for --bk-face: the mirrored key label (appendActiveKeyLabel)
    // reuses the real label's inline `bottom: calc(var(--bk-face) + 7%)`, and
    // without the value here it would fall back to the stylesheet's 11px and
    // sit ~2px off the label it is standing in for.
    if(activeKeyLayer) activeKeyLayer.style.setProperty('--bk-face', faceStr);
}
function getWhiteKeyLeftPx(whiteIndex){
    const idx = Math.max(0, Math.min(ALL_WHITE.length, Math.round(Number(whiteIndex) || 0)));
    return whiteKeyEdges[idx] ?? (idx * whiteKeyWidth);
}
function getWhiteKeyWidthPx(whiteIndex){
    const idx = Math.max(0, Math.min(ALL_WHITE.length - 1, Math.round(Number(whiteIndex) || 0)));
    return whiteKeyWidths[idx] || Math.max(1, whiteKeyWidth);
}
function getViewOffsetPx(offset){
    const raw = Number(offset);
    const idx = Math.round(raw);
    if(Number.isFinite(idx) && Math.abs(idx - raw) < 0.0001) return getWhiteKeyLeftPx(idx);
    // Fractional offsets (mid-swipe) still snap to the device-pixel grid so
    // the whole keybed never rests at a sub-pixel translation.
    return snapLayoutValue(Math.max(0, raw || 0) * whiteKeyWidth);
}
function findWhiteIndexAtPianoX(x){
    if(!whiteKeyEdges.length) return Math.floor(x / whiteKeyWidth);
    let lo = 0;
    let hi = ALL_WHITE.length - 1;
    while(lo <= hi){
        const mid = (lo + hi) >> 1;
        if(x < getWhiteKeyLeftPx(mid)) hi = mid - 1;
        else if(x >= getWhiteKeyLeftPx(mid + 1)) lo = mid + 1;
        else return mid;
    }
    return Math.max(0, Math.min(ALL_WHITE.length - 1, lo));
}
function getBlackKeyWidthPx(){
    // Integer physical pixels: every black key is the exact same number of
    // device pixels wide on every DPR.
    const dpr = getLayoutDpr();
    const rawWidth = whiteKeyWidth * getBlackKeyBaseRatio() * getBlackKeyWidthRatio();
    return Math.max(1, Math.round(rawWidth * dpr)) / dpr;
}
function getBlackKeyCenterPx(whiteIndex){
    return getWhiteKeyLeftPx((Math.round(Number(whiteIndex) || 0)) + 1);
}
function getBlackKeyLeftPx(whiteIndex){
    // Integer-physical maths end to end, ONE rounding step. The old path
    // rounded the centre, the width, and their difference separately, so
    // each black key picked up an independent ±0.5-device-px error —
    // adjacent gaps inside a group could differ by up to 3 physical px
    // (visibly uneven black-key groups on fractional-DPR phones such as
    // DPR 2.75 Androids in portrait). Deriving the left edge from an
    // integer centre minus half an integer width keeps every gap within
    // the unavoidable ±1 device px of the white-key grid itself.
    const dpr = getLayoutDpr();
    const centerPhys = Math.round(getBlackKeyCenterPx(whiteIndex) * dpr);
    const wPhys = Math.max(1, Math.round(getBlackKeyWidthPx() * dpr));
    return (centerPhys - (wPhys >> 1)) / dpr;
}
function getBlackKeyBoundsForWhiteIndex(whiteIndex){
    if(whiteIndex < 0 || whiteIndex >= ALL_WHITE.length - 1) return null;
    const midi = ALL_WHITE[whiteIndex] + 1;
    if(!isBlack(midi)) return null;
    const left = getBlackKeyLeftPx(whiteIndex);
    const width = getBlackKeyWidthPx();
    return { midi, left, right: left + width, center: left + width / 2, width };
}
function getPianoTotalWidthPx(){
    return whiteKeyEdges[ALL_WHITE.length] || (ALL_WHITE.length * whiteKeyWidth);
}
// Paints the boundary lines for one separator strip into `canvas`.
// `includeBoundary(i)` decides which of the ALL_WHITE.length-1 boundaries
// get a line in THIS strip — see renderPianoSeparators for why the top and
// bottom strips need different sets.
// Vertical resolution of the separator bitmap: split into RES_ROWS physical
// rows and stretched via a plain CSS height:100% (NOT a percentage/calc
// split across two separately-positioned canvases — that was tried and
// proved unreliable: a <canvas> is a replaced element with its own
// intrinsic width/height attributes, and Chromium would not consistently
// honour an explicit height on it once two of them needed independent
// top/height values, which showed up as a visible seam / thinner line
// right at the black-key-height boundary on the E/F, B/C boundary). A
// single canvas with vertically-varying content and one uniform CSS
// height:100% sidesteps the whole replaced-element sizing ambiguity —
// that's the one sizing mode already confirmed to work correctly. 100 rows
// gives 1%-of-key-height granularity, comfortably finer than needed since
// blackKeyHeightPercent only moves in whole percent steps (45-75).
const SEPARATOR_RES_ROWS = 100;
function renderPianoSeparators(){
    if(!pianoSeparatorLayer) return;
    // DOM boxes can NEVER be device-pixel-exact on fractional DPRs (2.625,
    // 2.75 ... — most Android phones): the layout engine quantizes every
    // coordinate to 1/64 CSS px, so each boundary lands at a different
    // sub-pixel phase and antialiases differently — some separators render
    // 2 physical px, others 3, and screenshot/recorder resampling amplifies
    // the difference. So the separators are painted into a CANVAS whose
    // backing store is real physical pixels: every line is an integer-
    // coordinate fillRect, bit-identical at every boundary on every DPR.
    // image-rendering:pixelated (set in CSS) keeps the horizontal mapping
    // nearest-neighbour so nothing re-blurs at composite time.
    const dpr = getLayoutDpr();
    const totalWidth = getPianoTotalWidthPx();
    const wPhys = Math.max(1, Math.round(totalWidth * dpr));
    // Slim but recording-proof: 1 physical px at DPR 1, 2 at DPR 2–3, 4 at 4.
    const lineW = Math.max(1, Math.round(dpr * 1.0));
    if(pianoSeparatorLayer.width !== wPhys) pianoSeparatorLayer.width = wPhys;
    if(pianoSeparatorLayer.height !== SEPARATOR_RES_ROWS) pianoSeparatorLayer.height = SEPARATOR_RES_ROWS;
    pianoSeparatorLayer.style.width = (wPhys / dpr) + 'px';
    const sctx = pianoSeparatorLayer.getContext('2d');
    sctx.clearRect(0, 0, wPhys, SEPARATOR_RES_ROWS);
    // A black key always physically sits on top of the boundary between the
    // two white keys on either side of it, in its own height range (the top
    // rows, up to blackKeyHeightPercent) — same as a real piano, the black
    // key covers that seam there in every state, idle or pressed, so those
    // rows only draw boundaries with no black key at all (E/F, B/C). Below
    // that split (the bottom rows, the exposed front of the white keys)
    // nothing ever covers the seam, black key or otherwise, so every
    // boundary gets a line there regardless.
    const splitRow = Math.round(SEPARATOR_RES_ROWS * (blackKeyHeightPercent / 100));
    const _blackBoundaryWhiteIdx = new Set(BLACK_META.map(b => b.whiteIndex));
    for(let i=1; i<ALL_WHITE.length; i++){
        const yStart = _blackBoundaryWhiteIdx.has(i - 1) ? splitRow : 0;
        const rowCount = SEPARATOR_RES_ROWS - yStart;
        if(rowCount <= 0) continue;
        // Centre the line on the physical-pixel boundary; integer maths, so
        // there is no tie-breaking and every line rasterizes identically.
        const xPhys = Math.round(getWhiteKeyLeftPx(i) * dpr);
        const x0 = xPhys - (lineW >> 1);
        // 1-physical-px feather on each side: on the live screen it reads as
        // subtle antialiasing, but it band-limits the line so screenshot /
        // screen-recorder downscaling integrates the same darkness at every
        // sub-pixel phase — no more lines fading in and out per boundary.
        sctx.fillStyle = 'rgba(8,10,13,0.32)';
        sctx.fillRect(x0 - 1, yStart, 1, rowCount);
        sctx.fillRect(x0 + lineW, yStart, 1, rowCount);
        sctx.fillStyle = 'rgba(8,10,13,0.80)';
        sctx.fillRect(x0, yStart, lineW, rowCount);
    }
}
function syncPianoCustomControl(rangeId, labelId, value){
    const range = document.getElementById(rangeId);
    const label = document.getElementById(labelId);
    if(range && range.value !== String(value)) range.value = String(value);
    if(label) label.textContent = value + '%';
}
// The three Black Key sliders (Width / Height / Edge Depth) rewrite inline
// styles on all 36 black keys on every tick, and each of those writes
// re-records that key's whole decoration: two stacked multi-stop gradients,
// the inset shadows, and the two chamfer pseudo-elements. body.layout-changing
// already exists to strip exactly that for the duration of a geometry change
// -- but none of these three ever entered it, so they kept paying full price
// while the Piano Height drag did not. Measured over a 40-tick drag at 4x CPU
// throttle, 88 keys, default theme: Width 303ms -> 176ms, Height 850ms ->
// 430ms, Edge Depth 838ms -> 561ms of recalc+layout+paint+raster.
//
// They fire from 'input' only, with no 'change' partner, so the way out is a
// debounce off the last tick rather than a `final` flag. An overlapping Piano
// Height drag self-heals: that path re-adds the class on every call.
//
// isEdge marks the one slider whose entire purpose IS the chamfer. The generic
// drag hides it, which would leave that slider setting a depth you cannot see,
// so it gets its own class to bring the face back (see the stylesheet).
let blackKeyDragTimer = null;
function markBlackKeyDragActive(isEdge){
    document.body.classList.add('layout-changing');
    // bk-face-lite is what actually hides the chamfer, and only a CONTINUOUS
    // drag sets it. The Edge Depth drag must not (that face is the thing it is
    // adjusting), and neither may a key-count change, which is one discrete
    // step where a face blinking out for 220ms reads as the bevel re-forming
    // rather than as a smooth drag.
    document.body.classList.toggle('bk-face-lite', !isEdge);
    document.body.classList.toggle('bk-edge-dragging', !!isEdge);
    if(blackKeyDragTimer) clearTimeout(blackKeyDragTimer);
    blackKeyDragTimer = setTimeout(() => {
        blackKeyDragTimer = null;
        document.body.classList.remove('layout-changing', 'bk-edge-dragging', 'bk-face-lite');
    }, 180);
}
function setBlackKeyWidthPercent(value){
    blackKeyWidthPercent = clampPianoCustomPercent(value, 120, 70, 130);
    syncPianoCustomControl('blackKeyWidthRange', 'blackKeyWidthVal', blackKeyWidthPercent);
    markBlackKeyDragActive(false);
    updateKeyLayout();
}
function setPianoScalePercent(){
    clampOffset();
    updateKeyLayout();
    if(typeof updateKeyHitCache === 'function') updateKeyHitCache();
    if(typeof updateNoteXCache === 'function') requestAnimationFrame(updateNoteXCache);
}
// Batches the Black Key Height% / Edge Depth% sliders' work into one rAF
// instead of running it synchronously on every raw slider tick. It never needs
// the full canvas-resize/key-layout pass the height slider triggers, since
// neither of these moves any key's x position or the piano's own box size.
//
// updateBlackKeyEdgeVars() now applies the height itself (per black key element
// -- see its comment for why that is what buys 60fps), so there is no separate
// --black-key-height write here any more.
function scheduleBlackKeyVisualUpdate(){
    if(blackKeyVisualRaf) cancelAnimationFrame(blackKeyVisualRaf);
    blackKeyVisualRaf = requestAnimationFrame(() => {
        blackKeyVisualRaf = null;
        updateBlackKeyEdgeVars();
        // The separator strips split at this same height, sized in pixels
        // (see renderPianoSeparators) -- re-render so they stay in sync.
        if(pendingSeparatorsDirty){
            if(typeof renderPianoSeparators === 'function') renderPianoSeparators();
            pendingSeparatorsDirty = false;
        }
    });
}
function setBlackKeyHeightPercent(value){
    blackKeyHeightPercent = clampPianoCustomPercent(value, 60, 45, 75);
    syncPianoCustomControl('blackKeyHeightRange', 'blackKeyHeightVal', blackKeyHeightPercent);
    pendingSeparatorsDirty = true;
    markBlackKeyDragActive(false);
    scheduleBlackKeyVisualUpdate();
}
// Writes the visible setting and redraws. Used both by the user-facing setter
// below and by reflowPianoForKeyCount, which is the only other thing allowed
// to move this value.
function applyBlackKeyEdgeDepth(value, deferVisual){
    blackKeyEdgeDepthPercent = clampPianoCustomPercent(value, 40, 10, 100);
    syncPianoCustomControl('blackKeyEdgeDepthRange', 'blackKeyEdgeDepthVal', blackKeyEdgeDepthPercent);
    // deferVisual is the key-count path. reflowPianoForKeyCount runs BEFORE
    // updateKeyLayout, so whiteKeyWidth here is still the OLD one -- and
    // --bk-face is whiteKeyWidth x depth%. Scheduling a pass now painted a
    // bevel sized for the key count you just left, and the layout pass
    // corrected it two frames later: measured --bk-face landing at 10.35px and
    // only reaching its real 12.75px at +45ms, which is the bevel visibly
    // "forming" after the keys had already resized. syncWhiteKeyGeometry()
    // calls updateBlackKeyEdgeVars() itself once the new width is in, so the
    // one correct pass is already on its way -- this just stops the wrong one.
    if(deferVisual) return;
    markBlackKeyDragActive(true);
    scheduleBlackKeyVisualUpdate();
}
// The entry point for a person moving the slider, a preset being restored, or
// factory defaults: whatever they ask for is what the board should read AT THE
// CURRENT KEY COUNT, so that is what gets stored as the reference.
function setBlackKeyEdgeDepthPercent(value){
    const eff = clampPianoCustomPercent(value, 40, 10, 100);
    blackKeyEdgeRefPercent = eff / keyCountEdgeScale();
    applyBlackKeyEdgeDepth(eff);
}
function setPianoVisibilityPercent(value){
    pianoVisibilityPercent = clampPianoCustomPercent(value, 100, 0, 100);
    document.documentElement.style.setProperty('--piano-visibility', (pianoVisibilityPercent / 100).toFixed(2));
    syncPianoCustomControl('pianoVisibilityRange', 'pianoVisibilityVal', pianoVisibilityPercent);
}

function syncActiveKeyLayerTransform(px){
    if(activeKeyLayer) activeKeyLayer.style.transform = `translate3d(-${px}px,0,0)`;
    // pianoSeparatorLayer lives as a sibling of #piano (see buildDOM), not a
    // child of it, so it needs the same scroll transform mirrored onto it —
    // see buildDOM's comment for why it can't just live inside #piano.
    if(pianoSeparatorLayer) pianoSeparatorLayer.style.transform = `translate3d(-${px}px,0,0)`;
    // Octave-line layer lives in .stage (not #pianoViewport) but must scroll
    // horizontally in lockstep with the piano so lines stay pinned to C keys.
    const octLayer = document.getElementById('octaveLinesLayer');
    if(octLayer) octLayer.style.transform = `translate3d(-${px}px,0,0)`;
}
// Overlay piece pool: reuse hidden <div>s instead of create+append on press and
// remove on release. The create/remove churn was the dominant per-press reflow
// cost during glissando / broken-chord spam; pooling keeps the exact same look
// with no DOM allocation or insertion/removal after warm-up.
const _overlayFreePool = [];
function _acquireOverlayPiece(){
    let el = _overlayFreePool.pop();
    if(!el){
        el = document.createElement('div');
        if(activeKeyLayer) activeKeyLayer.appendChild(el);
    }
    return el;
}
function _releaseOverlayPiece(el){
    if(!el) return;
    el.style.cssText = 'display:none';
    _overlayFreePool.push(el);
}
function clearActiveKeyOverlay(midi){
    const pieces = activeKeyOverlayMap.get(midi);
    if(!pieces) return;
    for(let i=0;i<pieces.length;i++) _releaseOverlayPiece(pieces[i]);
    activeKeyOverlayMap.delete(midi);
}
function shouldUseLightKeyVisual(){
    // Only drop the overlay when the perf governor is genuinely under pressure
    // AND many keys are held at once. Burst-/count-based flip-flopping here
    // caused the overlay to render on some keys and skip others mid-passage,
    // which read as inconsistent glow and jank. A single stable threshold keeps
    // the visual uniform; the real per-press savings come from emitting fewer
    // pieces per key (see renderActiveKeyOverlay), not from skipping keys.
    return getPerfPressureLevel() >= 3 && activeOverlayNotes.size >= 18;
}
function appendActiveKeyPiece(className, left, width, config){
    const piece = _acquireOverlayPiece();
    // Full reset: clears any prior taper custom-props / colour / display:none
    // from a previous use, and makes the reused element visible again.
    piece.style.cssText = '';
    piece.className = className;
    piece.style.left = formatLayoutPx(left);
    piece.style.width = formatLayoutPx(Math.max(1, width));
    if(config && config.whiteBottomTaper){
        const safeWidth = Math.max(1, Math.round(width));
        const leftCutPx = Math.max(0, Math.min(safeWidth * 0.32, config.leftCutPx || 0));
        const rightCutPx = Math.max(0, Math.min(safeWidth * 0.32, config.rightCutPx || 0));
        const taperDepthPct = Math.max(12, Math.min(28, config.taperDepthPct || 18));
        piece.classList.add('active-key-white-bottom-tapered');
        piece.style.setProperty('--active-white-left-cut-pct', ((leftCutPx / safeWidth) * 100).toFixed(2) + '%');
        piece.style.setProperty('--active-white-right-cut-pct', ((rightCutPx / safeWidth) * 100).toFixed(2) + '%');
        piece.style.setProperty('--active-white-taper-depth-pct', taperDepthPct.toFixed(2) + '%');
    }
    // A pooled div may still carry the label child from an earlier turn as a
    // label holder (see appendActiveKeyLabel); blank it so stale text can
    // never show through this piece.
    if(piece.__lbl && piece.__lbl.__lblHtml !== ''){ piece.__lbl.__lblHtml = ''; piece.__lbl.innerHTML = ''; }
    // Already attached to activeKeyLayer (on first acquire); reused pieces stay
    // put, so there is no append/remove cost on the hot path.
    return piece;
}
// The pressed colour is painted by #activeKeyLayer, a SIBLING of #piano, and
// #piano establishes its own stacking context (transform:translate3d) — so a
// label living inside a key can never paint above that colour, whatever
// z-index it is given. (Same trap documented for pianoSeparatorLayer in
// buildDOM.) Mirroring the label into the overlay is the placement that
// puts it over the colour while leaving the colour itself gapless — nothing
// is carved out of the fill. The holder is handed the key's own box, so every
// offset in the label's inline css (bottom:6%, calc(var(--bk-face) + 7%), the
// px font-size) resolves exactly where it does inside the key, and the css
// string is reused verbatim from the real label — updateKeyLabelStyle()
// already caches it per (mode, key width, label scale), so a press costs one
// cssText assignment, not a restyle.
function appendActiveKeyLabel(keyEl, black, left, width){
    if(!keyEl || labelMode === 'off') return null;
    const src = keyEl.firstChild;
    if(!src || !src.__lblCss) return null;
    const holder = _acquireOverlayPiece();
    holder.style.cssText = '';
    holder.className = black
        ? 'active-key-label-holder active-key-label-holder-black'
        : 'active-key-label-holder';
    holder.style.left = formatLayoutPx(left);
    holder.style.width = formatLayoutPx(Math.max(1, width));
    let lbl = holder.__lbl;
    if(!lbl){ lbl = document.createElement('div'); holder.__lbl = lbl; holder.appendChild(lbl); }
    lbl.className = black ? 'black-label' : 'key-label';
    if(lbl.__lblHtml !== src.innerHTML){ lbl.__lblHtml = src.innerHTML; lbl.innerHTML = src.innerHTML; }
    if(lbl.__lblCss !== src.__lblCss){
        lbl.__lblCss = src.__lblCss;
        lbl.style.cssText = src.__lblCss;
        // The theme sheets set the label colour with !important, so the ink
        // has to be !important too — otherwise the label reverts to a colour
        // chosen for the key's resting background instead of for the accent
        // now covering it.
        lbl.style.setProperty('color', black
            ? 'var(--accent-black-ink, rgba(255,255,255,0.97))'
            : 'var(--accent-white-ink, rgba(10,14,20,0.94))', 'important');
    }
    return holder;
}
function renderActiveKeyOverlay(midi, keyEl, color){
    if(!activeKeyLayer) return;
    clearActiveKeyOverlay(midi);
    if(!Number.isFinite(midi) || midi < 21 || midi > 108) return;
    const pieces = [];
    const black = keyEl ? keyEl.classList.contains('black') : isBlack(midi);
    const bw = getBlackKeyWidthPx();
    // The `.active-key-light` and `.active-key-glow-shell` pieces are opacity:0
    // unless `key-glow-on` is active, so when the Light effect is off (the
    // default) they are invisible DOM that still costs a create/layout/remove
    // on every press. Skipping them roughly halves overlay DOM churn — the
    // dominant per-press cost during glissandos and chord spam — with zero
    // visual change.
    const wantGlowPieces = (typeof keyGlowEnabled !== 'undefined') && keyGlowEnabled;
    if(black){
        const wIdx = whiteIndexMap.get(midi - 1);
        if(wIdx === undefined) return;
        const left = getBlackKeyLeftPx(wIdx);
        pieces.push(appendActiveKeyPiece('active-key-piece active-key-black', left, bw));
        if(wantGlowPieces){
            const lightPad = Math.max(3, bw * 0.34);
            pieces.push(appendActiveKeyPiece('active-key-light active-key-black-light', left - lightPad, bw + lightPad * 2));
        }
        const lblPiece = appendActiveKeyLabel(keyEl, true, left, bw);
        if(lblPiece) pieces.push(lblPiece);
    } else {
        const wIdx = whiteIndexMap.get(midi);
        if(wIdx === undefined) return;
        const left = getWhiteKeyLeftPx(wIdx);
        const width = getWhiteKeyWidthPx(wIdx);
        const right = left + width;
        const leftBlack = getBlackKeyBoundsForWhiteIndex(wIdx - 1);
        const rightBlack = getBlackKeyBoundsForWhiteIndex(wIdx);
        const topLeft = leftBlack ? Math.max(left, leftBlack.right) : left;
        const topRight = rightBlack ? Math.min(right, rightBlack.left) : right;
        const topWidth = Math.max(0, topRight - topLeft);
        const leftCut = Math.max(0, topLeft - left);
        const rightCut = Math.max(0, right - topRight);
        const taperLeft = leftCut > 0 ? leftCut * 0.78 : 0;
        const taperRight = rightCut > 0 ? rightCut * 0.78 : 0;
        const taperDepthPct = (taperLeft || taperRight) ? 18 : 0;
        if(topWidth > 0) pieces.push(appendActiveKeyPiece('active-key-piece active-key-white-top', topLeft, topWidth));
        if(topWidth > 0 && wantGlowPieces) pieces.push(appendActiveKeyPiece('active-key-light active-key-white-light', topLeft, topWidth));
        if(wantGlowPieces) pieces.push(appendActiveKeyPiece('active-key-glow-shell active-key-white-bottom-glow', left, width));
        pieces.push(appendActiveKeyPiece('active-key-piece active-key-white-bottom', left, width, {
            whiteBottomTaper: taperLeft > 0 || taperRight > 0,
            leftCutPx: taperLeft,
            rightCutPx: taperRight,
            taperDepthPct
        }));
        const lblPiece = appendActiveKeyLabel(keyEl, false, left, width);
        if(lblPiece) pieces.push(lblPiece);
    }
    // Apply per-player color override to overlay pieces
    if(color){
        // The label ink has to be re-derived from that same colour: a seat
        // colour at the light end of the range would otherwise inherit the
        // global accent's ink and disappear into its own key.
        const ink = keyInkFor(color);
        pieces.forEach(piece => {
            piece.style.setProperty('--accent-white', color);
            piece.style.setProperty('--accent-black', color);
            piece.style.setProperty('--accent-white-ink', ink);
            piece.style.setProperty('--accent-black-ink', ink);
        });
    }
    activeKeyOverlayMap.set(midi, pieces);
}
function setActiveKeyOverlay(keyEl, active, color){
    if(!keyEl) return;
    const midi = Number(keyEl.dataset.note);
    if(!Number.isFinite(midi)) return;
    if(active){
        if(shouldUseLightKeyVisual()){
            activeOverlayNotes.delete(midi);
            clearActiveKeyOverlay(midi);
            return;
        }
        activeOverlayNotes.add(midi);
        renderActiveKeyOverlay(midi, keyEl, color);
    } else {
        activeOverlayNotes.delete(midi);
        clearActiveKeyOverlay(midi);
    }
}
function refreshActiveKeyLayerGeometry(){
    // Octave lines are independent of activeKeyLayer, but every trigger that
    // rebuilds piano geometry also invalidates the C-key positions, so a
    // single hook here keeps both overlays in sync with the current layout.
    updateOctaveLinesLayout();
    if(!activeKeyLayer) return;
    const totalWhiteWidth = getPianoTotalWidthPx();
    activeKeyLayer.style.width = formatLayoutPx(totalWhiteWidth);
    syncActiveKeyLayerTransform(currentPianoTransformPx || 0);
    const notes = Array.from(activeOverlayNotes);
    activeKeyLayer.innerHTML = '';
    activeKeyOverlayMap.clear();
    // innerHTML wipe also detached every pooled piece — drop the stale pool so
    // acquire rebuilds fresh, attached elements.
    _overlayFreePool.length = 0;
    notes.forEach(midi => {
        const color = _resolveKeyColor(midi);
        renderActiveKeyOverlay(midi, noteElementMap.get(midi), color);
    });
}

// Rebuilds the child lines inside #octaveLinesLayer at every C key's left
// edge. Safe to call whether the feature is on or off — when off, the layer
// is display:none via CSS, so the children are laid out but not painted.
// Called after every piano rebuild (via refreshActiveKeyLayerGeometry) and
// whenever the toggle is flipped on. C notes span midi 24 (C1) through
// midi 108 (C8); each maps to a white-key index via whiteIndexMap.
function updateOctaveLinesLayout(){
    const layer = document.getElementById('octaveLinesLayer');
    if(!layer) return;
    const totalWhiteWidth = getPianoTotalWidthPx();
    layer.style.width = formatLayoutPx(totalWhiteWidth);
    layer.style.transform = `translate3d(-${currentPianoTransformPx || 0}px,0,0)`;
    // Width must be a whole device pixel like #pianoSeparatorLayer's lines
    // are (see renderPianoSeparators/getSnappedLineWidth) -- left is
    // already snapLayoutValue()'d to the device-pixel grid, but the CSS
    // rule's flat width:1px is only a whole device pixel at integer DPRs.
    // At fractional ones (2.625 on a lot of Android, and effectively
    // whatever a screenshot/recording pipeline's own resampling introduces
    // even at an integer DPR) that right edge lands sub-pixel and
    // antialiases a different amount at every boundary -- exactly the "some
    // thick, some thin, some invisible" report. inline !important is
    // required to beat Sketch/8-bit's own width overrides (inline
    // !important still wins there).
    const lineWidthPx = formatLayoutPx(getSnappedLineWidth(1));
    let html = '';
    for(let midi = 24; midi <= 108; midi += 12){
        const idx = whiteIndexMap.get(midi);
        if(idx === undefined) continue;
        const x = whiteKeyEdges[idx];
        if(x === undefined) continue;
        html += `<div class="octave-line" style="left:${formatLayoutPx(x)};width:${lineWidthPx} !important"></div>`;
    }
    layer.innerHTML = html;
}

function setOctaveLinesEnabled(on){
    octaveLinesEnabled = !!on;
    document.body.classList.toggle('octave-lines-on', octaveLinesEnabled);
    const track = document.getElementById('octaveLinesTrack');
    if(track) track.classList.toggle('active', octaveLinesEnabled);
    if(octaveLinesEnabled) updateOctaveLinesLayout();
}

// Chord Text Scale: 50%–200% multiplier applied to the chord readout
// (primary + secondary) via the `--chord-scale` custom property so the CSS
// font-size:calc(base * var(--chord-scale)) rules pick it up without a
// live style rewrite per input event. Persisted with the preset.
function setChordTextScale(pct){
    const n = Math.max(50, Math.min(200, Math.round(Number(pct)) || 100));
    chordTextScale = n;
    document.documentElement.style.setProperty('--chord-scale', (n / 100).toFixed(3));
    const slider = document.getElementById('chordTextSizeRange');
    if(slider && Number(slider.value) !== n) slider.value = String(n);
    const label = document.getElementById('chordTextSizeVal');
    if(label) label.textContent = n + '%';
}

// Key Label Size: 50%–200% multiplier for the note-name/octave/qwerty labels
// drawn on each key. updateKeyLabelStyle reads keyLabelScale directly, so we
// just re-run the label pass over the live key elements after mutating the
// state — no DOM rebuild. Persisted with the preset.
function setKeyLabelScale(pct){
    const n = Math.max(50, Math.min(200, Math.round(Number(pct)) || 100));
    keyLabelScale = n;
    const slider = document.getElementById('keyLabelSizeRange');
    if(slider && Number(slider.value) !== n) slider.value = String(n);
    const label = document.getElementById('keyLabelSizeVal');
    if(label) label.textContent = n + '%';
    if(typeof whiteKeyEls !== 'undefined' && whiteKeyEls && whiteKeyEls.length){
        for(let i = 0; i < whiteKeyEls.length; i++){
            const lbl = whiteKeyEls[i] && whiteKeyEls[i].firstChild;
            if(lbl) updateKeyLabelStyle(lbl, labelMode, false);
        }
    }
    if(typeof blackKeyEls !== 'undefined' && blackKeyEls && blackKeyEls.length){
        for(let i = 0; i < blackKeyEls.length; i++){
            const lbl = blackKeyEls[i] && blackKeyEls[i].firstChild;
            if(lbl) updateKeyLabelStyle(lbl, labelMode, true);
        }
    }
}

function buildDOM() {
    const vpW = getPianoViewportWidth();
    if(vpW === 0) { setTimeout(buildDOM, 50); return; }
    syncWhiteKeyGeometry(vpW);
    clampOffset();

    const frag = document.createDocumentFragment();
    whiteKeyEls = [];
    blackKeyEls = [];
    noteElementMap.clear();

    const totalWhiteWidth = getPianoTotalWidthPx();
    const bw = getBlackKeyWidthPx();

    ALL_WHITE.forEach((n,i) => {
        const k = document.createElement('div'); k.className='white note-tone-' + (n % 12); k.dataset.note=n;
        const wPx = getWhiteKeyWidthPx(i);
        k.style.cssText = `left:${formatLayoutPx(getWhiteKeyLeftPx(i))};width:${formatLayoutPx(wPx)};`;
        const lbl = document.createElement('div'); lbl.className='key-label';
        lbl.innerHTML = getNoteLabel(n, labelMode);
        updateKeyLabelStyle(lbl, labelMode, false);
        k.appendChild(lbl);
        whiteKeyEls.push(k);
        noteElementMap.set(n, k);
        frag.appendChild(k);
    });

    // pianoSeparatorLayer must NOT be a child of #piano: #piano establishes
    // its own stacking context (transform:translate3d) and gets scrolled via
    // its own transform, so anything appended inside it — no matter how high
    // its z-index — can never render above a genuine sibling like
    // #activeKeyLayer (the per-key press/glow overlay, z-index:70). That
    // was the actual bug behind the separator line vanishing under active
    // keys: bumping the canvas's own z-index did nothing because it was
    // trapped inside #piano's lower stacking level the whole time. Instead,
    // create it once and attach it as a sibling of #piano / #activeKeyLayer
    // under #pianoViewport (same pattern #activeKeyLayer and
    // #octaveLinesLayer already use), then keep it in sync via
    // syncActiveKeyLayerTransform() whenever the piano scrolls.
    if(!pianoSeparatorLayer){
        pianoSeparatorLayer = document.createElement('canvas');
        pianoSeparatorLayer.id = 'pianoSeparatorLayer';
        const pianoViewportEl = document.getElementById('pianoViewport');
        if(pianoViewportEl) pianoViewportEl.appendChild(pianoSeparatorLayer);
    }
    renderPianoSeparators();

    ALL_WHITE.forEach((n,i) => {
        const nextMidi = n+1;
        if(isBlack(nextMidi) && i < ALL_WHITE.length-1){
            const b = document.createElement('div'); b.className='black note-tone-' + (nextMidi % 12); b.dataset.note=nextMidi;
            const left = getBlackKeyLeftPx(i);
            b.style.cssText = `width:${formatLayoutPx(bw)};left:${formatLayoutPx(left)};`;
            const bLbl = document.createElement('div'); bLbl.className='black-label';
            bLbl.innerHTML = getNoteLabel(nextMidi, labelMode);
            updateKeyLabelStyle(bLbl, labelMode, true);
            b.appendChild(bLbl);
            blackKeyEls.push(b);
            noteElementMap.set(nextMidi, b);
            frag.appendChild(b);
        }
    });

    pianoEl.style.width = formatLayoutPx(totalWhiteWidth);
    const offsetPx = getViewOffsetPx(viewOffset);
    pianoEl.style.transition = 'none';
    pianoEl.style.transform = `translate3d(-${offsetPx}px,0,0)`;
    currentPianoTransformPx = offsetPx;
    noteCacheTransformPx = offsetPx;
    syncActiveKeyLayerTransform(offsetPx);
    pianoEl.style.left = '0px';
    pianoEl.innerHTML = '';
    pianoEl.appendChild(frag);
    refreshActiveKeyLayerGeometry();

    // Must run AFTER the black keys exist. syncWhiteKeyGeometry() above also
    // calls this, but it runs before this function has built blackKeyEls, so
    // that call writes to an empty list -- without this second pass the freshly
    // created keys would be left with no inline height/--bk-face/--bk-cut at
    // all (flat, wrong-height black keys after any rebuild). The cache reset is
    // required for the same reason: these are new elements with no inline style,
    // so the "unchanged" guard must not short-circuit them.
    invalidateBlackKeyStyleCache();
    updateBlackKeyEdgeVars();

    refreshKeyPresetUI();
    refreshWideKeyModeClass();
    requestAnimationFrame(updateNoteXCache);
}

(function watchDprChange(){
    // Re-run layout when devicePixelRatio changes (browser zoom, moving the
    // window to another monitor, OS display-scale change) so key edges and
    // separator lines re-snap to the NEW physical-pixel grid.
    try{
        const mq = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
        mq.addEventListener('change', () => { updateKeyLayout(); watchDprChange(); }, { once: true });
    }catch(e){}
})();
let layoutRaf = null;
function updateKeyLayout() {
    if(layoutRaf) return;
    layoutRaf = requestAnimationFrame(() => { layoutRaf = null; _updateKeyLayoutNow(); });
}
// The guts of updateKeyLayout(), callable directly and synchronously.
// updateKeyLayout() itself debounces multiple calls within the same frame down
// to one rAF-deferred pass -- right for ordinary callers, wrong for anything
// that must land in the SAME frame as the class/height changes it belongs
// with. A key-count change is exactly that: applyPianoHeight resizes the board
// synchronously, so deferring the pass that recomputes --bk-face/--bk-cut
// leaves one frame where the chamfer is sized for the board you just left.
function _updateKeyLayoutNow(){
    clampOffset();
    const vpW = getPianoViewportWidth();
    if(vpW === 0) return;

    if(pianoEl.children.length === 0){ buildDOM(); return; }

    syncWhiteKeyGeometry(vpW);
    clampOffset();
    const totalWhiteWidth = getPianoTotalWidthPx();
    const bw = getBlackKeyWidthPx();

    pianoEl.style.width = formatLayoutPx(totalWhiteWidth);
    renderPianoSeparators();

    for(let i=0; i<whiteKeyEls.length; i++){
        const wPx = getWhiteKeyWidthPx(i);
        whiteKeyEls[i].style.left = formatLayoutPx(getWhiteKeyLeftPx(i));
        whiteKeyEls[i].style.width = formatLayoutPx(wPx);
        const lbl = whiteKeyEls[i].firstChild;
        if(lbl) updateKeyLabelStyle(lbl, labelMode, false);
    }
    for(let i=0; i<blackKeyEls.length; i++){
        const b = blackKeyEls[i];
        const midi = parseInt(b.dataset.note);
        const wIdx = whiteIndexMap.get(midi - 1);
        if(wIdx !== undefined){
            b.style.width = formatLayoutPx(bw);
            b.style.left = formatLayoutPx(getBlackKeyLeftPx(wIdx));
        }
        const lbl = b.firstChild;
        if(lbl) updateKeyLabelStyle(lbl, labelMode, true);
    }

    const offsetPx = getViewOffsetPx(viewOffset);
    pianoEl.style.transition = 'none';
    pianoEl.style.transform = `translate3d(-${offsetPx}px,0,0)`;
    currentPianoTransformPx = offsetPx;
    noteCacheTransformPx = offsetPx;
    syncActiveKeyLayerTransform(offsetPx);
    pianoEl.style.left = '0px';
    refreshActiveKeyLayerGeometry();

    refreshKeyPresetUI();
    refreshWideKeyModeClass();
    invalidateWrapRect();
    updateNoteXCache();
}

function build() {
    clampOffset();
    const vpW = getPianoViewportWidth();
    if(vpW === 0) { setTimeout(build, 50); return; }
    buildDOM();
}

function setLabelMode(mode) {
    labelMode = mode;
    document.querySelectorAll('.label-option-vertical').forEach(opt => {
        opt.classList.toggle('active', opt.dataset.mode === mode);
    });
    if (whiteKeyEls && whiteKeyEls.length > 0) {
        for (let i = 0; i < whiteKeyEls.length; i++) {
            const k = whiteKeyEls[i];
            const lbl = k.firstChild;
            if (lbl) {
                lbl.innerHTML = getNoteLabel(parseInt(k.dataset.note), labelMode);
                updateKeyLabelStyle(lbl, labelMode, false);
            }
        }
        for (let i = 0; i < blackKeyEls.length; i++) {
            const k = blackKeyEls[i];
            const lbl = k.firstChild;
            if (lbl) {
                lbl.innerHTML = getNoteLabel(parseInt(k.dataset.note), labelMode);
                updateKeyLabelStyle(lbl, labelMode, true);
            }
        }
    }
}

document.querySelectorAll('.label-selector-vertical').forEach(selector => {
    selector.addEventListener('click', (ev) => {
        const opt = ev.target.closest('.label-option-vertical');
        if(opt && selector.contains(opt)) setLabelMode(opt.dataset.mode);
    });
});

// Sync every Key Labels picker (main panel + Settings panel) with the
// device-detected initial mode so its active pill matches what the piano
// is actually rendering. The HTML markup hard-codes the "Octave" option
// as .active; without this pass a PC user would see "Octave" highlighted
// in the panel while their keys were labelled with QWERTY glyphs.
document.querySelectorAll('.label-option-vertical').forEach(opt => {
    opt.classList.toggle('active', opt.dataset.mode === labelMode);
});

// opts.applyThemeDefaults (default true) controls whether switching theme
// also resets colors/FX to that theme's stock values. A direct user click on
// the Theme panel (or Reset Defaults) wants that reset -- but applySettings()
// restoring a saved preset does NOT: it already restored the user's own
// custom colors/FX moments earlier, and this batch used to unconditionally
// stomp them back to the theme's #0099ff/on-off defaults right afterward,
// which is why pressed-key/chord/falling-note color (and strikeLine FX) never
// survived Save Preset -> Load Preset. applySettings() passes
// { applyThemeDefaults: false } to skip this batch and leave its own
// restore as the final word.
// Sketch and 8-bit each establish their own body class, forced Colour Mode +
// defaults, and the same set of effect panels hidden/force-disabled (see the
// block below), and pick their own falling-note render path via the
// pianoTheme checks added to drawFallingNote (drawSketchFallingNote /
// draw8bitFallingNote) -- they aren't reachable from the normal Material
// picker on purpose, they're a whole-theme identity, not a mix-and-match
// style.
const THEMES = ['default', 'sketch', '8bit'];
// Sketch/8-bit force Strike Reaction/Note Glow/Key Light off below (their
// controls are hidden, so a leftover "on" would render with no way to turn
// it off) -- but going back to Default only ever restored Strike Line/Dust,
// never those three, so a user who had Strike Reaction on before trying a
// custom theme lost it silently and permanently on return. Snapshot whatever
// was actually running right before the FIRST hop away from Default, and put
// it back verbatim on the way back, instead of guessing at a fixed "default"
// value that doesn't account for what the user had set.
let _preThemeFx = null;
function setPianoTheme(theme, opts) {
    var applyDefaults = !opts || opts.applyThemeDefaults !== false;
    const _prevTheme = pianoTheme;
    pianoTheme = THEMES.includes(theme) ? theme : 'default';
    document.body.classList.toggle('theme-sketch', pianoTheme === 'sketch');
    document.body.classList.toggle('theme-8bit', pianoTheme === '8bit');
    const themeBtnIds = { default: 'themeDefault', sketch: 'themeSketch', '8bit': 'theme8bit' };
    Object.entries(themeBtnIds).forEach(([t, id]) => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('active', pianoTheme === t);
    });
    if (applyDefaults) {
        const enteringCustom = pianoTheme === 'sketch' || pianoTheme === '8bit';
        if (enteringCustom && _prevTheme === 'default' && !_preThemeFx) {
            _preThemeFx = { strikeLine: strikeLineEnabled, dust: strikeLineDustEnabled, strikeReaction: strikeReactionEnabled, noteGlow: noteGlowEnabled, keyGlow: keyGlowEnabled };
        }
        if (pianoTheme === 'sketch') {
            setAnimColor('#b23a2e'); // the same red pencil the falling notes/keys ink in
            setAnimModeById('mSingle');
            setKeyGlowEnabled(false);
            setChordDisplayColors({ primary: '#2a2a28', secondary: '#2a2a28' });
            setWhiteKeyColor('#f0b9ad'); // a light wash of the same red pencil
            setBlackKeyColor('#5a3c34');
        } else if (pianoTheme === '8bit') {
            setAnimColor('#ef4f9e'); // cartridge pink, matches the Theme Lab palette
            setAnimModeById('mSingle');
            setKeyGlowEnabled(false);
            setChordDisplayColors({ primary: '#f4c542', secondary: '#f4c542' });
            setWhiteKeyColor('#ef4f9e');
            setBlackKeyColor('#b52e73');
        } else {
            setAnimColor('#0099ff');
            if (_preThemeFx) {
                setStrikeLineFx('strikeLine', _preThemeFx.strikeLine);
                setStrikeLineFx('dust', _preThemeFx.dust);
                setStrikeLineFx('strikeReaction', _preThemeFx.strikeReaction);
                setNoteGlowEnabled(_preThemeFx.noteGlow);
                setKeyGlowEnabled(_preThemeFx.keyGlow);
                _preThemeFx = null;
            } else {
                setStrikeLineFx('strikeLine', true);
                setStrikeLineFx('dust', true);
            }
            setChordDisplayColors({ primary: '#0099ff', secondary: '#0099ff' });
            setWhiteKeyColor(DEFAULT_ACCENT_WHITE);
            setBlackKeyColor(DEFAULT_ACCENT_BLACK);
        }
    }
    // Sketch/8-bit both HIDE the Particles, Strike Line, Strike Reaction and
    // Note Glow controls entirely, so those effects must never be left ON
    // while one of them is active — there'd be no UI to turn them off.
    // Enforce this unconditionally, NOT just under applyDefaults: preset/
    // settings load calls this with applyThemeDefaults:false and would
    // otherwise restore a saved "on" state, leaving a hidden effect
    // rendering.
    if (pianoTheme === 'sketch' || pianoTheme === '8bit') {
        setStrikeLineFx('strikeLine', false);
        setStrikeLineFx('dust', false);
        setStrikeLineFx('strikeReaction', false);
        setNoteGlowEnabled(false);
        // Key Light was previously only DEFAULTED off on the theme-switch
        // click (see setPianoTheme's applyDefaults branch above), so loading
        // a saved preset with Key Light on while one of these themes was
        // active left it rendering with no visible control to turn it off --
        // the same "hidden effect still running" bug the comment above
        // already documents for Particles/Strike Line/Strike Reaction.
        // Enforced unconditionally here for the same reason those are.
        setKeyGlowEnabled(false);
    }
    // Rerun chord render so any chord already on screen picks up the new
    // shadow rules immediately — otherwise the previous theme's inline
    // text-shadow stays stuck until the next key press.
    if (typeof requestChordUpdate === 'function') requestChordUpdate();
    // Sketch/8-bit each override the octave line's rendering (see
    // updateOctaveLinesLayout) -- re-run it so switching theme updates
    // already-rendered lines immediately instead of waiting for the next
    // unrelated piano rebuild.
    if (typeof updateOctaveLinesLayout === 'function') updateOctaveLinesLayout();
}
document.getElementById('themeDefault')?.addEventListener('click', () => setPianoTheme('default'));
document.getElementById('themeSketch')?.addEventListener('click', () => setPianoTheme('sketch'));
document.getElementById('theme8bit')?.addEventListener('click', () => setPianoTheme('8bit'));

// Sketch theme keys used to get their hand-wobbled border from a live SVG
// filter (feTurbulence+feDisplacementMap, SMIL-animated) applied to every
// key's ::before individually. That's an animated filter effect on ~88
// elements at once -- mobile browsers rasterize SVG filters in software, and
// the SMIL <animate> keeps invalidating all 88 every frame, which is exactly
// the "severe lag on mobile" pattern. Dropped in favour of a plain static
// ink border (see body.theme-sketch .white::before/.black::before in
// css/solo/solo-piano.css) -- the hand-drawn feel still comes through via the
// wobbled falling notes (drawSketchFallingNote draws live on the canvas, a
// handful of notes at a time, nowhere near the same cost) and the notebook
// font/background/palette.

let cachedWrapRect = null;
function invalidateWrapRect() { cachedWrapRect = null; }

function updateKeyHitCache(){
    if(!whiteKeyWidth) return;
    const wrap = document.getElementById('pianoWrap');
    if(!wrap) return;
    if (!cachedWrapRect) cachedWrapRect = wrap.getBoundingClientRect();
    const r = cachedWrapRect;
    const blackW = getBlackKeyWidthPx();
    const blackBottom = (r.bottom - r.top) * (blackKeyHeightPercent / 100);
    const blackByBoundary = [];
    for(let i=0; i<BLACK_META.length; i++){
        const meta = BLACK_META[i];
        const boundary = meta.whiteIndex + 1;
        const left = getBlackKeyLeftPx(meta.whiteIndex);
        blackByBoundary[boundary] = { midi: meta.midi, left, right: left + blackW, bottom: blackBottom, el: noteElementMap.get(meta.midi) };
    }
    keyHitCache.wrapLeft = r.left;
    keyHitCache.wrapTop = r.top;
    keyHitCache.wrapBottom = r.bottom;
    keyHitCache.wrapHeight = r.bottom - r.top;
    keyHitCache.totalWidth = getPianoTotalWidthPx();
    keyHitCache.blackBottom = blackBottom;
    keyHitCache.blackByBoundary = blackByBoundary;
    keyHitCache.whiteEls = keyElFast && keyElFast.length ? keyElFast : [];
}
function updateNoteXCache(){
    if(!whiteKeyWidth) return;
    const newX = new Map();
    const newEl = new Map();
    const nextXFast = new Float32Array(128);
    nextXFast.fill(NaN);
    const nextElFast = new Array(128);
    for(let i=0; i<ALL_WHITE.length; i++){
        const midi = ALL_WHITE[i];
        const x = getWhiteKeyLeftPx(i) + getWhiteKeyWidthPx(i) / 2;
        newX.set(midi, x);
        nextXFast[midi] = x;
    }
    for(let i=0; i<BLACK_META.length; i++){
        const meta = BLACK_META[i];
        const x = getBlackKeyLeftPx(meta.whiteIndex) + getBlackKeyWidthPx() / 2;
        newX.set(meta.midi, x);
        nextXFast[meta.midi] = x;
    }
    for(let i=0; i<whiteKeyEls.length; i++){
        const n = parseInt(whiteKeyEls[i].dataset.note);
        if(!isNaN(n)){ newEl.set(n, whiteKeyEls[i]); nextElFast[n] = whiteKeyEls[i]; }
    }
    for(let i=0; i<blackKeyEls.length; i++){
        const n = parseInt(blackKeyEls[i].dataset.note);
        if(!isNaN(n)){ newEl.set(n, blackKeyEls[i]); nextElFast[n] = blackKeyEls[i]; }
    }
    noteXCache.clear(); for(const [k,v] of newX) noteXCache.set(k,v);
    keyElCache.clear(); for(const [k,v] of newEl) keyElCache.set(k,v);
    noteXFast.set(nextXFast);
    for(let i=0; i<nextElFast.length; i++) keyElFast[i] = nextElFast[i] || null;
    noteCacheTransformPx = 0;
    updateKeyHitCache();
}
const noteXCache=new Map();
const keyElCache=new Map();
const noteXFast = new Float32Array(128);
noteXFast.fill(NaN);
const keyElFast = new Array(128);
let currentPianoTransformPx = viewOffset * whiteKeyWidth;
let noteCacheTransformPx = viewOffset * whiteKeyWidth;
// No device sniffing: the default tier is always Default. Potato is a manual choice.
function _detectDefaultGraphicQuality(){ return 'default'; }
let graphicQuality = _detectDefaultGraphicQuality();
let performanceMode = 'manual';
function getEffectiveGraphicQuality(){
    return graphicQuality;
}
function getPerfPressureLevel(){
    if(perfGovScale < 0.66) return 3;
    if(perfGovScale < 0.76) return 2;
    if(perfGovScale < 0.86) return 1;
    return 0;
}
function getPressureScale(){
    const pressure = getPerfPressureLevel();
    return pressure >= 3 ? 0.34 : pressure === 2 ? 0.56 : pressure === 1 ? 0.78 : 1;
}
// Physical-pixel fill cost scales with canvas AREA (css width * height *
// dpr^2), not just DPR. A desktop/Mac at 1920x1080 @2x DPR rasterizes ~19x
// more pixels than a phone at 390x844 @2x DPR for the exact same particle/
// falling-note density -- every additively-blended dust sprite and every
// glow halo costs proportionally more GPU fill-rate there, yet nothing in
// the emission/cap logic used to account for it (only DPR was capped, never
// the area it's applied over). This scales visual density DOWN as physical
// area grows past a phone-sized reference, floored so a small screen never
// gets a density BOOST and a huge display still keeps a usable minimum.
const PIXEL_BUDGET_REFERENCE_AREA = 390 * 844 * 4; // ~reference phone, 2x DPR
function getCanvasPixelBudgetScale(){
    const w = canvasCssW || (window.innerWidth || 390);
    const h = canvasCssH || (window.innerHeight * 0.6 || 844);
    const dpr = currentDPR || Math.max(1, window.devicePixelRatio || 1);
    const area = Math.max(1, w * h * dpr * dpr);
    const scale = PIXEL_BUDGET_REFERENCE_AREA / area;
    return Math.max(0.28, Math.min(1, scale));
}
const GRAPHIC_PROFILES = {
    potato: { dust:0, dustMax:0, fallingMax:260, heavyFx:false, fallingLabel:false, shadow:0, burstDust:false },
    medium: { dust:0.55, dustMax:800, fallingMax:520, heavyFx:true, fallingLabel:false, shadow:0.35, burstDust:false },
    high: { dust:1, dustMax:2000, fallingMax:900, heavyFx:true, fallingLabel:true, shadow:1, burstDust:true },
    // Default tier — dustMax is still generous (16000) but harmless at that
    // size: spawning is separately hard-clamped to NEON_DUST_MAX (4096, the
    // fixed ring buffer's real capacity), so dustMax only ever matters when
    // it's the SMALLER number, which it never is here. fallingMax used to be
    // 100000 -- "generous" in the same spirit, but with no matching hard
    // buffer behind it (falling notes live in a plain, dynamically-sized
    // array), so it was really "no cap at all" for any file dense/loud
    // enough to matter. A long pedalled or dense passage could grow that
    // array without real bound, which is exactly the kind of unthrottled
    // per-frame cost that stalls the main thread hard enough to crash or
    // reset a weaker/laptop GPU -- user-reported as the app itself crashing
    // on "lagu yang volume keras" (loud/dense songs). 1400 is still well
    // above `high`'s 900 (default stays the best real tier) while actually
    // binding on genuinely extreme content. DPR and the governor apply the
    // same as every other tier, so an underpowered machine still gets
    // adaptive relief under load on top of this.
    default: { dust:1, dustMax:16000, fallingMax:1400, heavyFx:true, fallingLabel:true, shadow:1, burstDust:true }
};
const GRAPHIC_MODE_DEFAULTS = {
    // All tiers share IDENTICAL setting percentages so presets never shift
    // values between tiers; the only difference is Potato keeps heavy FX (dust) off.
    potato: { dust:false, particleCount:40, particleSize:50, particleOpacity:85, particleSpeed:55, particleTurbulence:55, particleSaturation:100, particleFade:40, strikeLineAuraSize:100, strikeLineBrightness:100, strikeLineOpacity:100, strikeLineSaturation:100 },
    medium: { dust:true, particleCount:40, particleSize:50, particleOpacity:85, particleSpeed:55, particleTurbulence:55, particleSaturation:100, particleFade:40, strikeLineAuraSize:100, strikeLineBrightness:100, strikeLineOpacity:100, strikeLineSaturation:100 },
    high: { dust:true, particleCount:40, particleSize:50, particleOpacity:85, particleSpeed:55, particleTurbulence:55, particleSaturation:100, particleFade:40, strikeLineAuraSize:100, strikeLineBrightness:100, strikeLineOpacity:100, strikeLineSaturation:100 },
    default: { dust:true, particleCount:40, particleSize:50, particleOpacity:85, particleSpeed:55, particleTurbulence:55, particleSaturation:100, particleFade:40, strikeLineAuraSize:100, strikeLineBrightness:100, strikeLineOpacity:100, strikeLineSaturation:100 }
};
const REMOTE_VISUAL_PROFILES = {
    potato: { level:'light' },
    medium: { level:'light' },
    high: { level:'full' },
    default: { level:'full' }
};
function getRemoteVisualLevel(){
    const q = getEffectiveGraphicQuality();
    const base = (REMOTE_VISUAL_PROFILES[q] || REMOTE_VISUAL_PROFILES.medium).level;
    const pressure = getPerfPressureLevel();
    if(base === 'full' && pressure >= 2) return 'light';
    return base === 'full' ? 'full' : 'light';
}
function remoteFallingOwnerId(playerId){ return `remote:${playerId || 'unknown'}`; }
function getGraphicProfile(){ const q=getEffectiveGraphicQuality(); return GRAPHIC_PROFILES[q] || GRAPHIC_PROFILES.high; }
function isLowGraphic(){ return getEffectiveGraphicQuality() === 'potato'; }
function isWideKeyMode(){ return wCount > 12; }
function refreshWideKeyModeClass(){
    document.body.classList.toggle('wide-key-mode', isWideKeyMode());
}
let inputBurstScore = 0;
let lastInputBurstAt = 0;
let inputBurstFrame = 0;
let inputBurstFrameCount = 0;
let inputBurstVisualTimer = null;
function updateInputBurstVisualMode(burst){
    const pressure = getPerfPressureLevel();
    if(pressure === 0 || (burst < 10 && inputBurstFrameCount < 7)) return;
    document.body.classList.add('input-burst-mode');
    if(inputBurstVisualTimer) clearTimeout(inputBurstVisualTimer);
    inputBurstVisualTimer = setTimeout(() => {
        inputBurstVisualTimer = null;
        document.body.classList.remove('input-burst-mode');
    }, 240);
}
function markInputBurst(){
    const now = performance.now();
    const frame = Math.floor(now / 16.7);
    inputBurstFrameCount = (frame === inputBurstFrame) ? Math.min(24, inputBurstFrameCount + 1) : 1;
    inputBurstFrame = frame;
    inputBurstScore = (now - lastInputBurstAt < 90) ? Math.min(18, inputBurstScore + 1 + (inputBurstFrameCount > 4 ? 1 : 0)) : 1;
    lastInputBurstAt = now;
    updateInputBurstVisualMode(inputBurstScore);
    return inputBurstScore;
}
function getBurstLevel(){
    const now = performance.now();
    if(now - lastInputBurstAt > 220) inputBurstScore = Math.max(0, inputBurstScore - 2);
    return inputBurstScore;
}
const fallingByMidi = new Map();
function registerFallingNote(f){
    let list = fallingByMidi.get(f.midi);
    if(!list){ list = []; fallingByMidi.set(f.midi, list); }
    list.push(f);
}
function markFallingReleased(midi, ownerId){
    const list = fallingByMidi.get(midi);
    if(!list || !list.length) return;
    const scoped = arguments.length > 1;
    const targetOwner = scoped ? String(ownerId || '') : '';
    let target = null;
    let targetIndex = -1;
    let w = 0;
    for(let i=0;i<list.length;i++){
        const f = list[i];
        if(!f || f.dead) continue;
        const fOwner = f.ownerId == null ? '' : String(f.ownerId);
        if(f.growing && fOwner === targetOwner){
            target = f;
            targetIndex = w;
        }
        list[w++] = f;
    }
    list.length = w;
    if(target) target.growing = false;
    if(targetIndex >= 0 && targetIndex < list.length){
        const item = list[targetIndex];
        list.splice(targetIndex, 1);
        list.push(item);
    }
    if(!list.length) fallingByMidi.delete(midi);
}
function unregisterDeadFalling(){
    if(!fallingByMidi.size) return;
    fallingByMidi.forEach((list, midi) => {
        let w = 0;
        for(let i=0;i<list.length;i++){
            const f = list[i];
            if(f && !f.dead) list[w++] = f;
        }
        list.length = w;
        if(!w) fallingByMidi.delete(midi);
    });
}
const _dustSpriteCache = new Map();
// Same real-LRU pattern as _spriteCache/_spriteUse below — this cache had no
// eviction at all, so dragging the Gradient Hue slider while Particles →
// Follow Falling Notes → Gradient is active (each integer hue step produces
// a new colour string) could accumulate one 192x192 canvas per distinct hue
// ever visited in a session, forever. Capped to the same ceiling _spriteCache
// uses; dust sprites are far smaller (192x192 vs falling-note sprite sizes)
// so this is a conservative, not tight, cap.
const _dustSpriteUse = new Map();
let _dustSpriteUseCounter = 0;
const _DUST_SPRITE_CACHE_MAX = 200;
function _dustSpriteCacheGet(key){
    const v = _dustSpriteCache.get(key);
    if(v !== undefined) _dustSpriteUse.set(key, ++_dustSpriteUseCounter);
    return v;
}
function _dustSpriteCacheSet(key, sprite){
    if(_dustSpriteCache.size >= _DUST_SPRITE_CACHE_MAX && !_dustSpriteCache.has(key)){
        let lruKey = null, lruVal = Infinity;
        _dustSpriteUse.forEach((v, k) => { if(v < lruVal){ lruVal = v; lruKey = k; } });
        if(lruKey != null){ _dustSpriteCache.delete(lruKey); _dustSpriteUse.delete(lruKey); }
    }
    _dustSpriteCache.set(key, sprite);
    _dustSpriteUse.set(key, ++_dustSpriteUseCounter);
}
function _parseColorToRgb(color){
    color = (color || '').trim();
    if(color.startsWith('#')){
        try { return hexToRgb(color); } catch(e){ return [120, 220, 255]; }
    }
    const m = color.match(/rgba?\(([^)]+)\)/i);
    if(m){
        const parts = m[1].split(',').map(p => parseFloat(p.trim()));
        return [parts[0]|0, parts[1]|0, parts[2]|0];
    }
    return [120, 220, 255];
}
function getDustSprite(color){
    const dpr = currentDPR || 1;
    const cacheKey = color + '@' + (Math.round(dpr * 100) | 0);
    const cached = _dustSpriteCacheGet(cacheKey);
    if(cached) return cached;
    const SIZE = 192;
    const physSize = Math.max(1, Math.round(SIZE * dpr));
    const cv = document.createElement('canvas');
    cv.width = physSize; cv.height = physSize;
    const c = cv.getContext('2d');
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = 'high';
    if(dpr !== 1) c.scale(dpr, dpr);
    const cx = SIZE/2, cy = SIZE/2;
    const rgb = _parseColorToRgb(color);
    const r = rgb[0], g = rgb[1], b = rgb[2];
    const grad = c.createRadialGradient(cx, cy, 0, cx, cy, SIZE/2);
    // A tiny FLAT dot in the dust colour — solid to ~0.6 radius then a 1px-ish
    // antialiased edge, so scaled down it reads as a small plain speck.
    grad.addColorStop(0,    `rgba(${r},${g},${b},1)`);
    grad.addColorStop(0.6,  `rgba(${r},${g},${b},1)`);
    grad.addColorStop(0.82, `rgba(${r},${g},${b},0.65)`);
    grad.addColorStop(1,    `rgba(${r},${g},${b},0)`);
    c.fillStyle = grad;
    c.fillRect(0, 0, SIZE, SIZE);
    _dustSpriteCacheSet(cacheKey, cv);
    return cv;
}
function _clearDustSpriteCache(){
    if(_dustSpriteCache && _dustSpriteCache.clear) _dustSpriteCache.clear();
    if(_dustSpriteUse && _dustSpriteUse.clear) _dustSpriteUse.clear();
}


function refreshKeyDustColorCache(){
    const css = getComputedStyle(document.documentElement);
    cachedDustWhite = css.getPropertyValue('--accent-white').trim() || css.getPropertyValue('--piano-white-active-mid').trim() || '#70d8ff';
    cachedDustBlack = css.getPropertyValue('--accent-black').trim() || css.getPropertyValue('--piano-black-active-mid').trim() || '#ff7f66';
    _clearDustSpriteCache();
}
// Chord detection is throttled on a wall-clock timer with a microtask coalesce
// step in front. A single JS turn can produce many state changes back-to-back
// (a chord change is emitted as a run of noteOff followed by a run of noteOn,
// all synchronous), so requestChordUpdate() only flags the detector dirty; the
// actual matchChords() work runs from a microtask after the current turn ends
// so `_detectAndRenderChordsLocal` always reads the fully-settled note set,
// never a partial one captured mid-loop. Inside the microtask the leading /
// trailing throttle picks whether to run right now or defer to a trailing
// timer, keeping the ~36 detections/sec ceiling even during glissandos.
const CHORD_MIN_INTERVAL = 28;
let _chordLastRun = 0;
let _chordTrailingTimer = 0;
let _chordDirty = false;
let _chordFlushScheduled = false;
function _runChordDetect(){
    _chordLastRun = performance.now();
    _chordDirty = false;
    try { _detectAndRenderChordsLocal(); } catch(_){}
}
function _flushChordUpdate(){
    _chordFlushScheduled = false;
    if(!_chordDirty) return;
    if(typeof _detectAndRenderChordsLocal !== 'function') return;
    // Back off chord matching during bursts: a glissando fires note events far
    // faster than a chord can change, so running matchChords every 28ms there is
    // wasted work. A longer interval while bursting keeps the heavy detection
    // off the hot path; normal playing stays responsive.
    const interval = (typeof getBurstLevel === 'function' && getBurstLevel() > 14) ? 90 : CHORD_MIN_INTERVAL;
    const since = performance.now() - _chordLastRun;
    if(since >= interval){
        if(_chordTrailingTimer){ clearTimeout(_chordTrailingTimer); _chordTrailingTimer = 0; }
        _runChordDetect();
    } else if(!_chordTrailingTimer){
        _chordTrailingTimer = setTimeout(() => {
            _chordTrailingTimer = 0;
            if(_chordDirty) _runChordDetect();
        }, Math.max(1, interval - since));
    }
}
function requestChordUpdate(){
    if(typeof _detectAndRenderChordsLocal !== 'function') return;
    _chordDirty = true;
    if(_chordFlushScheduled) return;
    _chordFlushScheduled = true;
    if(typeof queueMicrotask === 'function') queueMicrotask(_flushChordUpdate);
    else Promise.resolve().then(_flushChordUpdate);
}

const pendingActiveRemoves = new Set();
const keyVisualDesired = new WeakMap();
let keyVisualRaf = null;

// === Per-player key color tracking (overlay only — does NOT affect activation logic) ===
const _KEY_SELF = '__self__';
const _keyColorMap = new Map(); // midi → Map<holderId, color>
let _mpSelfSeatColor = ''; // solo has no room/seat concept — always stays empty

function _applyKeyColor(el, color){
    if(!el) return;
    if(color){
        const ink = keyInkFor(color);
        el.style.setProperty('--accent-white', color);
        el.style.setProperty('--accent-black', color);
        el.style.setProperty('--accent-white-ink', ink);
        el.style.setProperty('--accent-black-ink', ink);
    } else {
        el.style.removeProperty('--accent-white');
        el.style.removeProperty('--accent-black');
        el.style.removeProperty('--accent-white-ink');
        el.style.removeProperty('--accent-black-ink');
    }
}

function _resolveKeyColor(midi){
    const holders = _keyColorMap.get(midi);
    if(!holders || holders.size === 0) return '';
    let color = '';
    holders.forEach(c => { if(c) color = c; });
    return color;
}

function _trackKeyColor(midi, holderId, color, el){
    // Offline / no custom color — nothing to track. Avoids per-press Map
    // allocation during heavy passages where _mpSelfSeatColor is empty.
    if(!color){
        const existing = _keyColorMap.get(midi);
        if(existing && existing.has(holderId)){
            existing.delete(holderId);
            if(existing.size === 0) _keyColorMap.delete(midi);
            if(el) _applyKeyColor(el, _resolveKeyColor(midi));
        }
        return;
    }
    let holders = _keyColorMap.get(midi);
    if(!holders){ holders = new Map(); _keyColorMap.set(midi, holders); }
    holders.set(holderId, color);
    if(el) _applyKeyColor(el, _resolveKeyColor(midi));
}

function _untrackKeyColor(midi, holderId, el){
    const holders = _keyColorMap.get(midi);
    if(!holders) return;
    holders.delete(holderId);
    if(holders.size === 0){
        _keyColorMap.delete(midi);
        if(el) _applyKeyColor(el, '');
    } else {
        if(el) _applyKeyColor(el, _resolveKeyColor(midi));
    }
}

function scheduleKeyVisual(el, active){
    if(!el || !el.classList) return;
    if(keyVisualDesired.get(el) === active) return;
    keyVisualDesired.set(el, active);
    if(active){
        // Apply press immediately — no rAF delay for key-down
        pendingActiveRemoves.delete(el);
        if(!el.classList.contains('active')) el.classList.add('active');
        const m = Number(el.dataset.note);
        const color = Number.isFinite(m) ? _resolveKeyColor(m) : '';
        _applyKeyColor(el, color);
        setActiveKeyOverlay(el, true, color);
        return;
    }
    pendingActiveRemoves.add(el);
    if(keyVisualRaf) return;
    keyVisualRaf = requestAnimationFrame(() => {
        keyVisualRaf = null;
        pendingActiveRemoves.forEach(x => {
            if(keyVisualDesired.get(x) === false){
                if(x.classList.contains('active')) x.classList.remove('active');
                _applyKeyColor(x, '');
                setActiveKeyOverlay(x, false);
            }
        });
        pendingActiveRemoves.clear();
    });
}
function playPressVisual(n,k,burst){
    // A pressed key has no on-screen "y" of its own -- sample the gradient at
    // the keybed (canvasCssH) so Vertical axis shows the colour a falling
    // note has right as it lands, instead of silently falling back to
    // Horizontal (gradientTFor treats a missing y as "no Y available").
    if(Number.isFinite(n)) _trackKeyColor(n, _KEY_SELF, keyColorFollowFallingNotes ? getAnimBaseColorForMidi(n, canvasCssH) : selfSeatKeyColor(), k);
    scheduleKeyVisual(k, true);
    startNeonDust(n, k);
    spawnStrikeReaction(n);
    pressStartTimes.set(n,performance.now());
    _recentReleaseNotes.delete(n);
    if(isAnimOn) addAnim(n);
    requestChordUpdate();
}
function playReleaseVisual(n,k){
    scheduleKeyVisual(k, false);
    if(Number.isFinite(n)) _untrackKeyColor(n, _KEY_SELF, k);
    stopNeonDust(n);
    pressStartTimes.delete(n);
    _recentReleaseNotes.set(n, performance.now());
    // Nothing else is guaranteed to touch the chord state again once the
    // grace window lapses (no further press/release), so schedule one
    // follow-up read to drop this note off the display on time.
    setTimeout(() => { if(typeof requestChordUpdate === 'function') requestChordUpdate(); }, CHORD_RELEASE_GRACE_MS + 30);
    markFallingReleased(n);
    requestChordUpdate();
}
function pressWithVelocity(n,k,vel,visualNote){
    if(!isPianoInputAllowed()) return;
    if(window.__mpActivity) window.__mpActivity();
    const burst = markInputBurst();
    if(audioCtx.state==='suspended') audioCtx.resume();
    const vn = visualNote !== undefined ? visualNote : n;
    playNote(n,transpose,vel);
    playPressVisual(vn,k,burst);
    if(window.PapianoMultiplayer && typeof window.PapianoMultiplayer.sendNoteOn === 'function') window.PapianoMultiplayer.sendNoteOn(vn, vel);
}
// ── Auto Velocity ────────────────────────────────────────────────────────
// Humanized dynamics for velocity-less input (QWERTY / mouse / touch),
// which otherwise hammers every note at a fixed 0.8. The actual shaping
// (three modes: Arpeggio / Block Chord / Mix) lives in the shared
// js/shared/auto-velocity.js engine — identical math across Solo,
// Multiplayer, Learn Song, and Visualizer. What stays local here is the
// harmonic context: matchChords()/CHORD_DB and pressStartTimes/
// _recentReleaseNotes are per-engine, so _autoVelChordContext() builds the
// {root, pcs} chord read and the currently-known simultaneous note set from
// this engine's own state and hands it to the shared engine per note.
// Real MIDI-device velocities and MIDI-file velocities are never touched —
// this only replaces the fixed keyboard/mouse/touch default.
let autoVelocityEnabled = (function(){ try{ return localStorage.getItem('papianoAutoVel') === '1'; }catch(e){ return false; } })();
let autoVelocityMode = (function(){
    try{
        const m = localStorage.getItem('papianoAutoVelMode');
        return (m === 'arpeggio' || m === 'block' || m === 'mix') ? m : 'mix';
    }catch(e){ return 'mix'; }
})();
const _AUTOVEL_MODE_BUTTON_IDS = { arpeggio: 'autoVelModeArpeggio', block: 'autoVelModeBlock', mix: 'autoVelModeMix' };
function setAutoVelocityMode(mode){
    if (mode !== 'arpeggio' && mode !== 'block' && mode !== 'mix') mode = 'mix';
    autoVelocityMode = mode;
    if (window.PapianoAutoVelocity) window.PapianoAutoVelocity.setMode(mode);
    try{ localStorage.setItem('papianoAutoVelMode', mode); }catch(e){}
    Object.keys(_AUTOVEL_MODE_BUTTON_IDS).forEach(function(m){
        const el = document.getElementById(_AUTOVEL_MODE_BUTTON_IDS[m]);
        if (el) el.classList.toggle('active', m === mode);
    });
}
Object.keys(_AUTOVEL_MODE_BUTTON_IDS).forEach(function(m){
    const el = document.getElementById(_AUTOVEL_MODE_BUTTON_IDS[m]);
    if (el) el.addEventListener('click', function(){ setAutoVelocityMode(m); });
});
setAutoVelocityMode(autoVelocityMode);
// Builds the harmonic context for one note: the currently-known
// simultaneous note set (held keys + anything released within the chord
// detector's own grace window, same rule _detectAndRenderChordsLocal uses
// so an arpeggio reads as "one chord" the same way it does on-screen) plus
// the chord matchChords() infers from that set, if any. Fewer than 3 notes
// means no chord to weigh roles against — the shared engine still shapes
// the note on timing/register alone.
function _autoVelChordContext(n){
    const set = new Set([n]);
    if (typeof pressStartTimes !== 'undefined' && pressStartTimes) pressStartTimes.forEach((_, m) => set.add(m));
    if (typeof _recentReleaseNotes !== 'undefined' && _recentReleaseNotes.size){
        const now = performance.now();
        _recentReleaseNotes.forEach((ts, m) => { if (now - ts <= CHORD_RELEASE_GRACE_MS) set.add(m); });
    }
    const gestureNotes = Array.from(set).sort((a, b) => a - b);
    let chordInfo = null;
    if (gestureNotes.length >= 3){
        try{
            const matches = matchChords(gestureNotes);
            if (matches && matches.length){
                const root = matches[0].root;
                chordInfo = { root, pcs: new Set(gestureNotes.map(m => ((m - root) % 12 + 12) % 12)) };
            }
        }catch(e){}
    }
    return { gestureNotes, chordInfo };
}
function autoVelocityFor(midi){
    const ctx = _autoVelChordContext(midi);
    return window.PapianoAutoVelocity.velocityFor(midi, ctx);
}
function setAutoVelocity(on){
    autoVelocityEnabled = !!on;
    const track = document.getElementById('autoVelTrack');
    if (track) track.classList.toggle('active', autoVelocityEnabled);
    try{ localStorage.setItem('papianoAutoVel', autoVelocityEnabled ? '1' : '0'); }catch(e){}
}
const autoVelTrack = document.getElementById('autoVelTrack');
if (autoVelTrack) autoVelTrack.onclick = () => setAutoVelocity(!autoVelocityEnabled);
if (autoVelocityEnabled) setAutoVelocity(true);

// ── Live Velocity Meter ──────────────────────────────────────────────────
// A real-time VU-style meter next to the Auto Velocity toggle. Velocity is
// conceptually loudness, so watching it move on every note-on is a much
// faster way to confirm Auto Velocity is doing something than trying to
// judge it by ear alone. Reflects the actual velocity fed to playNote() for
// EVERY input path — QWERTY, mouse/touch, a real MIDI controller, or
// MIDI-file playback — not just the auto-generated one, so flipping the
// toggle on/off is directly, visually comparable (flat vs. fluctuating).
let velMeterDecayTimer = null;
let velMeterRestartRaf = null;
function updateVelocityMeter(vel){
    const fill = document.getElementById('velMeterFill');
    if(!fill) return;
    const label = document.getElementById('velMeterVal');
    const pct = Math.round(Math.max(0, Math.min(1, vel || 0)) * 100);
    if (velMeterDecayTimer) clearTimeout(velMeterDecayTimer);
    if (velMeterRestartRaf){ cancelAnimationFrame(velMeterRestartRaf); velMeterRestartRaf = null; }
    fill.style.transition = 'none';
    fill.style.width = pct + '%';
    if (label) label.textContent = pct + '%';
    // Restarting the width transition needs the browser to have actually
    // painted the "jump to pct% with no transition" frame above before
    // transition is turned back on -- `void fill.offsetWidth` used to force
    // that synchronously, but a forced layout read flushes EVERY pending
    // style/layout change in the whole document, not just this element's,
    // and this runs on every single note-on (every input path calls
    // playNote -> updateVelocityMeter). A double rAF gets the same
    // guaranteed-painted-in-between behavior without forcing anything: the
    // first rAF fires after the current frame is committed, the second
    // guarantees a full frame boundary has passed before flipping the
    // transition back on.
    velMeterRestartRaf = requestAnimationFrame(() => {
        velMeterRestartRaf = requestAnimationFrame(() => {
            velMeterRestartRaf = null;
            fill.style.transition = 'width 0.6s ease-out';
            velMeterDecayTimer = setTimeout(() => { fill.style.width = '0%'; }, 90);
        });
    });
}

function press(n,k,visualNote){ pressWithVelocity(n,k, autoVelocityEnabled ? autoVelocityFor(n) : 0.8, visualNote); }
function release(n,k,visualNote,fast){
    // The release path is deliberately unguarded. A note that was allowed
    // in when the press fired MUST be allowed back out, otherwise
    // pressStartTimes keeps a phantom entry and the chord detector reads
    // a chord the player already lifted. Every step below is safe to
    // invoke idempotently: markInputBurst() is a counter, stopNote()
    // no-ops if the voice is already released, playReleaseVisual() only
    // removes state / DOM classes that may or may not still exist, and
    // sendNoteOff() bails inside the multiplayer stub when the client
    // isn't in a room.
    const vn = visualNote !== undefined ? visualNote : n;
    markInputBurst();
    // `fast` is only ever true for a note swept OVER mid-glissando (see
    // _flushGlissandoPointerMoves) -- getReleaseProfile's isFastGliss branch
    // existed for exactly this (tc:0.022/delay:0.15 instead of the
    // sustain-scaled up-to-14.6s tail) but no caller ever actually passed
    // `fast` through to stopNote(), so every note swept across during a fast
    // mouse/touch glissando WITH sustain held got the full long tail instead
    // -- dozens of long-decay voices piling up almost simultaneously, which
    // is what was overrunning the audio thread (crackling) and forcing
    // enforceVoiceLimit to mass-steal right after (sustain sounding like it
    // vanished). A genuine final release (pointer-up, key-up, blur cleanup)
    // still calls release() with fast omitted/false and rings out normally.
    stopNote(n, !!fast);
    playReleaseVisual(vn,k);
    if(window.PapianoMultiplayer && typeof window.PapianoMultiplayer.sendNoteOff === 'function') window.PapianoMultiplayer.sendNoteOff(vn);
}
let keyDustIntensity = 3;
let cachedStageHeight = 0;
let _cachedStageEl = null;
let _cachedStageRect = null;
function invalidateStageGeom(){ _cachedStageEl = null; _cachedStageRect = null; }
function refreshStageHeight(){
    const s=document.querySelector('.stage');
    if(s){
        const r = s.getBoundingClientRect();
        cachedStageHeight = Math.max(1, Math.round(r.height || s.clientHeight || s.offsetHeight || canvasCssH || 1));
        _cachedStageEl = s;
        _cachedStageRect = r;
    } else if(canvasCssH) {
        cachedStageHeight = canvasCssH;
        _cachedStageEl = null;
        _cachedStageRect = null;
    }
}

// Strike-spark engine: a FIXED, deterministic budget that is cheap by design
// (one GL point-sprite draw call, O(pool) physics) instead of a runtime
// governor that trims the effect under load. The pool is sized for the worst
// realistic case (10 held keys × steady trickle ≈ ~1.2k live grains), so it
// never fills in practice; if it ever does, the oldest grain is recycled —
// the effect NEVER thins out or collapses.
const NEON_DUST_MAX = 4096;
// Hard ceiling on Gradient/Rainbow Strike Reaction's per-held-key GL draw
// calls -- see its own comment at the call site for why this exists.
const MAX_FLARE_DRAWS_PER_FRAME = 32;
// Even, hold-independent emission: one bright burst per press, then the same
// steady trickle while held. Density never escalates with hold time and never
// shrinks under load.
const DUST_EMIT_INTERVAL = 42;  // ms between trickle spawns while held
const FLARE_ATTACK_MS = 60;     // contact flare fade-in on note-on
const FLARE_RELEASE_MS = 340;   // contact flare fade-out after note-off
// Particle SoA. heat 0..1 picks the colour ramp in the shader: 0 = pure dust
// colour, 1 = white-hot core (sparks) — this is what makes the plume read as
// "burning" light instead of flat confetti.
const neonDustX = new Float32Array(NEON_DUST_MAX);
const neonDustY = new Float32Array(NEON_DUST_MAX);
const neonDustVX = new Float32Array(NEON_DUST_MAX);
const neonDustVY = new Float32Array(NEON_DUST_MAX);
const neonDustR = new Float32Array(NEON_DUST_MAX);
const neonDustA = new Float32Array(NEON_DUST_MAX);
const neonDustLife = new Float32Array(NEON_DUST_MAX);
const neonDustAge = new Float32Array(NEON_DUST_MAX);
const neonDustSeedA = new Float32Array(NEON_DUST_MAX);
const neonDustSeedB = new Float32Array(NEON_DUST_MAX);
const neonDustHeat = new Float32Array(NEON_DUST_MAX);
// Split Color (double): 0 = base/Left colour, 1 = Right colour. Set once at
// spawn from the source key's tuts position; only meaningful while
// dustColorSplit is on (see getDustSideForMidi) — otherwise every grain is 0
// and renders in the single Particle Color, unchanged from before.
const neonDustSide = new Uint8Array(NEON_DUST_MAX);
let neonDustCount = 0;
let _dustStealCursor = 0; // round-robin recycle slot when the pool is full
// Particles render IN FRONT of the falling notes by default ('solid' lifts the
// GL layer to z 21) — in the reference look the spark plume overlays the note
// bar it erupts from; behind the note it would be mostly invisible.
let dustBlendMode = 'solid';
let keyGlowEnabled = false;
let keyGlowIntensity = 50;
// Falling-note "Glow Intensity" — a soft neon aura bleed around the note
// body (baked once per cached sprite, never a per-frame cost). Capped well
// below anything that would blow up overdraw on a mobile TBDR GPU; see
// NOTE_GLOW_MAX_PAD below for the actual ceiling. Has its own on/off toggle
// (independent of the intensity value) so a user can flip the whole aura
// off without losing their preferred intensity setting.
let noteGlowEnabled = false;
// Stored on a 0..200 internal scale (NOTE_GLOW_MAX_PAD is calibrated to
// it, and saved presets hold it) but presented as a plain 0..100% slider,
// so 100% on screen is the full glow the old 200% used to mean.
let noteGlowIntensity = 200;
// Octave Lines: vertical dividers rendered at every C key across the stage,
// aligned with the piano and moved in lockstep during swipe. Purely visual;
// ON by default so first-run users get the C-boundary landmarks — the toggle
// still lives in Visual → Piano Keys for anyone who wants a clean stage.
// See setOctaveLinesEnabled / updateOctaveLinesLayout below.
let octaveLinesEnabled = true;
// Chord Text Scale (50–200%): multiplier applied to the chord readout
// font-size via the `--chord-scale` CSS variable. See setChordTextScale.
let chordTextScale = 85;
// Indexed by Split Color side (0 = base/Left, 1 = Right). Side 1 is only
// ever populated/used while dustColorSplit is on; in single-colour mode
// everything reads side 0 exactly like before the feature existed.
let _dustSprite = [null, null], _dustSpriteKey = ['', ''];
const neonDustEmitters = new Map();

// ---------------------------------------------------------------------------
// WebGL particle layer
// ---------------------------------------------------------------------------
// Canvas-2D draws each dust grain with its own drawImage + globalAlpha write.
// Under a glissando that is ~1,350 serialized draw calls per frame — the single
// biggest cost on the Default tier. This renderer packs every live grain into
// one vertex buffer and draws them all as GL point-sprites in ONE draw call,
// with the dust colour as a uniform and a soft radial dot computed in the
// fragment shader (no texture, no overdraw waste). Falls back to the 2D path
// (below) when WebGL is unavailable, so there is no hard regression.
const glCanvas = document.getElementById('fxParticles');
// Dedicated top-down falling-note layer for MIDI/MusicXML playback (visualizer
// mode only). Kept separate from #fx's anim() loop so the legacy upward-grow
// effect (still used for live key input) never has to share state with it.
const vizFallCanvas = document.getElementById('vizFallCanvas');
const vizFallCtx = vizFallCanvas ? vizFallCanvas.getContext('2d', { alpha: true }) : null;
let glParticles = null;            // renderer handle, or null if WebGL is unavailable
// Cached normalized dust colour, one slot per Split Color side (see above).
let _glColorR = [0, 0], _glColorG = [0.9, 0.9], _glColorB = [1, 1];
// Strike Reaction colour cache — independent of the dust cache because Strike
// Reaction was moved under Falling Notes and follows the anim colour (with
// its own Split Color slider). Side 0 = base/Left, side 1 = Right.
let _reactionSprite = [null, null], _reactionSpriteKey = ['', ''];
let _reactionColorR = [0, 0], _reactionColorG = [0, 0], _reactionColorB = [0, 0];
function _refreshReactionColor(side, midi){
    let color;
    if(animColorMode === 'gradient' && midi != null){
        // Gradient mode has no fixed Left/Right pair — every struck note gets
        // its own hue, so the flare must resolve per-midi instead of per-side.
        color = gradientColorForMidi(midi);
    } else if(animColorMode === 'rainbow' && midi != null){
        // Fixed colour per key (pure function of pitch class) — safe to
        // resolve fresh here, it can never drift from the note's own colour.
        color = rainbowColorForMidi(midi);
    } else if(animColorSplit){
        color = side === 1 ? (animDoubleRightColor || '#0099ff') : (animDoubleLeftColor || '#0099ff');
    } else {
        // Same effective-anim-colour fallback chain the falling notes use, so
        // the flare and the notes always look like the same colour.
        color = customAnimNote
            || (typeof _mpSelfSeatColor !== 'undefined' && _mpSelfSeatColor)
            || cachedAnimColor
            || '#0099ff';
    }
    if(color === _reactionSpriteKey[side]) return;
    _reactionSpriteKey[side] = color;
    _reactionSprite[side] = getDustSprite(color);
    const rgb = _parseColorToRgb(color);
    _reactionColorR[side] = rgb[0] / 255;
    _reactionColorG[side] = rgb[1] / 255;
    _reactionColorB[side] = rgb[2] / 255;
}
function initGlParticles(){
    if(!glCanvas || typeof WebGLRenderingContext === 'undefined') return null;
    let gl = null;
    const opts = { alpha:true, antialias:false, depth:false, stencil:false, preserveDrawingBuffer:false };
    try { gl = glCanvas.getContext('webgl', opts) || glCanvas.getContext('experimental-webgl', opts); }
    catch(e){ gl = null; }
    if(!gl) return null;
    const vsSrc =
        'attribute vec2 aPos;' +          // position in CSS px (stage space)
        'attribute float aSize;' +        // diameter in CSS px; NEGATIVE = flame-tongue sprite
        'attribute float aAlpha;' +
        'attribute float aHeat;' +        // 0 = dust colour, 1 = white-hot core; NEGATIVE selects the lens-streak shape (heat = |aHeat|)
        'uniform vec2 uStage;' +          // stage css width,height
        'uniform float uDpr;' +
        'varying float vAlpha;' +
        'varying float vHeat;' +
        'varying float vShape;' +         // 0 = round glow, 1 = flame tongue
        'void main(){' +
        '  vAlpha = aAlpha;' +
        '  vHeat = aHeat;' +
        '  vShape = aSize < 0.0 ? 1.0 : 0.0;' +
        '  float cx = (aPos.x / uStage.x) * 2.0 - 1.0;' +
        '  float cy = 1.0 - (aPos.y / uStage.y) * 2.0;' +
        '  gl_Position = vec4(cx, cy, 0.0, 1.0);' +
        '  gl_PointSize = max(1.0, abs(aSize) * uDpr);' +
        '}';
    // Each sprite is a bright gaussian core inside a wider soft halo. The core
    // shifts toward white with aHeat, so sparks read as glowing embers whose
    // centre burns hotter than their coloured fringe — the halo accumulates
    // additively between neighbouring sparks into one luminous plume.
    const fsSrc =
        'precision mediump float;' +
        'uniform vec3 uColor;' +
        'varying float vAlpha;' +
        'varying float vHeat;' +
        'varying float vShape;' +
        'void main(){' +
        '  float a; float core;' +
        '  if(vShape < 0.5){' +
        '    vec2 d = gl_PointCoord - vec2(0.5);' +
        '    float r2 = dot(d, d) * 4.0;' +          // 0 centre, 1 at inscribed-circle edge
        '    core = exp(-r2 * 5.0);' +
        '    float halo = exp(-r2 * 1.7) * 0.52;' +
        // Circular edge mask: the gaussian never quite reaches zero inside the
        // square point sprite, and that residue showed the quad itself as a
        // faint "fading box" around big flares. Force a smooth fade to exactly
        // zero before the inscribed circle ends so only round light remains.
        '    float mask = smoothstep(1.0, 0.55, r2);' +
        '    a = (core + halo) * mask * vAlpha;' +
        '  } else if(vHeat < 0.0){' +
        // Lens streak (Strike Reaction): a thin horizontal flash hugging the
        // strike line — the sharp glint that sells the ignition. Gaussian in
        // both axes (very flat vertically) with edge masks fading every side
        // smoothly to zero, so no quad ever shows.
        '    float u = gl_PointCoord.x - 0.5;' +
        '    float dy = gl_PointCoord.y - 0.5;' +
        '    float bodyH = exp(-(u * u) * 18.0) * smoothstep(0.5, 0.4, abs(u));' +
        '    float bodyV = exp(-(dy * dy) * 260.0) * smoothstep(0.5, 0.34, abs(dy));' +
        '    core = exp(-(u * u) * 46.0 - (dy * dy) * 320.0);' +
        '    a = bodyH * bodyV * vAlpha;' +
        '  } else {' +
        // Flame tongue (Strike Reaction): anchored at the quad's BOTTOM edge
        // (which sits on the strike line), narrowing toward the tip. Every
        // visible edge fades smoothly to exactly zero — the horizontal
        // gaussian kills the sides, the vert smoothstep kills the tip, and
        // the bottom edge is hidden under the strike line/piano — so the
        // tongue reads as pure light with no trace of its quad.
        '    float u = gl_PointCoord.x - 0.5;' +
        '    float v = 1.0 - gl_PointCoord.y;' +     // 0 at base (strike line), 1 at tip
        '    float w = mix(0.30, 0.08, smoothstep(0.0, 0.85, v));' +
        '    float body = exp(-(u * u) / (w * w) * 2.6) * smoothstep(0.5, 0.34, abs(u));' +
        '    float vert = exp(-v * 2.3) * smoothstep(1.0, 0.72, v);' +
        '    core = body * exp(-v * 5.0);' +         // heat pools at the base
        '    a = body * vert * vAlpha;' +
        '  }' +
        '  if(a <= 0.004) discard;' +
        '  vec3 col = mix(uColor, vec3(1.0), abs(vHeat) * core);' +
        '  gl_FragColor = vec4(col * a, a);' +
        '}';
    function compile(type, src){
        const s = gl.createShader(type);
        gl.shaderSource(s, src); gl.compileShader(s);
        if(!gl.getShaderParameter(s, gl.COMPILE_STATUS)){ gl.deleteShader(s); return null; }
        return s;
    }
    const vs = compile(gl.VERTEX_SHADER, vsSrc);
    const fs = compile(gl.FRAGMENT_SHADER, fsSrc);
    if(!vs || !fs) return null;
    const prog = gl.createProgram();
    gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if(!gl.getProgramParameter(prog, gl.LINK_STATUS)){ return null; }
    gl.useProgram(prog);
    const loc = {
        aPos:   gl.getAttribLocation(prog, 'aPos'),
        aSize:  gl.getAttribLocation(prog, 'aSize'),
        aAlpha: gl.getAttribLocation(prog, 'aAlpha'),
        aHeat:  gl.getAttribLocation(prog, 'aHeat'),
        uStage: gl.getUniformLocation(prog, 'uStage'),
        uDpr:   gl.getUniformLocation(prog, 'uDpr'),
        uColor: gl.getUniformLocation(prog, 'uColor')
    };
    const STRIDE = 5; // floats per sprite: x, y, size, alpha, heat
    // + headroom for the per-emitter contact-flare sprites appended at render
    // time (5 sprites per held key, far below 512).
    const packed = new Float32Array((NEON_DUST_MAX + 512) * STRIDE);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, packed.byteLength, gl.DYNAMIC_DRAW);
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    // Pure additive: overlapping sparks/flares stack into brighter light, which
    // is what sells the white-hot contact point on the strike line.
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.clearColor(0, 0, 0, 0);
    return { gl, prog, loc, buf, packed, STRIDE };
}
function glResizeParticles(physW, physH){
    if(!glParticles || !glCanvas) return;
    if(glCanvas.width !== physW) glCanvas.width = physW;
    if(glCanvas.height !== physH) glCanvas.height = physH;
    glParticles.gl.viewport(0, 0, physW, physH);
}
// Fade envelope shared by the GL and 2D paths: fast ignition, long ember tail.
function _dustFade(t){
    return t < 0.08 ? t / 0.08 : Math.max(0, 1 - Math.pow((t - 0.08) / 0.92, 1.6));
}
// Resolves + caches the sprite/GL colour for one Split Color side (0 = Left/
// base, 1 = Right). Side 1 is only ever queried while dustColorSplit is on;
// in single-colour mode both slots simply resolve to the same colour.
function _refreshDustColor(side, color){
    const key = (color || dustColor || strikeLineColor || '#00e5ff') + '|' + particleSaturation;
    if(key === _dustSpriteKey[side]) return;
    _dustSpriteKey[side] = key;
    const resolved = applyStrikeLineSaturation(color || dustColor || strikeLineColor || '#00e5ff', particleSaturation);
    _dustSprite[side] = getDustSprite(resolved);
    const rgb = _parseColorToRgb(resolved);
    _glColorR[side] = rgb[0] / 255; _glColorG[side] = rgb[1] / 255; _glColorB[side] = rgb[2] / 255;
}
// Two draw calls over the shared buffer PER Split Color side, both in the
// particle colour: one draws that side's live grains, the other draws that
// side's contact flares. In single-colour mode side 1 is simply empty, so
// this collapses back to the original two draw calls per frame.
// Per-frame setup for the particle program. Everything here is invariant
// across the passes of a single frame — the buffer binding, the four vertex
// attribute pointers (fixed offsets into a fixed-stride buffer) and the two
// stage uniforms. It used to be re-issued inside _glDrawPass, i.e. once per
// pass, which only looked free because the common colour mode issues two
// passes. Gradient/Rainbow issues one pass PER HELD KEY (each flare needs its
// own hue, and hue is a uniform), so a handful of held notes turned this into
// hundreds of redundant GL calls a frame — measured at 258 calls/frame in
// Gradient against 29 in the flat mode, all of it main-thread driver work
// that scales with how much you are playing. Hoisting it leaves each pass at
// three calls: upload, colour, draw.
function _glBeginFrame(r){
    const gl = r.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, r.buf);
    const stride = r.STRIDE * 4;
    gl.enableVertexAttribArray(r.loc.aPos);
    gl.vertexAttribPointer(r.loc.aPos, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(r.loc.aSize);
    gl.vertexAttribPointer(r.loc.aSize, 1, gl.FLOAT, false, stride, 8);
    gl.enableVertexAttribArray(r.loc.aAlpha);
    gl.vertexAttribPointer(r.loc.aAlpha, 1, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(r.loc.aHeat);
    gl.vertexAttribPointer(r.loc.aHeat, 1, gl.FLOAT, false, stride, 16);
    gl.uniform2f(r.loc.uStage, canvasCssW || 1, canvasCssH || 1);
    gl.uniform1f(r.loc.uDpr, currentDPR || 1);
}
function _glDrawPass(r, n, cr, cg, cb){
    const gl = r.gl;
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, r.packed.subarray(0, n * r.STRIDE));
    gl.uniform3f(r.loc.uColor, cr, cg, cb);
    gl.drawArrays(gl.POINTS, 0, n);
}
function renderGlParticles(now){
    const r = glParticles;
    if(!r) return;
    const gl = r.gl;
    gl.clear(gl.COLOR_BUFFER_BIT);
    _glBeginFrame(r);
    const packed = r.packed, STRIDE = r.STRIDE;
    now = now || performance.now();
    // Particle dust grains — coloured by the Particle colour(s), per Particle
    // Split Color side. In single-colour mode side 1 is empty and skipped.
    for(let side = 0; side < 2; side++){
        if(side === 1 && !dustColorSplit) break;
        let n = 0;
        for(let i=0;i<neonDustCount;i++){
            if(neonDustSide[i] !== side) continue;
            const t = neonDustLife[i] > 0 ? neonDustAge[i] / neonDustLife[i] : 1;
            let alpha = Math.min(1, neonDustA[i] * _dustFade(t));
            // Fallers twinkle like cooling firework embers.
            if(neonDustSeedB[i] < 0) alpha *= 0.6 + 0.4 * Math.sin(now * (0.010 - neonDustSeedB[i] * 0.012) + neonDustSeedA[i] * 7.0);
            if(alpha <= 0.015) continue;
            const o = n * STRIDE;
            packed[o] = neonDustX[i];
            packed[o + 1] = neonDustY[i];
            packed[o + 2] = neonDustR[i];
            packed[o + 3] = alpha;
            packed[o + 4] = neonDustHeat[i];
            n++;
        }
        if(n > 0) _glDrawPass(r, n, _glColorR[side], _glColorG[side], _glColorB[side]);
    }
    // Strike Reaction contact flares — coloured by the Falling Notes colour(s),
    // per Anim Split Color side (INDEPENDENT from the Particle Split Color).
    if(animColorMode === 'gradient' || animColorMode === 'rainbow'){
        // Gradient/Rainbow have no fixed 2-colour pair to batch by side, so
        // each struck note gets its own draw pass in its own hue instead
        // (bounded by concurrently-held keys, so still cheap in practice).
        if(strikeReactionEnabled && strikeLineEnabled && neonDustEmitters.size && _flareIntensityMul() > 0.001){
            // Hard cap on flare draw calls per frame -- each currently-held
            // key in Gradient/Rainbow mode gets its OWN GL draw call (its own
            // hue can't be batched, since the shader's colour is a per-draw
            // uniform, not a per-vertex attribute). Realistic hand+pedal play
            // never gets near this, but a dense/loud MIDI file played back
            // can legitimately hold far more notes at once than any hand
            // could -- pedaled orchestral passages routinely exceed 40-50
            // simultaneous notes -- which drove this into hundreds of
            // redundant draw calls a frame with no ceiling at all. That's
            // exactly the kind of sustained per-frame GPU driver load that
            // crashes/resets weaker or integrated laptop GPUs, reported as
            // the app itself crashing. Capped well above anything a human
            // hand+pedal produces so normal play is unaffected; only a
            // pathological file-playback burst ever hits the ceiling, and
            // hitting it just skips drawing the excess flares that frame
            // rather than growing GPU cost without bound.
            let _flareDrawsLeft = MAX_FLARE_DRAWS_PER_FRAME;
            for (const em of neonDustEmitters.values()) {
                if (_flareDrawsLeft-- <= 0) break;
                _refreshReactionColor(0, em.midi);
                const nf = _packOneContactFlare(packed, 0, STRIDE, now, em);
                if(nf > 0) _glDrawPass(r, nf, _reactionColorR[0], _reactionColorG[0], _reactionColorB[0]);
            }
        }
    } else {
        for(let side = 0; side < 2; side++){
            if(side === 1 && !animColorSplit) break;
            _refreshReactionColor(side);
            const nf = _packContactFlares(packed, 0, STRIDE, now, side);
            if(nf > 0) _glDrawPass(r, nf, _reactionColorR[side], _reactionColorG[side], _reactionColorB[side]);
        }
    }
}
// Contact flare: the bright ignition where a note meets the strike line — a
// low glow spilling along the line, a white-hot kernel, a thin lens streak
// and two flickering flame tongues per held key. Rendered as five extra
// point sprites in the same draw call, alive from note-on (fast attack with
// a brief ignition pop) until shortly after note-off (soft eased release),
// with a subtle flame-like flicker while held.
function _flareEnvelope(em, now){
    const attack = Math.min(1, (now - em.start) / FLARE_ATTACK_MS);
    // Ease-out on release: a linear ramp visibly "snaps" off at the end,
    // while the power curve lets the last of the light die away smoothly.
    const release = em.released ? Math.pow(Math.max(0, 1 - (now - em.released) / FLARE_RELEASE_MS), 1.5) : 1;
    return attack * release;
}
// The flare's Setting lives under Falling Notes now, so it renders in the
// Falling Notes colour(s), per anim Split Color side (see
// _refreshReactionColor). It still follows the strike line's Opacity as
// master fade and is hidden entirely when the line is off — its own control
// is the Reaction Intensity slider (+ toggle). Position/attack/release
// timing are unchanged.
function _flareIntensityMul(){
    return sliderRatio(strikeReactionIntensity, 55) * 1.8 * sliderRatio(strikeLineOpacity, 100);
}
// Packs one emitter's 5-sprite flare into `packed` at slot `n`, returning the
// advanced slot count (or `n` unchanged if the emitter contributed nothing).
// Shared by the side-batched loop (single/double colour modes) and the
// per-emitter gradient-mode loop in renderGlParticles.
function _packOneContactFlare(packed, n, STRIDE, now, em){
    const capacity = packed.length / STRIDE;
    if(n + 5 > capacity) return n;
    const env = _flareEnvelope(em, now);
    if(env <= 0.003) return n;
    const g = em.geom;
    if(!g) return n;
    const iMul = _flareIntensityMul();
    const baseY = (canvasCssH || cachedStageHeight || knownStageH || 1) - 1;
    const cx = g.x + g.w * 0.5;
    // Two-sine flicker so the flare breathes like a small flame instead of
    // strobing on a single frequency.
    const fl = 0.86 + 0.14 * (Math.sin(now * 0.021 + em.midi * 1.7) * 0.6 + Math.sin(now * 0.0093 + em.midi * 3.1) * 0.4);
    // Slow lateral sway shared by the tongues (the inner one counter-
    // leans) so the flame licks sideways instead of standing rigid.
    const sway = Math.sin(now * 0.0016 + em.midi * 2.1) * 0.6 + Math.sin(now * 0.0041 + em.midi * 0.7) * 0.4;
    // Tongue height follows the envelope: it shoots up on attack and
    // sinks back into the line during release instead of fading in place.
    const hEnv = 0.55 + 0.45 * env;
    // Ignition pop: a brief overshoot right at note-on so the strike
    // "flashes" before settling into the held flame.
    const pop = 1 + 1.1 * Math.exp(-(now - em.start) / 80);
    const keyW = Math.max(8, g.w);
    let o = n * STRIDE;
    // Horizon glow: a wide gaussian pushed BELOW the strike line so only
    // a soft band of light spills along it — centred ON the line it
    // clipped into the generic half-dome this replaced.
    packed[o] = cx; packed[o+1] = baseY + keyW * 1.6;
    packed[o+2] = keyW * 6.4; packed[o+3] = Math.min(1, 0.30 * env * fl * iMul); packed[o+4] = 0.30;
    o += STRIDE;
    // White-hot contact kernel; flashes with the ignition pop.
    packed[o] = cx; packed[o+1] = baseY - 1;
    packed[o+2] = keyW * 1.6; packed[o+3] = Math.min(1, 0.90 * env * fl * pop * iMul); packed[o+4] = 1.0;
    o += STRIDE;
    // Lens streak hugging the line — negative size selects the non-round
    // shapes, negative heat picks the streak variant of them.
    packed[o] = cx; packed[o+1] = baseY - 2;
    packed[o+2] = -keyW * 3.6; packed[o+3] = Math.min(1, 0.50 * env * fl * pop * iMul); packed[o+4] = -0.85;
    o += STRIDE;
    // Main flame tongue — the NEGATIVE size selects the tongue falloff in
    // the shader; the quad's bottom edge sits on the strike line.
    const h1 = keyW * 5.4 * fl * hEnv;
    packed[o] = cx + sway * keyW * 0.12; packed[o+1] = baseY - h1 * 0.5 + 1;
    packed[o+2] = -h1; packed[o+3] = Math.min(1, 0.52 * env * fl * iMul); packed[o+4] = 0.55;
    o += STRIDE;
    // Inner tongue: shorter, hotter, counter-leaning.
    const h2 = keyW * 3.0 * fl * hEnv;
    packed[o] = cx - sway * keyW * 0.07; packed[o+1] = baseY - h2 * 0.5 + 1;
    packed[o+2] = -h2; packed[o+3] = Math.min(1, 0.75 * env * fl * iMul); packed[o+4] = 0.95;
    return n + 5;
}
function _packContactFlares(packed, n, STRIDE, now, side){
    if(!strikeReactionEnabled || !strikeLineEnabled || !neonDustEmitters.size) return n;
    if(_flareIntensityMul() <= 0.001) return n; // Reaction Intensity or line Opacity at 0% = off
    neonDustEmitters.forEach(em => {
        // Strike Reaction follows the Falling Notes' Split Color, NOT the
        // Particle Split Color — em.side (dust side) is unrelated.
        if(getAnimSideForMidi(em.midi) !== (side || 0)) return;
        n = _packOneContactFlare(packed, n, STRIDE, now, em);
    });
    return n;
}
function clearGlParticles(){
    if(glParticles) glParticles.gl.clear(glParticles.gl.COLOR_BUFFER_BIT);
}
try { glParticles = initGlParticles(); } catch(e){ glParticles = null; }
// A lost WebGL context (GPU driver reset/crash -- more common on weaker
// or switchable-graphics laptops under sustained heavy point-sprite load,
// e.g. Strike Reaction's per-held-key draw calls during a dense/loud
// passage) leaves glParticles.gl unusable. Per spec every subsequent gl.*
// call silently no-ops once a context is lost, but without
// preventDefault() the browser will never hand back a restored context
// either, permanently disabling the particle system for the rest of the
// session. Null out glParticles on loss (every caller already
// null-checks it, see renderGlParticles/clearGlParticles/etc.) and
// rebuild it if/when the browser does restore the context.
if(glCanvas){
    glCanvas.addEventListener('webglcontextlost', (e) => {
        e.preventDefault();
        glParticles = null;
    }, false);
    glCanvas.addEventListener('webglcontextrestored', () => {
        try { glParticles = initGlParticles(); } catch(e){ glParticles = null; }
    }, false);
}

function getKeyStageGeom(midi){

    if(midi == null || !whiteKeyWidth) return null;
    const centerX = noteXFast[midi];
    if(!Number.isFinite(centerX)) return null;
    const black = isBlack(midi);
    const wIdx = black ? -1 : whiteIndexMap.get(midi);
    const w = black ? getBlackKeyWidthPx() : getWhiteKeyWidthPx(wIdx);
    return {
        x: centerX - currentPianoTransformPx - w * 0.5,
        w: w,
        isBlack: black
    };
}
// Slot allocator: take a free slot, or recycle the oldest grain when the pool
// is full. Emission is NEVER scaled down by load — the budget is fixed.
function _allocDustSlot(){
    if(neonDustCount < NEON_DUST_MAX) return neonDustCount++;
    const idx = _dustStealCursor;
    _dustStealCursor = (_dustStealCursor + 1) % NEON_DUST_MAX;
    return idx;
}
// Spawns one batch of grains at the strike-line contact point of `geom`.
// kindMix = fraction of the batch that are hot sparks (fast, white-centred,
// short-lived); the rest are embers (slow, coloured, lingering) that give the
// plume its drifting body.
function spawnNeonDust(geom, count, kindMix, side, fallerMix){
    if(!strikeLineDustEnabled || !geom || !canvas || isLowGraphic()) return;
    side = side ? 1 : 0;
    const countLevel = sliderCurve(particleCount, 1.04);
    const opacityLevel = sliderRatio(particleOpacity, 100);
    const sizeLevel = sliderCurve(particleSize, 1.08);
    if(countLevel <= 0.005 || opacityLevel <= 0.005 || sizeLevel <= 0.005) return;
    const stageH = canvasCssH || cachedStageHeight || knownStageH || window.innerHeight * 0.6;
    // Count slider runs 0–50: 0 = off, 40 = default, 50 = densest.
    //
    // The perf governor's only lever used to be render DPR, which does nothing
    // about the plume — and additively-blended point sprites piling up on the
    // strike line are the most fill-rate-hungry thing on the stage, all of it
    // concentrated in the few dozen pixels the player is actually looking at.
    // That is the cost profile behind "the counter says 60 but it looks like
    // 35": the main thread keeps servicing rAF on time (note drawing measures
    // 0.15–0.5 ms a frame), while the compositor misses its deadline filling
    // the same pixels over and over. So let the governor thin emission as well
    // — a struggling machine should shed particles, which nobody counts, in
    // preference to frames, which everybody feels. Floored at 40% so the
    // effect thins under load but never disappears.
    const govMul = perfGovScale >= 0.999 ? 1 : Math.max(0.40, perfGovScale);
    // Physical-area scale (see getCanvasPixelBudgetScale): a big/Retina
    // desktop display fills vastly more physical pixels per emitted grain
    // than a phone at the same on-screen density, so it needs proportionally
    // FEWER grains to look the same and cost the same GPU fill-rate. This is
    // separate from govMul (reactive/frame-time based) -- it applies even
    // when frames are perfectly on-budget, which is exactly the case the
    // reactive-only governor could never catch (strong desktop GPU sustains
    // 60fps while burning far more wattage than the effect needs).
    const areaMul = getCanvasPixelBudgetScale();
    const n = Math.round(count * countLevel * 2 * govMul * areaMul);
    if(n <= 0) return;
    // Effective live-particle ceiling: GRAPHIC_PROFILES[tier].dustMax scaled
    // by the same area budget, floored to a sane minimum so the effect never
    // fully vanishes. Previously dustMax was declared per-tier but never
    // actually read anywhere -- particles were unbounded except by the fixed
    // NEON_DUST_MAX=4096 ring buffer, which a 4K/Retina desktop can fill far
    // more expensively (per-grain fill cost) than a phone ever would.
    const dustCap = Math.max(60, Math.round((getGraphicProfile().dustMax || NEON_DUST_MAX) * areaMul));
    if(neonDustCount >= Math.min(dustCap, NEON_DUST_MAX)) return;
    // ALL geometry (size, velocity, drift) scales with the white-key width so
    // the plume keeps the reference proportions on ANY device or piano zoom:
    // sparks are a fraction of a key wide and the plume rises a handful of
    // key-widths high. In absolute px the old values were tuned on desktop
    // (~24px keys) and looked oversized and too fast on a phone (~8px keys).
    const kw = Math.max(6, whiteKeyWidth || 24);
    const sizeMul = (0.35 + sizeLevel * 1.9) * (kw / 26);
    const speedMul = (0.35 + sliderRatio(particleSpeed) * 1.65) * kw;
    const fadeMul = 0.45 + sliderCurve(particleFade, 1.02) * 1.7;
    const sparkFraction = kindMix === undefined ? 0.5 : kindMix;
    // Fallers are firework embers: they leap with the burst, arc over and
    // rain back down under gravity, twinkling as they cool. Marked by a
    // NEGATIVE seedB (the sign is a free tag — sin() only phase-flips).
    const fallerFraction = fallerMix === undefined ? 0.12 : fallerMix;
    const bx = geom.x + geom.w * 0.5;
    const by = stageH - 1;
    const spread = Math.max(2.5, geom.w * 0.34);
    for(let i=0;i<n;i++){
        const idx = _allocDustSlot();
        const faller = Math.random() < fallerFraction;
        const spark = !faller && Math.random() < sparkFraction;
        neonDustX[idx] = bx + (Math.random() - 0.5) * spread;
        neonDustY[idx] = by - Math.random() * 3;
        neonDustSeedA[idx] = Math.random() * Math.PI * 2;
        neonDustSeedB[idx] = 0.6 + Math.random() * 0.9; // per-grain wander frequency
        neonDustAge[idx] = 0;
        neonDustSide[idx] = side;
        if(faller){
            // Firework ember: wide leap, then gravity takes it (see the
            // seedB < 0 branch in updateDrawNeonDust) while it twinkles.
            neonDustVX[idx] = (Math.random() - 0.5) * 3.2 * kw;
            neonDustVY[idx] = -(2.0 + Math.random() * 5.0) * speedMul;
            neonDustR[idx] = Math.min(10, Math.max(1.4, (1.6 + Math.random() * 2.2) * sizeMul));
            neonDustA[idx] = (0.55 + Math.random() * 0.35) * opacityLevel;
            neonDustHeat[idx] = 0.45 + Math.random() * 0.40;
            neonDustLife[idx] = (900 + Math.random() * 900) * fadeMul;
            neonDustSeedB[idx] = -neonDustSeedB[idx];
        } else if(spark){
            // Hot spark: leaps up fast, burns white at the centre, dies young.
            // Rise ≈ 3–8 key-widths per second, decaying (see drag below).
            neonDustVX[idx] = (Math.random() - 0.5) * 2.0 * kw;
            neonDustVY[idx] = -(3.0 + Math.random() * 7.5) * speedMul;
            neonDustR[idx] = Math.min(14, Math.max(1.6, (2.2 + Math.random() * 3.2) * sizeMul));
            neonDustA[idx] = (0.65 + Math.random() * 0.30) * opacityLevel;
            neonDustHeat[idx] = 0.65 + Math.random() * 0.35;
            neonDustLife[idx] = (550 + Math.random() * 750) * fadeMul;
        } else {
            // Ember: rises gently, keeps the dust colour, lingers — the soft
            // misty body of the plume between the bright sparks.
            neonDustVX[idx] = (Math.random() - 0.5) * 1.0 * kw;
            neonDustVY[idx] = -(1.0 + Math.random() * 2.8) * speedMul;
            neonDustR[idx] = Math.min(18, Math.max(2.2, (3.4 + Math.random() * 4.6) * sizeMul));
            neonDustA[idx] = (0.20 + Math.random() * 0.24) * opacityLevel;
            neonDustHeat[idx] = 0.08 + Math.random() * 0.22;
            neonDustLife[idx] = (1000 + Math.random() * 1100) * fadeMul;
        }
    }
}
function startNeonDust(midi, key){
    // Emitters power BOTH effects — the particle plume (Particles toggle) and
    // the contact flare (Strike Reaction toggle) — so they exist if either is on.
    if(isLowGraphic() || midi == null) return;
    if(!strikeLineDustEnabled && !strikeReactionEnabled) return;
    const geom = getKeyStageGeom(midi);
    if(!geom) return;
    // Side is fixed at ignition from the key's tuts position — held notes
    // keep emitting on the side they started on even if the Split slider
    // moves mid-hold, same behaviour as Falling Notes' Split Color.
    const side = getDustSideForMidi(midi);
    // Re-pressing a fading key revives its emitter (flare re-ignites cleanly).
    // (Rainbow needs no colour capture: it's a fixed colour per key now, so
    // _refreshReactionColor can always resolve it fresh.)
    neonDustEmitters.set(midi, { geom, midi, side, start: performance.now(), last: 0, released: 0 });
    // Ignition burst — identical for every press, never trimmed under load.
    spawnNeonDust(geom, 12, 0.55, side, 0.30);
    if(typeof strikeLineHit !== 'undefined' && strikeLineHit) strikeLineHit.classList.add('on');
    ensureAnimLoop();
}
function stopNeonDust(midi){
    const em = neonDustEmitters.get(midi);
    // Keep the emitter alive briefly so the contact flare fades out instead of
    // vanishing on note-off; updateDrawNeonDust removes it after the release.
    if(em && !em.released) em.released = performance.now();
    let anyHeld = false;
    neonDustEmitters.forEach(e => { if(!e.released) anyHeld = true; });
    if(!anyHeld && typeof strikeLineHit !== 'undefined' && strikeLineHit) strikeLineHit.classList.remove('on');
}
// Strike Reaction = the contact flare rendered in the GL particle layer (see
// _packContactFlares / _draw2dContactFlares). The old DOM ".strike-pulse"
// pop-animation this function used to drive was superseded by the flare —
// running both doubled the light at the contact point. Kept as a no-op so
// legacy call sites/presets stay harmless.
function spawnStrikeReaction(midi){}
// A full-viewport WebGL canvas stays a compositor layer even when it is empty:
// the browser still takes it back and blends it every frame. #fxParticles is
// the same size as the stage, so an idle particle layer was paying for a
// full-screen composite to show nothing. Taking it out of the layer tree while
// it has no particles removes that. Guarded so the style is only written on an
// actual transition — toggling display every frame would be its own cost.
let _glCanvasShown = true;
function setGlCanvasActive(active){
    if(active === _glCanvasShown) return;
    _glCanvasShown = active;
    if(glCanvas) glCanvas.style.display = active ? '' : 'none';
}
function updateDrawNeonDust(dt, now){
    if(isLowGraphic() || (!strikeLineDustEnabled && !strikeReactionEnabled)){
        neonDustCount = 0;
        neonDustEmitters.clear();
        clearGlParticles();
        setGlCanvasActive(false);
        return false;
    }
    // Particles off but Strike Reaction on: drop the plume, keep the flares.
    if(!strikeLineDustEnabled) neonDustCount = 0;
    // Holding a key only MAINTAINS the stream — it does NOT thicken it. Every
    // held note emits at the same steady rate/amount, so density is even across
    // all presses and no single long-held note hogs the particle budget.
    // Released emitters stop emitting but stick around until the contact flare
    // has finished fading out.
    neonDustEmitters.forEach((em, key) => {
        if(em.released){
            if(now - em.released > FLARE_RELEASE_MS) neonDustEmitters.delete(key);
            return;
        }
        if(em.midi != null){
            const g = getKeyStageGeom(em.midi);
            if(g) em.geom = g;
        }
        if(now - em.last >= DUST_EMIT_INTERVAL){
            em.last = now;
            spawnNeonDust(em.geom, 3, 0.35, em.side, 0.15);
        }
    });

    if(!neonDustCount && !neonDustEmitters.size){ clearGlParticles(); setGlCanvasActive(false); return false; }
    setGlCanvasActive(true);

    if(dustColorFollowFallingNotes){
        // Gradient/Rainbow have no fixed 2-colour pair to hand the plume's
        // flat side batches, so they're approximated with one representative
        // hue (the gradient's centre-keyboard colour, or Rainbow's current
        // instantaneous hue there) rather than a per-note rewrite of the
        // particle pipeline.
        if(animColorMode === 'gradient'){
            const repColor = gradientColorForMidi(64);
            _refreshDustColor(0, repColor);
            _refreshDustColor(1, repColor);
        } else if(animColorMode === 'rainbow'){
            const repColor = rainbowColorForMidi(64);
            _refreshDustColor(0, repColor);
            _refreshDustColor(1, repColor);
        } else if(animColorSplit){
            _refreshDustColor(0, animDoubleLeftColor);
            _refreshDustColor(1, animDoubleRightColor);
        } else {
            const followColor = cachedAnimColor || dustColor;
            _refreshDustColor(0, followColor);
            _refreshDustColor(1, followColor);
        }
    } else {
        _refreshDustColor(0, dustColorSplit ? dustDoubleLeftColor : dustColor);
        _refreshDustColor(1, dustColorSplit ? dustDoubleRightColor : dustColor);
    }
    // Physics in CSS px per SECOND — real time, so the plume shape is identical
    // at any frame rate (dropped frames never change how far a spark travels).
    // Forces scale with key width, same reasoning as in spawnNeonDust.
    const kw = Math.max(6, whiteKeyWidth || 24);
    const turb = sliderRatio(particleTurbulence);
    const wanderAmp = 4.6 * kw * turb;     // lateral wander force, px/s²
    const dragY = Math.exp(-dt * 1.15);    // rise decelerates like a real ember
    const dragX = Math.exp(-dt * 2.0);
    const driftY = -0.65 * kw;             // residual buoyant drift, px/s
    const gravity = 5.2 * kw;              // faller ember gravity, px/s²
    // When the WebGL layer is live the 2D context is left untouched — physics
    // run here, the single GL draw happens after the loop.
    const useGl = !!glParticles;
    if(!useGl){
        ctx2d.save();
        // Additive fallback so overlapping sparks still brighten like the GL path.
        ctx2d.globalCompositeOperation = 'lighter';
    }
    let alive = 0;
    for(let i=0;i<neonDustCount;i++){
        neonDustAge[i] += dt * 1000;
        if(neonDustAge[i] >= neonDustLife[i] || neonDustY[i] < -40 || neonDustY[i] > (canvasCssH || 4096) + 30) continue;
        const tLife = neonDustLife[i] > 0 ? neonDustAge[i] / neonDustLife[i] : 1;
        if(turb > 0){
            // Two out-of-phase sines per grain read as turbulent flame licks;
            // influence grows with age so the plume base stays anchored and the
            // tips wave (like the reference's wind-blown trails).
            const age = neonDustAge[i] * 0.001;
            const wander = Math.sin(age * (5.2 * neonDustSeedB[i]) + neonDustSeedA[i]) * 0.62
                         + Math.sin(age * (11.4 * neonDustSeedB[i]) + neonDustSeedA[i] * 2.3) * 0.38;
            neonDustVX[i] += wander * wanderAmp * (0.30 + Math.min(1, tLife) * 0.85) * dt;
        }
        neonDustVX[i] *= dragX;
        if(neonDustSeedB[i] < 0){
            // Faller: decelerates, arcs over and drops back down under
            // gravity instead of drifting up with the plume.
            neonDustVY[i] = neonDustVY[i] * dragY + gravity * dt;
        } else {
            neonDustVY[i] = driftY + (neonDustVY[i] - driftY) * dragY;
        }
        neonDustX[i] += neonDustVX[i] * dt;
        neonDustY[i] += neonDustVY[i] * dt;

        if(!useGl){
            let alpha = Math.min(1, neonDustA[i] * _dustFade(tLife));
            // Fallers twinkle like cooling firework embers.
            if(neonDustSeedB[i] < 0) alpha *= 0.6 + 0.4 * Math.sin(now * (0.010 - neonDustSeedB[i] * 0.012) + neonDustSeedA[i] * 7.0);
            if(alpha > 0.015){
                const sz = Math.max(1.5, neonDustR[i]);
                ctx2d.globalAlpha = alpha;
                ctx2d.drawImage(_dustSprite[neonDustSide[i]] || _dustSprite[0], neonDustX[i] - sz * 0.5, neonDustY[i] - sz * 0.5, sz, sz);
            }
        }
        if(alive !== i){
            neonDustX[alive]=neonDustX[i]; neonDustY[alive]=neonDustY[i];
            neonDustVX[alive]=neonDustVX[i]; neonDustVY[alive]=neonDustVY[i];
            neonDustR[alive]=neonDustR[i]; neonDustA[alive]=neonDustA[i];
            neonDustLife[alive]=neonDustLife[i]; neonDustAge[alive]=neonDustAge[i];
            neonDustSeedA[alive]=neonDustSeedA[i]; neonDustSeedB[alive]=neonDustSeedB[i];
            neonDustHeat[alive]=neonDustHeat[i]; neonDustSide[alive]=neonDustSide[i];
        }
        alive++;
    }
    neonDustCount = alive;
    if(_dustStealCursor >= neonDustCount) _dustStealCursor = 0;
    if(useGl){
        renderGlParticles(now);
    } else {
        _draw2dContactFlares(now);
        ctx2d.restore();
        ctx2d.globalAlpha = 1;
        ctx2d.globalCompositeOperation = 'source-over';
    }
    return neonDustCount > 0 || neonDustEmitters.size > 0;
}
// 2D-fallback flare (no WebGL): approximates _packContactFlares' composition
// (horizon band, flame tongue, hot kernel) by stretching the round glow
// sprite under 'lighter' compositing — a tall narrow ellipse centred on the
// strike line clips to a rising tongue, a wide flat one to the horizon band.
function _draw2dContactFlares(now){
    if(!strikeReactionEnabled || !strikeLineEnabled || !neonDustEmitters.size) return;
    const iMul = _flareIntensityMul();
    if(iMul <= 0.001) return;
    const baseY = (canvasCssH || cachedStageHeight || knownStageH || 1) - 1;
    neonDustEmitters.forEach(em => {
        const env = _flareEnvelope(em, now);
        if(env <= 0.003 || !em.geom) return;
        // Flare colour follows the Falling Notes Split Color — Strike Reaction
        // is bound to the anim colour, not the particle colour. Make sure the
        // reaction sprite for that side is cached before we draw it.
        const reactionSide = getAnimSideForMidi(em.midi);
        _refreshReactionColor(reactionSide, em.midi);
        const sprite = _reactionSprite[reactionSide] || _reactionSprite[0];
        if(!sprite) return;
        const cx = em.geom.x + em.geom.w * 0.5;
        const keyW = Math.max(8, em.geom.w);
        const fl = 0.86 + 0.14 * Math.sin(now * 0.021 + em.midi * 1.7);
        const sway = Math.sin(now * 0.0016 + em.midi * 2.1) * keyW * 0.12;
        const hEnv = 0.55 + 0.45 * env;
        const pop = 1 + 1.1 * Math.exp(-(now - em.start) / 80);
        // Horizon band spilling along the strike line.
        ctx2d.globalAlpha = Math.min(1, 0.30 * env * fl * iMul);
        ctx2d.drawImage(sprite, cx - keyW * 3.2, baseY - keyW * 1.0, keyW * 6.4, keyW * 2.6);
        // Flame tongue: lower half of the ellipse is clipped off-stage, so
        // only the rising half shows above the line.
        const h1 = keyW * 4.8 * fl * hEnv;
        ctx2d.globalAlpha = Math.min(1, 0.50 * env * fl * iMul);
        ctx2d.drawImage(sprite, cx + sway - keyW * 0.85, baseY - h1, keyW * 1.7, h1 * 2);
        // Lens streak flash hugging the line.
        ctx2d.globalAlpha = Math.min(1, 0.45 * env * fl * pop * iMul);
        ctx2d.drawImage(sprite, cx - keyW * 1.8, baseY - keyW * 0.45, keyW * 3.6, keyW * 0.9);
        // Hot kernel at the contact point; flashes with the ignition pop.
        ctx2d.globalAlpha = Math.min(1, 0.85 * env * fl * pop * iMul);
        ctx2d.drawImage(sprite, cx - keyW * 0.8, baseY - keyW * 0.8, keyW * 1.6, keyW * 1.6);
    });
}

function normalizeFallingOverrideColor(value){
    const raw = String(value || '').trim();
    if(/^#[0-9a-fA-F]{6}$/.test(raw)) return raw.toLowerCase();
    if(/^#[0-9a-fA-F]{3}$/.test(raw)) return '#' + raw.slice(1).split('').map(ch => ch + ch).join('').toLowerCase();
    return '';
}
function addFallingNote(n, options = {}){
    n = Number(n);
    if(!Number.isFinite(n) || n < 21 || n > 108) return;
    const ownerId = options.ownerId || null;
    const ownerStr = ownerId == null ? '' : String(ownerId);
    const remote = !!options.remote;
    const remoteLevel = options.remoteLevel === 'full' ? 'full' : 'light';
    ensureStageCanvasFresh();
    if(!cachedStageHeight) refreshStageHeight();
    const rawBottomY = canvasCssH || cachedStageHeight || knownStageH || window.innerHeight * 0.6;
    const bottomY = canvasCssH > 0 ? Math.min(rawBottomY, canvasCssH) : rawBottomY;
    if(bottomY <= 6) return;
    // Release any existing growing notes with same midi+owner to prevent stuck notes at fast tempos
    const existing = fallingByMidi.get(n);
    // The note this one follows in the same column. Held so the renderer can
    // stop this bar from growing across it — see NOTE_SEAM_PX.
    let prevInColumn = null;
    if(existing){
        for(let i=0;i<existing.length;i++){
            const e = existing[i];
            if(e && e.growing && (e.ownerId == null ? '' : String(e.ownerId)) === ownerStr){
                e.growing = false;
            }
        }
        for(let i=existing.length-1;i>=0;i--){
            const e = existing[i];
            if(e && !e.dead && (e.ownerId == null ? '' : String(e.ownerId)) === ownerStr){ prevInColumn = e; break; }
        }
    }

    // anim() already compacts dead notes; doing it here too made addFallingNote
    // O(n) per press, turning a 100-note glissando into 10k array ops.
    const resolvedStyle = resolveAnimStyle(animStyle);
    const colorOverride = normalizeFallingOverrideColor(options.color);
    // seatColor tints a LOCAL styled note with the player's identity colour
    // without forcing it to plain solid (unlike colorOverride, which remote
    // notes use to render flat).
    const seatTint = (!remote && !colorOverride) ? normalizeFallingOverrideColor(options.seatColor) : '';
    const style = colorOverride ? 'single' : (remote ? 'single' : animStyle);
    const styleResolved = colorOverride ? 'single' : (remote ? 'single' : resolvedStyle);
    const opacity = remote ? Math.min(noteOpacity, remoteLevel === 'light' ? 88 : 96) : noteOpacity;
    const base = colorOverride || seatTint || getAnimBaseColorForMidi(n);

    // Random per-note seed for the Aura style's flow blobs (see
    // drawAuraFlow) — without it every note shares the exact same phase
    // clock, so a chord struck together looks like several copies of one
    // pattern rather than each note mixing independently.
    const auraSeed = Math.random();
    const f = {midi:n, bottomY:bottomY, y:bottomY-MIN_NOTE_HEIGHT, height:MIN_NOTE_HEIGHT, style, styleResolved, shape:animShape, roundness:animRoundness, opacity, base, colorOverride, growing:true, grownAtMs:performance.now(), ownerId:options.ownerId || null, remote, auraSeed, prevInColumn};
    // Frozen alongside f.base: a Horizontal-axis Gradient note's accent
    // never needs to move after creation; only Vertical refreshes it (see
    // drawFallingNote's band-crossing guard).
    if(!remote && !colorOverride) f.accent = fallingNoteAccentColors(f.midi, f.y, f.height);

    falling.push(f);
    registerFallingNote(f);
    ensureAnimLoop();
}
function addAnim(n){
    addFallingNote(n, selfSeatNoteOpts());
}
function addRemoteAnim(n, playerId, level, color){
    if(!isAnimOn) return;
    addFallingNote(n, { remote:true, remoteLevel:level, ownerId:remoteFallingOwnerId(playerId), color });
}
function hexToRgb(hex){ hex=hex.trim().replace('#',''); if(hex.length===3) hex=hex.split('').map(c=>c+c).join(''); const n=parseInt(hex,16); return [(n>>16)&255,(n>>8)&255,n&255]; }
let animFrameId = null;
let _lastAnimTs = -1;
function ensureAnimLoop(){
    if(!animFrameId){
        lastFrameTime=0;
        if(document.body.classList.contains('idle-no-notes')){
            document.body.classList.remove('idle-no-notes');
        }
        animFrameId=requestAnimationFrame(anim);
    }
}
if(document && document.body) document.body.classList.add('idle-no-notes');
else document.addEventListener('DOMContentLoaded', () => document.body.classList.add('idle-no-notes'), { once:true });
refreshStageHeight();


// ── Painted-area budget ──────────────────────────────────────────────────
// Falling notes are the ONLY thing drawn on the #fx 2D canvas, yet every frame
// used to clear and hand back the entire viewport. Measured with an identical
// note workload (350-370 notes drawn per frame in all three runs) and only the
// canvas size changed:
//
//     backing pixels   ms/frame   inside anim()   OUTSIDE anim()
//          2.46 M        35.09         6.74            28.35
//          1.24 M        25.16         9.10            16.06
//          0.66 M        18.41         6.56            11.85
//
// Time inside anim() barely moves; everything else tracks AREA. So the lever on
// this frame is how many pixels get repainted and recomposited, not how many
// notes get drawn — which is also why a PC is no faster than a phone here: more
// pixels spends the extra hardware.
//
// Clearing only the region actually touched last frame keeps the untouched part
// of the canvas unchanged, so the compositor has less to take back.
let _fxD0x = Infinity, _fxD0y = Infinity, _fxD1x = -Infinity, _fxD1y = -Infinity;
// Anything that invalidates the whole surface (a resize, a settings change)
// sets this so the next frame wipes everything rather than trusting the union.
let _fxFullClear = true;
function markFxFullClear(){ _fxFullClear = true; }
function _fxMarkDirty(x0, y0, x1, y1){
    if(x0 < _fxD0x) _fxD0x = x0;
    if(y0 < _fxD0y) _fxD0y = y0;
    if(x1 > _fxD1x) _fxD1x = x1;
    if(y1 > _fxD1y) _fxD1y = y1;
}
const _spriteCache = new Map();
// Eviction is a real LRU (last-used counter per key, same pattern as the
// Visualizer's tile cache) — insertion-order FIFO used to evict sprites that
// were still being reused every frame just because an unrelated newer key
// pushed the cache over its ceiling.
const _spriteUse = new Map();
let _spriteUseCounter = 0;
function _spriteCacheGet(key){
    const v = _spriteCache.get(key);
    if(v !== undefined) _spriteUse.set(key, ++_spriteUseCounter);
    return v;
}
function _spriteCacheSet(key, sprite){
    if(_spriteCache.size >= _SPRITE_CACHE_MAX && !_spriteCache.has(key)){
        let lruKey = null, lruVal = Infinity;
        _spriteUse.forEach((v, k) => { if(v < lruVal){ lruVal = v; lruKey = k; } });
        if(lruKey != null){ _spriteCache.delete(lruKey); _spriteUse.delete(lruKey); }
    }
    _spriteCache.set(key, sprite);
    _spriteUse.set(key, ++_spriteUseCounter);
}
// Sized against the measured working set, not guessed. Counting the distinct
// sprite keys a 7 s run of glass actually asks for: 66 on a single colour, 174
// on gradient-horizontal, 177 on gradient-vertical — and 356 on rainbow, which
// simply did not fit in the old 320. A working set larger than the cache is not
// a cache, it is a bake queue: every note evicted the entry the next note
// wanted, which is why rainbow was the heaviest mode of all at 55.8 canvas
// bakes/sec despite nothing about it being intrinsically harder to draw.
//
// The ceiling was also far more expensive to get wrong than to raise. The full
// 320-entry cache measures 1.5 MB of backing store, about 4.7 KB per sprite, so
// 512 costs on the order of another megabyte — against re-baking hundreds of
// off-screen canvases per second. Note that this cache is shared across styles
// and persists when the user switches mode, so the live pressure is higher than
// any single mode's number above.
const _SPRITE_CACHE_MAX = 512;
// Glow Intensity slider: max bleed a sprite is allowed to bake past its own
// body, in CSS px. TBDR mobile GPUs pay for every padded pixel as extra
// overdraw/fill-rate on every one of a chord's notes every frame, so the
// slider's whole range maps into this ceiling rather than letting the user
// dial in an unbounded blur.
const NOTE_GLOW_MAX_PAD = 14;
function noteGlowPadPx(){
    if(!noteGlowEnabled) return 0;
    // Slider range is 0..200 — 100 == the old "full" glow, 200 doubles the
    // bleed for people who want a heavier neon look. Kept as a multiplier
    // of NOTE_GLOW_MAX_PAD so the ceiling stays a single number to tune.
    return (Math.max(0, Math.min(200, noteGlowIntensity)) / 100) * NOTE_GLOW_MAX_PAD;
}
// Outline is a hollow border and Midnight is a deliberately sunken column —
// a neon bleed reads as dirt on both, so they opt out of Glow entirely.
const GLOWLESS_STYLES = { outline:1, midnight:1 };
function styleTakesGlow(style){ return !GLOWLESS_STYLES[style]; }
function notePadFor(style){
    if(!styleTakesGlow(style)) return 0;
    return noteGlowPadPx();
}
function clearEffectSpriteCache(){
    clearChromeSheets();
    clearChromeHaloCache();
    if(_spriteCache && _spriteCache.clear) _spriteCache.clear();
    if(_spriteUse && _spriteUse.clear) _spriteUse.clear();
}
function _qBucket(n, step){ return Math.max(step, Math.round(n / step) * step); }
function _colorBucket(rgb){
    return ((rgb[0] >> 4) << 8) | ((rgb[1] >> 4) << 4) | (rgb[2] >> 4);
}
function _isNearWhiteRgb(rgb){
    return !!rgb && rgb[0] >= 235 && rgb[1] >= 235 && rgb[2] >= 235;
}
function _spriteRoundPath(sctx, w, h, r){
    r = Math.max(0, Math.min(r || 0, w * 0.5, h * 0.5));
    sctx.beginPath();
    if(r <= 0){ sctx.rect(0, 0, w, h); return; }
    if(sctx.roundRect){ sctx.roundRect(0, 0, w, h, r); return; }
    sctx.moveTo(r, 0);
    sctx.lineTo(w - r, 0);
    sctx.quadraticCurveTo(w, 0, w, r);
    sctx.lineTo(w, h - r);
    sctx.quadraticCurveTo(w, h, w - r, h);
    sctx.lineTo(r, h);
    sctx.quadraticCurveTo(0, h, 0, h - r);
    sctx.lineTo(0, r);
    sctx.quadraticCurveTo(0, 0, r, 0);
    sctx.closePath();
}

// Materials that get a small pool of baked variants (not one shared sprite)
// so a chord full of the same Style/colour doesn't read as stamped copies —
// the variant index (folded into the cache key below) picks which highlight
// offset a given note uses, chosen by the note's own seed at the call site.
// Some repeats across a big chord are expected and fine.
const MATERIAL_VARIANT_STYLES = { glass:1 };

// CanvasRenderingContext2D.filter (the CSS Filter Effects spec applied to
// Canvas2D) only shipped in Safari 17.4 (March 2024) — every iOS/Safari
// version before that silently ignores the assignment, no error, `filter`
// just stays 'none'. Every halo mask below is baked with `mctx.filter =
// 'blur(...)'`, so on an unsupported Safari the fill comes out with a hard
// edge instead of a soft one: the Glow effect the user reported as "not
// working on iPhone."
//
// Detected once, not sniffed from the UA: assign a filter, read it back --
// if it did not stick, the browser cannot do this. Browsers that already
// render correctly (Chromium, Safari 17.4+) get the exact SAME `blur()` path
// as before, byte-for-byte; only a browser that would otherwise render the
// mask with no blur at all takes the fallback.
const _CANVAS_FILTER_SUPPORTED = (() => {
    try {
        const c = document.createElement('canvas').getContext('2d');
        c.filter = 'blur(2px)';
        return c.filter !== 'none' && c.filter !== '';
    } catch(e){ return false; }
})();
// Fills a rounded rect and blurs it into mctx, whichever technique this
// browser actually supports. `ctx.shadowBlur`/`shadowColor` is part of the
// original Canvas2D Level 1 spec (supported since the earliest WebKit
// Canvas implementations, over a decade before `ctx.filter` existed), so it
// is the fallback: draw the shape fully offscreen (shadowOffsetY pushed past
// the canvas) so only its blurred shadow lands inside the visible mask,
// which is exactly the soft falloff the blur()-filtered fill produces.
function _fillBlurredRoundRect(mctx, w, h, r, pad){
    if(_CANVAS_FILTER_SUPPORTED){
        mctx.filter = `blur(${Math.max(1, pad * 0.4).toFixed(2)}px)`;
        mctx.fillStyle = '#ffffff';
        _spriteRoundPath(mctx, w, h, r);
        mctx.fill();
        return;
    }
    const off = Math.max(w, h) + pad * 4;
    mctx.save();
    mctx.shadowColor = '#ffffff';
    mctx.shadowBlur = Math.max(1, pad * 0.4);
    mctx.shadowOffsetY = off;
    mctx.fillStyle = '#ffffff';
    mctx.translate(0, -off);
    _spriteRoundPath(mctx, w, h, r);
    mctx.fill();
    mctx.restore();
}
// White halo silhouettes for the Glow Intensity aura, keyed by GEOMETRY
// only — never by colour. The Gaussian `filter: blur()` fill is by far the
// most expensive single operation in a sprite bake, and it used to re-run
// inside EVERY colour's bake. Under Gradient/Rainbow (many distinct colours
// live at once, so per-colour bakes are frequent by design) that per-colour
// blur was the dominant per-miss cost. Splitting it out means the blur runs
// once per size bucket, and each colour's bake just tints this mask with
// one source-in fill + drawImage. (Ported from the Visualizer.)
const _haloMaskCache = new Map();
const _HALO_MASK_CACHE_MAX = 48;
function getHaloMask(wB, hB, r, pad, dpr){
    const key = `${wB}_${hB}_${r | 0}_${Math.round(pad * 4)}_${Math.round(dpr * 100)}`;
    let mask = _haloMaskCache.get(key);
    if(mask) return mask;
    if(_haloMaskCache.size >= _HALO_MASK_CACHE_MAX){
        const firstKey = _haloMaskCache.keys().next().value;
        _haloMaskCache.delete(firstKey);
    }
    mask = document.createElement('canvas');
    const wLogical = wB + pad * 2, hLogical = hB + pad * 2;
    mask.width = Math.max(1, Math.round(wLogical * dpr));
    mask.height = Math.max(1, Math.round(hLogical * dpr));
    const mctx = mask.getContext('2d', { alpha: true });
    const sx = mask.width / wLogical, sy = mask.height / hLogical;
    if(sx !== 1 || sy !== 1) mctx.scale(sx, sy);
    mctx.translate(pad, pad);
    // Blur radius sits at 0.4*pad so the Gaussian's visible extent
    // (~2σ ≈ 0.8*pad) fits inside the pad margin without clipping to a
    // hard alpha edge.
    _fillBlurredRoundRect(mctx, wB, hB, r, pad);
    _haloMaskCache.set(key, mask);
    return mask;
}
// Stamps the aura under a sprite being baked: colour = one source-in fill
// over the mask's alpha, no blur. Must run while the sprite canvas is still
// empty (the body is drawn over it afterwards).
function stampHaloTint(sctx, sprite, mask, auraAlpha, fillStyle){
    sctx.save();
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    sctx.globalAlpha = auraAlpha;
    sctx.drawImage(mask, 0, 0, sprite.width, sprite.height);
    sctx.globalAlpha = 1;
    sctx.globalCompositeOperation = 'source-in';
    sctx.fillStyle = fillStyle;
    sctx.fillRect(0, 0, sprite.width, sprite.height);
    sctx.restore();
}

// ── Height-independent Glow halo for a GROWING note ─────────────────────
// getHaloMask/stampHaloTint bake the aura AS PART OF the cached sprite, keyed
// on the note's bucketed height (hB) -- free once a note stops changing size,
// but a note actively growing walks through a fresh bucket roughly every 8
// logical px. Measured on one held note reaching 720px with Glow on: 87
// sprite bakes and 87 halo misses in 5s -- the exact treadmill the non-Glow
// styles were fixed to avoid (see drawFallingNote), just never extended to
// cover Glow, since that fix only skips the fetch when pad<=0.5 (Glow off).
//
// The general idea: pull what doesn't actually depend on the note's
// current height out of the cache key. A Gaussian blur is local,
// so a row several blur-radii away from either rounded cap only ever sees the
// LEFT/RIGHT edges -- fixed by width and corner radius, never by height. So
// this mask bakes ONCE at a fixed reference height holding both full caps
// plus a small uniform sample strip, and any real height is reconstructed
// with three drawImage calls: the two caps copied unstretched from the
// mask's own ends, and a single physical-pixel row from the uniform strip
// stretched to fill whatever gap remains. Stretching a row with no variation
// along the stretch axis introduces no distortion.
const _haloMaskLiveCache = new Map();
const _HALO_MASK_LIVE_MAX = 24;
const _HALO_MID_STRIP_PX = 4;    // logical px reserved for the sample row
function _haloCapHeightFor(pad, r){
    // Blur radius is pad*0.4 (see getHaloMask); a full extra `pad` of
    // straight run past the corner keeps the sample row provably outside
    // that blur kernel, plus 4px of margin for safety.
    return r + pad + 4;
}
function getHaloMaskLive(wB, r, pad, dpr){
    const key = `${wB}_${r | 0}_${Math.round(pad * 4)}_${Math.round(dpr * 100)}`;
    let mask = _haloMaskLiveCache.get(key);
    if(mask) return mask;
    if(_haloMaskLiveCache.size >= _HALO_MASK_LIVE_MAX){
        const firstKey = _haloMaskLiveCache.keys().next().value;
        _haloMaskLiveCache.delete(firstKey);
    }
    const capH = _haloCapHeightFor(pad, r);
    const shapeH = capH * 2 + _HALO_MID_STRIP_PX;
    const wLogical = wB + pad * 2, hLogical = shapeH + pad * 2;
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(wLogical * dpr));
    cv.height = Math.max(1, Math.round(hLogical * dpr));
    const mctx = cv.getContext('2d', { alpha: true });
    const sx = cv.width / wLogical, sy = cv.height / hLogical;
    if(sx !== 1 || sy !== 1) mctx.scale(sx, sy);
    mctx.translate(pad, pad);
    _fillBlurredRoundRect(mctx, wB, shapeH, r, pad);
    mask = { canvas: cv, capH };
    _haloMaskLiveCache.set(key, mask);
    return mask;
}
// Reused across every growing-note halo composite this frame and the next,
// resized as needed but never recreated -- this path allocates NO canvas per
// note per frame; the reference mask above is the only bake, and it is
// shared by every note of the same width/roundness/glow setting.
let _haloScratchCv = null, _haloScratchCtx = null;
function _haloScratch(wPhys, hPhys){
    if(!_haloScratchCv){
        _haloScratchCv = document.createElement('canvas');
        _haloScratchCtx = _haloScratchCv.getContext('2d', { alpha: true });
    }
    if(_haloScratchCv.width !== wPhys || _haloScratchCv.height !== hPhys){
        _haloScratchCv.width = wPhys;
        _haloScratchCv.height = hPhys;
    } else {
        _haloScratchCtx.clearRect(0, 0, wPhys, hPhys);
    }
    return _haloScratchCtx;
}
// True if it drew the halo; false means the note is too short for the
// 9-slice split (caps would overlap, or the note's real corner radius has
// not yet saturated to the height-independent value this mask assumes) and
// the caller should fall back to the ordinary cached sprite/halo path --
// harmless, since a short note has not crossed many height buckets yet.
function drawGlowHaloLive(ctx, x, y, w, h, wB, r, pad, dpr, auraAlpha, rgb){
    // r only converges to its height-independent value once hB*0.35 stops
    // being the tighter clamp in getEffectSprite's own r formula (see
    // there) -- below that height this mask's corner would read rounder
    // than the cached path's, so bail out until both conditions clear.
    const capH = _haloCapHeightFor(pad, r);
    if(h < Math.max(capH * 2, wB * 1.3)) return false;
    const mask = getHaloMaskLive(wB, r, pad, dpr);
    const wPhys = mask.canvas.width;
    const capHPhys = Math.round((pad + capH) * dpr);
    const midRowPhys = Math.min(mask.canvas.height - 1, Math.round((pad + capH + _HALO_MID_STRIP_PX / 2) * dpr));

    const outWPhys = Math.max(1, Math.round((w + pad * 2) * dpr));
    const outHPhys = Math.max(1, Math.round((h + pad * 2) * dpr));
    if(outHPhys < capHPhys * 2) return false;
    const sctx = _haloScratch(outWPhys, outHPhys);
    sctx.save();
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    // Top cap, copied unstretched.
    sctx.drawImage(mask.canvas, 0, 0, wPhys, capHPhys, 0, 0, outWPhys, capHPhys);
    // Bottom cap, copied unstretched.
    sctx.drawImage(mask.canvas, 0, mask.canvas.height - capHPhys, wPhys, capHPhys,
                    0, outHPhys - capHPhys, outWPhys, capHPhys);
    // The uniform middle, stretched to fill whatever gap remains.
    const midOutH = outHPhys - capHPhys * 2;
    if(midOutH > 0){
        sctx.drawImage(mask.canvas, 0, midRowPhys, wPhys, 1, 0, capHPhys, outWPhys, midOutH);
    }
    sctx.globalCompositeOperation = 'source-in';
    sctx.fillStyle = `rgb(${rgb[0] | 0},${rgb[1] | 0},${rgb[2] | 0})`;
    sctx.fillRect(0, 0, outWPhys, outHPhys);
    sctx.restore();

    ctx.save();
    ctx.globalAlpha = auraAlpha;
    ctx.drawImage(_haloScratchCv, x - pad, y - pad, w + pad * 2, h + pad * 2);
    ctx.globalAlpha = 1;
    ctx.restore();
    return true;
}

// Two scratch canvases for the gradient-accent cross-fade in getEffectSprite.
// Resized in place, never reallocated per bake, and only ever touched on the
// accent path -- a flat-colour bake never allocates them at all.
const _matScratchCv = [null, null];
const _matScratchCtx = [null, null];
function _matScratch(i, wPhys, hPhys){
    if(!_matScratchCv[i]){
        _matScratchCv[i] = document.createElement('canvas');
        _matScratchCtx[i] = _matScratchCv[i].getContext('2d', { alpha: true });
    }
    const cv = _matScratchCv[i];
    if(cv.width !== wPhys || cv.height !== hPhys){ cv.width = wPhys; cv.height = hPhys; }
    else _matScratchCtx[i].clearRect(0, 0, wPhys, hPhys);
    return _matScratchCtx[i];
}
// `accent` is Gradient Colour Mode's per-note COLOUR PAIR (see
// fallingNoteAccentColors). Materials used to ignore it entirely: Midnight
// and Glass took only the flat base colour, so switching to Gradient changed
// which colour each note was but never blended ACROSS a note the way the
// Default material does through getGradientSprite. That is the "midnight dan
// glass ga support transisi gradient" report.
//
// A material is not a fill, so it cannot just take a CanvasGradient as its
// fillStyle -- Glass alone is a veil, two edge glows, a streak and two rim
// strokes, each derived from the base colour. Instead the whole material is
// baked TWICE, once per endpoint colour, and the two bakes are cross-faded
// along the accent axis through an alpha mask. That works for any material
// without knowing anything about how it is drawn, and it stays correct for a
// translucent one (Glass): masking each bake separately and compositing them
// avoids the doubled-up veil that painting B straight over A would give.
function getEffectSprite(style, rgb, w, h, isRounded, roundnessPct, variant, accent){
    const wB = _qBucket(w, 2);
    // Height bucket kept small (8 CSS px) because the sprite is baked at
    // (wB, hB) but drawn stretched to (w, h). Every bucket boundary shifts
    // the halo band's top/bottom edge by up to pad*(bucket/(2*(hB+2*pad)))
    // px — for a held note whose h grows one pixel per frame, a large
    // bucket (24) made that step land right at 1-2 px, which reads on
    // screen as the falling note "vibrating" up and down whenever glow was
    // on. 8 px keeps the drift comfortably under 1 px while still keeping
    // the sprite cache from thrashing on the common medium-duration notes.
    const hB = _qBucket(h, 8);
    const cB = style === 'solid' ? ((rgb[0]|0) * 65536 + (rgb[1]|0) * 256 + (rgb[2]|0))
             : _colorBucket(rgb);
    const roundPct = isRounded ? Math.max(0, Math.min(100, Math.round(Number(roundnessPct ?? 100)))) : 0;
    const sB = roundPct > 0 ? ('r' + roundPct) : 's';
    const rB = roundPct > 0 ? (Math.min(8, wB * 0.45, hB * 0.35) * (roundPct / 100)) | 0 : 0;
    const dpr = currentDPR || 1;
    const dprB = Math.round(dpr * 100) | 0;
    const glowB = (noteGlowEnabled && styleTakesGlow(style)) ? Math.round(Math.max(0, Math.min(200, noteGlowIntensity)) / 4) : 0;
    const vB = MATERIAL_VARIANT_STYLES[style] ? (Math.max(0, variant|0) % 4) : 0;
    // 'solid' has its own two-colour baker (getGradientSprite) and must not
    // grow a second one here. A pair whose endpoints are equal is not really
    // an accent: dropping it keeps those bakes pixel-for-pixel identical to
    // what shipped before materials understood accents at all.
    const acc = (accent && style !== 'solid'
        && (accent.rgbA[0] !== accent.rgbB[0] || accent.rgbA[1] !== accent.rgbB[1] || accent.rgbA[2] !== accent.rgbB[2]))
        ? accent : null;
    const aB = acc
        ? `_${(acc.rgbA[0]|0)*65536 + (acc.rgbA[1]|0)*256 + (acc.rgbA[2]|0)}_${(acc.rgbB[0]|0)*65536 + (acc.rgbB[1]|0)*256 + (acc.rgbB[2]|0)}${acc.dir}`
        : '';
    const key = `${style}_${cB}_${wB}_${hB}_${sB}_${rB}_${dprB}_${glowB}_${vB}${aB}`;
    let sprite = _spriteCacheGet(key);
    if(sprite) return sprite;
    sprite = document.createElement('canvas');
    const pad = notePadFor(style);
    const wLogical = wB + pad * 2, hLogical = hB + pad * 2;
    const wPhys = Math.max(1, Math.round(wLogical * dpr));
    const hPhys = Math.max(1, Math.round(hLogical * dpr));
    sprite.width = wPhys;
    sprite.height = hPhys;
    const sctx = sprite.getContext('2d', { alpha: true });
    sctx.imageSmoothingEnabled = true;
    sctx.imageSmoothingQuality = 'high';
    const sxBake = wPhys / wLogical;
    const syBake = hPhys / hLogical;
    if(sxBake !== 1 || syBake !== 1) sctx.scale(sxBake, syBake);
    if(pad) sctx.translate(pad, pad);
    // Mirrors rB's math above (used only for the cache key) -- without the
    // *(roundPct/100) factor here too, every non-zero roundness baked the
    // exact same MAXIMUM radius regardless of the slider's actual value:
    // moving from 0% to 1% jumped straight from square to fully rounded
    // (isRounded flips true), then 1%-100% looked completely flat since
    // they all baked into differently-keyed sprites that happened to draw
    // an identical shape.
    const r = isRounded ? Math.min(8, wB * 0.45, hB * 0.35) * (roundPct / 100) : 0;
    const R = rgb[0]|0, G = rgb[1]|0, B = rgb[2]|0;

    // Glow Intensity aura underlay — a soft neon halo baked once behind the
    // body (never a per-frame cost: it's part of the cached sprite). The
    // aura traces the ACTUAL note silhouette (rounded rect included) so the
    // bleed extends uniformly on every edge — top, bottom, left, right, and
    // rounded corners all glow by the same ~pad px. The Gaussian blur that
    // shapes it is NOT run here: it lives in getHaloMask, baked once per
    // size bucket and tinted per colour with a cheap source-in fill — under
    // Gradient/Rainbow (many distinct colours live at once) re-blurring per
    // colour was the single most expensive part of every sprite bake.
    // `pad` is hard-capped by NOTE_GLOW_MAX_PAD above, which bounds how far
    // this can bleed on a mobile TBDR GPU as more notes stack up in a chord.
    if(pad > 0.75){
        // auraAlpha still climbs with the extended 0-200 range so users
        // dialing past 100% see a genuinely stronger aura, not just a
        // wider one.
        const auraAlpha = Math.min(0.85, 0.30 + (pad / NOTE_GLOW_MAX_PAD) * 0.32);
        const mask = getHaloMask(wB, hB, r, pad, dpr);
        // One flat aura colour (the pair's midpoint) under an accented note,
        // matching what getGradientSprite already does for the Default
        // material: the halo bleeds a few px past the silhouette, where a
        // directional shift would barely read.
        const hR = acc ? Math.round((acc.rgbA[0] + acc.rgbB[0]) / 2) : R;
        const hG = acc ? Math.round((acc.rgbA[1] + acc.rgbB[1]) / 2) : G;
        const hBl = acc ? Math.round((acc.rgbA[2] + acc.rgbB[2]) / 2) : B;
        stampHaloTint(sctx, sprite, mask, auraAlpha, `rgb(${hR},${hG},${hBl})`);
    }

    // Every reference below is to the closure's own R/G/B, never the outer
    // note colour -- that is what lets the same code bake either endpoint.
    const paintMaterial = (sctx, R, G, B) => {
    if(style === 'solid'){
        sctx.fillStyle = `rgb(${R},${G},${B})`;
        _spriteRoundPath(sctx, wB, hB, r);
        sctx.fill();
    } else {
        const lite = (m) => `rgb(${Math.round(R+(255-R)*m)},${Math.round(G+(255-G)*m)},${Math.round(B+(255-B)*m)})`;
        const dark = (m) => `rgb(${Math.round(R*m)},${Math.round(G*m)},${Math.round(B*m)})`;
        if(style === 'glass'){
            // Elegant cinematic glass: a fully see-through tinted body
            // (never above ~0.34 alpha so the backdrop keeps showing) lit
            // by ONE smooth diffuse highlight band plus soft edge glows —
            // no hard facets, no metal grain, no sharp corners anywhere, so
            // the whole silhouette reads mulus (smooth) at the outline and
            // at the rounded top/bottom caps. The top-to-bottom veil reads
            // like a single soft studio light from above, for a moodier,
            // more cinematic feel than a flat tint.
            const liteC = (m, a) => `rgba(${Math.round(R+(255-R)*m)},${Math.round(G+(255-G)*m)},${Math.round(B+(255-B)*m)},${a})`;
            sctx.save();
            _spriteRoundPath(sctx, wB, hB, r);
            sctx.clip();
            const veil = sctx.createLinearGradient(0, 0, 0, hB);
            veil.addColorStop(0,    `rgba(${R},${G},${B},0.30)`);
            veil.addColorStop(0.45, `rgba(${R},${G},${B},0.20)`);
            veil.addColorStop(1,    `rgba(${R},${G},${B},0.34)`);
            sctx.fillStyle = veil;
            sctx.fillRect(0, 0, wB, hB);
            const edgeW = Math.max(2, wB * 0.32);
            const leftGlow = sctx.createLinearGradient(0, 0, edgeW, 0);
            leftGlow.addColorStop(0, liteC(0.20, 0.80));
            leftGlow.addColorStop(1, `rgba(${R},${G},${B},0)`);
            sctx.fillStyle = leftGlow;
            sctx.fillRect(0, 0, edgeW, hB);
            const rightGlow = sctx.createLinearGradient(wB, 0, wB - edgeW, 0);
            rightGlow.addColorStop(0, liteC(0.20, 0.80));
            rightGlow.addColorStop(1, `rgba(${R},${G},${B},0)`);
            sctx.fillStyle = rightGlow;
            sctx.fillRect(wB - edgeW, 0, edgeW, hB);
            if(wB >= 9){
                const streakOffsets = [0.30, 0.42, 0.24, 0.36];
                const cx = wB * streakOffsets[vB];
                const sw = Math.max(1.6, wB * 0.16);
                sctx.save();
                sctx.beginPath();
                sctx.moveTo(cx - sw * 0.4, 0);
                sctx.lineTo(cx + sw * 0.6, 0);
                sctx.lineTo(cx + sw * 0.1, hB);
                sctx.lineTo(cx - sw * 0.9, hB);
                sctx.closePath();
                const streak = sctx.createLinearGradient(0, 0, 0, hB);
                streak.addColorStop(0,   'rgba(255,255,255,0.32)');
                streak.addColorStop(0.5, 'rgba(255,255,255,0.10)');
                streak.addColorStop(1,   'rgba(255,255,255,0.26)');
                sctx.fillStyle = streak;
                sctx.fill();
                sctx.restore();
            }
            sctx.restore();
            // Soft glow rim instead of a crisp hairline — approximated with
            // a wide faint stroke under a narrower brighter one rather than
            // a `filter: blur(0.6px)` pass: the visual difference at sub-px
            // blur radii is nil, but the filter forced a full rasterize-
            // filter-composite round trip on EVERY bake, and glass bakes
            // are frequent by design under Gradient/Rainbow's many-colour
            // working set.
            sctx.save();
            const rimW = Math.max(1.2, Math.min(2, wB * 0.07));
            sctx.translate(rimW * 0.5, rimW * 0.5);
            sctx.lineWidth = rimW + 1.2;
            sctx.strokeStyle = liteC(0.55, 0.26);
            _spriteRoundPath(sctx, Math.max(1, wB - rimW), Math.max(1, hB - rimW), Math.max(0, r - rimW * 0.5));
            sctx.stroke();
            sctx.lineWidth = rimW;
            sctx.strokeStyle = liteC(0.55, 0.5);
            sctx.stroke();
            sctx.restore();
        } else if(style === 'midnight'){
            // Deep, moody column: near-black base glowing up into the colour.
            const g = sctx.createLinearGradient(0, 0, 0, hB);
            g.addColorStop(0, lite(0.25));
            g.addColorStop(0.32, `rgb(${R},${G},${B})`);
            g.addColorStop(0.72, dark(0.42));
            g.addColorStop(1, dark(0.14));
            sctx.fillStyle = g; _spriteRoundPath(sctx, wB, hB, r); sctx.fill();
        } else if(style === 'neon' || style === 'glow'){
            // Deprecated styles — fall back to a clean gradient if ever requested.
            const g = sctx.createLinearGradient(0, 0, 0, hB);
            g.addColorStop(0, lite(0.55));
            g.addColorStop(0.5, `rgb(${R},${G},${B})`);
            g.addColorStop(1, dark(0.78));
            sctx.fillStyle = g; _spriteRoundPath(sctx, wB, hB, r); sctx.fill();
        } else {
            // unknown style -> solid fallback
            sctx.fillStyle = `rgb(${R},${G},${B})`;
            _spriteRoundPath(sctx, wB, hB, r); sctx.fill();
        }
    }
    };

    if(!acc){
        paintMaterial(sctx, R, G, B);
    } else {
        // Bake each endpoint into its own scratch under the sprite's exact
        // transform, mask it to its half of the cross-fade, then lay the two
        // down in order. The mask spans the BODY, not the padded canvas, so
        // it lines up with getGradientSprite's own 0->wB / 0->hB gradient.
        const x0 = pad * sxBake, x1 = (pad + wB) * sxBake;
        const y0 = pad * syBake, y1 = (pad + hB) * syBake;
        for(let pi = 0; pi < 2; pi++){
            const end = pi === 0 ? acc.rgbA : acc.rgbB;
            const c = _matScratch(pi, wPhys, hPhys);
            c.setTransform(1, 0, 0, 1, 0, 0);
            c.imageSmoothingEnabled = true;
            c.imageSmoothingQuality = 'high';
            if(sxBake !== 1 || syBake !== 1) c.scale(sxBake, syBake);
            if(pad) c.translate(pad, pad);
            paintMaterial(c, end[0]|0, end[1]|0, end[2]|0);
            c.setTransform(1, 0, 0, 1, 0, 0);
            c.globalCompositeOperation = 'destination-in';
            const m = acc.dir === 'h' ? c.createLinearGradient(x0, 0, x1, 0)
                                      : c.createLinearGradient(0, y0, 0, y1);
            m.addColorStop(0, pi === 0 ? 'rgba(0,0,0,1)' : 'rgba(0,0,0,0)');
            m.addColorStop(1, pi === 0 ? 'rgba(0,0,0,0)' : 'rgba(0,0,0,1)');
            c.fillStyle = m;
            c.fillRect(0, 0, wPhys, hPhys);
            c.globalCompositeOperation = 'source-over';
        }
        sctx.save();
        sctx.setTransform(1, 0, 0, 1, 0, 0);
        sctx.drawImage(_matScratchCv[0], 0, 0);
        sctx.drawImage(_matScratchCv[1], 0, 0);
        sctx.restore();
    }

    _spriteCacheSet(key, sprite);
    return sprite;
}

// Gradient's Default-material counterpart to getEffectSprite('solid', ...):
// bakes a 2-stop linear gradient into a cached sprite ONCE per (colour
// pair, size, rounding) instead of re-running createLinearGradient + fill()
// on the live canvas every frame for every note. Shares _spriteCache with
// getEffectSprite so the two pools don't fight over separate budgets.
// (Ported from the Visualizer.)
function getGradientSprite(rgbA, rgbB, dir, w, h, isRounded, roundnessPct){
    const wB = _qBucket(w, 2);
    const hB = _qBucket(h, 8);
    const cBA = (rgbA[0]|0) * 65536 + (rgbA[1]|0) * 256 + (rgbA[2]|0);
    const cBB = (rgbB[0]|0) * 65536 + (rgbB[1]|0) * 256 + (rgbB[2]|0);
    const roundPct = isRounded ? Math.max(0, Math.min(100, Math.round(Number(roundnessPct ?? 100)))) : 0;
    const sB = roundPct > 0 ? ('r' + roundPct) : 's';
    const rB = roundPct > 0 ? (Math.min(8, wB * 0.45, hB * 0.35) * (roundPct / 100)) | 0 : 0;
    const dpr = currentDPR || 1;
    const dprB = Math.round(dpr * 100) | 0;
    const glowB = noteGlowEnabled ? Math.round(Math.max(0, Math.min(200, noteGlowIntensity)) / 4) : 0;
    const key = `gsolid${dir}_${cBA}_${cBB}_${wB}_${hB}_${sB}_${rB}_${dprB}_${glowB}`;
    let sprite = _spriteCacheGet(key);
    if(sprite) return sprite;
    sprite = document.createElement('canvas');
    const pad = notePadFor('solid');
    const wLogical = wB + pad * 2, hLogical = hB + pad * 2;
    const wPhys = Math.max(1, Math.round(wLogical * dpr));
    const hPhys = Math.max(1, Math.round(hLogical * dpr));
    sprite.width = wPhys;
    sprite.height = hPhys;
    const sctx = sprite.getContext('2d', { alpha: true });
    sctx.imageSmoothingEnabled = true;
    sctx.imageSmoothingQuality = 'high';
    const sxBake = wPhys / wLogical;
    const syBake = hPhys / hLogical;
    if(sxBake !== 1 || syBake !== 1) sctx.scale(sxBake, syBake);
    if(pad) sctx.translate(pad, pad);
    // Mirrors rB's math above (used only for the cache key) -- without the
    // *(roundPct/100) factor here too, every non-zero roundness baked the
    // exact same MAXIMUM radius regardless of the slider's actual value:
    // moving from 0% to 1% jumped straight from square to fully rounded
    // (isRounded flips true), then 1%-100% looked completely flat since
    // they all baked into differently-keyed sprites that happened to draw
    // an identical shape.
    const r = isRounded ? Math.min(8, wB * 0.45, hB * 0.35) * (roundPct / 100) : 0;

    if(pad > 0.75){
        // One flat aura colour (the pair's midpoint) rather than its own
        // gradient — the halo bleeds a few px past the silhouette, where a
        // directional shift would barely read anyway. Blur comes pre-baked
        // from getHaloMask (once per size, not per colour) — see there.
        const R = Math.round((rgbA[0] + rgbB[0]) / 2), G = Math.round((rgbA[1] + rgbB[1]) / 2), B = Math.round((rgbA[2] + rgbB[2]) / 2);
        const auraAlpha = Math.min(0.85, 0.30 + (pad / NOTE_GLOW_MAX_PAD) * 0.32);
        const mask = getHaloMask(wB, hB, r, pad, dpr);
        stampHaloTint(sctx, sprite, mask, auraAlpha, `rgb(${R},${G},${B})`);
    }

    const g = dir === 'h' ? sctx.createLinearGradient(0, 0, wB, 0) : sctx.createLinearGradient(0, 0, 0, hB);
    g.addColorStop(0, `rgb(${rgbA[0]|0},${rgbA[1]|0},${rgbA[2]|0})`);
    g.addColorStop(1, `rgb(${rgbB[0]|0},${rgbB[1]|0},${rgbB[2]|0})`);
    sctx.fillStyle = g;
    _spriteRoundPath(sctx, wB, hB, r);
    sctx.fill();

    _spriteCacheSet(key, sprite);
    return sprite;
}

// Deterministic 0..1 hash — gives every bead slot a stable "personality"
// (height, vertical jitter, breathing rate) without storing any state.
function _auraHash(n){
    const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return s - Math.floor(s);
}

function clampPercentValue(value, fallback=0){
    const raw = Number(value);
    const safe = Number.isFinite(raw) ? raw : fallback;
    return Math.max(0, Math.min(100, Math.round(safe)));
}
function sliderRatio(value, fallback=0){
    return clampPercentValue(value, fallback) / 100;
}
function sliderCurve(value, power=1, fallback=0){
    // Linear mapping: a slider at X% applies exactly X% of the effect, so the
    // response feels accurate across the whole range (no front/back loading).
    return sliderRatio(value, fallback);
}
const _tunedRgbScratch = new Uint8Array(3);
let _tunedCacheR = -1, _tunedCacheG = -1, _tunedCacheB = -1;
let _tunedCacheSat = -1, _tunedCacheBright = -1;
let _tunedCacheOutR = 0, _tunedCacheOutG = 0, _tunedCacheOutB = 0;
function tuneRgbForFalling(rgb){
    const r0 = rgb[0]|0, g0 = rgb[1]|0, b0 = rgb[2]|0;
    const sat = 1.18, bright = 1.16;
    if(r0 === _tunedCacheR && g0 === _tunedCacheG && b0 === _tunedCacheB
       && sat === _tunedCacheSat && bright === _tunedCacheBright){
        _tunedRgbScratch[0] = _tunedCacheOutR;
        _tunedRgbScratch[1] = _tunedCacheOutG;
        _tunedRgbScratch[2] = _tunedCacheOutB;
        return _tunedRgbScratch;
    }
    const luma = r0 * 0.299 + g0 * 0.587 + b0 * 0.114;
    let or = (luma + (r0 - luma) * sat) * bright;
    let og = (luma + (g0 - luma) * sat) * bright;
    let ob = (luma + (b0 - luma) * sat) * bright;
    or = or < 0 ? 0 : or > 255 ? 255 : (or + 0.5) | 0;
    og = og < 0 ? 0 : og > 255 ? 255 : (og + 0.5) | 0;
    ob = ob < 0 ? 0 : ob > 255 ? 255 : (ob + 0.5) | 0;
    _tunedCacheR = r0; _tunedCacheG = g0; _tunedCacheB = b0;
    _tunedCacheSat = sat; _tunedCacheBright = bright;
    _tunedCacheOutR = or; _tunedCacheOutG = og; _tunedCacheOutB = ob;
    _tunedRgbScratch[0] = or;
    _tunedRgbScratch[1] = og;
    _tunedRgbScratch[2] = ob;
    return _tunedRgbScratch;
}
// Resolves ONE note's gradient-accent endpoint colours, for baking into a
// getGradientSprite (see there) instead of building/filling a live
// CanvasGradient every frame — this is what makes the accent read as a
// smooth blend rather than a strip of solid swatches, without paying a
// per-frame path-fill cost for it. Horizontal axis blends left→right,
// sampling the hue a half-semitone either side of this note's own key so it
// keys into its on-screen neighbours; Vertical blends top→bottom across
// the note's own height, matching the whole-stage sweep that axis drives.
// GRADIENT MODE ONLY: Rainbow is an explicit flat colour per key (see
// RAINBOW_NOTE_COLORS) and every other Colour Mode is flat by definition,
// so all of them return null and take the solid-sprite path.
function fallingNoteAccentColors(midi, y, h){
    if(animColorMode !== 'gradient') return null;
    let hexA, hexB, dir;
    if(gradientAxis === 'horizontal'){
        hexA = gradientColorForMidi(midi - 0.5, y + h * 0.5);
        hexB = gradientColorForMidi(midi + 0.5, y + h * 0.5);
        dir = 'h';
    } else {
        hexA = gradientColorForMidi(midi, y);
        hexB = gradientColorForMidi(midi, y + h);
        dir = 'v';
    }
    return { rgbA: safeHex(hexA, '#78dcff'), rgbB: safeHex(hexB, '#78dcff'), dir };
}
// Same colour resolution as the default Single style's flat fill below (see
// baseHex/_solidRgbCache further down in drawFallingNote), duplicated under
// its own name because that one lives behind a `let rgb` declared later in
// the same function -- referencing it from an earlier early-return branch
// hits the TDZ ("Cannot access 'rgb' before initialization").
function flatRgbForNote(f){
    const baseHex = f.base || cachedAnimColor || '#ffffff';
    let rgb = _solidRgbCache.get(baseHex);
    if(rgb === undefined){
        const rgb0 = safeHex(baseHex, '#78dcff');
        rgb = _isNearWhiteRgb(rgb0) ? [240,248,255] : tuneRgbForFalling(rgb0).slice();
        if(_solidRgbCache.size > 64) _solidRgbCache.clear();
        _solidRgbCache.set(baseHex, rgb);
    }
    return rgb;
}
function _sketchSeededRand(n){ const s = Math.sin(n)*43758.5453; return s - Math.floor(s); }
// A doubled, jittered stroke instead of a clean rect -- the same cheap
// "hand redrew this line twice" trick the Sketch theme's Theme Lab
// prototype uses for the piano keys. Filled first (Colour Mode's real
// colour, not a fixed hue) so the ink border reads on top of it.
function drawSketchFallingNote(c, x, y, w, h, seed, fillStyle){
    const t = performance.now() / 1000;
    // Where the "getar" actually comes from -- this took several wrong
    // turns to pin down, so it's worth stating plainly:
    //
    // `seed` is NOT a per-note constant. In the live path the caller
    // derives it from the note's CURRENT on-screen anchor
    // ((midi*97 + Math.round(onsetY)) % 100000), and a released note's
    // anchor moves by riseSpeed every single frame (see the falling[]
    // loop's `f.bottomY -= riseSpeed`). So every frame feeds a DIFFERENT
    // seed in, _sketchSeededRand re-rolls, and all four corners land on a
    // fresh +/-1.3px offset. That per-frame re-roll IS the shake. The
    // breathe term below is a slow ~380s, 0.28px drift -- about 0.01px
    // over a note's whole visible life, i.e. contributes nothing; it's
    // kept only because it's what the approved live look ships with.
    //
    // The corollary that makes this self-consistent: while a key is still
    // HELD, the same loop keeps f.bottomY pinned at the strike line and
    // only grows f.height, so the seed is constant and a held note is
    // deliberately STILL. Shake on release, still on hold. Any change
    // here that animates a held note is wrong by construction -- that was
    // the bug in the "circular tremor" attempt, which drove motion off
    // `t` alone and so shook every note in every state.
    //
    // So the ONLY thing a mirrored top-to-bottom renderer has to do is
    // feed the same position-derived seed from its own moving anchor.
    // Nothing in this function needs to know which direction it's going;
    // see drawVizFallRect, which passes its live bottom edge.
    const j = (n) => {
        const still = (_sketchSeededRand(seed + n) - 0.5) * Math.min(1.3, w*0.06);
        const breathe = Math.sin(seed*0.53 + n*0.9 + t*0.0165) * Math.min(0.28, w*0.014);
        return still + breathe;
    };
    c.lineWidth = Math.max(1.2, w*0.05);
    c.strokeStyle = '#2a2a28';
    c.fillStyle = fillStyle;
    // Corner-only jitter is capped on WIDTH (w*0.06), so on a note that is
    // hundreds of px tall a +/-1.3px corner offset is a sub-1% slope and
    // the long edges read as ruler-straight. Subdividing them keeps the
    // hand-drawn waviness proportional to edge length. vSegs===1 is the
    // original 4-point quad exactly, so short notes are unchanged.
    const vSegs = Math.max(1, Math.round(h / 42));
    for(let pass=0; pass<2; pass++){
        const o = pass === 0 ? 0.5 : -0.5;
        c.beginPath();
        c.moveTo(x + j(1+pass*10) + o, y + j(2+pass*10) + o);
        if(vSegs === 1){
            c.lineTo(x + w + j(3+pass*10) + o, y + j(4+pass*10) + o);
            c.lineTo(x + w + j(5+pass*10) + o, y + h + j(6+pass*10) + o);
            c.lineTo(x + j(7+pass*10) + o, y + h + j(8+pass*10) + o);
        } else {
            c.lineTo(x + w + j(3+pass*10) + o, y + j(4+pass*10) + o);
            for(let s=1; s<vSegs; s++){
                const fy = y + h * s / vSegs;
                c.lineTo(x + w + j(200+pass*50+s*3) + o, fy + j(201+pass*50+s*3) + o);
            }
            c.lineTo(x + w + j(5+pass*10) + o, y + h + j(6+pass*10) + o);
            c.lineTo(x + j(7+pass*10) + o, y + h + j(8+pass*10) + o);
            for(let s=vSegs-1; s>=1; s--){
                const fy = y + h * s / vSegs;
                c.lineTo(x + j(300+pass*50+s*3) + o, fy + j(301+pass*50+s*3) + o);
            }
        }
        c.closePath();
        if(pass === 0) c.fill();
        c.stroke();
    }
}
// Real pixel-sprite block, not a smooth-diagonal chamfer -- a 45° corner
// cut (the previous version) still reads as a rounded-rect with the corner
// sanded off, not an actual 8-bit sprite. Two changes make it read as
// pixel art: corners are cut in square STAIRSTEPS (what a NES/Game Boy
// sprite's corner actually looks like at low res, since there's no
// diagonal line a single pixel can draw), and the whole block snaps to a
// coarse pixel grid every frame instead of moving smoothly -- real 8-bit
// sprites don't have sub-pixel positions, so the chunky "jump" between
// grid steps as a note falls is itself part of the effect, not a bug.
function draw8bitFallingNote(c, x, y, w, h, fillStyle){
    const px = Math.max(1, Math.min(3, Math.round(Math.min(w, h) * 0.11)));
    const qx = Math.round(x / px) * px;
    const qy = Math.round(y / px) * px;
    const qw = Math.max(px * 6, Math.round(w / px) * px);
    const qh = Math.max(px * 6, Math.round(h / px) * px);

    const stairPath = (inset) => {
        const ix = qx + inset, iy = qy + inset, iw = qw - inset*2, ih = qh - inset*2;
        c.beginPath();
        c.moveTo(ix + px*2, iy);
        c.lineTo(ix + iw - px*2, iy);
        c.lineTo(ix + iw - px*2, iy + px);
        c.lineTo(ix + iw - px, iy + px);
        c.lineTo(ix + iw - px, iy + px*2);
        c.lineTo(ix + iw, iy + px*2);
        c.lineTo(ix + iw, iy + ih - px*2);
        c.lineTo(ix + iw - px, iy + ih - px*2);
        c.lineTo(ix + iw - px, iy + ih - px);
        c.lineTo(ix + iw - px*2, iy + ih - px);
        c.lineTo(ix + iw - px*2, iy + ih);
        c.lineTo(ix + px*2, iy + ih);
        c.lineTo(ix + px*2, iy + ih - px);
        c.lineTo(ix + px, iy + ih - px);
        c.lineTo(ix + px, iy + ih - px*2);
        c.lineTo(ix, iy + ih - px*2);
        c.lineTo(ix, iy + px*2);
        c.lineTo(ix + px, iy + px*2);
        c.lineTo(ix + px, iy + px);
        c.lineTo(ix + px*2, iy + px);
        c.closePath();
    };

    // Fill at FULL size, not inset -- the first version filled an inset
    // copy underneath a full-size dark shape (i.e. the outline was a whole
    // extra pixel-unit ring eating INTO the note), which on a small note
    // (a black-key note can be under 10px wide) left barely any of the
    // actual note colour visible at all: it read as "notes got small",
    // because most of the shape was now outline+bevel instead of fill.
    // Fill first, then stroke the SAME full-size path -- the outline is a
    // thin line on the note's own edge, not a shape it has to make room for.
    c.fillStyle = fillStyle;
    stairPath(0);
    c.fill();
    c.lineWidth = Math.max(1, px * 0.8);
    c.strokeStyle = '#160f2a';
    c.lineJoin = 'miter';
    stairPath(0);
    c.stroke();
    // Two-tone bevel (flat colour bands, no gradient) -- the classic
    // "raised pixel block" look shared by Mario/Tetris-style sprites.
    // Half a pixel unit wide, not a full one, for the same reason the fill
    // stopped being inset: a full-unit band was too big a bite out of a
    // small note.
    const bevel = Math.max(0.6, px * 0.5);
    c.save();
    stairPath(0);
    c.clip();
    c.fillStyle = 'rgba(255,255,255,0.32)';
    c.fillRect(qx, qy, qw, bevel);
    c.fillRect(qx, qy, bevel, qh);
    c.fillStyle = 'rgba(0,0,0,0.28)';
    c.fillRect(qx, qy + qh - bevel, qw, bevel);
    c.fillRect(qx + qw - bevel, qy, bevel, qh);
    c.restore();
}
// ── Chrome material ──────────────────────────────────────────────────────
// A liquid-metal sheen: domain-warped ridged value noise, the same pipeline
// the design lab used. The look comes from warping the noise field by its
// OWN output twice (round blobs become stretched, folded ribbons) and then
// taking the ridge (1 - |2v-1|) as the bright vein down each fold. A plain
// colour ramp without that ridge term stays matte no matter how many stops
// it gets -- the ridge is the whole difference between "gradient" and
// "chrome".
//
// PERFORMANCE -- this never bakes per note and never bakes per frame:
//   1. The noise field is evaluated ONCE for the whole app (two Float32Arrays
//      of rx/ridge), never again, however many colours or notes appear.
//   2. Colouring that field into a real sheet is a flat loop over those
//      arrays -- no noise math -- done once per COLOUR BUCKET (_colorBucket,
//      the same 12-bit bucket the sprite cache uses) and cached, capped at
//      CHROME_SHEET_BUDGET sheets.
//   3. The sheet is seamlessly tileable (every octave is evaluated with a
//      wrapped lattice period, and domain-warping periodic functions stays
//      periodic), so it becomes ONE CanvasPattern that animates purely by
//      moving the pattern matrix -- setTransform once per frame, shared by
//      every note on screen.
//   4. Per note, per frame, the entire cost is: one roundRect path + one
//      fill. That is the same cost class as Midnight's live gradient fill,
//      which this deliberately mirrors instead of going through
//      getEffectSprite -- a scrolling material can't be a static sprite, and
//      re-baking one per frame is exactly the bake treadmill Midnight's own
//      comment exists to avoid.
// Low-end devices never reach any of this: resolveAnimStyle() already
// collapses every heavy material to 'single' when the graphics profile says
// !heavyFx, so Chrome costs those devices nothing at all.
const CHROME_SHEET_PX = 256;
// Lattice periods spanned by the sheet. Low on purpose: the design lab's
// field spanned ~0.5 lattice units across its whole tile, which is what
// makes the folds big and soft rather than busy. Must stay an integer or
// the tile stops being seamless.
const CHROME_PERIOD = 2;
// Warp distance in LATTICE units, not a multiple of the period. Measuring it
// against the period instead was the first attempt and it came out as busy
// granite: at period 2 that put ~9.6 units of displacement into a field whose
// features are ~1 unit wide, so every fold was shredded. What the eye reads as
// "chrome" is a warp of roughly two feature-widths -- big lazy folds.
const CHROME_WARP = 2.3;
// The tile is magnified this much when it is painted. Integer lattice periods
// are forced on us by seamless tiling (a fractional period cannot wrap), which
// puts a floor on how coarse the baked field can be -- so the softness comes
// from magnifying a small tile instead, which is exactly what the design lab
// did by displaying a 96px sheet at ~500px.
const CHROME_TEX_SCALE = 3.2;
const CHROME_SHEEN = 0.62;
const CHROME_SHEET_BUDGET = 10;
// Pattern-space pixels per second, multiplied by CHROME_TEX_SCALE on screen.
// Deliberately very slow: the note is ALREADY travelling under the player's
// eye, so anything faster than a simmer reads as the material sliding
// against the note instead of living inside it. The first pass ran 7/11 and
// was reported as too fast for exactly that reason.
const CHROME_DRIFT_X = 2;
const CHROME_DRIFT_Y = 3;

// Fixed shuffle, NOT Math.random(): every engine and every reload has to bake
// the identical field, or Solo and Multiplayer would show different chrome
// for the same note.
const _CHROME_PERM = (() => {
    const p = new Uint8Array(512);
    const base = new Uint8Array(256);
    for(let i = 0; i < 256; i++) base[i] = i;
    let s = 1337 >>> 0;
    for(let i = 255; i > 0; i--){
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        const j = s % (i + 1);
        const t = base[i]; base[i] = base[j]; base[j] = t;
    }
    for(let i = 0; i < 512; i++) p[i] = base[i & 255];
    return p;
})();
function _chFade(t){ return t*t*t*(t*(t*6-15)+10); }
function _chLerp(a,b,t){ return a + t*(b-a); }
function _chGrad(h,x,y){
    const g = h & 7, u = g < 4 ? x : y, v = g < 4 ? y : x;
    return ((g&1) ? -u : u) + ((g&2) ? -2*v : 2*v);
}
// Periodic value noise: the lattice index wraps at `period`, which is what
// makes the finished sheet tile without a seam.
function _chNoise2(x, y, period){
    const P = period < 1 ? 1 : period;
    const fx = Math.floor(x), fy = Math.floor(y);
    const xf = x - fx, yf = y - fy;
    const X = ((fx % P) + P) % P, Y = ((fy % P) + P) % P;
    const X1 = (X + 1) % P, Y1 = (Y + 1) % P;
    const u = _chFade(xf), v = _chFade(yf);
    const aa = _CHROME_PERM[_CHROME_PERM[X] + Y], ab = _CHROME_PERM[_CHROME_PERM[X] + Y1];
    const ba = _CHROME_PERM[_CHROME_PERM[X1] + Y], bb = _CHROME_PERM[_CHROME_PERM[X1] + Y1];
    const x1 = _chLerp(_chGrad(aa, xf, yf), _chGrad(ba, xf-1, yf), u);
    const x2 = _chLerp(_chGrad(ab, xf, yf-1), _chGrad(bb, xf-1, yf-1), u);
    return (_chLerp(x1, x2, v) + 1) / 2;
}
function _chFbm(x, y, oct, period){
    let t = 0, a = 0.5, f = 1, m = 0;
    for(let i = 0; i < oct; i++){
        t += _chNoise2(x*f, y*f, period*f) * a;
        m += a; a *= 0.5; f *= 2;
    }
    return t / m;
}

let _chromeRx = null, _chromeRidge = null;
function _chromeBakeField(){
    if(_chromeRx) return;
    const N = CHROME_SHEET_PX, P = CHROME_PERIOD, w = CHROME_WARP;
    _chromeRx = new Float32Array(N * N);
    _chromeRidge = new Float32Array(N * N);
    for(let y = 0; y < N; y++){
        const ny = (y / N) * P;
        for(let x = 0; x < N; x++){
            const nx = (x / N) * P;
            const qx = _chFbm(nx, ny, 3, P);
            const qy = _chFbm(nx + 5.2, ny + 1.3, 3, P);
            const rx = _chFbm(nx + w*qx + 1.7, ny + w*qy + 9.2, 3, P);
            const ry = _chFbm(nx + w*qx + 8.3, ny + w*qy + 2.8, 3, P);
            const v  = _chFbm(nx + w*rx, ny + w*ry, 4, P);
            const i = y*N + x;
            _chromeRx[i] = rx;
            _chromeRidge[i] = Math.pow(1 - Math.abs(v*2 - 1), 1.7);
        }
    }
}

function _chromeHslToRgb(h, s, l){
    s /= 100; l /= 100;
    const k = n => (n + h/30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = n => l - a * Math.max(-1, Math.min(Math.min(k(n)-3, 9-k(n)), 1));
    return [f(0)*255, f(8)*255, f(4)*255];
}
function _chromeRgbToHsl(rgb){
    const r = rgb[0]/255, g = rgb[1]/255, b = rgb[2]/255;
    const mx = Math.max(r,g,b), mn = Math.min(r,g,b);
    let h = 0, s = 0; const l = (mx + mn) / 2;
    if(mx !== mn){
        const d = mx - mn;
        s = l > 0.5 ? d/(2 - mx - mn) : d/(mx + mn);
        if(mx === r) h = (g-b)/d + (g < b ? 6 : 0);
        else if(mx === g) h = (b-r)/d + 2;
        else h = (r-g)/d + 4;
        h *= 60;
    }
    return [h, s*100, l*100];
}

const _chromeSheets = new Map();
// The lab hard-coded the ramp's saturation because its palette was always
// saturated. A note here can be any colour including plain white, and forcing
// saturation onto that would have turned every white note red (hue 0). Taking
// the note's OWN saturation keeps a coloured note identical to the lab and
// lets a white/grey one come out as real polished steel instead.
function _chromeSheetFor(rgb){
    const key = _colorBucket(rgb);
    const hit = _chromeSheets.get(key);
    if(hit){
        _chromeSheets.delete(key);
        _chromeSheets.set(key, hit);
        return hit;
    }
    _chromeBakeField();
    const N = CHROME_SHEET_PX;
    const cv = document.createElement('canvas');
    cv.width = N; cv.height = N;
    const cctx = cv.getContext('2d', { alpha: false });
    const img = cctx.createImageData(N, N);
    const d = img.data;
    const hsl = _chromeRgbToHsl(rgb);
    const H = hsl[0], S = hsl[1];
    const ramp = [
        _chromeHslToRgb(H, S * 0.90, 16),
        _chromeHslToRgb(H, S, 34),
        _chromeHslToRgb(H, S * 0.85, 62),
        _chromeHslToRgb(H, S * 0.80, 12)
    ];
    for(let i = 0, n = N*N; i < n; i++){
        const t = _chromeRx[i], ridge = _chromeRidge[i];
        const xr = t * 3;
        const si = xr < 2 ? (xr | 0) : 2;
        const fr = xr - si;
        const a = ramp[si], b = ramp[si+1];
        const k = 0.42 + ridge * 0.85;
        const spec = ridge * ridge * ridge * CHROME_SHEEN * 165;
        const o = i * 4;
        const r0 = (a[0] + (b[0]-a[0])*fr) * k + spec;
        const g0 = (a[1] + (b[1]-a[1])*fr) * k + spec;
        const b0 = (a[2] + (b[2]-a[2])*fr) * k + spec;
        d[o]   = r0 > 255 ? 255 : r0;
        d[o+1] = g0 > 255 ? 255 : g0;
        d[o+2] = b0 > 255 ? 255 : b0;
        d[o+3] = 255;
    }
    cctx.putImageData(img, 0, 0);
    let pattern = null;
    try { pattern = cctx.createPattern(cv, 'repeat'); } catch(e){ pattern = null; }
    const entry = { canvas: cv, pattern, phased: -1 };
    _chromeSheets.set(key, entry);
    while(_chromeSheets.size > CHROME_SHEET_BUDGET){
        const oldest = _chromeSheets.keys().next().value;
        _chromeSheets.delete(oldest);
    }
    return entry;
}
function clearChromeSheets(){ _chromeSheets.clear(); }

// One matrix per frame, shared by every note. Rebuilt only when the frame
// clock moves, so a 40-note chord costs one setTransform, not forty.
const _chromeReduceMotion = (typeof matchMedia === 'function')
    ? matchMedia('(prefers-reduced-motion: reduce)') : null;
let _chromeMatrix = null, _chromeMatrixTs = -1;
function _chromePatternFor(rgb, rawTs){
    // renderNow is only set once anim() has run a frame; a note drawn before
    // that (or any non-finite clock) must not reach DOMMatrix as NaN.
    const ts = (typeof rawTs === 'number' && isFinite(rawTs)) ? rawTs : 0;
    const sheet = _chromeSheetFor(rgb);
    const pat = sheet.pattern;
    if(!pat || !pat.setTransform || typeof DOMMatrix !== 'function') return null;
    if(_chromeMatrixTs !== ts){
        _chromeMatrixTs = ts;
        const sec = (_chromeReduceMotion && _chromeReduceMotion.matches) ? 0 : ts / 1000;
        // One tile covers this many user-space px once magnified; the offsets
        // wrap on it so they stay small forever. The tile is seamless, so the
        // wrap is invisible and float precision never drifts.
        const span = CHROME_SHEET_PX * CHROME_TEX_SCALE;
        const ox = (sec * CHROME_DRIFT_X) % span;
        const oy = (sec * CHROME_DRIFT_Y) % span;
        _chromeMatrix = new DOMMatrix().translateSelf(ox, oy).scaleSelf(CHROME_TEX_SCALE);
        // Force every cached sheet to re-apply on its next use this frame.
        _chromeSheets.forEach(s => { s.phased = -1; });
    }
    if(sheet.phased !== ts){
        sheet.phased = ts;
        try { pat.setTransform(_chromeMatrix); } catch(e){ return null; }
    }
    return pat;
}

// ── Glow for Chrome ──────────────────────────────────────────────────────
// Every other glow-taking style carries its aura BAKED INTO its cached body
// sprite. Chrome cannot: its material scrolls, so the body has to be painted
// live and there is no sprite to bake an aura into. It needs an aura drawn as
// its own layer, and that layer is what decides whether the style holds 60fps.
//
// Measured on the real animation loop, not in a micro-benchmark: ~180 falling
// notes at a realistic height mix (median 52px, max ~125px), 900x480 at 2x
// DPR, median frame time over 90 rAF samples, Glow at full intensity (which
// puts the pad at 28px -- a 50px note's aura box is more than twice the note).
// Micro-benchmarks of drawFallingNote in a tight loop disagreed with every
// pacing run and with each other, so only these numbers are trusted:
//
//   no glow at all ................................ 16.7 ms   (the ceiling)
//   ctx.shadowColor / ctx.shadowBlur ............ 1442.6 ms
//   mask squashed per note (drawGlowHaloSquashed) .. 77.8 ms
//   14 concentric translucent rounded rects ....... 35.9 ms
//   cached halo sprite (this file, below) .......... see getChromeHaloSprite
//
// ctx.shadow* re-blurs the whole padded box on every fill, so it scales with
// note AREA times note count and collapses to under 1 fps. Drawing the aura
// live per note is not much better: whatever the shape, it is a fresh
// composite of a (w+2*pad) x (h+2*pad) region for every note on screen, and
// the scratch canvas is reallocated whenever consecutive notes differ in size.
// The only approach that survives is the one every other style already uses --
// bake the aura once per (colour bucket, size bucket) and blit it -- which is
// why Glass with glow paces at 23.3 ms while all of the live paths above do
// not. Chrome gets its own halo-only sprite so the cached body it cannot have
// is not needed.
const _chromeHaloCache = new Map();
const _CHROME_HALO_MAX = 64;
// Baking the aura below the display's own DPR and letting the blit stretch it
// back was tried -- the aura is pure Gaussian falloff, so it loses nothing
// visually -- and it paced WORSE (70.3 ms vs 52.2 at half DPR): the magnified
// blit costs more than the texels it saves. Bake at the real DPR.
function getChromeHaloSprite(rgb, w, h, isRounded, roundPct, pad, auraAlpha){
    const dpr = currentDPR || 1;
    const wB = _qBucket(w, 2);
    const hB = _qBucket(h, 8);
    const rB = (isRounded && roundPct > 0)
        ? (Math.min(8, wB * 0.45, hB * 0.35) * (roundPct / 100)) | 0 : 0;
    const key = `${_colorBucket(rgb)}_${wB}_${hB}_${rB}_${Math.round(dpr * 100)}_${Math.round(pad * 4)}`;
    let cv = _chromeHaloCache.get(key);
    if(cv){
        // Touch: keep the LRU ordered by use, not by insertion.
        _chromeHaloCache.delete(key);
        _chromeHaloCache.set(key, cv);
        return cv;
    }
    if(_chromeHaloCache.size >= _CHROME_HALO_MAX){
        _chromeHaloCache.delete(_chromeHaloCache.keys().next().value);
    }
    // getHaloMask holds the expensive part -- the Gaussian -- and is keyed by
    // GEOMETRY ONLY, so it is already shared with every other style's bake at
    // the same size. All this adds is one source-in tint.
    const mask = getHaloMask(wB, hB, rB, pad, dpr);
    cv = document.createElement('canvas');
    cv.width = mask.width;
    cv.height = mask.height;
    const sctx = cv.getContext('2d', { alpha: true });
    stampHaloTint(sctx, cv, mask, auraAlpha, `rgb(${rgb[0] | 0},${rgb[1] | 0},${rgb[2] | 0})`);
    _chromeHaloCache.set(key, cv);
    return cv;
}
function clearChromeHaloCache(){ _chromeHaloCache.clear(); }
function _chromeDrawGlow(ctx, x, y, w, h, isRounded, roundPct, rgb, growing){
    const pad = notePadFor('chrome');
    if(!(pad > 0.5)) return;
    const auraAlpha = Math.min(0.85, 0.30 + (pad / NOTE_GLOW_MAX_PAD) * 0.32);
    // A GROWING note is the one case the sprite cache cannot serve: its key
    // buckets height in 8px steps, so a held note mints a fresh bake every few
    // pixels of growth and reuses none of them -- the same treadmill the
    // non-Glow styles were fixed for (see drawFallingNote). drawGlowHaloLive
    // rebuilds the aura from a mask keyed on width/roundness only, so height
    // costs nothing; it bails on notes too short to split, which are exactly
    // the notes that have not yet walked through many buckets.
    if(growing){
        const wB = _qBucket(w, 2);
        const rMax = isRounded ? Math.min(8, wB * 0.45) * (roundPct / 100) : 0;
        if(drawGlowHaloLive(ctx, x, y, w, h, wB, rMax, pad, currentDPR || 1, auraAlpha, rgb)) return;
    }
    const halo = getChromeHaloSprite(rgb, w, h, isRounded, roundPct, pad, auraAlpha);
    ctx.drawImage(halo, x - pad, y - pad, w + pad * 2, h + pad * 2);
}


function drawFallingNote(f){
    const fastX = noteXFast[f.midi];
    const cachedX = Number.isFinite(fastX) ? fastX : noteXCache.get(f.midi);
    if(cachedX===undefined || !Number.isFinite(cachedX)) return;
    const x = cachedX - currentPianoTransformPx;

    // Note Size is a PERCENTAGE of the current white-key width (0-100%), not
    // a fixed px value — that's what makes it auto-scale correctly whether
    // the piano is showing 88 keys or 33: a fixed px cap used to look tiny
    // once fewer keys made each key wider, and (at the other end) did
    // nothing for most of the slider's range whenever the cap already sat
    // below the current key width. Percentage-of-key-width has neither
    // failure mode.
    const _kw = whiteKeyWidth > 0 ? whiteKeyWidth : 20;
    const _effSize = Math.max(4, _kw * (Math.max(0, Math.min(100, Number(animSize) || 0)) / 100));
    const baseW = isBlack(f.midi) ? _effSize * 0.7 : _effSize;
    const shape = f.shape || 'rounded';
    const roundPct = Math.max(0, Math.min(100, Number(f.roundness ?? animRoundness ?? 100)));
    const noteAlpha = Math.max(0.1, Math.min(1, Number(f.opacity ?? noteOpacity ?? 100) / 100));
    const w = baseW;
    // The bar is anchored at its ONSET (bottomY) and extends upward. Drawing
    // from f.y with an inflated height instead let MIN_NOTE_HEIGHT push the
    // bottom edge BELOW the onset, straight into the note struck after it —
    // measured as a 10 px overlap on fast repeats.
    const onsetY = (f.bottomY !== undefined) ? f.bottomY : (f.y + f.height);
    let h = Math.max(MIN_NOTE_HEIGHT, f.height);
    const prev = f.prevInColumn;
    if(prev && !prev.dead){
        // Space this note is entitled to: the real distance between its onset
        // and the previous onset in this column, less the seam. That distance
        // is speed x period, so the seam below stays the same size in pixels
        // whatever the tempo or the speed setting.
        const prevOnsetY = (prev.bottomY !== undefined) ? prev.bottomY : (prev.y + prev.height);
        const room = onsetY - prevOnsetY - NOTE_SEAM_PX;
        if(room < h) h = Math.max(NOTE_MIN_VISIBLE_PX, room);
    }
    const x0 = x - w*0.5;
    const y = onsetY - h;
    if(y > canvasCssH || y + h < 0) return;
    if(x0 > canvasCssW || x0 + w < 0) return;
    // Record what this frame touches so the NEXT frame can clear just this much
    // instead of the whole viewport.
    //
    // The padding has to be the glow's REAL bleed, not NOTE_GLOW_MAX_PAD. The
    // Glow Intensity slider runs 0..200 and noteGlowPadPx() scales that against
    // NOTE_GLOW_MAX_PAD, so at 200% the halo reaches 28 px while that constant
    // is 14 — anything past 14 px was then never cleared and smeared into a
    // vertical streak down the column. +2 is a small safety margin on top of
    // that real bleed.
    const _bleed = noteGlowPadPx() + 2;
    _fxMarkDirty(x0 - _bleed, y - _bleed, x0 + w + _bleed, y + h + _bleed);

    // Horizontal axis' colour never changes after note-creation (pure
    // function of pitch), so it stays on the cheap cached f.base path below.
    // Vertical depends on the note's live y — it recolours only when the
    // note actually crosses into a new band (byte-identical result
    // otherwise), and only Gradient participates in Axis at all.
    if(!f.remote && !f.colorOverride && gradientAxis !== 'horizontal'
        && animColorMode === 'gradient'){
        const recolorKey = gradientTForY(y) * 4096 + gradientTForY(y + h);
        if(f._recolorKey !== recolorKey){
            f._recolorKey = recolorKey;
            f.base = getAnimBaseColorForMidi(f.midi, y);
            f.accent = fallingNoteAccentColors(f.midi, y, h);
        }
    }

    // ── Sketch theme: hand-wobbled double-stroke outline, bold flat fill in
    // the note's own colour (pitch still reads through colour same as every
    // other theme -- Sketch is an ink treatment on top, not a fixed hue).
    // Seeded per-note (midi + onset Y) so notes don't all wobble identically;
    // animated via a slow, separately-timed sine breathe. Deliberately NOT
    // hashed through the seed function itself -- the Theme Lab prototype hit
    // exactly that bug: feeding a time term into a hash gets scaled by the
    // hash's own internal constant too, turning "slow" into "shaking". ──
    if(pianoTheme === 'sketch'){
        ctx2d.globalAlpha = noteAlpha;
        let fillStyle;
        if(f.accent){
            const { rgbA, rgbB, dir } = f.accent;
            const g = dir === 'h' ? ctx2d.createLinearGradient(x0, 0, x0 + w, 0) : ctx2d.createLinearGradient(0, y, 0, y + h);
            g.addColorStop(0, `rgb(${rgbA[0]|0},${rgbA[1]|0},${rgbA[2]|0})`);
            g.addColorStop(1, `rgb(${rgbB[0]|0},${rgbB[1]|0},${rgbB[2]|0})`);
            fillStyle = g;
        } else {
            fillStyle = `rgb(${flatRgbForNote(f).join(',')})`;
        }
        const seed = (f.midi * 97 + Math.round(onsetY)) % 100000;
        drawSketchFallingNote(ctx2d, x0, y, w, h, seed, fillStyle);
        ctx2d.globalAlpha = 1;
        return;
    }

    // ── 8-bit theme: a chamfered-corner flat block -- the pixel-art
    // rounded-rect trick (cut the 4 corners instead of curving them), same
    // idea as Theme Lab. Runs directly on this live canvas at native
    // resolution rather than a separate low-res buffer (that trick re-skins
    // a WHOLE scene at once; one note doesn't need its own offscreen
    // buffer), so corners are crisp but not hard-pixel-snapped like Theme
    // Lab's -- an accepted trade-off for staying inside the existing
    // live-draw path instead of a bigger renderer rewrite. ──
    if(pianoTheme === '8bit'){
        ctx2d.globalAlpha = noteAlpha;
        let fillStyle;
        if(f.accent){
            const { rgbA, rgbB, dir } = f.accent;
            const g = dir === 'h' ? ctx2d.createLinearGradient(x0, 0, x0 + w, 0) : ctx2d.createLinearGradient(0, y, 0, y + h);
            g.addColorStop(0, `rgb(${rgbA[0]|0},${rgbA[1]|0},${rgbA[2]|0})`);
            g.addColorStop(1, `rgb(${rgbB[0]|0},${rgbB[1]|0},${rgbB[2]|0})`);
            fillStyle = g;
        } else {
            fillStyle = `rgb(${flatRgbForNote(f).join(',')})`;
        }
        draw8bitFallingNote(ctx2d, x0, y, w, h, fillStyle);
        ctx2d.globalAlpha = 1;
        return;
    }

    const isRounded = shape === 'rounded' && roundPct > 0;
    const rv = isRounded ? Math.min(8, w*0.45, h*0.35) * (roundPct / 100) : 0;
    const drawStyleRaw = f.styleResolved || f.style;
    // Legacy alias only — these two never shipped a real style, they always
    // meant "flat colour" (the old rainbow-per-key hue is now Colour Mode's
    // job, not a Style's).
    const drawStyle = (drawStyleRaw === 'rainbowV2' || drawStyleRaw === 'crystal3d' || drawStyleRaw === 'rainbow') ? 'single' : drawStyleRaw;

    ctx2d.globalAlpha = noteAlpha;
    ctx2d.globalCompositeOperation = 'source-over';

    const baseHex = f.base || cachedAnimColor || '#ffffff';
    let rgb = _solidRgbCache.get(baseHex);
    if(rgb === undefined){
        const rgb0 = safeHex(baseHex, '#78dcff');
        rgb = _isNearWhiteRgb(rgb0) ? [240,248,255] : tuneRgbForFalling(rgb0).slice();
        if(_solidRgbCache.size > 64) _solidRgbCache.clear();
        _solidRgbCache.set(baseHex, rgb);
    }
    if(drawStyle === 'outline'){
        // Transparent center, coloured rounded border. Gradient mode gets a
        // real 2-stop stroke gradient (same accent pair 'solid' bakes via
        // getGradientSprite) instead of a flat colour -- this branch draws
        // live on ctx2d every frame already (no sprite cache involved), so
        // there's no caching cost to threading the gradient through here.
        // The 1.5 floor was absolute, so on a packed 88-key portrait board
        // (keys ~7px) it beat the proportional term and the stroke ate ~21% of
        // the note's width from each side -- the "outline ketebalan di
        // portrait" report. The floor exists to stop the stroke vanishing, and
        // that only needs a couple of DEVICE pixels, so express it that way:
        // unchanged at DPR 1, thinner exactly where the pixels are smaller.
        const lwFloor = Math.min(1.5, 2 / (currentDPR || 1));
        const lw = Math.max(lwFloor, Math.min(w * 0.16, 4));
        ctx2d.lineWidth = lw;
        const outlineAccent = f.accent;
        if(outlineAccent){
            const { rgbA, rgbB, dir } = outlineAccent;
            const og = dir === 'h' ? ctx2d.createLinearGradient(x0, 0, x0 + w, 0) : ctx2d.createLinearGradient(0, y, 0, y + h);
            og.addColorStop(0, `rgb(${rgbA[0]|0},${rgbA[1]|0},${rgbA[2]|0})`);
            og.addColorStop(1, `rgb(${rgbB[0]|0},${rgbB[1]|0},${rgbB[2]|0})`);
            ctx2d.strokeStyle = og;
        } else {
            ctx2d.strokeStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
        }
        const ix = x0 + lw / 2, iy = y + lw / 2, iw = Math.max(1, w - lw), ih = Math.max(1, h - lw);
        ctx2d.beginPath();
        if(isRounded && rv > 0 && ctx2d.roundRect) ctx2d.roundRect(ix, iy, iw, ih, Math.max(0, rv - lw / 2));
        else ctx2d.rect(ix, iy, iw, ih);
        ctx2d.stroke();
    } else if(drawStyle === 'solid' || drawStyle === 'single'){
        // Gradient mode gets a baked 2-stop gradient sprite (see
        // getGradientSprite) instead of the flat 'solid' one — same
        // drawImage-from-cache cost as every other Style, no per-frame
        // gradient/path fill on the live canvas.
        const accent = f.accent;
        const pad = notePadFor('solid');
        // Growing + Glow on is the one combination the branches below cannot
        // pay for: both getEffectSprite and getGradientSprite bucket their
        // cache key on the note's HEIGHT, and Glow's own aura bake (getHaloMask)
        // is the single most expensive part of a miss. A held note growing to
        // 720px measured 87 sprite bakes and 87 halo misses in 5s with Glow
        // on — the exact treadmill already fixed below for the no-Glow case,
        // just never extended to cover this one (that fix only fires when
        // pad<=0.5). drawGlowHaloLive reconstructs the halo from a mask baked
        // ONCE per width/roundness/glow-intensity (never per height) via a
        // 9-slice composite, then the body is filled live same as the
        // no-Glow growing branch already does.
        let liveGlowDrawn = false;
        if(pad > 0.5 && f.growing && ctx2d.roundRect){
            const wB = _qBucket(w, 2);
            const rMax = isRounded ? Math.min(8, wB * 0.45) * (roundPct / 100) : 0;
            const auraRgb = accent
                ? [Math.round((accent.rgbA[0] + accent.rgbB[0]) / 2), Math.round((accent.rgbA[1] + accent.rgbB[1]) / 2), Math.round((accent.rgbA[2] + accent.rgbB[2]) / 2)]
                : rgb;
            const auraAlpha = Math.min(0.85, 0.30 + (pad / NOTE_GLOW_MAX_PAD) * 0.32);
            liveGlowDrawn = drawGlowHaloLive(ctx2d, x0, y, w, h, wB, rMax, pad, currentDPR || 1, auraAlpha, auraRgb);
            if(liveGlowDrawn){
                if(accent){
                    const { rgbA, rgbB, dir } = accent;
                    const grad = dir === 'h'
                        ? ctx2d.createLinearGradient(x0, 0, x0 + w, 0)
                        : ctx2d.createLinearGradient(0, y, 0, y + h);
                    grad.addColorStop(0, `rgb(${rgbA[0] | 0},${rgbA[1] | 0},${rgbA[2] | 0})`);
                    grad.addColorStop(1, `rgb(${rgbB[0] | 0},${rgbB[1] | 0},${rgbB[2] | 0})`);
                    ctx2d.fillStyle = grad;
                } else {
                    ctx2d.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
                }
                ctx2d.beginPath();
                if(isRounded && rv > 0) ctx2d.roundRect(x0, y, w, h, rv);
                else ctx2d.rect(x0, y, w, h);
                ctx2d.fill();
            }
        }
        if(liveGlowDrawn){
            // handled above
        } else if(accent && pad > 0.5){
            // Glow's halo has to be pre-baked (see getGradientSprite) — keep
            // the cached-sprite path only for this case.
            const sprite = getGradientSprite(accent.rgbA, accent.rgbB, accent.dir, w, h, isRounded, roundPct);
            ctx2d.drawImage(sprite, x0 - pad, y - pad, w + pad * 2, h + pad * 2);
        } else if(accent){
            // No Glow halo to bake, so there's nothing a cached sprite buys
            // here — under Vertical axis, accent's two endpoint colours
            // change every frame as the note falls, so the (colour x colour
            // x size) sprite-cache key barely ever repeats and every miss
            // pays the full off-screen-canvas + gradient-fill bake cost
            // (the actual source of Vertical's reported lag). Painting the
            // exact same 2-stop gradient straight onto the live canvas is
            // pixel-identical and skips that cache entirely.
            const { rgbA, rgbB, dir } = accent;
            const grad = dir === 'h'
                ? ctx2d.createLinearGradient(x0, 0, x0 + w, 0)
                : ctx2d.createLinearGradient(0, y, 0, y + h);
            grad.addColorStop(0, `rgb(${rgbA[0]|0},${rgbA[1]|0},${rgbA[2]|0})`);
            grad.addColorStop(1, `rgb(${rgbB[0]|0},${rgbB[1]|0},${rgbB[2]|0})`);
            ctx2d.fillStyle = grad;
            if(isRounded && rv > 0 && ctx2d.roundRect){
                ctx2d.beginPath();
                ctx2d.roundRect(x0, y, w, h, rv);
                ctx2d.fill();
            } else {
                ctx2d.fillRect(x0, y, w, h);
            }
        } else if(pad > 0.5){
            // 'single' (Default style / Split Color / remote) renders as a
            // plain solid fill. Route it through the exact-colour 'solid'
            // sprite key — NOT the generic branch, whose coarse 4-bit colour
            // bucket would collide two nearby seat/custom colours onto one
            // cached sprite.
            const sprite = getEffectSprite('solid', rgb, w, h, isRounded, roundPct);
            ctx2d.drawImage(sprite, x0 - pad, y - pad, w + pad * 2, h + pad * 2);
        } else if(isRounded && rv > 0 && f.growing && ctx2d.roundRect){
            // A GROWING note is the one case where this sprite cannot pay for
            // itself. The cache key buckets height in 8px steps, so while a key
            // is held the note mints a fresh key every few pixels of growth and
            // bakes a new off-screen canvas each time — measured at 84 bakes in
            // 5 s for a single held note, ~0.43 ms each, none of them reused.
            // That is the lag felt while a note is sounding, and why releasing
            // the key makes it go away: a released note's height stops changing,
            // so it becomes a stable cache hit.
            //
            // For this style the sprite is only a rounded rect filled with one
            // flat colour, which a live path fill reproduces exactly — and more
            // faithfully, since it skips the bake-at-bucketed-height-then-
            // stretch step. Released notes keep the cached path, where the
            // sprite is reused across frames and does pay for itself.
            ctx2d.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
            ctx2d.beginPath();
            ctx2d.roundRect(x0, y, w, h, rv);
            ctx2d.fill();
        } else if(isRounded && rv > 0){
            const sprite = getEffectSprite('solid', rgb, w, h, isRounded, roundPct);
            ctx2d.drawImage(sprite, x0, y, w, h);
        } else {
            ctx2d.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
            ctx2d.fillRect(x0, y, w, h);
        }
    } else {
        // midnight / glass — baked, cached sprites, fully static (no
        // per-frame overlay). Glass gets a small pool of baked variants
        // (see MATERIAL_VARIANT_STYLES in getEffectSprite) picked by the
        // note's own seed, so a chord of the same Style/colour doesn't read
        // as stamped copies of one sprite.
        const variant = Math.floor((f.auraSeed || 0) * 4);
        const pad = notePadFor(drawStyle);
        // Midnight's sprite is nothing but a 4-stop vertical gradient on the
        // note's own rounded rect, and its stops are fractions of the note's
        // height — so painting it live on the real height is not an
        // approximation of the sprite, it is what the sprite was approximating
        // (the sprite bakes at a bucketed height and then stretches). Doing it
        // live costs one gradient fill and removes the height-bucket bake
        // treadmill: a held note was minting ~86 sprite keys as it grew, at
        // ~0.34 ms a bake, none of them ever reused. Kept on the live path for
        // released notes too, so there is no visible step at the moment a key
        // is let go.
        // Chrome -- live pattern fill, deliberately NOT a cached sprite: the
        // material scrolls, and a scrolling material cannot be baked once and
        // stretched forever. Re-baking one per frame is exactly the bake
        // treadmill Midnight's comment below exists to avoid, so Chrome takes
        // the same live path: one roundRect + one fill per note, with the
        // scroll living entirely in the shared pattern matrix.
        if(drawStyle === 'chrome'){
            const chromePat = _chromePatternFor(rgb, renderNow);
            ctx2d.save();
            _chromeDrawGlow(ctx2d, x0, y, w, h, isRounded, roundPct, rgb, f.growing);
            ctx2d.beginPath();
            if(isRounded && rv > 0 && ctx2d.roundRect) ctx2d.roundRect(x0, y, w, h, rv);
            else ctx2d.rect(x0, y, w, h);
            // No CanvasPattern.setTransform (Safari before 14) means no
            // scroll; fall back to the flat colour rather than to a sprite
            // path that has no Chrome branch and would render nothing.
            ctx2d.fillStyle = chromePat || `rgb(${rgb[0]|0},${rgb[1]|0},${rgb[2]|0})`;
            ctx2d.fill();
            ctx2d.restore();
            ctx2d.globalAlpha = 1;
            return;
        }
        // A Horizontal accent cannot fold into one vertical gradient, so it
        // drops through to the cross-faded sprite below. A Vertical one can:
        // Midnight IS a vertical ramp, so each of its four stops just takes
        // its colour from wherever the accent pair has got to at that stop's
        // own height. Exact, and it keeps Midnight off the sprite baker's
        // height-bucket treadmill the moment Gradient mode is switched on.
        if(drawStyle === 'midnight' && !(pad > 0.5) && ctx2d.roundRect && !(f.accent && f.accent.dir === 'h')){
            const mAcc = f.accent;
            const chan = (i, t) => mAcc ? mAcc.rgbA[i] + (mAcc.rgbB[i] - mAcc.rgbA[i]) * t : rgb[i];
            // m >= 0 lightens toward white, m < 0 darkens by |m| — the same
            // two ramps the flat path spelled out as lite()/dark().
            const tone = (t, m) => {
                const R = chan(0, t)|0, G = chan(1, t)|0, B = chan(2, t)|0;
                return m >= 0
                    ? `rgb(${Math.round(R+(255-R)*m)},${Math.round(G+(255-G)*m)},${Math.round(B+(255-B)*m)})`
                    : `rgb(${Math.round(R*-m)},${Math.round(G*-m)},${Math.round(B*-m)})`;
            };
            const g = ctx2d.createLinearGradient(0, y, 0, y + h);
            g.addColorStop(0,    tone(0,    0.25));
            g.addColorStop(0.32, tone(0.32, 0));
            g.addColorStop(0.72, tone(0.72, -0.42));
            g.addColorStop(1,    tone(1,    -0.14));
            ctx2d.fillStyle = g;
            ctx2d.beginPath();
            if(isRounded && rv > 0) ctx2d.roundRect(x0, y, w, h, rv);
            else ctx2d.rect(x0, y, w, h);
            ctx2d.fill();
            ctx2d.globalAlpha = 1;
            return;
        }
        const sprite = getEffectSprite(drawStyle, rgb, w, h, isRounded, roundPct, variant, f.accent);
        if(pad > 0.5) ctx2d.drawImage(sprite, x0 - pad, y - pad, w + pad * 2, h + pad * 2);
        else ctx2d.drawImage(sprite, x0, y, w, h);
    }

    ctx2d.globalAlpha = 1;
}

function safeHex(hex, fallback){
    try { return hexToRgb(hex || fallback); }
    catch(e){ return hexToRgb(fallback); }
}
function anim(now){

    if(_lastAnimTs >= 0 && (now - _lastAnimTs) >= 0 && (now - _lastAnimTs) < 6 && animFrameId){
        animFrameId = requestAnimationFrame(anim);
        return;
    }
    _lastAnimTs = now;
    renderNow = now;
    if(!lastFrameTime) lastFrameTime=now;
    const rawDt = (now - lastFrameTime) / 1000;
    lastFrameTime = now;

    let dt = rawDt;
    if(!(dt > 0)) dt = 1 / 60;
    else if(dt > DT_MAX) dt = DT_MAX;
    perfGovernorTick(rawDt * 1000, now);

    ctx2d.setTransform(1,0,0,1,0,0);
    ctx2d.globalAlpha = 1;
    ctx2d.globalCompositeOperation = 'source-over';
    if(_fxFullClear){
        ctx2d.clearRect(0, 0, canvas.width, canvas.height);
        _fxFullClear = false;
    } else if(_fxD1x > _fxD0x && _fxD1y > _fxD0y){
        // Union of what the PREVIOUS frame drew, in device pixels, padded by a
        // couple of pixels so an antialiased edge cannot leave a seam behind.
        const d = currentDPR || 1;
        const cx = Math.max(0, Math.floor(_fxD0x * d) - 2);
        const cy = Math.max(0, Math.floor(_fxD0y * d) - 2);
        const cw = Math.min(canvas.width - cx, Math.ceil((_fxD1x - _fxD0x) * d) + 6);
        const ch = Math.min(canvas.height - cy, Math.ceil((_fxD1y - _fxD0y) * d) + 6);
        if(cw > 0 && ch > 0) ctx2d.clearRect(cx, cy, cw, ch);
    }
    _fxD0x = Infinity; _fxD0y = Infinity; _fxD1x = -Infinity; _fxD1y = -Infinity;
    if(currentDPR !== 1) ctx2d.setTransform(currentDPR, 0, 0, currentDPR, 0, 0);

    let hasLive = false;
    // Particle layer: V1 ('glow') draws dust BEHIND the falling notes, V2
    // ('solid') draws it IN FRONT. Same particles either way — only the
    // compositing order differs. The dust pass also advances particle physics,
    // so it must run exactly once per frame.
    const dustInFront = dustBlendMode === 'solid';
    if(!dustInFront){ if(updateDrawNeonDust(dt, now)) hasLive = true; }

    const riseSpeed = getAnimRiseSpeed() * dt;
    // A held note keeps growing for as long as the key is actually held,
    // on every graphics tier -- there's no reason to release it early.
    // MAX_NOTE_HEIGHT alone used to be the real ceiling on the non-default
    // ("Potato") tier: once a held note's bar reached 400px it flipped
    // f.growing to false right below, which is indistinguishable from a
    // genuine key-up -- the bar would detach and start sliding away while
    // the note was still sounding. Anything past the visible stage height
    // is off-screen and invisible anyway, so capping at canvasCssH (like
    // the default tier already did) isn't a real limit, just stops
    // tracking height nobody can see -- unlike the flat 400px, which is
    // well within a typical stage and triggers after only a couple of
    // seconds of holding a note.
    const maxNoteH = Math.max(MAX_NOTE_HEIGHT, (canvasCssH || MAX_NOTE_HEIGHT));
    for(let i=0;i<falling.length;i++){
        const f=falling[i];
        if(f.dead) continue;
        // Correctness backstop, not a fallback for missing logic: a local note
        // is only ever "growing" for as long as pressStartTimes still has its
        // key down (playPressVisual/playReleaseVisual keep the two in sync on
        // every real press/release). If a key-up DOM event is ever lost --
        // e.g. pointer capture dropped mid-glissando -- this is what actually
        // catches it, instead of the bar growing at max height forever until
        // a page reload. O(1) Map lookup, already iterating this note anyway.
        if(f.growing && !f.remote && !pressStartTimes.has(f.midi)) f.growing = false;
        // Duration ceiling — applies to remote notes too (see MAX_HELD_NOTE_MS).
        if(f.growing && f.grownAtMs !== undefined && (now - f.grownAtMs) > MAX_HELD_NOTE_MS) f.growing = false;
        if(f.growing){
            if(f.height<maxNoteH){
                f.height=Math.min(f.height+riseSpeed, maxNoteH);
                f.y=f.bottomY-f.height;
            }
            // Height capped but the key is still down (growing stays true
            // until the real note-off flips it, see releaseFallingNote) --
            // stay anchored at the strike line instead of detaching.
        } else {
            f.y -= riseSpeed;
            if(f.bottomY !== undefined) f.bottomY -= riseSpeed;
        }
        if(f.y+f.height<0){ f.dead=true; continue; }
        drawFallingNote(f);
        hasLive = true;
    }
    if(dustInFront){ if(updateDrawNeonDust(dt, now)) hasLive = true; }

    if(falling.length > 40){
        let w=0, removed=false;
        for(let i=0;i<falling.length;i++){
            if(!falling[i].dead) falling[w++]=falling[i];
            else removed=true;
        }
        falling.length=w;
        if(removed) unregisterDeadFalling();
    }
    // Effective live-note ceiling: GRAPHIC_PROFILES[tier].fallingMax scaled by
    // the same physical-pixel-area budget as particles (see
    // getCanvasPixelBudgetScale) -- previously declared per-tier but never
    // actually enforced anywhere, so a long sustained-pedal session or a fast
    // passage could grow `falling` without any real bound beyond the array
    // compaction above (which only removes notes already fully faded offscreen).
    // Only notes that are NOT currently growing (i.e. the key is already up --
    // this never touches a note still sounding) are culled, oldest first, so
    // piano responsiveness/held-note visuals are never affected, only the
    // trailing rise-and-fade tail of notes nobody is pressing anymore.
    const fallingCap = Math.max(24, Math.round((getGraphicProfile().fallingMax || 900) * getCanvasPixelBudgetScale()));
    if(falling.length > fallingCap){
        let toCull = falling.length - fallingCap;
        for(let i=0;i<falling.length && toCull>0;i++){
            const f = falling[i];
            if(!f.dead && !f.growing){ f.dead = true; toCull--; }
        }
        let w=0;
        for(let i=0;i<falling.length;i++){ if(!falling[i].dead) falling[w++]=falling[i]; }
        falling.length=w;
        unregisterDeadFalling();
    }

    if(hasLive) animFrameId=requestAnimationFrame(anim);
    else {
        animFrameId=null; lastFrameTime=0; _lastAnimTs=-1; falling.length=0; fallingByMidi.clear();
        if(pressStartTimes.size === 0 && document.body && !document.body.classList.contains('idle-no-notes')){
            document.body.classList.add('idle-no-notes');
        }
    }
}
let resizeRaf = null;
let heightResizeRaf = null;
// Latest not-yet-applied values for the CSS custom properties that Piano
// Height / Piano Position write. Set by applyPianoHeight/applyPianoLift on
// every raw slider tick, actually written to :root only once inside
// schedulePianoHeightResize's single rAF -- see that function's comment for
// why batching this write (instead of doing it synchronously per tick) is
// what fixes the 5-20fps drop while dragging these sliders.
let pendingHeightPx = null;
let pendingLiftVh = null;
// null = no change this frame; 1 = drop the drag scale and use the real height.
let pendingHeightScale = null;
// Whether this frame's geometry write should resize #pianoWrap's box.
let pendingCommitWrap = false;
let blackKeyVisualRaf = null;
// Set when the Black Key Height% slider moves: the separator canvas splits at
// that same height so it has to be repainted, but only for that slider.
let pendingSeparatorsDirty = false;
let uiLayoutLockUntil = 0;
function lockUiLayout(ms=500){
    uiLayoutLockUntil = performance.now() + ms;
}
function isUiLayoutLocked(){
    return performance.now() < uiLayoutLockUntil;
}
let cachedStageW = 0, cachedStageH = 0;
let stageGeomDirty = true;
let lastStageFreshCheckAt = 0;

let knownStageH = 0;
function markStageGeomDirty(){
    stageGeomDirty = true;
    invalidateStageGeom();
}
function computeStageSize(){
    const stage = document.querySelector('.stage');
    if(stage){
        const r = stage.getBoundingClientRect();
        const w = Math.max(1, Math.round(r.width || stage.clientWidth || stage.offsetWidth || window.innerWidth || 1));
        const h = Math.max(1, Math.round(r.height || stage.clientHeight || stage.offsetHeight || canvasCssH || 1));
        _cachedStageEl = stage;
        _cachedStageRect = r;
        return { w, h };
    }
    return {
        w: Math.max(1, Math.round(window.innerWidth || canvasCssW || 1)),
        h: Math.max(1, Math.round(canvasCssH || knownStageH || window.innerHeight * 0.6 || 1))
    };
}
function syncCanvasSize(forceReadStage){
    // Resizing throws away the backing store, so the dirty-rect union from the
    // previous frame describes a surface that no longer exists.
    markFxFullClear();
    const mustRead = forceReadStage || stageGeomDirty || knownStageH === 0 || cachedStageW === 0;
    const size = mustRead ? computeStageSize() : { w: cachedStageW, h: knownStageH };
    const nextW = Math.max(1, Math.floor(size.w));
    const nextH = Math.max(1, Math.floor(size.h));
    if(knownStageH !== nextH) knownStageH = nextH;
    cachedStageW = nextW;
    cachedStageH = nextH;
    stageGeomDirty = false;
    const dpr = getRenderDPR();
    const physW = Math.max(1, Math.round(nextW * dpr));
    const physH = Math.max(1, Math.round(nextH * dpr));
    canvasCssW = nextW;
    canvasCssH = nextH;
    currentDPR = dpr;
    if(canvas.width !== physW) canvas.width = physW;
    if(canvas.height !== physH) canvas.height = physH;
    const cssW = nextW + 'px', cssH = nextH + 'px';
    if(canvas.style.width !== cssW) canvas.style.width = cssW;
    if(canvas.style.height !== cssH) canvas.style.height = cssH;
    // Keep the WebGL particle layer pixel-locked to the 2D canvas.
    if(glCanvas){
        if(glCanvas.style.width !== cssW) glCanvas.style.width = cssW;
        if(glCanvas.style.height !== cssH) glCanvas.style.height = cssH;
        glResizeParticles(physW, physH);
    }
    ctx2d.imageSmoothingEnabled = true;
    ctx2d.imageSmoothingQuality = 'high';
    ctx2d.globalAlpha = 1;
    ctx2d.globalCompositeOperation = 'source-over';
    cachedStageHeight = nextH;
    _cachedStageRect = null;
}
function ensureStageCanvasFresh(force=false){

    if(stageGeomDirty || !canvasCssH || !cachedStageHeight){
        syncCanvasSize(true);
        lastStageFreshCheckAt = performance.now();
        return;
    }
    if(force){
        lastStageFreshCheckAt = performance.now();
        reconcileStageCanvasSize();
    }
}
function reconcileStageCanvasSize(){
    if(isUiLayoutLocked()) return;
    const stage = document.querySelector('.stage');
    if(!stage) return;
    const r = stage.getBoundingClientRect();
    const realW = Math.max(1, Math.round(r.width || stage.clientWidth || stage.offsetWidth || 1));
    const realH = Math.max(1, Math.round(r.height || stage.clientHeight || stage.offsetHeight || 1));
    if(Math.abs(realH - canvasCssH) > 2 || Math.abs(realW - canvasCssW) > 2){
        markStageGeomDirty();
        syncCanvasSize(true);
    }
}
let _stageFreshWatcherId = null;
function startStageFreshWatcher(){
    if(_stageFreshWatcherId) return;

    _stageFreshWatcherId = setInterval(() => {
        if(stageGeomDirty || !canvasCssH) return;
        if(!animFrameId) return;
        if(getBurstLevel() >= 4) return;
        reconcileStageCanvasSize();
    }, 500);
}
function syncViewportGeometryNow(){
    if(isUiLayoutLocked()) return;
    markStageGeomDirty();
    updateKeyLayout();
    syncCanvasSize(true);
    updateKeyHitCache();
    if(falling.length>0) ensureAnimLoop();
}
function scheduleViewportGeometrySync(){
    syncViewportGeometryNow();
    [80, 200, 450, 800].forEach(d => setTimeout(syncViewportGeometryNow, d));
}
// The surface-relative scale behind --gfx-scale (see the stylesheet's :root
// for what it is for). Anchored on viewport WIDTH because that is the surface
// a strike line is drawn across, and width is what actually differs between a
// phone held upright, the same phone sideways, and a laptop -- the three cases
// the same setting looked wrong in.
let _lastGfxScale = '';
function updateGfxScale(){
    const w = window.innerWidth || document.documentElement.clientWidth || 900;
    const str = Math.max(0.7, Math.min(1.7, w / 900)).toFixed(3);
    if(str === _lastGfxScale) return;
    _lastGfxScale = str;
    document.documentElement.style.setProperty('--gfx-scale', str);
}
updateGfxScale();
function resize(){
    if(isUiLayoutLocked()) return;
    updateGfxScale();
    if(resizeRaf) cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => {
        resizeRaf = null;
        invalidateWrapRect();
        syncCanvasSize(true);
        updateKeyLayout();
        if(falling.length>0) ensureAnimLoop();
        // Safety-net resync: covers boot-order cases where this settles
        // before/after the other --bk-face/--bk-cut dependencies.
        updateBlackKeyEdgeVars();
    });
}
// Applies the piano's height/lift geometry WITHOUT touching :root.
//
// This is the single most important perf rule in this file. --piano-height and
// --piano-lift used to be written on document.documentElement, which measured
// (Poco X3 Pro-class hardware, 6x CPU throttle) at ~34ms for ONE write --
// more than two whole frames, for a single slider tick. Writing the very same
// geometry directly onto #pianoWrap instead measured 0.6ms: 50x+ cheaper for
// an identical visual result.
//
// The reason is that a custom property is an INHERITED property and Blink has
// no per-property dependency tracking for them: setting one on :root marks the
// entire document's computed styles dirty, so every element has to re-resolve
// every value it derives from a variable -- including all 88 white and 36
// black keys, whose backgrounds are multi-stop gradients built out of other
// custom properties (see --piano-black-body). Re-resolving those gradients is
// what the 34ms actually was; the keys don't even use --piano-height.
//
// So: #pianoWrap (the one element whose BOX these values change, and the
// ancestor of all the keys) gets plain height/margin-bottom written straight
// onto it -- no variable, so no subtree invalidation. The remaining consumers
// (.stage, #swipeStrip, #toastWrap, #bootSfChip -- all of which position
// themselves with `bottom: calc(var(--piano-height) + ...)`) still get the
// custom properties, but scoped to themselves rather than :root: none of them
// contains any key element, so their invalidation is trivially cheap, and
// keeping them variable-driven means the calc() formulas stay in the
// stylesheet instead of being duplicated into JS and drifting.
//
// The `important` priority is required: .render-fixed #pianoWrap sets both
// height and margin-bottom with !important (and a later `margin:0 !important`
// rule), and a plain inline style loses to a stylesheet !important. An inline
// !important wins over both.
let _pianoGeomEls = null;
function getPianoGeomEls(){
    if(_pianoGeomEls && _pianoGeomEls.wrap && _pianoGeomEls.wrap.isConnected
        && _pianoGeomEls.varConsumers.length) return _pianoGeomEls;
    _pianoGeomEls = {
        wrap: document.getElementById('pianoWrap'),
        // Handled separately in applyPianoGeom -- the one consumer whose
        // subtree is expensive to invalidate.
        stage: document.querySelector('.stage'),
        // Every element that resolves --piano-height/--piano-lift in CSS but is
        // NOT an ancestor of the keys. Kept as a list so adding a consumer to
        // the stylesheet only needs its selector added here.
        varConsumers: ['#swipeStrip', '#toastWrap', '#bootSfChip']
            .map(sel => document.querySelector(sel))
            .filter(Boolean)
    };
    return _pianoGeomEls;
}
// Last resolved geometry, so .stage's edge can always be written as a complete
// pair even when only one of the two values just changed.
let _geomHeightPx = '';
// Last strings actually written onto .stage, so a frame that changes neither
// touches no style at all.
let _geomStageBottom = '';
let _geomStageTransform = '';
// The height currently RASTERED into #pianoWrap. The logical height the
// user is dragging toward lives in currentPianoHeightPx; while the two
// differ, the gap is carried by a compositor scaleY.
let _pianoRasterHeightPx = '';
const PIANO_DRAG_SCALE_LIMIT = 1.15;
// True while #pianoWrap is carrying a non-1 scaleY that still has to be
// resolved back into a real height.
let _pianoDragScaled = false;
let _geomLiftVh = '';
// heightPx is always the LOGICAL height -- what the user's percent resolves to
// right now. commitWrapHeight says whether to write it into #pianoWrap's box
// (a real resize, which re-rasters the key layers) or leave the box alone
// because scaleY is carrying the difference on the compositor. .stage's edge
// always follows the LOGICAL height either way, so the keybed line and the
// falling-note canvas stay flush with the piano's visible top edge mid-drag.
function applyPianoGeom(heightPx, liftVh, scaleY, commitWrapHeight){
    const els = getPianoGeomEls();
    if(els.wrap){
        if(commitWrapHeight && heightPx !== null && heightPx !== undefined) els.wrap.style.setProperty('height', heightPx, 'important');
        if(liftVh !== null && liftVh !== undefined) els.wrap.style.setProperty('margin-bottom', liftVh, 'important');
        // ── The drag scale ───────────────────────────────────────────────
        // #pianoWrap and #piano are both composited layers, and RESIZING a
        // composited layer cannot be invalidated incrementally -- the whole
        // layer is re-rastered. Traced over a 40-step Piano Height drag,
        // #piano and #activeKeyLayer each recorded 41 paints with an
        // UNBOUNDED clip (-12000..12412 x 12114, Blink's "no bounds" marker),
        // i.e. 41 full re-rasters of 124 gradient/bevel key elements. That is
        // the drag lag, and it is why cutting Layout and style-recalc time in
        // half changed nothing on device: the cost was never Layout.
        //
        // Scaling the layer instead keeps its raster and hands the frame to
        // the compositor. transform-origin is the bottom edge, which is where
        // #pianoWrap is anchored, so the scaled top edge lands exactly where
        // a real height change would have put it -- .stage's bottom (written
        // below from the LOGICAL height) stays flush with it.
        if(scaleY !== null && scaleY !== undefined){
            els.wrap.style.transformOrigin = '50% 100%';
            els.wrap.style.transform = (scaleY === 1)
                ? 'translateZ(0)'
                : ('translateZ(0) scaleY(' + scaleY + ')');
        }
    }
    // ── .stage gets the RESOLVED edge, never the variables ───────────────
    // .stage is the ancestor of #strikeLine, #strikeLineAuraSegments,
    // #strikeReactionLayer, #chordDisplay and the canvases. A custom property
    // is INHERITED and Blink has no per-property dependency tracking for them,
    // so writing one here marks that whole subtree's computed styles dirty on
    // every slider tick -- the exact trap the #pianoWrap comment above
    // describes, one level down, and never noticed because .stage holds no key
    // elements. It holds something worse: the strike line is a full-width bar
    // carrying six box-shadows out to 92px plus a filter and two animated
    // blurred layers.
    //
    // Traced over a 40-step Piano Height drag, strike line on vs off, paint was
    // identical (380 vs 378 paints, same area) but Layout went 21 -> 40 ms and
    // style recalc 30 -> 72 ms. That doubling is what the Sketch and 8-bit
    // themes appear to "cure" -- they fix nothing, they force the strike line
    // off (see setPianoTheme), which is why they measure about 2x better.
    //
    // .stage's ONLY use of these values is its own bottom edge (see
    // `.render-fixed .stage`), and `bottom` is not inherited, so writing the
    // resolved value straight onto it invalidates .stage alone and nothing
    // beneath it. The calc is duplicated from the stylesheet deliberately: one
    // line, for the only consumer whose subtree costs anything.
    if(els.stage){
        if(heightPx !== null && heightPx !== undefined) _geomHeightPx = heightPx;
        if(liftVh !== null && liftVh !== undefined) _geomLiftVh = liftVh;
        // ── Move by the SAME mechanism the piano is moving by ────────────
        // Mid-drag the piano moves as a compositor transform on #pianoWrap,
        // while .stage's bottom is a LAYOUT property. Those do not run on the
        // same clock: the compositor can present a transform on frames the main
        // thread never finishes, so on a busy drag the piano's top edge slid
        // smoothly while the strike line only jumped on the frames layout
        // actually landed -- the line came visibly unstuck from the keybed
        // instead of riding on it. Measuring from the main thread hides this
        // completely (the piano-top-to-strike-line gap reads 0.00px in every
        // rAF, because by then both writes have been applied); it is only
        // visible in what gets PRESENTED.
        //
        // So while the wrap is scaled, .stage does not touch `bottom` at all.
        // It rides the identical geometry as a transform instead: scaling by k
        // about the bottom edge lifts the piano's top by (k - 1) x the rastered
        // height, so the stage translates by exactly that. Both edges are now
        // transforms in the same compositor commit and cannot separate however
        // far behind the main thread falls. On commit the real bottom lands and
        // the transform goes back to none.
        if(_geomHeightPx || _geomLiftVh){
            if(!_geomHeightPx || !_geomLiftVh){
                const cs = getComputedStyle(els.stage);
                if(!_geomHeightPx) _geomHeightPx = cs.getPropertyValue('--piano-height').trim() || '25vh';
                if(!_geomLiftVh) _geomLiftVh = cs.getPropertyValue('--piano-lift').trim() || '0px';
            }
            // The edge is split into the part .stage LAYS OUT and the part it
            // TRANSFORMS, and both come from the same two numbers #pianoWrap
            // itself uses, so they cannot disagree:
            //   layout part = the height actually rastered right now
            //   transform   = rastered height - logical height
            // Mid-drag only the transform moves, so the bottom string is
            // identical frame to frame and no layout write happens at all; on
            // commit the rastered height becomes the logical one, the delta
            // collapses to zero and the transform clears itself.
            // Deriving both from STATE rather than from this call's scaleY is
            // what makes the mixed cases right: a Piano Position commit that
            // arrives while a height scale is still in flight carries no
            // scaleY of its own, and an earlier version keyed off scaleY
            // skipped the bottom write entirely there -- measured, the strike
            // line drifted 128px off the keybed. Here the lift lands in the
            // bottom string and the transform is left alone.
            const rasterPx = parseFloat(_pianoRasterHeightPx);
            const logicalPx = /px\s*$/.test(_geomHeightPx) ? parseFloat(_geomHeightPx) : NaN;
            const canSplit = _pianoDragScaled && Number.isFinite(rasterPx) && Number.isFinite(logicalPx) && rasterPx > 0;
            const nextBottom = 'calc(' + (canSplit ? (rasterPx + 'px') : _geomHeightPx) + ' + ' + _geomLiftVh + ')';
            const nextTransform = canSplit ? ('translateY(' + (rasterPx - logicalPx).toFixed(3) + 'px)') : '';
            if(_geomStageBottom !== nextBottom){
                _geomStageBottom = nextBottom;
                els.stage.style.setProperty('bottom', nextBottom, 'important');
            }
            if(_geomStageTransform !== nextTransform){
                _geomStageTransform = nextTransform;
                els.stage.style.transform = nextTransform;
            }
        }
    }
    for(let i=0; i<els.varConsumers.length; i++){
        const el = els.varConsumers[i];
        if(heightPx !== null && heightPx !== undefined) el.style.setProperty('--piano-height', heightPx);
        if(liftVh !== null && liftVh !== undefined) el.style.setProperty('--piano-lift', liftVh);
    }
}
function schedulePianoHeightResize(){
    if(heightResizeRaf) cancelAnimationFrame(heightResizeRaf);
    heightResizeRaf = requestAnimationFrame(() => {
        heightResizeRaf = null;
        // Writing an inherited custom property on documentElement forces Blink
        // to recompute style for the WHOLE #app subtree (custom properties have
        // no fine-grained dependency tracking), and --piano-height/--piano-lift
        // also change #pianoWrap's actual box size, forcing a real layout reflow
        // on top of that. Doing this write once per animation frame here --
        // instead of synchronously on every raw 'input' event, which is what
        // applyPianoHeight/applyPianoLift used to do -- is the fix for the
        // 5-20fps drop while dragging these sliders: a fast drag can fire far
        // more 'input' events than there are frames to paint them in, so
        // coalescing to "latest value wins, once per frame" drops none of the
        // visual result while cutting the actual work by that same factor.
        if(pendingHeightPx !== null || pendingLiftVh !== null || pendingHeightScale !== null){
            applyPianoGeom(pendingHeightPx, pendingLiftVh, pendingHeightScale, pendingCommitWrap);
            pendingHeightPx = null;
            pendingLiftVh = null;
            pendingHeightScale = null;
            pendingCommitWrap = false;
        }
        // Deliberately NOT calling updateKeyLayout/updateBlackKeyEdgeVars/
        // updateKeyHitCache here, even though the comment above this used to
        // say this whole block ran every frame during a drag. Coalescing the
        // CSS write to 1x/frame (above) cut the REDUNDANT extra writes, but
        // profiling on real Android hardware (Poco X3 Pro) showed the drop
        // to 2-7fps survived that fix anyway -- because even a SINGLE
        // occurrence of the full pass is expensive enough on that hardware
        // that doing it once per frame, for the whole duration of a drag, is
        // still too slow. And none of it actually depends on height/lift in
        // a way that needs to track the drag live:
        //  - key X positions/widths come from viewport WIDTH and visible key
        //    count (see getWhiteKeyLeftPx/getWhiteKeyWidthPx) -- a pure
        //    height or lift change never moves them, so updateKeyLayout's
        //    88-element write loop plus its renderPianoSeparators() canvas
        //    redraw were pure wasted work every single frame.
        //  - updateBlackKeyEdgeVars' --bk-face/--bk-cut only affect the
        //    chamfer bevel's depth ratio, a cosmetic detail nobody can
        //    perceive lagging by one debounce cycle behind the slider.
        //  - updateKeyHitCache only matters once the user actually tries to
        //    press a key, which in practice is after they let go of the
        //    slider, not while their finger/mouse is still on it.
        // finalizePianoHeightLayout/finalizePianoLiftLayout below already run
        // the full correct pass exactly once, when the gesture actually ends
        // (pointerup/touchend/change, or 180ms after the last tick) -- that
        // single pass is all any of this ever needed.
        //
        // The one thing that DOES need to track the drag live is the
        // falling-notes canvas, if notes are actually falling right now
        // (playing while adjusting settings) -- an idle, empty canvas being
        // briefly the wrong size is invisible, so this stays conditional
        // instead of unconditional.
        if(falling.length > 0){
            invalidateWrapRect();
            syncCanvasSize(false);
            ensureAnimLoop();
        }
    });
}
const hRange = document.getElementById('hRange');
const hVal = document.getElementById('hVal');
function getPianoMaxHeightPx(){
    const vv = window.visualViewport;
    const vh = Math.max(1, Math.round(vv ? vv.height : window.innerHeight));
    return Math.max(1, Math.floor(vh * 0.50));
}
// The setting is a PERCENT. The >100 branch is a one-way migration for
// presets saved back when this was stored as raw pixels -- it is the only
// place a pixel value is ever accepted as input, and it is lossy by nature
// (an old pixel height can only be re-read against the CURRENT viewport).
// Nothing writes pixels any more, so no new value can take that path.
function normalizePianoHeightPercent(value){
    const raw = Number(value);
    if(!Number.isFinite(raw)) return 0;
    if(raw > 100){
        const maxPx = getPianoMaxHeightPx();
        return Math.round((Math.max(0, Math.min(maxPx, raw)) / maxPx) * 100);
    }
    return Math.max(0, Math.min(100, Math.round(raw)));
}
// ── Piano height: ONE mapping, no history ────────────────────────────────
// BASE GEOMETRY (viewport) -> USER SETTING (0-100) -> DERIVED PX. That is the
// entire chain, and it is a pure function: the same percent always produces
// the same pixels, on every path that can set it.
//
// It did not used to be. There were TWO percent->px mappings -- a linear one,
// and a sqrt ease below 40% -- and which one ran was decided by a
// `pianoHeightIsManual` flag recording whether the slider had ever been
// touched. The number on the slider was therefore not the state; (number,
// history) was. Measured on the real page, same slider reading, same viewport:
//
//     slider says     untouched     after touching
//         5%              18px            49px
//        10%              35px            70px
//        20%              70px            99px
//        30%             105px           121px
//        40% and up     identical       identical
//
// The user-visible failure: Save Preset -> Load Preset DOUBLED the portrait
// piano (43px -> 86px) with the slider still reading 10% and nothing touched,
// because restoring a preset set the manual flag. A rotation cleared the flag
// and halved it back, so the piano jumped between two heights for one value.
//
// A second correction existed only to undo the first. `pianoHeightBoostRatio`
// measured how much taller the curve had made the piano and multiplied Black
// Key Edge Depth by it, so the bevel would not read shallow against a key the
// curve had inflated -- a correction on top of a correction, with a derived
// value fed back into another derived value.
//
// Both are gone. One linear mapping, applied unconditionally. It is exactly
// what the untouched defaults already produced, so a fresh install renders
// pixel-identically (landscape 40% -> 140px, portrait 10% -> 43px); the only
// behaviour that changed is that a touched or restored value now renders what
// its label says. Anything wanting a bigger piano at the bottom of the range
// belongs in the DEFAULT percent, not in a second mapping.
function pianoHeightPxFor(percent){
    const pct = Math.max(0, Math.min(100, Number(percent) || 0));
    return Math.round(getPianoMaxHeightPx() * pct / 100);
}
let currentPianoHeightPx = '';
let currentPianoHeightPercent = 50;
let heightFinalizeTimer = null;
let heightFinalizeRaf = null;
function updateHeightUI(percent){
    const pct = normalizePianoHeightPercent(percent);
    if(hRange && hRange.value !== String(pct)) hRange.value = String(pct);
    if(hVal) hVal.textContent = pct + '%';
    // Two sliders drive one value; a key-count reflow moves it without either
    // of them being touched, so both have to be told.
    syncKeyPanelHeight(pct);
}
function finalizePianoHeightLayout(){
    if(heightFinalizeTimer) { clearTimeout(heightFinalizeTimer); heightFinalizeTimer = null; }
    if(heightFinalizeRaf) cancelAnimationFrame(heightFinalizeRaf);
    heightFinalizeRaf = requestAnimationFrame(() => {
        heightFinalizeRaf = null;
        document.body.classList.remove('layout-changing', 'piano-height-dragging', 'bk-face-lite');
        invalidateWrapRect();
        syncCanvasSize(false);
        updateKeyLayout();
        updateKeyHitCache();
        // --bk-cut is a percentage of the black key's own height, so it moves
        // whenever Piano Height does. It rides this "once the gesture actually
        // ends" pass rather than recomputing on every raw slider tick.
        scheduleBlackKeyVisualUpdate();
        if(falling.length>0) ensureAnimLoop();
    });
}

function ensurePianoBootVisible(){
    const wrap = document.getElementById('pianoWrap');
    const piano = document.getElementById('piano');
    if(!wrap || !piano) return;
    const h = wrap.getBoundingClientRect().height;
    if(!h || h < 24){
        currentPianoHeightPx = '';
        setPianoHeightPercent(getDefaultPianoHeightPercent(), true);
    }
    if(!piano.children.length && typeof build === 'function') build();
    else if(typeof updateKeyLayout === 'function') updateKeyLayout();
    if(typeof updateKeyHitCache === 'function') updateKeyHitCache();
    if(typeof syncCanvasSize === 'function') syncCanvasSize(true);
}

// Entry point for a person moving the slider, a preset, or factory defaults --
// the counterpart of setBlackKeyEdgeDepthPercent. applyPianoHeight itself never
// touches the reference, so reflowPianoForKeyCount can drive it freely.
function setPianoHeightPercent(value, final){
    const eff = normalizePianoHeightPercent(value);
    pianoHeightRefPercent = eff / keyCountHeightScale();
    applyPianoHeight(eff, final);
}
function applyPianoHeight(value, final=false){
    if(!hRange) return;
    const pct = normalizePianoHeightPercent(value);
    const next = pianoHeightPxFor(pct);
    pendingPianoHeight = String(pct);
    currentPianoHeightPercent = pct;
    updateHeightUI(pct);
    const nextPx = next + 'px';
    markStageGeomDirty();
    document.body.classList.add('layout-changing', 'piano-height-dragging', 'bk-face-lite');
    // Mid-drag, prefer a compositor scale over a real resize -- see
    // applyPianoGeom's comment for the measurement that motivates it. The
    // scale is only allowed to stray PIANO_DRAG_SCALE_LIMIT from the height
    // actually rastered; past that the keys would visibly stretch (the
    // black-key bevel is width-derived and the labels are not scaled copies),
    // so the real height is committed and becomes the new base. A 25%->65%
    // drag re-rasters a handful of times instead of once per frame, and never
    // distorts by more than the limit.
    //
    // `final` ALWAYS commits, even when the value did not change on this
    // call: the last 'input' of a drag usually already set it, so gating the
    // commit on a value change would leave the gesture ending on a scaled
    // layer -- keys frozen slightly stretched until something else resized
    // them.
    const rasterPx = parseFloat(_pianoRasterHeightPx) || 0;
    const k = rasterPx > 0 ? (next / rasterPx) : 1;
    const canScale = !final && rasterPx > 0
        && k <= PIANO_DRAG_SCALE_LIMIT && k >= 1 / PIANO_DRAG_SCALE_LIMIT;
    if(final){
        if(_pianoRasterHeightPx !== nextPx || _pianoDragScaled){
            currentPianoHeightPx = nextPx;
            pendingHeightPx = nextPx;
            pendingHeightScale = 1;
            pendingCommitWrap = true;
            _pianoRasterHeightPx = nextPx;
            _pianoDragScaled = false;
            schedulePianoHeightResize();
        }
    } else if(currentPianoHeightPx !== nextPx){
        currentPianoHeightPx = nextPx;
        // The logical height goes out every tick regardless -- .stage's edge
        // has to track the piano's visible top even on the frames where the
        // wrap's box is deliberately left alone.
        pendingHeightPx = nextPx;
        if(canScale){
            pendingHeightScale = k;
            pendingCommitWrap = false;
            _pianoDragScaled = (k !== 1);
        } else {
            // Deferred into schedulePianoHeightResize's single rAF -- see its
            // comment for why writing the geometry synchronously on every raw
            // tick was itself once the cause of a 5-20fps drop here.
            pendingHeightScale = 1;
            pendingCommitWrap = true;
            _pianoRasterHeightPx = nextPx;
            _pianoDragScaled = false;
        }
        schedulePianoHeightResize();
    }
    if(final){
        finalizePianoHeightLayout();
    } else {
        if(heightFinalizeTimer) clearTimeout(heightFinalizeTimer);
        heightFinalizeTimer = setTimeout(finalizePianoHeightLayout, 180);
    }
}
if(hRange){
    hRange.addEventListener('input', () => setPianoHeightPercent(hRange.value, false));
    hRange.addEventListener('change', () => setPianoHeightPercent(hRange.value, true));
    hRange.addEventListener('pointerup', () => setPianoHeightPercent(hRange.value, true));
    hRange.addEventListener('touchend', () => setPianoHeightPercent(hRange.value, true), {passive:true});
}
const keyPanelHRange = document.getElementById('keyPanelHRange');
const keyPanelHVal = document.getElementById('keyPanelHVal');
function syncKeyPanelHeight(pct){
    if(keyPanelHRange) keyPanelHRange.value = pct;
    if(keyPanelHVal) keyPanelHVal.textContent = pct + '%';
}
if(keyPanelHRange){
    keyPanelHRange.addEventListener('input', () => setPianoHeightPercent(keyPanelHRange.value, false));
    keyPanelHRange.addEventListener('change', () => setPianoHeightPercent(keyPanelHRange.value, true));
    keyPanelHRange.addEventListener('pointerup', () => setPianoHeightPercent(keyPanelHRange.value, true));
    keyPanelHRange.addEventListener('touchend', () => setPianoHeightPercent(keyPanelHRange.value, true), {passive:true});
}
document.getElementById('blackKeyWidthRange')?.addEventListener('input', e => setBlackKeyWidthPercent(e.target.value));
document.getElementById('blackKeyHeightRange')?.addEventListener('input', e => setBlackKeyHeightPercent(e.target.value));
document.getElementById('blackKeyEdgeDepthRange')?.addEventListener('input', e => setBlackKeyEdgeDepthPercent(e.target.value));
document.getElementById('pianoVisibilityRange')?.addEventListener('input', e => setPianoVisibilityPercent(e.target.value));

// Piano Position: lifts the keyboard off the bottom edge (margin-bottom on
// #pianoWrap) so it doesn't sit flush against the screen edge in portrait —
// unlike Piano Height, which resizes the piano itself, this leaves its size
// alone and shrinks the falling-notes area above it instead. Capped at 30vh
// so the note area can't be squeezed away entirely.
let liftFinalizeTimer = null;
let liftFinalizeRaf = null;
function finalizePianoLiftLayout(){
    if(liftFinalizeTimer) { clearTimeout(liftFinalizeTimer); liftFinalizeTimer = null; }
    if(liftFinalizeRaf) cancelAnimationFrame(liftFinalizeRaf);
    liftFinalizeRaf = requestAnimationFrame(() => {
        liftFinalizeRaf = null;
        document.body.classList.remove('layout-changing', 'piano-height-dragging', 'bk-face-lite');
        invalidateWrapRect();
        syncCanvasSize(false);
        updateKeyLayout();
        updateKeyHitCache();
        if(falling.length>0) ensureAnimLoop();
    });
}
const pianoLiftRange = document.getElementById('pianoLiftRange');
const pianoLiftVal = document.getElementById('pianoLiftVal');
function applyPianoLift(value, final=false){
    const pct = Math.max(0, Math.min(30, Math.round(Number(value) || 0)));
    pianoLiftPercent = pct;
    if(pianoLiftRange && pianoLiftRange.value !== String(pct)) pianoLiftRange.value = String(pct);
    if(pianoLiftVal) pianoLiftVal.textContent = pct + '%';
    markStageGeomDirty();
    document.body.classList.add('layout-changing', 'piano-height-dragging', 'bk-face-lite');
    // Deferred into schedulePianoHeightResize's rAF -- same reason as Piano
    // Height, see that function's comment.
    pendingLiftVh = pct + 'vh';
    schedulePianoHeightResize();
    if(final){
        finalizePianoLiftLayout();
    } else {
        if(liftFinalizeTimer) clearTimeout(liftFinalizeTimer);
        liftFinalizeTimer = setTimeout(finalizePianoLiftLayout, 180);
    }
}
if(pianoLiftRange){
    pianoLiftRange.addEventListener('input', () => applyPianoLift(pianoLiftRange.value, false));
    pianoLiftRange.addEventListener('change', () => applyPianoLift(pianoLiftRange.value, true));
    pianoLiftRange.addEventListener('pointerup', () => applyPianoLift(pianoLiftRange.value, true));
    pianoLiftRange.addEventListener('touchend', () => applyPianoLift(pianoLiftRange.value, true), {passive:true});
}
setPianoScalePercent();
setBlackKeyWidthPercent(blackKeyWidthPercent);
setBlackKeyHeightPercent(blackKeyHeightPercent);
setBlackKeyEdgeDepthPercent(blackKeyEdgeDepthPercent);
setPianoVisibilityPercent(pianoVisibilityPercent);

const _origUpdateHeightUI = updateHeightUI;
updateHeightUI = function(percent){
    _origUpdateHeightUI(percent);
    const pct = normalizePianoHeightPercent(percent);
    syncKeyPanelHeight(pct);
};
window.addEventListener('resize', () => {
    if(isUiLayoutLocked()) return;
    markStageGeomDirty();
    resize();
    applyPianoHeight(currentPianoHeightPercent, true);
}, { passive:true }); resize();

// Tracks the orientation as of the last relayout so a genuine portrait <->
// landscape flip can be told apart from ordinary resize noise (a mobile
// soft keyboard opening/closing, pinch-zoom, a desktop window resize) that
// fires the exact same orientationchange/visualViewport events without
// the device actually having rotated -- re-snapping Piano Position/Height/
// Black Key Width to their orientation default on every one of those
// would silently discard a manual mid-session tweak for no reason.
let _lastPianoOrientationWasPortrait = isPortraitOrientation();
function relayoutAfterOrientation(){
    if(isUiLayoutLocked()) return;
    markStageGeomDirty();
    resize();
    const nowPortrait = isPortraitOrientation();
    const orientationFlipped = nowPortrait !== _lastPianoOrientationWasPortrait;
    _lastPianoOrientationWasPortrait = nowPortrait;
    if(orientationFlipped){
        // A real rotation: snap back to the orientation-appropriate
        // defaults (see getDefaultPianoHeightPercent's own comment) --
        // this is the "kalau diubah ke landscape ya balik normal" case.
        applyPianoLift(defaultPianoLiftForOrientation(), true);
        setBlackKeyWidthPercent(defaultBlackKeyWidthForOrientation());
        setPianoHeightPercent(getDefaultPianoHeightPercent(), true);
    } else {
        applyPianoHeight(currentPianoHeightPercent, true);
    }
    scheduleViewportGeometrySync();
}
window.addEventListener('orientationchange', () => {
    relayoutAfterOrientation();
    [120, 280, 500, 800].forEach(d => setTimeout(relayoutAfterOrientation, d));
}, { passive:true });
if(window.visualViewport){
    let vvRaf = 0;
    window.visualViewport.addEventListener('resize', () => {
        if(isUiLayoutLocked()) return;
        if(vvRaf) cancelAnimationFrame(vvRaf);
        vvRaf = requestAnimationFrame(relayoutAfterOrientation);
        scheduleViewportGeometrySync();
    }, { passive:true });
}

function toggle(id){ let p=document.getElementById(id); let v=p.style.display==='flex'; document.querySelectorAll('.floating-panel').forEach(x=>x.style.display='none'); p.style.display=v?'none':'flex'; }
document.getElementById('setBtn').onclick=()=>{ setSettingsTab('performance'); toggle('settingsPanel'); };

function openLinkedPanel(panelId){
    document.querySelectorAll('.floating-panel').forEach(x => x.style.display = 'none');
    const panel = document.getElementById(panelId);
    if(panel) panel.style.display = 'flex';
}
function openSfPanelTab(tab){
    openLinkedPanel('sfPanel');
    if(typeof setSfPanelTab === 'function') setSfPanelTab(tab);
}
function setSettingsTab(tab){
    document.querySelectorAll('.settings-cat-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.settingsTab === tab));
    document.querySelectorAll('.settings-section').forEach(sec => sec.classList.toggle('active', sec.dataset.settingsSection === tab));
}
function setVisualPanelPage(page){
    const isHub = !page || page === 'hub';
    document.querySelectorAll('.visual-hub').forEach(hub => hub.classList.toggle('active', isHub));
    document.querySelectorAll('.visual-subpage').forEach(sub => sub.classList.toggle('active', !isHub && sub.dataset.visualSubpage === page));
}
document.querySelectorAll('[data-visual-open]').forEach(btn => {
    btn.addEventListener('click', () => setVisualPanelPage(btn.dataset.visualOpen));
});
document.querySelectorAll('[data-visual-back]').forEach(btn => {
    btn.addEventListener('click', () => setVisualPanelPage('hub'));
});
document.querySelectorAll('.settings-cat-btn').forEach(btn => {
    btn.addEventListener('click', () => setSettingsTab(btn.dataset.settingsTab));
});
document.querySelectorAll('[data-close-panel]').forEach(btn => {
    btn.addEventListener('click', () => toggle(btn.dataset.closePanel));
});
document.getElementById('colBtn').onclick=()=>{ setVisualPanelPage('hub'); toggle('colorPanel'); };
document.getElementById('metroBtn').onclick=()=>toggle('metronomePanel');
document.getElementById('sfBtn').onclick=()=>openSfPanelTab('main');
const audioBtn = document.getElementById('audioBtn');
if(audioBtn) audioBtn.onclick=()=>toggle('audioPanel');
document.getElementById('keyBtn').onclick=()=>toggle('keyPanel');
document.getElementById('sheetBtn').onclick=()=>toggle('sheetPanel');
// Persists across reloads (and shared with Multiplayer's own copy of this
// same block, same key) so pasting a sheet once doesn't need repeating
// every time the panel is reopened or the page is reloaded mid-session.
(function(){
    const ta = document.getElementById('sheetTextArea');
    const clearBtn = document.getElementById('sheetClearBtn');
    const pasteBtn = document.getElementById('sheetPasteBtn');
    if (!ta) return;
    const KEY = 'papianoQwertySheetText';
    try { ta.value = localStorage.getItem(KEY) || ''; } catch (e) {}
    ta.addEventListener('input', () => {
        try { localStorage.setItem(KEY, ta.value); } catch (e) {}
    });
    if (pasteBtn) pasteBtn.onclick = async () => {
        // navigator.clipboard.readText() needs a real user gesture (this
        // click satisfies that) and is unavailable/denied on some browsers
        // (Firefox behind a permission prompt, non-HTTPS) -- always falls
        // back to just focusing the textarea so a manual Ctrl+V still works.
        try {
            const text = await navigator.clipboard.readText();
            if (text) {
                ta.value = text;
                try { localStorage.setItem(KEY, ta.value); } catch (e) {}
            }
        } catch (e) {
            showToast('Couldn’t read the clipboard — try pasting into the box directly (Ctrl+V).');
        }
        ta.focus();
    };
    if (clearBtn) clearBtn.onclick = () => {
        ta.value = '';
        try { localStorage.removeItem(KEY); } catch (e) {}
        ta.focus();
    };
})();
document.getElementById('holdBtn').onclick=()=>toggleSustainHold();
document.getElementById('settingsSustainBtn')?.addEventListener('click', toggleSustainHold);
refreshSustainButton();
const logoToggle = document.getElementById('logoToggle');
if(logoToggle){
    logoToggle.addEventListener('click', () => {
        lockUiLayout(600);
        document.body.classList.toggle('hide-ui');
    });
}
const topPanelScroller = document.getElementById('panel');
if(topPanelScroller){
    topPanelScroller.addEventListener('wheel', e => {
        if(!e.deltaY) return;
        if(topPanelScroller.scrollWidth <= topPanelScroller.clientWidth) return;
        topPanelScroller.scrollLeft += e.deltaY;
        e.preventDefault();
    }, { passive:false });
}
const settingsFullscreenBtn = document.getElementById('settingsFullscreenBtn');
if(settingsFullscreenBtn) settingsFullscreenBtn.onclick = () => {
    const fs = document.getElementById('fsBtn');
    if(fs && typeof fs.onclick === 'function') fs.onclick();
};
const settingsMidiBtn = document.getElementById('settingsMidiBtn');
if(settingsMidiBtn) settingsMidiBtn.onclick = () => {
    const midi = document.getElementById('midiBtn');
    if(midi) midi.click();
};

function applyCurrentSfEffects(){
    const fx = sfEffectSettings.sf1 || {sustain:1.00,reverb:0};
    sustainLevel = Math.max(0, Math.min(1, fx.sustain || 0));
    if (!sfEffectSettings.sf2) sfEffectSettings.sf2 = {fadeSec:STRING_FADE_DEFAULT,reverb:0,transpose:0};
    if (sfEffectSettings.sf2.fadeSec === undefined) sfEffectSettings.sf2.fadeSec = STRING_FADE_DEFAULT;
    if (sfEffectSettings.sf2.transpose === undefined) sfEffectSettings.sf2.transpose = 0;
    reverbLevel = Math.round(Math.max(sfEffectSettings.sf1.reverb || 0, sfEffectSettings.sf2.reverb || 0) * 100);
    isSus = sustainLevel > 0.01;
    reverbEnabled = reverbLevel > 0;
    if (reverbEnabled) {
        if (reverbGain) reverbGain.gain.setTargetAtTime(0.65, audioCtx.currentTime, 0.05);
    } else if (reverbNode) {
        // Both layers are at 0% reverb now: tear the convolver down instead
        // of leaving it permanently wired into the master chain. A
        // ConvolverNode doing real-time convolution against a 2.2s buffer is
        // one of the most CPU-expensive node types in Web Audio, and
        // buildReverb() had no matching teardown -- once reverb was engaged
        // even once in a session (it defaults ON at 30%), it kept costing
        // audio-thread time for the rest of the session even after being
        // turned back down to 0. Rebuilds lazily next time a voice actually
        // needs it (see playSfBuffer's `if (!reverbNode) buildReverb()`).
        try { reverbNode.disconnect(); } catch(e) {}
        try { if (reverbGain) reverbGain.disconnect(); } catch(e) {}
        reverbNode = null;
        reverbGain = null;
    }
}
function updateSfEffectUI(){
    if (!sfEffectSettings.sf2) sfEffectSettings.sf2 = {fadeSec:STRING_FADE_DEFAULT,reverb:0,transpose:0};
    const pairs = [
        ['sf1','sustainSf1Range','sustainSf1Val','sustain'],
        ['sf1','reverbSf1Range','reverbSf1Val','reverb'],
        ['sf2','reverbSf2Range','reverbSf2Val','reverb']
    ];
    pairs.forEach(([group, rangeId, valId, prop]) => {
        const range = document.getElementById(rangeId);
        const val = document.getElementById(valId);
        const pct = Math.round((sfEffectSettings[group][prop] || 0) * 100);
        if (range) range.value = pct;
        if (val) val.textContent = pct + '%';
    });
    const stringFadeRange = document.getElementById('sustainSf2Range');
    const stringFadeVal = document.getElementById('sustainSf2Val');
    const fadeSec = Math.max(0.1, Math.min(10.0, Number(sfEffectSettings.sf2.fadeSec) || STRING_FADE_DEFAULT));
    if (stringFadeRange) stringFadeRange.value = fadeSec.toFixed(1);
    if (stringFadeVal) stringFadeVal.textContent = fadeSec.toFixed(1) + 's';
    const stringTransposeVal = document.getElementById('sf2TransposeVal');
    if (stringTransposeVal) {
        const st = getStringTranspose();
        stringTransposeVal.textContent = (st > 0 ? '+' : '') + st;
    }
    const pianoRange = document.getElementById('pianoVolRange');
    const pianoVal = document.getElementById('pianoVolVal');
    const stringRange = document.getElementById('stringVolRange');
    const stringVal = document.getElementById('stringVolVal');
    const settingsPianoRange = document.getElementById('settingsPianoVolRange');
    const settingsPianoVal = document.getElementById('settingsPianoVolVal');
    const settingsStringRange = document.getElementById('settingsStringVolRange');
    const settingsStringVal = document.getElementById('settingsStringVolVal');
    const settingsSustainRange = document.getElementById('settingsSustainSf1Range');
    const settingsSustainVal = document.getElementById('settingsSustainSf1Val');
    const settingsFadeRange = document.getElementById('settingsSustainSf2Range');
    const settingsFadeVal = document.getElementById('settingsSustainSf2Val');
    const pv = Math.round(pianoVolume * 100);
    const sv = Math.round(stringVolume * 100);
    const sustainPct = Math.round((sfEffectSettings.sf1.sustain || 0) * 100);
    if (pianoRange) pianoRange.value = pv;
    if (pianoVal) pianoVal.textContent = pv + '%';
    if (stringRange) stringRange.value = sv;
    if (stringVal) stringVal.textContent = sv + '%';
    if (settingsPianoRange) settingsPianoRange.value = pv;
    if (settingsPianoVal) settingsPianoVal.textContent = pv + '%';
    if (settingsStringRange) settingsStringRange.value = sv;
    if (settingsStringVal) settingsStringVal.textContent = sv + '%';
    if (settingsSustainRange) settingsSustainRange.value = sustainPct;
    if (settingsSustainVal) settingsSustainVal.textContent = sustainPct + '%';
    if (settingsFadeRange) settingsFadeRange.value = fadeSec.toFixed(1);
    if (settingsFadeVal) settingsFadeVal.textContent = fadeSec.toFixed(1) + 's';
}
function setSfPanelTab(tab){
    const normalized = tab === 'sf1' ? 'main' : (tab === 'sf2' ? 'layer' : (tab === 'layer' ? 'layer' : 'main'));
    document.querySelectorAll('.sf-tab').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === normalized));
    document.querySelectorAll('.sf-page').forEach(page => page.classList.remove('active'));
    const pageMap = { main:'sfPageMain', layer:'sfPageLayer' };
    const page = document.getElementById(pageMap[normalized] || 'sfPageMain');
    if (page) page.classList.add('active');
}
document.querySelectorAll('.sf-tab').forEach(btn => btn.onclick=()=>setSfPanelTab(btn.dataset.tab));
['sustainSf1Range','reverbSf1Range','sustainSf2Range','reverbSf2Range'].forEach(id=>{
    const el = document.getElementById(id);
    if (!el) return;
    el.oninput = e => {
        if (id === 'sustainSf2Range') {
            sfEffectSettings.sf2.fadeSec = Math.max(0.1, Math.min(10.0, parseFloat(e.target.value) || STRING_FADE_DEFAULT));
        } else {
            const val = parseInt(e.target.value,10) / 100;
            const isSf2 = id.includes('Sf2');
            const isReverb = id.startsWith('reverb');
            const group = isSf2 ? 'sf2' : 'sf1';
            sfEffectSettings[group][isReverb ? 'reverb' : 'sustain'] = val;
        }
        updateSfEffectUI();
        applyCurrentSfEffects();
    };
});
// Layer/pad transpose stepper -- mirrors the main Transpose control's
// tUp/tDown pattern, but scoped to the layer soundfont only (see
// getStringTranspose()'s own comment for why this exists as a separate
// control instead of reusing the main transpose).
function changeStringTranspose(delta){
    if (!sfEffectSettings.sf2) sfEffectSettings.sf2 = {fadeSec:STRING_FADE_DEFAULT,reverb:0,transpose:0};
    sfEffectSettings.sf2.transpose = Math.max(-12, Math.min(12, getStringTranspose() + delta));
    updateSfEffectUI();
}
const sf2TransposeUp = document.getElementById('sf2TransposeUp');
const sf2TransposeDown = document.getElementById('sf2TransposeDown');
if (sf2TransposeUp) sf2TransposeUp.onclick = () => changeStringTranspose(1);
if (sf2TransposeDown) sf2TransposeDown.onclick = () => changeStringTranspose(-1);
function setPianoVolumeValue(value){
    pianoVolume = Math.max(0, Math.min(1, parseInt(value,10) / 100));
    updateSfEffectUI();
}
function setStringVolumeValue(value){
    stringVolume = Math.max(0, Math.min(1, parseInt(value,10) / 100));
    updateSfEffectUI();
}
const pianoVolRange = document.getElementById('pianoVolRange');
const stringVolRange = document.getElementById('stringVolRange');
if(pianoVolRange) pianoVolRange.oninput=e=>setPianoVolumeValue(e.target.value);
if(stringVolRange) stringVolRange.oninput=e=>setStringVolumeValue(e.target.value);
const settingsPianoVolRange = document.getElementById('settingsPianoVolRange');
const settingsStringVolRange = document.getElementById('settingsStringVolRange');
const settingsSustainSf1Range = document.getElementById('settingsSustainSf1Range');
const settingsSustainSf2Range = document.getElementById('settingsSustainSf2Range');
if(settingsPianoVolRange) settingsPianoVolRange.oninput=e=>setPianoVolumeValue(e.target.value);
if(settingsStringVolRange) settingsStringVolRange.oninput=e=>setStringVolumeValue(e.target.value);
if(settingsSustainSf1Range) settingsSustainSf1Range.oninput=e=>{
    sfEffectSettings.sf1.sustain = parseInt(e.target.value,10) / 100;
    applyCurrentSfEffects();
    updateSfEffectUI();
};
if(settingsSustainSf2Range) settingsSustainSf2Range.oninput=e=>{
    sfEffectSettings.sf2.fadeSec = Math.max(0.1, Math.min(10.0, parseFloat(e.target.value) || 10.0));
    updateSfEffectUI();
};
updateSfEffectUI();
applyCurrentSfEffects();
let _keyPresetBtnsCache = null;
let pendingWCount = wCount;
function whiteCountToTuts(count, offset){
    const totalWhite = ALL_WHITE.length;
    const whiteCount = Math.max(1, Math.min(totalWhite, Math.round(Number(count) || wCount)));
    const start = Math.max(0, Math.min(totalWhite - whiteCount, Math.round(Number(offset ?? viewOffset) || 0)));
    const end = Math.min(totalWhite - 1, start + whiteCount - 1);
    return Math.max(1, ALL_WHITE[end] - ALL_WHITE[start] + 1);
}
function refreshKeyPresetUI(){
    if(!_keyPresetBtnsCache || !_keyPresetBtnsCache.length){
        _keyPresetBtnsCache = document.querySelectorAll('.key-preset-btn');
    }
    const btns = _keyPresetBtnsCache;
    for(let i=0; i<btns.length; i++){
        const btn = btns[i];
        const keyCount = parseInt(btn.dataset.keyCount,10);
        btn.classList.toggle('active', keyCount === pendingWCount);
        btn.textContent = whiteCountToTuts(keyCount);
    }
    const visibleTuts = whiteCountToTuts(pendingWCount);
    const wCEl = document.getElementById('wC');
    const settingsWCEl = document.getElementById('settingsWC');
    if(wCEl) wCEl.innerText = visibleTuts;
    if(settingsWCEl) settingsWCEl.innerText = visibleTuts;
    const dirty = pendingWCount !== wCount;
    document.querySelectorAll('.key-apply-btn').forEach(btn => {
        btn.classList.toggle('pending', dirty);
        btn.textContent = dirty ? ('Apply ' + visibleTuts + ' Keys') : 'Keys Applied';
    });
    refreshWideKeyModeClass();
}
function stageVisibleKeyCount(count){
    pendingWCount = Math.max(3, Math.min(52, parseInt(count,10) || pendingWCount || wCount));
    refreshKeyPresetUI();
}
function applyVisibleKeyCount(){
    const next = Math.max(3, Math.min(52, parseInt(pendingWCount,10) || wCount));
    if(next === wCount){ refreshKeyPresetUI(); return; }
    document.body.classList.add('layout-changing');
    pointerNoteMap.forEach((note) => release(note, noteElementMap.get(note)));
    pointerNoteMap.clear();
    wCount = next;
    clampOffset();
    reflowPianoForKeyCount();
    if(!hasSwipeRange()){
        viewOffset = 0;
        swipeVisualOffset = 0;
        swipeVelocity = 0;
        swipeSetTransform(0);
    }
    // Synchronous on purpose. applyPianoHeight (reached via
    // reflowPianoForKeyCount above) resizes the board in THIS frame, but the
    // deferred updateKeyLayout() only recomputes --bk-face/--bk-cut in the
    // NEXT one -- so the chamfer spent a frame sized for the key count just
    // left, against the height already changed. That mismatch is what read as
    // the edge blinking out and re-forming, and Auto Camera made it constant
    // by retargeting the count repeatedly. Landing both in one frame removes
    // the intermediate state rather than trying to hide it.
    _updateKeyLayoutNow();
    refreshKeyPresetUI();
    // reflowPianoForKeyCount() reaches applyPianoHeight, which marks a
    // CONTINUOUS height drag -- true when a finger is on that slider, false
    // here. Clearing it in the same synchronous block means the renderer never
    // sees it, so the chamfer does not blink out and back over the 220ms this
    // class is up, which is what read as the bevel re-forming after a key-count
    // change. layout-changing itself stays: the cheap parts (gradient, inset
    // shadows) are still worth dropping for the rebuild.
    document.body.classList.remove('bk-face-lite');
    setTimeout(() => document.body.classList.remove('layout-changing', 'bk-face-lite'), 220);
}
document.querySelectorAll('.key-preset-btn').forEach(btn => btn.onclick=()=>stageVisibleKeyCount(btn.dataset.keyCount));
function stepVisibleKeyCount(delta){
    stageVisibleKeyCount(pendingWCount + delta);
}
document.getElementById('wU').onclick=()=>stepVisibleKeyCount(1);
document.getElementById('wD').onclick=()=>stepVisibleKeyCount(-1);
const settingsWU = document.getElementById('settingsWU');
const settingsWD = document.getElementById('settingsWD');
if(settingsWU) settingsWU.onclick=()=>stepVisibleKeyCount(1);
if(settingsWD) settingsWD.onclick=()=>stepVisibleKeyCount(-1);
[document.getElementById('wU'), document.getElementById('wD'), settingsWU, settingsWD].forEach(btn => {
    if(!btn) return;
    btn.addEventListener('keydown', event => {
        if(!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key)) return;
        event.preventDefault();
        stepVisibleKeyCount((event.key === 'ArrowUp' || event.key === 'ArrowRight') ? 1 : -1);
    });
});
const keyApplyBtn = document.getElementById('keyApply');
const settingsKeyApplyBtn = document.getElementById('settingsKeyApply');
if(keyApplyBtn) keyApplyBtn.onclick=applyVisibleKeyCount;
if(settingsKeyApplyBtn) settingsKeyApplyBtn.onclick=applyVisibleKeyCount;
refreshKeyPresetUI();
function changeTranspose(delta){
    transpose = Math.max(-12, Math.min(12, transpose + delta));
    document.getElementById('tVal').innerText = transpose;
    stopAllNotes();
    build();
}
document.getElementById('tUp').onclick = () => changeTranspose(1);
document.getElementById('tDown').onclick = () => changeTranspose(-1);
// Arrow-key transpose used to only fire while tUp/tDown itself had focus
// (click the tiny stepper button, then press arrows). Moved to a global
// binding in the main window keydown handler below, so it works the same
// way Space already does, without needing to focus anything first.
if(hRange){
    setPianoHeightPercent(hRange.value || 0);
}
function setAnimSizeValue(value){
    // Percentage of the current white-key width (0-100%), NOT an absolute
    // px value — see the comment on _effSize in drawFallingNote for why.
    animSize = Math.max(0, Math.min(100, parseInt(value,10) || 0));
    const range = document.getElementById('sizeRange');
    const settingsRange = document.getElementById('settingsSizeRange');
    const sv = document.getElementById('animSizeVal');
    const settingsSv = document.getElementById('settingsAnimSizeVal');
    if(range) range.value = animSize;
    if(settingsRange) settingsRange.value = animSize;
    if(sv) sv.textContent = animSize + '%';
    if(settingsSv) settingsSv.textContent = animSize + '%';
}
document.getElementById('sizeRange').oninput=e=>setAnimSizeValue(e.target.value);
const settingsSizeRange = document.getElementById('settingsSizeRange');
if(settingsSizeRange) settingsSizeRange.oninput=e=>setAnimSizeValue(e.target.value);
function setKeyDustIntensity(value){
    keyDustIntensity = Math.max(1, Math.min(10, Math.round(Number(value) || 2)));
    const range = document.getElementById('keyDustRange');
    const label = document.getElementById('keyDustVal');
    const settingsRange = document.getElementById('settingsKeyDustRange');
    const settingsLabel = document.getElementById('settingsKeyDustVal');
    // strikeLineSizeRange/Val: the actual "Line Size" control in the Strike
    // Line subpage — same underlying value (keyDustIntensity is the
    // internal/legacy name; the Tools-panel mirror above is already
    // labelled "Strike Thickness"), just now also reachable from where a
    // user would actually look for it instead of only in Tools.
    const lineSizeRange = document.getElementById('strikeLineSizeRange');
    const lineSizeLabel = document.getElementById('strikeLineSizeVal');
    if(range) range.value = keyDustIntensity;
    if(label) label.textContent = keyDustIntensity + 'px';
    if(settingsRange) settingsRange.value = keyDustIntensity;
    if(settingsLabel) settingsLabel.textContent = keyDustIntensity + 'px';
    if(lineSizeRange) lineSizeRange.value = keyDustIntensity;
    if(lineSizeLabel) lineSizeLabel.textContent = keyDustIntensity + 'px';
    document.documentElement.style.setProperty('--strike-line-thickness-base', keyDustIntensity + 'px');
    updateStrikeLineLine();
}
const keyDustRange = document.getElementById('keyDustRange');
if(keyDustRange) keyDustRange.addEventListener('input', () => setKeyDustIntensity(keyDustRange.value));
const settingsKeyDustRange = document.getElementById('settingsKeyDustRange');
if(settingsKeyDustRange) settingsKeyDustRange.addEventListener('input', () => setKeyDustIntensity(settingsKeyDustRange.value));
const strikeLineSizeRange = document.getElementById('strikeLineSizeRange');
if(strikeLineSizeRange) strikeLineSizeRange.addEventListener('input', () => setKeyDustIntensity(strikeLineSizeRange.value));
function setAnimationEnabled(value){
    isAnimOn = !!value;
    const track = document.getElementById('animTrack');
    if(track) track.classList.toggle('active', isAnimOn);
    const settingsTrack = document.getElementById('settingsAnimTrack');
    if(settingsTrack) settingsTrack.classList.toggle('active', isAnimOn);
}
const animTrack=document.getElementById('animTrack'); animTrack.onclick=()=>setAnimationEnabled(!isAnimOn);
const settingsAnimTrack = document.getElementById('settingsAnimTrack');
if(settingsAnimTrack) settingsAnimTrack.onclick=()=>setAnimationEnabled(!isAnimOn);
function setAnimRoundness(value){
    animRoundness = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
    animShape = 'rounded';
    // No explicit cache clear -- sprite keys include roundness, so old sprites
    // just age out of the LRU instead of forcing a full-cache wipe on every drag tick.
    const range = document.getElementById('animRoundRange');
    const label = document.getElementById('animRoundVal');
    if(range) range.value = animRoundness;
    if(label) label.textContent = animRoundness + '%';
}
function setAnimShape(shape){
    animShape = 'rounded';
    setAnimRoundness(shape === 'rect' ? 0 : animRoundness);
}
function setNoteOpacity(value){
    noteOpacity = Math.max(10, Math.min(100, Math.round(Number(value) || 100)));
    const range = document.getElementById('noteOpacityRange');
    const label = document.getElementById('noteOpacityVal');
    if(range) range.value = noteOpacity;
    if(label) label.textContent = noteOpacity + '%';
    if(Array.isArray(falling)) falling.forEach(f => { f.opacity = noteOpacity; });
}
function setNoteSpeed(value){
    noteSpeed = clampPercentValue(value, 100);
    const range = document.getElementById('noteSpeedRange');
    const label = document.getElementById('noteSpeedVal');
    if(range) range.value = noteSpeed;
    if(label) label.textContent = noteSpeed + '%';
}
document.getElementById('animRoundRange')?.addEventListener('input', e => setAnimRoundness(e.target.value));
document.getElementById('noteOpacityRange')?.addEventListener('input', e => setNoteOpacity(e.target.value));
document.getElementById('noteSpeedRange')?.addEventListener('input', e => setNoteSpeed(e.target.value));
setAnimRoundness(animRoundness);
setNoteOpacity(noteOpacity);
setNoteSpeed(noteSpeed);
let strikeLineColor = '#0099ff';
// Split Color for the Strike Line: an independent color-source toggle (left/
// right tuts split), same pattern as the Falling Notes/Particle Split Color.
// The line is one continuous bar, not per-note elements, so split mode renders
// it as a hard two-stop gradient at the split position instead of per-emitter
// colour swaps.
let strikeLineColorSplit = false;
let strikeLineLeftColor = '#0099ff';
let strikeLineRightColor = '#0099ff';
let strikeLineSplitTuts = 44;
// Follow Falling Notes: when on, this element borrows the Falling Notes
// colour scheme (single/double/gradient) instead of its own colour settings.
let keyColorFollowFallingNotes = false;
let dustColorFollowFallingNotes = false;
let strikeLineColorFollowFallingNotes = false;
let dustColor = '#ffffff';
let dustDoubleLeftColor = '#ffffff';
let dustDoubleRightColor = '#ffffff';
let dustDoubleSplitTuts = 44;
// Split Color (double) for Particles: an independent color-source toggle
// (left/right tuts split), same pattern as the Falling Notes Split Color.
// Orthogonal to every particle setting — it only swaps which colour feeds
// the plume/flare, nothing about physics changes.
let dustColorSplit = false;
function getDustSideForMidi(midi){
    // Follow Falling Notes: side assignment mirrors the Falling Notes split
    // (not the Particle Split Color) so grains land on the correct half.
    if(dustColorFollowFallingNotes){
        if(midi == null || !animColorSplit) return 0;
        return midiToTuts(midi) < animDoubleSplitTuts ? 0 : 1;
    }
    if(midi == null || !dustColorSplit) return 0;
    return midiToTuts(midi) < dustDoubleSplitTuts ? 0 : 1;
}
// Strike Reaction lives under Falling Notes (moved out of Particles), so its
// colour follows the Falling Notes colour. That means its Split Color side is
// derived from the ANIM Split Color slider — NOT the Particle Split Color.
function getAnimSideForMidi(midi){
    if(midi == null || !animColorSplit) return 0;
    return midiToTuts(midi) < animDoubleSplitTuts ? 0 : 1;
}
let strikeLineEnabled = true;
// Strike Reaction = the contact flare at the touch point. ON by default — it
// is the signature "note lands" response — with its own intensity slider.
let strikeReactionEnabled = true;
let strikeReactionIntensity = 100;
let strikeLineSmokeEnabled = true;
let strikeLineDustEnabled = true;
// First-visit defaults must stay in sync with applyFactoryDefaults() so the
// values shown on the initial slider render match what "Reset Defaults"
// applies: count 40%, size 50%, fade 40%. Count/Size sliders run 0-50, Fade
// runs 0-100; setParticleSetting keeps strikeLineDustAmount/Size in lockstep with
// particleCount/Size so they must start in sync too.
let strikeLineDustAmount = 40;
let strikeLineAuraSize = 100;
let strikeLineBrightness = 100;
let strikeLineOpacity = 100;
let strikeLineSaturation = 100;
let strikeLineDustSize = 50;
let particleCount = 40;
let particleSize = 50;
let particleOpacity = 100;
let particleSpeed = 30;
let particleTurbulence = 30;
let particleSaturation = 100;
let particleFade = 40;

var strikeLineMotion = 'static';
let motionSpeed = 50; // drives the strike aura's drift/billow speed
// "Motion Speed": 0..100 maps to a slow..fast aura billow duration. Higher = faster.
function setMotionSpeed(value){
    motionSpeed = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
    // aura billow duration: speed 0 -> 7.2s (slow), speed 100 -> 1.6s (fast)
    const durSec = (7.2 - (motionSpeed / 100) * 5.6).toFixed(2);
    document.documentElement.style.setProperty('--strike-line-smoke-motion', durSec + 's');
    // The aura's wave keyframes drive background-position under filter:blur(),
    // which cannot be composited -- at `linear` that is a full re-raster of a
    // viewport-wide blurred strip on EVERY frame, playing or not. Quantising it
    // is what buys the frames back, but a fixed step COUNT was the wrong knob:
    // this duration is user-controlled (1.6s..7.2s), so steps(24) meant only
    // 5.5 visible steps/sec at the default speed -- read as a ~10fps aura.
    // Lock the step RATE instead, so smoothness is identical at every Motion
    // Speed and only the count follows the duration. 20/sec puts each step at
    // 2-4px on the 190/300/240px tiles -- under the aura's own blur radius --
    // while still cutting repaints to a third of what `linear` demanded.
    const auraSteps = Math.max(8, Math.round(Number(durSec) * 20));
    document.documentElement.style.setProperty('--strike-line-smoke-tf', 'steps(' + auraSteps + ',end)');
    // The stylesheet's rule is body.strike-line-motion-off (see the
    // `animation:none !important` block next to the strikeLineWaveFlow
    // keyframes). This toggled strikeLine-motion-off instead, so nothing
    // ever matched and Motion Speed = 0 silently failed to stop the aura
    // here — while Visualizer and Learn Song, which already spell it the
    // CSS way, did stop it. Same setting, different behaviour per mode.
    document.body.classList.toggle('strike-line-motion-off', motionSpeed <= 0);
    const range = document.getElementById('strikeLineMotionRange');
    const label = document.getElementById('strikeLineMotionVal');
    if(range && range.value !== String(motionSpeed)) range.value = String(motionSpeed);
    if(label) label.textContent = motionSpeed + '%';
}
setKeyDustIntensity(keyDustIntensity);
refreshKeyDustColorCache();

let perfHudEnabled = false;
let perfFps = 0;
let perfFrames = 0;
let perfLastTs = performance.now();
let perfRafId = null;
function updatePerfHudText(){
    const hud = document.getElementById('perfHud');
    if (!hud) return;
    const fpsEl = hud.querySelector('.perf-fps');
    if (fpsEl) fpsEl.textContent = `${Math.round(perfFps || 0)} FPS`;
}
function perfLoop(ts){
    if (!perfHudEnabled) { perfRafId = null; return; }
    perfFrames++;
    const elapsed = ts - perfLastTs;
    if (elapsed >= 700) {
        perfFps = perfFrames * 1000 / elapsed;
        perfFrames = 0;
        perfLastTs = ts;
        updatePerfHudText();
    }
    perfRafId = requestAnimationFrame(perfLoop);
}
function setPerformanceMonitor(on){
    perfHudEnabled = !!on;
    const hud = document.getElementById('perfHud');
    const track = document.getElementById('perfTrack');
    if (track) track.classList.toggle('active', perfHudEnabled);
    if (hud) hud.classList.toggle('show', perfHudEnabled);
    if (perfHudEnabled) {
        perfFrames = 0;
        perfLastTs = performance.now();
        updatePerfHudText();
        if (!perfRafId) perfRafId = requestAnimationFrame(perfLoop);
    }
}
const perfTrack = document.getElementById('perfTrack');
if (perfTrack) perfTrack.onclick = () => setPerformanceMonitor(!perfHudEnabled);
window.addEventListener('online', updatePerfHudText);
window.addEventListener('offline', updatePerfHudText);

const STORAGE_RESET_KEYS = ['papiano_memory_autosave_v2', 'papiano_memory_options_v2', 'papiano_settings'];
const STORAGE_SCHEMA_VERSION = 2;
// Guards calls into the Chord Detector (defined further down the file) that
// can happen before its variables/functions exist yet — the very first
// applyFactoryDefaults() call runs at boot, ahead of that section. Flipped to
// true once the chord section has finished initializing.
var _chordSystemReady = false;

// Note Style — the MATERIAL a falling note is rendered with. Independent of
// Colour Mode (see animColorModeBtns below): any Style can be driven by any
// Mode's colour.
const animModeBtns = {
    mSingle:'single', mOutline:'outline', mMidnight:'midnight', mGlass:'glass', mChrome:'chrome'
};
// Colour Mode — decides WHAT colour a note gets. Split Color ('double') is
// still its own boolean underneath (animColorSplit) since a whole row-
// visibility system already keys off it; these buttons just present it as
// one mutually-exclusive choice alongside Single/Gradient instead of a
// separate toggle.
const animColorModeBtns = { mModeSingle:'single', mModeDouble:'double', mModeGradient:'gradient', mModeRainbow:'rainbow' };
const NO_COLOR="__none";
const colors=[NO_COLOR,"#ffffff","#00e5ff","#38bdf8","#2979ff","#651fff","#8b5cf6","#ff4081","#ff2d75","#ff1744","#ff6d00","#f7b733","#ffea00","#b2ff59","#00e676"];
// Piano Position/Height/Black Key Width default to a portrait-tuned set
// (lifted, shorter, slightly narrower black keys) for the
// MIDI-keyboard player who barely looks at the on-screen keys -- the
// extra height/width just eats into the falling-notes area otherwise.
// Landscape keeps the existing, larger, full-size defaults. Driven by the
// real device orientation (matchMedia), not a window-size heuristic --
// deliberately NOT reintroducing the old adaptive floor/ceiling system
// this replaced (2026-08-03's "harga mati 40%" call still holds for
// LANDSCAPE; this only adds a separate portrait branch on top of it).
function isPortraitOrientation(){
    return !!(window.matchMedia && window.matchMedia('(orientation: portrait)').matches);
}
function defaultPianoLiftForOrientation(){ return isPortraitOrientation() ? 18 : 0; }
function defaultBlackKeyWidthForOrientation(){ return isPortraitOrientation() ? 110 : 120; }
function getDefaultPianoHeightPercent(){
    // First load and Reset Defaults both call this, so keeping it one
    // function is what keeps them in sync.
    return isPortraitOrientation() ? 15 : 40;
}
function applyFactoryDefaults(clearSavedState){
    wCount = 52;
    pendingWCount = 52;
    viewOffset = 0;
    transpose = 0;
    document.getElementById('tVal').innerText = 0;
    currentPianoHeightPx = '';
    setPianoHeightPercent(getDefaultPianoHeightPercent());
    setPianoScalePercent();
    setBlackKeyWidthPercent(defaultBlackKeyWidthForOrientation());
    setBlackKeyHeightPercent(60);
    setBlackKeyEdgeDepthPercent(40);
    setPianoVisibilityPercent(100);
    applyPianoLift(defaultPianoLiftForOrientation(), true);
    setAnimSizeValue(90);
    setAnimColor('#0099ff');
    setAnimColorMode('single');
    setAnimDoubleLeftColor('#0099ff');
    setAnimDoubleRightColor('#0099ff');
    setAnimDoubleSplitTuts(44);
    setAnimKeyShade(true);
    gradientColors = ['#0099ff', '#00e0a0', '#ffae00'];
    setGradientColorCount(2);
    setGradientIntensity(70);
    setGradientAxis('horizontal');
    setAnimModeById('mSingle');
    if(typeof clearEffectSpriteCache === 'function') clearEffectSpriteCache();
    setKeyDustIntensity(3);
    setStrikeLineColor('#0099ff');
    setStrikeLineColorSplit(false);
    setStrikeLineLeftColor('#0099ff');
    setStrikeLineRightColor('#0099ff');
    setStrikeLineSplitTuts(44);
    setStrikeLineColorFollowFallingNotes(false);
    setKeyColorFollowFallingNotes(false);
    setDustColor('#0099ff');
    setDustColorSplit(false);
    setDustColorFollowFallingNotes(false);
    setDustDoubleLeftColor('#0099ff');
    setDustDoubleRightColor('#0099ff');
    setDustDoubleSplitTuts(44);
    setStrikeLineMotion('static');
    setMotionSpeed(50);
    setDustBlendMode('solid');
    setStrikeLineAuraSize(100);
    setStrikeLineVisualSetting('brightness', 100);
    setStrikeLineVisualSetting('opacity', 100);
    setStrikeLineVisualSetting('saturation', 100);
    setParticleSetting('count', 40);
    setParticleSetting('size', 50);
    setParticleSetting('opacity', 100);
    setParticleSetting('speed', 30);
    setParticleSetting('turbulence', 30);
    setParticleSetting('saturation', 100);
    setParticleSetting('fade', 40);
    setStrikeLineFx('strikeLine', true);
    setStrikeLineFx('dust', true);
    setStrikeLineFx('strikeReaction', true);
    setStrikeReactionIntensity(100);
    setAnimRoundness(70);
    setNoteOpacity(100);
    setNoteSpeed(75);
    setAnimShape('rounded');
    setWhiteKeyColor(DEFAULT_ACCENT_WHITE);
    setBlackKeyColor(DEFAULT_ACCENT_BLACK);
    setKeyGlowEnabled(false);
    setKeyGlowIntensity(50);
    setNoteGlowEnabled(false);
    setNoteGlowIntensity(200);
    setOctaveLinesEnabled(true);
    setChordTextScale(85);
    setKeyLabelScale(100);
    // Matches the sfEffectSettings initialiser above — reverb ships OFF. This
    // second, hardcoded copy of the defaults is what actually runs at startup
    // and on "reset to defaults", so changing only the initialiser left reverb
    // at 0.30 in a live page despite the source reading 0.00.
    sfEffectSettings.sf1 = {sustain:1.00, reverb:0.00};
    sfEffectSettings.sf2 = {fadeSec:5.00, reverb:0.00, transpose:0};
    currentSf = 'grandPiano';
    currentStringSf = 'strViolin';
    // Matches the initialiser above. This second hardcoded copy is what runs
    // on "reset to defaults", so it has to move in step or a reset would
    // silently jump the output +3.9 dB.
    pianoVolume = 0.80;
    stringVolume = 0.80;
    setManualSustain(false);
    setMidiSustainPedal(false);
    stringRangeLeft = 21;
    stringRangeRight = 108;
    stringEnabled = false;
    setStringLayerEnabled(false, true);
    updateSoundfontPickerUI();
    updateSfEffectUI();
    applyCurrentSfEffects();
    setLabelMode(IS_TOUCH_DEVICE ? 'octave' : 'qwerty');
    setPianoTheme('default');
    setChordDisplayColors(DEFAULT_CHORD_COLORS);
    // Chord Detector shipping default is 'expert' — full 11/13/#11/b13
    // extensions and altered dominants, but no omit chords. Matches the
    // .active button in the markup and keeps parity with multiplayer, which
    // is locked to the same tier. Guarded: this call is a no-op on the very
    // first boot before the chord section below has declared chordMode /
    // _chordEnabled / setChordMode.
    if(_chordSystemReady) setChordMode('expert');
    setAutoVelocity(false);
    setAutoVelocityMode('mix');
    if(typeof window.applyGraphicQuality === 'function') window.applyGraphicQuality('auto', true);
    if(clearSavedState) clearStoredSettings();
    setTimeout(() => { resize(); build(); refreshKeyPresetUI(); }, 50);
}

const colorPadInstances = new Map();
function clampColorPadValue(value, min, max){
    return Math.min(max, Math.max(min, value));
}
function colorPadToHex(value){
    return Math.round(clampColorPadValue(value, 0, 255)).toString(16).padStart(2, '0');
}
function colorPadHexToRgb(hex){
    return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}
function colorPadRgbToHex(rgb){
    return `#${colorPadToHex(rgb[0])}${colorPadToHex(rgb[1])}${colorPadToHex(rgb[2])}`;
}
function colorPadHslToRgb(hue, saturation, lightness){
    const c = (1 - Math.abs(2 * lightness - 1)) * saturation;
    const x = c * (1 - Math.abs((hue / 60) % 2 - 1));
    const m = lightness - c / 2;
    let red = 0;
    let green = 0;
    let blue = 0;
    if(hue < 60){ red = c; green = x; }
    else if(hue < 120){ red = x; green = c; }
    else if(hue < 180){ green = c; blue = x; }
    else if(hue < 240){ green = x; blue = c; }
    else if(hue < 300){ red = x; blue = c; }
    else{ red = c; blue = x; }
    return [(red + m) * 255, (green + m) * 255, (blue + m) * 255];
}
function colorPadHsvToRgb(hue, sat, val){
    hue = ((hue % 360) + 360) % 360;
    sat = Math.max(0, Math.min(1, sat));
    val = Math.max(0, Math.min(1, val));
    const c = val * sat;
    const x = c * (1 - Math.abs((hue / 60) % 2 - 1));
    const m = val - c;
    let r = 0, g = 0, b = 0;
    if(hue < 60){ r = c; g = x; }
    else if(hue < 120){ r = x; g = c; }
    else if(hue < 180){ g = c; b = x; }
    else if(hue < 240){ g = x; b = c; }
    else if(hue < 300){ r = x; b = c; }
    else{ r = c; b = x; }
    return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}
function colorPadRgbToHsv(rgb){
    const r = rgb[0] / 255, g = rgb[1] / 255, b = rgb[2] / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const diff = max - min;
    let hue = 0;
    if(diff !== 0){
        if(max === r) hue = ((g - b) / diff) % 6;
        else if(max === g) hue = (b - r) / diff + 2;
        else hue = (r - g) / diff + 4;
        hue *= 60;
        if(hue < 0) hue += 360;
    }
    const sat = max === 0 ? 0 : diff / max;
    return { h: hue, s: sat, v: max };
}
function updateColorPadValue(id, color){
    const instance = colorPadInstances.get(id);
    if(!instance) return;
    const nextColor = normalizeHexColor(color) || '#ffffff';
    const hsv = colorPadRgbToHsv(colorPadHexToRgb(nextColor));
    if(typeof instance.applyHsv === 'function'){
        instance.applyHsv(hsv.h, hsv.s, hsv.v, false);
    }
}
function mountColorPad(id, label, initialColor, handler, resetColor){
    const host = document.getElementById(id);
    if(!host) return;
    const resetValue = normalizeHexColor(resetColor) || '#ffffff';
    const startColor = normalizeHexColor(initialColor) || resetValue;
    host.classList.add('color-pad-host');
    host.innerHTML = `
        <div class="color-pad-widget">
            <div class="color-pad-head"><span>${label}</span><span class="color-pad-value"></span></div>
            <div class="color-pad-sv" role="slider" aria-label="${label}" tabindex="0"><div class="color-pad-dot"></div></div>
            <div class="color-pad-hue" role="slider" aria-label="${label} hue" tabindex="0"><div class="color-pad-hue-dot"></div></div>
            <div class="color-pad-actions"><span class="color-pad-chip"></span><button class="color-pad-reset" type="button">Reset</button></div>
        </div>`;
    const pad = host.querySelector('.color-pad-sv');
    const dot = host.querySelector('.color-pad-dot');
    const hueBar = host.querySelector('.color-pad-hue');
    const hueDot = host.querySelector('.color-pad-hue-dot');
    const value = host.querySelector('.color-pad-value');
    const reset = host.querySelector('.color-pad-reset');
    const instance = { host, pad, dot, hueBar, hueDot, value, hue:0, sat:0, val:1, color:startColor, handler };
    colorPadInstances.set(id, instance);
    const renderSvBackground = () => {
        const hueHex = colorPadRgbToHex(colorPadHslToRgb(instance.hue, 1, 0.5));
        pad.style.background =
            `linear-gradient(to bottom, rgba(0,0,0,0) 0%, #000 100%),`+
            `linear-gradient(to right, #fff 0%, ${hueHex} 100%)`;
    };
    const composeColor = () => colorPadRgbToHex(colorPadHsvToRgb(instance.hue, instance.sat, instance.val));
    const syncUI = (emit) => {
        const color = composeColor();
        instance.color = color;
        host.style.setProperty('--pad-color', color);
        dot.style.left = `${instance.sat * 100}%`;
        dot.style.top = `${(1 - instance.val) * 100}%`;
        hueDot.style.left = `${(instance.hue / 360) * 100}%`;
        renderSvBackground();
        value.textContent = color;
        if(emit && typeof handler === 'function'){
            _activeColorPadIntent = 'user';
            try { handler(color); } finally { _activeColorPadIntent = null; }
        }
    };
    const applySV = (x, y, emit) => {
        instance.sat = clampColorPadValue(x, 0, 1);
        instance.val = 1 - clampColorPadValue(y, 0, 1);
        syncUI(emit);
    };
    const applyHue = (x, emit) => {
        instance.hue = clampColorPadValue(x, 0, 1) * 360;
        syncUI(emit);
    };
    instance.applyHsv = (h, s, v, emit) => {
        instance.hue = ((h % 360) + 360) % 360;
        instance.sat = clampColorPadValue(s, 0, 1);
        instance.val = clampColorPadValue(v, 0, 1);
        syncUI(emit);
    };
    // === Pointer-driven drag with global capture ===
    // Use a window-level listener while active so finger movement that leaves
    // the pad area (the most common "can't drag" case) is still tracked;
    // always preventDefault so the browser doesn't cancel it into a scroll.
    const makeDragger = (target, applyFromXY) => {
        let pid = -1;
        const onDown = event => {
            if(event.button !== undefined && event.button !== 0) return;
            pid = event.pointerId;
            try { target.setPointerCapture(pid); } catch(e){}
            event.preventDefault();
            applyFromXY(event.clientX, event.clientY);
            window.addEventListener('pointermove', onMove, { passive:false });
            window.addEventListener('pointerup', onUp, true);
            window.addEventListener('pointercancel', onUp, true);
        };
        const onMove = event => {
            if(event.pointerId !== pid) return;
            event.preventDefault();
            applyFromXY(event.clientX, event.clientY);
        };
        const onUp = event => {
            if(event.pointerId !== pid) return;
            try { target.releasePointerCapture(pid); } catch(e){}
            pid = -1;
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp, true);
            window.removeEventListener('pointercancel', onUp, true);
        };
        target.addEventListener('pointerdown', onDown);
    };
    makeDragger(pad, (cx, cy) => {
        const rect = pad.getBoundingClientRect();
        applySV((cx - rect.left) / rect.width, (cy - rect.top) / rect.height, true);
    });
    makeDragger(hueBar, (cx) => {
        const rect = hueBar.getBoundingClientRect();
        applyHue((cx - rect.left) / rect.width, true);
    });
    pad.addEventListener('keydown', event => {
        const step = event.shiftKey ? 0.08 : 0.03;
        let s = instance.sat;
        let v = instance.val;
        if(event.key === 'ArrowLeft') s -= step;
        else if(event.key === 'ArrowRight') s += step;
        else if(event.key === 'ArrowUp') v += step;
        else if(event.key === 'ArrowDown') v -= step;
        else if(event.key === 'Home'){ s = 0; v = 1; }
        else if(event.key === 'End'){ s = 1; v = 0; }
        else return;
        event.preventDefault();
        instance.sat = clampColorPadValue(s, 0, 1);
        instance.val = clampColorPadValue(v, 0, 1);
        syncUI(true);
    });
    hueBar.addEventListener('keydown', event => {
        const step = event.shiftKey ? 18 : 6;
        let h = instance.hue;
        if(event.key === 'ArrowLeft') h -= step;
        else if(event.key === 'ArrowRight') h += step;
        else return;
        event.preventDefault();
        instance.hue = ((h % 360) + 360) % 360;
        syncUI(true);
    });
    reset.addEventListener('click', () => {
        updateColorPadValue(id, resetValue);
        if(typeof handler === 'function'){
            _activeColorPadIntent = 'reset';
            try { handler(resetValue); } finally { _activeColorPadIntent = null; }
        }
    });
    updateColorPadValue(id, startColor);
}
// Global intent indicator. null saat programmatic (load settings, defaults),
// 'user' saat user drag/click/keyboard di color pad, 'reset' saat user klik Reset.
var _activeColorPadIntent = null;
// === Custom user colour vs seat colour (multiplayer) =======================
// The seat colour is only the DEFAULT identity inside a room. Once the user
// picks their own colour in the Visual panel (INCLUDING WHITE), the user's
// choice WINS for their local view. Reset/preset returns to the seat colour.
// Other players still see this user's seat colour on their screens.
//
// Distinguish "default state" from "user explicitly chose a colour". White can
// also be chosen as custom. The only way back to the seat colour is the Reset
// button (which sets NO_COLOR).
//
// MUST be declared here, BEFORE the first applyFactoryDefaults(false) call
// below — these are `var` (function/script-scope hoisted), so a `var x = ...`
// statement anywhere later in this same top-level script re-runs as a plain
// assignment when execution reaches it. Previously these were declared far
// below (near setWhiteKeyColor/setBlackKeyColor), which meant the boot call's
// setWhiteKeyColor('#0099ff') correctly set customWhiteKey = '#0099ff', only
// for `var customWhiteKey = null;` to silently stomp it back to null moments
// later when the script continued running past that line — leaving the key
// visually blue (CSS var already applied) while its color pad swatch fell
// back to white, and leaving Save/Preset with the wrong "not custom" state.
var customWhiteKey = null;   // null = not custom yet (use seat) ; hex string = user-chosen colour
var customBlackKey = null;
var customAnimNote = null;
var customChordColor = null;

const DEFAULT_CHORD_COLORS = { primary:'#0099ff', secondary:'#0099ff' };
let chordDisplayColors = Object.assign({}, DEFAULT_CHORD_COLORS);
function setChordDisplayColors(colors){
    const source = colors || {};
    const primary = normalizeHexColor(source.primary) || DEFAULT_CHORD_COLORS.primary;
    const secondary = normalizeHexColor(source.secondary) || DEFAULT_CHORD_COLORS.secondary;
    chordDisplayColors = { primary, secondary };
    if(_activeColorPadIntent === 'user'){
        customChordColor = primary;
    } else if(_activeColorPadIntent === 'reset'){
        customChordColor = null;
    } else {
        // restore: treated as custom when it isn't the default white
        customChordColor = (primary.toLowerCase() !== '#ffffff' || secondary.toLowerCase() !== '#ffffff') ? primary : null;
    }
    document.documentElement.style.setProperty('--chord-primary', primary);
    document.documentElement.style.setProperty('--chord-secondary', secondary);
    document.documentElement.style.setProperty('--chord-glow', hexToRgbaString(primary, 0.36));
    updateColorPadValue('chordPrimaryColor', primary);
    updateColorPadValue('chordSecondaryColor', secondary);
    syncColorPadsToEffectiveColors();
}
function bindChordColorControls(){
    mountColorPad('chordPrimaryColor', 'Primary', chordDisplayColors.primary, color => setChordDisplayColors(Object.assign({}, chordDisplayColors, { primary: color })), DEFAULT_CHORD_COLORS.primary);
    mountColorPad('chordSecondaryColor', 'Secondary', chordDisplayColors.secondary, color => setChordDisplayColors(Object.assign({}, chordDisplayColors, { secondary: color })), DEFAULT_CHORD_COLORS.secondary);
    const reset = document.getElementById('chordColorReset');
    if(reset) reset.addEventListener('click', () => setChordDisplayColors(DEFAULT_CHORD_COLORS));
    setChordDisplayColors(chordDisplayColors);
}

function getCurrentSettings() {
    return {
        wCount,
        transpose,
        animSize,
        labelMode,
        sustainLevel,
        manualSustainEnabled,
        sfEffectSettings,
        pianoVolume,
        stringVolume,
        stringEnabled,
        stringRangeLeft,
        stringRangeRight,
        stringRangeSettingsVersion: STRING_RANGE_SETTINGS_VERSION,
        fxSettingsVersion: FX_SETTINGS_VERSION,
        currentStringSf,
        reverbLevel: 0,
        reverbEnabled: false,
        isAnimOn,
        material: animStyle,
        animColorMode,
        gradientColorCount,
        gradientColors,
        gradientIntensity,
        gradientAxis,
        animShape,
        animRoundness,
        noteOpacity,
        noteSpeed,
        keyDustIntensity,
        strikeLineColor,
        strikeLineColorSplit,
        strikeLineLeftColor,
        strikeLineRightColor,
        strikeLineSplitTuts,
        strikeLineColorFollowFallingNotes,
        keyColorFollowFallingNotes,
        dustColor,
        dustColorSplit,
        dustColorFollowFallingNotes,
        dustDoubleLeftColor,
        dustDoubleRightColor,
        dustDoubleSplitTuts,
        strikeLineEnabled,
        strikeReactionEnabled,
        strikeReactionIntensity,
        strikeLineDustEnabled,
        strikeLineDustAmount,
        strikeLineAuraSize,
        strikeLineBrightness,
        strikeLineOpacity,
        strikeLineSaturation,
        strikeLineDustSize,
        particleCount,
        particleSize,
        particleOpacity,
        particleSpeed,
        particleTurbulence,
        particleSaturation,
        particleFade,
        strikeLineMotion,
        motionSpeed,
        dustBlendMode,
        currentGlassColor,
        // Stored as the plain percent. The old Math.max(6, ...) floor existed
        // only to clear the restore side's "> 5" guard, which is gone.
        pianoHeight: normalizePianoHeightPercent(document.getElementById('hRange').value),
        blackKeyWidthPercent,
        blackKeyHeightPercent,
        blackKeyEdgeDepthPercent,
        pianoVisibilityPercent,
        pianoLiftPercent,
        accentWhite: getComputedStyle(document.documentElement).getPropertyValue('--accent-white').trim(),
        accentBlack: getComputedStyle(document.documentElement).getPropertyValue('--accent-black').trim(),
        animColor: getComputedStyle(document.documentElement).getPropertyValue('--anim-color').trim(),
        animColorSplit,
        animDoubleLeftColor,
        animDoubleRightColor,
        animDoubleSplitTuts,
        animKeyShade,
        currentSf,
        perfHudEnabled,
        performanceMode,
        graphicQuality,
        bgFitMode: typeof bgFitMode !== 'undefined' ? bgFitMode : 'cover',
        bgPositionMode: typeof bgPositionMode !== 'undefined' ? bgPositionMode : 'center',
        bgOpacity: Number(document.getElementById('bgOpacityRange')?.value ?? 100),
        bgDim: Number(document.getElementById('bgDimRange')?.value ?? 0),
        bgBlur: Number(document.getElementById('bgBlurRange')?.value ?? 0),
        chordDisplayColors: typeof chordDisplayColors !== 'undefined' ? chordDisplayColors : null,
        keyGlowEnabled,
        keyGlowIntensity,
        noteGlowEnabled,
        noteGlowIntensity,
        octaveLinesEnabled,
        chordTextScale,
        keyLabelScale,
        // Persist the explicit "user chose this colour" intent so a chosen
        // colour (even white) restores correctly instead of collapsing back to
        // the room seat colour on load.
        customAnimNote: typeof customAnimNote !== 'undefined' ? (customAnimNote || null) : null,
        customWhiteKey: typeof customWhiteKey !== 'undefined' ? (customWhiteKey || null) : null,
        customBlackKey: typeof customBlackKey !== 'undefined' ? (customBlackKey || null) : null,
        customChordColor: typeof customChordColor !== 'undefined' ? (customChordColor || null) : null,
        // Settings outside the Visual panel (top bar) so a preset is complete.
        metronome: (typeof window.getMetronomeState === 'function') ? window.getMetronomeState() : undefined,
        pianoTheme,
        // Chord Detector (off/basic/pro) — was previously self-persisted via
        // its own localStorage keys, outside Save Preset / Load Preset /
        // Reset Defaults. Included here so it's part of the same preset.
        // New field name for the 5-tier vocabulary. The legacy field
        // `chordDetectorMode` used the tokens 'basic'/'pro' with a
        // different meaning, so we can't disambiguate an old preset from a
        // new one at the token level — a rename is the only clean fix.
        // applySettings below reads the new field first and falls back to
        // `chordDetectorMode` with a migration table for pre-rollout
        // presets. See _migrateLegacyChordMode() further down.
        chordDetectorTier: _chordSystemReady ? (!_chordEnabled ? 'off' : chordMode) : undefined,
        // Was self-persisting to its own localStorage key only, so it never
        // followed a Save Preset / Load Preset round-trip (or a different
        // browser/device on solo's cloud presets) — see setAutoVelocity.
        autoVelocityEnabled: !!autoVelocityEnabled,
        autoVelocityMode: autoVelocityMode,
    };
}

const SF2_BASE = 'https://d2cqwdxh6v3wut.cloudfront.net/soundfonts/pack/';
const SF_URLS = {
    grandPiano:   SF2_BASE + 'grandPiano.sf2',
    stagePiano:   SF2_BASE + 'stagePiano.sf2',
    sal1: SF2_BASE + 'salamander.sf2',
    atmosGrand:   SF2_BASE + 'atmosGrand.sf2',
    pfBright:     SF2_BASE + 'pfBright.sf2',
    pfSoft:       SF2_BASE + 'pfSoft.sf2',
    pfEPiano:     SF2_BASE + 'pfEPiano.sf2',
    strViolin:    SF2_BASE + 'strViolin.sf2',
    strCello:     SF2_BASE + 'strCello.sf2',
    strEnsemble:  SF2_BASE + 'strEnsemble.sf2',
    strSlow:      SF2_BASE + 'strSlow.sf2',
    strPizz:      SF2_BASE + 'strPizz.sf2',
    orcHorn:      SF2_BASE + 'orcHorn.sf2',
    orcTrumpet:   SF2_BASE + 'orcTrumpet.sf2',
    orcTrombone:  SF2_BASE + 'orcTrombone.sf2',
    orcFlute:     SF2_BASE + 'orcFlute.sf2',
    orcTimpani:   SF2_BASE + 'orcTimpani.sf2',
    othNylon:     SF2_BASE + 'othNylon.sf2',
    othSteel:     SF2_BASE + 'othSteel.sf2',
    othBass:      SF2_BASE + 'othBass.sf2',
    othVibraphone:SF2_BASE + 'othVibraphone.sf2',
    othMarimba:   SF2_BASE + 'othMarimba.sf2',
    othChoir:     SF2_BASE + 'othChoir.sf2',
    othOrgan:     SF2_BASE + 'othOrgan.sf2'
};

function applySettings(s) {
    if (!s) return;
    // Settings saved by the old particle/strike engine: drop the calibration
    // sliders so the new engine's defaults apply (the old percentages mapped
    // to a different visual scale and looked nearly invisible on the rebuilt
    // engine). Colours and toggles are the user's intent — keep them.
    if (Number(s.fxSettingsVersion || 0) < FX_SETTINGS_VERSION) {
        s = Object.assign({}, s);
        ['particleCount','particleSize','particleOpacity','particleSpeed','particleTurbulence','particleFade',
         'strikeLineBrightness','strikeLineOpacity','strikeLineAuraSize','strikeLineDustSize','strikeLineDustAmount','dustBlendMode',
         'dustColor','motionSpeed','strikeReactionEnabled','strikeReactionIntensity'].forEach(k => { delete s[k]; });
    }
    try {
        const _wc = Number(s.wCount);
        wCount = (Number.isFinite(_wc) && _wc >= 3 && _wc <= 52) ? _wc : 52;
        pendingWCount = wCount;
        if (s.transpose !== undefined) { transpose = Math.max(-12, Math.min(12, s.transpose)); document.getElementById('tVal').innerText = transpose; }
        if (s.animSize !== undefined) {
            // Legacy presets stored Note Size as an absolute px value capped
            // at 20 (the old slider's hard max); the new slider is a 0-100%
            // value relative to the current key width. A stored value at or
            // under that old ceiling is unambiguously legacy, so scale it up
            // onto the new range instead of misreading "18" as "18%".
            const rawSize = Number(s.animSize);
            const migratedSize = Number.isFinite(rawSize) && rawSize <= 20 ? Math.round((rawSize / 20) * 100) : rawSize;
            setAnimSizeValue(migratedSize);
        }
        if (s.labelMode !== undefined) {
            labelMode = ['off','note','qwerty','octave','number','solfege','japanese'].includes(s.labelMode) ? s.labelMode : 'octave';
            document.querySelectorAll('.label-option-vertical').forEach(opt => {
                opt.classList.toggle('active', opt.dataset.mode === labelMode);
            });
        }
        if (s.sfEffectSettings) {
            if (s.sfEffectSettings.sf1) sfEffectSettings.sf1 = Object.assign(sfEffectSettings.sf1, s.sfEffectSettings.sf1);
            if (s.sfEffectSettings.sf2) {
                const loadedSf2 = Object.assign({}, s.sfEffectSettings.sf2);
                if (loadedSf2.fadeSec === undefined && loadedSf2.sustain !== undefined) loadedSf2.fadeSec = Math.max(0.1, Math.min(10.0, loadedSf2.sustain * 10.0));
                delete loadedSf2.sustain;
                sfEffectSettings.sf2 = Object.assign(sfEffectSettings.sf2, loadedSf2);
            }
        } else if (s.sustainLevel !== undefined) {
            sfEffectSettings.sf1.sustain = s.sustainLevel;
        }
        if (s.pianoVolume !== undefined) pianoVolume = Math.min(1, s.pianoVolume); else if (s.masterVolume !== undefined) pianoVolume = Math.min(1, s.masterVolume);
        if (s.stringVolume !== undefined) stringVolume = s.stringVolume;
        setManualSustain(!!s.manualSustainEnabled);
        if (Number(s.stringRangeSettingsVersion || 0) < STRING_RANGE_SETTINGS_VERSION) {
            stringRangeLeft = 21;
            stringRangeRight = 108;
        } else {
            if (s.stringRangeLeft !== undefined) stringRangeLeft = s.stringRangeLeft;
            if (s.stringRangeRight !== undefined) stringRangeRight = s.stringRangeRight;
        }
        updateStringRangeUI();
        stringEnabled = !!s.stringEnabled;
        updateSfEffectUI();
        applyCurrentSfEffects();
        if (s.isAnimOn !== undefined) { setAnimationEnabled(s.isAnimOn); }
        // Restore the note colour using the saved explicit intent when present
        // (new presets store customAnimNote): a saved colour — including white —
        // is re-applied as the user's choice, while "no custom" falls back to
        // the seat/default colour. Older presets keep the legacy value path.
        if (s.customAnimNote !== undefined) {
            _activeColorPadIntent = s.customAnimNote ? 'user' : 'reset';
            try { setAnimColor(s.customAnimNote || '#ffffff'); } finally { _activeColorPadIntent = null; }
        } else {
        setAnimColor(s.animColor !== undefined ? s.animColor : '#ffffff');
        }
        setAnimDoubleLeftColor(s.animDoubleLeftColor !== undefined ? s.animDoubleLeftColor : '#0099ff');
        setAnimDoubleRightColor(s.animDoubleRightColor !== undefined ? s.animDoubleRightColor : '#0099ff');
        setAnimDoubleSplitTuts(s.animDoubleSplitTuts !== undefined ? s.animDoubleSplitTuts : 44);
        setAnimKeyShade(s.animKeyShade !== undefined ? s.animKeyShade : true);
        if (typeof clearEffectSpriteCache === 'function') clearEffectSpriteCache();
        // Style (material) and Colour Mode used to be crammed into one
        // "animStyle" value. Old presets are migrated onto the split model:
        // every legacy style alias resolves to one of the 4 current
        // materials, and a few of them (rainbow/double) also imply a Colour
        // Mode rather than a Style.
        const LEGACY_STYLE = {
            default:'single', single:'single', metalic:'single', crystal3d:'single', clean:'single', cleanNeon:'single',
            rainbow2:'single', rainbowV2:'single', rainbow:'single', glow:'single', neon:'single', double:'single',
            gradient:'single',
            // Batik (Parang Rusak) is retired -- deleted for looking bad and
            // costing too much (see drawFallingNote's history). No visual
            // replacement, so it resolves the same way the other flat/solid
            // retirees above do.
            batik:'single',
            // Retired materials (Crystal/Aura/Test 1/Test 2, the first
            // PBR-style batch, and the second Bronze/Clarity/Copper/Crystal
            // batch) all resolve saved presets onto Glass, the current
            // closest replacement, instead of silently falling back to
            // Default.
            glass:'glass', glassmorphism:'glass', holographic:'glass', glossy:'glass',
            metallic:'glass', flake:'glass', liquid:'glass', liquid1:'glass', liquid2:'glass',
            bronze:'glass', clarity:'glass', copper:'glass', crystal:'glass'
        };
        // The legacy "rainbow" STYLES were per-key hues — that concept now
        // lives in the 'rainbow' Colour Mode (explicit fixed colour per
        // key), not in Gradient's keyboard sweep.
        const LEGACY_STYLE_TO_MODE = { rainbow2:'rainbow', rainbowV2:'rainbow', rainbow:'rainbow', double:'double' };
        const styleMap = {
            single:'mSingle', outline:'mOutline', midnight:'mMidnight', glass:'mGlass', chrome:'mChrome'
        };
        if (s.material !== undefined) {
            const resolved = LEGACY_STYLE[s.material] || s.material;
            setAnimModeById(styleMap[resolved] || 'mSingle');
        }
        if (s.animColorMode !== undefined) {
            setAnimColorMode(s.animColorMode);
        } else if (s.material !== undefined && LEGACY_STYLE_TO_MODE[s.material]) {
            setAnimColorMode(LEGACY_STYLE_TO_MODE[s.material]);
        } else if (s.animColorSplit !== undefined) {
            setAnimColorMode(s.animColorSplit ? 'double' : 'single');
        } else {
            setAnimColorMode('single');
        }
        if (Array.isArray(s.gradientColors)){
            gradientColors = [0,1,2].map(i => normalizeHexColor(s.gradientColors[i]) || gradientColors[i]);
        }
        setGradientColorCount(s.gradientColorCount !== undefined ? s.gradientColorCount : 2);
        if (s.gradientIntensity !== undefined) setGradientIntensity(s.gradientIntensity); else setGradientIntensity(70);
        if (s.gradientAxis !== undefined) setGradientAxis(s.gradientAxis); else setGradientAxis('horizontal');
        if (s.animShape !== undefined) setAnimShape(s.animShape);
        if (s.animRoundness !== undefined) setAnimRoundness(s.animRoundness); else setAnimRoundness(animRoundness);
        if (s.noteOpacity !== undefined) setNoteOpacity(s.noteOpacity); else setNoteOpacity(noteOpacity);
        if (s.noteSpeed !== undefined) setNoteSpeed(s.noteSpeed); else setNoteSpeed(noteSpeed);
        if (s.keyDustIntensity !== undefined) setKeyDustIntensity(s.keyDustIntensity); else setKeyDustIntensity(keyDustIntensity);
        if (s.strikeLineColor !== undefined) setStrikeLineColor(s.strikeLineColor); else setStrikeLineColor(strikeLineColor);
        setStrikeLineLeftColor(s.strikeLineLeftColor !== undefined ? s.strikeLineLeftColor : '#0099ff');
        setStrikeLineRightColor(s.strikeLineRightColor !== undefined ? s.strikeLineRightColor : '#0099ff');
        setStrikeLineSplitTuts(s.strikeLineSplitTuts !== undefined ? s.strikeLineSplitTuts : 44);
        setStrikeLineColorSplit(!!s.strikeLineColorSplit);
        setStrikeLineColorFollowFallingNotes(!!s.strikeLineColorFollowFallingNotes);
        setKeyColorFollowFallingNotes(!!s.keyColorFollowFallingNotes);
        if (s.dustColor !== undefined) setDustColor(s.dustColor); else setDustColor(dustColor);
        setDustDoubleLeftColor(s.dustDoubleLeftColor !== undefined ? s.dustDoubleLeftColor : '#0099ff');
        setDustDoubleRightColor(s.dustDoubleRightColor !== undefined ? s.dustDoubleRightColor : '#0099ff');
        setDustDoubleSplitTuts(s.dustDoubleSplitTuts !== undefined ? s.dustDoubleSplitTuts : 44);
        setDustColorSplit(!!s.dustColorSplit);
        setDustColorFollowFallingNotes(!!s.dustColorFollowFallingNotes);
        if (s.strikeLineEnabled !== undefined) strikeLineEnabled = !!s.strikeLineEnabled;
        if (s.strikeReactionEnabled !== undefined) strikeReactionEnabled = !!s.strikeReactionEnabled;
        if (s.strikeReactionIntensity !== undefined) setStrikeReactionIntensity(s.strikeReactionIntensity); else setStrikeReactionIntensity(strikeReactionIntensity);
        if (s.strikeLineDustEnabled !== undefined) strikeLineDustEnabled = !!s.strikeLineDustEnabled;
        if (s.strikeLineAuraSize !== undefined) setStrikeLineAuraSize(s.strikeLineAuraSize); else setStrikeLineAuraSize(strikeLineAuraSize);
        setStrikeLineVisualSetting('brightness', s.strikeLineBrightness !== undefined ? s.strikeLineBrightness : strikeLineBrightness);
        setStrikeLineVisualSetting('opacity', s.strikeLineOpacity !== undefined ? s.strikeLineOpacity : strikeLineOpacity);
        setStrikeLineVisualSetting('saturation', s.strikeLineSaturation !== undefined ? s.strikeLineSaturation : strikeLineSaturation);
        if (s.strikeLineDustSize !== undefined) setStrikeLineDustSize(s.strikeLineDustSize);
        else if (s.strikeLineDustAmount !== undefined) setStrikeLineDustSize(Number(s.strikeLineDustAmount) <= 2 ? [25, 50, 100][Math.max(0, Math.min(2, Math.round(Number(s.strikeLineDustAmount) || 0)))] : s.strikeLineDustAmount);
        else setStrikeLineDustSize(strikeLineDustSize);
        setParticleSetting('count', s.particleCount !== undefined ? s.particleCount : particleCount);
        setParticleSetting('size', s.particleSize !== undefined ? s.particleSize : strikeLineDustSize);
        setParticleSetting('opacity', s.particleOpacity !== undefined ? s.particleOpacity : particleOpacity);
        setParticleSetting('speed', s.particleSpeed !== undefined ? s.particleSpeed : particleSpeed);
        setParticleSetting('turbulence', s.particleTurbulence !== undefined ? s.particleTurbulence : particleTurbulence);
        setParticleSetting('saturation', s.particleSaturation !== undefined ? s.particleSaturation : particleSaturation);
        setParticleSetting('fade', s.particleFade !== undefined ? s.particleFade : particleFade);
        setDustBlendMode(s.dustBlendMode !== undefined ? s.dustBlendMode : dustBlendMode);
        setStrikeLineMotion('static');
        setMotionSpeed(s.motionSpeed !== undefined ? s.motionSpeed : motionSpeed);
        syncStrikeLineFxButtons();
        currentGlassColor = normalizeHexColor(s.currentGlassColor) || '#ffffff';
        const savedPianoHeight = Number(s.pianoHeight);
        // No flag to set and no ">5 means the user meant it" guess: a preset
        // either carries a height or it does not, and whatever it carries maps
        // through the one function every other path uses.
        setPianoHeightPercent(Number.isFinite(savedPianoHeight) ? savedPianoHeight : getDefaultPianoHeightPercent());
        setPianoScalePercent();
        setBlackKeyWidthPercent(s.blackKeyWidthPercent !== undefined ? s.blackKeyWidthPercent : 120);
        setBlackKeyHeightPercent(s.blackKeyHeightPercent !== undefined ? s.blackKeyHeightPercent : 60);
        setBlackKeyEdgeDepthPercent(s.blackKeyEdgeDepthPercent !== undefined ? s.blackKeyEdgeDepthPercent : 40);
        setPianoVisibilityPercent(s.pianoVisibilityPercent !== undefined ? s.pianoVisibilityPercent : 100);
        applyPianoLift(s.pianoLiftPercent !== undefined ? s.pianoLiftPercent : 0, true);
        if (s.customWhiteKey !== undefined) {
            _activeColorPadIntent = s.customWhiteKey ? 'user' : 'reset';
            try { setWhiteKeyColor(s.customWhiteKey || NO_COLOR); } finally { _activeColorPadIntent = null; }
        } else {
            setWhiteKeyColor(s.accentWhite !== undefined ? s.accentWhite : NO_COLOR);
        }
        if (s.customBlackKey !== undefined) {
            _activeColorPadIntent = s.customBlackKey ? 'user' : 'reset';
            try { setBlackKeyColor(s.customBlackKey || NO_COLOR); } finally { _activeColorPadIntent = null; }
        } else {
            setBlackKeyColor(s.accentBlack !== undefined ? s.accentBlack : NO_COLOR);
        }
        setKeyGlowEnabled(s.keyGlowEnabled !== undefined ? !!s.keyGlowEnabled : false);
        setKeyGlowIntensity(s.keyGlowIntensity !== undefined ? s.keyGlowIntensity : 50);
        setNoteGlowEnabled(s.noteGlowEnabled !== undefined ? !!s.noteGlowEnabled : false);
        setNoteGlowIntensity(s.noteGlowIntensity !== undefined ? s.noteGlowIntensity : 35);
        setOctaveLinesEnabled(s.octaveLinesEnabled !== undefined ? !!s.octaveLinesEnabled : true);
        setChordTextScale(s.chordTextScale !== undefined ? s.chordTextScale : 100);
        setKeyLabelScale(s.keyLabelScale !== undefined ? s.keyLabelScale : 100);
        if (s.customChordColor !== undefined) {
            _activeColorPadIntent = s.customChordColor ? 'user' : 'reset';
            try { setChordDisplayColors(s.chordDisplayColors || DEFAULT_CHORD_COLORS); } finally { _activeColorPadIntent = null; }
        } else if (s.chordDisplayColors) {
            setChordDisplayColors(s.chordDisplayColors);
        }
        if (s.metronome && typeof window.setMetronomeState === 'function') window.setMetronomeState(s.metronome);
        if (s.pianoTheme !== undefined) setPianoTheme(s.pianoTheme, { applyThemeDefaults: false });
        if (typeof setChordMode === 'function') {
            // New presets carry chordDetectorTier with the 5-tier vocabulary
            // (basic/medium/pro/expert/max). Presets saved before the
            // rollout stored `chordDetectorMode` with the old 3-tier
            // vocabulary — those get routed through the same legacy table
            // used for localStorage migration so the user's saved intent is
            // preserved (old 'basic' -> new 'medium', old 'pro' -> new
            // 'max').
            if (s.chordDetectorTier !== undefined) {
                setChordMode(s.chordDetectorTier);
            } else if (s.chordDetectorMode !== undefined) {
                var _legacyChord = _migrateLegacyChordMode(s.chordDetectorMode);
                if (_legacyChord) setChordMode(_legacyChord);
            }
        }
        if (typeof setAutoVelocity === 'function') setAutoVelocity(s.autoVelocityEnabled !== undefined ? !!s.autoVelocityEnabled : false);
        if (typeof setAutoVelocityMode === 'function' && s.autoVelocityMode !== undefined) setAutoVelocityMode(s.autoVelocityMode);
        if (s.perfHudEnabled !== undefined) setPerformanceMonitor(!!s.perfHudEnabled);
        // 'auto' retired: old presets that stored it fall back to smart detection.
        performanceMode = 'manual';
        // Only Potato and Default exist; old 'ultra' maps to Default, everything else (low/high/medium/mobile) to Potato.
        if (s.graphicQuality !== undefined) graphicQuality = (s.graphicQuality === 'default' || s.graphicQuality === 'ultra') ? 'default' : 'potato';
        setTimeout(() => {
            if (typeof setBgFitMode === 'function' && s.bgFitMode) setBgFitMode(s.bgFitMode);
            if (typeof setBgPositionMode === 'function' && s.bgPositionMode) setBgPositionMode(s.bgPositionMode);
            if (s.bgOpacity !== undefined && document.getElementById('bgOpacityRange')) document.getElementById('bgOpacityRange').value = s.bgOpacity;
            if (s.bgDim !== undefined && document.getElementById('bgDimRange')) document.getElementById('bgDimRange').value = s.bgDim;
            if (s.bgBlur !== undefined && document.getElementById('bgBlurRange')) document.getElementById('bgBlurRange').value = s.bgBlur;
            if (typeof applyBgImageSettings === 'function') applyBgImageSettings();
            if (typeof window.applyGraphicQuality === 'function') window.applyGraphicQuality(graphicQuality);
        }, 0);
        if (s.currentSf && SF_URLS[s.currentSf]) currentSf = s.currentSf;
        if (s.currentStringSf && SF_URLS[s.currentStringSf]) currentStringSf = s.currentStringSf;
        updateSoundfontPickerUI();
        if (currentSf !== loadedSfKey && SF_URLS[currentSf]) loadSoundfont(currentSf, SF_URLS[currentSf], null, 'piano');
        setStringLayerEnabled(stringEnabled, true);
        setTimeout(() => { resize(); build(); }, 50);
    } catch(e) {}
}

function clearStoredSettings(){
    STORAGE_RESET_KEYS.forEach(key => {
        try{ localStorage.removeItem(key); }catch(e){}
    });
}

function normalizeStoredPayload(payload){
    if(!payload || typeof payload !== 'object') return null;
    if(payload.version !== STORAGE_SCHEMA_VERSION || !payload.data || typeof payload.data !== 'object') return null;
    return payload.data;
}

function readStoredPayload(key){
    const raw = localStorage.getItem(key);
    if(!raw) return null;
    return normalizeStoredPayload(JSON.parse(raw));
}

function writeStoredPayload(key, data){
    localStorage.setItem(key, JSON.stringify({
        version: STORAGE_SCHEMA_VERSION,
        savedAt: Date.now(),
        data
    }));
}

function notifyPreset(message, type){
    showToast(message, { type: type || 'success', title: 'Preset' });
}

function applyStoredSettings(settings){
    applySettings(settings);
}

function resetDefaultsFromMemory(){
    applyFactoryDefaults(true);
    notifyPreset('Defaults restored');
}

function bindMemoryControls(){
    document.getElementById('memoryResetDefaultsBtn')?.addEventListener('click', resetDefaultsFromMemory);
    document.getElementById('resetBtn')?.addEventListener('click', resetDefaultsFromMemory);
    // "Save My Preset" in the Tools shortcut just opens the Preset subpage --
    // saving now needs a name, so there's no single-click quick-save anymore.
    document.getElementById('saveBtn')?.addEventListener('click', () => {
        setVisualPanelPage('preset');
        toggle('colorPanel');
    });
}

bindMemoryControls();

// ── Presets: 100% AWS-backed (savePresetSlot/deletePresetSlot/getProfile),
// no localStorage involvement at all. Solo Piano gates only this subpage --
// the rest of the page works fully without an account; opening "My Presets"
// while signed out shows a sign-in card instead of the slot list. ──────────
(function initPresetCloud(){
    const PRESET_MODE = 'solo';
    const PRESET_FIELD = 'soloPresets';
    const PRESET_MAX_SLOTS = 5;
    const SAVE_QUERY = 'mutation SavePresetSlot($mode:String!,$id:ID,$name:String!,$data:AWSJSON!){savePresetSlot(mode:$mode,id:$id,name:$name,data:$data){soloPresets}}';
    const DELETE_QUERY = 'mutation DeletePresetSlot($mode:String!,$id:ID!){deletePresetSlot(mode:$mode,id:$id){soloPresets}}';
    const GET_QUERY = 'query GetMyPresetSlots($uid:ID!){getProfile(uid:$uid){soloPresets}}';

    let presetSlots = [];
    const slotListEl = document.getElementById('presetSlotList');
    const emptyHintEl = document.getElementById('presetEmptyHint');
    const countBadgeEl = document.getElementById('presetCountBadge');
    const newRowEl = document.getElementById('presetNewRow');
    const maxHintEl = document.getElementById('presetMaxHint');
    const newNameInputEl = document.getElementById('presetNewNameInput');
    const saveNewBtnEl = document.getElementById('presetSaveNewBtn');
    const gateEl = document.getElementById('presetAuthGate');
    const signedInBlockEl = document.getElementById('presetSignedInBlock');
    const confirmModalEl = document.getElementById('presetConfirmModal');
    const confirmTitleEl = document.getElementById('presetConfirmTitle');
    const confirmTextEl = document.getElementById('presetConfirmText');
    const confirmYesEl = document.getElementById('presetConfirmYes');
    const confirmNoEl = document.getElementById('presetConfirmNo');
    let confirmYesHandler = null;

    function escapeHtml(s){
        return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    }

    // Small in-panel Yes/No confirmation -- used before saving a new preset
    // and before deleting one, instead of a native confirm() or the old
    // flaky "click twice within N seconds" delete pattern.
    function showPresetConfirm(title, text, onYes, opts){
        if(!confirmModalEl || !confirmYesEl){ onYes(); return; }
        confirmTitleEl.textContent = title;
        confirmTextEl.textContent = text;
        confirmYesEl.textContent = (opts && opts.yesLabel) || 'Yes';
        confirmYesEl.classList.toggle('preset-confirm-danger', !!(opts && opts.danger));
        confirmYesHandler = onYes;
        confirmModalEl.style.display = '';
    }
    function hidePresetConfirm(){
        if(!confirmModalEl) return;
        confirmModalEl.style.display = 'none';
        confirmYesHandler = null;
    }
    if(confirmYesEl) confirmYesEl.addEventListener('click', () => {
        const fn = confirmYesHandler;
        hidePresetConfirm();
        if(typeof fn === 'function') fn();
    });
    if(confirmNoEl) confirmNoEl.addEventListener('click', hidePresetConfirm);

    // AWSJSON output fields come back over the wire as a JSON-encoded
    // *string*, not a parsed array/object -- must be JSON.parse()'d before use.
    function parsePresetField(raw){
        if(Array.isArray(raw)) return raw;
        if(typeof raw === 'string'){
            try{ const p = JSON.parse(raw); return Array.isArray(p) ? p : []; }catch(e){ return []; }
        }
        return [];
    }

    function renderPresetSlots(){
        if(!slotListEl) return;
        if(countBadgeEl) countBadgeEl.textContent = presetSlots.length + '/' + PRESET_MAX_SLOTS;
        if(emptyHintEl) emptyHintEl.style.display = presetSlots.length ? 'none' : '';
        if(newRowEl) newRowEl.style.display = presetSlots.length >= PRESET_MAX_SLOTS ? 'none' : '';
        if(maxHintEl) maxHintEl.style.display = presetSlots.length >= PRESET_MAX_SLOTS ? '' : 'none';
        slotListEl.innerHTML = presetSlots.map(slot => (
            '<div class="preset-slot-row" data-preset-id="' + slot.id + '">' +
                '<span class="preset-slot-name">' + escapeHtml(slot.name) + '</span>' +
                '<button class="preset-slot-btn preset-slot-load-btn" type="button" title="Load preset" data-action="load"><svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z" /></svg></button>' +
                '<button class="preset-slot-btn preset-slot-delete-btn" type="button" title="Delete preset" data-action="delete"><svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6" /></svg></button>' +
            '</div>'
        )).join('');
    }

    function fetchPresetSlots(){
        if(!(window.papianoAuth && window.papianoAuth.currentUser)) return;
        if(!(window.papianoData && typeof window.papianoData.gql === 'function')) return;
        window.papianoData.gql(GET_QUERY, { uid: window.papianoAuth.currentUser.uid }).then(data => {
            presetSlots = parsePresetField(data && data.getProfile && data.getProfile[PRESET_FIELD]);
            renderPresetSlots();
        }).catch(() => { presetSlots = []; renderPresetSlots(); });
    }

    function saveNewPresetSlot(name){
        if(!(window.papianoAuth && window.papianoAuth.currentUser)){ notifyPreset('Sign in to save presets', 'error'); return; }
        if(presetSlots.length >= PRESET_MAX_SLOTS){ notifyPreset('Max ' + PRESET_MAX_SLOTS + ' presets — delete one first', 'error'); return; }
        const cleanName = String(name || '').trim().slice(0, 60) || 'Untitled';
        showPresetConfirm(
            'Save preset?',
            'Save your current piano settings as "' + cleanName + '"?',
            () => doSaveNewPresetSlot(cleanName),
            { yesLabel: 'Save' }
        );
    }

    function doSaveNewPresetSlot(cleanName){
        // AWSJSON as a GraphQL *input* variable must be sent as a JSON string
        // (AppSync's scalar coercion parses variables differently from inline
        // literals) -- unlike AWSJSON *output* fields, which already arrive
        // as parsed objects. Sending a raw object here is what produced the
        // "Variable 'data' has an invalid value" error.
        window.papianoData.gql(SAVE_QUERY, { mode: PRESET_MODE, id: null, name: cleanName, data: JSON.stringify(getCurrentSettings()) }).then(data => {
            presetSlots = parsePresetField(data && data.savePresetSlot && data.savePresetSlot[PRESET_FIELD]);
            renderPresetSlots();
            notifyPreset('Saved "' + cleanName + '"');
            if(newNameInputEl) newNameInputEl.value = '';
        }).catch(e => notifyPreset((e && e.message) || 'Failed to save', 'error'));
    }

    function loadPresetSlot(id){
        const slot = presetSlots.find(s => s.id === id);
        if(!slot){ notifyPreset('Preset not found', 'error'); return; }
        try{
            applyStoredSettings(slot.data);
            notifyPreset('Loaded "' + slot.name + '"');
        }catch(e){
            notifyPreset('Failed to load preset', 'error');
        }
    }

    function deletePresetSlotRemote(id){
        if(!(window.papianoAuth && window.papianoAuth.currentUser)) return;
        window.papianoData.gql(DELETE_QUERY, { mode: PRESET_MODE, id }).then(data => {
            presetSlots = parsePresetField(data && data.deletePresetSlot && data.deletePresetSlot[PRESET_FIELD]);
            renderPresetSlots();
            notifyPreset('Preset deleted');
        }).catch(e => notifyPreset((e && e.message) || 'Failed to delete', 'error'));
    }

    if(slotListEl) slotListEl.addEventListener('click', ev => {
        const btn = ev.target.closest('.preset-slot-btn');
        if(!btn) return;
        const row = btn.closest('.preset-slot-row');
        const id = row && row.dataset.presetId;
        if(!id) return;
        if(btn.classList.contains('preset-slot-load-btn')){
            loadPresetSlot(id);
        }else if(btn.classList.contains('preset-slot-delete-btn')){
            const slot = presetSlots.find(s => s.id === id);
            const label = slot ? slot.name : 'this preset';
            showPresetConfirm(
                'Delete preset?',
                'Delete "' + label + '"? This cannot be undone.',
                () => deletePresetSlotRemote(id),
                { yesLabel: 'Delete', danger: true }
            );
        }
    });
    if(saveNewBtnEl) saveNewBtnEl.addEventListener('click', () => saveNewPresetSlot(newNameInputEl ? newNameInputEl.value : ''));
    if(newNameInputEl) newNameInputEl.addEventListener('keydown', ev => {
        if(ev.key === 'Enter'){ ev.preventDefault(); saveNewPresetSlot(newNameInputEl.value); }
    });

    // ── Sign-in gate: no inline form here -- just a prompt whose "Sign In"
    // button is a plain link back to /dashboard (Home), where the real sign-in
    // flow already lives. Solo Piano itself stays fully usable while signed
    // out; only this Preset subpage is gated. ──────────────────────────────
    function updatePresetAuthUI(user){
        if(gateEl) gateEl.style.display = user ? 'none' : '';
        if(signedInBlockEl) signedInBlockEl.style.display = user ? '' : 'none';
        if(user) fetchPresetSlots();
        else{ presetSlots = []; renderPresetSlots(); }
    }
    if(window.papianoAuth && typeof window.papianoAuth.onAuthStateChanged === 'function'){
        window.papianoAuth.onAuthStateChanged(updatePresetAuthUI);
    }else{
        updatePresetAuthUI(null);
    }
})();
clearStoredSettings();
applyFactoryDefaults(false);
setTimeout(() => { if (typeof ensurePianoBootVisible === 'function') ensurePianoBootVisible(); }, 120);

bindChordColorControls();

function normalizeHexColor(hex){
    if(!hex) return null;
    let h=String(hex).trim();
    if(!h.startsWith('#')) return null;
    h=h.slice(1);
    if(h.length===3) h=h.split('').map(c=>c+c).join('');
    if(!/^[0-9a-fA-F]{6}$/.test(h)) return null;
    return '#'+h.toLowerCase();
}
function hexToRgbaString(hex, alpha){
    const c = normalizeHexColor(hex) || '#ffffff';
    const n = parseInt(c.slice(1),16);
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    const a = Math.max(0, Math.min(1, Number(alpha) || 0));
    return `rgba(${r},${g},${b},${a})`;
}
function applyStrikeLineSaturation(hex, percent){
    const c = normalizeHexColor(hex) || '#ffffff';
    const p = Math.max(0, Math.min(100, Number(percent) || 0)) / 100;
    const n = parseInt(c.slice(1), 16);
    const r0 = (n >> 16) & 255, g0 = (n >> 8) & 255, b0 = n & 255;
    const gray = r0 * 0.299 + g0 * 0.587 + b0 * 0.114;
    const sat = p * 1.38;
    const lift = p * 10;
    const r = Math.round(gray + (r0 - gray) * sat + lift);
    const g = Math.round(gray + (g0 - gray) * sat + lift);
    const b = Math.round(gray + (b0 - gray) * sat + lift);
    return '#'+[r,g,b].map(v=>Math.max(0,Math.min(255,v)).toString(16).padStart(2,'0')).join('');
}
function resetWhiteKeyBaseColor(){
    const root=document.documentElement.style;
    root.setProperty('--piano-white-top','#ffffff');
    root.setProperty('--piano-white-mid','#f7f8fa');
    root.setProperty('--piano-white-bottom','#e9ecef');
}
function resetBlackKeyBaseColor(){
    const root=document.documentElement.style;
    root.setProperty('--piano-black-top','#2d333d');
    root.setProperty('--piano-black-mid','#151a22');
    root.setProperty('--piano-black-bottom','#040506');
}
// customWhiteKey/customBlackKey/customAnimNote/customChordColor are declared
// much earlier in this file (right after _activeColorPadIntent), before the
// boot-time applyFactoryDefaults(false) call — see the comment there.
function selfSeatKeyColor(){
    if(customWhiteKey || customBlackKey) return ''; // user already customised → view follows global --accent-white
    return _mpSelfSeatColor || '';
}
function selfSeatNoteOpts(){
    // Apply the player's seat colour whenever Colour Mode is Single — a
    // styled note still carries the player's identity colour in a room.
    // Double/Gradient Mode bring their own colours; a user-chosen custom
    // Note Color also wins.
    if(customAnimNote) return {};
    if(typeof animColorMode !== 'undefined' && animColorMode !== 'single') return {};
    // Passed as seatColor (a base tint that keeps the chosen style) rather than
    // `color` (which would force the note to plain solid).
    return _mpSelfSeatColor ? { seatColor: _mpSelfSeatColor } : {};
}
function userCustomChordColor(){
    return customChordColor || '';
}
// Sync the color pad DISPLAY to the current effective colour:
// user custom if any, else the seat colour in the room, else the default.
// Display-only (updateColorPadValue doesn't call the handler), so it never
// changes the custom state.
function syncColorPadsToEffectiveColors(){
    try{
        const seat = _mpSelfSeatColor || '';
        updateColorPadValue('gridWhiteTuts', customWhiteKey || seat || '#ffffff');
        updateColorPadValue('gridBlackTuts', customBlackKey || seat || '#ffffff');
        if(typeof animStyle === 'undefined' || !animStyle || animStyle === 'single'){
            const cssAnim = getComputedStyle(document.documentElement).getPropertyValue('--anim-color').trim();
            updateColorPadValue('gridAnim', customAnimNote || seat || cssAnim || '#ffffff');
        }
        const chordBase = (typeof chordDisplayColors !== 'undefined' && chordDisplayColors) ? chordDisplayColors : { primary:'#ffffff', secondary:'#ffffff' };
        updateColorPadValue('chordPrimaryColor', customChordColor || seat || chordBase.primary || '#ffffff');
        updateColorPadValue('chordSecondaryColor', customChordColor ? chordBase.secondary : (seat || chordBase.secondary || '#ffffff'));
    }catch(e){}
}
function setKeyColorFollowFallingNotes(on){
    keyColorFollowFallingNotes = !!on;
    const track = document.getElementById('keyColorFollowFallingTrack');
    if(track) track.classList.toggle('active', keyColorFollowFallingNotes);
}
// Readable ink for a key label sitting ON the pressed-key colour. The accent
// is user-pickable, so the label cannot have one fixed colour: at the shipped
// defaults the white key's label was rgba(82,86,92,.82) on a saturated blue
// (#0088e0) and the black key's was near-white on a light blue (#29a3ff) --
// the first nearly unreadable, the second weak. Rec.709 luminance picks
// near-black or near-white. Computed once per colour change, never per frame,
// and it changes no stacking: the label is already a child of the key and is
// painted over the key's background.
function keyInkFor(hex){
    let rgb;
    try { rgb = hexToRgb(hex); } catch(e){ rgb = null; }
    if(!rgb) return 'rgba(10,14,20,0.94)';
    // Real sRGB relative luminance, then pick whichever ink actually WINS on
    // contrast rather than trusting a fixed lightness threshold. A threshold
    // gets mid-tone saturated colours wrong: #0088e0 reads 3.7:1 against white
    // ink but 5.7:1 against dark, and a "is it bright?" test picks the wrong
    // one. Comparing the two ratios is the same cost and never wrong.
    const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    const L = 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
    const vsLightInk = 1.05 / (L + 0.05);
    const vsDarkInk = (L + 0.05) / 0.05;
    return vsDarkInk >= vsLightInk ? 'rgba(10,14,20,0.94)' : 'rgba(255,255,255,0.97)';
}
function setWhiteKeyColor(color){
    const root=document.documentElement.style;
    resetWhiteKeyBaseColor();
    // Update the custom flag based on intent (call source):
    //   'user'  -> user picked a colour in the color pad (incl. white) -> custom
    //   'reset' -> clicked the Reset button                            -> back to seat
    //   null    -> load settings / factory defaults                    -> don't change
    if(_activeColorPadIntent === 'user'){
        customWhiteKey = (color === NO_COLOR || color === null) ? null : (normalizeHexColor(color) || null);
    } else if(_activeColorPadIntent === 'reset' || color === NO_COLOR || color === null){
        customWhiteKey = null;
    } else {
        // restore: hex != putih → custom; putih/null → bukan custom
        const n = (color === NO_COLOR || color === null) ? null : (normalizeHexColor(color) || null);
        customWhiteKey = (n && n.toLowerCase() !== '#ffffff') ? n : null;
    }
    if(color === NO_COLOR || color === null){
        root.setProperty('--accent-white','#ffffff');
        root.setProperty('--accent-white-ink', keyInkFor('#ffffff'));
        updateColorPadValue('gridWhiteTuts', '#ffffff');
        root.setProperty('--piano-white-active-top','#ffffff');
        root.setProperty('--piano-white-active-mid','#ffffff');
        root.setProperty('--piano-white-active-bottom','#ffffff');
        refreshKeyDustColorCache();
        syncColorPadsToEffectiveColors();
        return;
    }
    const c=normalizeHexColor(color) || '#ffffff';
    root.setProperty('--accent-white',c);
    root.setProperty('--accent-white-ink', keyInkFor(c));
    updateColorPadValue('gridWhiteTuts', c);
    root.setProperty('--piano-white-active-top',c);
    root.setProperty('--piano-white-active-mid',c);
    root.setProperty('--piano-white-active-bottom',c);
    refreshKeyDustColorCache();
    syncColorPadsToEffectiveColors();
}
function setBlackKeyColor(color){
    const root=document.documentElement.style;
    resetBlackKeyBaseColor();
    if(_activeColorPadIntent === 'user'){
        customBlackKey = (color === NO_COLOR || color === null) ? null : (normalizeHexColor(color) || null);
    } else if(_activeColorPadIntent === 'reset' || color === NO_COLOR || color === null){
        customBlackKey = null;
    } else {
        const n = (color === NO_COLOR || color === null) ? null : (normalizeHexColor(color) || null);
        customBlackKey = (n && n.toLowerCase() !== '#ffffff') ? n : null;
    }
    if(color === NO_COLOR || color === null){
        root.setProperty('--accent-black','#ffffff');
        root.setProperty('--accent-black-ink', keyInkFor('#ffffff'));
        updateColorPadValue('gridBlackTuts', '#ffffff');
        root.setProperty('--piano-black-active-top','#ffffff');
        root.setProperty('--piano-black-active-mid','#ffffff');
        root.setProperty('--piano-black-active-bottom','#ffffff');
        refreshKeyDustColorCache();
        syncColorPadsToEffectiveColors();
        return;
    }
    const c=normalizeHexColor(color) || '#ffffff';
    root.setProperty('--accent-black',c);
    root.setProperty('--accent-black-ink', keyInkFor(c));
    updateColorPadValue('gridBlackTuts', c);
    root.setProperty('--piano-black-active-top',c);
    root.setProperty('--piano-black-active-mid',c);
    root.setProperty('--piano-black-active-bottom',c);
    refreshKeyDustColorCache();
    syncColorPadsToEffectiveColors();
}
function populateGrid(id, handler){
    const labels = { gridWhiteTuts:'White Key Color', gridBlackTuts:'Black Key Color' };
    // The pad is mounted AFTER applyFactoryDefaults() already applied the real
    // default (#0099ff) to --accent-white/--accent-black and customWhiteKey/
    // customBlackKey. Hardcoding the swatch to '#ffffff' here made the picker
    // show white while the keys themselves were already lit blue on press —
    // seed it from the color actually in effect instead.
    const seat = (typeof _mpSelfSeatColor !== 'undefined' && _mpSelfSeatColor) || '';
    const current = id === 'gridWhiteTuts' ? (customWhiteKey || seat || '#ffffff')
        : id === 'gridBlackTuts' ? (customBlackKey || seat || '#ffffff')
        : '#ffffff';
    mountColorPad(id, labels[id] || 'Color', current, color => handler(color), '#ffffff');
}
function getStrikeLineAuraMetrics(){
    // strikeLineAuraSize now goes to 200% (2x) -- clampPercentValue/sliderCurve
    // cap at 100, so the ratio is computed directly here instead of through them.
    const level = Math.max(0, Math.min(200, Number(strikeLineAuraSize) || 0)) / 100;
    // Aura height +50%: taller, softer aura at the same slider %.
    return {
        height: Math.round(33 * level),
        blur: Math.round(8 * level),
        shadowHeight: Math.round(12 * level),
        shadowBlur: Math.round(6 * level)
    };
}
function applyStrikeLineAuraHeight(){
    const m = getStrikeLineAuraMetrics();
    document.documentElement.style.setProperty('--strike-line-aura-height', m.height + 'px');
    document.documentElement.style.setProperty('--strike-line-aura-blur', m.blur + 'px');
    document.documentElement.style.setProperty('--strike-line-shadow-height', m.shadowHeight + 'px');
    document.documentElement.style.setProperty('--strike-line-shadow-blur', m.shadowBlur + 'px');
}
function setStrikeLineAuraSize(value){
    strikeLineAuraSize = Math.max(0, Math.min(200, Math.round(Number(value) || 0)));
    const range = document.getElementById('strikeLineAuraRange');
    const label = document.getElementById('strikeLineAuraVal');
    if(range) range.value = strikeLineAuraSize;
    if(label) label.textContent = strikeLineAuraSize + '%';
    applyStrikeLineAuraHeight();
    if(typeof updateStrikeLineLine === 'function') updateStrikeLineLine();
}
const strikeLineAuraRange = document.getElementById('strikeLineAuraRange');
if(strikeLineAuraRange) strikeLineAuraRange.addEventListener('input', () => setStrikeLineAuraSize(strikeLineAuraRange.value));
setStrikeLineAuraSize(strikeLineAuraSize);
function setStrikeLineVisualSetting(name, value){
    const v = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
    const map = {
        brightness: ['strikeLineBrightness', 'strikeLineBrightnessRange', 'strikeLineBrightnessVal'],
        opacity: ['strikeLineOpacity', 'strikeLineOpacityRange', 'strikeLineOpacityVal'],
        saturation: ['strikeLineSaturation', 'strikeLineSaturationRange', 'strikeLineSaturationVal']
    };
    const meta = map[name];
    if(!meta) return;
    if(name === 'brightness') strikeLineBrightness = v;
    else if(name === 'opacity') strikeLineOpacity = v;
    else if(name === 'saturation') strikeLineSaturation = v;
    const range = document.getElementById(meta[1]);
    const label = document.getElementById(meta[2]);
    if(range) range.value = v;
    if(label) label.textContent = v + '%';
    updateStrikeLineLine();
}
function updateStrikeLineLine(){
    window.updateStrikeLineLine = updateStrikeLineLine;
    const el = document.getElementById('strikeLine');
    if(!el) return;
    const baseColor = normalizeHexColor(strikeLineColor) || '#00e5ff';
    const saturatedColor = applyStrikeLineSaturation(baseColor, strikeLineSaturation);
    const intensity = sliderRatio(strikeLineBrightness) * 2; // Intensity +100%
    const opacityLevel = sliderRatio(strikeLineOpacity);
    const auraLevel = Math.max(0, Math.min(200, Number(strikeLineAuraSize) || 0)) / 100;
    // When Split Color is on, the flat bar renders as a hard two-stop gradient
    // at the split position (see el.style.background below); the ambient halo/
    // shadow (which can't vary spatially across one box-shadow) stays keyed to
    // the Left color as a representative hue. Follow Falling Notes borrows the
    // Falling Notes colour scheme instead: single/double reuse the same 2-stop
    // shape, gradient/rainbow render as a smooth multi-stop sweep of that
    // palette (Rainbow's sweep is a static snapshot of "now", not a live
    // per-frame animation, to avoid re-rendering this gradient every frame).
    let lineColor, rightSaturatedColor, gradientStops = null;
    if(strikeLineColorFollowFallingNotes && animColorMode === 'gradient' && gradientAxis === 'vertical'){
        // Vertical axis has no width-wise sweep to show on a 1D horizontal bar
        // (colour depends on Y only, and the whole bar sits at one Y) -- show
        // the flat colour a falling note has right as it reaches the strike
        // line, instead of the Horizontal-axis left-to-right rainbow below.
        const flatColor = applyStrikeLineSaturation(gradientColorForMidi(60, canvasCssH), strikeLineSaturation);
        lineColor = flatColor;
        rightSaturatedColor = flatColor;
    } else if(strikeLineColorFollowFallingNotes && (animColorMode === 'gradient' || animColorMode === 'rainbow')){
        const colorFn = animColorMode === 'gradient' ? gradientColorForMidi : rainbowColorForMidi;
        const STOPS = 12;
        gradientStops = [];
        for(let i = 0; i <= STOPS; i++){
            const tuts = 1 + (STRING_TUTS_MAX - 1) * (i / STOPS);
            gradientStops.push(applyStrikeLineSaturation(colorFn(tutsToMidi(tuts)), strikeLineSaturation));
        }
        lineColor = gradientStops[0];
        rightSaturatedColor = gradientStops[gradientStops.length - 1];
    } else if(strikeLineColorFollowFallingNotes && animColorSplit){
        lineColor = applyStrikeLineSaturation(normalizeHexColor(animDoubleLeftColor) || '#00e5ff', strikeLineSaturation);
        rightSaturatedColor = applyStrikeLineSaturation(normalizeHexColor(animDoubleRightColor) || '#00e5ff', strikeLineSaturation);
    } else if(strikeLineColorFollowFallingNotes){
        const followColor = applyStrikeLineSaturation(normalizeHexColor(cachedAnimColor) || baseColor, strikeLineSaturation);
        lineColor = followColor;
        rightSaturatedColor = followColor;
    } else if(strikeLineColorSplit){
        lineColor = applyStrikeLineSaturation(normalizeHexColor(strikeLineLeftColor) || '#00e5ff', strikeLineSaturation);
        rightSaturatedColor = applyStrikeLineSaturation(normalizeHexColor(strikeLineRightColor) || '#00e5ff', strikeLineSaturation);
    } else {
        lineColor = saturatedColor;
        rightSaturatedColor = saturatedColor;
    }
    const rgb = hexToRgb(lineColor);
    const coreAlpha = Math.min(1, opacityLevel);
    // No extra intensity factor here: Brightness already drives the line's own
    // colour and halo, and multiplying the aura by it as well made this mist
    // ~1.9x denser than the visualizer's at identical settings (measured
    // 0.82 vs 0.432). Aura Height is the aura's own control.
    const smokeAlphaA = opacityLevel * auraLevel * 0.54;
    const smokeAlphaB = opacityLevel * auraLevel * 0.34;
    const shadowAlphaA = opacityLevel * auraLevel * 0.40;
    const shadowAlphaB = opacityLevel * auraLevel * 0.22;
    const smokeA = hexToRgbaString(lineColor, Math.min(0.82, smokeAlphaA));
    const smokeB = hexToRgbaString(lineColor, Math.min(0.58, smokeAlphaB));
    const shadowA = hexToRgbaString(lineColor, Math.min(0.66, shadowAlphaA));
    const shadowB = hexToRgbaString(lineColor, Math.min(0.42, shadowAlphaB));
    const haloA = hexToRgbaString(lineColor, Math.min(1, opacityLevel * intensity * 0.94));
    const haloB = hexToRgbaString(lineColor, Math.min(0.88, opacityLevel * intensity * 0.72));
    const haloC = hexToRgbaString(lineColor, Math.min(0.66, opacityLevel * intensity * 0.52));
    const haloD = hexToRgbaString(lineColor, Math.min(0.44, opacityLevel * intensity * 0.34));
    const haloE = hexToRgbaString(lineColor, Math.min(0.28, opacityLevel * intensity * 0.21));
    const halo1px = Math.round(2 + intensity * 15);
    const halo2px = Math.round(4 + intensity * 32);
    const halo3px = Math.round(6 + intensity * 58);
    const halo4px = Math.round(8 + intensity * 94);
    const halo5px = Math.round(10 + intensity * 134);
    const px = Math.max(1, Math.min(10, Math.round(Number(keyDustIntensity) || 2)));

    document.documentElement.style.setProperty('--strike-line-color', lineColor);
    document.documentElement.style.setProperty('--strike-line-thickness-base', px + 'px');
    applyStrikeLineAuraHeight();
    // --strike-line-smoke-motion is owned by setMotionSpeed() (the Motion Speed slider).
    // The aura is now a soft billowing haze (transform animation), so the old
    // repeating wave-cell variables are no longer needed.
    document.body.classList.toggle('strike-line-off', !strikeLineEnabled);
    document.body.classList.toggle('strike-line-smoke-off', !strikeLineSmokeEnabled || auraLevel <= 0.001 || opacityLevel <= 0.001);

    // Through --gfx-scale, same as the stylesheet's own height rule -- an
    // inline plain px here would win the cascade and undo the whole point.
    el.style.height = 'calc(' + px + 'px * var(--gfx-scale))';
    el.style.opacity = coreAlpha.toFixed(3);
    el.style.borderRadius = '999px';
    if(gradientStops){
        const stopStr = gradientStops.map((c, i) => `${c} ${(i / (gradientStops.length - 1) * 100).toFixed(1)}%`).join(', ');
        el.style.background = `linear-gradient(to right, ${stopStr})`;
    } else if(strikeLineColorFollowFallingNotes ? animColorSplit : strikeLineColorSplit){
        const splitPct = strikeLineColorFollowFallingNotes
            ? Math.max(0, Math.min(100, (animDoubleSplitTuts / STRING_TUTS_MAX) * 100))
            : Math.max(0, Math.min(100, (strikeLineSplitTuts / STRING_TUTS_MAX) * 100));
        // A few percent of soft blend instead of an instant hard cut at
        // splitPct — a razor edge on the flat bar itself read as ugly next
        // to Gradient's smooth sweep; still narrow enough to read as a
        // split (two colours), not a full gradient across the whole bar.
        const splitBlend = 3;
        const splitLo = Math.max(0, splitPct - splitBlend);
        const splitHi = Math.min(100, splitPct + splitBlend);
        el.style.background = `linear-gradient(to right, ${lineColor} 0%, ${lineColor} ${splitLo}%, ${rightSaturatedColor} ${splitHi}%, ${rightSaturatedColor} 100%)`;
    } else {
        el.style.background = lineColor;
    }
    el.style.backgroundSize = '100% 100%';
    el.style.backgroundPosition = '50% 50%';
    const tightAlpha = Math.min(0.84, opacityLevel * (0.12 + intensity * 0.60));
    const tightColor = hexToRgbaString(lineColor, tightAlpha);
    el.style.boxShadow = [
        `0 0 2px ${tightColor}`,
        `0 0 ${halo1px}px ${haloA}`,
        `0 0 ${halo2px}px ${haloB}`,
        `0 0 ${halo3px}px ${haloC}`,
        `0 0 ${halo4px}px ${haloD}`,
        `0 0 ${halo5px}px ${haloE}`
    ].join(', ');
    el.style.filter = `saturate(${(1 + intensity * 0.55).toFixed(3)}) brightness(${(1 + intensity * 0.10).toFixed(3)})`;
    el.style.zIndex = '30';
    el.style.setProperty('--strike-line-r', rgb[0]);
    el.style.setProperty('--strike-line-g', rgb[1]);
    el.style.setProperty('--strike-line-b', rgb[2]);
    el.style.setProperty('--strike-line-smoke-a', smokeA);
    el.style.setProperty('--strike-line-smoke-b', smokeB);
    el.style.setProperty('--strike-line-shadow-a', shadowA);
    el.style.setProperty('--strike-line-shadow-b', shadowB);
    // Also mirrored onto the root: #strikeLineAuraSegments is a sibling of
    // #strikeLine (not a descendant), so its own wave-crest layers need
    // these on an ancestor they actually inherit from.
    document.documentElement.style.setProperty('--strike-line-smoke-a', smokeA);
    document.documentElement.style.setProperty('--strike-line-smoke-b', smokeB);
    document.documentElement.style.setProperty('--strike-line-shadow-a', shadowA);
    document.documentElement.style.setProperty('--strike-line-shadow-b', shadowB);

    // The misty aura (::before/::after) used to stay stuck on one
    // representative colour even when the flat line above swept through a
    // whole Gradient/Rainbow/Split palette (a single box-shadow/pseudo-
    // element can't spatially vary). Fixed by handing the whole stop list
    // to updateStrikeLineAuraSegments(), which bakes them into one native
    // CSS linear-gradient() — see that function's own comment for why this
    // replaced an earlier one-DOM-node-per-stop version. Solid/no-split
    // mode is untouched: #strikeLine's own ::before/::after keep rendering
    // exactly as before, #strikeLineAuraSegments stays hidden.
    let auraStops = null;
    if(gradientStops){
        auraStops = gradientStops.map((c, i) => ({ pct: (i / (gradientStops.length - 1)) * 100, color: c }));
    } else if(strikeLineColorFollowFallingNotes ? animColorSplit : strikeLineColorSplit){
        const splitPct = strikeLineColorFollowFallingNotes
            ? Math.max(0, Math.min(100, (animDoubleSplitTuts / STRING_TUTS_MAX) * 100))
            : Math.max(0, Math.min(100, (strikeLineSplitTuts / STRING_TUTS_MAX) * 100));
        // Centered within each side of the split, not at 0%/100%, so the
        // blend zone straddles the actual split boundary regardless of
        // where it sits (a lopsided split still gets a sensibly-placed
        // transition instead of one that's always stuck in the middle).
        auraStops = [
            { pct: splitPct / 2, color: lineColor },
            { pct: splitPct + (100 - splitPct) / 2, color: rightSaturatedColor }
        ];
    }
    document.body.classList.toggle('strikeLine-multiColor', !!auraStops);
    if(auraStops){
        // #strikeLineAuraSegments' own ::before/::after still layer the
        // smoke/shadow radial blobs (--strike-line-smoke-a/b,
        // --strike-line-shadow-a/b) underneath the correctly multi-stop
        // --strike-line-multi-tint-a/b gradient — they used to be a flat
        // single colour (lineColor, i.e. the Left/first stop only), which
        // bled that one colour across the split's OTHER colour(s), and
        // simply zeroing them to transparent (an earlier fix) killed the
        // only genuinely moving/repeating layers, leaving the aura static.
        // Repointed at WHITE instead of lineColor, with the CSS now
        // screen-blending these layers onto the tint (background-blend-mode
        // on #strikeLineAuraSegments::before/::after): screen only ever
        // brightens what's underneath, it can't shift its hue, so the
        // moving radial blobs read as a travelling shimmer over the correct
        // per-x colour instead of a wrong flat colour bleeding through it.
        // Alphas scaled down from the single-colour case — a shimmer this
        // bright reads as blown-out/washed-out rather than a soft highlight.
        document.documentElement.style.setProperty('--strike-line-smoke-a', hexToRgbaString('#ffffff', Math.min(0.42, smokeAlphaA * 0.55)));
        document.documentElement.style.setProperty('--strike-line-smoke-b', hexToRgbaString('#ffffff', Math.min(0.30, smokeAlphaB * 0.55)));
        document.documentElement.style.setProperty('--strike-line-shadow-a', hexToRgbaString('#ffffff', Math.min(0.34, shadowAlphaA * 0.55)));
        document.documentElement.style.setProperty('--strike-line-shadow-b', hexToRgbaString('#ffffff', Math.min(0.22, shadowAlphaB * 0.55)));
    }
    updateStrikeLineAuraSegments(auraStops, shadowAlphaA, shadowAlphaB);
}
// Gradient/Rainbow/Split aura: a single continuous multi-stop CSS gradient
// instead of one blurred/masked DOM node per colour stop. The old approach
// (up to 13 stops x 2 pseudo-elements = 26 blurred/masked/screen-blended
// layers, all animating at once) was the actual source of the mobile
// frame-rate drop during fast passages in Gradient/Rainbow mode -- costly
// enough that input-burst-mode had to freeze the aura's animation outright
// to stay smooth. A native linear-gradient is interpolated by the browser
// itself (can never show a seam between colours) and costs the same single
// element #strikeLineAuraSegments's own ::before/::after already use for
// the wave-crest layers -- see the CSS for how var(--strike-line-multi-
// tint-a/b) slot into that shared recipe.
function updateStrikeLineAuraSegments(stops, shadowAlphaA, shadowAlphaB){
    const container = document.getElementById('strikeLineAuraSegments');
    if(!container) return;
    if(!stops || !stops.length){
        container.style.removeProperty('--strike-line-multi-tint-a');
        container.style.removeProperty('--strike-line-multi-tint-b');
        return;
    }
    const stopStr = alpha => stops.map(s => `${hexToRgbaString(s.color, alpha)} ${s.pct.toFixed(2)}%`).join(', ');
    container.style.setProperty('--strike-line-multi-tint-a', `linear-gradient(to right, ${stopStr(Math.min(0.66, shadowAlphaA))})`);
    container.style.setProperty('--strike-line-multi-tint-b', `linear-gradient(to right, ${stopStr(Math.min(0.42, shadowAlphaB))})`);
}
function setStrikeLineColor(color){
    strikeLineColor = normalizeHexColor(color) || '#ffffff';
    updateColorPadValue('gridStrikeLine', strikeLineColor);
    updateStrikeLineLine();
}
function setStrikeLineColorSplit(on){
    strikeLineColorSplit = !!on;
    const track = document.getElementById('strikeLineColorSplitTrack');
    if(track) track.classList.toggle('active', strikeLineColorSplit);
    updateStrikeLineColorModeControls();
    updateStrikeLineLine();
}
function setStrikeLineColorFollowFallingNotes(on){
    strikeLineColorFollowFallingNotes = !!on;
    const track = document.getElementById('strikeLineColorFollowFallingTrack');
    if(track) track.classList.toggle('active', strikeLineColorFollowFallingNotes);
    updateStrikeLineColorModeControls();
    updateStrikeLineLine();
}
function setStrikeLineLeftColor(color){
    strikeLineLeftColor = normalizeHexColor(color) || '#ffffff';
    updateColorPadValue('gridStrikeLineLeft', strikeLineLeftColor);
    if(strikeLineColorSplit) updateStrikeLineLine();
}
function setStrikeLineRightColor(color){
    strikeLineRightColor = normalizeHexColor(color) || '#ffffff';
    updateColorPadValue('gridStrikeLineRight', strikeLineRightColor);
    if(strikeLineColorSplit) updateStrikeLineLine();
}
function setStrikeLineSplitTuts(value){
    strikeLineSplitTuts = clampStringTuts(value, strikeLineSplitTuts || 44);
    const range = document.getElementById('strikeLineSplitRange');
    if(range && range.value !== String(strikeLineSplitTuts)) range.value = strikeLineSplitTuts;
    if(strikeLineColorSplit) updateStrikeLineLine();
}
function updateStrikeLineColorModeControls(){
    const rowColor = document.getElementById('rowStrikeLineColor');
    const rowSplitTuts = document.getElementById('rowStrikeLineSplitTuts');
    const rowSplitColors = document.getElementById('rowStrikeLineSplitColors');
    // Following Falling Notes borrows its colour scheme entirely, so the
    // Strike Line's own Split Color controls are moot while it's on.
    const showSplitDoubleControls = !strikeLineColorFollowFallingNotes && strikeLineColorSplit;
    if(rowColor) rowColor.style.display = (strikeLineColorFollowFallingNotes || strikeLineColorSplit) ? 'none' : '';
    if(rowSplitTuts){
        rowSplitTuts.style.display = showSplitDoubleControls ? '' : 'none';
        rowSplitTuts.classList.toggle('active', showSplitDoubleControls);
    }
    if(rowSplitColors){
        rowSplitColors.style.display = showSplitDoubleControls ? '' : 'none';
        rowSplitColors.classList.toggle('active', showSplitDoubleControls);
    }
}
function setDustColor(color){
    dustColor = normalizeHexColor(color) || '#ffffff';
    updateColorPadValue('gridDust', dustColor);
    _clearDustSpriteCache();
}
function setDustDoubleLeftColor(color){
    dustDoubleLeftColor = normalizeHexColor(color) || '#ffffff';
    updateColorPadValue('gridDustDoubleLeft', dustDoubleLeftColor);
    _clearDustSpriteCache();
}
function setDustDoubleRightColor(color){
    dustDoubleRightColor = normalizeHexColor(color) || '#ffffff';
    updateColorPadValue('gridDustDoubleRight', dustDoubleRightColor);
    _clearDustSpriteCache();
}
function setDustDoubleSplitTuts(value){
    dustDoubleSplitTuts = clampStringTuts(value, dustDoubleSplitTuts || 44);
    const range = document.getElementById('dustDoubleSplitRange');
    if(range && range.value !== String(dustDoubleSplitTuts)) range.value = dustDoubleSplitTuts;
}
// Split Color (double) for Particles — same independent on/off pattern as the
// Falling Notes Split Color: it just swaps which colour(s) feed the plume and
// contact flare, every other particle setting (count/size/speed/turbulence/
// fade/saturation/Strike Reaction) stays exactly as-is.
function setDustColorSplit(on){
    dustColorSplit = !!on;
    const track = document.getElementById('dustColorSplitTrack');
    if(track) track.classList.toggle('active', dustColorSplit);
    _clearDustSpriteCache();
    updateDustModeControls();
}
function setDustColorFollowFallingNotes(on){
    dustColorFollowFallingNotes = !!on;
    const track = document.getElementById('dustColorFollowFallingTrack');
    if(track) track.classList.toggle('active', dustColorFollowFallingNotes);
    _clearDustSpriteCache();
    updateDustModeControls();
}
function updateDustModeControls(){
    const rowDustColor = document.getElementById('rowDustColor');
    const rowDustDoubleSplit = document.getElementById('rowDustDoubleSplit');
    const rowDustDoubleColors = document.getElementById('rowDustDoubleColors');
    // Following Falling Notes borrows its colour scheme entirely, so the
    // Particle's own Split/single colour pickers are moot while it's on.
    const showSplitDoubleControls = !dustColorFollowFallingNotes && dustColorSplit;
    if(rowDustColor) rowDustColor.style.display = (dustColorFollowFallingNotes || dustColorSplit) ? 'none' : '';
    if(rowDustDoubleSplit){
        rowDustDoubleSplit.style.display = showSplitDoubleControls ? '' : 'none';
        rowDustDoubleSplit.classList.toggle('active', showSplitDoubleControls);
    }
    if(rowDustDoubleColors){
        rowDustDoubleColors.style.display = showSplitDoubleControls ? '' : 'none';
        rowDustDoubleColors.classList.toggle('active', showSplitDoubleControls);
    }
}
function syncStrikeLineFxButtons(){
    const strikeLineTrack = document.getElementById('strikeLineEnabledTrack');
    const particleTrack = document.getElementById('particleEnabledTrack');
    const settingsStrikeLineTrack = document.getElementById('settingsStrikeLineTrack');
    const settingsDustTrack = document.getElementById('settingsDustTrack');
    const amountRange = document.getElementById('settingsDustAmountRange');
    const amountVal = document.getElementById('settingsDustAmountVal');
    const strikeReactionTrack = document.getElementById('strikeReactionTrack');
    if(strikeReactionTrack){ strikeReactionTrack.classList.toggle('active', strikeReactionEnabled); }
    if(strikeLineTrack){ strikeLineTrack.classList.toggle('active', strikeLineEnabled); }
    if(settingsStrikeLineTrack){ settingsStrikeLineTrack.classList.toggle('active', strikeLineEnabled); }
    if(settingsDustTrack){ settingsDustTrack.classList.toggle('active', strikeLineDustEnabled); }
    if(particleTrack){ particleTrack.classList.toggle('active', strikeLineDustEnabled); }
    const amountRangeMain = document.getElementById('dustAmountRange');
    const amountValMain = document.getElementById('dustAmountVal');
    if(amountRange) amountRange.value = particleCount;
    if(amountRangeMain) amountRangeMain.value = particleCount;
    const label = particleCount + '%';
    if(amountVal) amountVal.textContent = label;
    if(amountValMain) amountValMain.textContent = label;
}
function setStrikeLineFx(part, value){
    if(part === 'strikeLine') strikeLineEnabled = !!value;
    else if(part === 'dust') strikeLineDustEnabled = !!value;
    else if(part === 'strikeReaction') strikeReactionEnabled = !!value;
    // Emitters serve both the plume and the flare: only clear them when BOTH
    // effects are off, otherwise turning off particles would also cut the
    // strike-reaction flare of held keys (and vice versa).
    if(!strikeLineDustEnabled) neonDustCount = 0;
    if(!strikeLineDustEnabled && !strikeReactionEnabled) neonDustEmitters.clear();
    syncStrikeLineFxButtons();
    updateStrikeLineLine();
}
function setStrikeReactionIntensity(value){
    strikeReactionIntensity = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
    const range = document.getElementById('strikeReactionRange');
    const label = document.getElementById('strikeReactionVal');
    if(range && range.value !== String(strikeReactionIntensity)) range.value = String(strikeReactionIntensity);
    if(label) label.textContent = strikeReactionIntensity + '%';
}
function setParticleSetting(name, value){
    // Count & Size are capped at 50% (0-50 sliders); the rest stay 0-100.
    const maxV = (name === 'count' || name === 'size') ? 50 : 100;
    const v = Math.max(0, Math.min(maxV, Math.round(Number(value) || 0)));
    const map = {
        count: ['particleCount', 'particleCountRange', 'particleCountVal'],
        size: ['particleSize', 'particleSizeRange', 'particleSizeVal'],
        opacity: ['particleOpacity', 'particleOpacityRange', 'particleOpacityVal'],
        speed: ['particleSpeed', 'particleSpeedRange', 'particleSpeedVal'],
        turbulence: ['particleTurbulence', 'particleTurbulenceRange', 'particleTurbulenceVal'],
        saturation: ['particleSaturation', 'particleSaturationRange', 'particleSaturationVal'],
        fade: ['particleFade', 'particleFadeRange', 'particleFadeVal']
    };
    const meta = map[name];
    if(!meta) return;
    if(name === 'count') { particleCount = v; strikeLineDustAmount = v; }
    else if(name === 'size') { particleSize = v; strikeLineDustSize = v; _clearDustSpriteCache(); }
    else if(name === 'opacity') { particleOpacity = v; }
    else if(name === 'speed') { particleSpeed = v; }
    else if(name === 'turbulence') { particleTurbulence = v; }
    else if(name === 'saturation') { particleSaturation = v; }
    else if(name === 'fade') { particleFade = v; }
    const range = document.getElementById(meta[1]);
    const label = document.getElementById(meta[2]);
    if(range) range.value = v;
    if(label) label.textContent = v + '%';
    syncStrikeLineFxButtons();
}
function setStrikeLineDustSize(value){
    setParticleSetting('size', value);
}
function setStrikeLineDustAmount(value){
    setParticleSetting('count', value);
}
function setStrikeLineMotion(mode){
    strikeLineMotion = 'static';
    updateStrikeLineLine();
}
function setDustBlendMode(mode){
    dustBlendMode = mode === 'glow' ? 'glow' : 'solid';
    const glowBtn = document.getElementById('dustBlendGlow');
    const solidBtn = document.getElementById('dustBlendSolid');
    if(glowBtn) glowBtn.classList.toggle('active', dustBlendMode === 'glow');
    if(solidBtn) solidBtn.classList.toggle('active', dustBlendMode === 'solid');
    // V2 'solid' draws dust IN FRONT of the falling notes — on the WebGL layer
    // that is a CSS z-index lift (the GL canvas is a separate layer).
    const _stageEl = document.querySelector('.stage');
    if(_stageEl) _stageEl.classList.toggle('dust-front', dustBlendMode === 'solid');
    if(typeof ensureAnimLoop === 'function' && falling.length > 0) ensureAnimLoop();
}
function setKeyGlowEnabled(on){
    keyGlowEnabled = !!on;
    document.body.classList.toggle('key-glow-on', keyGlowEnabled);
    const track = document.getElementById('keyGlowTrack');
    if(track){ track.classList.toggle('active', keyGlowEnabled); }
}
function setKeyGlowIntensity(v){
    const n = Math.max(0, Math.min(100, parseInt(v, 10) || 0));
    const boost = 1.75;
    const glowPower = n / 100 * boost;
    const spread = n / 50 * boost;
    keyGlowIntensity = n;
    document.documentElement.style.setProperty('--key-glow-intensity', glowPower.toFixed(2));
    document.documentElement.style.setProperty('--key-glow-opacity', Math.min(1, glowPower).toFixed(2));
    document.documentElement.style.setProperty('--key-glow-spread', spread.toFixed(2));
    // Blur radius is capped separately from the box-shadow spread: a large
    // filter:blur() combined with mask-image + transform on the same layer
    // triggers a GPU compositor glitch on mobile Safari/Chrome (the key
    // layout appears to tear/shift) once the spread exceeds ~2x. Box-shadow
    // glow keeps scaling to the full value; only the blurred highlight is
    // clamped so intensity 100% no longer breaks mobile rendering.
    document.documentElement.style.setProperty('--key-glow-blur-spread', Math.min(2, spread).toFixed(2));
    const range = document.getElementById('keyGlowIntensityRange');
    const val = document.getElementById('keyGlowIntensityVal');
    if(range && range.value != n) range.value = n;
    if(val) val.textContent = n + '%';
}
function setNoteGlowIntensity(v){
    const n = Math.max(0, Math.min(200, parseInt(v, 10) || 0));
    noteGlowIntensity = n;
    // Sprite keys include the glow value (see getEffectSprite/getGradientSprite),
    // so stale sprites just age out of the LRU -- no need to wipe the whole
    // cache on every continuous 'input' tick while dragging this slider.
    const shown = Math.round(n / 2);
    ['noteGlowIntensityRange', 'settingsNoteGlowIntensityRange'].forEach(id => {
        const el = document.getElementById(id);
        if(el && el.value != shown) el.value = shown;
    });
    ['noteGlowIntensityVal', 'settingsNoteGlowIntensityVal'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.textContent = shown + '%';
    });
}
function setNoteGlowEnabled(on){
    noteGlowEnabled = !!on;
    clearEffectSpriteCache();
    const track = document.getElementById('noteGlowTrack');
    const settingsTrack = document.getElementById('settingsNoteGlowTrack');
    if(track) track.classList.toggle('active', noteGlowEnabled);
    if(settingsTrack) settingsTrack.classList.toggle('active', noteGlowEnabled);
    if(typeof ensureAnimLoop === 'function' && falling.length > 0) ensureAnimLoop();
}
function setAnimColor(color){
    const nextColor = normalizeHexColor(color) || '#ffffff';
    if(_activeColorPadIntent === 'user'){
        customAnimNote = nextColor;
    } else if(_activeColorPadIntent === 'reset'){
        customAnimNote = null;
    } else if(color === null || color === undefined){
        customAnimNote = null;
    } else {
        customAnimNote = (nextColor.toLowerCase() === '#ffffff') ? null : nextColor;
    }
    document.documentElement.style.setProperty('--anim-color', nextColor);
    refreshAnimColor();
    currentGlassColor = nextColor;
    syncFallingNoteVisualState();
    updateColorPadValue('gridAnim', nextColor);
    syncColorPadsToEffectiveColors();
}
function setAnimDoubleLeftColor(color){
    animDoubleLeftColor = normalizeHexColor(color) || '#ffffff';
    updateColorPadValue('gridAnimDoubleLeft', animDoubleLeftColor);
    if(animColorSplit) syncFallingNoteVisualState();
}
function setAnimDoubleRightColor(color){
    animDoubleRightColor = normalizeHexColor(color) || '#ffffff';
    updateColorPadValue('gridAnimDoubleRight', animDoubleRightColor);
    if(animColorSplit) syncFallingNoteVisualState();
}
function setAnimDoubleSplitTuts(value){
    animDoubleSplitTuts = clampStringTuts(value, animDoubleSplitTuts || 44);
    const range = document.getElementById('animDoubleSplitRange');
    if(range && range.value !== String(animDoubleSplitTuts)) range.value = animDoubleSplitTuts;
    if(animColorSplit) syncFallingNoteVisualState();
}
// Split Color toggle: independent of Style, works with any style (Single,
// Glass, Outline, Midnight, Gradient, Rainbow). Rainbow ignores the base
// color for its own hue-per-note rendering, but the split state still
// persists/toggles normally so switching back to a solid-color style keeps it.
function setAnimColorSplit(on){
    animColorSplit = !!on;
    const track = document.getElementById('animColorSplitTrack');
    const settingsTrack = document.getElementById('settingsAnimColorSplitTrack');
    if(track) track.classList.toggle('active', animColorSplit);
    if(settingsTrack) settingsTrack.classList.toggle('active', animColorSplit);
    syncFallingNoteVisualState();
    updateAnimModeControls();
}
function setAnimKeyShade(on){
    animKeyShade = !!on;
    const track = document.getElementById('animKeyShadeTrack');
    if(track) track.classList.toggle('active', animKeyShade);
    syncFallingNoteVisualState();
}
function updateAnimModeControls(){
    const glowOk = styleTakesGlow(animStyle);
    ['rowNoteGlow', 'rowNoteGlowIntensity', 'rowSettingsNoteGlow'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.style.display = glowOk ? '' : 'none';
    });
    // Which colour-source row shows is now driven entirely by Colour Mode
    // (see animColorModeBtns) — Style no longer has any say in it, since
    // every Style just renders whatever colour Mode hands it.
    const showColor = animColorMode === 'single' && !animColorSplit;
    const showSplit = animColorMode === 'double' || animColorSplit;
    const showGradient = animColorMode === 'gradient';
    // Black/White Key Shade only means anything where every note otherwise
    // shares one flat colour -- Gradient/Rainbow already vary per note.
    const rowAnimKeyShade = document.getElementById('rowAnimKeyShade');
    if(rowAnimKeyShade) rowAnimKeyShade.style.display = (showGradient || animColorMode === 'rainbow') ? 'none' : '';
    const rowAnimColor = document.getElementById('rowAnimColor');
    const rowAnimDoubleSplit = document.getElementById('rowAnimDoubleSplit');
    const rowAnimDoubleColors = document.getElementById('rowAnimDoubleColors');
    if(rowAnimColor) rowAnimColor.style.display = showColor ? '' : 'none';
    if(rowAnimDoubleSplit){
        rowAnimDoubleSplit.style.display = showSplit ? '' : 'none';
        rowAnimDoubleSplit.classList.toggle('active', showSplit);
    }
    if(rowAnimDoubleColors){
        rowAnimDoubleColors.style.display = showSplit ? '' : 'none';
        rowAnimDoubleColors.classList.toggle('active', showSplit);
    }
    // Quick panel (rowAnimGradient) and full settings panel
    // (rowAnimGradientSettings) are two separate DOM copies of the same
    // control — same pattern as sizeRange/settingsSizeRange — so both need
    // toggling here.
    ['rowAnimGradient', 'rowAnimGradientSettings'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.style.display = showGradient ? '' : 'none';
    });
    // Axis is a Gradient-only concept: Rainbow is an explicit fixed colour
    // per key (see RAINBOW_NOTE_COLORS) and has no sweep to re-orient — and
    // no settings rows of its own at all.
    ['rowAnimAxis', 'rowAnimAxisSettings'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.style.display = showGradient ? '' : 'none';
    });
    Object.keys(animColorModeBtns).forEach(id => {
        const el = document.getElementById(id);
        if(el) el.classList.toggle('active', animColorModeBtns[id] === animColorMode);
    });
    document.querySelectorAll('[data-color-mode-target]').forEach(btn => {
        btn.classList.toggle('active', animColorModeBtns[btn.dataset.colorModeTarget] === animColorMode);
    });
}
function setAnimColorMode(mode){
    if(mode !== 'single' && mode !== 'double' && mode !== 'gradient' && mode !== 'rainbow') return;
    animColorMode = mode;
    // 'double' is presented as one Mode button but still backed by the
    // existing animColorSplit boolean underneath (see setAnimColorSplit) —
    // keep the two in sync so the older toggle-driven row logic still works.
    animColorSplit = mode === 'double';
    syncFallingNoteVisualState();
    updateAnimModeControls();
}
// Color Spread: 1-3 stops. Toggles which of the 3 colour-pad rows are
// visible (row N only makes sense once Spread >= N) and re-mounts any pad
// that isn't already showing its current colour.
function setGradientColorCount(n){
    gradientColorCount = Math.max(1, Math.min(3, Math.round(Number(n) || 1)));
    ['gradientSpread', 'settingsGradientSpread'].forEach(prefix => {
        document.querySelectorAll(`.${prefix}-btn`).forEach(btn => {
            btn.classList.toggle('active', Number(btn.dataset.count) === gradientColorCount);
        });
    });
    for(let i = 1; i <= 3; i++){
        const row = document.getElementById('rowGradientColor' + i);
        if(row) row.style.display = i <= gradientColorCount ? '' : 'none';
    }
    populateGradientColorGrids();
    syncFallingNoteVisualState();
}
function setGradientColor(index, color){
    gradientColors[index] = normalizeHexColor(color) || gradientColors[index];
    updateColorPadValue('gridGradientColor' + (index + 1), gradientColors[index]);
    syncFallingNoteVisualState();
}
function populateGradientColorGrids(){
    for(let i = 0; i < gradientColorCount; i++){
        mountColorPad('gridGradientColor' + (i + 1), `Color ${i + 1}`, gradientColors[i], c => setGradientColor(i, c), gradientColors[i]);
    }
}
function setGradientIntensity(v){
    gradientIntensity = Math.max(0, Math.min(100, Math.round(Number(v) || 0)));
    ['gradientIntensityRange', 'settingsGradientIntensityRange'].forEach(id => {
        const el = document.getElementById(id);
        if(el && el.value != gradientIntensity) el.value = gradientIntensity;
    });
    ['gradientIntensityVal', 'settingsGradientIntensityVal'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.textContent = gradientIntensity + '%';
    });
    syncFallingNoteVisualState();
}
// Axis: which position drives the Gradient sweep (Gradient mode only —
// Rainbow is a fixed colour per key and doesn't sweep).
function setGradientAxis(axis){
    if(axis === 'mix') axis = 'vertical'; // retired blend axis from the Visualizer trial
    if(axis !== 'horizontal' && axis !== 'vertical') return;
    gradientAxis = axis;
    document.querySelectorAll('.gradient-axis-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.axis === axis);
    });
    syncFallingNoteVisualState();
}
function populateAnimGrid(){
    // Same boot-order issue as populateGrid() above: applyFactoryDefaults()
    // already applied the real default (#0099ff) to --anim-color/
    // customAnimNote before this pad is ever mounted, so seed the swatch from
    // the value actually in effect instead of hardcoding white.
    const seat = (typeof _mpSelfSeatColor !== 'undefined' && _mpSelfSeatColor) || '';
    const cssAnim = getComputedStyle(document.documentElement).getPropertyValue('--anim-color').trim();
    const current = customAnimNote || seat || cssAnim || '#ffffff';
    mountColorPad('gridAnim', 'Note Color', current, setAnimColor, '#ffffff');
}
function populateAnimDoubleGrids(){
    mountColorPad('gridAnimDoubleLeft', 'Left Color', animDoubleLeftColor, setAnimDoubleLeftColor, '#0099ff');
    mountColorPad('gridAnimDoubleRight', 'Right Color', animDoubleRightColor, setAnimDoubleRightColor, '#0099ff');
}
function populateStrikeLineGrid(){
    mountColorPad('gridStrikeLine', 'Strike Color', strikeLineColor || '#0099ff', setStrikeLineColor, '#0099ff');
}
function populateStrikeLineDoubleGrids(){
    mountColorPad('gridStrikeLineLeft', 'Left Color', strikeLineLeftColor, setStrikeLineLeftColor, '#0099ff');
    mountColorPad('gridStrikeLineRight', 'Right Color', strikeLineRightColor, setStrikeLineRightColor, '#0099ff');
}
function populateDustGrid(){
    mountColorPad('gridDust', 'Particle Color', dustColor || '#0099ff', setDustColor, '#0099ff');
}
function populateDustDoubleGrids(){
    mountColorPad('gridDustDoubleLeft', 'Left Color', dustDoubleLeftColor, setDustDoubleLeftColor, '#0099ff');
    mountColorPad('gridDustDoubleRight', 'Right Color', dustDoubleRightColor, setDustDoubleRightColor, '#0099ff');
}
populateGrid('gridWhiteTuts', setWhiteKeyColor); populateGrid('gridBlackTuts', setBlackKeyColor); populateAnimGrid(); populateAnimDoubleGrids(); populateStrikeLineGrid(); populateStrikeLineDoubleGrids(); populateDustGrid(); populateDustDoubleGrids();
setAnimDoubleSplitTuts(animDoubleSplitTuts);
updateAnimModeControls();
document.getElementById('animDoubleSplitRange')?.addEventListener('input', e => setAnimDoubleSplitTuts(e.target.value));
document.getElementById('animColorSplitTrack')?.addEventListener('click', () => setAnimColorSplit(!animColorSplit));
document.getElementById('settingsAnimColorSplitTrack')?.addEventListener('click', () => setAnimColorSplit(!animColorSplit));
document.getElementById('animKeyShadeTrack')?.addEventListener('click', () => setAnimKeyShade(!animKeyShade));
setDustDoubleSplitTuts(dustDoubleSplitTuts);
updateDustModeControls();
document.getElementById('dustDoubleSplitRange')?.addEventListener('input', e => setDustDoubleSplitTuts(e.target.value));
document.getElementById('dustColorSplitTrack')?.addEventListener('click', () => setDustColorSplit(!dustColorSplit));
document.getElementById('dustColorFollowFallingTrack')?.addEventListener('click', () => setDustColorFollowFallingNotes(!dustColorFollowFallingNotes));
document.getElementById('keyColorFollowFallingTrack')?.addEventListener('click', () => setKeyColorFollowFallingNotes(!keyColorFollowFallingNotes));
setStrikeLineSplitTuts(strikeLineSplitTuts);
updateStrikeLineColorModeControls();
document.getElementById('strikeLineSplitRange')?.addEventListener('input', e => setStrikeLineSplitTuts(e.target.value));
document.getElementById('strikeLineColorSplitTrack')?.addEventListener('click', () => setStrikeLineColorSplit(!strikeLineColorSplit));
document.getElementById('strikeLineColorFollowFallingTrack')?.addEventListener('click', () => setStrikeLineColorFollowFallingNotes(!strikeLineColorFollowFallingNotes));
document.getElementById('strikeLineEnabledTrack')?.addEventListener('click', () => setStrikeLineFx('strikeLine', !strikeLineEnabled));
document.getElementById('settingsStrikeLineTrack')?.addEventListener('click', () => setStrikeLineFx('strikeLine', !strikeLineEnabled));
document.getElementById('strikeReactionTrack')?.addEventListener('click', () => setStrikeLineFx('strikeReaction', !strikeReactionEnabled));
document.getElementById('strikeReactionRange')?.addEventListener('input', e => setStrikeReactionIntensity(e.target.value));
setStrikeReactionIntensity(strikeReactionIntensity);
document.getElementById('settingsDustTrack')?.addEventListener('click', () => setStrikeLineFx('dust', !strikeLineDustEnabled));
document.getElementById('particleEnabledTrack')?.addEventListener('click', () => setStrikeLineFx('dust', !strikeLineDustEnabled));
document.getElementById('dustBlendGlow')?.addEventListener('click', () => setDustBlendMode('glow'));
document.getElementById('dustBlendSolid')?.addEventListener('click', () => setDustBlendMode('solid'));
setDustBlendMode(dustBlendMode);
document.getElementById('keyGlowTrack')?.addEventListener('click', () => setKeyGlowEnabled(!keyGlowEnabled));
document.getElementById('keyGlowIntensityRange')?.addEventListener('input', e => setKeyGlowIntensity(e.target.value));
setKeyGlowEnabled(keyGlowEnabled);
setKeyGlowIntensity(keyGlowIntensity);
['noteGlowIntensityRange', 'settingsNoteGlowIntensityRange'].forEach(id => document.getElementById(id)?.addEventListener('input', e => setNoteGlowIntensity((parseInt(e.target.value, 10) || 0) * 2)));
setNoteGlowIntensity(noteGlowIntensity);
document.getElementById('noteGlowTrack')?.addEventListener('click', () => setNoteGlowEnabled(!noteGlowEnabled));
document.getElementById('settingsNoteGlowTrack')?.addEventListener('click', () => setNoteGlowEnabled(!noteGlowEnabled));
setNoteGlowEnabled(noteGlowEnabled);
document.getElementById('octaveLinesTrack')?.addEventListener('click', () => setOctaveLinesEnabled(!octaveLinesEnabled));
setOctaveLinesEnabled(octaveLinesEnabled);
document.getElementById('chordTextSizeRange')?.addEventListener('input', e => setChordTextScale(e.target.value));
setChordTextScale(chordTextScale);
document.getElementById('keyLabelSizeRange')?.addEventListener('input', e => setKeyLabelScale(e.target.value));
setKeyLabelScale(keyLabelScale);
document.getElementById('settingsDustAmountRange')?.addEventListener('input', e => setStrikeLineDustAmount(e.target.value));
document.getElementById('dustAmountRange')?.addEventListener('input', e => setStrikeLineDustAmount(e.target.value));
document.getElementById('particleCountRange')?.addEventListener('input', e => setParticleSetting('count', e.target.value));
document.getElementById('particleSizeRange')?.addEventListener('input', e => setParticleSetting('size', e.target.value));
document.getElementById('particleOpacityRange')?.addEventListener('input', e => setParticleSetting('opacity', e.target.value));
document.getElementById('particleSpeedRange')?.addEventListener('input', e => setParticleSetting('speed', e.target.value));
document.getElementById('particleTurbulenceRange')?.addEventListener('input', e => setParticleSetting('turbulence', e.target.value));
document.getElementById('particleSaturationRange')?.addEventListener('input', e => setParticleSetting('saturation', e.target.value));
document.getElementById('particleFadeRange')?.addEventListener('input', e => setParticleSetting('fade', e.target.value));
document.getElementById('strikeLineBrightnessRange')?.addEventListener('input', e => setStrikeLineVisualSetting('brightness', e.target.value));
document.getElementById('strikeLineOpacityRange')?.addEventListener('input', e => setStrikeLineVisualSetting('opacity', e.target.value));
document.getElementById('strikeLineSaturationRange')?.addEventListener('input', e => setStrikeLineVisualSetting('saturation', e.target.value));
document.getElementById('strikeLineMotionRange')?.addEventListener('input', e => setMotionSpeed(e.target.value));
setStrikeLineVisualSetting('brightness', strikeLineBrightness);
setStrikeLineVisualSetting('opacity', strikeLineOpacity);
setStrikeLineVisualSetting('saturation', strikeLineSaturation);
setMotionSpeed(motionSpeed);
setParticleSetting('count', particleCount);
setParticleSetting('size', particleSize);
setParticleSetting('opacity', particleOpacity);
setParticleSetting('speed', particleSpeed);
setParticleSetting('turbulence', particleTurbulence);
setParticleSetting('saturation', particleSaturation);
setParticleSetting('fade', particleFade);
syncStrikeLineFxButtons();
updateStrikeLineLine();

currentGlassColor = currentGlassColor || '#ffffff';
// 'liquid'/'batik' are retired. LEGACY_STYLE already resolves them (to
// Glass and Single respectively) for saved presets, so the live setting
// has to land in the same place — one name, one answer.
if(animStyle === 'liquid') animStyle = 'glass';
if(animStyle === 'batik') animStyle = 'single';
if(animStyle === 'crystal3d' || animStyle === 'cleanNeon' || animStyle === 'clean' || animStyle === 'rainbowV2' || animStyle === 'default' || animStyle === 'rainbow') animStyle = 'single';
function updateAnimMode(id){
    Object.keys(animModeBtns).forEach(b=>{ const el=document.getElementById(b); if(el) el.classList.toggle('active',b===id); });
    document.querySelectorAll('.settings-anim-style').forEach(btn => btn.classList.toggle('active', btn.dataset.styleTarget === id));
    updateAnimModeControls();
}
function setAnimModeById(id){
    if(id === 'mRainbowV2') id = 'mRainbow';
    const mode = animModeBtns[id];
    if(!mode) return;
    refreshAnimColor();
    animStyle = mode;
    syncFallingNoteVisualState();
    _tunedCacheR = _tunedCacheG = _tunedCacheB = -1;
    _tunedCacheSat = _tunedCacheBright = -1;
    if(ctx2d){
        ctx2d.globalAlpha = 1;
        ctx2d.globalCompositeOperation = 'source-over';
    }
    renderNow = performance.now();
    updateAnimMode(id);
    if(typeof ensureAnimLoop === 'function') ensureAnimLoop();
}
Object.entries(animModeBtns).forEach(([id]) => {
    const el = document.getElementById(id);
    if (el) el.onclick = () => setAnimModeById(id);
});
document.querySelectorAll('.settings-anim-style').forEach(btn => {
    btn.onclick = () => setAnimModeById(btn.dataset.styleTarget);
});
Object.entries(animColorModeBtns).forEach(([id, mode]) => {
    document.querySelectorAll(`[data-color-mode-target="${id}"], #${id}`).forEach(el => {
        el.onclick = () => setAnimColorMode(mode);
    });
});
document.querySelectorAll('.gradientSpread-btn, .settingsGradientSpread-btn').forEach(btn => {
    btn.onclick = () => setGradientColorCount(btn.dataset.count);
});
['gradientIntensityRange', 'settingsGradientIntensityRange'].forEach(id => document.getElementById(id)?.addEventListener('input', e => setGradientIntensity(e.target.value)));
document.querySelectorAll('.gradient-axis-btn').forEach(btn => {
    btn.onclick = () => setGradientAxis(btn.dataset.axis);
});
setAnimColorMode(animColorMode);
setGradientColorCount(gradientColorCount);
setGradientIntensity(gradientIntensity);
setGradientAxis(gradientAxis);

const customBgLayer=document.getElementById('customBgLayer');
const customBgVideo=document.getElementById('customBgVideo');
const customBgDimLayer=document.getElementById('customBgDimLayer');
const bgImgInput=document.getElementById('bgImgInput');
const bgImgRemove=document.getElementById('bgImgRemove');
const bgOpacityRange=document.getElementById('bgOpacityRange');
const bgOpacityVal=document.getElementById('bgOpacityVal');
const bgDimRange=document.getElementById('bgDimRange');
const bgDimVal=document.getElementById('bgDimVal');
const bgBlurRange=document.getElementById('bgBlurRange');
const bgBlurVal=document.getElementById('bgBlurVal');
let customBgUrl=null;
let bgFitMode='cover';
let bgPositionMode='center';
function setBgFitMode(mode){
    bgFitMode = ['cover','contain','stretch'].includes(mode) ? mode : 'cover';
    if(customBgLayer) customBgLayer.style.backgroundSize = bgFitMode === 'stretch' ? '100% 100%' : bgFitMode;
    if(customBgVideo) customBgVideo.style.objectFit = bgFitMode === 'stretch' ? 'fill' : bgFitMode;
    document.querySelectorAll('.bg-fit-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.bgFit === bgFitMode));
}
function setBgPositionMode(mode){
    bgPositionMode = ['center','top','bottom'].includes(mode) ? mode : 'center';
    const pos = bgPositionMode === 'top' ? 'center top' : (bgPositionMode === 'bottom' ? 'center bottom' : 'center center');
    if(customBgLayer) customBgLayer.style.backgroundPosition = pos;
    if(customBgVideo) customBgVideo.style.objectPosition = pos;
    document.querySelectorAll('.bg-pos-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.bgPosition === bgPositionMode));
}
function applyBgImageSettings(){
    const opacity=Math.max(0,Math.min(100,Number(bgOpacityRange?.value ?? 100)));
    const dim=Math.max(0,Math.min(100,Number(bgDimRange?.value ?? 0)));
    const blur=Math.max(0,Math.min(20,Number(bgBlurRange?.value ?? 0)));
    document.documentElement.style.setProperty('--custom-bg-opacity', opacity/100);
    document.documentElement.style.setProperty('--custom-bg-dim', dim/100);
    document.documentElement.style.setProperty('--custom-bg-blur', blur+'px');
    document.documentElement.style.setProperty('--custom-bg-scale', blur>0 ? '1.04' : '1');
    if(bgOpacityVal) bgOpacityVal.textContent=opacity+'%';
    if(bgDimVal) bgDimVal.textContent=dim+'%';
    if(bgBlurVal) bgBlurVal.textContent=blur+'px';
    setBgFitMode(bgFitMode);
    setBgPositionMode(bgPositionMode);
}
// Background accepts an image (incl. animated GIF, which browsers already
// animate fine as a CSS background-image) or a video -- video needs a real
// <video> element since CSS can't paint one, so the two layers are mutually
// exclusive: whichever type is picked takes over #customBgLayer/#customBgVideo
// and the other is cleared out.
bgImgInput?.addEventListener('change',(e)=>{
    const file=e.target.files[0];
    if(!file) return;
    if(customBgUrl) URL.revokeObjectURL(customBgUrl);
    customBgUrl=URL.createObjectURL(file);
    const isVideo = file.type.startsWith('video/');
    if(isVideo){
        customBgLayer.style.backgroundImage='';
        customBgLayer.classList.remove('active');
        if(customBgVideo){
            customBgVideo.src=customBgUrl;
            customBgVideo.classList.add('active');
            customBgVideo.play().catch(()=>{});
        }
    } else {
        if(customBgVideo){
            customBgVideo.pause();
            customBgVideo.removeAttribute('src');
            customBgVideo.load();
            customBgVideo.classList.remove('active');
        }
        customBgLayer.style.backgroundImage=`url('${customBgUrl}')`;
        customBgLayer.classList.add('active');
    }
    if(bgImgRemove) bgImgRemove.style.display='';
    document.getElementById('app')?.classList.add('has-custom-bg');
    applyBgImageSettings();
    bgImgInput.value='';
});
bgImgRemove?.addEventListener('click',()=>{
    customBgLayer.style.backgroundImage='';
    customBgLayer.classList.remove('active');
    if(customBgVideo){
        customBgVideo.pause();
        customBgVideo.removeAttribute('src');
        customBgVideo.load();
        customBgVideo.classList.remove('active');
    }
    if(customBgUrl) URL.revokeObjectURL(customBgUrl);
    customBgUrl=null;
    if(bgImgRemove) bgImgRemove.style.display='none';
    document.getElementById('app')?.classList.remove('has-custom-bg');
});
[bgOpacityRange,bgDimRange,bgBlurRange].forEach(el=>el?.addEventListener('input',applyBgImageSettings));
document.querySelectorAll('.bg-fit-btn').forEach(btn => btn.addEventListener('click', () => setBgFitMode(btn.dataset.bgFit)));
document.querySelectorAll('.bg-pos-btn').forEach(btn => btn.addEventListener('click', () => setBgPositionMode(btn.dataset.bgPosition)));
applyBgImageSettings();

const QWERTY_INPUT_MAP = new Map(Object.entries(QWERTY_LABEL_MAP).map(([midi, raw]) => [raw, Number(midi)]));
const qwertyHeldByCode = new Map();
const qwertyIgnoreTargets = new Set(['INPUT','TEXTAREA','SELECT']);

function getKeyboardBaseKey(e) {
    if (!e || !e.code) return '';
    if (e.code.startsWith('Key')) return e.code.slice(3).toUpperCase();
    if (e.code.startsWith('Digit')) return e.code.slice(5);
    return '';
}

function getQwertyRawFromEvent(e) {
    const base = getKeyboardBaseKey(e);
    if (!base) return '';
    if (e.ctrlKey) return 'C+' + base;
    if (e.shiftKey) return 'S+' + base;
    return /^[A-Z]$/.test(base) ? base.toLowerCase() : base;
}

function shouldSkipQwertyInput(e) {
    const t = e.target;
    if (!t) return false;
    return qwertyIgnoreTargets.has(t.tagName) || t.isContentEditable;
}

window.addEventListener('keydown', e => {
    // Input-focus / repeat guard applies to every key we handle, so it
    // runs before the space check too. shouldSkipQwertyInput returns
    // true when the chat composer / edit dialog / search field / any
    // contenteditable owns focus, so a literal space typed there stays
    // a literal space and only piano-context presses toggle sustain.
    if (shouldSkipQwertyInput(e) || e.repeat) return;

    // Space holds sustain on the MAIN (piano) soundfont for as long as it's
    // held down -- matching a real sustain pedal (and the standard "space =
    // sustain" convention most virtual/online pianos use), not a toggle.
    // It can only ever ADD sustain on top of the manual latch/MIDI pedal,
    // never remove it (see setSpaceSustain) -- releasing space always
    // reverts to whatever the mouse-click latch has it set to, rather than
    // forcing it off. The mouse-click "Sustain" button (toggleSustainHold)
    // is untouched and still a persistent latch. Layer / string soundfont
    // is intentionally untouched — that layer owns sfEffectSettings.sf2.
    // fadeSec as its own user-controlled decay, and getActivePianoSustain()
    // only reads the piano-layer sustain sources.
    if (e.code === 'Space'){
        // Skip if the focused element is a button/link/other native
        // space-activated control so a genuine "click via keyboard"
        // still works inside floating panels (SoundFont picker, Audio
        // settings, MIDI dialog, etc.).
        const activeTag = document.activeElement && document.activeElement.tagName;
        if (activeTag === 'BUTTON' || activeTag === 'A') return;
        e.preventDefault();
        setSpaceSustain(true);
        return;
    }

    // Arrow-key transpose: global, no need to click the tiny tUp/tDown
    // stepper first. Left/Right nudge a semitone, Up/Down jump an octave --
    // the octave jump is the point: it's the one operation on this app a
    // desktop player reaches for constantly (matching a vocal range, a
    // different instrument) and the old click-first-then-arrow path buried
    // it enough that almost nobody found it.
    //
    // Skipped when the key-count stepper (wU/wD/settingsWU/settingsWD) has
    // focus -- those buttons have their own, unrelated arrow-key behavior
    // (see stepVisibleKeyCount below) that has to keep working exactly as
    // it did before this was added; shouldSkipQwertyInput above already
    // keeps this off every <input> (including range sliders, which use
    // arrow keys natively to change their own value) and every text field.
    if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){
        const activeId = document.activeElement && document.activeElement.id;
        if (activeId === 'wU' || activeId === 'wD' || activeId === 'settingsWU' || activeId === 'settingsWD') return;
        e.preventDefault();
        const delta = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1
            : e.key === 'ArrowUp' ? 12 : -12;
        changeTranspose(delta);
        return;
    }

    if (!isPianoInputAllowed()) return;
    const raw = getQwertyRawFromEvent(e);
    const midi = QWERTY_INPUT_MAP.get(raw);
    if (!midi) return;
    e.preventDefault();
    if (qwertyHeldByCode.has(e.code)) return;
    const visualNote = midi + transpose;
    const el = keyElCache.get(visualNote);
    qwertyHeldByCode.set(e.code, { midi, el, visualNote });
    press(midi, el, visualNote);
}, { passive: false, capture: false });

window.addEventListener('keyup', e => {
    if (e.code === 'Space'){
        setSpaceSustain(false);
        return;
    }
    const held = qwertyHeldByCode.get(e.code);
    if (!held) return;
    e.preventDefault();
    release(held.midi, held.el || keyElCache.get(held.visualNote), held.visualNote);
    qwertyHeldByCode.delete(e.code);
}, { passive: false, capture: false });

window.addEventListener('blur', () => {
    qwertyHeldByCode.forEach(({ midi, el, visualNote }) => release(midi, el || keyElCache.get(visualNote), visualNote));
    qwertyHeldByCode.clear();
    // A backgrounded tab/window never gets a real keyup for a key held at
    // the moment it lost focus (alt-tab away while holding space is the
    // common case) -- without this, sustain could stay stuck "on" from a
    // space-hold that will never see its matching keyup.
    if (spaceSustainHeld) setSpaceSustain(false);
}, { passive: true });

const pianoWrap = document.getElementById('pianoWrap');
const pointerNoteMap = new Map();

function hitTestPiano(clientX, clientY) {
    const localY = clientY - keyHitCache.wrapTop;
    if (localY < 0 || localY > keyHitCache.wrapHeight) return null;
    const pianoX = clientX - keyHitCache.wrapLeft + currentPianoTransformPx;
    if (pianoX < 0 || pianoX > keyHitCache.totalWidth) return null;

    const whiteIdx = findWhiteIndexAtPianoX(pianoX);

    if (localY < keyHitCache.blackBottom) {
        const checks = [whiteIdx, whiteIdx + 1, whiteIdx - 1];
        for(let i=0; i<checks.length; i++){
            const b = keyHitCache.blackByBoundary[checks[i]];
            if (b && pianoX >= b.left && pianoX < b.right) return b;
        }
    }

    if(whiteIdx >= 0 && whiteIdx < ALL_WHITE.length){
        const midi = ALL_WHITE[whiteIdx];
        return { midi, el: keyElFast[midi] || noteElementMap.get(midi) };
    }
    return null;
}

pianoWrap.addEventListener('pointerdown', e => {
    e.preventDefault();
    if(!isPianoInputAllowed()) return;
    if(!keyHitCache.wrapHeight) updateKeyHitCache();
    const hit = hitTestPiano(e.clientX, e.clientY);
    if (!hit) return;

    pointerNoteMap.set(e.pointerId, hit.midi);
    press(hit.midi, hit.el);
    try { pianoWrap.setPointerCapture(e.pointerId); } catch(_){}
}, { passive: false });

const _glissandoPendingPointers = new Map();
let _glissandoRafScheduled = false;
function _flushGlissandoPointerMoves(){
    _glissandoRafScheduled = false;
    _glissandoPendingPointers.forEach((pos, pid) => {
        if (!pointerNoteMap.has(pid)) return;
        const prevNote = pointerNoteMap.get(pid);
        const hit = hitTestPiano(pos.clientX, pos.clientY);
        if (!hit) {
            release(prevNote, keyElFast[prevNote] || noteElementMap.get(prevNote));
            pointerNoteMap.delete(pid);
            return;
        }
        if (hit.midi !== prevNote) {
            // Swept past this note mid-drag (not a final release) -- fast
            // release so a glissando under sustain doesn't stack a full
            // ~14.6s tail per note it slides across.
            release(prevNote, keyElFast[prevNote] || noteElementMap.get(prevNote), undefined, true);
            pointerNoteMap.set(pid, hit.midi);
            press(hit.midi, hit.el);
        }
    });
    _glissandoPendingPointers.clear();
}

pianoWrap.addEventListener('pointermove', e => {
    if (!pointerNoteMap.has(e.pointerId)) return;
    e.preventDefault();
    _glissandoPendingPointers.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });
    if (!_glissandoRafScheduled) {
        _glissandoRafScheduled = true;
        requestAnimationFrame(_flushGlissandoPointerMoves);
    }
}, { passive: false });

function pianoPointerEnd(e) {
    const note = pointerNoteMap.get(e.pointerId);
    if (note !== undefined) {
        release(note, keyElFast[note] || noteElementMap.get(note));
        pointerNoteMap.delete(e.pointerId);
    }
    _glissandoPendingPointers.delete(e.pointerId);
}
pianoWrap.addEventListener('pointerup', pianoPointerEnd, { passive: true });
pianoWrap.addEventListener('pointercancel', pianoPointerEnd, { passive: true });
// setPointerCapture can be lost for reasons other than a normal pointerup:
// another window steals focus, the captured element is removed from the
// DOM by a layout change, an OS gesture intercepts. lostpointercapture
// fires in all those cases and lets us drain the note before it strands.
pianoWrap.addEventListener('lostpointercapture', pianoPointerEnd, { passive: true });

// Fallback safety net: if setPointerCapture failed (rare browser edge —
// restricted context, iframe boundary, some touch surfaces on older
// Android), pointerup / pointercancel fires on window, NOT on pianoWrap,
// and the note would stay held forever. Listening at window level with a
// pointerNoteMap lookup catches those without disturbing the fast path
// (early return when the id isn't ours).
function _windowPianoPointerEndFallback(e){
    if(!pointerNoteMap.has(e.pointerId)) return;
    pianoPointerEnd(e);
}
window.addEventListener('pointerup', _windowPianoPointerEndFallback, true);
window.addEventListener('pointercancel', _windowPianoPointerEndFallback, true);

// Belt-and-suspenders cleanup for every held input path. When the tab
// loses visibility (Alt-Tab, minimise, iOS suspend) the browser stops
// delivering pointerup / keyup, so a note held at that moment stays in
// pressStartTimes until the user comes back AND presses that exact key
// again — which is exactly the "sumpah ga dipencet tapi chord nyangkut"
// symptom. Auto-play state (viz / learn-song timelines) is deliberately
// untouched so backgrounded playback isn't disturbed; only live human
// input paths are drained here.
function _releaseAllLiveInputHolds(){
    if(typeof pointerNoteMap !== 'undefined' && pointerNoteMap && pointerNoteMap.size){
        const pending = Array.from(pointerNoteMap.entries());
        pointerNoteMap.clear();
        for(let i = 0; i < pending.length; i++){
            const midi = pending[i][1];
            const el = (typeof keyElFast !== 'undefined' && keyElFast[midi]) ||
                       (typeof noteElementMap !== 'undefined' ? noteElementMap.get(midi) : null);
            try { release(midi, el); } catch(_){}
        }
    }
    if(typeof _glissandoPendingPointers !== 'undefined' && _glissandoPendingPointers){
        _glissandoPendingPointers.clear();
    }
    if(typeof qwertyHeldByCode !== 'undefined' && qwertyHeldByCode && qwertyHeldByCode.size){
        const pending = Array.from(qwertyHeldByCode.values());
        qwertyHeldByCode.clear();
        for(let i = 0; i < pending.length; i++){
            const { midi, el, visualNote } = pending[i];
            const target = el || (typeof keyElCache !== 'undefined' ? keyElCache.get(visualNote) : null);
            try { release(midi, target, visualNote); } catch(_){}
        }
    }
}
document.addEventListener('visibilitychange', () => {
    if(document.hidden) _releaseAllLiveInputHolds();
}, { passive: true });
// pagehide fires on the terminal transition (tab close, navigation away,
// iOS bfcache freeze) — visibilitychange doesn't always precede it on
// mobile Safari, so this catches the residual holds one more time.
window.addEventListener('pagehide', _releaseAllLiveInputHolds, { passive: true });

const strip = document.getElementById('swipeStrip');

let swipeActive = false;
let swipeStartX = 0;
let swipeVelocity = 0;
let swipePrevX = 0;
let swipePrevTime = 0;
let swipeRafId = null;
let swipeVisualOffset = 0;
let swipeSnapRafId = null;

pianoEl.style.transition = 'none';

function hasSwipeRange() {
    return whiteKeyWidth > 0 && getSwipeMaxOffset() > 0.0001;
}

function swipeSetTransform(px) {
    if(!hasSwipeRange()) px = 0;
    currentPianoTransformPx = px;
    pianoEl.style.transform = `translate3d(-${px}px,0,0)`;
    syncActiveKeyLayerTransform(px);
    if(falling.length > 0) ensureAnimLoop();
}

function swipeGetBase() {
    return hasSwipeRange() ? getViewOffsetPx(viewOffset) : 0;
}

function swipeClampOffset(offset) {
    return Math.max(0, Math.min(getSwipeMaxOffset(), offset));
}

function swipeClampVisual(value) {
    if(!hasSwipeRange()) return 0;
    const maxOffset = getSwipeMaxOffset();
    const currentOffsetPx = getViewOffsetPx(viewOffset);
    const maxDragRight = currentOffsetPx;
    const maxDragLeft = getViewOffsetPx(maxOffset) - currentOffsetPx;
    if (value > maxDragRight) return maxDragRight + (value - maxDragRight) * 0.25;
    if (value < -maxDragLeft) return -maxDragLeft;
    return value;
}

function swipeSnapToNearest() {
    if(!hasSwipeRange()) {
        viewOffset = 0;
        swipeVisualOffset = 0;
        swipeVelocity = 0;
        swipeSetTransform(0);
        updateNoteXCache();
        return;
    }
    const draggedWhiteKeys = -swipeVisualOffset / whiteKeyWidth;
    const targetOffset = swipeClampOffset(Math.round(viewOffset + draggedWhiteKeys));
    const fromPx = currentPianoTransformPx;
    const toPx = getViewOffsetPx(targetOffset);
    viewOffset = targetOffset;
    swipeVisualOffset = 0;

    clearTimeout(swipeNoteXUpdateTimer);
    if (swipeSnapRafId) cancelAnimationFrame(swipeSnapRafId);
    pianoEl.style.transition = 'none';

    const startTime = performance.now();
    const duration = 120;
    const easeOut = t => 1 - Math.pow(1 - t, 3);
    function step(now) {
        const t = Math.min(1, (now - startTime) / duration);
        const px = fromPx + (toPx - fromPx) * easeOut(t);
        swipeSetTransform(px);
        if (t < 1) {
            swipeSnapRafId = requestAnimationFrame(step);
        } else {
            swipeSnapRafId = null;
            swipeSetTransform(toPx);
            updateNoteXCache();
        }
    }
    swipeSnapRafId = requestAnimationFrame(step);
}
function swipeMomentumScroll() {
    if(!hasSwipeRange()) { swipeVelocity = 0; swipeVisualOffset = 0; swipeSetTransform(0); return; }
    if (!swipeActive && Math.abs(swipeVelocity) > 0.5) {
        swipeVelocity *= 0.91;
        swipeVisualOffset = swipeClampVisual(swipeVisualOffset + swipeVelocity);
        swipeSetTransform(swipeGetBase() - swipeVisualOffset);

        if (Math.abs(swipeVelocity) < 0.9) {
            swipeVelocity = 0;
            swipeSnapToNearest();
            return;
        }
        swipeRafId = requestAnimationFrame(swipeMomentumScroll);
    }
}

strip.addEventListener('pointerdown', e => {
    if(!hasSwipeRange()) {
        e.preventDefault();
        e.stopPropagation();
        swipeActive = false;
        swipeVelocity = 0;
        swipeVisualOffset = 0;
        swipeSetTransform(0);
        return;
    }
    e.preventDefault();
    e.stopPropagation();
    strip.setPointerCapture(e.pointerId);
    swipeActive = true;
    swipeStartX = e.clientX;
    swipePrevX = e.clientX;
    swipePrevTime = performance.now();
    swipeVelocity = 0;
    swipeVisualOffset = 0;
    if (swipeRafId) cancelAnimationFrame(swipeRafId);
    if (swipeSnapRafId) { cancelAnimationFrame(swipeSnapRafId); swipeSnapRafId = null; }
    pianoEl.style.transition = 'none';
}, { passive: false });

strip.addEventListener('pointermove', e => {
    if (!swipeActive) return;
    e.preventDefault();
    e.stopPropagation();

    const now = performance.now();
    const dt = now - swipePrevTime;
    const dx = e.clientX - swipePrevX;

    if (dt > 0) swipeVelocity = dx * (16 / dt);
    swipePrevX = e.clientX;
    swipePrevTime = now;

    const totalDrag = e.clientX - swipeStartX;
    swipeVisualOffset = swipeClampVisual(totalDrag);

    swipeSetTransform(swipeGetBase() - swipeVisualOffset);
}, { passive: false });

strip.addEventListener('pointerup', e => {
    if (!swipeActive) return;
    swipeActive = false;

    if (Math.abs(swipeVelocity) > 8) {
        swipeRafId = requestAnimationFrame(swipeMomentumScroll);
    } else {
        swipeSnapToNearest();
    }
});

strip.addEventListener('pointercancel', e => {
    if (!swipeActive) return;
    swipeActive = false;
    swipeVelocity = 0;
    swipeSnapToNearest();
});

const NOTE_NAMES=['C','C#','D','Eb','E','F','F#','G','Ab','A','Bb','B'];
// chordMode is one of: off / basic / medium / pro / expert / max.
// UI and code speak the same vocabulary — the storage token, the button id,
// the label the user sees, and the string stored in `chordMode` are all the
// same word. Tier definitions (informal):
//   basic   — Maj, m, dim, aug, 5, sus2, sus4 (triads only).
//   medium  — up to 9th, no alterations. 7, Maj7, m7, m(Maj7), dim7, m7b5,
//             7sus2/4, 6, m6, add9, madd9, add11 (compact 0-4-5-7),
//             madd11, 9, Maj9, m9, m(Maj9), 6/9, m6/9, 9sus2/4, Maj9sus4.
//   pro     — altered but every voice fits within an octave of the root
//             (max interval <=15): 7b9, 7#9, Maj7b9, Maj7#9, m7b9, 7b5,
//             7#5, Maj7b5, Maj7#5, 7b5b9, 7#5b9, 7#5#9, 7b5#9, 9b5, 9#5,
//             m9b5, dim(Maj7).
//   expert  — full 11/13/#11/b13 extensions, no omit: 11, Maj11, m11,
//             m(Maj11), m11b5, 13, Maj13, m13, 7#11, Maj7#11, 9#11,
//             Maj9#11, 7add11, m7add11, 13b9, 13#9, 13#11, 13b9#11,
//             13#9#11, Maj13#11, 7b13, 7#5b13, 7b9b13, 7#9b13, 9b13,
//             7b9#11, 7#9#11.
//   max     — everything in expert PLUS omit candidates: (no3), (no5),
//             (no7). Only mode where addBetaOmitCandidates + the P5-drop
//             beta match fire.
let chordMode='expert';
const CHORD_DB=[
{s:[0,4,7,10,21],n:'13',m:'expert'},
{s:[0,3,7,10,21],n:'m13',m:'expert'},
{s:[0,4,7,11,21],n:'Maj13',m:'expert'},
{s:[0,4,7,10,14,17,21],n:'13',m:'expert'},
{s:[0,4,7,11,14,17,21],n:'Maj13',m:'expert'},
{s:[0,3,7,10,14,17,21],n:'m13',m:'expert'},
{s:[0,4,7,10,13,17,21],n:'13b9',m:'expert'},
{s:[0,4,7,10,15,17,21],n:'13#9',m:'expert'},
{s:[0,4,7,10,14,18,21],n:'13#11',m:'expert'},
{s:[0,4,7,10,13,18,21],n:'13b9#11',m:'expert'},
{s:[0,4,7,10,15,18,21],n:'13#9#11',m:'expert'},
{s:[0,4,7,11,14,18,21],n:'Maj13#11',m:'expert'},
{s:[0,4,7,10,18],n:'7#11',m:'expert'},
{s:[0,4,7,11,18],n:'Maj7#11',m:'expert'},
{s:[0,4,7,10,17],n:'7add11',m:'expert'},
{s:[0,3,7,10,17],n:'m7add11',m:'expert'},
{s:[0,4,7,10,14,17],n:'11',m:'expert'},
{s:[0,4,7,11,14,17],n:'Maj11',m:'expert'},
{s:[0,3,7,10,14,17],n:'m11',m:'expert'},
{s:[0,3,7,11,14,17],n:'m(Maj11)',m:'expert'},
{s:[0,4,7,10,14,18],n:'9#11',m:'expert'},
{s:[0,4,7,11,14,18],n:'Maj9#11',m:'expert'},
{s:[0,3,6,10,14,17],n:'m11b5',m:'expert'},
{s:[0,3,6,10,14],n:'m9b5',m:'pro'},
{s:[0,4,7,10,13,18],n:'7b9#11',m:'expert'},
{s:[0,4,7,10,15,18],n:'7#9#11',m:'expert'},
{s:[0,4,5,7],n:'add11',m:'medium'},
{s:[0,3,5,7],n:'madd11',m:'medium'},
{s:[0,4,7,9,14],n:'6/9',m:'medium'},
{s:[0,3,7,9,14],n:'m6/9',m:'medium'},
{s:[0,4,7,14],n:'add9',m:'medium'},
{s:[0,3,7,14],n:'madd9',m:'medium'},
{s:[0,4,7,11,14],n:'Maj9',m:'medium'},
{s:[0,3,7,10,14],n:'m9',m:'medium'},
{s:[0,3,7,11,14],n:'m(Maj9)',m:'medium'},
{s:[0,3,7,11,21],n:'m6(Maj7)',m:'expert'},
{s:[0,4,7,10,14],n:'9',m:'medium'},
{s:[0,4,7,10,13],n:'7b9',m:'pro'},
{s:[0,4,7,10,15],n:'7#9',m:'pro'},
{s:[0,4,7,11,13],n:'Maj7b9',m:'pro'},
{s:[0,4,7,11,15],n:'Maj7#9',m:'pro'},
{s:[0,3,7,10,13],n:'m7b9',m:'pro'},
{s:[0,5,7,10,14],n:'9sus4',m:'medium'},
{s:[0,2,7,10,14],n:'9sus2',m:'medium'},
{s:[0,5,7,11,14],n:'Maj9sus4',m:'medium'},
{s:[0,4,6,10,14],n:'9b5',m:'pro'},
{s:[0,4,8,10,14],n:'9#5',m:'pro'},
{s:[0,3,8,10],n:'m7#5',m:'pro'},
{s:[0,3,8,10,14],n:'m9#5',m:'expert'},
{s:[0,4,8,11,14],n:'Maj9#5',m:'expert'},
{s:[0,4,7,9,18],n:'6#11',m:'pro'},
{s:[0,4,7,9,14,18],n:'6/9#11',m:'expert'},
{s:[0,4,8,10,13],n:'7#5b9',m:'pro'},
{s:[0,4,8,10,15],n:'7#5#9',m:'pro'},
{s:[0,4,6,10,15],n:'7b5#9',m:'pro'},
{s:[0,4,7,10,20],n:'7b13',m:'expert'},
{s:[0,4,8,10,20],n:'7#5b13',m:'expert'},
{s:[0,4,7,10,13,20],n:'7b9b13',m:'expert'},
{s:[0,4,7,10,15,20],n:'7#9b13',m:'expert'},
{s:[0,4,7,10,14,20],n:'9b13',m:'expert'},
{s:[0,4,7,10],n:'7',m:'medium'},
{s:[0,4,7,11],n:'Maj7',m:'medium'},
{s:[0,3,7,10],n:'m7',m:'medium'},
{s:[0,3,7,11],n:'m(Maj7)',m:'medium'},
{s:[0,3,6,9],n:'dim7',m:'medium'},
{s:[0,3,6,11],n:'dim(Maj7)',m:'pro'},
{s:[0,3,6,10],n:'m7b5',m:'medium'},
{s:[0,4,8,10],n:'7#5',m:'pro'},
{s:[0,4,6,10],n:'7b5',m:'pro'},
{s:[0,4,8,11],n:'Maj7#5',m:'pro'},
{s:[0,4,6,11],n:'Maj7b5',m:'pro'},
{s:[0,5,7,10],n:'7sus4',m:'medium'},
{s:[0,2,7,10],n:'7sus2',m:'medium'},
{s:[0,5,7,11],n:'Maj7sus4',m:'medium'},
{s:[0,2,7,11],n:'Maj7sus2',m:'medium'},
{s:[0,1,5,7,10],n:'7susb9',m:'pro'},
{s:[0,5,7,10,14,21],n:'13sus4',m:'expert'},
{s:[0,5,7,10,21],n:'13sus4',m:'expert'},
{s:[0,4,6,10,13],n:'7b5b9',m:'pro'},
{s:[0,4,7,9],n:'6',m:'medium'},
{s:[0,3,7,9],n:'m6',m:'medium'},
{s:[0,4,7],n:'Maj',m:'basic'},
{s:[0,3,7],n:'m',m:'basic'},
{s:[0,3,6],n:'dim',m:'basic'},
{s:[0,4,8],n:'aug',m:'basic'},
{s:[0,7],n:'5',m:'basic'},
{s:[0,2,7],n:'sus2',m:'basic'},
{s:[0,5,7],n:'sus4',m:'basic'}
];
// Level ordering: strict ascending. A chord tagged with level N is admitted
// whenever the runtime activeLevel >= N. `max` (level 5) admits everything
// `expert` admits AND additionally opens the omit-candidate path in
// matchChords / addBetaOmitCandidates.
function modeLevel(m){ return { basic:1, medium:2, pro:3, expert:4, max:5 }[m]||0; }
CHORD_DB.forEach(cd => {
    cd._level = modeLevel(cd.m);
    cd._pcMask = cd.s.reduce((mask, iv) => mask | (1 << (iv % 12)), 0);
});
function pitchClassesFromMask(mask){
    const pcs=[];
    for(let i=0;i<12;i++) if(mask & (1 << i)) pcs.push(i);
    return pcs;
}
function rotatePcMask(mask, root){
    let out = 0;
    for(let i=0;i<12;i++) if(mask & (1 << i)) out |= 1 << ((root + i) % 12);
    return out;
}
function chordNoSuffix(suffix, missing){
    if(!missing||missing.length===0) return suffix;
    const clean=[...new Set(missing)].sort((a,b)=>a-b);
    if(clean.length===1 && clean[0]===5 && /^(7|Maj7|m7)$/.test(suffix)) return suffix;
    const noText=clean.map(n=>'no'+n).join(',');
    if(suffix==='m(Maj9)') return 'mMaj9('+noText+')';
    if(suffix==='m(Maj7)') return 'mMaj7('+noText+')';
    return suffix+'('+noText+')';
}
function chordSuffixClean(suffix){
    if(suffix==='7#5b13') return '7#5';
    if(suffix==='9#5b13') return '9#5';
    return suffix;
}
function chordComplexityPenalty(suffix){
    let p=0;
    p+=(suffix.match(/\//g)||[]).length*12;
    p+=(suffix.match(/\(/g)||[]).length*10;
    p+=(suffix.match(/no/g)||[]).length*16;
    p+=(suffix.match(/[b#]/g)||[]).length*4;
    if(suffix.length>8) p+=Math.floor((suffix.length-8)*1.5);
    return p;
}
function chordScore(match){
    let score=0;
    score+=match.patternLen*12;
    score+=match.source==='exact'?220:0;
    score+=match.source==='beta'?-74:0;
    score+=match.isInversion?-24:120;
    if(match.bassNote===match.root) score+=44;
    if(match.noList&&match.noList.includes(5)) score-=8;
    if(match.noList&&match.noList.includes(3)) score-=42;
    if(match.noList&&match.noList.includes(7)) score-=78;
    score-=chordComplexityPenalty(match.suffix);
    if(match.suffix==='Maj') score+=8;
    if(match.suffix==='add9'||match.suffix==='madd9') score+=16;
    if(match.suffix==='Maj9'||match.suffix==='m9'||match.suffix==='9') score+=14;
    if(match.suffix==='13'||match.suffix==='m13'||match.suffix==='Maj13') score+=22;
    if(match.suffix==='7#11'||match.suffix==='Maj7#11'||match.suffix==='9#11'||match.suffix==='Maj9#11') score+=26;
    if(match.suffix==='7add11') score+=14;
    if(match.suffix==='7b5'||match.suffix==='9b5') score+=8;
    if(match.suffix==='7b13'||match.suffix==='9b13') score+=34;
    if(match.suffix==='m(Maj7)' && match.patternLen>=5) score+=38;
    if(match.rawSuffix==='7#5b13') score-=30;
    return score;
}
function betaPush(results, root, suffix, rawSuffix, bassNote, patternLen, noList){
    results.push({root,suffix,rawSuffix,bassNote,isInversion:false,patternLen,source:'beta',noList:noList||[]});
}
function addBetaOmitCandidates(results, pcs, bassNote){
    // Only the 'max' tier opens the omit path. Every lower tier —
    // expert/pro/medium/basic — returns early so callers stay on the
    // strict CHORD_DB match set.
    if(chordMode!=='max'||pcs.length<4) return;
    for(let root=0;root<12;root++){
        const intervals=new Set(pcs.map(pc=>(pc-root+12)%12));
        const has=iv=>intervals.has(iv);
        if(!has(0)) continue;
        // An omit candidate only fires when the input is EXACTLY the
        // target chord's tones minus the omitted one — never when extra,
        // unrelated pitch classes are also present. Without this the omit
        // path would "explain" a large blurred note cluster (e.g. leftover
        // pedal-held notes spanning more than one harmony during a fast /
        // dense passage) with whichever pattern happened to match a subset
        // of the mess, producing a musically nonsensical chord name. This
        // mirrors the strict CHORD_DB loop's own "no pitch class outside
        // the pattern" rule, which this separate omit path never enforced.
        const exact=allowed=>{
            for(const v of intervals) if(!allowed.has(v)) return false;
            return true;
        };
        const hasMaj3=has(4), hasMin3=has(3), hasP5=has(7), hasb7=has(10), hasMaj7=has(11);
        const has9=has(2), has11=has(5), has13=has(9);

        if(hasP5 && hasb7 && !hasMaj3 && !hasMin3){
            if(has9 && has13 && exact(new Set([0,7,10,2,9]))) betaPush(results, root, '13(no3)', '13', bassNote, 6, [3]);
            else if(has13 && exact(new Set([0,7,10,9]))) betaPush(results, root, '13(no3)', '13', bassNote, 5, [3]);
            else if(has9 && exact(new Set([0,7,10,2]))) betaPush(results, root, '9(no3)', '9', bassNote, 5, [3]);
        }

        if(!hasP5 && hasb7 && hasMaj3 && !hasMin3 && has9 && has13 && exact(new Set([0,4,10,2,9]))){
            betaPush(results, root, '13(no5)', '13', bassNote, 6, [5]);
        } else if(!hasP5 && hasb7 && hasMaj3 && !hasMin3 && has9 && exact(new Set([0,4,10,2]))){
            betaPush(results, root, '9(no5)', '9', bassNote, 5, [5]);
        } else if(!hasP5 && hasMaj7 && hasMaj3 && !hasMin3 && has9 && exact(new Set([0,4,11,2]))){
            betaPush(results, root, 'Maj9(no5)', 'Maj9', bassNote, 5, [5]);
        } else if(!hasP5 && hasMaj7 && hasMin3 && !hasMaj3 && has9 && exact(new Set([0,3,11,2]))){
            betaPush(results, root, 'mMaj9(no5)', 'm(Maj9)', bassNote, 5, [5]);
        } else if(!hasP5 && hasb7 && hasMin3 && !hasMaj3 && has9 && exact(new Set([0,3,10,2]))){
            betaPush(results, root, 'm9(no5)', 'm9', bassNote, 5, [5]);
        }

        if(hasP5 && !hasb7 && !hasMaj7 && has9 && has11 && has13){
            if(hasMin3 && !hasMaj3 && exact(new Set([0,3,7,2,5,9]))) betaPush(results, root, 'm13(no7)', 'm13', bassNote, 6, [7]);
            else if(hasMaj3 && !hasMin3 && exact(new Set([0,4,7,2,5,9]))) betaPush(results, root, '13(no7)', '13', bassNote, 6, [7]);
        }
    }
}
function isStrongExactCandidate(match, pcs){
    if(!match || match.source!=='exact' || match.noList?.length) return false;
    if(match.isInversion) return false;
    if(match.patternLen < pcs.length) return false;
    if(chordComplexityPenalty(match.suffix)>18) return false;
    return true;
}
function isTritoneRoot(a,b){ return ((a-b+12)%12)===6; }
function isNoChord(match){ return !!(match&&match.noList&&match.noList.length); }
function isAlteredOrLydianDominant(suffix){ return /#11|b5|#5|b9|#9|b13/.test(suffix||''); }
function filterReadableChordResults(list, pcs){
    if(!list.length) return list;
    const primary=list[0];
    const primaryScore=chordScore(primary);
    const filtered=[primary];

    if(primary.source==='beta' || isNoChord(primary)) return filtered;

    for(let i=1;i<list.length;i++){
        const cand=list[i];
        const candScore=chordScore(cand);
        if(isNoChord(cand) && cand.root!==primary.root) continue;
        if(cand.source==='beta' && primary.source==='exact') continue;

        if(isTritoneRoot(cand.root, primary.root) && isAlteredOrLydianDominant(cand.suffix)) continue;
        if(isTritoneRoot(cand.root, primary.root) && isAlteredOrLydianDominant(primary.suffix)) continue;

        if(primary.source==='exact' && !primary.isInversion && cand.isInversion && candScore < primaryScore-34) continue;

        if(candScore < primaryScore-54) continue;
        filtered.push(cand);
        if(filtered.length>=2) break;
    }
    return filtered;
}
function matchChords(midiArr){
    if(midiArr.length<3) return [];
    let pcMask = 0;
    let bassMidi = midiArr[0];
    for(let i=0;i<midiArr.length;i++){
        const midi = midiArr[i];
        if(midi < bassMidi) bassMidi = midi;
        pcMask |= 1 << (((midi % 12) + 12) % 12);
    }
    const pcs = pitchClassesFromMask(pcMask);
    const bassNote = ((bassMidi % 12) + 12) % 12;
    const pcCounts={};
    for(let i=0;i<midiArr.length;i++){
        const pc=((midiArr[i] % 12) + 12) % 12;
        pcCounts[pc]=(pcCounts[pc]||0)+1;
    }
    const bassIsolated = pcCounts[bassNote]===1;
    const results=[];
    // `isMax` gates the two "omit / drop the P5" branches inside the match
    // loop below — the missingNo push and the (noN) suffix decoration.
    // Every other tier stays on strict CHORD_DB matches only.
    const isMax=chordMode==='max';
    const activeLevel = modeLevel(chordMode);
    for(let r=0;r<12;r++){
        const root=r;
        let intervalMask = 0;
        for(let i=0;i<midiArr.length;i++){
            const pc = ((midiArr[i] % 12) + 12) % 12;
            const base = (pc - root + 12) % 12;
            intervalMask |= 1 << base;
            const upper = base + 12;
            if(upper <= 22 && !(pc===bassNote && bassIsolated)) intervalMask |= 1 << upper;
        }
        for(let ci=0;ci<CHORD_DB.length;ci++){
            const cd=CHORD_DB[ci];
            if(cd._level<=activeLevel){
                const missingNo=[];
                let match=true;
                for(let si=0;si<cd.s.length;si++){
                    const iv = cd.s[si];
                    if(intervalMask & (1 << iv)) continue;
                    if(isMax&&iv===7){ missingNo.push(5); continue; }
                    match=false;
                    break;
                }
                if(!match) continue;
                const patternMask = rotatePcMask(cd._pcMask, root);
                if((pcMask & ~patternMask) !== 0) continue;
                const rawSuffix=cd.n;
                const cleanSuffix=chordSuffixClean(rawSuffix);
                const noList=[...new Set(missingNo)].sort((a,b)=>a-b);
                const suffix=isMax&&noList.length ? chordNoSuffix(cleanSuffix, noList) : cleanSuffix;
                const source=noList.length?'beta':'exact';
                const suppressBetaSlash=source==='beta' && ((pcMask & (1 << root)) !== 0);
                const isInversion=bassNote!==root && !suppressBetaSlash;
                results.push({root,suffix,rawSuffix,bassNote,isInversion,patternLen:cd.s.length,source,noList});
            }
        }
    }

    if(bassIsolated){
        const upperMask = pcMask & ~(1 << bassNote);
        const upperPcs = pitchClassesFromMask(upperMask);
        if(upperPcs.length>=2){
            for(let r=0;r<12;r++){
                if(!(upperMask & (1<<r))) continue;
                let intervalMask=0;
                for(let pi=0;pi<upperPcs.length;pi++){
                    const pc=upperPcs[pi];
                    const base=(pc-r+12)%12;
                    intervalMask|=1<<base;
                    const upperIv=base+12;
                    if(upperIv<=22) intervalMask|=1<<upperIv;
                }
                for(let ci=0;ci<CHORD_DB.length;ci++){
                    const cd=CHORD_DB[ci];
                    if(cd._level>activeLevel) continue;
                    if(cd.s.length<3 || !(cd.s.includes(3)||cd.s.includes(4))) continue;
                    let match=true;
                    for(let si=0;si<cd.s.length;si++){
                        if(!(intervalMask & (1<<cd.s[si]))){ match=false; break; }
                    }
                    if(!match) continue;
                    const patternMask=rotatePcMask(cd._pcMask, r);
                    if(patternMask !== upperMask) continue;
                    results.push({root:r,suffix:chordSuffixClean(cd.n),rawSuffix:cd.n,bassNote,isInversion:true,patternLen:cd.s.length,source:'exact',noList:[]});
                }
            }
        }
    }

    const strongExact=results.some(r=>isStrongExactCandidate(r, pcs));
    if(!strongExact) addBetaOmitCandidates(results, pcs, bassNote);

    // 'max' keeps the beta / (noN) candidates raised by
    // addBetaOmitCandidates and the P5-drop path above. Any other tier
    // strips them out so the readable list never contains an omit chord.
    const modeSafeResults=chordMode==='max' ? results : results.filter(r=>r.source!=='beta' && !(r.noList&&r.noList.length) && !/\(no\d/.test(r.suffix));
    modeSafeResults.sort((a,b)=>{
        const scoreDiff=chordScore(b)-chordScore(a);
        if(scoreDiff) return scoreDiff;
        if(a.isInversion!==b.isInversion) return a.isInversion?1:-1;
        return b.patternLen-a.patternLen;
    });
    const seen=new Set(), deduped=[];
    for(const r of modeSafeResults){
        const hasRealSlash=r.isInversion && r.bassNote!==r.root;
        const baseName=NOTE_NAMES[r.root]+r.suffix+(hasRealSlash?('/'+NOTE_NAMES[r.bassNote]):'');
        if(!seen.has(baseName)){
            seen.add(baseName);
            deduped.push(r);
        }
    }
    return filterReadableChordResults(deduped, pcs).slice(0,2);
}
function formatChord(match){ const rootName=NOTE_NAMES[match.root]; const chordName=rootName+match.suffix; if(match.isInversion&&match.bassNote!==match.root) return chordName+'/'+NOTE_NAMES[match.bassNote]; return chordName; }
// Chord detector picker. Modes = off / basic / medium / pro / expert / max.
// UI, code, and storage all speak the same vocabulary — the button id, the
// stored token, and the value in `chordMode` are the same word. Tier
// definitions live on the chordMode declaration further up.
//
// Storage note: the key is bumped from `papianoChordMode` to
// `papianoChordModeV2`. The old 3-tier picker also used the tokens 'basic'
// and 'pro', but 'basic' back then meant "up to 9th, no altered" (now
// 'medium') and 'pro' meant "full + omit" (now 'max'). Reusing the same
// tokens under the new tier definitions would silently downgrade a user
// from the shipping default on their first boot after the rollout. The
// migration IIFE below reads the legacy key once, translates it to the
// closest new tier, writes the result to the V2 key, and clears the old
// key so migration never re-fires.
var _chordEnabled = (function(){ try{ return localStorage.getItem('papianoChordOn') !== '0'; }catch(e){ return true; } })();
var _CHORD_MODES = ['basic','medium','pro','expert','max'];
var _CHORD_BUTTON_IDS = {
    off:    'chordModeOff',
    basic:  'chordModeBasic',
    medium: 'chordModeMedium',
    pro:    'chordModePro',
    expert: 'chordModeExpert',
    max:    'chordModeMax'
};
function _migrateLegacyChordMode(raw){
    // Table from the pre-tiering scheme (off / basic / pro) to the new
    // 5-tier vocabulary: old-'basic' displayed everything up to a 9th
    // without alteration — closest new tier is 'medium'. old-'pro' opened
    // the full detector including omit chords — new equivalent is 'max'.
    // Anything unrecognized returns null so the caller falls back to the
    // shipping default rather than silently choosing something wrong.
    if (raw === 'off') return 'off';
    if (raw === 'basic') return 'medium';
    if (raw === 'pro') return 'max';
    return null;
}
function setChordMode(mode) {
    if (mode === 'off') {
        _chordEnabled = false;
    } else if (_CHORD_MODES.indexOf(mode) !== -1) {
        _chordEnabled = true;
        chordMode = mode;
    } else {
        // Unknown token — settle on 'expert' (level 4). This is the
        // "full 11/13 no omit" tier and matches the shipping default the
        // three single-player pages boot into.
        _chordEnabled = true;
        chordMode = 'expert';
        mode = 'expert';
    }
    try { localStorage.setItem('papianoChordOn', _chordEnabled ? '1' : '0'); } catch(e) {}
    try { localStorage.setItem('papianoChordModeV2', mode); } catch(e) {}
    var el1 = document.getElementById('chordPrimary');
    var el2 = document.getElementById('chordSecondary');
    if (!_chordEnabled) { if(el1){el1.classList.remove('show');el1.textContent='';} if(el2){el2.classList.remove('show');el2.textContent='';} }
    syncChordModeUI();
}
function syncChordModeUI() {
    var current = !_chordEnabled ? 'off' : chordMode;
    Object.keys(_CHORD_BUTTON_IDS).forEach(function(m){
        var el = document.getElementById(_CHORD_BUTTON_IDS[m]);
        if (el) el.classList.toggle('active', current === m);
    });
}
Object.keys(_CHORD_BUTTON_IDS).forEach(function(m){
    var el = document.getElementById(_CHORD_BUTTON_IDS[m]);
    if (el) el.addEventListener('click', function(){ setChordMode(m); });
});
(function(){ try {
    var saved = localStorage.getItem('papianoChordModeV2');
    if (saved === 'off' || _CHORD_MODES.indexOf(saved) !== -1) { setChordMode(saved); return; }
    var legacy = localStorage.getItem('papianoChordMode');
    if (legacy !== null) {
        var migrated = _migrateLegacyChordMode(legacy);
        try { localStorage.removeItem('papianoChordMode'); } catch(e) {}
        if (migrated) { setChordMode(migrated); return; }
    }
    syncChordModeUI();
} catch(e) { syncChordModeUI(); } })();
// Chord section fully initialized: getCurrentSettings()/applyFactoryDefaults()
// can safely read/set chord state from this point on.
_chordSystemReady = true;

let midiAccess = null;
let midiEnabled = false;
const midiBtn = document.getElementById('midiBtn');
function _attachMidiInputs(){
    if(!midiAccess) return;
    // Property assignment (not addEventListener) so re-running never stacks
    // duplicate listeners on the same input.
    midiAccess.inputs.forEach(input => { input.onmidimessage = (msg) => _handleMidiMessage(msg.data); });
}
function _detachMidiInputs(){
    if(!midiAccess) return;
    midiAccess.inputs.forEach(input => { input.onmidimessage = null; });
}
function _onMidiStateChange(){
    // A device was (un)plugged or one that failed earlier is now ready — re-scan
    // and re-attach so MIDI reconnects without a reload/relog.
    if(midiEnabled) _attachMidiInputs();
}
function _setMidiUiActive(on){ if(midiBtn) midiBtn.classList.toggle('active', !!on); }

// Web MIDI handler, extracted so the dispatch logic is unit-testable. Note: we
// deliberately do NOT filter GM channel 10 here. A live controller or DAW track
// can legitimately transmit piano notes on channel 10, and dropping it makes
// such keyboards appear dead; phantom-note problems from a specific MIDI FILE
// are the player's file/router config, not something the web app should mask by
// discarding a whole channel.
function _handleMidiMessage(data){
    if(!data || data.length < 1) return;
    const statusByte = data[0];
    const data1 = data[1];
    const data2 = data[2];
    const status = statusByte & 0xF0;
    const note = data1;
    const velocity = data2 || 0;
    // Sustain pedal (CC64) — always process. A dropped pedal-up leaves
    // every previously-released voice ringing at the audio layer forever;
    // a dropped pedal-down loses the pianistic effect the player just
    // asked for. Neither has any downside to processing while input is
    // otherwise gated.
    if (status === 0xB0 && data1 === 64) {
        setMidiSustainPedal(velocity >= 64);
        isSus = manualSustainEnabled || midiSustainPedalDown;
        requestChordUpdate();
        return;
    }
    // Note-off is ALWAYS processed regardless of input-ready state. A
    // dropped noteOff strands the note in pressStartTimes / activeNotes
    // (audio keeps ringing, chord detector keeps reading it) and is the
    // classic source of "note not pressed but chord still detected" bugs
    // when a modal opens or a room transition fires between press and
    // release. Only the note-ON branch below is gated.
    if ((status === 0x80) || (status === 0x90 && velocity === 0)) {
        markInputBurst();
        const visualNote = note + transpose;
        // The layer/pad voice must release on its own Fade regardless of the
        // pedal (stopNote's string branch is the sole authority over it) --
        // only the piano voice can legitimately be held open by CC64.
        stopNote(note, false, undefined, ['string']);
        if (midiSustainPedalDown) midiPedalHeldNotes.add(note);
        else stopNote(note, false, undefined, ['piano']);
        const keyEl = keyElCache.get(visualNote);
        playReleaseVisual(visualNote, keyEl);
        if(window.PapianoMultiplayer && typeof window.PapianoMultiplayer.sendNoteOff === 'function') window.PapianoMultiplayer.sendNoteOff(visualNote);
        return;
    }
    if (status === 0x90 && velocity > 0) {
        // The one branch where the input-ready gate legitimately applies:
        // fresh onsets are dropped while the piano isn't accepting input.
        // Any earlier onset that WAS accepted still gets its matching
        // noteOff through the branch above.
        if(!isPianoInputAllowed()) return;
        const burst = markInputBurst();
        midiPedalHeldNotes.delete(note);
        const visualNote = note + transpose;
        const keyEl = keyElCache.get(visualNote);
        playNote(note, transpose, velocity / 127);
        playPressVisual(visualNote, keyEl, burst);
        if(window.PapianoMultiplayer && typeof window.PapianoMultiplayer.sendNoteOn === 'function') window.PapianoMultiplayer.sendNoteOn(visualNote, velocity / 127);
    }
}
window._handleMidiMessage = _handleMidiMessage;

midiBtn.onclick = () => {
    if(!midiEnabled){
        if(!navigator.requestMIDIAccess){
            _setMidiUiActive(false);
            showToast('This browser does not support the Web MIDI API. Try Chrome or Edge on desktop.', { type:'error', title:'MIDI not supported' });
            return;
        }
        midiEnabled = true;
        _setMidiUiActive(true);
        // Reuse an existing access object (instant re-enable + still hot-plug aware).
        if(midiAccess){ _attachMidiInputs(); return; }
        navigator.requestMIDIAccess().then(midi => {
            midiAccess = midi;
            midi.onstatechange = _onMidiStateChange;
            if(midiEnabled) _attachMidiInputs(); else _detachMidiInputs();
        }).catch(() => {
            midiEnabled = false;
            _setMidiUiActive(false);
            showToast('MIDI access was denied or is unavailable. Check your browser permissions.', { type:'error', title:'MIDI unavailable' });
        });
    } else {
        midiEnabled = false;
        _setMidiUiActive(false);
        _detachMidiInputs();
        setMidiSustainPedal(false);
        stopAllNotes();
    }
};

(function(){
    const fsBtn = document.getElementById('fsBtn');
    if (!fsBtn) return;
    let fsRequested = false;
    let fsTimer = null;

    function apiFullscreen(){
        return !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
    }
    function displayModeFullscreen(){
        return (window.matchMedia && (
            window.matchMedia('(display-mode: fullscreen)').matches ||
            window.matchMedia('(display-mode: standalone)').matches
        ));
    }
    function viewportLooksFullscreen(){
        const vv = window.visualViewport;
        const vw = Math.round(vv ? vv.width : window.innerWidth);
        const vh = Math.round(vv ? vv.height : window.innerHeight);
        const sw = Math.max(1, Math.round(screen.width || 1));
        const sh = Math.max(1, Math.round(screen.height || 1));
        const saw = Math.max(1, Math.round(screen.availWidth || sw));
        const sah = Math.max(1, Math.round(screen.availHeight || sh));
        const area = vw * vh;
        const screenArea = sw * sh;
        const availArea = saw * sah;
        const nearScreen = area >= screenArea * 0.92 || area >= availArea * 0.96;
        const nearHeight = vh >= Math.min(sh, sah) * 0.96 || vh >= Math.max(sh, sah) * 0.92;
        const nearWidth = vw >= Math.min(sw, saw) * 0.96 || vw >= Math.max(sw, saw) * 0.92;
        return nearScreen || (nearWidth && nearHeight);
    }
    function isFullscreen(){
        return apiFullscreen() || displayModeFullscreen() || viewportLooksFullscreen() || fsRequested;
    }
    function setFsClass(on){
        document.documentElement.classList.toggle('papiano-fullscreen', on);
        document.body.classList.toggle('papiano-fullscreen', on);
        fsBtn.classList.toggle('fs-hidden', on);
    }
    function updateFullscreenButton(){
        const nativeOn = apiFullscreen() || displayModeFullscreen() || viewportLooksFullscreen();
        if (nativeOn) fsRequested = true;
        if (!nativeOn && fsRequested && !document.hasFocus()) fsRequested = false;
        const on = isFullscreen();
        setFsClass(on);
        fsBtn.style.display = on ? 'none' : 'inline-flex';
        fsBtn.textContent = 'Fullscreen';
        fsBtn.title = 'Fullscreen';
    }
    function scheduleFullscreenChecks(){
        clearInterval(fsTimer);
        let ticks = 0;
        fsTimer = setInterval(() => {
            updateFullscreenButton();
            ticks++;
            if (ticks > 16) clearInterval(fsTimer);
        }, 180);
    }
    fsBtn.onclick = () => {
        const el = document.documentElement;
        fsRequested = true;
        updateFullscreenButton();
        scheduleViewportGeometrySync();
        const req = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen;
        if(req) {
            const result = req.call(el);
            if (result && result.catch) result.catch(()=>{});
        }
        setTimeout(() => {
            if (!apiFullscreen() && !displayModeFullscreen() && !viewportLooksFullscreen()) fsRequested = false;
            updateFullscreenButton();
        }, 1400);
        scheduleFullscreenChecks();
        scheduleViewportGeometrySync();
    };
    ['fullscreenchange','webkitfullscreenchange','mozfullscreenchange','MSFullscreenChange','visibilitychange'].forEach(evt => {
        document.addEventListener(evt, () => {
            if (!apiFullscreen() && !displayModeFullscreen() && !viewportLooksFullscreen()) fsRequested = false;
            updateFullscreenButton();
            scheduleViewportGeometrySync();
        });
    });
    ['resize','orientationchange','pageshow'].forEach(evt => window.addEventListener(evt, () => {
        if (!apiFullscreen() && !displayModeFullscreen() && !viewportLooksFullscreen()) fsRequested = false;
        setTimeout(() => { updateFullscreenButton(); scheduleViewportGeometrySync(); }, 80);
    }, { passive:true }));
    updateFullscreenButton();
})();

(function(){
    const btns = { gfxPotato:'potato', gfxDefault:'default' };
    const lowHiddenRows = ['rowAnimEffect','rowAnimTone','rowKeyGlow','rowKeyGlowIntensity'];
    // Potato locks & hides the heavy-FX menus (particles + strike line) so they
    // can't be enabled in the limited tier.
    const lowHiddenSelectors = ['[data-visual-open="particle"]', '[data-visual-open="strikeLine"]'];
    const mediumHiddenRows = [];
    function effectiveQuality(){ return typeof getEffectiveGraphicQuality === 'function' ? getEffectiveGraphicQuality() : graphicQuality; }
    function refreshGraphicButtons(){
        Object.entries(btns).forEach(([id, val]) => {
            const b = document.getElementById(id);
            if(!b) return;
            b.classList.toggle('active', val === graphicQuality);
        });
    }
    function setDisplayById(id, visible){
        const el = document.getElementById(id);
        if(!el) return;
        el.style.display = visible ? '' : 'none';
    }
    function applyGraphicModeDefaults(q){
        const cfg = GRAPHIC_MODE_DEFAULTS[q] || GRAPHIC_MODE_DEFAULTS.medium;
        setKeyGlowEnabled(false);
        setStrikeLineFx('dust', cfg.dust);
        setParticleSetting('count', cfg.particleCount);
        setParticleSetting('size', cfg.particleSize);
        setParticleSetting('opacity', cfg.particleOpacity);
        setParticleSetting('speed', cfg.particleSpeed);
        setParticleSetting('turbulence', cfg.particleTurbulence);
        setParticleSetting('saturation', cfg.particleSaturation);
        setParticleSetting('fade', cfg.particleFade);
        setStrikeLineAuraSize(cfg.strikeLineAuraSize);
        setStrikeLineVisualSetting('brightness', cfg.strikeLineBrightness);
        setStrikeLineVisualSetting('opacity', cfg.strikeLineOpacity);
        setStrikeLineVisualSetting('saturation', cfg.strikeLineSaturation);
        syncStrikeLineFxButtons();
        updateStrikeLineLine();
        if(typeof ensureAnimLoop === 'function' && falling.length > 0) ensureAnimLoop();
    }
    function syncEffectiveGraphicState(prevDPR){
        const q = effectiveQuality();
        document.documentElement.setAttribute('data-graphic-quality', q);
        const nextDPR = typeof getRenderDPR === 'function' ? getRenderDPR() : prevDPR;
        if(nextDPR !== prevDPR){
            if(typeof clearEffectSpriteCache === 'function') clearEffectSpriteCache();
            if(typeof _dustSpriteCache !== 'undefined' && _dustSpriteCache.clear) _clearDustSpriteCache();
            if(typeof syncCanvasSize === 'function') syncCanvasSize(false);
        }
        refreshGraphicButtons();
    }
    function updateManualQualityUi(q, destructive){
        const isLow = q === 'potato';
        const isMed = q === 'medium';
        if(destructive){
            lowHiddenRows.forEach(id => setDisplayById(id, !isLow));
            lowHiddenSelectors.forEach(sel => { const el = document.querySelector(sel); if(el) el.style.display = isLow ? 'none' : ''; });
            mediumHiddenRows.forEach(id => setDisplayById(id, !isLow && !isMed));
        }
        const root = document.documentElement;
        if(q === 'potato'){
            root.style.setProperty('--strike-line-wave-opacity','0.28');
            root.style.setProperty('--strike-line-shadow-a','rgba(255,255,255,0.08)');
            root.style.setProperty('--strike-line-shadow-b','rgba(255,255,255,0.03)');
        } else if(q === 'medium'){
            root.style.setProperty('--strike-line-wave-opacity','0.55');
            root.style.setProperty('--strike-line-shadow-a','rgba(255,255,255,0.12)');
            root.style.setProperty('--strike-line-shadow-b','rgba(255,255,255,0.05)');
        } else {
            root.style.removeProperty('--strike-line-wave-opacity');
            root.style.removeProperty('--strike-line-shadow-a');
            root.style.removeProperty('--strike-line-shadow-b');
        }
        [document.querySelector('.top'), ...document.querySelectorAll('.floating-panel')].forEach(el => {
            if(!el) return;
            if(q === 'potato'){
                el.style.backdropFilter = 'none';
                el.style.webkitBackdropFilter = 'none';
            } else {
                el.style.backdropFilter = el.classList.contains('floating-panel') ? 'blur(22px) saturate(145%)' : 'blur(14px) saturate(138%)';
                el.style.webkitBackdropFilter = el.classList.contains('floating-panel') ? 'blur(22px) saturate(145%)' : 'blur(14px) saturate(138%)';
            }
        });
    }
    function applyGraphicQuality(q, applyDefaults){
        const prevDPR = (typeof currentDPR !== 'undefined') ? currentDPR : 1;
        // Two manual tiers (Potato/Default); 'auto' just falls back to the fixed default.
        const nextQuality = q === 'auto' ? _detectDefaultGraphicQuality() : q;
        performanceMode = 'manual';
        perfGovScale = 1.0; _perfSlowStreak = 0; _perfFastStreak = 0; _perfEmaMs = 1000 / 60; if(document.body) document.body.classList.remove('perf-lite');
        graphicQuality = GRAPHIC_PROFILES[nextQuality] ? nextQuality : _detectDefaultGraphicQuality();
        syncEffectiveGraphicState(prevDPR);
        updateManualQualityUi(graphicQuality, true);
        if(applyDefaults) applyGraphicModeDefaults(graphicQuality);
        if(typeof ensureAnimLoop === 'function' && falling.length>0) ensureAnimLoop();
    }
    Object.entries(btns).forEach(([id, val]) => {
        const b = document.getElementById(id);
        if(b) b.onclick = () => applyGraphicQuality(val, true);
    });
    window.applyGraphicQuality = applyGraphicQuality;
    window.updateAutoPerformance = function(){};
    window.setAutoGraphicQuality = function(){};
    applyGraphicQuality(graphicQuality);
})();

(function(){
    let metroBpm = 120;
    let metroBeats = 4;
    let metroSound = 'click';
    let metroRunning = false;
    let metroTimer = null;
    let metroCurBeat = 0;

    const bpmNum    = document.getElementById('metroBpmNum');
    const bpmSlider = document.getElementById('metroBpmSlider');
    const startBtn  = document.getElementById('metroStartBtn');
    const settingsBpmNum = document.getElementById('settingsMetroBpmNum');
    const settingsBpmSlider = document.getElementById('settingsMetroBpmSlider');
    const settingsStartBtn = document.getElementById('settingsMetroStartBtn');
    const dotsEl    = document.getElementById('metroDots');
    const metroBtn  = document.getElementById('metroBtn');

    function buildDots(){
        if(!dotsEl) return;
        dotsEl.innerHTML = '';
        for(let i=0;i<metroBeats;i++){
            const d = document.createElement('div');
            d.className = 'metro-dot' + (i===0 ? ' accent' : '');
            dotsEl.appendChild(d);
        }
    }

    function updateBpm(v){
        metroBpm = Math.max(20, Math.min(300, v));
        if(bpmNum) bpmNum.textContent = metroBpm;
        if(bpmSlider) bpmSlider.value = metroBpm;
        if(settingsBpmNum) settingsBpmNum.textContent = metroBpm;
        if(settingsBpmSlider) settingsBpmSlider.value = metroBpm;
        if(metroRunning){ stopMetro(); startMetro(); }
    }

    function tickSound(){
        try{
            const ctx = audioCtx;
            if(!ctx) return;
            if(ctx.state === 'suspended') ctx.resume();
            const now = ctx.currentTime;
            const isAccent = metroCurBeat === 0;
            const master = ctx.createGain();
            master.gain.setValueAtTime(isAccent ? 0.42 : 0.28, now);
            master.gain.exponentialRampToValueAtTime(0.001, now + 0.055);
            master.connect(ctx.destination);

            if(metroSound === 'beep'){
                const osc = ctx.createOscillator();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(isAccent ? 1320 : 980, now);
                osc.connect(master);
                osc.start(now);
                osc.stop(now + 0.055);
                return;
            }

            if(metroSound === 'hihat'){
                const len = Math.floor(ctx.sampleRate * 0.035);
                const buf = ctx.createBuffer(1, len, ctx.sampleRate);
                const data = buf.getChannelData(0);
                for(let i=0;i<len;i++) data[i] = (Math.random()*2-1) * Math.pow(1 - i/len, 2.4);
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
        }catch(e){}
    }

    function flashDot(){
        const dots = dotsEl ? dotsEl.querySelectorAll('.metro-dot') : [];
        const beatIndex = metroCurBeat;
        dots.forEach(d => d.classList.remove('beat'));
        if(dots[beatIndex]) dots[beatIndex].classList.add('beat');
        setTimeout(()=>{ if(dots[beatIndex]) dots[beatIndex].classList.remove('beat'); }, 80);
    }

    function tick(){
        tickSound();
        flashDot();
        metroCurBeat = (metroCurBeat + 1) % metroBeats;
    }

    function startMetro(){
        metroCurBeat = 0;
        metroRunning = true;
        tick();
        const scheduleNext = () => {
            if(!metroRunning) return;
            metroTimer = setTimeout(() => { tick(); scheduleNext(); }, 60000 / metroBpm);
        };
        scheduleNext();
        if(startBtn){ startBtn.textContent = 'Stop'; startBtn.classList.add('running'); }
        if(settingsStartBtn){ settingsStartBtn.textContent = 'Stop'; settingsStartBtn.classList.add('running'); }
        if(metroBtn) metroBtn.classList.add('active');
    }

    function stopMetro(){
        clearTimeout(metroTimer); metroTimer = null;
        metroRunning = false;
        metroCurBeat = 0;
        const dots = dotsEl ? dotsEl.querySelectorAll('.metro-dot') : [];
        dots.forEach(d => d.classList.remove('beat'));
        if(startBtn){ startBtn.textContent = 'Start'; startBtn.classList.remove('running'); }
        if(settingsStartBtn){ settingsStartBtn.textContent = 'Start'; settingsStartBtn.classList.remove('running'); }
        if(metroBtn) metroBtn.classList.remove('active');
    }

    if(startBtn) startBtn.onclick = () => { if(metroRunning) stopMetro(); else startMetro(); };
    if(settingsStartBtn) settingsStartBtn.onclick = () => { if(metroRunning) stopMetro(); else startMetro(); };

    document.querySelectorAll('.settings-metro-bpm').forEach(btn => {
        btn.onclick = () => updateBpm(metroBpm + parseInt(btn.dataset.delta, 10));
    });
    if(settingsBpmSlider) settingsBpmSlider.oninput = e => updateBpm(parseInt(e.target.value, 10));
    if(document.getElementById('metroBpmUp'))    document.getElementById('metroBpmUp').onclick    = ()=>updateBpm(metroBpm+1);
    if(document.getElementById('metroBpmDown'))  document.getElementById('metroBpmDown').onclick   = ()=>updateBpm(metroBpm-1);
    if(document.getElementById('metroBpmUp10'))  document.getElementById('metroBpmUp10').onclick   = ()=>updateBpm(metroBpm+10);
    if(document.getElementById('metroBpmDown10'))document.getElementById('metroBpmDown10').onclick  = ()=>updateBpm(metroBpm-10);
    document.querySelectorAll('.metro-bpm-btn').forEach(btn => {
        btn.addEventListener('keydown', event => {
            if(event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
            event.preventDefault();
            updateBpm(metroBpm + (event.key === 'ArrowUp' ? 1 : -1));
        });
    });
    if(bpmSlider) bpmSlider.oninput = e => updateBpm(parseInt(e.target.value));

    document.querySelectorAll('.metro-beat-btn').forEach(btn => {
        btn.onclick = () => {
            metroBeats = parseInt(btn.dataset.beats);
            document.querySelectorAll('.metro-beat-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            buildDots();
            metroCurBeat = 0;
        };
    });

    document.querySelectorAll('.metro-sound-btn').forEach(btn => {
        btn.onclick = () => {
            metroSound = btn.dataset.sound;
            document.querySelectorAll('.metro-sound-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        };
    });

    // Expose state so presets can save/restore the metronome (it lives in this
    // private scope; without this it was silently dropped from every preset).
    function applyBeats(n){
        metroBeats = Math.max(1, Math.min(12, parseInt(n, 10) || 4));
        document.querySelectorAll('.metro-beat-btn').forEach(b => b.classList.toggle('active', parseInt(b.dataset.beats, 10) === metroBeats));
        buildDots();
        metroCurBeat = 0;
    }
    function applySound(name){
        metroSound = name || 'click';
        document.querySelectorAll('.metro-sound-btn').forEach(b => b.classList.toggle('active', b.dataset.sound === metroSound));
    }
    window.getMetronomeState = function(){ return { bpm: metroBpm, beats: metroBeats, sound: metroSound }; };
    window.setMetronomeState = function(st){
        if(!st || typeof st !== 'object') return;
        if(st.bpm !== undefined) updateBpm(parseInt(st.bpm, 10) || metroBpm);
        if(st.beats !== undefined) applyBeats(st.beats);
        if(st.sound !== undefined) applySound(st.sound);
    };

    buildDots();
})();

(function(){
    const img=document.querySelector('.brand-icon img');
    if(!img)return;
    function fallback(){
        const wrap=img.closest('.brand-icon');
        if(wrap)wrap.classList.add('logo-fallback');
    }
    img.addEventListener('error', fallback, {once:true});
    if(img.complete && img.naturalWidth===0) fallback();
})();

// Solo build — loaded ONLY by solo.html. This is a standalone piano engine
// that only ever runs solo (no backend, no rooms, no chat, no AppSync/Cognito
// calls). Multiplayer has its OWN copy in js/multiplayer/multiplayer-piano.js,
// so editing one never affects the other.
//
// Local key testing (tap/click on the keybed, MIDI, and QWERTY) does not
// depend on ever "joining a room" — isPianoInputAllowed() above is simply
// ready once the piano UI has finished building.
(function bootSoloPiano(){
    document.body.classList.add('solo-mode');
    if(typeof build === 'function') build();
    if(typeof ensurePianoBootVisible === 'function') ensurePianoBootVisible();
    if(typeof updateKeyHitCache === 'function') updateKeyHitCache();
    if(typeof refreshStageHeight === 'function') refreshStageHeight();
    if(typeof refreshNoteXCache === 'function') refreshNoteXCache();
    if(typeof startStageFreshWatcher === 'function') startStageFreshWatcher();
    if(typeof startBackgroundSoundfont === 'function') startBackgroundSoundfont();
    setPianoInputReady(true);
    if(typeof forceBootVisible === 'function') forceBootVisible();
})();

// Local (non-multiplayer) chord readout for the on-screen chord display —
// same detection (matchChords) the live piano page uses, just without any
// room/player-color plumbing since there are no other players here.
function _detectAndRenderChordsLocal(){
    if(!_chordEnabled) return;
    const el1 = document.getElementById('chordPrimary');
    const el2 = document.getElementById('chordSecondary');
    if(!el1 || !el2) return;
    // Reset also clears any inline text-shadow/opacity we may have set below,
    // otherwise a theme switch (e.g. default → sketch) leaves the previous
    // drop-shadow stuck to whatever chord is on screen at the moment.
    // Chord state = currently-held keys plus anything released within the
    // last CHORD_RELEASE_GRACE_MS (see the pressStartTimes declaration near
    // the top of the file) — independent of sustain.
    const chordNoteSet = new Set();
    if(typeof pressStartTimes !== 'undefined' && pressStartTimes){
        pressStartTimes.forEach((_, m) => chordNoteSet.add(m));
    }
    if(typeof _recentReleaseNotes !== 'undefined' && _recentReleaseNotes.size){
        const _graceNow = performance.now();
        _recentReleaseNotes.forEach((ts, m) => {
            if(_graceNow - ts <= CHORD_RELEASE_GRACE_MS) chordNoteSet.add(m);
            else _recentReleaseNotes.delete(m);
        });
    }
    if(chordNoteSet.size < 3){
        el1.classList.remove('show'); el1.textContent = '';
        el1.style.color = ''; el1.style.textShadow = '';
        el2.classList.remove('show'); el2.textContent = '';
        el2.style.color = ''; el2.style.textShadow = ''; el2.style.opacity = '';
        return;
    }
    const midiArr = Array.from(chordNoteSet).sort((a,b) => a - b);
    let matches = [];
    try{ matches = matchChords(midiArr) || []; }catch(e){ matches = []; }
    if(matches.length === 0){
        el1.classList.remove('show'); el1.textContent = '';
        el1.style.color = ''; el1.style.textShadow = '';
        el2.classList.remove('show'); el2.textContent = '';
        el2.style.color = ''; el2.style.textShadow = ''; el2.style.opacity = '';
        return;
    }
    const color = (typeof userCustomChordColor === 'function' && userCustomChordColor()) || '#0099ff';
    // Sketch and 8-bit both run flat, non-glowing looks where the dark
    // drop-shadow + coloured glow renders as a visible ghost behind each
    // glyph. Emit a flat 'none' inline so it overrides the default
    // .chord-name text-shadow with its own !important.
    const isFlatTheme = document.body.classList.contains('theme-sketch') || document.body.classList.contains('theme-8bit');
    const chordShadow = isFlatTheme ? 'none' : ('0 2px 12px rgba(0,0,0,0.8), 0 0 20px ' + color + '55');
    el1.textContent = formatChord(matches[0]);
    el1.style.setProperty('color', color, 'important');
    el1.style.setProperty('text-shadow', chordShadow, 'important');
    el1.classList.add('show');
    if(matches.length >= 2){
        el2.textContent = formatChord(matches[1]);
        el2.style.setProperty('color', color, 'important');
        el2.style.setProperty('text-shadow', chordShadow, 'important');
        el2.style.setProperty('opacity', '0.6', 'important');
        el2.classList.add('show');
    } else {
        el2.classList.remove('show'); el2.textContent = '';
        el2.style.textShadow = ''; el2.style.opacity = '';
    }
}
