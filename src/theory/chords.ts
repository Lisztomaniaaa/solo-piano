// Chord engine: pure functions, no DOM. matchChords() takes the sounding
// pitches and the detector tier and returns up to two readable candidates.
//
// Tiers (ascending; a chord tagged N is admitted when the active level >= N):
//   basic   — Maj, m, dim, aug, 5, sus2, sus4 (triads only).
//   medium  — up to 9th, no alterations.
//   pro     — altered, every voice within an octave of the root (<= 15).
//   expert  — full 11/13/#11/b13 extensions, no omit.
//   max     — expert PLUS omit candidates (no3)/(no5)/(no7); the only tier
//             where addBetaOmitCandidates and the P5-drop match fire.

export type ChordLevelName = 'basic' | 'medium' | 'pro' | 'expert' | 'max';

export const NOTE_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

interface ChordDef {
    s: number[];
    n: string;
    m: ChordLevelName;
    level: number;
    pcMask: number;
}

export interface ChordMatch {
    root: number;
    suffix: string;
    rawSuffix: string;
    bassNote: number;
    isInversion: boolean;
    patternLen: number;
    source: 'exact' | 'beta';
    noList: number[];
}

export function modeLevel(m: string): number {
    switch (m) {
        case 'basic': return 1;
        case 'medium': return 2;
        case 'pro': return 3;
        case 'expert': return 4;
        case 'max': return 5;
        default: return 0;
    }
}

