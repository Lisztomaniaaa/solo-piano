// Every user-facing setting, with its factory default. This object is what a
// preset saves and loads; runtime-only state lives in runtime.ts.

import { Store } from './store.js';

export type Material = 'single' | 'outline' | 'midnight' | 'glass' | 'chrome';
export type ColorMode = 'single' | 'double' | 'gradient' | 'rainbow';
export type GradientAxis = 'horizontal' | 'vertical';
export type NoteShape = 'rounded' | 'rectangle';
export type PianoTheme = 'default' | 'sketch' | '8bit';
export type LabelMode = 'qwerty' | 'octave' | 'note' | 'none' | string;
export type DustBlendMode = 'glow' | 'solid';
export type GraphicQuality = 'default' | 'potato';
export type BgFitMode = 'cover' | 'contain' | 'stretch';
export type BgPositionMode = 'center' | 'top' | 'bottom';
export type ChordTier = 'off' | 'basic' | 'medium' | 'pro' | 'expert' | 'max';
export type AutoVelocityMode = 'input' | 'arpeggio' | 'block' | 'mix';

export interface SfEffectSettings {
    sf1: { sustain: number; reverb: number };
    sf2: { fadeSec: number; reverb: number; transpose: number };
}

export interface ChordColors {
    primary: string;
    secondary: string;
}

export interface Settings {
    // Keyboard layout
    wCount: number;                 // visible white keys (3..52)
    transpose: number;              // semitones
    labelMode: LabelMode;
    keyLabelScale: number;          // %
    pianoTheme: PianoTheme;
    pianoHeight: number;            // % of max piano height
    blackKeyWidthPercent: number;   // % of the geometric black-key width
    blackKeyHeightPercent: number;  // % of white-key length
    blackKeyEdgeDepthPercent: number;
    pianoVisibilityPercent: number;
    pianoLiftPercent: number;
    accentWhite: string;            // pressed white key colour
    accentBlack: string;            // pressed black key colour
    customWhiteKey: string | null;
    customBlackKey: string | null;
    keyColorFollowFallingNotes: boolean;
    keyGlowEnabled: boolean;
    keyGlowIntensity: number;
    octaveLinesEnabled: boolean;

    // Falling notes
    isAnimOn: boolean;
    material: Material;
    animColorMode: ColorMode;
    animColor: string;
    customAnimNote: string | null;
    animColorSplit: boolean;
    animDoubleLeftColor: string;
    animDoubleRightColor: string;
    animDoubleSplitTuts: number;
    animKeyShade: boolean;
    gradientColorCount: number;
    gradientColors: string[];
    gradientIntensity: number;
    gradientAxis: GradientAxis;
    animShape: NoteShape;
    animRoundness: number;
    animSize: number;               // % of white-key width
    noteOpacity: number;
    noteSpeed: number;
    noteGlowEnabled: boolean;
    noteGlowIntensity: number;
    currentGlassColor: string;

    // Strike line
    strikeLineEnabled: boolean;
    keyDustIntensity: number;       // strike line thickness, px
    strikeLineColor: string;
    strikeLineColorSplit: boolean;
    strikeLineLeftColor: string;
    strikeLineRightColor: string;
    strikeLineSplitTuts: number;
    strikeLineColorFollowFallingNotes: boolean;
    strikeLineAuraSize: number;
    strikeLineBrightness: number;
    strikeLineOpacity: number;
    strikeLineSaturation: number;
    motionSpeed: number;
    strikeReactionEnabled: boolean;
    strikeReactionIntensity: number;

    // Particles
    strikeLineDustEnabled: boolean;
    strikeLineDustAmount: number;
    strikeLineDustSize: number;
    dustColor: string;
    dustColorSplit: boolean;
    dustColorFollowFallingNotes: boolean;
    dustDoubleLeftColor: string;
    dustDoubleRightColor: string;
    dustDoubleSplitTuts: number;
    dustBlendMode: DustBlendMode;
    particleCount: number;
    particleSize: number;
    particleOpacity: number;
    particleSpeed: number;
    particleTurbulence: number;
    particleSaturation: number;
    particleFade: number;

    // Chord display
    chordDetectorTier: ChordTier;
    chordTextScale: number;
    chordDisplayColors: ChordColors;
    customChordColor: string | null;

    // Background
    bgFitMode: BgFitMode;
    bgPositionMode: BgPositionMode;
    bgOpacity: number;
    bgDim: number;
    bgBlur: number;

    // Audio
    currentSf: string;
    currentStringSf: string;
    stringEnabled: boolean;
    stringRangeLeft: number;        // midi
    stringRangeRight: number;       // midi
    sustainLevel: number;
    manualSustainEnabled: boolean;
    sfEffectSettings: SfEffectSettings;
    pianoVolume: number;
    stringVolume: number;
    autoVelocityEnabled: boolean;
    autoVelocityMode: AutoVelocityMode;

