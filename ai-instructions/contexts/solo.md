# Solo Piano

## Scope
`js/solo/solo-piano.js` (~8400 lines), `css/solo/solo-piano.css`. Independent
piano engine — see `contexts/piano-engines.md` for the cross-engine pattern.

## Depends on / affects
`js/shared/sf2-loader.js` (soundfont loading), AppSync (`soloPresets`,
`savePresetSlot`/`deletePresetSlot`/`getProfile`).

## Warnings (revisable — see rules.md #1)
- **2026-09-08 — Child (Neobrutalism) theme deleted, Sketch/8-bit kept.**
  User-requested ("delete child theme, solo-visualizer"), landed
  identically in Visualizer the same session (see `contexts/
  visualizer.md`); Multiplayer and Learn Song had already dropped it
  earlier (2026-09-04 and 2026-07-26 — see `contexts/multiplayer.md`/
  `contexts/learn-song.md`), so as of this date no engine has a Child
  theme. Removed: the `THEMES` array's `'child'` entry and every
  `pianoTheme === 'child'`/`theme-child` branch (`setPianoTheme`'s theme-
  button map, defaults and body-class toggle; `setActiveKeyOverlay`'s
  flat-fill skip; the octave-line-width toggle; `applyGraphicModeDefaults`'
  particle-dust override; the chord-shadow `isFlatTheme` check; the whole
  "Child / Neobrutalism theme" branch of `drawFallingNote`); the
  contiguous `body.theme-child` CSS block in `solo-piano.css` (63 rules);
  the `#themeChild` button and its description text in `solo.html`
  (Theme grid now 3 columns, not 2x2); and the now-orphaned
  `images/child-theme-bg.webp` background asset. Two rules under that CSS
  block were NOT theme-scoped (the `#pianoWrap::before` smoke-hide
  selector list, shared with Sketch/8-bit, and the narrow-width black-key
  corner-radius fix, shared with Default) — only their `theme-child`
  selector was dropped, the rule itself stayed. A saved preset with
  `pianoTheme:'child'` falls back to `'default'` on load (same
  `THEMES.includes(theme) ? theme : 'default'` guard as any other
  unrecognized value) — no migration shim, same accepted tradeoff as the
  Strike Line rename below.