const RAW_CHORD_DB: [number[], string, ChordLevelName][] = [
    [[0, 4, 7, 10, 21], '13', 'expert'],
    [[0, 3, 7, 10, 21], 'm13', 'expert'],
    [[0, 4, 7, 11, 21], 'Maj13', 'expert'],
    [[0, 4, 7, 10, 14, 17, 21], '13', 'expert'],
    [[0, 4, 7, 11, 14, 17, 21], 'Maj13', 'expert'],
    [[0, 3, 7, 10, 14, 17, 21], 'm13', 'expert'],
    [[0, 4, 7, 10, 13, 17, 21], '13b9', 'expert'],
    [[0, 4, 7, 10, 15, 17, 21], '13#9', 'expert'],
    [[0, 4, 7, 10, 14, 18, 21], '13#11', 'expert'],
    [[0, 4, 7, 10, 13, 18, 21], '13b9#11', 'expert'],
    [[0, 4, 7, 10, 15, 18, 21], '13#9#11', 'expert'],
    [[0, 4, 7, 11, 14, 18, 21], 'Maj13#11', 'expert'],
    [[0, 4, 7, 10, 18], '7#11', 'expert'],
    [[0, 4, 7, 11, 18], 'Maj7#11', 'expert'],
    [[0, 4, 7, 10, 17], '7add11', 'expert'],
    [[0, 3, 7, 10, 17], 'm7add11', 'expert'],
    [[0, 4, 7, 10, 14, 17], '11', 'expert'],
    [[0, 4, 7, 11, 14, 17], 'Maj11', 'expert'],
    [[0, 3, 7, 10, 14, 17], 'm11', 'expert'],
    [[0, 3, 7, 11, 14, 17], 'm(Maj11)', 'expert'],
    [[0, 4, 7, 10, 14, 18], '9#11', 'expert'],
    [[0, 4, 7, 11, 14, 18], 'Maj9#11', 'expert'],
    [[0, 3, 6, 10, 14, 17], 'm11b5', 'expert'],
    [[0, 3, 6, 10, 14], 'm9b5', 'pro'],
    [[0, 4, 7, 10, 13, 18], '7b9#11', 'expert'],
    [[0, 4, 7, 10, 15, 18], '7#9#11', 'expert'],
    [[0, 4, 5, 7], 'add11', 'medium'],
    [[0, 3, 5, 7], 'madd11', 'medium'],
    [[0, 4, 7, 9, 14], '6/9', 'medium'],
    [[0, 3, 7, 9, 14], 'm6/9', 'medium'],
    [[0, 4, 7, 14], 'add9', 'medium'],
    [[0, 3, 7, 14], 'madd9', 'medium'],
    [[0, 4, 7, 11, 14], 'Maj9', 'medium'],
    [[0, 3, 7, 10, 14], 'm9', 'medium'],
    [[0, 3, 7, 11, 14], 'm(Maj9)', 'medium'],
    [[0, 3, 7, 11, 21], 'm6(Maj7)', 'expert'],
    [[0, 4, 7, 10, 14], '9', 'medium'],
    [[0, 4, 7, 10, 13], '7b9', 'pro'],
    [[0, 4, 7, 10, 15], '7#9', 'pro'],
    [[0, 4, 7, 11, 13], 'Maj7b9', 'pro'],
    [[0, 4, 7, 11, 15], 'Maj7#9', 'pro'],
    [[0, 3, 7, 10, 13], 'm7b9', 'pro'],
    [[0, 5, 7, 10, 14], '9sus4', 'medium'],
    [[0, 2, 7, 10, 14], '9sus2', 'medium'],
    [[0, 5, 7, 11, 14], 'Maj9sus4', 'medium'],
    [[0, 4, 6, 10, 14], '9b5', 'pro'],
    [[0, 4, 8, 10, 14], '9#5', 'pro'],
    [[0, 3, 8, 10], 'm7#5', 'pro'],
    [[0, 3, 8, 10, 14], 'm9#5', 'expert'],
    [[0, 4, 8, 11, 14], 'Maj9#5', 'expert'],
    [[0, 4, 7, 9, 18], '6#11', 'pro'],
    [[0, 4, 7, 9, 14, 18], '6/9#11', 'expert'],
    [[0, 4, 8, 10, 13], '7#5b9', 'pro'],
    [[0, 4, 8, 10, 15], '7#5#9', 'pro'],
    [[0, 4, 6, 10, 15], '7b5#9', 'pro'],
    [[0, 4, 7, 10, 20], '7b13', 'expert'],
    [[0, 4, 8, 10, 20], '7#5b13', 'expert'],
    [[0, 4, 7, 10, 13, 20], '7b9b13', 'expert'],
    [[0, 4, 7, 10, 15, 20], '7#9b13', 'expert'],
    [[0, 4, 7, 10, 14, 20], '9b13', 'expert'],
    [[0, 4, 7, 10], '7', 'medium'],
    [[0, 4, 7, 11], 'Maj7', 'medium'],
    [[0, 3, 7, 10], 'm7', 'medium'],
    [[0, 3, 7, 11], 'm(Maj7)', 'medium'],
    [[0, 3, 6, 9], 'dim7', 'medium'],
    [[0, 3, 6, 11], 'dim(Maj7)', 'pro'],
    [[0, 3, 6, 10], 'm7b5', 'medium'],
    [[0, 4, 8, 10], '7#5', 'pro'],
    [[0, 4, 6, 10], '7b5', 'pro'],
    [[0, 4, 8, 11], 'Maj7#5', 'pro'],
    [[0, 4, 6, 11], 'Maj7b5', 'pro'],
    [[0, 5, 7, 10], '7sus4', 'medium'],
    [[0, 2, 7, 10], '7sus2', 'medium'],
    [[0, 5, 7, 11], 'Maj7sus4', 'medium'],
    [[0, 2, 7, 11], 'Maj7sus2', 'medium'],
    [[0, 1, 5, 7, 10], '7susb9', 'pro'],
    [[0, 5, 7, 10, 14, 21], '13sus4', 'expert'],
    [[0, 5, 7, 10, 21], '13sus4', 'expert'],
    [[0, 4, 6, 10, 13], '7b5b9', 'pro'],
    [[0, 4, 7, 9], '6', 'medium'],
    [[0, 3, 7, 9], 'm6', 'medium'],
    [[0, 4, 7], 'Maj', 'basic'],
    [[0, 3, 7], 'm', 'basic'],
    [[0, 3, 6], 'dim', 'basic'],
    [[0, 4, 8], 'aug', 'basic'],
    [[0, 7], '5', 'basic'],
    [[0, 2, 7], 'sus2', 'basic'],
    [[0, 5, 7], 'sus4', 'basic'],
];

const CHORD_DB: ChordDef[] = RAW_CHORD_DB.map(([s, n, m]) => ({
    s, n, m,
    level: modeLevel(m),
    pcMask: s.reduce((mask, iv) => mask | (1 << (iv % 12)), 0),
}));

function pitchClassesFromMask(mask: number): number[] {
    const pcs: number[] = [];
    for (let i = 0; i < 12; i++) if (mask & (1 << i)) pcs.push(i);
    return pcs;
}

function rotatePcMask(mask: number, root: number): number {
    let out = 0;
    for (let i = 0; i < 12; i++) if (mask & (1 << i)) out |= 1 << ((root + i) % 12);
    return out;
}

