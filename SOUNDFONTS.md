# SoundFonts

All instruments are single-preset `.sf2` files in `soundfonts/pack/`, loaded
from the same site (`SF2_BASE` / `SF_URLS` in `src/audio/soundfonts.ts`).
Nothing is fetched from a CDN.

The files were copied byte-for-byte from the original Papiano deployment. Its
attribution file (`soundfonts/pack/manifest.json`) was not recoverable, so the
sources below come from each file's embedded SF2 `INFO` chunk plus the
original project's design notes.

**Some licenses are unverified or restrictive. Check this table before
redistributing commercially.**

| File | UI label | Source | License | Status |
|---|---|---|---|---|
| `grandPiano.sf2` | Grand Piano (default) | "Giga B Piano", embedded `IENG: Vienna Master`, 2001 | None stated | ⚠️ Unknown |
| `salamander.sf2` | Concert Grand | "SalC5Light" by Ziya Mete Demircan, derived from Salamander Grand Piano V3 (Alexander Holm) — https://rytmenpinne.wordpress.com/sounds-and-such/salamander-grandpiano/ | Embedded `ICOP: Free - nonCommercial` | ⚠️ Non-commercial |
| `atmosGrand.sf2` | Atmos Grand | Karoryfer, Versilian, Yingchun Soul (from Osiris Piano) | CC0 1.0 | ✅ |
| `pfBright.sf2` | Bright Grand | Probably FluidR3 GM (built with `split-sf2.js`), not confirmed | MIT if FluidR3 | ⚠️ Unconfirmed |
| `pfSoft.sf2` | Soft Piano | User-provided "SoftPiano.sf2", shrunk with `shrink-piano-sf2.js` | None stated | ⚠️ Unknown |
| `pfEPiano.sf2` | E-Piano | "M1 E. Piano" (Korg M1-style), made with Extreme Sample Converter | None stated | ⚠️ Unknown |
| `str*.sf2` (Violin, Cello, Ensemble, Slow, Pizz) | String | FluidR3 GM — Frank Wen | MIT | ✅ |
| `orc*.sf2` (Horn, Trumpet, Trombone, Flute, Timpani) | Orchestra | FluidR3 GM — Frank Wen | MIT | ✅ |
| `oth*.sf2` (Nylon, Steel, Bass, Vibraphone, Marimba, Choir, Organ) | Other | FluidR3 GM — Frank Wen | MIT | ✅ |

## Removed

- **Stage Piano** (`stagePiano.sf2`) — the file was not available from the
  original host, so the slot and its picker buttons were removed. Old presets
  that reference it fall back to Grand Piano.

## If you need a fully permissive set

Replace or drop the ⚠️ rows. Removing a slot means deleting its entry from
`SF_URLS` and `SOUNDFONT_LABELS` in `src/audio/soundfonts.ts` and its
`data-sf-key` buttons in `index.html`. If you remove `grandPiano`, also change
`DEFAULT_SF_KEY`.