- **2026-09-05 — added a "Sheet" toggle panel** (`#sheetPanel`, opened via
  a new `#sheetBtn` in the top toolbar, same `.floating-panel`/`toggle()`
  mechanism every other panel here uses) — lets a player paste a
  plain-text QWERTY sheet (the Virtual Piano-style letter notation from
  `qwerty-sheet.html`/`contexts/qwerty-sheet.md`, e.g. `[tu]y-t-r-`) into
  a textarea and keep it open on screen to read while they play. User's
  own framing: "orang bisa tempel sheet qwerty agar bisa main sambil
  baca" (people can paste a QWERTY sheet so they can play while reading
  it) — this is NOT sheet music/notation rendering, just a persistent
  paste-and-read text box; no parsing, highlighting, or scroll-sync with
  playback.
  - **Deliberately fully opaque** (`background:#1c1f26`, an id-specific
    override beating every `.floating-panel{background:var(--ui-color)}`
    declaration in the file), unlike every other panel here which uses
    the shared translucent `--ui-color` (currently `rgba(31,34,40,0.72)`
    effective value — see the file's two competing `:root` blocks, the
    later one wins). Explicit user requirement ("ga boleh transparan
    panelnya") — this panel is meant to stay open through an entire play
    session with real text that needs to stay legible, unlike the
    quick-glance Audio/Visual/Settings panels.
  - **Anchored top-left** (`left:20px; transform:none`, another id
    override on the shared centered `left:50%;transform:translateX(-50%)`
    default) instead of the shared center placement — Solo Piano itself
    has nothing to collide with, but uses the same positioning as
    Multiplayer's copy of this panel (see `multiplayer.md`) for one
    consistent feel across both pages.
  - **Persists via `localStorage`** (`papianoQwertySheetText`) — the same
    key Multiplayer's own copy of this panel uses, so a sheet pasted on
    one page is still there on the other, and survives a reload.
    `Paste`/`Clear` buttons sit side by side below the textarea (in that
    order) — `Paste` calls `navigator.clipboard.readText()` (needs the
    click's own user-gesture, which it has) and falls back to a toast
    telling the user to Ctrl+V directly if the browser denies/lacks that
    API; `Clear` wipes both the textarea and the stored key.
  - **`sheetBtn` sits right after `holdBtn` (Sustain)** in the toolbar,
    not at the end next to FAQ where it first landed — user's own
    placement call.
  - **Textarea focus ring**: the browser's default is a thick blue glow,
    jarring against the piano stage behind it — user's explicit "outline
    biru jangan gede, jangan biru dah" (blue outline, don't make it big,
    don't make it blue at all). `.sheet-textarea:focus{outline:none;
    border-color:rgba(255,255,255,0.4);}` swaps it for a thin neutral
    border brighten instead.
  - **Duplicated, not shared**, same as every other piece of this panel
    system and the whole engine — see `contexts/piano-engines.md`'s
    per-engine duplication precedent. `multiplayer.html`/
    `multiplayer-piano.js`/`.css` carry a byte-for-byte copy of the same
    HTML/CSS/JS.
- Master audio chain is gain → limiter → soft-clip. A prior chain (glue
  compressor + tanh waveshaper) was itself boosting everything ~+6dB and
  causing reported "loud/dirty" output — don't reintroduce a compressor
  in this chain without checking the gain math first.
- Mobile caps cached soundfonts to 1 and downmixes/truncates samples to
  mono/15s — holding multiple decoded piano SF2s (~150-190MB each) pushes
  phones into paging/zram stalls that surface as audio crackle.
  `MAX_ACTIVE_VOICES` (96 desktop / 40 mobile) and the voice-steal fade
  timing (0.05s/0.40s) were both tuned against real crackle reports on a
  Snapdragon 860 — treat as empirically-derived, not arbitrary.
- Chord detection intentionally ignores the sustain pedal and reads only
  currently-held keys (+ a fixed 110ms release grace for rolled chords) —
  factoring in pedal state made chord names unpredictable during dense
  pedalling. Don't "fix" this to consider sustain without re-testing that
  tradeoff.
- Piano key separator lines are painted onto a dedicated canvas
  (`renderPianoSeparators`), not DOM borders — sub-pixel DOM boundaries
  render inconsistently across fractional-DPR phones and get mangled
  further by screenshot/video re-encoding.
- `LEGACY_STYLE`/`LEGACY_KEY_MAP`/`_migrateLegacyChordMode` are live
  migration shims for old localStorage/preset field values (old Style
  names, old 3-tier chord vocabulary reusing tokens with different
  meanings) — not dead code, don't delete without checking whether old
  saved presets still reference those values.
- **2026-07-15: `saber*` was renamed to `strikeLine*` everywhere** (JS
  identifiers, DOM ids, CSS classes/custom-properties, aria-labels,
  `data-visual-open`/`data-visual-subpage` values) to match
  `js/visualizer/visualizer.js`'s naming for the same "Strike Line"
  feature — see `contexts/css-architecture.md`. This was done with the
  user's explicit go-ahead **despite** these fields being serialized
  directly into saved cloud presets via object-literal shorthand (no
  migration shim was added) — existing users' saved Strike Line
  customization from before this rename will read back as defaults
  under the new field names. Accepted tradeoff, not an oversight; the
  user judged the preset feature wasn't mature enough yet for that to
  matter. If a preset migration is ever needed, old saves would have
  used the `saber*` key names.
- `performanceMode` and the `medium`/`high` graphic-quality tiers in
  `GRAPHIC_PROFILES`/`GRAPHIC_MODE_DEFAULTS` are unreachable legacy fields
  — only Potato and Default tiers are actually selectable today.
- **2026-07-15: "Note Style" renamed to "Material"** (UI label + the
  persisted preset field, now `material` instead of `animStyle`) — same
  no-migration-shim tradeoff as the saber→strikeLine rename above: old
  saved presets' style customization reads back as default. The internal
  JS variable name (`animStyle`) was deliberately left unchanged — only
  the user/product-facing surface (label text, persisted field name) was
  renamed, per rule 9 this is a complete rename of that specific surface,
  not a partial one.
- **2026-07-15: Falling Notes color system grew a 4th mode, Rainbow**
  (`animColorMode === 'rainbow'`), alongside Single/Double/Gradient. Each
  note's hue is `pitch-position-hue + (performance.now() * speed-curve) %
  360` — resolved once at note-creation time and never revisited, so
  existing on-screen notes are immune to a later Speed-slider change (by
  design: resyncing would collapse the whole-song rainbow spread to one
  instantaneous hue). `setRainbowSpeed()` deliberately does NOT call
  `syncFallingNoteVisualState()` for this reason — don't add that call
  without re-checking this tradeoff.
- **2026-07-15: "Follow Falling Notes" toggle added** to Piano Keys,
  Particles, and Strike Line — each independently can mirror the Falling
  Notes color scheme instead of its own color settings.
  Piano Keys gets it exactly for every mode (reuses
  `getAnimBaseColorForMidi`, since each key is already an independent DOM
  element with its own `_trackKeyColor` overlay). Particles and Strike
  Line get it exactly for Single/Double, but Gradient/Rainbow are
  **approximated**: Particles fall back to one representative hue
  (`gradientColorForMidi(64)`/`rainbowColorForMidi(64)`, keyboard-centre)
  because the dust renderer batches by a fixed 2-color "side" and giving
  every note its own gradient/rainbow hue would need a shader/vertex-format
  rewrite (not attempted); Strike Line instead renders a real 12-stop CSS
  gradient sweep of the palette (cheap, since it's just one flat bar), but
  that sweep is a **static snapshot** taken whenever `updateStrikeLineLine()`
  last ran (settings changes only, not every frame) — so in Rainbow mode
  it won't visibly animate over time the way the falling notes' hues do.
- **2026-07-15: Strike Line grew a Split Color mode** (previously
  single-color only), same left/right-by-tuts pattern as Falling
  Notes/Particles — own `strikeLineColorSplit`/`strikeLineLeftColor`/
  `strikeLineRightColor`/`strikeLineSplitTuts`. Rendered as a hard 2-stop
  CSS gradient on the flat bar; the ambient halo/box-shadow (can't vary
  spatially across one box-shadow) stays keyed to the Left color as a
  representative hue — same tradeoff already accepted for Follow's
  Gradient/Rainbow sweep above.
- **2026-07-15: fixed two real bugs, same root cause pattern, present
  in all 4 stage engines (solo/multiplayer/visualizer/learn-song):**
  (1) Strike Reaction's flare color never checked for Gradient mode
  (`_refreshReactionColor`/`_packContactFlares` only branched on
  Split/`animColorSplit`), so every struck note's flare rendered in one
  flat fallback color while the actual falling note swept through the
  gradient. Fixed by adding a gradient (and now rainbow) branch that
  resolves per-midi instead of per-side, which required refactoring the
  GL particle renderer's side-batched draw loop into a per-emitter loop
  for gradient/rainbow mode specifically (see `_packOneContactFlare`).
  (2) Particle Split Color's Left picker was cosmetically wired (updated
  its own swatch + state var) but never actually consumed at render time —
  `_refreshDustColor(0, ...)` was hardcoded to the single/base
  `dustColor` regardless of `dustColorSplit`, so changing "Left Color"
  had no visible effect. One-line fix (`dustColorSplit ? dustDoubleLeftColor
  : dustColor`), same fix needed independently in all 4 files (no shared
  particle-rendering code between engines, see `contexts/piano-engines.md`).
- **2026-07-15: Glow/Neon now defaults to off** (`noteGlowEnabled`), was
  previously on-by-default — matches Key Light's existing off-by-default.
- **2026-07-16: fixed "Follow Falling Notes has to be toggled off/on to
  notice a change" bug, present in all 4 stage engines.** Root cause:
  `syncFallingNoteVisualState()` is the common hook fired by mode-switch/
  double-color/gradient-param setters, but nothing inside it ever called
  `updateStrikeLineLine()` — so Strike Line's cached bar + ambient
  aura/box-shadow (both computed once per call, not per frame) went stale
  the moment Follow Falling Notes was on and some *other* Falling Notes
  setting changed, until an unrelated Strike Line control forced a
  redraw. This is also the exact bug behind the separately-reported "Strike
  Line aura doesn't update when Follow + Split Color are both on" — same
  stale-cache, same fix. Fixed with one new helper,
  `refreshFollowingElements()`, called at the end of
  `syncFallingNoteVisualState()` and also explicitly from
  `setRainbowSpeed()` (which deliberately skips
  `syncFallingNoteVisualState()` itself, see the Rainbow entry above — but
  Strike Line's *sweep* redraw for a new Speed isn't "resyncing existing
  notes," so it still needs the refresh call).
- **2026-07-16: fixed Strike Reaction's Rainbow flare "predicting a color
  one step ahead."** Rainbow's hue is `pitch-hue + time-hue`, frozen once
  per falling note at creation — but Strike Reaction was calling
  `rainbowColorForMidi(midi)` fresh on *every animation frame* for as long
  as a note's flare was alive, so a held note's flare hue kept drifting
  away from that same note's own (frozen) color the longer it was held.
  Fixed by capturing `rainbowColor` once in `startNeonDust()` at emitter-
  creation time (matching the falling note's own freeze point) and
  threading it through to `_refreshReactionColor(side, midi,
  frozenRainbowColor)` at all call sites (GL per-emitter draw pass, 2D
  fallback draw pass), instead of recomputing per frame.
- **2026-07-16: top-bar visual subpages reordered for consistency** —
  Falling Notes, Particles, and Strike Line subpages (all 4 engines) now
  follow the same Toggle → Choices(buttons) → Slider → Color grouping
  already established for Piano Keys in the 2026-07-15 reorg (see
  `contexts/css-architecture.md`). Concretely: every standalone toggle
  (master on/off, Glow/Neon, Strike Reaction, Follow Falling Notes, Split
  Color, Auto Split MIDI on visualizer/learn-song) now sits together
  before the Color Mode/Material/Particle Mode button groups, which sit
  before all sliders, which sit before the color pickers. Glow/Neon's
  Intensity slider (previously nested inside the same row as its toggle)
  was split into its own row (`rowNoteGlowIntensity`) and moved down into
  the slider group — same pattern Piano Keys' Key Light/Intensity split
  already used, so no new pattern was invented. Purely a DOM reorder +
  one row split, no id renames — nothing in the JS depends on row nesting
  or order (all lookups are `getElementById`), confirmed no id or
  visibility-toggle logic broke.

- **2026-07-17: Child theme (Neobrutalism) palette changed from cream/
  yellow to white + soft pastel blue** — was too yellow-heavy per user
  feedback. `--neo-key-bg`/stage/panel/toast backgrounds: `#fffbe6` →
  `#ffffff`. `--neo-key-active` (pressed-key/active-button default accent)
  and the JS `setPianoTheme('child')` fallback (`setWhiteKeyColor(...)`):
  `#ffeb3b` → `#8ecbff`. Strike Line's child-theme box-shadow glow:
  `rgba(255,235,59,0.7)` → `rgba(142,203,255,0.7)` (same alpha, new hue).
  `--neo-black-bg`/`--neo-black-active` (dark grays) and `--anim-color`
  (`#0099ff`, already blue) were untouched. Same palette swap landed
  identically in visualizer and learn-song-stage's child theme (see
  `contexts/piano-engines.md`), and multiplayer/learn.html's newly-added
  child themes (`contexts/multiplayer.md`) were built with this palette
  from the start rather than inheriting the old yellow one.