    // System
    graphicQuality: GraphicQuality;
    perfHudEnabled: boolean;
    metronome?: { bpm: number; beats: number; sound: string };
}

export const DEFAULT_ACCENT_WHITE = '#0088e0';
export const DEFAULT_ACCENT_BLACK = '#29a3ff';
export const DEFAULT_CHORD_COLORS: ChordColors = { primary: '#0099ff', secondary: '#0099ff' };

export function isPortraitOrientation(): boolean {
    return typeof matchMedia === 'function' && matchMedia('(orientation: portrait)').matches;
}

export function isTouchDevice(): boolean {
    return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
}

export function defaultSettings(): Settings {
    const portrait = isPortraitOrientation();
    return {
        wCount: 52,
        transpose: 0,
        labelMode: isTouchDevice() ? 'octave' : 'qwerty',
        keyLabelScale: 100,
        pianoTheme: 'default',
        pianoHeight: portrait ? 15 : 40,
        blackKeyWidthPercent: 100,
        blackKeyHeightPercent: 60,
        blackKeyEdgeDepthPercent: 40,
        pianoVisibilityPercent: 100,
        pianoLiftPercent: portrait ? 18 : 0,
        accentWhite: DEFAULT_ACCENT_WHITE,
        accentBlack: DEFAULT_ACCENT_BLACK,
        customWhiteKey: null,
        customBlackKey: null,
        keyColorFollowFallingNotes: false,
        keyGlowEnabled: false,
        keyGlowIntensity: 50,
        octaveLinesEnabled: true,

        isAnimOn: true,
        material: 'single',
        animColorMode: 'single',
        animColor: '#0099ff',
        customAnimNote: null,
        animColorSplit: false,
        animDoubleLeftColor: '#0099ff',
        animDoubleRightColor: '#0099ff',
        animDoubleSplitTuts: 44,
        animKeyShade: true,
        gradientColorCount: 2,
        gradientColors: ['#0099ff', '#00e0a0', '#ffae00'],
        gradientIntensity: 70,
        gradientAxis: 'horizontal',
        animShape: 'rounded',
        animRoundness: 70,
        animSize: 90,
        noteOpacity: 100,
        noteSpeed: 75,
        noteGlowEnabled: false,
        noteGlowIntensity: 200,
        currentGlassColor: '#ffffff',

        strikeLineEnabled: true,
        keyDustIntensity: 3,
        strikeLineColor: '#0099ff',
        strikeLineColorSplit: false,
        strikeLineLeftColor: '#0099ff',
        strikeLineRightColor: '#0099ff',
        strikeLineSplitTuts: 44,
        strikeLineColorFollowFallingNotes: false,
        strikeLineAuraSize: 100,
        strikeLineBrightness: 100,
        strikeLineOpacity: 100,
        strikeLineSaturation: 100,
        motionSpeed: 50,
        strikeReactionEnabled: true,
        strikeReactionIntensity: 100,

        strikeLineDustEnabled: true,
        strikeLineDustAmount: 40,
        strikeLineDustSize: 50,
        dustColor: '#0099ff',
        dustColorSplit: false,
        dustColorFollowFallingNotes: false,
        dustDoubleLeftColor: '#0099ff',
        dustDoubleRightColor: '#0099ff',
        dustDoubleSplitTuts: 44,
        dustBlendMode: 'solid',
        particleCount: 40,
        particleSize: 50,
        particleOpacity: 100,
        particleSpeed: 30,
        particleTurbulence: 30,
        particleSaturation: 100,
        particleFade: 40,

        chordDetectorTier: 'expert',
        chordTextScale: 85,
        chordDisplayColors: { ...DEFAULT_CHORD_COLORS },
        customChordColor: null,

        bgFitMode: 'cover',
        bgPositionMode: 'center',
        bgOpacity: 100,
        bgDim: 0,
        bgBlur: 0,

        currentSf: 'grandPiano',
        currentStringSf: 'strViolin',
        stringEnabled: false,
        stringRangeLeft: 21,
        stringRangeRight: 108,
        sustainLevel: 1,
        manualSustainEnabled: false,
        sfEffectSettings: {
            sf1: { sustain: 1, reverb: 0 },
            sf2: { fadeSec: 5, reverb: 0, transpose: 0 },
        },
        pianoVolume: 0.8,
        stringVolume: 0.8,
        autoVelocityEnabled: false,
        autoVelocityMode: 'mix',

        graphicQuality: 'default',
        perfHudEnabled: false,
    };
}

export const settings = new Store<Settings>(defaultSettings());