function chordNoSuffix(suffix: string, missing: number[]): string {
    if (!missing || missing.length === 0) return suffix;
    const clean = [...new Set(missing)].sort((a, b) => a - b);
    if (clean.length === 1 && clean[0] === 5 && /^(7|Maj7|m7)$/.test(suffix)) return suffix;
    const noText = clean.map(n => 'no' + n).join(',');
    if (suffix === 'm(Maj9)') return 'mMaj9(' + noText + ')';
    if (suffix === 'm(Maj7)') return 'mMaj7(' + noText + ')';
    return suffix + '(' + noText + ')';
}

function chordSuffixClean(suffix: string): string {
    if (suffix === '7#5b13') return '7#5';
    if (suffix === '9#5b13') return '9#5';
    return suffix;
}

function chordComplexityPenalty(suffix: string): number {
    let p = 0;
    p += (suffix.match(/\//g) || []).length * 12;
    p += (suffix.match(/\(/g) || []).length * 10;
    p += (suffix.match(/no/g) || []).length * 16;
    p += (suffix.match(/[b#]/g) || []).length * 4;
    if (suffix.length > 8) p += Math.floor((suffix.length - 8) * 1.5);
    return p;
}

function chordScore(match: ChordMatch): number {
    let score = 0;
    score += match.patternLen * 12;
    score += match.source === 'exact' ? 220 : 0;
    score += match.source === 'beta' ? -74 : 0;
    score += match.isInversion ? -24 : 120;
    if (match.bassNote === match.root) score += 44;
    if (match.noList && match.noList.includes(5)) score -= 8;
    if (match.noList && match.noList.includes(3)) score -= 42;
    if (match.noList && match.noList.includes(7)) score -= 78;
    score -= chordComplexityPenalty(match.suffix);
    const s = match.suffix;
    if (s === 'Maj') score += 8;
    if (s === 'add9' || s === 'madd9') score += 16;
    if (s === 'Maj9' || s === 'm9' || s === '9') score += 14;
    if (s === '13' || s === 'm13' || s === 'Maj13') score += 22;
    if (s === '7#11' || s === 'Maj7#11' || s === '9#11' || s === 'Maj9#11') score += 26;
    if (s === '7add11') score += 14;
    if (s === '7b5' || s === '9b5') score += 8;
    if (s === '7b13' || s === '9b13') score += 34;
    if (s === 'm(Maj7)' && match.patternLen >= 5) score += 38;
    if (match.rawSuffix === '7#5b13') score -= 30;
    return score;
}

function betaPush(results: ChordMatch[], root: number, suffix: string, rawSuffix: string,
    bassNote: number, patternLen: number, noList: number[]): void {
    results.push({ root, suffix, rawSuffix, bassNote, isInversion: false, patternLen, source: 'beta', noList: noList || [] });
}

function addBetaOmitCandidates(results: ChordMatch[], pcs: number[], bassNote: number, mode: string): void {
    // Only the 'max' tier opens the omit path.
    if (mode !== 'max' || pcs.length < 4) return;
    for (let root = 0; root < 12; root++) {
        const intervals = new Set(pcs.map(pc => (pc - root + 12) % 12));
        const has = (iv: number): boolean => intervals.has(iv);
        if (!has(0)) continue;
        // An omit candidate only fires when the input is EXACTLY the target
        // chord's tones minus the omitted one, never when extra pitch classes
        // are present (otherwise a blurred cluster gets a nonsensical name).
        const exact = (allowed: Set<number>): boolean => {
            for (const v of intervals) if (!allowed.has(v)) return false;
            return true;
        };
        const hasMaj3 = has(4), hasMin3 = has(3), hasP5 = has(7), hasb7 = has(10), hasMaj7 = has(11);
        const has9 = has(2), has11 = has(5), has13 = has(9);

        if (hasP5 && hasb7 && !hasMaj3 && !hasMin3) {
            if (has9 && has13 && exact(new Set([0, 7, 10, 2, 9]))) betaPush(results, root, '13(no3)', '13', bassNote, 6, [3]);
            else if (has13 && exact(new Set([0, 7, 10, 9]))) betaPush(results, root, '13(no3)', '13', bassNote, 5, [3]);
            else if (has9 && exact(new Set([0, 7, 10, 2]))) betaPush(results, root, '9(no3)', '9', bassNote, 5, [3]);
        }

        if (!hasP5 && hasb7 && hasMaj3 && !hasMin3 && has9 && has13 && exact(new Set([0, 4, 10, 2, 9]))) {
            betaPush(results, root, '13(no5)', '13', bassNote, 6, [5]);
        } else if (!hasP5 && hasb7 && hasMaj3 && !hasMin3 && has9 && exact(new Set([0, 4, 10, 2]))) {
            betaPush(results, root, '9(no5)', '9', bassNote, 5, [5]);
        } else if (!hasP5 && hasMaj7 && hasMaj3 && !hasMin3 && has9 && exact(new Set([0, 4, 11, 2]))) {
            betaPush(results, root, 'Maj9(no5)', 'Maj9', bassNote, 5, [5]);
        } else if (!hasP5 && hasMaj7 && hasMin3 && !hasMaj3 && has9 && exact(new Set([0, 3, 11, 2]))) {
            betaPush(results, root, 'mMaj9(no5)', 'm(Maj9)', bassNote, 5, [5]);
        } else if (!hasP5 && hasb7 && hasMin3 && !hasMaj3 && has9 && exact(new Set([0, 3, 10, 2]))) {
            betaPush(results, root, 'm9(no5)', 'm9', bassNote, 5, [5]);
        }

        if (hasP5 && !hasb7 && !hasMaj7 && has9 && has11 && has13) {
            if (hasMin3 && !hasMaj3 && exact(new Set([0, 3, 7, 2, 5, 9]))) betaPush(results, root, 'm13(no7)', 'm13', bassNote, 6, [7]);
            else if (hasMaj3 && !hasMin3 && exact(new Set([0, 4, 7, 2, 5, 9]))) betaPush(results, root, '13(no7)', '13', bassNote, 6, [7]);
        }
    }
}

function isStrongExactCandidate(match: ChordMatch, pcs: number[]): boolean {
    if (!match || match.source !== 'exact' || match.noList?.length) return false;
    if (match.isInversion) return false;
    if (match.patternLen < pcs.length) return false;
    if (chordComplexityPenalty(match.suffix) > 18) return false;
    return true;
}

function isTritoneRoot(a: number, b: number): boolean {
    return ((a - b + 12) % 12) === 6;
}

function isNoChord(match: ChordMatch): boolean {
    return !!(match && match.noList && match.noList.length);
}

function isAlteredOrLydianDominant(suffix: string): boolean {
    return /#11|b5|#5|b9|#9|b13/.test(suffix || '');
}

function filterReadableChordResults(list: ChordMatch[]): ChordMatch[] {
    if (!list.length) return list;
    const primary = list[0]!;
    const primaryScore = chordScore(primary);
    const filtered = [primary];

    if (primary.source === 'beta' || isNoChord(primary)) return filtered;

    for (let i = 1; i < list.length; i++) {
        const cand = list[i]!;
        const candScore = chordScore(cand);
        if (isNoChord(cand) && cand.root !== primary.root) continue;
        if (cand.source === 'beta' && primary.source === 'exact') continue;

        if (isTritoneRoot(cand.root, primary.root) && isAlteredOrLydianDominant(cand.suffix)) continue;
        if (isTritoneRoot(cand.root, primary.root) && isAlteredOrLydianDominant(primary.suffix)) continue;

        if (primary.source === 'exact' && !primary.isInversion && cand.isInversion && candScore < primaryScore - 34) continue;

        if (candScore < primaryScore - 54) continue;
        filtered.push(cand);
        if (filtered.length >= 2) break;
    }
    return filtered;
}

/**
 * Best (up to two) chord readings for the given pitches. `mode` is the active
 * tier ('basic' | 'medium' | 'pro' | 'expert' | 'max').
 */
export function matchChords(midiArr: readonly number[], mode: string): ChordMatch[] {
    if (midiArr.length < 3) return [];
    let pcMask = 0;
    let bassMidi = midiArr[0]!;
    for (let i = 0; i < midiArr.length; i++) {
        const midi = midiArr[i]!;
        if (midi < bassMidi) bassMidi = midi;
        pcMask |= 1 << (((midi % 12) + 12) % 12);
    }
    const pcs = pitchClassesFromMask(pcMask);
    const bassNote = ((bassMidi % 12) + 12) % 12;
    const pcCounts: number[] = new Array(12).fill(0);
    for (let i = 0; i < midiArr.length; i++) pcCounts[((midiArr[i]! % 12) + 12) % 12]!++;
    const bassIsolated = pcCounts[bassNote] === 1;
    const results: ChordMatch[] = [];
    // `isMax` gates the "omit / drop the P5" branches inside the match loop.
    const isMax = mode === 'max';
    const activeLevel = modeLevel(mode);
    for (let root = 0; root < 12; root++) {
        let intervalMask = 0;
        for (let i = 0; i < midiArr.length; i++) {
            const pc = ((midiArr[i]! % 12) + 12) % 12;
            const base = (pc - root + 12) % 12;
            intervalMask |= 1 << base;
            const upper = base + 12;
            if (upper <= 22 && !(pc === bassNote && bassIsolated)) intervalMask |= 1 << upper;
        }
        for (let ci = 0; ci < CHORD_DB.length; ci++) {
            const cd = CHORD_DB[ci]!;
            if (cd.level > activeLevel) continue;
            const missingNo: number[] = [];
            let match = true;
            for (let si = 0; si < cd.s.length; si++) {
                const iv = cd.s[si]!;
                if (intervalMask & (1 << iv)) continue;
                if (isMax && iv === 7) { missingNo.push(5); continue; }
                match = false;
                break;
            }
            if (!match) continue;
            const patternMask = rotatePcMask(cd.pcMask, root);
            if ((pcMask & ~patternMask) !== 0) continue;
            const rawSuffix = cd.n;
            const cleanSuffix = chordSuffixClean(rawSuffix);
            const noList = [...new Set(missingNo)].sort((a, b) => a - b);
            const suffix = isMax && noList.length ? chordNoSuffix(cleanSuffix, noList) : cleanSuffix;
            const source = noList.length ? 'beta' : 'exact';
            const suppressBetaSlash = source === 'beta' && ((pcMask & (1 << root)) !== 0);
            const isInversion = bassNote !== root && !suppressBetaSlash;
            results.push({ root, suffix, rawSuffix, bassNote, isInversion, patternLen: cd.s.length, source, noList });
        }
    }

    if (bassIsolated) {
        const upperMask = pcMask & ~(1 << bassNote);
        const upperPcs = pitchClassesFromMask(upperMask);
        if (upperPcs.length >= 2) {
            for (let r = 0; r < 12; r++) {
                if (!(upperMask & (1 << r))) continue;
                let intervalMask = 0;
                for (let pi = 0; pi < upperPcs.length; pi++) {
                    const base = (upperPcs[pi]! - r + 12) % 12;
                    intervalMask |= 1 << base;
                    const upperIv = base + 12;
                    if (upperIv <= 22) intervalMask |= 1 << upperIv;
                }
                for (let ci = 0; ci < CHORD_DB.length; ci++) {
                    const cd = CHORD_DB[ci]!;
                    if (cd.level > activeLevel) continue;
                    if (cd.s.length < 3 || !(cd.s.includes(3) || cd.s.includes(4))) continue;
                    let match = true;
                    for (let si = 0; si < cd.s.length; si++) {
                        if (!(intervalMask & (1 << cd.s[si]!))) { match = false; break; }
                    }
                    if (!match) continue;
                    if (rotatePcMask(cd.pcMask, r) !== upperMask) continue;
                    results.push({ root: r, suffix: chordSuffixClean(cd.n), rawSuffix: cd.n, bassNote, isInversion: true, patternLen: cd.s.length, source: 'exact', noList: [] });
                }
            }
        }
    }

    const strongExact = results.some(r => isStrongExactCandidate(r, pcs));
    if (!strongExact) addBetaOmitCandidates(results, pcs, bassNote, mode);

    // 'max' keeps the beta / (noN) candidates; every other tier strips them.
    const modeSafeResults = isMax
        ? results
        : results.filter(r => r.source !== 'beta' && !(r.noList && r.noList.length) && !/\(no\d/.test(r.suffix));
    modeSafeResults.sort((a, b) => {
        const scoreDiff = chordScore(b) - chordScore(a);
        if (scoreDiff) return scoreDiff;
        if (a.isInversion !== b.isInversion) return a.isInversion ? 1 : -1;
        return b.patternLen - a.patternLen;
    });
    const seen = new Set<string>();
    const deduped: ChordMatch[] = [];
    for (const r of modeSafeResults) {
        const name = formatChord(r);
        if (!seen.has(name)) {
            seen.add(name);
            deduped.push(r);
        }
    }
    return filterReadableChordResults(deduped).slice(0, 2);
}

export function formatChord(match: ChordMatch): string {
    const chordName = NOTE_NAMES[match.root]! + match.suffix;
    if (match.isInversion && match.bassNote !== match.root) return chordName + '/' + NOTE_NAMES[match.bassNote]!;
    return chordName;
}
