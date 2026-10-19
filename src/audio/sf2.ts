// SF2 loader: parses .sf2 files entirely in the browser and returns buffer
// maps for playSfBuffer ({ buffer, rate, gainMul, loop, loopStart, loopEnd,
// env, filterHz, filterQ } per note name). Port of js/shared/sf2-loader.js.
//
// Scope for a single preset: resolves each MIDI note 21..108 to the
// instrument zone matching that key at a fixed reference velocity, and
// pre-builds one AudioBuffer per distinct sample (stereo pairs are merged
// into one 2-channel buffer). Loop points are preserved so looped sustain
// regions ring while a note is held; the engine's release envelopes shape the
// tail on note-off. The volume envelope's hold/decay/sustain generators become
// a per-note env descriptor, and the initial filter cutoff/resonance become a
// lowpass filterHz/filterQ pair. Modulators and the remaining envelope
// generators are intentionally ignored — the engine provides attack ramps and
// release handling itself.

export interface SfEnv {
    holdSec: number;
    decaySec: number;
    susLin: number;
}

export interface SfEntry {
    buffer: AudioBuffer;
    rate: number;
    gainMul: number;
    filterHz?: number;
    filterQ?: number;
    env?: SfEnv;
    loop?: boolean;
    loopStart?: number;
    loopEnd?: number;
}

export type SfBufferMap = Record<string, SfEntry>;

export interface BuildOptions {
    bank?: number;
    program?: number;
    notes?: number[];
    mono?: boolean;
}

export interface BuildResult {
    presetName: string;
    map: SfBufferMap;
    notes: number;
    looped: number;
}

export interface PresetInfo {
    bank: number;
    program: number;
    name: string;
}

interface Chunk { off: number; len: number }

interface Gen {
    oper: number;
    amount: number;
    uamount: number;
    lo: number;
    hi: number;
}

type Zone = Record<number, Gen>;

function ascii(dv: DataView, off: number, len: number): string {
    let s = '';
    for (let i = 0; i < len; i++) {
        const c = dv.getUint8(off + i);
        if (!c) break;
        s += String.fromCharCode(c);
    }
    return s.trim();
}

function checkHeader(dv: DataView): void {
    if (dv.byteLength < 12 || ascii(dv, 0, 4) !== 'RIFF' || ascii(dv, 8, 4) !== 'sfbk') {
        throw new Error('Not a valid SF2 file (RIFF/sfbk header not found)');
    }
}

const PDTA_REQUIRED = ['phdr', 'pbag', 'pgen', 'inst', 'ibag', 'igen', 'shdr'] as const;
type PdtaKey = typeof PDTA_REQUIRED[number];

// Locate the smpl chunk (16-bit PCM pool) and the pdta sub-chunks.
function parseChunks(dv: DataView): { smpl: Chunk; pdta: Record<PdtaKey, Chunk> } {
    const total = dv.byteLength;
    checkHeader(dv);
    let pos = 12;
    let smpl: Chunk | null = null;
    const pdta: Record<string, Chunk> = {};
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
    for (const k of PDTA_REQUIRED) {
        if (!pdta[k]) throw new Error('Incomplete SF2: chunk ' + k + ' is missing');
    }
    return { smpl, pdta: pdta as Record<PdtaKey, Chunk> };
}