- **2026-07-17: Preset completeness audit (`getCurrentSettings()`/
  `applySettings()`), all 4 engines.** User reported Key Light not
  saving — could NOT reproduce it: static read of both functions plus a
  live save→reset→load round-trip (via multiplayer's local preset system,
  fully testable without auth) showed `keyGlowEnabled`/`keyGlowIntensity`
  round-tripping correctly through the real UI toggle/slider event
  handlers. Left as-is; flagging here in case it resurfaces with an exact
  repro (which engine, exact steps) — nothing in the current code explains
  the reported symptom. Did find and fix a real gap: **Auto Velocity**
  (`autoVelocityEnabled`) was self-persisting to its own localStorage key
  (`papianoAutoVel`) only, completely outside `getCurrentSettings()`/
  `applySettings()` in all 4 engines — so it survived a page refresh but
  never followed Save Preset → Load Preset (a different device/browser on
  solo's cloud presets, or a different local slot on multiplayer's). Added
  the field to both functions plus `setAutoVelocity(false)` to each
  `applyFactoryDefaults()`, matching the pattern already used for Chord
  Detector tier. Also confirmed: Background Image data/URL was never part
  of any engine's preset payload (only `bgFitMode`/`bgPositionMode`/
  `bgOpacity`/`bgDim`/`bgBlur` are) — already correct per the user's
  explicit "don't save the image itself" decision, no fix needed.

