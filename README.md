# solo-piano

Browser piano (touch, QWERTY, MIDI) with SoundFont audio and falling-note
visuals. Extracted from the Papiano project's Solo Piano mode and rewritten in
TypeScript, with every visual drawn by one WebGL2 canvas.

It runs entirely from static files: there is no backend, no account and no
CDN. Every request goes to the same origin that serves the page.

## Build and run

Needs Node.js (for the TypeScript compiler only; there is no bundler).

```bash
npm install
npm run build          # tsc: src/ -> build/
python3 -m http.server 8000
# or: npx serve .
```

Then open http://localhost:8000/. All paths are relative, so the site also
works from a sub-path (such as GitHub Pages). Opening the file directly
(`file://`) will not work. `npm run watch` rebuilds on save.

A browser with WebGL 2 is required.

## Deploy

`.github/workflows/pages.yml` builds the site and publishes it to GitHub Pages
on every push to `main`. In the repository settings, set **Pages → Build and
deployment → Source** to **GitHub Actions**. The site is then served at
`https://<user>.github.io/solo-piano/`.

## Layout

| Path | Role |
|---|---|
| `index.html` | Page markup (panels, toolbar) |
| `css/solo/solo-piano.css` | Styles for the page chrome and panels |
| `src/main.ts` | Entry point |
| `src/core/` | Note hub (`performance.ts`), key geometry (`geometry.ts`), screen layout (`view.ts`) |
| `src/state/` | Typed settings store (everything a preset saves) and runtime state |
| `src/render/` | WebGL2 renderer: keyboard, falling notes, strike line, particles, labels |
| `src/audio/` | SoundFont parser/cache, voices, sustain, effects, soundfont picker |
| `src/input/` | QWERTY, pointer/touch + swipe, Web MIDI, chord display, metronome |
| `src/theory/` | Chord detection and key labels |
| `src/ui/` | Panels, settings controls, presets (localStorage), background, fullscreen |
| `soundfonts/pack/*.sf2` | Instruments (~150 MB), see [SOUNDFONTS.md](SOUNDFONTS.md) |
| `images/sketch/keys-atlas.png` | Sketch theme pencil key art |
| `fonts/`, `css/fonts.css` | Self-hosted Google Fonts |

## How it fits together

- Inputs call `pressKey` / `releaseKey` in `src/core/performance.ts`. Audio,
  the renderer and the chord detector subscribe to its events.
- UI controls only write to the `settings` store; audio and the renderer
  react to it. Presets are snapshots of that store.
- The renderer draws, in order: octave lines, particles (behind or in front of
  the notes), falling notes, the strike line, then the keyboard. The resting
  keyboard and the strike line's halo are cached in textures and only redrawn
  when settings or the layout change.
- Key positions come from one module, `src/core/geometry.ts`, which places
  black keys like a real piano: the C–E group is split into 5 equal slots and
  F–B into 7, with each black key centred in its slot.

## Changes from the original Papiano build

- SoundFonts load from `soundfonts/pack/` instead of CloudFront; presets are
  saved in `localStorage` instead of an AWS account; login, AppSync, playtime
  tracking, the version updater, the Stage Piano instrument and the "Leave"
  link were removed; Google Fonts are self-hosted.
- The single 12k-line script was rewritten as TypeScript modules. Behaviour,
  settings, defaults and storage keys are unchanged.
- Rendering moved from DOM keys + 2D canvas + CSS layers to one WebGL2
  canvas. The strike line used to be drawn by up to eight overlapping DOM
  layers (bar, three aura pseudo-elements, a second copy of them for
  multi-colour mode, a blurred band on the keyboard, a flash element and an
  empty reaction layer); it is now one draw path. Dead code from the
  multiplayer build and unreachable graphics tiers was dropped.
- Black keys follow real piano geometry (see above) instead of sitting on the
  white-key boundaries, and default to 58% of a white key's width.

## Licenses

- SoundFonts: mixed, and **some are unverified or non-commercial**. See
  [SOUNDFONTS.md](SOUNDFONTS.md).
- Fonts (Fredoka, JetBrains Mono, Kalam, Nunito, Plus Jakarta Sans,
  Press Start 2P, Quicksand): SIL Open Font License 1.1.
- Code: no license file has been added yet.
