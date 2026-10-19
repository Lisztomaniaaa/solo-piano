// Papiano SF2 loader — parses .sf2 files entirely in the browser and returns
// buffer maps compatible with the piano engines' playSfBuffer
// ({ buffer, rate, gainMul, loop, loopStart, loopEnd, env } per note name).
//
// Public API on window.PapianoSF2:
//   listPresets(arrayBuffer)
//       Returns [{ bank, program, name }] for every preset in the SF2, in
//       file order. Only parses phdr — cheap even for large files.
//   buildBufferMap(arrayBuffer, audioCtx, opts?)
//       Returns { presetName, map, notes, looped }. If opts.bank and
//       opts.program are both finite the loader binds to that exact preset;
//       otherwise it picks the first bank-0 preset in program order (the
//       "melodic default" used by the built-in slots). opts.notes (an array
//       of MIDI note numbers) restricts which of the 88 notes get resolved
//       and decoded at all -- every note not listed is skipped entirely, so
//       a caller that only needs a handful of pitches (e.g. Sheet Player,
//       which knows a song's exact note set from its parsed timeline before
//       ever calling this) can skip the PCM-decoding cost for the rest.
//       Optional and purely additive: omitting it processes all 88 notes,
//       identical to every existing caller's behavior.
//
// Scope for a single preset: resolves each MIDI note 21..108 to the
// instrument zone matching that key at a fixed reference velocity, and
// pre-builds one AudioBuffer per distinct sample (stereo pairs are merged
// into one 2-channel buffer). Loop points from the zone/sample header are
// preserved so looped sustain regions ring indefinitely while a note is
// held; the engines' own release envelopes shape the tail on note-off.
// The volume envelope's hold/decay/sustain generators are resolved into a
// per-note env descriptor (seconds + linear sustain level) that the engines
// apply as a gain automation, so looped presets decay the way their author
// intended. The initial filter cutoff/resonance generators are resolved
// into a per-note filterHz/filterQ pair the engines apply via a lowpass
// BiquadFilterNode, so presets authored with a tamed top end (most sampled
// pianos) don't play back brighter/harsher than intended. Modulators and
// the remaining envelope generators are intentionally ignored — the
// engines provide attack ramps and release handling themselves.
(function(){
'use strict';

function ascii(dv, off, len){
    let s = '';
    for (let i = 0; i < len; i++) {
        const c = dv.getUint8(off + i);
        if (!c) break;
        s += String.fromCharCode(c);
    }
    return s.trim();
}

// Locate the smpl chunk (16-bit PCM pool) and the pdta sub-chunks.
function parseChunks(dv){
    const total = dv.byteLength;
    if (total < 12 || ascii(dv, 0, 4) !== 'RIFF' || ascii(dv, 8, 4) !== 'sfbk') {
        throw new Error('Not a valid SF2 file (RIFF/sfbk header not found)');
    }
    let pos = 12;
    let smpl = null;
    const pdta = {};
    while (pos + 8 <= total) {
        const id = ascii(dv, pos, 4);
        const size = dv.getUint32(pos + 4, true);
        const body = pos + 8;
        if (id === 'LIST' && body + 4 <= total) {
            const listType = ascii(dv, body, 4);
            let p = body + 4;
            const end = Math.min(body + size, total);
            while (p + 8 <= end) {
                const cid = ascii(dv, p, 4);
                const csize = dv.getUint32(p + 4, true);
                if (listType === 'sdta' && cid === 'smpl') smpl = { off: p + 8, len: csize };
                if (listType === 'pdta') pdta[cid] = { off: p + 8, len: csize };
                p += 8 + csize + (csize & 1);
            }
        }
        pos = body + size + (size & 1);
    }
    if (!smpl) throw new Error('SF2 has no sample data (smpl chunk)');
    ['phdr','pbag','pgen','inst','ibag','igen','shdr'].forEach(k => {
        if (!pdta[k]) throw new Error('Incomplete SF2: chunk ' + k + ' is missing');
    });
    return { smpl, pdta };
}

function records(dv, chunk, size, fn){
    const out = [];
    for (let off = chunk.off; off + size <= chunk.off + chunk.len; off += size) out.push(fn(dv, off));
    return out;
}

// SF2 generator ids used here.
const G_START_OFF = 0, G_END_OFF = 1, G_STARTLOOP_OFF = 2, G_ENDLOOP_OFF = 3,
      G_FILTER_FC = 8, G_FILTER_Q = 9,
      G_START_COARSE = 4, G_END_COARSE = 12, G_INSTRUMENT = 41, G_KEYRANGE = 43,
      G_VELRANGE = 44, G_STARTLOOP_COARSE = 45, G_ATTENUATION = 48,
      G_ENDLOOP_COARSE = 50, G_COARSE_TUNE = 51, G_FINE_TUNE = 52,
      G_SAMPLE_ID = 53, G_SAMPLE_MODES = 54, G_ROOT_KEY = 58,
      G_HOLD_VOL_ENV = 35, G_DECAY_VOL_ENV = 36, G_SUSTAIN_VOL_ENV = 37,
      G_KEYNUM_TO_HOLD = 39, G_KEYNUM_TO_DECAY = 40;

const NOTE_NAMES = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
function noteName(m){ return NOTE_NAMES[m % 12] + (Math.floor(m / 12) - 1); }

function buildBufferMap(arrayBuffer, audioCtx, opts){
    const dv = new DataView(arrayBuffer);
    const { smpl, pdta } = parseChunks(dv);

    const phdr = records(dv, pdta.phdr, 38, (d,o) => ({
        name: ascii(d,o,20), preset: d.getUint16(o+20,true), bank: d.getUint16(o+22,true), bagNdx: d.getUint16(o+24,true)
    }));
    const pbag = records(dv, pdta.pbag, 4, (d,o) => ({ genNdx: d.getUint16(o,true) }));
    const pgen = records(dv, pdta.pgen, 4, (d,o) => ({
        oper: d.getUint16(o,true), amount: d.getInt16(o+2,true), uamount: d.getUint16(o+2,true), lo: d.getUint8(o+2), hi: d.getUint8(o+3)
    }));
    const inst = records(dv, pdta.inst, 22, (d,o) => ({ name: ascii(d,o,20), bagNdx: d.getUint16(o+20,true) }));
    const ibag = records(dv, pdta.ibag, 4, (d,o) => ({ genNdx: d.getUint16(o,true) }));
    const igen = records(dv, pdta.igen, 4, (d,o) => ({
        oper: d.getUint16(o,true), amount: d.getInt16(o+2,true), uamount: d.getUint16(o+2,true), lo: d.getUint8(o+2), hi: d.getUint8(o+3)
    }));
    const shdr = records(dv, pdta.shdr, 46, (d,o) => ({
        name: ascii(d,o,20), start: d.getUint32(o+20,true), end: d.getUint32(o+24,true),
        startLoop: d.getUint32(o+28,true), endLoop: d.getUint32(o+32,true), sampleRate: d.getUint32(o+36,true),
        originalKey: d.getUint8(o+40), correction: d.getInt8(o+41), link: d.getUint16(o+42,true), type: d.getUint16(o+44,true)
    }));

    // The final phdr/inst/shdr records are EOP/EOI/EOS terminators.
    const presets = phdr.slice(0, Math.max(0, phdr.length - 1));
    if (!presets.length) throw new Error('SF2 file has no presets');
    const wantBank = opts && Number.isFinite(opts.bank) ? opts.bank : null;
    const wantProgram = opts && Number.isFinite(opts.program) ? opts.program : null;
    let chosen;
    if (wantBank !== null && wantProgram !== null) {
        chosen = presets.find(p => p.bank === wantBank && p.preset === wantProgram);
        if (!chosen) throw new Error('Preset ' + wantBank + ':' + wantProgram + ' not found in this SF2');
    } else {
        chosen = presets.filter(p => p.bank === 0).sort((a,b) => a.preset - b.preset)[0] || presets[0];
    }
    const cIdx = phdr.indexOf(chosen);
    const zFrom = chosen.bagNdx;
    const zTo = phdr[cIdx + 1] ? phdr[cIdx + 1].bagNdx : pbag.length;

    const presetZones = [];
    for (let z = zFrom; z < zTo && z < pbag.length; z++) {
        const gFrom = pbag[z].genNdx;
        const gTo = pbag[z + 1] ? pbag[z + 1].genNdx : pgen.length;
        let keyLo = 0, keyHi = 127, velLo = 0, velHi = 127, instIndex = null;
        for (let g = gFrom; g < gTo && g < pgen.length; g++) {
            const gen = pgen[g];
            if (gen.oper === G_KEYRANGE) { keyLo = gen.lo; keyHi = gen.hi; }
            else if (gen.oper === G_VELRANGE) { velLo = gen.lo; velHi = gen.hi; }
            else if (gen.oper === G_INSTRUMENT) instIndex = gen.uamount;
        }
        if (instIndex !== null && instIndex < inst.length - 1) presetZones.push({ keyLo, keyHi, velLo, velHi, instIndex });
    }
    if (!presetZones.length) throw new Error('Preset "' + chosen.name + '" has no instrument zones');

    const instZoneCache = new Map();
    function instZones(ii){
        if (instZoneCache.has(ii)) return instZoneCache.get(ii);
        const from = inst[ii].bagNdx;
        const to = inst[ii + 1] ? inst[ii + 1].bagNdx : ibag.length;
        let global = {};
        const zones = [];
        for (let z = from; z < to && z < ibag.length; z++) {
            const gFrom = ibag[z].genNdx;
            const gTo = ibag[z + 1] ? ibag[z + 1].genNdx : igen.length;
            const gens = {};
            for (let g = gFrom; g < gTo && g < igen.length; g++) gens[igen[g].oper] = igen[g];
            if (gens[G_SAMPLE_ID] === undefined) { if (z === from) global = gens; continue; }
            zones.push(Object.assign({}, global, gens));
        }
        instZoneCache.set(ii, zones);
        return zones;
    }

    const totalSamples16 = Math.floor(smpl.len / 2);
    let i16 = null;
    try { i16 = new Int16Array(arrayBuffer, smpl.off, totalSamples16); } catch(e) { /* odd offset — DataView fallback below */ }
    function pcm(start, end){
        const s = Math.max(0, Math.min(totalSamples16, start));
        const e = Math.max(s, Math.min(totalSamples16, end));
        const out = new Float32Array(e - s);
        if (i16) {
            for (let i = 0; i < out.length; i++) out[i] = i16[s + i] / 32768;
        } else {
            let off = smpl.off + s * 2;
            for (let i = 0; i < out.length; i++, off += 2) out[i] = dv.getInt16(off, true) / 32768;
        }
        return out;
    }

    const bufferCache = new Map();
    // opts.mono: fold stereo pairs into one channel. Phones pay double for
    // stereo twice over — 2x the Float32 heap (a 96 MB piano SF2 decodes to
    // ~190 MB of PCM) and 2x the per-voice resample/mix work on the audio
    // thread — and phone speakers can't reproduce the width anyway. Halving
    // both is a large real-world margin against audio-thread underruns.
    const wantMono = !!(opts && opts.mono);
    function makeBuffer(idL, idR, startOff, endOff){
        const key = idL + ':' + (idR === null ? -1 : idR) + ':' + startOff + ':' + endOff;
        if (bufferCache.has(key)) return bufferCache.get(key);
        const L = shdr[idL];
        const left = pcm(L.start + startOff, L.end + endOff);
        let buffer;
        if (idR !== null && shdr[idR]) {
            const R = shdr[idR];
            const right = pcm(R.start + startOff, R.end + endOff);
            const len = Math.max(1, Math.min(left.length, right.length));
            if (wantMono) {
                buffer = audioCtx.createBuffer(1, len, L.sampleRate);
                const d = buffer.getChannelData(0);
                for (let i = 0; i < len; i++) d[i] = (left[i] + right[i]) * 0.5;
            } else {
                buffer = audioCtx.createBuffer(2, len, L.sampleRate);
                buffer.getChannelData(0).set(left.subarray(0, len));
                buffer.getChannelData(1).set(right.subarray(0, len));
            }
        } else {
            buffer = audioCtx.createBuffer(1, Math.max(1, left.length), L.sampleRate);
            buffer.getChannelData(0).set(left);
        }
        bufferCache.set(key, buffer);
        return buffer;
    }

    const gv = (zone, oper, dflt) => (zone[oper] !== undefined ? zone[oper].amount : dflt);
    const REF_VEL = 100; // single reference layer; engines scale gain by velocity
    const wantNotes = opts && Array.isArray(opts.notes) ? new Set(opts.notes) : null;
    const map = {};
    let built = 0, looped = 0;
    for (let m = 21; m <= 108; m++) {
        if (wantNotes && !wantNotes.has(m)) continue;
        let found = null;
        for (const pz of presetZones) {
            if (m < pz.keyLo || m > pz.keyHi || REF_VEL < pz.velLo || REF_VEL > pz.velHi) continue;
            for (const zone of instZones(pz.instIndex)) {
                const kr = zone[G_KEYRANGE], vr = zone[G_VELRANGE];
                if (kr && (m < kr.lo || m > kr.hi)) continue;
                if (vr && (REF_VEL < vr.lo || REF_VEL > vr.hi)) continue;
                found = zone;
                break;
            }
            if (found) break;
        }
        if (!found) continue;
        const sid = found[G_SAMPLE_ID].uamount;
        const s = shdr[sid];
        if (!s || s.end <= s.start) continue;
        // Stereo halves reference each other via link; merge into one buffer.
        let idL = sid, idR = null;
        if ((s.type & 4) && shdr[s.link]) { idL = sid; idR = s.link; }
        else if ((s.type & 2) && shdr[s.link]) { idL = s.link; idR = sid; }
        const base = shdr[idL];
        const startOff = gv(found, G_START_OFF, 0) + gv(found, G_START_COARSE, 0) * 32768;
        const endOff = gv(found, G_END_OFF, 0) + gv(found, G_END_COARSE, 0) * 32768;
        const buffer = makeBuffer(idL, idR, startOff, endOff);
        const rootKey = found[G_ROOT_KEY] !== undefined && found[G_ROOT_KEY].amount >= 0
            ? found[G_ROOT_KEY].amount
            : (base.originalKey <= 127 ? base.originalKey : 60);
        const semis = (m - rootKey) + gv(found, G_COARSE_TUNE, 0) + (gv(found, G_FINE_TUNE, 0) + base.correction) / 100;
        const att = Math.max(0, gv(found, G_ATTENUATION, 0)); // centibels
        const entry = {
            buffer,
            rate: Math.pow(2, semis / 12),
            gainMul: Math.pow(10, -att / 200)
        };
        // Initial filter cutoff: absolute cents relative to 8.176 Hz, per the
        // SF2 spec's default of 13500 cents (~19.9 kHz — effectively wide
        // open). Only attach a filter descriptor when it actually tames the
        // spectrum below "essentially inaudible"; skip it otherwise so
        // presets that don't author a filter stay exactly as they were.
        const fcCents = gv(found, G_FILTER_FC, 13500);
        const filterHz = 8.176 * Math.pow(2, fcCents / 1200);
        if (filterHz < 19000) {
            entry.filterHz = Math.max(20, Math.min(20000, filterHz));
            // filterQ generator is centibels of resonant peak height at
            // cutoff; convert to the Biquad Q convention (linear), floored
            // at the no-resonance Butterworth default.
            const qDb = Math.max(0, gv(found, G_FILTER_Q, 0)) / 10;
            entry.filterQ = Math.max(0.707, Math.pow(10, qDb / 20));
        }
        // Volume envelope hold/decay/sustain. Sample-based piano presets
        // rely on this to make looped sustain regions decay to silence
        // (sustainVolEnv 1000 cB with key-scaled decay times);
        // skipping it left pedal-held notes ringing forever at the loop's
        // level — mud plus a permanently slammed master limiter on dense
        // pedalled passages. Sustaining presets (strings, organ, choir)
        // author sustainVolEnv at/near 0 cB, so they get no env and keep
        // ringing indefinitely, exactly as before.
        const susCb = Math.max(0, Math.min(1440, gv(found, G_SUSTAIN_VOL_ENV, 0)));
        if (susCb >= 10) {
            const holdTc = gv(found, G_HOLD_VOL_ENV, -12000) + (60 - m) * gv(found, G_KEYNUM_TO_HOLD, 0);
            const decayTc = gv(found, G_DECAY_VOL_ENV, -12000) + (60 - m) * gv(found, G_KEYNUM_TO_DECAY, 0);
            entry.env = {
                holdSec: Math.max(0, Math.min(20, Math.pow(2, holdTc / 1200))),
                // Decay is a linear-in-dB ramp spanning 100 dB over decaySec,
                // i.e. exactly an exponential in amplitude — the engines map
                // it to setTargetAtTime with tc = decaySec * (8.686/100).
                decaySec: Math.max(0.01, Math.min(60, Math.pow(2, decayTc / 1200))),
                susLin: Math.pow(10, -susCb / 200)
            };
        }
        const mode = gv(found, G_SAMPLE_MODES, 0) & 3;
        if (mode === 1 || mode === 3) {
            const bufStart = base.start + startOff;
            const ls = (base.startLoop + gv(found, G_STARTLOOP_OFF, 0) + gv(found, G_STARTLOOP_COARSE, 0) * 32768 - bufStart) / base.sampleRate;
            const le = (base.endLoop + gv(found, G_ENDLOOP_OFF, 0) + gv(found, G_ENDLOOP_COARSE, 0) * 32768 - bufStart) / base.sampleRate;
            if (ls >= 0 && le > ls && ls < buffer.duration) {
                entry.loop = true;
                entry.loopStart = ls;
                entry.loopEnd = Math.min(le, buffer.duration);
                looped++;
            }
        }
        map[noteName(m)] = entry;
        built++;
    }
    if (!built) throw new Error('No sample zone matches the piano range (MIDI 21-108)');
    return { presetName: chosen.name || '', map, notes: built, looped };
}

// Lightweight preset enumerator — reads phdr only so a 200 MB SF2 with 300
// presets responds within a few ms. Used by the visualizer's Custom SF2 flow
// to render a per-preset picker before the (heavier) buildBufferMap runs.
function listPresets(arrayBuffer){
    const dv = new DataView(arrayBuffer);
    const total = dv.byteLength;
    if (total < 12 || ascii(dv, 0, 4) !== 'RIFF' || ascii(dv, 8, 4) !== 'sfbk') {
        throw new Error('Not a valid SF2 file (RIFF/sfbk header not found)');
    }
    let phdrChunk = null;
    let pos = 12;
    while (pos + 8 <= total) {
        const id = ascii(dv, pos, 4);
        const size = dv.getUint32(pos + 4, true);
        const body = pos + 8;
        if (id === 'LIST' && body + 4 <= total && ascii(dv, body, 4) === 'pdta') {
            let p = body + 4;
            const end = Math.min(body + size, total);
            while (p + 8 <= end) {
                const cid = ascii(dv, p, 4);
                const csize = dv.getUint32(p + 4, true);
                if (cid === 'phdr') { phdrChunk = { off: p + 8, len: csize }; break; }
                p += 8 + csize + (csize & 1);
            }
            break;
        }
        pos = body + size + (size & 1);
    }
    if (!phdrChunk) throw new Error('SF2 has no phdr chunk');
    const rows = records(dv, phdrChunk, 38, (d,o) => ({
        name: ascii(d,o,20),
        preset: d.getUint16(o + 20, true),
        bank: d.getUint16(o + 22, true)
    }));
    // Drop the EOP terminator record.
    return rows.slice(0, Math.max(0, rows.length - 1)).map(r => ({
        bank: r.bank,
        program: r.preset,
        name: r.name || ''
    }));
}

// ---- Persistent .sf2 byte cache (IndexedDB) -------------------------------
// Each engine's decoded-buffer cache (soundfontBufferCache) is purely
// in-memory and resets on every reload -- fine for switching soundfonts
// within a session, but the RAW FILE itself still got re-fetched over the
// network on every single page load, even for a soundfont the user already
// downloaded (reported on desktop/laptop specifically; mobile was fine).
// Rather than depend on the browser's own opaque HTTP disk cache -- which a
// desktop session is more likely to have disabled (DevTools "Disable cache"
// left checked) or to evict sooner (large multi-MB entries, more competing
// sites/tabs) -- persist the raw bytes directly, validated against the
// server's ETag/Last-Modified on every load via a cheap HEAD request (a few
// hundred bytes, not the multi-MB body) so a soundfont file replaced
// server-side (see soundfonts/pack/manifest.json's several "Replaced"
// entries) is never served stale forever.
const SF2_CACHE_DB = 'papiano-sf2-cache';
const SF2_CACHE_STORE = 'files';
const SF2_CACHE_DB_VERSION = 1;
// Loose LRU budget, not a hard quota -- soundfonts/pack currently ships ~24
// files; this covers the whole pack plus headroom for a couple of
// custom-uploaded SF2s. The browser's own Storage API quota (usually a large
// fraction of free disk) is the real backstop, handled via the try/catch
// around every IndexedDB write below (a full/denied quota just means this
// particular save is skipped -- playback already has the bytes in memory
// regardless, so a caching failure is never fatal, only a missed optimization).
const SF2_CACHE_MAX_ENTRIES = 28;

function _sf2DbOpen(){
    return new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') { reject(new Error('no indexedDB')); return; }
        let req;
        try { req = indexedDB.open(SF2_CACHE_DB, SF2_CACHE_DB_VERSION); }
        catch(e){ reject(e); return; }
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(SF2_CACHE_STORE)) db.createObjectStore(SF2_CACHE_STORE, { keyPath: 'url' });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}
function _sf2DbGet(url){
    return _sf2DbOpen().then(db => new Promise((resolve, reject) => {
        const req = db.transaction(SF2_CACHE_STORE, 'readonly').objectStore(SF2_CACHE_STORE).get(url);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
    })).catch(() => null);
}
function _sf2DbPut(entry){
    return _sf2DbOpen().then(db => new Promise((resolve, reject) => {
        const tx = db.transaction(SF2_CACHE_STORE, 'readwrite');
        tx.objectStore(SF2_CACHE_STORE).put(entry);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
    })).then(_sf2DbEvictIfNeeded).catch(() => {});
}
function _sf2DbEvictIfNeeded(){
    return _sf2DbOpen().then(db => new Promise((resolve, reject) => {
        const req = db.transaction(SF2_CACHE_STORE, 'readonly').objectStore(SF2_CACHE_STORE).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
    })).then(all => {
        if (all.length <= SF2_CACHE_MAX_ENTRIES) return;
        all.sort((a, b) => (a.lastUsed || 0) - (b.lastUsed || 0));
        const toEvict = all.slice(0, all.length - SF2_CACHE_MAX_ENTRIES);
        return _sf2DbOpen().then(db => new Promise((resolve, reject) => {
            const tx = db.transaction(SF2_CACHE_STORE, 'readwrite');
            const store = tx.objectStore(SF2_CACHE_STORE);
            toEvict.forEach(e => store.delete(e.url));
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
        }));
    }).catch(() => {});
}
// A HEAD request just to read the validator headers -- a few hundred bytes,
// not the multi-MB body. If it fails for any reason (offline, blocked,
// no CORS on HEAD) a cached copy is served as-is rather than forcing a
// redownload; with no cached copy either this just falls through to the
// full GET below, identical to the pre-cache behavior.
function _sf2FetchValidator(url, signal){
    return fetch(url, { method: 'HEAD', signal }).then(res => {
        if (!res.ok) return null;
        return { etag: res.headers.get('ETag') || '', lastModified: res.headers.get('Last-Modified') || '' };
    }).catch(() => null);
}
function _sf2FetchFresh(url, onProgress, signal){
    return fetch(url, signal ? { signal } : undefined).then(res => {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const total = Number(res.headers.get('content-length')) || 0;
        if (!res.body || typeof ReadableStream === 'undefined') return res.arrayBuffer().then(buf => {
            if (onProgress && total > 0) onProgress(total, total);
            return buf;
        });
        const reader = res.body.getReader();
        const chunks = [];
        let received = 0;
        return new Promise((resolve, reject) => {
            (function pump(){
                reader.read().then(({ done, value }) => {
                    if (done){
                        const merged = new Uint8Array(received);
                        let offset = 0;
                        for (const chunk of chunks){ merged.set(chunk, offset); offset += chunk.length; }
                        resolve(merged.buffer);
                        return;
                    }
                    chunks.push(value);
                    received += value.length;
                    if (onProgress) onProgress(received, total || received);
                    pump();
                }).catch(reject);
            })();
        });
    });
}
// Public: fetch a .sf2's raw bytes, transparently persisted across reloads.
// Same signature/contract as a plain fetch-to-ArrayBuffer helper (progress
// callback + AbortSignal), so every engine's loadLocalSf2 can call this in
// place of its own fetch()+streaming logic with no other change needed.
function fetchCached(url, onProgress, signal){
    return _sf2DbGet(url).then(cached => {
        return _sf2FetchValidator(url, signal).then(validator => {
            const hasValidator = validator && (validator.etag || validator.lastModified);
            if (cached && hasValidator) {
                const same = validator.etag ? (validator.etag === cached.etag) : (validator.lastModified === cached.lastModified);
                if (same) {
                    _sf2DbPut(Object.assign({}, cached, { lastUsed: Date.now() }));
                    if (onProgress) onProgress(cached.buffer.byteLength, cached.buffer.byteLength);
                    return cached.buffer;
                }
            } else if (cached && !validator) {
                // Couldn't reach the server to validate (offline, blocked) --
                // serve the cached copy rather than fail outright.
                _sf2DbPut(Object.assign({}, cached, { lastUsed: Date.now() }));
                if (onProgress) onProgress(cached.buffer.byteLength, cached.buffer.byteLength);
                return cached.buffer;
            }
            return _sf2FetchFresh(url, onProgress, signal).then(buffer => {
                _sf2DbPut({
                    url, buffer,
                    etag: (validator && validator.etag) || '',
                    lastModified: (validator && validator.lastModified) || '',
                    lastUsed: Date.now()
                });
                return buffer;
            });
        });
    });
}

window.PapianoSF2 = { buildBufferMap, listPresets, fetchCached };
})();