## Last updated
2026-09-08 — Child (Neobrutalism) theme deleted, Sketch/8-bit kept; see the
Warnings entry above for the full list of what was removed.

2026-07-17 — Preset completeness audit: Auto Velocity was missing from
Save/Load Preset in all 4 engines (fixed); Key Light investigated but not
reproduced (round-trips correctly as-is); Background Image confirmed
correctly excluded already. Child theme palette redesigned (cream/yellow
→ white + soft pastel blue), landed identically in solo/visualizer/
learn-song-stage; see `contexts/multiplayer.md` for the same-session work
porting Child theme to multiplayer (previously missing) and adding it
fresh to learn.html/Learn Music Theory.

Previous entry (2026-07-16): Follow Falling Notes auto-refresh bug fixed
(also fixes the Strike Line aura not updating), Strike Reaction Rainbow
flare drift fixed, top-bar visual subpages reordered to the
Toggle→Choices→Slider→Color pattern. All landed identically across solo/
multiplayer/visualizer/learn-song (see entries above). Earlier entry
(2026-07-15): Rainbow color mode, Follow Falling Notes toggle, Strike Line
Split Color, Strike Reaction gradient-mode bug fix, Particle Split Color
left-picker bug fix, Note Style→Material rename, Glow/Neon default
flipped to off. See `contexts/multiplayer.md` for the multiplayer-only
fixes from that session (chord detector, AFK ghost, chat panel layout).
