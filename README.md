# solo-piano

Solo Piano mode extracted from the Papiano backup (`papianobackup2.tar.gz`).

## Files

| Path | Role |
|---|---|
| `solo.html` | Page entry (loads the `.min` files below) |
| `js/solo/solo-piano.js` / `.min.js` | Solo piano engine (~12k lines) |
| `css/solo/solo-piano.css` / `.min.css` | Solo piano styles |
| `js/shared/sf2-loader.js` | SoundFont (.sf2) parser/loader |
| `js/shared/auto-velocity.js` | Auto velocity |
| `js/shared/playtime-tracker.js` | Playtime tracking |
| `js/shared/updater.js` | Version update notice |
| `js/app/cognito-auth.js`, `js/app/appsync-client.js` | Login + cloud presets (AWS Cognito/AppSync) |
| `ai-instructions/contexts/solo.md`, `piano-engines.md` | Original design notes |

Both source and `.min` files are included; `solo.html` references the `.min` versions.

## Notes

- SoundFonts are loaded from a CloudFront URL (`SF2_BASE` in `solo-piano.js`), not from this repo.
- Cloud presets and login depend on the original Papiano AWS backend; the piano itself works without logging in.
- Paths are absolute (`/js/...`, `/css/...`), so serve from the repo root, e.g. `npx serve .` then open `/solo.html`.
