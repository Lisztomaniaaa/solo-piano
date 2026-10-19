# solo-piano

Browser piano (touch, QWERTY, MIDI) with SoundFont audio and falling-note
visuals. Extracted from the Papiano project's Solo Piano mode.

It runs entirely from static files: there is no backend, no account and no
CDN. Every request goes to the same origin that serves the page.

## Run

Paths are absolute (`/js/...`, `/soundfonts/...`), so serve from the repo root:

```bash
python3 -m http.server 8000
# or: npx serve .
```

Then open http://localhost:8000/solo.html. Opening the file directly
(`file://`) will not work.

## Layout

| Path | Role |
|---|---|
| `solo.html` | Page |
| `js/solo/solo-piano.js` | Piano engine |
| `css/solo/solo-piano.css` | Styles |
| `js/shared/sf2-loader.js` | SoundFont parser and IndexedDB cache |
| `js/shared/auto-velocity.js` | Auto velocity |
| `soundfonts/pack/*.sf2` | Instruments (~150 MB), see [SOUNDFONTS.md](SOUNDFONTS.md) |
| `fonts/`, `css/fonts.css` | Self-hosted Google Fonts |
| `ai-instructions/contexts/` | Design notes from the original project (historical; mentions features that were removed here) |

## Changes from the original Papiano build

- SoundFonts load from `soundfonts/pack/` instead of CloudFront.
- Presets are saved in the browser's `localStorage` (`soloPianoPresets`, up to
  5) instead of an AWS account. Login, AppSync, playtime tracking and the
  version updater were removed.
- Google Fonts are self-hosted.
- The Stage Piano instrument and the "Leave" link were removed.
- Unminified sources are served directly; there is no build step.

## Licenses

- SoundFonts: mixed, and **some are unverified or non-commercial**. See
  [SOUNDFONTS.md](SOUNDFONTS.md).
- Fonts (Fredoka, JetBrains Mono, Kalam, Nunito, Plus Jakarta Sans,
  Press Start 2P, Quicksand): SIL Open Font License 1.1.
- Code: no license file has been added yet.