function records<T>(dv: DataView, chunk: Chunk, size: number, fn: (d: DataView, o: number) => T): T[] {
    const out: T[] = [];
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

const NOTE_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
function noteName(m: number): string {
    return NOTE_NAMES[m % 12] + (Math.floor(m / 12) - 1);
}

const readGen = (d: DataView, o: number): Gen => ({
    oper: d.getUint16(o, true),
    amount: d.getInt16(o + 2, true),
    uamount: d.getUint16(o + 2, true),
    lo: d.getUint8(o + 2),
    hi: d.getUint8(o + 3),
});

export function buildBufferMap(arrayBuffer: ArrayBuffer, audioCtx: BaseAudioContext, opts?: BuildOptions): BuildResult {
    const dv = new DataView(arrayBuffer);
    const { smpl, pdta } = parseChunks(dv);

    const phdr = records(dv, pdta.phdr, 38, (d, o) => ({
        name: ascii(d, o, 20), preset: d.getUint16(o + 20, true), bank: d.getUint16(o + 22, true), bagNdx: d.getUint16(o + 24, true),
    }));
    const pbag = records(dv, pdta.pbag, 4, (d, o) => ({ genNdx: d.getUint16(o, true) }));
    const pgen = records(dv, pdta.pgen, 4, readGen);
    const inst = records(dv, pdta.inst, 22, (d, o) => ({ name: ascii(d, o, 20), bagNdx: d.getUint16(o + 20, true) }));
    const ibag = records(dv, pdta.ibag, 4, (d, o) => ({ genNdx: d.getUint16(o, true) }));
    const igen = records(dv, pdta.igen, 4, readGen);
    const shdr = records(dv, pdta.shdr, 46, (d, o) => ({
        name: ascii(d, o, 20), start: d.getUint32(o + 20, true), end: d.getUint32(o + 24, true),
        startLoop: d.getUint32(o + 28, true), endLoop: d.getUint32(o + 32, true), sampleRate: d.getUint32(o + 36, true),
        originalKey: d.getUint8(o + 40), correction: d.getInt8(o + 41), link: d.getUint16(o + 42, true), type: d.getUint16(o + 44, true),
    }));

    // The final phdr/inst/shdr records are EOP/EOI/EOS terminators.
    const presets = phdr.slice(0, Math.max(0, phdr.length - 1));
    if (!presets.length) throw new Error('SF2 file has no presets');
    const wantBank = opts && Number.isFinite(opts.bank) ? opts.bank! : null;
    const wantProgram = opts && Number.isFinite(opts.program) ? opts.program! : null;
    let chosen: typeof phdr[number] | undefined;
    if (wantBank !== null && wantProgram !== null) {
        chosen = presets.find(p => p.bank === wantBank && p.preset === wantProgram);
        if (!chosen) throw new Error('Preset ' + wantBank + ':' + wantProgram + ' not found in this SF2');
    } else {
        chosen = presets.filter(p => p.bank === 0).sort((a, b) => a.preset - b.preset)[0] || presets[0];
    }
    const cIdx = phdr.indexOf(chosen);
    const zFrom = chosen.bagNdx;
    const zTo = phdr[cIdx + 1] ? phdr[cIdx + 1].bagNdx : pbag.length;

    const presetZones: { keyLo: number; keyHi: number; velLo: number; velHi: number; instIndex: number }[] = [];
    for (let z = zFrom; z < zTo && z < pbag.length; z++) {
        const gFrom = pbag[z].genNdx;
        const gTo = pbag[z + 1] ? pbag[z + 1].genNdx : pgen.length;
        let keyLo = 0, keyHi = 127, velLo = 0, velHi = 127, instIndex: number | null = null;
        for (let g = gFrom; g < gTo && g < pgen.length; g++) {
            const gen = pgen[g];
            if (gen.oper === G_KEYRANGE) { keyLo = gen.lo; keyHi = gen.hi; }
            else if (gen.oper === G_VELRANGE) { velLo = gen.lo; velHi = gen.hi; }
            else if (gen.oper === G_INSTRUMENT) instIndex = gen.uamount;
        }
        if (instIndex !== null && instIndex < inst.length - 1) presetZones.push({ keyLo, keyHi, velLo, velHi, instIndex });
    }
    if (!presetZones.length) throw new Error('Preset "' + chosen.name + '" has no instrument zones');

    const instZoneCache = new Map<number, Zone[]>();
    function instZones(ii: number): Zone[] {
        const hit = instZoneCache.get(ii);
        if (hit) return hit;
        const from = inst[ii].bagNdx;
        const to = inst[ii + 1] ? inst[ii + 1].bagNdx : ibag.length;
        let global: Zone = {};
        const zones: Zone[] = [];
        for (let z = from; z < to && z < ibag.length; z++) {
            const gFrom = ibag[z].genNdx;
            const gTo = ibag[z + 1] ? ibag[z + 1].genNdx : igen.length;
            const gens: Zone = {};
            for (let g = gFrom; g < gTo && g < igen.length; g++) gens[igen[g].oper] = igen[g];
            if (gens[G_SAMPLE_ID] === undefined) { if (z === from) global = gens; continue; }
            zones.push(Object.assign({}, global, gens));
        }
        instZoneCache.set(ii, zones);
        return zones;
    }

    const totalSamples16 = Math.floor(smpl.len / 2);
    let i16: Int16Array | null = null;
    try { i16 = new Int16Array(arrayBuffer, smpl.off, totalSamples16); } catch { /* odd offset — DataView fallback below */ }
    function pcm(start: number, end: number): Float32Array {
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

    const bufferCache = new Map<string, AudioBuffer>();
    // opts.mono: fold stereo pairs into one channel. Phones pay double for
    // stereo twice over — 2x the Float32 heap and 2x the per-voice
    // resample/mix work on the audio thread — and phone speakers can't
    // reproduce the width anyway.
    const wantMono = !!(opts && opts.mono);
    function makeBuffer(idL: number, idR: number | null, startOff: number, endOff: number): AudioBuffer {
        const key = idL + ':' + (idR === null ? -1 : idR) + ':' + startOff + ':' + endOff;
        const hit = bufferCache.get(key);
        if (hit) return hit;
        const L = shdr[idL];
        const left = pcm(L.start + startOff, L.end + endOff);
        let buffer: AudioBuffer;
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

    const gv = (zone: Zone, oper: number, dflt: number): number => (zone[oper] !== undefined ? zone[oper].amount : dflt);
    const REF_VEL = 100; // single reference layer; the engine scales gain by velocity
    const wantNotes = opts && Array.isArray(opts.notes) ? new Set(opts.notes) : null;
    const map: SfBufferMap = {};
    let built = 0, looped = 0;
    for (let m = 21; m <= 108; m++) {
        if (wantNotes && !wantNotes.has(m)) continue;
        let found: Zone | null = null;
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
        let idL = sid, idR: number | null = null;
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
        const entry: SfEntry = {
            buffer,
            rate: Math.pow(2, semis / 12),
            gainMul: Math.pow(10, -att / 200),
        };
        // Initial filter cutoff: absolute cents relative to 8.176 Hz (SF2
        // default 13500 cents ~ 19.9 kHz, effectively open). Only attach a
        // filter when it actually tames the spectrum.
        const fcCents = gv(found, G_FILTER_FC, 13500);
        const filterHz = 8.176 * Math.pow(2, fcCents / 1200);
        if (filterHz < 19000) {
            entry.filterHz = Math.max(20, Math.min(20000, filterHz));
            // filterQ is centibels of resonant peak; convert to Biquad Q
            // (linear), floored at the Butterworth default.
            const qDb = Math.max(0, gv(found, G_FILTER_Q, 0)) / 10;
            entry.filterQ = Math.max(0.707, Math.pow(10, qDb / 20));
        }
        // Volume envelope hold/decay/sustain. Sample-based piano presets rely
        // on this to make looped sustain regions decay to silence; skipping it
        // left pedal-held notes ringing forever at the loop's level.
        // Sustaining presets (strings, organ, choir) author sustainVolEnv near
        // 0 cB, so they get no env and keep ringing.
        const susCb = Math.max(0, Math.min(1440, gv(found, G_SUSTAIN_VOL_ENV, 0)));
        if (susCb >= 10) {
            const holdTc = gv(found, G_HOLD_VOL_ENV, -12000) + (60 - m) * gv(found, G_KEYNUM_TO_HOLD, 0);
            const decayTc = gv(found, G_DECAY_VOL_ENV, -12000) + (60 - m) * gv(found, G_KEYNUM_TO_DECAY, 0);
            entry.env = {
                holdSec: Math.max(0, Math.min(20, Math.pow(2, holdTc / 1200))),
                // Decay is linear-in-dB over 100 dB, i.e. exponential in
                // amplitude — the engine maps it to setTargetAtTime with
                // tc = decaySec * (8.686/100).
                decaySec: Math.max(0.01, Math.min(60, Math.pow(2, decayTc / 1200))),
                susLin: Math.pow(10, -susCb / 200),
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

// Lightweight preset enumerator — reads phdr only, so a 200 MB SF2 with 300
// presets responds within a few ms. Used by the Custom SF2 picker.
export function listPresets(arrayBuffer: ArrayBuffer): PresetInfo[] {
    const dv = new DataView(arrayBuffer);
    const total = dv.byteLength;
    checkHeader(dv);
    let phdrChunk: Chunk | null = null;
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
    const rows = records(dv, phdrChunk, 38, (d, o) => ({
        name: ascii(d, o, 20),
        preset: d.getUint16(o + 20, true),
        bank: d.getUint16(o + 22, true),
    }));
    // Drop the EOP terminator record.
    return rows.slice(0, Math.max(0, rows.length - 1)).map(r => ({
        bank: r.bank,
        program: r.preset,
        name: r.name || '',
    }));
}

// ---- Persistent .sf2 byte cache (IndexedDB) -------------------------------
// The decoded-buffer cache is in-memory only, so the raw file used to be
// re-fetched on every page load. Persist the raw bytes, validated against the
// server's ETag/Last-Modified via a cheap HEAD request so a soundfont replaced
// server-side is never served stale forever.
const SF2_CACHE_DB = 'papiano-sf2-cache';
const SF2_CACHE_STORE = 'files';
const SF2_CACHE_DB_VERSION = 1;
// Loose LRU budget, not a hard quota: covers the whole pack plus a couple of
// custom SF2s. A failed write (quota) just skips caching — never fatal.
const SF2_CACHE_MAX_ENTRIES = 28;

interface CacheEntry {
    url: string;
    buffer: ArrayBuffer;
    etag: string;
    lastModified: string;
    lastUsed: number;
}

function dbOpen(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') { reject(new Error('no indexedDB')); return; }
        let req: IDBOpenDBRequest;
        try { req = indexedDB.open(SF2_CACHE_DB, SF2_CACHE_DB_VERSION); }
        catch (e) { reject(e); return; }
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(SF2_CACHE_STORE)) db.createObjectStore(SF2_CACHE_STORE, { keyPath: 'url' });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

function dbGet(url: string): Promise<CacheEntry | null> {
    return dbOpen().then(db => new Promise<CacheEntry | null>((resolve, reject) => {
        const req = db.transaction(SF2_CACHE_STORE, 'readonly').objectStore(SF2_CACHE_STORE).get(url);
        req.onsuccess = () => resolve((req.result as CacheEntry | undefined) || null);
        req.onerror = () => reject(req.error);
    })).catch(() => null);
}

function dbPut(entry: CacheEntry): Promise<void> {
    return dbOpen().then(db => new Promise<void>((resolve, reject) => {
        const tx = db.transaction(SF2_CACHE_STORE, 'readwrite');
        tx.objectStore(SF2_CACHE_STORE).put(entry);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    })).then(dbEvictIfNeeded).catch(() => {});
}

function dbEvictIfNeeded(): Promise<void> {
    return dbOpen().then(db => new Promise<CacheEntry[]>((resolve, reject) => {
        const req = db.transaction(SF2_CACHE_STORE, 'readonly').objectStore(SF2_CACHE_STORE).getAll();
        req.onsuccess = () => resolve((req.result as CacheEntry[]) || []);
        req.onerror = () => reject(req.error);
    })).then(all => {
        if (all.length <= SF2_CACHE_MAX_ENTRIES) return;
        all.sort((a, b) => (a.lastUsed || 0) - (b.lastUsed || 0));
        const toEvict = all.slice(0, all.length - SF2_CACHE_MAX_ENTRIES);
        return dbOpen().then(db => new Promise<void>((resolve, reject) => {
            const tx = db.transaction(SF2_CACHE_STORE, 'readwrite');
            const store = tx.objectStore(SF2_CACHE_STORE);
            toEvict.forEach(e => store.delete(e.url));
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        }));
    }).catch(() => {});
}

// HEAD request just to read the validator headers. If it fails for any
// reason, a cached copy is served as-is; with no cached copy this falls
// through to the full GET.
function fetchValidator(url: string, signal?: AbortSignal): Promise<{ etag: string; lastModified: string } | null> {
    return fetch(url, { method: 'HEAD', signal }).then(res => {
        if (!res.ok) return null;
        return { etag: res.headers.get('ETag') || '', lastModified: res.headers.get('Last-Modified') || '' };
    }).catch(() => null);
}

export type ProgressFn = (received: number, total: number) => void;

function fetchFresh(url: string, onProgress?: ProgressFn | null, signal?: AbortSignal): Promise<ArrayBuffer> {
    return fetch(url, signal ? { signal } : undefined).then(res => {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const total = Number(res.headers.get('content-length')) || 0;
        if (!res.body || typeof ReadableStream === 'undefined') return res.arrayBuffer().then(buf => {
            if (onProgress && total > 0) onProgress(total, total);
            return buf;
        });
        const reader = res.body.getReader();
        const chunks: Uint8Array[] = [];
        let received = 0;
        return new Promise<ArrayBuffer>((resolve, reject) => {
            const pump = (): void => {
                reader.read().then(({ done, value }) => {
                    if (done) {
                        const merged = new Uint8Array(received);
                        let offset = 0;
                        for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.length; }
                        resolve(merged.buffer);
                        return;
                    }
                    chunks.push(value);
                    received += value.length;
                    if (onProgress) onProgress(received, total || received);
                    pump();
                }).catch(reject);
            };
            pump();
        });
    });
}

/** Fetches a .sf2's raw bytes, transparently persisted across reloads. */
export function fetchCached(url: string, onProgress?: ProgressFn | null, signal?: AbortSignal): Promise<ArrayBuffer> {
    return dbGet(url).then(cached => {
        return fetchValidator(url, signal).then(validator => {
            const hasValidator = validator && (validator.etag || validator.lastModified);
            if (cached && hasValidator) {
                const same = validator!.etag ? (validator!.etag === cached.etag) : (validator!.lastModified === cached.lastModified);
                if (same) {
                    dbPut(Object.assign({}, cached, { lastUsed: Date.now() }));
                    if (onProgress) onProgress(cached.buffer.byteLength, cached.buffer.byteLength);
                    return cached.buffer;
                }
            } else if (cached && !validator) {
                // Couldn't reach the server to validate (offline, blocked) —
                // serve the cached copy rather than fail outright.
                dbPut(Object.assign({}, cached, { lastUsed: Date.now() }));
                if (onProgress) onProgress(cached.buffer.byteLength, cached.buffer.byteLength);
                return cached.buffer;
            }
            return fetchFresh(url, onProgress, signal).then(buffer => {
                dbPut({
                    url, buffer,
                    etag: (validator && validator.etag) || '',
                    lastModified: (validator && validator.lastModified) || '',
                    lastUsed: Date.now(),
                });
                return buffer;
            });
        });
    });
}
