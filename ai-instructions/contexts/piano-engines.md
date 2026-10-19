# Piano engines (solo / multiplayer / visualizer / learn)

## Scope
`solo.html`, `multiplayer.html`, `visualizer.html`, and `learn.html` each
carry their own independent copy of the piano engine:
`js/solo/solo-piano.js`, `js/multiplayer/multiplayer-piano.js`
(rooms + chat), `js/visualizer/visualizer.js` (playback-only — MIDI/
MusicXML falling notes, no rooms/chat/backend), and
`js/learn/learn-piano.js` (Learn Music Theory — scale/chord playback on a fixed
2-octave keyboard, no rooms/chat/backend; data lives in
`js/shared/music-theory.js`, loaded only by `learn.html`). Solo,
multiplayer, and visualizer all talk to the same AppSync API for chat/
rooms/presence, but share no JS file. Each engine file self-boots its
single mode.

`js/aichat/aichat.js` (+ `css/aichat/aichat.css`) is a different pattern —
it does **not** self-boot. It exposes
`window.openPapianoAiChatOverlay()` / `window.closePapianoAiChatOverlay()`
so `dashboard.html` (`js/app/app.js` → `enterAiChatMode`) can slide it in as an
overlay when the user taps the AI tab, instead of it being its own route.

## Depends on / affects
`js/solo/`, `js/multiplayer/`, `js/visualizer/`, `js/learn/`,
`js/shared/music-theory.js`, `js/aichat/`, `js/app/app.js`.

Learn Song's practice layer (the wait-for-input state machine, scoring, the
hit window, the guide/pressed/repress key states) is documented separately
in `contexts/learn-song.md` — this file covers only what it shares with the
other engines.

## Warnings (revisable — see rules.md #1)
- **2026-09-08 — the black-key edge "re-forming" after a key-count change was
  a one-frame geometry mismatch, not a transition or a hidden-class problem.
  Fixed in all four engines by laying out synchronously.** Owner report: the
  chamfer blinks out and comes back on every key-count change, worst under
  Auto Camera.
  - **What was actually happening**: `applyVisibleKeyCount` called
    `reflowPianoForKeyCount()`, which reaches `applyPianoHeight` and resizes
    the board **in that same synchronous block** — then handed the layout
    pass to the *debounced* `updateKeyLayout()`, which is
    `requestAnimationFrame`-deferred. `--bk-face` / `--bk-cut` are derived
    from the white-key width and that height and are only recomputed by the
    layout pass, so exactly one frame got painted with the chamfer sized for
    the key count just left, against a height that had already changed. Auto
    Camera made it look constant by retargeting the count repeatedly.
  - **Fix**: call `_updateKeyLayoutNow()` instead. Both halves then land in
    one frame and there is no intermediate state to see. Note this removes
    the mismatch rather than hiding it — the earlier attempts at this bug
    (see `applyBlackKeyEdgeDepth`'s `deferVisual` comment, and
    `applyVisibleKeyCount`'s own `bk-face-lite` clearing) were both about
    suppressing the *symptom* during the bad frame, which is why it kept
    coming back in a new form.
  - **Three of the four engines had no `_updateKeyLayoutNow`** — only
    `visualizer.js` had been split that way (for Auto Camera's own tween,
    which needs to drive layout from inside an existing rAF loop). The same
    split is now in `solo-piano.js`, `multiplayer-piano.js` and
    `learn-song-engine.js`, with the body extracted verbatim so the deferred
    path behaves exactly as before.
  - **This is the fork tax, again**: earlier rounds of this same flicker were
    fixed in some engines and not others, which is how it survived. The new
    `test/pianoKeyCountLayout.test.js` reads all four and fails if any one of
    them routes a key-count change through the deferred pass — verified to
    fail by reverting a single engine, not just assumed to work.
  - **Deliberately NOT changed**: the 220ms `layout-changing` tail after a
    key-count change and after an Auto Camera zoom. It drops the black keys'
    gradient/inset shadows/`::before` (not the chamfer, which only
    `bk-face-lite` hides), so a rapid sequence of Auto Camera zooms still
    flattens and restores those repeatedly. That is a separate, perf-motivated
    decision with measurements behind it — worth revisiting if the flatness
    itself is what reads as flicker, but it is not what this fix addressed.
- **2026-09-05 — the Piano Height drag was re-rastering the whole key tree
  every frame, all 4 engines.** The user measured ~9 fps dragging the
  height slider and reported that halving Layout and style-recalc time
  (the previous entry) changed nothing on device. That was the clue: the
  cost was never Layout.
  - **What the trace showed.** Over a 40-step drag, `#piano` and
    `#activeKeyLayer` each recorded **41 Paint records with an UNBOUNDED
    clip** (`-12000..12412 x 12114` — Blink's "no bounds" marker), against
    ~0.2 Mpx for every other node. Both are composited layers (JS writes
    `transform: translate3d(...)` on them), and **resizing a composited
    layer cannot be invalidated incrementally** — the whole layer is
    re-rastered, all 124 gradient/bevel key elements, once per frame.
  - **The fix: scale, don't resize.** Mid-drag the wrap's box is left alone
    and the difference is carried by `transform: scaleY()` on `#pianoWrap`
    (`transform-origin: 50% 100%`, matching its bottom anchor), which the
    compositor handles with no repaint. `#piano`/`#activeKeyLayer` paints
    dropped **41 → 17**.
  - **`PIANO_DRAG_SCALE_LIMIT` (1.15) bounds the distortion.** Scaling is
    only exact for things that scale with height; the black-key bevel is
    width-derived and labels are not scaled copies, so past ±15% the real
    height is committed and becomes the new base. Loosening it is not worth
    it — measured 1.15 → 17 paints, 1.25 → 15, 1.40 → 13, i.e. 40% more
    stretch buys 4 fewer re-rasters.
  - **`.stage` must still follow the LOGICAL height every tick**, even on
    frames where the wrap's box is deliberately untouched — otherwise the
    keybed line and the falling-note canvas detach from the piano's visible
    top edge mid-drag. That is what `commitWrapHeight` separates: the
    logical height always goes out, only the box write is deferred.
  - **`final` always commits**, even when the value did not change on that
    call. The last `input` of a drag has usually already set it, so gating
    the commit on a value change would end the gesture on a scaled layer —
    keys frozen slightly stretched. Verified: after drags of 25→65, 80→20,
    40→41, 10→95 and 50→50, the computed geometry is an **exact match** for
    setting the same value directly, and the transform is back to identity.
- **2026-09-05 — key labels were unreadable on the pressed-key colour.**
  Not a stacking problem — the label is already a child of the key and
  paints over its background. The label colour was simply fixed while the
  accent is user-pickable: at the shipped defaults the white key's label was
  `rgba(82,86,92,.82)` on `#0088e0`, and the black key's near-white on
  `#29a3ff`.
  - `keyInkFor()` derives the ink from the accent's own sRGB luminance and
    picks whichever of near-black / near-white **actually wins the contrast
    ratio**, rather than using a lightness threshold — a threshold gets
    mid-tone saturated colours wrong (`#0088e0` is 3.7:1 against white ink
    but 5.2:1 against dark). Published as `--accent-white-ink` /
    `--accent-black-ink` at every site that writes the accent, including the
    per-key override in `_applyKeyColor` (seat/remote colours).
  - Computed once per colour change, never per frame, and it changes no
    stacking — which is what keeps it from repeating the earlier attempt
    that "malah bug lag dan aneh".
  - Measured across `#0088e0 / #ffd60a / #ff2d55 / #111827 / #ffffff /
    #00e5ff`: every accent now lands at **5.16:1 or better** (WCAG AA).
  - **No gaps**: scanning every point inside a pressed key (1836 on the
    exposed part of a white key, 2184 on a black key) resolves to that key
    or its label — the accent covers the whole silhouette.
- **2026-09-05 — the Strike Line was bound to the piano's geometry through
  `.stage`, all 4 engines.** User report: dragging Piano Height dropped to
  ~10 fps, key-count changes cost 25-50 fps, pressing a note lagged — and
  turning every visual OFF changed nothing, while Child/Sketch themes ran
  ~2x better. That last part is the tell: **Child/Sketch/8-bit do not fix
  anything, they force the Strike Line off** (see `setPianoTheme`).
  - **The binding.** `applyPianoGeom` wrote `--piano-height`/`--piano-lift`
    onto four elements, one of which was `.stage` — the ancestor of
    `#strikeLine`, `#strikeLineAuraSegments`, `#strikeReactionLayer`,
    `#chordDisplay` and the canvases. Custom properties are INHERITED and
    Blink has no per-property dependency tracking, so every slider tick
    marked that whole subtree's computed styles dirty. This is the exact
    trap the `#pianoWrap` comment in that function already documents, one
    level down — it was fixed for the keys and never noticed for the stage,
    because `.stage` holds no key elements. It holds something worse: a
    full-width bar with six box-shadows out to 92px plus a filter and two
    animated blurred layers.
  - **Traced over a 40-step height drag, strike line on vs off**: paint was
    identical (380 vs 378 records, same area) but Layout was 40 vs 21 ms and
    style recalc 72 vs 30 ms. Writing the RESOLVED `bottom` onto `.stage`
    instead — `bottom` is not inherited — took it to 27 ms / 32 ms, closing
    most of the gap to the Sketch theme's 19 ms / 24 ms.
  - **Do not put `.stage` back in `varConsumers`.** The other three consumers
    (`#swipeStrip`, `#toastWrap`, `#bootSfChip`) are leaves, so the variable
    is fine for them and keeps their calc() formulas in the stylesheet.
    `.stage` is the only one whose subtree costs anything, and it is the only
    one whose formula is duplicated into JS.
  - **`strikeLine-hit` was a dead class in Solo and Multiplayer** — the CSS
    rule is `#strikeLine.strike-line-hit`, so the flash never rendered in
    half the app, while the toggle still ran on every press AND release.
  - **The flash is now `#strikeLineHit`, a sibling layer that fades in with
    `opacity`.** Isolated with a trace, 80 class toggles on `#strikeLine`:
    | what was toggled | recalc |
    |---|---|
    | nothing (floor) | 9.1 ms |
    | a class matching NO rule | 7.2 ms |
    | `.strike-line-hit` (changes `filter`) | 17.7 ms |
    The class toggle itself is free; **the `filter` value change was the
    entire cost**, because it re-runs on the element carrying six
    box-shadows out to 92px. The replacement is outside `#strikeLine` (so it
    is not inside that element's filter) and animates only `opacity`, the
    one property the compositor handles without repainting. Measured in the
    real press path: 33 ms with the old filter flash, 21 ms now — the same
    as when the flash did nothing at all, except it now actually renders,
    in all four engines.
  - **`will-change:filter` + `translateZ(0)` promotion was tried and
    rejected** — no measured benefit, because the cost was style recalc
    rather than raster, and it permanently allocates a compositor layer.
  - **A suspect that was chased and CLEARED — do not re-chase it.**
    `#strikeLineAuraSegments::before`/`::after` animate `background-position`
    (`strikeLineWaveFlow`/`FlowB`) on layers that also carry `filter:blur()`,
    `background-blend-mode` and a `mask-image` — which would repaint that
    whole band ~31 times a second. But `#strikeLineAuraSegments` is
    `display:none` unless `body.strikeLine-multiColor`, and that class is set
    only when the STRIKE LINE ITSELF is drawing a split/gradient/rainbow
    colour (`auraStops` in updateStrikeLine) — not merely when the
    falling-note Colour Mode is Gradient. Verified at runtime with
    `document.getAnimations()`: in both Single and Gradient colour mode the
    only animations running on the stage are `strikeLineWaveA/B/C`, and all
    three animate `transform`, which is compositor-cheap. So the expensive
    keyframes effectively never run, and restructuring them (the moving
    radials would have to be split off the static
    `--strike-line-multi-tint-a` layer before `transform` could replace
    `background-position`) would be delicate work for no measurable gain.
  - The loading spinner's `spin`/`corePulse` keyframes still show up in
    `document.getAnimations()` after boot, but `#sfLoadingOverlay` is
    `display:none`, so that subtree composites nothing. Not a cost — checked,
    so nobody has to check it twice.
  - **Verified behaviour-neutral**: `.stage`, `#swipeStrip`, `#toastWrap`,
    `#bootSfChip`, `.perf-hud`, `#pianoWrap` and `#strikeLine` all compute
    identical `bottom`/`height`/rects before and after, across three heights,
    three lifts and two key counts, in both orientations.
  - **Headless FPS numbers are not evidence here** — the user's device
    reports are. What headless CAN measure honestly is structural work:
    Layout/Recalc/Paint counts and durations from a devtools trace. Use
    those, and quote the user's device numbers for the fps claim.
- **2026-09-05 — Piano Height and Black Key Edge Depth now follow the key
  count, all 4 engines.** Showing fewer keys across the same viewport makes
  every key wider, and nothing used to follow that: cutting 52 white keys to
  7 made each key 7.4x wider while the piano stayed exactly as tall, so the
  keys became squat stubs. The user's report was "jumlah key aku kurangin ga
  ada efek apa-apa" — the count changed, the proportion did not.
  - **The law.** `gain = 52 / visibleWhiteKeys` is how much wider each key
    got. Height takes a PARTIAL share of it, `gain^GAMMA` — matching the
    aspect ratio exactly (GAMMA=1) would put a 20-key board at 104% of the
    screen. GAMMA is fitted to the proportion the user asked for, 88 keys at
    40% reading the same as 33 keys at 60%: `ln(60/40)/ln(52/20) = 0.4243`.
    The bevel gets the mirror, `gain^(GAMMA-1)`: `--bk-face` is measured in
    key WIDTHS so it already takes the full gain, and giving back what the
    height did not take is what holds its depth-to-key-height ratio constant.
    Measured, that ratio stays 0.029 from 52 white keys down to 7.
  - **It is a curve, not a table** — continuous at every count from 3 to 52,
    not just the 20/33/52 presets: 44 → 43%, 36 → 47%, 28 → 52%, 16 → 66%,
    13 → 72%, 11 → 77%, 10 → 81%.
  - **The SETTINGS move, not just the pixels.** A slider reading 40% while
    the piano is really at 60% is a lie ("bisa sesat"), so a key-count change
    rewrites both visible settings and both height sliders. Each setting
    therefore carries a REFERENCE value — what it would read on the full
    52-key board — and the setting is always recomputed FROM the reference,
    never from its own previous value. That is the difference between
    BASE + SETTINGS and PREVIOUS + PATCH: churning 7→33→11→52→20→44→5→36→
    13→52 lands back on exactly 183px / 40% / edge 40 / face 3.17px.
  - **Clamp the reflow's percent to 0..100 BEFORE handing it to
    applyPianoHeight.** The scale legitimately pushes a tall piano past 100
    on a short board (70% at 52 white keys wants 105% at 20), and
    `normalizePianoHeightPercent` treats anything above 100 as a legacy
    PIXEL value and divides it by the viewport — which silently turned that
    105 into 23%, i.e. the piano got SHORTER when it should have hit the
    ceiling. Caught by a smoke test, not by reasoning; the two features were
    written weeks apart and neither comment mentioned the other.
    Round-trips stay exact through a clamp because the REFERENCE value is
    what is stored, not the clamped display value.
  - **`reflowPianoForKeyCount()` is the only place the law is applied.**
    Everything downstream — `pianoHeightPxFor`, `updateBlackKeyEdgeVars` —
    reads the settings literally. Do not push a key-count factor back down
    into them; that is how the old `pianoHeightBoostRatio` mess started.
  - **`applyPianoHeight` vs `setPianoHeightPercent`**: the second records the
    reference and is what a user drag, a preset, factory defaults and boot
    all call. The first does not, so a relayout that merely re-asserts the
    current value — and `reflowPianoForKeyCount` itself — can drive it
    without disturbing the reference. Same split for
    `applyBlackKeyEdgeDepth` vs `setBlackKeyEdgeDepthPercent`.
  - Both scales are 1.0 at 52 white keys, so **the default piano is
    untouched** — verified identical across landscape/portrait/tablet/small.
- **2026-09-05 — Piano Height mapping rebuilt, all 4 engines. The slider
  value was not the state; (value, history) was.** Two percent→px mappings
  coexisted — plain linear, and a sqrt ease below 40% — and a
  `pianoHeightIsManual` flag recording whether the slider had ever been
  touched decided which one ran. Measured on the real page, same slider
  reading, same viewport:
  | slider says | untouched | after touching |
  |---|---|---|
  | 5% | 18px | 49px |
  | 10% | 35px | 70px |
  | 20% | 70px | 99px |
  | 30% | 105px | 121px |
  | 40%+ | identical | identical |
  - **The user-visible failure**: in portrait, Save Preset → Load Preset
    DOUBLED the piano (43px → 86px) with the slider still reading 10% and
    nothing touched, because `applySettings` set the manual flag. A
    rotation cleared it and halved it back, so one value rendered at two
    heights depending on what had happened before.
  - **A second correction existed only to undo the first**:
    `pianoHeightBoostRatio` measured how much taller the curve had made the
    piano and multiplied Black Key Edge Depth by it, so the bevel would not
    read shallow against a key the curve had inflated — a derived value fed
    back into another derived value.
  - **Now**: one pure function, `pianoHeightPxFor(pct)` =
    `round(getPianoMaxHeightPx() * pct/100)`. No flag, no second mapping, no
    boost ratio, no `applyPianoHeightManual`. 60 lines deleted per engine.
  - **Fresh installs are pixel-identical** — verified across landscape /
    portrait / tablet / small viewports (piano height, `--kw`, `--bk-face`,
    `--bk-cut`, and the wrap/white/black key rects all byte-equal against
    the previous build). The linear mapping *was* what an untouched default
    already produced; only touched and restored values changed, and they
    changed to what their label says.
  - **Do not reintroduce a curve here.** If the bottom of the slider should
    give a taller piano, that belongs in `getDefaultPianoHeightPercent()`
    or in the slider's own range — not in a second mapping selected by a
    flag. The one remaining pixel input is `normalizePianoHeightPercent`'s
    `>100` branch, which is a one-way migration for presets saved when this
    was stored as raw px; nothing writes pixels any more.
  - **This was not a performance problem** and the rebuild was not a
    performance fix. Dragging any geometry slider with ~200 notes falling
    paced 16.6–18.5 ms median before and after; a Piano Height drag is
    22–24 ms median on both builds. The Strike Line is pure CSS (custom
    properties plus a keyframe animation), is not part of the layout
    dependency chain, and reads no geometry — it was audited and left
    alone.
- **2026-09-05 — Impact Pulse drew every note TWICE (Visualizer only).**
  A tile is a static bake of the SETTLED note, so a note passing through
  its own contact moment had two copies in the frame. The overlay drew
  the pulsed one straight over the blit, on the stated theory that "the
  pulsed shape is strictly larger, so it fully covers the settled one
  with nothing to erase first". That only holds for a style that is
  opaque, filled AND glowless. Ghost pixels left behind at the contact
  frame, counted against drawing the pulsed note alone:
  | style | no glow | + Glow |
  |---|---|---|
  | Default | 0 | 6342 |
  | Midnight | 0 | 0 (glowless by design) |
  | Chrome | 0 | 6293 |
  | Outline | 2257 | 2257 |
  | Glass | 6911 | 14888 |
  Outline is a hollow stroke, so the settled outline sat inside the
  pulsed one — the literal "double falling notes" in the report. Glass is
  translucent and Glow is a soft translucent halo, so both let the baked
  copy show through. It also redrew every note whose ONSET fell in the
  410 ms window, including ones whose pulse had already eased to zero:
  those were repainted at exactly their settled size, double-exposing
  their own antialiased edges for nothing.
  - **Fix**: erase before redrawing. Clear each mid-pulse note's padded
    box out of the blitted frame, repaint the non-pulsing neighbours the
    box bit into (clipped to it), then draw the pulsing notes last,
    unclipped. Repainting the neighbours is not optional — clearing alone
    trades a doubled note for a bitten-off one.
  - **Order matters**: it runs BEFORE the long-note loop. Long notes
    never enter a tile, already receive `elapsed`, and so already pulse
    with nothing to ghost against; drawing them after the clear keeps
    them out of it.
  - **`SEE_THROUGH_STYLES` exists so the common case stays free.** With
    Glow off and full opacity, Default/Midnight/Chrome cover themselves
    exactly (the 0s above), so they keep the cheap draw-on-top path — no
    clear, no clip, no neighbour repaint. Only Outline, Glass, any glow,
    any opacity below 100, and the Child theme's offset drop shadow need
    the erase.
  - **Two things that cost real frames here**, both measured on the live
    loop with Glow at max on a dense song: sizing the hole to the PULSED
    extent rather than the settled one (the tile only ever baked the
    settled note, and hole width decides how many neighbours get
    repainted), and testing the widest-possible box on BOTH the hole and
    the candidate, which doubled the reach and pulled in neighbours that
    never lost a pixel. Fixing both took the overlay from 38 repaints a
    frame / +8.5 ms down to +3.3 ms. The neighbour scan is also bounded
    by `_vizMaxTileDurMs` (the longest note that actually made it into a
    tile) instead of the structural one-tile bound, which on ordinary
    material is ~7x fewer notes to walk.
- **2026-09-05 — Midnight and Glass ignored Gradient Colour Mode's
  transition, all 4 engines.** They took only the flat base colour, so
  switching to Gradient changed which colour each note was but never
  blended ACROSS a note the way the Default material does through
  `getGradientSprite`. A material is not a fill — Glass alone is a veil,
  two edge glows, a streak and two rim strokes, all derived from the base
  colour — so it cannot simply take a CanvasGradient as its `fillStyle`.
  - **Fix**: `getEffectSprite` now takes the accent pair and bakes the
    whole material TWICE, once per endpoint, cross-fading the two bakes
    through an alpha mask along the accent axis. Material-agnostic, and
    correct for a translucent one: masking each bake separately and then
    compositing avoids the doubled-up veil that painting B straight over
    A would give.
  - **A pair whose endpoints are equal is dropped** (`acc` stays null),
    so every non-Gradient bake takes the original code path with the
    original arguments and is pixel-for-pixel unchanged. Verified: 24
    combinations (4 styles x 3 non-Gradient colour modes x glow on/off)
    hash-identical against the previous build.
  - The Vertical axis is where this reads. A Horizontal accent samples
    only ±0.5 semitone, which is ~1% of a 2-colour palette spread over 88
    keys — it exists to stop banding between neighbours, not to make a
    bold ramp, so do not expect to see it in a screenshot.
  - **Midnight keeps its live path for a Vertical accent**: Midnight IS a
    vertical ramp, so each of its four stops just takes its colour from
    wherever the pair has reached at that stop's own height. Exact, and
    it keeps Midnight off the sprite baker's height-bucket treadmill.
    A Horizontal accent cannot fold into one vertical gradient and drops
    through to the cross-faded sprite.
  - **The stages flip the sprite** (`drawFallingSpriteFlipped`), so a
    Vertical accent has to be baked upside down there or the mirror lands
    the pair's top colour at the bottom of the note.
- **2026-09-05 — Chrome's animation was frozen in Visualizer and Learn
  Song.** Chrome's material SCROLLS (a tiling pattern whose matrix moves
  every frame), but a tile is baked once and then only blitted, so a
  tiled Chrome roll froze at whatever phase the bake caught. Measured
  over 400 ms at a fixed playback position: the tiled path changed 3688
  px, the same frame drawn directly changed 23288. Fixed by adding
  `styleNeedsLiveFrame` to the direct-path bypass alongside Sketch/8-bit
  and the vertical Gradient axis. Baking the phase into the tile
  signature instead would re-bake every tile every frame, which is far
  worse. **Cost, stated plainly**: Chrome gives up the tile cache in the
  stages — measured +12 ms with Glow on, +3 ms without, on a dense song.
  That is the price of the animation existing at all.
- **2026-09-05 — Glow is the single biggest cost in the renderer, and it
  is blit area, not cache thrash.** Solo, ~200 notes, median frame:
  | style | Glow off | Glow on (default 200) |
  |---|---|---|
  | Default | 18.8 | 40.3 |
  | Outline | 16.6 | 16.7 (glowless) |
  | Midnight | 16.7 | 16.7 (glowless) |
  | Glass | 16.6 | 42.5 |
  | Chrome | 16.7 | 51.9 |
  Every style holds a flat 60 fps with Glow off. With Glow on the cost
  tracks the halo pad directly — 16.9 / 19.0 / 27.3 / 45.6 ms at
  intensity 25 / 50 / 100 / 200. **Do not go looking for a cache bug
  here**: instrumented, the sprite cache runs 0.4 bakes against 120 hits
  per frame and the halo-mask cache 0.42 bakes, so nothing is thrashing.
  The pad simply is 28 px at the default intensity, which makes a 50 px
  note's padded box more than twice the note.
- **2026-09-05 — new falling-note Style "Chrome", all 4 engines.** A
  liquid-metal sheen: domain-warped ridged value noise, prototyped in a
  design artifact first and then ported. The look comes from warping the
  noise field by its own output twice (round blobs become stretched,
  folded ribbons) and taking the ridge `1 - |2v-1|` as the bright vein
  down each fold — a colour ramp WITHOUT that ridge term stays matte
  however many stops it gets, which is the whole difference between
  "gradient" and "chrome".
  - **With Glow off it is the cheapest Style in the app.** Frame pacing
    on the real loop with ~200 notes on screen holds a flat **16.7 ms
    median / 16.9 p95**, i.e. a clean 60 fps with zero frames over 20 ms.
  - **Do NOT trust micro-benchmarks of `drawFallingNote` here.** An
    earlier version of this entry quoted per-call numbers from a tight
    loop (Chrome 0.20 ms, Glass 4.73 ms, and a "0.69 ms" glow that in
    the real loop paced at 1442 ms). Those numbers contradicted every
    frame-pacing run and each other — headless Chromium rasterizes in
    software, so canvas micro-benchmarks come out order-dependent and
    meaningless. **Only rAF frame pacing on the live animation loop is
    trusted in this file.**
  - **Harness trap that invalidated a whole round of measurement**:
    calling `addAnim(midi)` from a script produces notes stuck at their
    14 px minimum forever, because `anim()` clears `f.growing` on the
    next frame for any note whose midi is not in `pressStartTimes`. A
    load built that way exercises only the shortest-note branch and
    every glow path measures "free". Seed `pressStartTimes` before
    `addAnim` and delete it after ~200-900 ms to get a realistic height
    mix (median ~52 px, max ~130).
  - **Why it is that cheap**: nothing is baked per note or per frame.
    The noise field is evaluated ONCE for the whole app into two
    `Float32Array`s (rx + ridge) and never again. Colouring that field
    into a sheet is a flat loop over those arrays with no noise math,
    done once per COLOUR BUCKET (`_colorBucket`, the sprite cache's own
    12-bit bucket) and cached, capped at `CHROME_SHEET_BUDGET`. The
    sheet is seamlessly tileable, so it becomes ONE `CanvasPattern` that
    animates purely by moving the pattern matrix —
    `setTransform` once per frame, shared by every note on screen. Per
    note per frame the entire cost is one `roundRect` + one `fill`.
  - **Deliberately a live path, not `getEffectSprite`** — it takes the
    same route Midnight does, for the same reason Midnight's own comment
    gives: a scrolling material cannot be baked once and stretched
    forever, and re-baking one per frame is precisely the bake treadmill
    that comment exists to avoid.
  - **Seamless tiling forces integer lattice periods**, which puts a
    floor on how coarse the baked field can be. The first attempt scaled
    the warp against the period instead of using absolute lattice units
    and came out as busy granite (~9.6 units of displacement into a
    field whose features are ~1 unit wide shreds every fold). Fixed by
    an absolute `CHROME_WARP` of ~2 feature-widths plus magnifying the
    tile at paint time (`CHROME_TEX_SCALE`) — same trick the design
    artifact used by showing a 96px sheet at ~500px.
  - **Glow IS supported** (it is not in `GLOWLESS_STYLES`; only Outline
    and Midnight are). It shipped glowless first and the user's reply was
    "masa glow ga support?", so it was added. Chrome is the only
    glow-taking style with no cached body sprite to bake an aura into, so
    the aura is its own layer, and picking that layer is the whole
    performance question. Measured on the real loop, ~180 notes at a
    realistic height mix, 900×480 @2x DPR, Glow at the default 200
    (= 28 px pad, so a 50 px note's aura box is more than twice the note):
    | aura layer | median frame |
    |---|---|
    | no glow at all | 16.7 ms |
    | `ctx.shadowColor`/`shadowBlur` | **1442.6 ms** |
    | reference mask squashed per note | 77.8 ms |
    | 14 concentric translucent rounded rects | 35.9 ms |
    | **cached halo sprite (`getChromeHaloSprite`)** | **~46-50 ms** |
    | Glass with glow, for scale | ~41 ms |
    `ctx.shadow*` re-blurs the whole padded box on every fill, so it
    scales with note AREA × note count and collapses under 1 fps — it is
    never an option at this note count. Every live per-note aura loses
    the same way: it composites a `(w+2·pad)×(h+2·pad)` region per note
    and reallocates the scratch canvas whenever consecutive notes differ
    in size. What works is what every other style already does — bake the
    aura once per (colour bucket, size bucket) and blit it. Chrome gets a
    **halo-only** sprite so the body it cannot cache is not needed; the
    Gaussian itself still comes from the shared, geometry-keyed
    `getHaloMask`, so it costs one `source-in` tint on top of a bake other
    styles already pay for. That lands Chrome ~15% over Glass, which is
    the price of the one extra draw call, and inside an envelope the app
    already ships.
    - **Growing notes take `drawGlowHaloLive` instead** (same split the
      `solid` branch uses): the sprite key buckets height in 8 px steps,
      so a held note would mint a bake every few pixels and reuse none.
    - Baking the halo below display DPR and letting the blit magnify it
      was tried — the aura is pure Gaussian falloff so it loses nothing
      visually — and paced **worse** (70.3 ms vs 52.2). The magnified blit
      costs more than the texels it saves. Bake at the real DPR.
  - **Scroll speed**: `CHROME_DRIFT_X/Y` are 2 and 3. They shipped at
    7/11 and the user's reply was "animasi kecepetan" — the falling notes
    are already moving, so the material scrolling underneath them reads
    much faster than the same number would on a static swatch.
  - **`chrome` used to be a LEGACY_STYLE alias onto Glass** (retired
    material name). That alias is now removed — leaving it would have
    made every saved preset naming Chrome resolve to Glass forever.
  - Weak devices never reach any of it: `resolveAnimStyle()` already
    collapses every heavy material to `single` when the graphics profile
    says `!heavyFx`.
  - **The stages have a SECOND note renderer, and Chrome missed it.**
    `drawFallingNote` only ever draws live-played notes. Notes from a
    loaded file are scheduled and fall top→bottom through
    `drawVizFallRect`, which is why Chrome rendered nothing in Visualizer
    and Learn Song on the first pass — the user's report was "di
    visual/learn song ga work karena emang beda konsep dari atas ke
    bawah". Any new Style must be added to BOTH. A tiling material needs
    no `drawFallingSpriteFlipped` (it has no up or down), and its notes
    pass `growing=false` since a scheduled note's height is fixed by its
    duration.
  - **Verification.** The Chrome glow block is byte-identical across all
    four engines (same MD5, 4803 bytes). Solo, Visualizer-stage and
    Learn-song-stage were all driven live with Glow on and screenshotted
    — the stages by injecting their `sessionStorage` handoff keys
    (`vizMidiData`/`vizMidiName`, `learnSongMidiData`/`learnSongMidiName`)
    via `addInitScript` so they do not bounce to the picker, then waiting
    ~13 s, because `vizCheckSession` polls for SoundFont buffers up to
    40×250 ms before it will load the MIDI. Multiplayer is still
    structural only (auth gate).
- **2026-09-04 (sixth) — Batik (Parang Rusak) falling-note Style fully
  deleted, all 4 engines** — user report: "jelek, berat" (ugly, heavy). It
  was a real cost outlier (its own comment: "1.00 clip/note, ~2700 clip
  calls/sec, while every other style ran zero — the single largest reason
  batik costs what it does"). Retired the same way 'liquid' already was
  (precedent to follow for any FUTURE style deletion), never a hard
  removal of the name from every code path:
  - `mBatik`/`data-style-target="mBatik"` buttons deleted from all 4 host
    HTML files (both the main picker and the Settings-panel duplicate).
  - The entire per-file rendering implementation deleted: the tile-cache
    material block (`_batikTiles`/`_batikWaxTileFor`/`_batikSheen`/
    `drawBatikBodyUnstretched`, ~200 lines), the sprite-bake dispatch
    branch, and the render-loop's `batikLiveGlowDrawn`/donut-clip special
    case (collapses back to the plain `getEffectSprite` + `drawImage`
    2-liner every other non-midnight/glass-live style already used).
    Visualizer/learn-song ALSO had a second, unique batik overdraw call in
    their own top-down/file-playback renderer (`drawVizFallRect`) that
    solo/multiplayer never had — found only by grepping each file
    individually rather than assuming the falling-note pipeline is
    byte-identical across all 4 (it mostly is, but NOT this function name:
    solo/multiplayer call it `resolveAnimStyle`/`animStyle`, visualizer/
    learn-song call the equivalent `resolveFallingNoteStyle`/
    `fallingNoteStyle` — a real per-file naming divergence, not an error).
  - `animModeBtns`'s `mBatik:'batik'` entry removed (so the id can never be
    iterated into a live style again) and the theme-scoped CSS rules hiding
    `#mBatik`/`[data-style-target="mBatik"]` under Child/Sketch/8-bit
    (solo/visualizer only — multiplayer's custom themes were already
    deleted entirely in an earlier entry, learn-song-stage.css never had
    them) removed as dead weight now that the button doesn't exist.
  - **Migration, NOT deletion, everywhere a stored value can still say
    'batik'**: `LEGACY_STYLE.batik = 'single'` (a returning user's saved
    preset/session migrates silently, exactly like every other retired
    material above it in that same map); `resolveAnimStyle`/
    `resolveFallingNoteStyle` now unconditionally `if(style==='batik')
    return 'single'` (was previously a narrower, theme-conditional
    defensive check — simplified to match 'liquid's unconditional
    pattern now that there is no live code path that can ever produce
    'batik' on purpose); and the top-level `if(animStyle==='batik')
    animStyle='single'` / `if(fallingNoteStyle==='batik')
    fallingNoteStyle='single'` runtime line right next to 'liquid's own.
    A user who had Batik selected loses nothing crash-wise — they land on
    Single, the same safe default every other retired style resolves to.
  - Verified: syntax-checked all 4 engines, an isolated Node script
    (extracted the real `LEGACY_STYLE`/`styleMap`/`resolveAnimStyle`/
    `animModeBtns` values) confirming a saved `material:'batik'` preset
    resolves to the `mSingle` button and `resolveAnimStyle('batik')`
    returns `'single'` while every other style passes through unchanged,
    `node scripts/build.js` + `check-min-sync.js` clean, and a full
    case-insensitive repo grep for "batik" across every `.js`/`.html`/
    `.css` source file returns nothing outside the intentional
    retirement/migration lines documented above.
- **2026-09-04 (fifth) — Key-label default color/opacity actually fixed on
  mobile, not just in JS** — direct follow-up to the (fourth) entry below:
  the JS fix alone didn't survive on a real phone. Root cause: all 4
  `css/*/*.css` files carry `.key-label{color:rgba(20,24,30,0.54)
  !important;}` / `.black-label{color:rgba(255,255,255,0.64) !important;}`
  inside their own `@media (max-width:700px)` block — `!important` beats
  ANY non-`!important` inline style regardless of specificity, so on any
  viewport ≤700px (i.e. most phones) these two lines silently overwrote
  every mode's JS-computed `color` back down to the dim shared default,
  including 'qwerty''s already-higher-contrast value — this bug therefore
  also affected 'qwerty' on mobile even though nobody had reported it
  (nothing to compare against once every mode is equally dimmed). Deleted
  both lines from all 4 CSS files (values were within 0.01 of the
  non-mobile default at line ~661/690 anyway, so this reads as leftover
  duplication, not a deliberate mobile-specific treatment). Left the
  Octave label mode's `color=''` gap fixed too (same explicit high-contrast
  value 'qwerty'/'note'/'number' now share) — user asked to make sure
  opacity is fixed for "semua label" (every label), not just the two modes
  the (fourth) entry covered. Theme-scoped label-color `!important` rules
  (theme-child/sketch/8bit, all ≥0.85 alpha already) were left alone —
  those are deliberate per-theme choices, not the dim-default bug.
- **2026-09-04 (fourth) — Note Names ('note') and Number/Solfege/Japanese
  ('number'/'solfege'/'japanese') key-label modes: white-key label size
  bumped ~132% and given an explicit high-contrast color, all 4 engines.**
  User report: white-key labels in these modes read noticeably smaller than
  'qwerty' at the same key width, and were "susah dilihat" (hard to see).
  Root cause of the second half: unlike 'qwerty' (which sets an explicit
  inline `color`), these two branches of `updateKeyLabelStyle` left `color`
  empty, falling through to the shared CSS default
  (`.key-label{color:rgba(20,24,30,0.54)}` / `.black-label{...0.64}`) — a
  noticeably lower-contrast/lower-alpha value than 'qwerty' was already
  using (`rgba(82,86,92,0.82)` white / `rgba(255,255,255,0.98)` black).
  - White-key `fontSizePx` formula scaled ~1.32x across all three numbers
    (floor/multiplier/cap) in both branches: `Math.max(8, Math.min(wkw*0.36,
    22))` → `Math.max(11, Math.min(wkw*0.475, 29))`. Verified: ~131.9% at
    every realistic white-key width, ~137.5% only at the extreme low end
    where the 11px floor itself dominates (was 8px there before).
  - Both branches now set `color` explicitly to the same values 'qwerty'
    already uses, instead of leaving it empty.
  - Deliberately scoped to WHITE keys and to these two label-mode branches
    only — black-key sizing untouched (only white was reported small, and
    the 'number'/'solfege'/'japanese' branch's black-key size was already
    separately tuned tight for 2-4 char labels like "Sol#"/"ファ#"); 'octave'
    and 'qwerty' modes untouched (not reported, and 'qwerty' was already the
    reference point being matched). Confirmed byte-identical across all 4
    engines (solo/multiplayer/visualizer/learn-song) via direct diff of the
    extracted function body, modulo one pre-existing per-file comment line
    (references each file's own stylesheet name) that predates this change.
- **2026-09-04 (third, revised) — Piano Height slider is non-linear below
  the landscape default (40%), MANUAL adjustment only, all 4 engines, WITH
  a Black Key Edge Depth compensation coupled to it.** User's ask (in
  Indonesian, referencing apps like Synthesia): dragging Piano Height down
  shouldn't shrink the rendered piano 1:1 all the way to near-zero — the
  lower it goes, the more it should resist shrinking, so the black keys
  keep a readable, piano-app-like proportion. First attempt (a hard floor
  at 22% of `maxPx`) was WRONG: it only kicked in below 22%, so a test at
  33% ("kok kaya ga ada beda? Tinggi masih 40%") showed zero visible
  change — 33% never touched the floor. Replaced with a smooth curve.
  Explicitly scoped to the manual slider only — the 40%/10% landscape/
  portrait DEFAULTS (see the entry below and the 2026-08-03 "harga mati"
  call) must render at EXACTLY the same px they did before this change.
  - `pianoHeightPercentToPx` (percent→px) split in two:
    `pianoHeightPercentToPxLinear` (the original, untouched `maxPx *
    pct/100`, used for defaults) and a new `pianoHeightPercentToPx` — a
    power curve on `pct/40` (`PIANO_HEIGHT_CURVE_PIVOT_PCT=40`,
    `PIANO_HEIGHT_CURVE_GAMMA=0.5`, i.e. sqrt): `fraction =
    (pct/40)^0.5 * 0.4` for `pct<40`, plain `pct/100` at/above 40, `0` at
    `pct<=0`. This is mathematically IDENTICAL to linear at pct=0 and
    pct=40 (continuous, no jump at the pivot — and it means a manual value
    of exactly 40 renders identically to the untouched default, since both
    paths agree there), while every pct strictly between 0 and 40 renders
    taller than plain linear would (e.g. manual 33% → 36.3% equivalent,
    manual 10% → 20% equivalent — a real, visible boost at moderate
    reductions, not just near-zero ones).
  - Which function `applyPianoHeight` uses is decided by a module-level
    `pianoHeightIsManual` flag, NOT a per-call-site parameter — a plain
    resize/relayout that just re-asserts `currentPianoHeightPercent` (the
    non-flip branch of `relayoutAfterOrientation`) goes through whatever
    the flag already is, so it can't accidentally curve an untouched
    default just because that default happens to be a low percent (this
    is exactly the trap: portrait's own default is 10%, well under the
    pivot — a naive "curve everything below 40" applied unconditionally
    would have silently inflated the portrait default from 10% to 20% on
    every soft-keyboard resize).
  - Flag is set `true` only by real user interaction: an
    `applyPianoHeightManual(value, final)` wrapper (sets the flag, then
    calls `applyPianoHeight`) replaces `applyPianoHeight` directly in all 8
    `hRange`/`keyPanelHRange` event listeners, and in the saved-height
    load path when a session actually has a saved custom `pianoHeight`.
  - Flag is explicitly reset `false` at every place a DEFAULT is applied:
    `ensurePianoBootVisible`'s collapsed-layout fallback,
    `relayoutAfterOrientation`'s real-flip branch,
    `applyFactoryDefaults`/Reset, and the saved-height load path's
    no-saved-value branch.
  - **Black Key Edge Depth compensation** (the second half of the same
    user ask — "aslinya butuh penyesuaian juga di blackkey edge"):
    `updateBlackKeyEdgeVars()`'s `--bk-face` (the bevel's absolute depth in
    px) is sized off key WIDTH only (`whiteKeyWidth *
    blackKeyEdgeDepthPercent/100`) — deliberately never off height, per
    that function's own long-standing comment about portrait aspect
    ratios. That means when the Height curve makes a key TALLER than pure
    linear would have, the bevel's depth-to-key-height ratio (`--bk-cut`)
    would silently read as proportionally shallower, since the numerator
    (face depth) didn't grow with the now-taller key. New module-level
    `pianoHeightBoostRatio` (= curved-height-px / linear-height-px at the
    current pct, computed in `applyPianoHeight`, always exactly `1` for
    defaults or pct≥40) is multiplied onto `blackKeyEdgeDepthPercent`
    inside `updateBlackKeyEdgeVars()` (clamped to that setting's own
    [10,100] range) before computing `facePx` — this scales the bevel's
    absolute depth by the same ratio the height itself was inflated by, so
    the bevel-to-key-height look stays exactly what a non-curved height
    would have shown. The base `blackKeyEdgeDepthPercent` (the slider's own
    value, what gets saved) is never mutated — only this derived, one-off
    "effective" value used for the actual `facePx`/`cutPercent` math.
    `finalizePianoHeightLayout()` now also calls
    `scheduleBlackKeyVisualUpdate()` (the existing rAF-batched entry point
    the Black Key Height/Edge Depth sliders already used) so the
    compensation actually repaints once a Height drag/gesture ends —
    matches this codebase's existing "cosmetic per-black-key detail can lag
    one debounce cycle behind the slider" perf convention, doesn't run on
    every raw drag tick.
  - Verified with an isolated Node script (real function bodies, fake
    fixed `maxPx`) asserting: default 40%/10% via the Linear function and
    `pianoHeightBoostRatio===1`/effective edge depth === base are all
    byte-identical to pre-curve behavior; manual 40% and 100% match linear
    exactly (pivot + upper-bound continuity); manual 0% stays 0
    (collapsible); manual 33% and manual 10% both render taller than plain
    linear (the exact case that failed under the old hard-floor design);
    edge-depth compensation increases when the height boost is active; and
    the curve is monotonic non-decreasing across the full 0-100 range. All
    4 engines confirmed byte-identical via md5sum on the extracted function
    bodies before and after editing.
  - **Directly follows a same-day revert**: an earlier attempt this
    session to fix "mobile portrait piano layout looks cramped vs desktop"
    by reducing `wCount` (visible key count) to 20 on
    `pointer:coarse`+portrait was misdiagnosed — the user's actual ask was
    a *visual/proportional* match to desktop, explicitly NOT a key-count
    change ("bukan ganti key count"). That commit was fully reverted
    (`isCoarsePointerDevice`/`defaultWCountForOrientation` removed, `wCount`
    back to an unconditional `52`) before this Height-curve fix was built.
    If a future "make portrait look more like desktop" request comes in
    again, do NOT reach for wCount — key count is a settled, rejected
    lever for this problem; look at Position/Height/Black-Key-Width (the
    entry below) or this Height-curve floor instead.
- **2026-09-04 — Piano Position/Height/Black Key Width now follow device
  orientation live, all 4 engines** (portrait: Position 30%/Height 10%/
  Black Key Width 110%, tuned for a MIDI-keyboard player who barely looks
  at the on-screen piano; landscape: back to the existing 0%/40%/120%,
  explicitly required by the user as "kalau diubah ke landscape ya balik
  normal"). New `isPortraitOrientation()` (matchMedia-based) +
  `_lastPianoOrientationWasPortrait` flip-tracking inside
  `relayoutAfterOrientation()`, so only a REAL rotation re-snaps these
  three settings, not every resize/viewport event (a soft keyboard
  opening, a desktop window resize) that fires the same listeners without
  the device actually rotating — a manual mid-session tweak survives
  those. `getDefaultPianoHeightPercent()` is orientation-aware again on
  top of the existing flat-40%-landscape value from the 2026-08-03 "harga
  mati" call (not a reintroduction of the adaptive floor/ceiling that call
  removed). Full writeup, including the isolated logic test covering all
  5 scenarios (non-flip resize, manual customization surviving a non-flip
  resize, both rotation directions, fresh portrait boot), lives in
  `multiplayer.md`'s matching entry — chosen as the canonical location
  since the user's original ask paired it with a multiplayer-only theme
  deletion in the same message, but this half applies to all 4 engines
  identically (confirmed byte-identical before and after editing).
- **2026-09-03 (sixth) — user-reported tab crashes ("mental") on all 4
  engines when hit by a "loud"/dense song, worse on laptops, with an
  extra bug specifically in Visualizer. Explicitly self-audited (no
  subagent) per the user's instruction. This entry documents the full
  investigation — confirmed defects fixed, theories investigated and
  ruled out, and what remains genuinely unverified since an actual
  browser tab crash cannot be reproduced or confirmed from this sandbox
  (no real GPU/driver, no way to force an "Aw, Snap").**
  - **Confirmed, fixed: `GRAPHIC_PROFILES.default.fallingMax` was
    effectively uncapped (100000).** The Aug 29 audit (see the entry
    further down) made the cap-ENFORCEMENT code real (previously dead),
    but never questioned whether the per-tier CAP VALUES it enforces were
    still sane — `potato`/`medium`/`high` are 260/520/900 (all
    reasonable), but `default` — the only tier virtually every user is on
    (medium/high have no UI entry point) — was 100000, a number clearly
    meant as "no real limit," not a considered ceiling. Falling notes
    (grow-bar live-input visuals, `falling[]`) live in a plain
    dynamically-sized array with no matching fixed-size buffer behind
    them (unlike particles, which are hard-clamped to the 4096-slot
    `NEON_DUST_MAX` ring buffer regardless of `dustMax` — confirmed this
    makes `dustMax:16000` harmless and left it alone). A long
    sustain-pedalled or dense passage could grow `falling[]` without any
    real bound, which is exactly the kind of unthrottled per-frame
    render cost that can stall the main thread hard enough to trigger a
    GPU driver reset/crash on a weaker or integrated laptop GPU — matches
    "sering di laptop" directly. Lowered to `1400` (still well above
    `high`'s 900, so `default` stays the best real tier, but a genuinely
    dense/loud file now actually gets throttled via the existing
    oldest-first, still-growing-notes-protected culling logic instead of
    piling up unbounded). Applied identically to all 4 engines (confirmed
    present byte-identical in all 4 before editing).
  - **Confirmed, fixed: Gradient/Rainbow Strike Reaction's per-held-key GL
    draw call had no ceiling.** Documented as an accepted tradeoff in the
    2026-07-20 audit further down ("bounded by concurrently-held keys, so
    still cheap in practice") — that reasoning assumed a human hand/pedal
    is what bounds "concurrently held," which FILE PLAYBACK breaks
    entirely: a dense/loud MIDI file (pedalled orchestral passages
    routinely exceed 40-50 simultaneous notes) can hold far more notes at
    once than any hand could, in Gradient/Rainbow Falling Note colour
    mode specifically (each held key needs its own hue, which the shader
    can only do via a per-DRAW-CALL uniform, not a batchable per-vertex
    attribute — this is why it wasn't already batched with the rest).
    That's genuinely unbounded GL draw-call growth tied directly to
    "how dense/loud the content is," landing on exactly the class of
    sustained per-frame GPU driver load that resets/crashes weaker or
    switchable-graphics laptop GPUs. Added a hard ceiling,
    `MAX_FLARE_DRAWS_PER_FRAME = 32` (comfortably above any real hand+
    pedal scenario — even a full 10-finger chord over a held previous
    passage rarely reaches 20-30), so a pathological file-playback burst
    just skips drawing the excess flares that frame instead of costing the
    GPU driver unbounded work. Normal play is completely unaffected
    (never gets near 32 held keys). Applied identically to all 4 engines
    (the 5-line `neonDustEmitters.forEach` block was confirmed present,
    byte-identical, exactly once in each file before editing — solo/
    multiplayer use `animColorMode`/`animColorSplit` naming where
    visualizer/learn-song use `fallingNoteColorMode`/`vizLayersActive()`,
    but the flare-loop body itself was identical).
  - **Confirmed, fixed (defensive, not proven to be THE cause): no engine
    had a `webglcontextlost`/`webglcontextrestored` handler anywhere.**
    Per the WebGL spec, `preventDefault()` inside a `webglcontextlost`
    listener is REQUIRED for the browser to ever attempt restoring the
    context later — without it, a lost context (from a driver reset,
    whether caused by the two fixes above or anything else entirely
    outside this app's control) permanently disables the particle system
    for the rest of the session with the app never finding out, since
    every `gl.*` call silently no-ops once lost rather than throwing.
    Added listeners on `glCanvas` in all 4 engines: `webglcontextlost`
    calls `preventDefault()` and nulls `glParticles` (every caller —
    `renderGlParticles`/`clearGlParticles`/`setGlCanvasActive` etc. —
    already null-checks it, so this alone is a safe, silent, total
    shutdown of just the particle layer, not a crash of its own);
    `webglcontextrestored` re-runs `initGlParticles()` to rebuild it. This
    does not prevent a driver crash from happening — nothing in page JS
    can — it only stops the AFTERMATH from being a permanently broken
    particle system with no attempted recovery.
  - **Investigated and RULED OUT as the cause, with reasoning** (kept here
    so a future audit doesn't waste time re-checking these):
    - Voice pool (`activeVoices`/`MAX_ACTIVE_VOICES`, real AudioNodes per
      voice): hard-capped and enforced via `enforceVoiceLimit()`
      (verified working correctly as of this same session's earlier
      sustain-pedal/voice-steal fixes above) — piano+string voices
      together, bounded regardless of note density.
    - `neonDustEmitters` (the flare source): a `Map` keyed by MIDI note
      number (0-127), so naturally bounded to at most 128 entries no
      matter how many notes play — re-striking the same pitch just
      overwrites, and released emitters are deleted after
      `FLARE_RELEASE_MS`. Not an unbounded leak.
    - `_packOneContactFlare`/`_packContactFlares`'s shared `packed`
      Float32Array (sized `NEON_DUST_MAX + 512` slots): properly
      bounds-checked (`if(n + 5 > capacity) return n;`) before every
      write — no buffer overflow possible even with far more than 512/5
      simultaneous emitters.
    - Dust particle spawn (`spawnNeonDust`/`_allocDustSlot`): a genuine
      fixed-size ring buffer (`NEON_DUST_MAX = 4096`) with O(1)
      steal-cursor allocation — cannot grow past 4096 regardless of
      `dustMax`'s per-tier value (confirmed the spawn guard clamps via
      `Math.min(dustCap, NEON_DUST_MAX)` in all 4 engines).
    - File-playback falling-note rendering (`drawVizFalling` and its tile
      cache, Visualizer/Learn Song only): the steady-state path blits
      pre-baked tiles (cheap, bounded by visible tile ROWS not note
      count); the direct/uncached fallback paths
      (`_vizDrawFallingDirect`, the tile cache's own "long notes" loop)
      are windowed to the visible time range via a monotonic start
      pointer + sorted-by-onset early break — properly bounded by what's
      currently on screen, not total file density. Not a leak or
      unbounded-cost path.
    - Master audio chain: a real `DynamicsCompressorNode` limiter +
      soft-clip stage already exists ahead of destination — an extremely
      loud/dense mix gets compressed and clipped safely, not left to
      distort/overflow raw.
    - `vizVisualTimers` (per-note-visual `setTimeout` IDs, file playback
      only): does accumulate stale fired-timer IDs for the full duration
      of playback without pruning mid-song (only cleared on
      pause/seek/stop) — real, but each entry is one JS number; even a
      very long, very dense song reaching tens of thousands of entries is
      on the order of a few hundred KB, not a plausible crash trigger by
      itself. Noted as a minor inefficiency, not fixed this pass (fixing
      it would mean periodically compacting the array, which is safe but
      unnecessary extra churn for a cost this small).
  - **Not verified as fixed, and honestly can't be from this sandbox**:
    none of the three fixes above could be confirmed against an actual
    browser crash (no real GPU/driver available here, and a WebGL context
    loss can't be forced from a headless environment in a way that
    proves anything). Confidence rests on: (1) each fix addressing a
    concretely-identified, provable defect in the code (an cap that
    literally never binds, a draw-call count with no ceiling at all, a
    resilience gap that's absent by inspection) rather than a guess, (2)
    an isolated logic test confirming each fix's actual before/after
    numeric behaviour (old cap doesn't bind on 5000 dense notes, new cap
    does; 120 emitters correctly capped to 32 draw calls while 8 stays
    unthrottled; context-loss handler correctly calls preventDefault and
    nulls/rebuilds `glParticles`), and (3) all three fixes being safe/
    conservative even if none of them turns out to be the exact
    mechanism — none of them changes behavior at all for realistic,
    non-extreme content. Worth a real-device confirmation (ideally the
    laptop this was originally reported on) if crashes continue.
- **2026-09-03 (fifth) — three requests bundled together: unify the main
  Transpose control's range to +/-12 everywhere (it was unclamped in all 4
  piano engines, unlike QWERTY Sheet's own `TRANSPOSE_LIMIT = 12`), add an
  independent Layer/pad transpose control, and raise the Layer Fade
  default from 2s to 5s.**
  - **Main Transpose clamp**: `changeTranspose(delta)` in all 4 engines had
    no bound at all — `transpose += delta` — while `qwerty-sheet.js` has
    always clamped to `TRANSPOSE_LIMIT = 12` with its up/down buttons
    disabling at the edge. Fixed to
    `transpose = Math.max(-12, Math.min(12, transpose + delta))`, matching
    QWERTY Sheet's range (button-disable UX was NOT copied — no `:disabled`
    CSS exists for `#tUp`/`#tDown` in any of the 4 engines' stylesheets, so
    adding the attribute would have looked unstyled/broken; the clamp alone
    satisfies "max-min adalah 12"). Also clamped the preset-restore path
    (`s.transpose !== undefined`) so an old saved preset with an
    out-of-range value (from before this clamp existed) gets pulled back
    in range on load instead of carrying the value forward unclamped.
  - **Layer Transpose (new)**: `sfEffectSettings.sf2` gained a `transpose`
    field (default `0`), read through a new `getStringTranspose()` helper
    (clamped +/-12, same range as the main control) and applied ONLY to
    the string/layer voice's pitch in `playNote()` —
    `playSfBuffer(soundMidi + getStringTranspose(), ..., 'string', when)`
    — the piano voice's own `playSfBuffer(soundMidi, ...)` call is
    untouched. This is independent of the main Transpose control on
    purpose: main transpose re-pitches the whole piano AND the key
    layout/QWERTY bindings (`build()` runs), while layer transpose only
    shifts the register of the pad/string sound layered underneath —
    several "pad"-style layer presets sit naturally an octave below the
    piano they're paired with, and re-pitching the entire piano just to
    compensate for the layer was the only option before this. New UI:
    a "Layer Transpose" card in the layer panel (`#sfPageLayer`), placed
    right after the existing "Layer Range" split-range card, wired the
    same stepper-button way the main Transpose control's `#tUp`/`#tDown`
    already work (`changeStringTranspose(delta)` → clamp → `updateSfEffectUI()`
    refreshes `#sf2TransposeVal`). No stopAllNotes()/rebuild on change
    (matches how changing Fade/Reverb already behaves — applies to the
    NEXT note, doesn't retune what's already ringing).
    Saved/restored automatically: `sfEffectSettings` (the whole object,
    `sf2.transpose` included) already rides through
    `getCurrentSettings()`/`applySettings()`'s existing merge-assign path
    with no new save/restore code needed — an old preset missing the key
    reads back as `0` via `getStringTranspose()`'s own `|| 0` fallback (and
    is explicitly backfilled to `0` on the next `applyCurrentSfEffects()`
    call, matching how `fadeSec` is already backfilled the same way).
    Multiplayer's REMOTE-player audio path (`playRemoteBuffer`, a
    completely separate function from the local `playSfBuffer`/`playNote`)
    was deliberately NOT touched — this is a local-only setting, wiring it
    into the realtime broadcast protocol was out of scope and not asked
    for.
  - **Layer Fade default 2s -> 5s**: bumped `STRING_FADE_DEFAULT`, the
    initial `sf2: {...}` object literal, and the factory-reset assignment
    (3 spots per file) in all 4 engines. Note: all 4 HTML files' Layer Fade
    slider markup (`sustainSf2Range`/`settingsSustainSf2Range`) already
    displayed `value="5"`/`"5.0s"` as their static default from a previous
    session — only the JS-side actual default was still 2.0, a real
    mismatch this fix resolves (the slider LOOKED like it defaulted to
    5.0s but a fresh profile/factory reset actually got 2.0 until now).
  - Applied identically to all 4 engines — `getStringTranspose()` and
    `changeStringTranspose()` confirmed byte-identical across all 4 via
    md5sum, same for the `changeTranspose`/preset-restore clamp edits (not
    re-verified via md5sum since those functions already had per-file
    comment variations elsewhere, but the edited lines themselves are
    identical text in all 4).
  - **Verified with an isolated logic test**: `getStringTranspose()`
    clamps at both edges, defaults to 0 when the key is missing entirely
    (old-preset case); `changeStringTranspose()` can't be stepped past
    +/-12 in either direction; and a full `playNote()` re-implementation
    (verbatim body) confirmed the piano voice's pitch is untouched by a
    -12 layer transpose while the string voice's pitch is offset by
    exactly -12 (MIDI 60 -> 48). Main transpose's clamp verified the same
    way (20 ups from 0 stops at 12, 30 downs from 12 stops at -12).
    `node scripts/build.js` + `scripts/check-min-sync.js` both clean after.
- **2026-09-03 (fourth) — Visualizer's own `vizPause()` also left audio
  ringing on tab-hide, for a different reason than Learn Song's bug above:
  it early-returns on `if(!vizPlaying)return;`, so a note played purely
  LIVE (mouse/touch/QWERTY/MIDI, no file ever loaded/playing) under a held
  sustain pedal was never silenced at all — `_releaseAllLiveInputHolds()`
  (also called on hide) only drains key-DOWN state, never the pedal or the
  voices it's holding open. User re-confirmed this after the Learn Song fix
  was already shipped: "ga cuma learn song namun visualizer sekalian" (not
  just Learn Song, Visualizer too).** Fixed by adding an unconditional
  `stopAllNotes()`/`midiPedalHeldNotes.clear()`/`setMidiSustainPedal(false)`
  call directly in the `visibilitychange` handler, after `vizPause()` runs
  — redundant when `vizPlaying` was true (vizPause already did it via its
  own gated path), the only thing that actually closes the live-play-only
  gap otherwise. The identical fix applies to Learn Song's own handler for
  the same reason (see `learn-song.md`'s matching entry — both
  `lsPause()`/`learnSongPlayerPause()` are similarly transport-gated).
  Verified with an isolated logic test: `vizPlaying=false` → the gated
  `vizPause()` call correctly no-ops (transport UI state untouched, as it
  should be — nothing was playing) but the three unconditional calls still
  fire.
- **2026-09-03 (third) — a brand-new note could get voice-stolen within
  milliseconds of starting, audible as an intermittent click/"tcek" right
  on the attack — user-reported specifically during Visualizer file
  playback ("play midi atas ke bawah"), confirmed via two follow-up
  questions to happen at attack (not mid-sustain/loop) and identically
  across every soundfont tested (rules out sample-content/loop-authoring
  as the cause, points at the shared scheduling code instead).**
  - **Root cause: `enforceVoiceLimit()`'s victim-selection scores every
    candidate by `voiceAudibility()`, which reads the voice's gain
    AudioParam's CURRENT value.** `playSfBuffer()` calls
    `activeVoices.push(voice); enforceVoiceLimit();` synchronously,
    immediately after scheduling the new voice's own 6ms attack ramp
    (`gain.setValueAtTime(0.0001, now); gain.linearRampToValueAtTime(peak,
    now+0.006)`). At the instant `enforceVoiceLimit()` runs — the same
    synchronous tick — the ramp has barely started, so `gain.value` reads
    close to its 0.0001 starting floor. `voiceAudibility()` then scores
    this brand-new voice as the QUIETEST thing in the entire pool — quieter
    than genuinely old, decayed voices — even though it's about to be one
    of the loudest things sounding. If the pool happens to be over the
    burst limit at that moment (routine during dense file playback of a
    real song; rare during casual manual tapping, matching why this showed
    up specifically in Visualizer/file playback), the note that was JUST
    struck gets immediately stolen (`VOICE_STEAL_TC = 0.05`, a fast fade)
    — a full-volume-then-cut transient within milliseconds reads to the ear
    as a click/tick, not a dropped note.
  - **Fix**: added a guard in the per-voice check inside the victim-scoring
    loop — `if (!v.released && sweepNow - (v.startedAt || sweepNow) < 0.03)
    continue;` — skipping any not-yet-released voice younger than 30ms
    (comfortably past the 6ms attack ramp, matching the existing
    `releaseVoice()`'s own `voice.startedAt + 0.03` cancel-safety guard for
    consistency) from being considered as a steal victim at all, in any
    pass. A released voice is unaffected (its gain legitimately reflects a
    release curve, not an attack, so the guard's `!v.released` condition
    never applies there). Worst case if an entire chord's voices are all
    younger than 30ms simultaneously: the pool stays briefly over its
    burst limit until the next `enforceVoiceLimit()` call (the next
    note-on, tens of ms later) when they've aged past the guard — an
    accepted, bounded, self-correcting tradeoff, and strictly better than
    cutting off a note that was just struck.
  - Applied identically to all 4 engines. `enforceVoiceLimit()`'s full body
    is NOT byte-identical across all 4 (solo/multiplayer/visualizer/
    learn-song each carry their own comment-length variations from past
    per-file tuning), but the actual victim-selection loop
    (`for (let pass = 0; pass < 3 && killed < needKill; pass++) {...}`) was
    confirmed byte-identical across all 4 via md5sum before editing, and
    confirmed byte-identical again after.
  - **Verified with an isolated logic test** (the selection loop has no
    DOM/audio dependency beyond `voice.startedAt`/a gain value, so a Node
    harness running the real post-fix loop body verbatim against a fake
    pool could assert directly): a pool with one 5s-old genuinely-decayed
    voice (gain 0.02) and one voice created the same tick (age 0, gain
    0.0001) → the brand-new voice survives and the old decayed one is
    culled instead (pre-fix, the reverse would happen). A voice that HAS
    aged past the 30ms guard is still a normal steal candidate afterward —
    the guard is time-bounded, not a permanent exemption.
  - Not investigated further / left alone: whether an actual raw SF2
    sample-loop-boundary click (unrelated code path, would show up
    mid-sustain rather than at attack) also exists — ruled out as the
    primary complaint by the user's own answer that the click is at attack,
    not mid-note.
- **2026-09-03 — the layer/pad soundfont could still be held open by a MIDI
  sustain pedal (CC64) even though `stopNote()`'s string branch already
  claims Fade is "the sole authority over the layer" — user-reported: "gue
  mau ini murni atur pakai fade karena sistem pad" (wants it purely
  fade-controlled, it's a pad system).**
  - **Root cause: `stopNote()` was fixed for its own release-CURVE logic in
    an earlier session (see the string branch's own comment — Fade instead
    of `max(fade, piano release)`), but the four places that DECIDE whether
    to call `stopNote()` at all never got the matching fix.** Both the live
    hardware-MIDI note-off dispatch (`_handleMidiMessage` in
    `solo-piano.js`/`multiplayer-piano.js`) and the file-playback CC64
    timeline loop (`visualizer.js`/`learn-song-engine.js`, driven by a
    loaded MIDI file's own embedded sustain events, not just a live pedal)
    had the same shape: `if (pedal down) park the note in
    midiPedalHeldNotes; else stopNote(note)` — i.e. while the pedal/CC data
    said "down", `stopNote()` was skipped ENTIRELY for the note, both piano
    AND string/layer key. The layer's Fade-only release branch inside
    `stopNote()` never got a chance to run until the pedal finally lifted,
    so a pad/layer sound stayed at full volume for the entire time a pedal
    (or a file's embedded pedal data) was held, however long that was —
    exactly the "triggered/extended by sustain" behavior the user wants
    impossible.
  - **Fix: `stopNote(midi, fast, when, layers)` gained an optional 4th
    param** — an array subset of `['piano','string']` restricting which
    key(s) it releases (defaults to both, unchanged for every other
    caller). All 4 pedal-gated dispatch sites now call
    `stopNote(note, false, when, ['string'])` UNCONDITIONALLY first (so the
    layer always gets its Fade-driven release the instant the key lifts,
    pedal or no pedal), and only then branch on pedal state for the piano
    half: parked in `midiPedalHeldNotes` if held, or
    `stopNote(note, false, when, ['piano'])` if not.
    `releaseMidiPedalHeldNotes()` (fires on pedal-up) is unchanged — it
    still calls plain `stopNote(note, false, when)` with no `layers`
    filter, which is a safe no-op for the string half since that key was
    already released and deleted from `activeNotes` at key-up time.
  - Applied identically to all 4 files (`stopNote`'s body confirmed
    byte-identical across all 4 before and after via md5sum, same
    discipline as every other "applies 4x" entry in this file).
  - **Verified via an isolated logic test** (not a live browser — this
    dispatch logic has no DOM dependency, so a Node harness running the
    exact `stopNote()` body plus the exact dispatch-site lines, copy-pasted
    verbatim from the real file, with `releaseVoice`/`activeNotes` faked to
    record calls): pedal-down key-up → the string voice's `releaseVoice`
    call fires immediately with its Fade profile (`delay` matching the
    voice's own `fadeSec`) while the piano voice is NOT released and sits
    in `midiPedalHeldNotes`; pedal-up afterward → the parked piano voice
    finally releases along its long sustain-driven curve; pedal-up the
    whole time (normal case) → both release together immediately, unchanged
    from before. `node --check` passed on all 4 files and
    `scripts/check-min-sync.js` confirmed all 4 `.min.js` outputs are in
    sync after rebuild.
  - **Not touched, and correct as-is**: the mouse/touch/QWERTY/live-note
    release path (`release()` in each engine, calling `stopNote(n, !!fast)`
    with no `layers` filter) never had this bug — `midiPedalHeldNotes` is
    hardware-MIDI/file-CC-only by design (see its own header comment), so
    that path already called `stopNote()` unconditionally on every release
    regardless of pedal state.
- **2026-08-29 (second) — full visual-performance audit: desktop/Mac ran
  hot (high CPU/GPU, overheat risk) while mobile stayed normal, all 4
  engines. User's own hypothesis was a mobile-vs-desktop implementation
  split; the real root cause turned out to be structural rather than
  platform-conditional code, found via direct code inspection (no
  hypothesis taken on faith):**
  - **The adaptive performance governor (`perfGovScale`) is reactive to
    FRAME TIME only**, never to physical screen/canvas size. It descends
    only after several consecutive slow-frame windows and only toggles
    `body.perf-lite` below a 0.78 threshold. A desktop/Mac GPU strong
    enough to hold 60fps simply never trips it — even while burning far
    more absolute wattage than a phone doing the same visual work — while
    a weaker mobile GPU naturally trips it and gets relief. This is very
    likely why the user saw "normal on mobile, overheating on desktop":
    the one throttle in the system only reacts to a symptom (dropped
    frames) a fast GPU never exhibits, not to the actual cost driver
    (physical pixel fill-rate).
  - **`GRAPHIC_PROFILES[tier].dustMax`/`.fallingMax` were 100% dead
    code**, confirmed via exhaustive grep — declared per-tier
    (potato/medium/high/default) but never read by any consumer. Particle
    and falling-note counts were therefore effectively unbounded on
    `default` (the only tier virtually all users are on — only
    potato/default are user-selectable; medium/high have no UI entry
    point), limited only by the fixed 4096-slot dust ring buffer and
    passive dead-entry compaction (`falling.length > 40` only ever
    removed already-dead notes, never capped the live count).
    `getPressureScale()` was a second, separate dead-code lever — fully
    implemented (0.34-1.0 scale from perf pressure level) but never
    called anywhere.
  - **No area/DPR-aware density scaling existed anywhere.** GPU fill-rate
    cost scales with canvas AREA (css width × height × dpr²), not DPR
    alone — a desktop/Retina display has roughly 3-19x the physical
    pixels of a phone (verified with a standalone Node sanity check
    across realistic device sizes) yet rendered the exact same
    particle/falling-note density, multiplying absolute GPU cost by that
    same factor for zero visual benefit at typical viewing distance.
  - **`.perf-lite`'s blast radius was too narrow to matter even when the
    governor did engage**: it only dampened piano-key glow. Strike
    Line's 4 always-animating blurred aura layers plus its 6-layer neon
    box-shadow — the single most expensive always-on visual system —
    were completely unaffected by governor pressure.
  - **Ruled out, checked directly rather than assumed**: WebGL context
    options (`initGlParticles()`) have no `powerPreference` set, so a
    forced-discrete-GPU explanation doesn't hold; there is only one
    `requestAnimationFrame` loop (`anim()`) driving falling notes +
    particles + governor tick, so duplicate-loop cost-stacking isn't the
    cause either; `@media (pointer:coarse)` CSS blocks exist in all 4
    stylesheets but only make mobile cheaper (simpler blur/shadow) — they
    don't explain desktop being more expensive than a sane baseline, so
    they're not the primary asymmetry. `ctx2d = canvas.getContext('2d',
    {alpha:true})` was a candidate but deliberately left alone:
    `#app.has-custom-bg .stage{background:transparent}` is a genuine
    feature (custom background image/video showing through the stage)
    that depends on true canvas alpha — flipping to `alpha:false` would
    break it.
  - **Fixes, applied identically to all 4 engine JS + CSS files** (byte-
    identical target blocks confirmed before editing, same discipline as
    every other "applies 4x" entry in this file):
    1. New `getCanvasPixelBudgetScale()` (physical-pixel-area-based
       density scale, floor 0.28, cap 1.0) — reference area is a
       phone-sized viewport (390×844 @2x DPR); floored so a huge display
       never fully collapses the effect, capped so a small screen never
       gets a density *boost*.
    2. `spawnNeonDust()` now multiplies emission count by this area scale
       AND enforces a real cap derived from `dustMax` on live particle
       count — previously only the fixed 4096-slot ring buffer bounded
       it at all.
    3. `anim()`'s falling-note handling now enforces a real cap derived
       from `fallingMax` on live note count, culling only already-
       released (non-growing) notes first, so a currently-held note's
       visuals are never affected — only the trailing fade-out tail
       thins under pressure, keeping piano responsiveness untouched.
    4. `.perf-lite` CSS expanded to give the reactive governor real teeth
       against Strike Line specifically: box-shadow ring reduction,
       narrower blur radius on the aura pseudo-elements, and one of the
       three always-animating wave-crest layers (`.sl-wave-b`) hidden
       outright. Verified (grep line numbers, all 4 CSS files) that this
       new rule sits BEFORE the pre-existing
       `.strikeLine-multiColor{box-shadow:none!important}` override, so
       Gradient/Rainbow/Split colour mode still correctly wins the
       cascade when both classes are active simultaneously.
  - **Verified**: `node --check` passed on all 4 JS files; CSS
    brace-balance (`{`/`}` count match) passed on all 4 CSS files; full
    `node scripts/build.js` completed successfully, and
    `getCanvasPixelBudgetScale` was grep-confirmed present in all 4
    regenerated `.min.js` files (1 definition + call sites, matching
    source); the area-scale math itself was sanity-checked standalone
    (phone reference → 1.0, MacBook Retina 1440×900@2x → ~0.42, large/4K
    desktop → floors at 0.28) confirming monotonic, sane behaviour with
    no boost above 1.0. No live FPS/wattage measurement was performed
    this session (unlike the 2026-07-20 Strike Line rewrite's CDP-
    throttled benchmark below) — this is a structural/dead-code-driven
    fix, not a re-tuned constant, so confidence rests on the cap logic
    now actually being enforced (previously it plainly wasn't) rather
    than a before/after FPS delta; worth a real device measurement if
    the user reports it didn't help enough.
- **2026-08-29 — Chord Detector engine (`matchChords()`/`CHORD_DB`,
  present in all 4 engines) revised: fixed a foreign-bass-note
  misdetection bug (Cm/D read as Cmadd9/D), resolved an ambiguous slash-
  chord case (G-major-triad-over-F-bass) by generating both readings and
  letting the existing `chordScore()` scorer rank the more complete
  pattern as primary rather than hardcoding a preference, added 5 new
  chord types, and fixed one chord-name typo. Full technical writeup and
  test evidence live in `contexts/multiplayer.md`'s 2026-08-29 entry
  (chosen as the canonical location since multiplayer's copy was audited
  first) — applies identically to solo/visualizer/learn-song's copies
  too, confirmed via `node --check` on all 4 files and a byte-for-byte
  identical set of edits in each.
- **2026-08-03 (sixth) — vertical-axis Gradient lag audited and fixed for
  'single'/'solid' Style, all 4 engines (`drawFallingNote`) plus the
  file-playback chart (`drawVizFallRect`, Visualizer + Learn Song) —
  user-reported "lag parah" (severe lag) across every Style, explicitly
  asked to keep the colour-transition animation looking exactly the same.**
  - **Audit — why every Style lags under Vertical, not just some**:
    `drawVizFalling`'s `axisNeedsLiveY = fallingNoteColorMode === 'gradient'
    && gradientAxis !== 'horizontal'` permanently forces the expensive
    per-note-per-frame direct-draw path (`_vizDrawFallingDirect`) instead of
    the cheap tile-cache blit every other mode uses — correctly so:
    Horizontal's colour is a pure function of pitch (bake once, reuse
    forever), Vertical's is a function of the note's *live on-screen Y*, so
    a tile baked once at one scroll position would freeze every note's
    colour at bake-time instead of it sweeping as the note falls. Measured
    with a real dense-chord benchmark (42 overlapping notes loaded via the
    actual `sessionStorage` handoff + Play button, `requestAnimationFrame`
    wrapped to time each callback): Vertical costs 1.14x-2.07x more JS time
    per frame than Horizontal across all 5 Styles — confirms the direct-
    draw path itself, not any one Style, is the structural cost.
  - **A tried-and-rejected idea, in case it comes up again**: composing one
    canvas-wide gradient overlay on top of shape-only tiles via
    `globalCompositeOperation:'source-in'` would make Vertical as cheap as
    Horizontal, but would flatten Glass/Midnight/Batik's baked internal
    shading (highlight streak, glow-up, pattern) to one flat hue per pixel-
    column, since `source-in` replaces colour entirely wherever the
    destination has alpha — a real visual downgrade for those three
    Styles. Rejected once this was worked through with the user; not
    implemented.
  - **Root cause of 'solid' being the worst offender specifically**:
    'solid'/'single' bakes its 2-stop gradient into a cached sprite via
    `getGradientSprite`, keyed on both endpoint colours (`rgbA`/`rgbB`) —
    but under Vertical those two colours are each a function of the note's
    *live on-screen Y* (`fallingNoteAccentColors(midi, topY, h)`), so they
    both drift continuously as the note falls. That makes 'solid's cache
    key space roughly the *square* of a flat-colour style's (two
    independently-drifting quantized colours instead of one), so it thrashes
    far harder — confirmed empirically as the worst offender by a wide
    margin (2.07x slower than Horizontal, with a 61ms single-frame spike,
    vs 1.14-1.7x for outline/midnight/glass/batik in the same benchmark).
  - **Fix**: when there's no Glow halo to pre-bake (`notePadFor('solid') <=
    0.5` — Glow is opt-in and off by default), skip `getGradientSprite`
    entirely and paint the identical 2-stop `ctx.createLinearGradient`
    straight onto the live canvas instead of baking+caching+`drawImage`-ing
    a bitmap. A cache only pays off when a key gets reused; under Vertical
    it almost never does, so every "cache hit or miss" was actually always
    a miss paying the full off-screen-canvas + gradient-fill bake cost —
    removing the middleman is strictly cheaper AND removes the churn.
    Glow's case (needs the pre-baked halo) is untouched, still uses the
    sprite path exactly as before. Outline already worked this way (draws
    live, never cached) and was correspondingly the least-regressed Style
    in the audit — this brings 'solid' in line with it.
  - **Verified two ways**: (1) pixel sampling — rendered the same gradient
    note with the old sprite-cached code and the new live-draw code side by
    side (reverted the fix, rebuilt, sampled, restored, rebuilt, sampled
    again) and confirmed byte-identical RGB at every sampled point; the old
    sprite path was actually baked at a *quantized* size bucket then
    stretched via `drawImage` to the note's real size, so if anything the
    new path is marginally more precise (no stretch), never less. (2) the
    same dense-chord (42 overlapping notes) benchmark as the audit: 'solid'
    Vertical/Horizontal ratio dropped from 2.07x to 1.46x, and the worst-
    frame spike dropped from 61ms to 27ms. midnight/glass/batik are
    untouched (they still need their sprite genuinely pre-baked — clip +
    gradient/pattern fill + optional halo is real per-frame cost if done
    live, unlike a flat 2-stop gradient) — a `_SPRITE_CACHE_MAX` bump
    (320→640) was tried for those three but showed no consistent
    improvement in repeat runs (noise-level differences either way), so it
    was reverted rather than spending 2x the sprite-cache memory for an
    unproven win.
  - Applied identically to all 4 `drawFallingNote` copies (solo,
    multiplayer, visualizer, learn-song) and both `drawVizFallRect` copies
    (visualizer, learn-song) — same bug, same fix, same verification logic
    everywhere it appears.
- **2026-08-03 (fifth) — file-playback falling notes (Visualizer + Learn
  Song's `vizNotes`/`lsNotes` chart renderer) popped into existence at a
  fixed height instead of growing in continuously as they crossed the top
  edge — user-reported via video, most visible with vertical-axis Gradient
  (which permanently disables the tile-cache path, see the entry below, so
  every note in that mode always hits this).**
  - **Root cause**: `drawVizFallRect(nt, topY, bottomY, ...)`'s min-height
    floor — `let h = Math.max(MIN_NOTE_HEIGHT, bottomY - topY);` — never
    repositioned `topY` to match once the floor kicked in. Its callers
    (`_vizDrawFallingDirect`, the tile path's long-note loop, and the pulse
    overlay) additionally pre-clamped `topY` to `Math.max(0, topY)` *before*
    calling it, throwing away how far above the visible canvas the note's
    true top actually was. Net effect: for the first `MIN_NOTE_HEIGHT`
    pixels of a note's true visible span (i.e. `bottomY` between 0 and
    `MIN_NOTE_HEIGHT`), `h` got floored to `MIN_NOTE_HEIGHT` but `topY`
    stayed at the stale clamped `0` — the rectangle jumped straight to
    `[0, MIN_NOTE_HEIGHT]` the instant `bottomY` first went non-negative,
    instead of growing `[0,1], [0,2], … [0,MIN_NOTE_HEIGHT]` like every
    other frame already does once past that window.
  - **Fix**: added `topY = bottomY - h;` right after the floor computation
    inside `drawVizFallRect` (anchoring at the bottom, i.e. the note's
    onset/strike point — matches how the existing Impact Pulse growth
    already anchors), and loosened the 3 call-site clamps in visualizer.js
    (`_vizDrawFallingDirect`, the tile path's long-note loop,
    `_vizDrawPulseOverlay`) and 2 in learn-song-engine.js
    (`_vizDrawFallingDirect`, its long-note loop) from `Math.max(0, topY)`
    to `Math.max(-MIN_NOTE_HEIGHT, topY)`. Verified by hand that
    `topY_final = min(topY_param, bottomY - MIN_NOTE_HEIGHT)` for both old
    and new call-site clamps once the internal reassignment is in place —
    the call-site change turned out to be redundant-but-harmless once the
    internal anchor fix is present (either clamp alone produces the same
    correct visible pixels), kept anyway since it also bounds `h` for very
    long notes without relying on that reassignment alone.
  - **Verified two ways**: (1) mathematically, by hand, for the boundary
    cases (note crossing the top edge, and a naturally-short/staccato note
    already fully on-screen); (2) empirically end-to-end — loaded a real
    tiny synthesized MIDI file (one long note, delayed onset) into
    `visualizer-stage.html` via the exact `sessionStorage` handoff
    production uses, clicked the real Play button, and sampled the note's
    actual rendered pixel column over time. Pre-fix: `[0,0,0,0,0,14,14,14,
    14,14,14,14,15,18,...]` (a hard jump straight to 14 = `MIN_NOTE_HEIGHT`,
    the reported bug, reproduced on demand by reverting the fix). Post-fix:
    `[0,0,0,0,0,5,8,11,14,16,19,22,...]` (smooth, continuous growth, no
    jump). `drawVizFallRect`/`vizNotes`/etc. all live inside a large IIFE
    (`js/visualizer/visualizer.js:10119-11504`) with no external hooks, so
    this couldn't be unit-tested by calling the function directly — the
    real-file-plus-real-button-click approach was the only way to exercise
    it from outside.
  - Learn Song's copy of this code (`js/visualizer/learn-song-engine.js`)
    has the byte-identical bug pattern and got the identical fix; its own
    "note-gated practice" mode (`window.__lsConsumedFloorMs`) made an
    equivalent live end-to-end re-test awkward to script (the Play button
    there interacts with practice-mode note consumption, not a plain
    timer), so that file's fix rests on the code being textually identical
    to visualizer.js's already-verified fix rather than its own live replay.
- **2026-08-03 (fourth) — Auto Split MIDI showed a confusing 3rd colour
  ("Note Color" alongside its own Left/Right), and live-played notes never
  matched the chart's per-hand layer colouring — both Visualizer and Learn
  Song only, user-reported.**
  - **"3 colours" root cause**: `updateFallingNoteStyleControls`'s
    `showColor` visibility flag (which row shows the flat single "Note
    Color" picker) only checked `fallingNoteColorMode === 'single' &&
    !fallingNoteColorSplit` — never `vizLayersActive()`/`lsLayersActive()`
    (Auto Split MIDI's "real file layers detected" state). Turning on Auto
    Split MIDI doesn't change Colour Mode away from `'single'`, so the
    Note Color row stayed visible and looked like a 3rd, independent
    colour next to Left/Right even though it has zero effect on the
    actual falling notes once layers are active (chart notes already
    resolve their colour via `_vizNoteLayerHex`, which takes priority).
    Fixed by adding `&& !layersActive` to `showColor`. The Black/White Key
    Shade row was deliberately left showing in this state — unlike Note
    Color, Key Shade *does* still compose with layer colours (see
    `_vizNoteLayerHex`'s own shading branch), so hiding it would have been
    wrong.
  - **Real second bug, not just a UI nit**: `getFallingNoteBaseColorForMidi`
    — used for LIVE-played notes (`addFallingNote`, the bottom-to-top
    grow-bar that appears while a key is actually held) — never
    referenced `_vizNoteLayerHex`/layer colours at all, only the flat
    single/double/gradient/rainbow chain. Only the top-to-bottom "chart"
    renderer (pre-scheduled notes from the loaded file, drawn via the
    separate roll/tile renderer around `_vizNoteLayerHex`) ever prioritised
    a note's real per-track/channel `layer` tag. So with Auto Split MIDI
    on, notes falling from the file showed correct Left/Right hand
    colours while notes you actually played showed the plain flat Note
    Color instead — reads exactly like "two different settings," which is
    what the user reported. `assignVizLayers` (the file-load-time layer
    tagger) has two tiers: real track/channel groups (which a live
    keystroke has no way to be matched against — no track/channel tag
    exists for user input) and, for single-track files, a 2-means
    pitch-split fallback (`ev.layer = ev.note >= split ? 0 : 1`) — that
    split point *is* something a live note's raw MIDI number can be
    checked against. Added `vizLayerPitchSplit`/`lsLayerPitchSplit`
    (`null` unless the 2-means branch ran) and
    `vizLiveLayerColorForMidi`/`lsLiveLayerColorForMidi(midi)`, consulted
    first in `getFallingNoteBaseColorForMidi` — matches the chart's colour
    (including Key Shade composition, same as `_vizNoteLayerHex`) for the
    common single-track "Auto Split MIDI split my one hand-written track
    into two hands" case. The rarer real multi-track/channel case is left
    as before (live notes keep the flat Note Color) since there's no
    signal to guess which of up to 8 file tracks a live keystroke would
    belong to — an honest limitation, not a bug.
  - Verified with a headless Playwright check against both
    `visualizer-stage.html` and `learn-song-stage.html` (seeding
    `sessionStorage`'s handoff keys so `vizCheckSession`/`lsCheckSession`
    don't bounce the page back to the picker when they find no real song
    loaded): with a simulated 2-layer pitch split at MIDI 60, a live note
    at 72 resolved to `vizLayerColor(0)`/`lsLayerColor(0)` (matching the
    chart exactly), a live note at 48 resolved to slot 1, a black key on
    slot 0 shaded identically to `shadeBlackKeyHex(vizLayerColor(0))`, the
    Note Color row hid while layered and reappeared once layers dropped to
    0, and the live-note fallback correctly reverted to the flat
    `cachedFallingNoteColor` once Auto Split MIDI had nothing to split.
- **2026-08-03 (third) — vertical-axis Gradient mode never actually
  gradiented a note's own body for any Style except Default/Solid,
  user-reported.** Two distinct, now-fixed bugs plus one honestly
  unfixed-this-session gap:
  - **Root cause**: `drawFallingNote` (and the file-playback equivalent,
    `drawVizFallRect` in `visualizer.js`/`learn-song-engine.js`) computes
    a real per-note top/bottom colour pair (`f.accent` — `fallingNoteAccentColors`,
    unchanged, was always correct) but only the `'solid'`/`'single'` style
    branch ever consumed it, via `getGradientSprite`'s real
    `createLinearGradient`. Every other style (`outline`, `midnight`,
    `glass`, `batik`) called `getEffectSprite(drawStyle, rgb, ...)` with
    only `rgb` — a single point-sample from `f.base` — so those styles
    showed one flat colour per note, never a real top-to-bottom blend.
    Confirmed by the user's own test (hold a note, Blue->White vertical
    gradient, non-Default style): "awal muncul biru tiba-tiba putih"
    instead of a smooth top-white/bottom-blue note.
  - **Fixed: `outline` style now gets a real 2-stop gradient stroke** from
    `f.accent` (`ctx2d.createLinearGradient`/`ctx.createLinearGradient`),
    same colours `'solid'` already bakes into its sprite — zero caching
    cost since `outline` already draws live on the canvas every frame, no
    sprite involved. Applied in both `drawFallingNote` (all 4 engines)
    and `drawVizFallRect` (visualizer.js/learn-song-engine.js's separate
    file-playback renderer — same bug, same fix, doubling the edit
    surface to 6 call sites instead of 4). **Verified by direct pixel
    sampling, not just code review**: rendered a synthetic note with a
    known Blue->White accent pair and read back canvas pixels near the
    stroke's top vs bottom — top read `[5,138,255]` against a computed
    `rgbA` of `[1,136,255]`, bottom read `[64,168,255]` against `rgbB`
    `[67,169,255]` (the few-unit gap is antialiasing) — the stroke is
    provably the real gradient, not a flat colour.
  - **Improved, not fully fixed: `midnight`/`glass`/`batik`.** These are
    baked, cached sprites (`getEffectSprite`) — giving them a true
    per-pixel gradient means baking two-colour variants into whatever
    texture/glow compositing each already does, which is a real rework
    of their sprite pipeline, not attempted this session (risk of
    breaking existing glow/halo compositing without being able to
    visually verify the result). What WAS done: `VERTICAL_SWEEP_BUCKETS`
    doubled 48 -> 96, halving the step size of the colour "snap" these
    styles still show as a note crosses into a new quantized band — this
    measurably softens the "tiba-tiba" jump complaint (bug 1) but does
    **not** make one held/static note show a true internal top/bottom
    blend (bug 2 for these three styles specifically remains). Kept
    conservative (2x, not more) because this constant directly multiplies
    the sprite cache's (colour-band x height-bucket) key space for these
    styles — see `_SPRITE_CACHE_MAX`'s own comment (`visualizer.js`) on
    why that combinatorial pressure already forced one cache-size increase
    before; a bigger jump risked reintroducing the mobile-FPS cache-
    thrashing problem `VERTICAL_SWEEP_BUCKETS` was introduced to prevent
    in the first place.
  - **Known, not built**: a real fix for midnight/glass/batik would bake
    `getEffectSprite` variants keyed on a colour PAIR instead of one
    colour (or composite a live gradient-tinted overlay atop the existing
    baked sprite via `source-atop`) — flagging as the concrete next step,
    not guessing at it blind.
- **2026-08-03 (second) — `getDefaultPianoHeightPercent()` simplified to a
  flat, unconditional `return 40`, overriding the adaptive floor/ceiling
  added earlier the same day (140px floor for short desktop windows, 55%
  guard ceiling for short mobile landscape).** Explicit user call: default
  height must be exactly 40% on every device/mode/orientation, no
  exceptions — "harga mati 40%" ("40% is the fixed price," i.e. not up for
  adaptive negotiation). This is a deliberate simplification, not a
  reversion to the ORIGINAL pre-2026-08-03 bug: the earlier bug was the
  140px floor alone pushing mobile-landscape defaults to ~90%+ with no
  ceiling at all; a flat 40% has no floor to misbehave in the first place,
  so the short-viewport "squashed keybed" case the floor was trying to
  prevent is an accepted tradeoff now, not an oversight. Applied
  identically to all 4 engines (confirmed byte-identical before and after,
  same as every other fix in this file). Verified live across 6 viewport
  shapes (small/large mobile landscape, mobile portrait, tablet portrait,
  short desktop window, tall desktop monitor) — all six return exactly
  `40`, confirmed via `getDefaultPianoHeightPercent()` called directly in
  a real headless-browser page context on `solo.html`.
- **2026-08-03 — SoundFont cleanup, same session as the E-Piano addition
  below: `pfHarpsi` (Harpsichord) and `pfRhodes` (Rhodes EP) deleted
  outright, and the just-added `pfEPiano` slot renamed from "M1 E. Piano"
  to plain "E-Piano" — user call, before any release, so no live-user
  migration concern for either change.**
  - Deleted `soundfonts/pack/pfHarpsi.sf2` and `pfRhodes.sf2` (both
    FluidR3-sourced, split via `bin/split-sf2.js`) and their
    `SOUNDFONT_LABELS`/`SF_URLS` entries + picker buttons (main and
    layer) in all 4 engines/HTML files. Confirmed no other reference to
    either slot anywhere in the 4 engine files before deleting (grep for
    `pfHarpsi`/`pfRhodes` outside the two catalog objects came back
    empty) — the only place they existed was the catalog, so no
    migration path is needed for either: `normalizeInstrumentKey`/
    `normalizeStringInstrumentKey` already fall back to `grandPiano`/
    `strViolin` for any key `SF_URLS` doesn't recognize, so a saved
    setting from before this session referencing either slot degrades
    gracefully instead of erroring. `manifest.json`'s `fluidr3`
    attribution entry is untouched (still covers every remaining
    FluidR3-sourced slot, not deleted with these two).
  - `pfEPiano`'s display label changed to "E-Piano" everywhere (catalog
    + both picker buttons in all 4 HTML files) — the underlying `.sf2`
    file, its slot key, and its embedded phdr preset name ("M1 E.
    Piano") are unchanged, only what the app shows the player changed.
  - Verified live the same way as the addition: headless-browser catalog
    check on `solo.html` confirms `getSoundfontName('pfHarpsi'/
    'pfRhodes')` now falls through to the generic `'SoundFont'` label
    (proof the entries are gone, not just relabeled), both picker
    buttons for each are absent from the DOM, `pfEPiano` reads
    "E-Piano" in both the catalog and its two picker buttons, and the
    real `pfEPiano.sf2` still parses to a full 88-note map with zero
    errors (file itself untouched by this change).
- **2026-08-02 (second) — SoundFont revision: new "M1 E. Piano" slot,
  Stage Piano's audio replaced, both user-sourced (Google Drive).**
  - **New slot `pfEPiano`** (`soundfonts/pack/pfEPiano.sf2`, 9.16 MB,
    single bank-0/preset-0 preset, embedded phdr name "M1 E. Piano" — a
    Korg M1-style electric piano, built with Extreme Sample Converter,
    same tool as the pre-2026-08-02 Stage Piano file). Added to the
    "Piano" category in every catalog, right after Harpsichord (last
    piano-category slot).
  - **`stagePiano` slot's audio replaced in place** (12.86 MB, was
    38.49 MB) — same treatment as the 2026-07-20 `sal1`/Concert Grand
    swap: slot key and display label ("Stage Piano") both stay
    unchanged, only the underlying `.sf2` bytes changed, so **no catalog
    or picker-button edits were needed for this half** — just the file
    swap + `manifest.json`'s `sizeBytes`/attribution. The new file is
    actually better-documented than the one it replaces: real author
    (Aleksei Doroshko / SoundZone.INFO), a creation date, and a named
    repackaging tool (Spessa), vs. the old file's bare "internal preset
    name 'Worship Piano'" with no author info at all. Still gray-area
    license (no usage terms stated), same bucket as `softPiano`/
    `grandPiano`/`salamander` — **not** added to `about.html`'s public
    credits blurb, which deliberately only names the MIT/CC0/CC BY
    sources (matching how the old Salamander gray-area claim was
    already removed from that blurb 2026-07-20).
  - **Changed in all 4 engines** (`solo-piano.js`, `multiplayer-piano.js`,
    `visualizer.js`, `learn-song-engine.js` — confirmed byte-identical in
    the `SOUNDFONT_LABELS`/`SF_URLS` region both before and after, same
    verification pattern as every other "applies 4x" fix in this file)
    and **all 4 picker HTML files** (`solo.html`, `multiplayer.html`,
    `visualizer-stage.html`, `learn-song-stage.html` — per the
    2026-07-17 warning further down, the picker markup is maintained
    independently of the JS catalog and does NOT update itself; added
    the `mainPfEPiano`/`layerPfEPiano` buttons to each file's Piano
    category by hand, both Main and Layer sections).
  - **The multiplayer per-player info modal needed no code changes**,
    same as every previous soundfont catalog change documented in this
    file: `playerMainInstrumentText`/`playerLayerInstrumentText` →
    `instrumentLabel`/`stringInstrumentLabel` → `getSoundfontName` all
    resolve purely from `SOUNDFONT_LABELS`/`SF_URLS`, so a correct
    catalog entry is the whole fix. Verified directly (not just by
    reading the call chain): loaded `solo.html` in a real headless
    browser and confirmed `getSoundfontName('pfEPiano')` → `"M1 E.
    Piano"`, `getSoundfontName('stagePiano')` → `"Stage Piano"`
    (unchanged), both picker buttons present, and — the strongest check —
    actually ran both new `.sf2` files through the real production
    parser (`window.PapianoSF2.buildBufferMap`, the same code path the
    engines use) and got a full 88-note map back for each, zero
    JS errors. **Could not run the same live check against
    `multiplayer.html` in this sandbox** — it redirects to a sign-in
    gate with no real Cognito session available here (same limitation
    hit verifying the mobile piano-height fix above). Confidence rests
    on the confirmed byte-identical JS catalog and the confirmed-present
    HTML buttons, not a multiplayer-specific live run — worth a real
    multiplayer session check if this ever regresses.
- **Superseded 2026-08-03 (second, above) — the floor/ceiling mechanism
  this entry describes no longer exists in the code.** `getDefaultPianoHeightPercent()`
  is now a flat `return 40` on user's explicit instruction. Left the
  original writeup below intact since the root-cause diagnosis (why the
  140px floor misbehaved on mobile landscape) is still accurate history —
  just don't expect to find `guardCeilPercent`/`minPxPercent` in the
  current source.
- **2026-08-02 — mobile landscape defaulted the piano to ~90%+ height,
  user-reported across all 4 engines.** `getDefaultPianoHeightPercent()`
  (byte-identical in all 4 files — see the note below on why fixes here
  need applying 4x) is `40%` of `getPianoMaxHeightPx()`
  (`floor(visualViewport.height * 0.50)`), with a 140px floor added so a
  short DESKTOP window (docked/un-maximized, comment's own words) doesn't
  get an uncomfortably squashed keybed. That floor had no ceiling of its
  own — only a 210px absolute ceiling, which only ever binds on TALL
  viewports (it's a *large* percentage of a *short* one, so it never
  caught this). On mobile landscape, `visualViewport.height` is small for
  a completely different reason (device height, not a docked window), so
  the 140px floor alone landed around 80-95% depending on device —
  confirmed live in a headless browser at an 844×340 viewport (iPhone-
  landscape-ish): 82% pre-fix, matching the user's "~90%" report. Added a
  55%-of-max hard percentage ceiling alongside the existing 210px one
  (`Math.min(pct, pxCeiling, 55)`) — chosen so it doesn't bind on the
  short-desktop-window case the floor was actually written for (a
  ~500px-tall window still lands at 55%, one point off its unguarded 56%)
  but caps mobile landscape at a piano that's big without eating the
  whole screen. Verified: the same 844×340 case now returns 55% instead
  of 82%; normal portrait/tall-desktop viewports are unchanged at 40%
  (floor never binds there either way).
  - Applied identically to all 4 copies (`js/solo/solo-piano.js`,
    `js/multiplayer/multiplayer-piano.js`, `js/visualizer/visualizer.js`,
    `js/visualizer/learn-song-engine.js`) — confirmed byte-identical
    before and after via md5sum of the function body. Verified live via
    Playwright against `solo.html` at the same 844×340 viewport (55%,
    matching the pure-math check); could not get the same live check
    working against `visualizer-stage.html`/`learn-song-stage.html`/
    `multiplayer.html` in this sandboxed headless run (they navigate away
    before the piano boots, most likely their auth/AppSync calls failing
    with no real backend reachable from the test box — unrelated to this
    fix). Confidence rests on the byte-identical hash match plus
    `node --check` + a clean `scripts/check-min-sync.js` on all 4 .min.js
    outputs, not a live check on those three specifically — worth a real
    device check on visualizer/learn-song/multiplayer if this regresses.
- **2026-07-26: 11 keys were unplayable from QWERTY because the browser ate
  the shortcut.** `QWERTY_LABEL_MAP` reaches 88 keys by adding a third
  modifier: plain = white keys in C2-C7, Shift = black keys in C2-C7, Ctrl =
  everything outside. The Ctrl tier came from a Roblox piano, where it is
  fine — a game client has no tabs. In a browser it is not: measured in a
  real windowed Chromium driven by X11 key events (**not** headless, and not
  Playwright's `keyboard.press`, both of which inject past the browser's own
  accelerators and will report a false pass), `Ctrl+W` closed the tab and
  `Ctrl+T` opened one, with the page never receiving a `keydown` at all.
  `preventDefault()` cannot help; the event never arrives.
  Of the 27 Ctrl bindings, **11 were stolen**: W R T P A S D F G H J. Ctrl
  plus the digits survived, re-checked with 10 tabs open in case tab-switching
  claimed them.
  Those 11 now sit on the 11 Shift slots that were free — `S+3`, `S+7`, `S+0`
  (no black key at those positions) and `S+R S+U S+A S+F S+K S+X S+N S+M`
  (letters with no black key above them). The count matching exactly is
  luck, but it means no third modifier and no lost keys:
  G#1 A#1 B1 and F7-C8 are reachable again, verified 11/11 sounding the right
  MIDI note in the same real browser.
  **Consequence to keep in mind:** "Shift = the black key above" is no longer
  universal — for those 11 it means "extreme range" instead. That
  inconsistency was accepted over leaving 11 keys silent. The 61-key C2-C7
  core is untouched, so every Virtual Piano / Roblox sheet still plays
  identically.
  All four engines carry the map; it stayed byte-identical across them
  (md5 `d351b0f48b1a` -> `5519b86fd196`). `guide.html`'s printed key table is
  regenerated from the map, and
  `js/qwertysheet/midi-to-qwerty.test.js` now fails if any key is ever bound
  to one of those 11 stolen combos again.
- **2026-07-26: the strike line was genuinely brighter in solo/multiplayer
  than in visualizer/learn-song at identical settings.** Reported as "kaya
  sedikit beda", and it was. Three separate divergences, all in the
  solo/multiplayer pair:
  1. Their four aura alphas (`smokeAlphaA/B`, `shadowAlphaA/B`) each carried
     an extra `* intensity` factor the other two engines do not have, and
     `intensity = sliderRatio(strikeLineBrightness) * 2`, i.e. **2.0 at the
     default Brightness 100**. Measured at aura 80 / brightness 100:
     `--strike-line-smoke-a` was `rgba(0,176,255,0.82)` in solo and
     multiplayer against `rgba(0,176,255,0.432)` in visualizer and
     learn-song — the aura was ~1.9x denser. Aligned **down** to the
     visualizer form: Brightness already drives the line's own colour and
     halo, and Aura Height is the aura's own control, so multiplying the
     haze by Brightness as well was double-counting.
  2. The Aura off switch was dead. Solo and multiplayer toggled a body class
     named `strikeLine-smoke-off` (camelCase) while all four stylesheets only
     ever match `strike-line-smoke-off` (hyphenated, 5 rules each) — so the
     toggle could never hide anything. Same class of bug as the `strikeLine-off`
     one already recorded for 2026-07-17; when adding a body-class toggle here,
     grep the CSS for the literal string rather than trusting the JS name.
  3. `strikeLineColor` / `strikeLineLeftColor` / `strikeLineRightColor`
     defaulted to `#ffffff` in solo and `#0099ff` in the other three, so a
     fresh solo profile drew a white line where every other mode drew blue.
     Solo now starts at `#0099ff` too.
  After the fix all four report identical `--strike-line-smoke-a`
  (`rgba(0,176,255,0.432)`), identical `-smoke-b` (`0.272`) and identical
  `lineColor` (`#0099ff`), and the off switch flips
  `#strikeLineAuraSegments::before` from `display:block` to `display:none` in
  all four. Note when re-testing: `setStrikeLineFx()` has no `'smoke'` branch —
  there is no setter for `strikeLineSmokeEnabled` outside the preset-restore
  map, so a probe must assign the global and call the engine's own update
  function, which is named `updateStrikeLineLine()` in solo/multiplayer and
  `updateStrikeLine()` in visualizer/learn-song.
- **2026-07-26: Glow/Neon did not show on file-playback falling notes until
  the tiles happened to re-bake — Visualizer only.** `_vizRollSignature()`
  lists ~30 inputs that invalidate the roll tile cache, and
  `noteGlowEnabled`/`noteGlowIntensity` were not among them. Toggling Glow
  cleared the *sprite* cache but every already-baked tile kept its old note
  strips, so the change only appeared as those tiles scrolled off. Live key
  presses looked instant because `drawFallingNote()` never goes through a
  tile at all — that asymmetry is what the user reported. Visualizer-only
  because Learn Song forces the direct path (`__lsConsumedFloorMs` is always
  a number there) and solo/multiplayer have no tile renderer.
  Both fields are now in the signature. Measured on a 1536-note roll with
  the tiles settled, ink on the falling canvas after switching Glow on:
  **before — +0% at 150 ms and still +0% at 2400 ms; after — +101% at
  150 ms.** The same two lines were added to `learn-song-engine.js` to keep
  the copies from drifting, even though its tile path never runs.
- **2026-07-26: Strike Line Aura Height default is 80%**, not the 100% set
  earlier the same day (`let strikeLineAuraSize`, the `applyFactoryDefaults`
  call, all four `GRAPHIC_MODE_DEFAULTS` rows, and the markup on all four
  pages). Brightness stays 100%.

- **2026-07-26: the layer SoundFont now offers exactly what the main one does,
  at the same volume.** The layer picker was missing `grandPiano`,
  `stagePiano` and `atmosGrand` — the three that had "never been layer
  options" — so its list is now byte-identical to the main list (25 entries,
  asserted in the test rather than eyeballed). `stringVolume` moved 0.75 ->
  1.00, in the declaration, the factory reset and both slider markups.
  - Multiplayer's per-player instrument readout needed **no code change**:
    `getSoundfontName`/`instrumentLabel`/`stringInstrumentLabel` all derive
    from the shared `SF_URLS`/`SOUNDFONT_LABELS` catalog, and
    `normalizeStringInstrumentKey()` accepts any key present in `SF_URLS`, so
    the three new layer options resolve to "Grand Piano" / "Stage Piano" /
    "Atmos Grand" rather than the `strViolin` fallback. Verified by render,
    not assumed. Real-time push is unchanged: `applySuccess()` calls
    `syncInstrumentStateIfReady()` -> `PapianoMultiplayer.syncInstrument()`.
  - **Worth watching:** a user can now pick a big piano as BOTH layers —
    `stagePiano` is 38 MB and `grandPiano` 16.8 MB, so a Stage+Stage pairing
    downloads and decodes ~76 MB. Nothing caps that today.
- **2026-07-26: Batik jitters on the RISING note path unless the body is
  overdrawn.** `getEffectSprite` bakes at `hB = round(h/8)*8` and draws
  stretched to `h`, so a growing note's vertical scale swings between 0.955
  and 1.042, changing direction ~12 times per 48 px of growth (measured, not
  estimated). A solid or gradient fill hides that; a woven motif reads it as
  lag. `drawBatikBodyUnstretched()` overdraws the body from the cached tile at
  1:1, anchored to the note's **bottom** — the stable edge while a note grows
  — after the sprite has already supplied the Glow aura. Measured after:
  0.0 px of motif movement across a 65 -> 188 px growth, by column
  cross-correlation. Only the live/rising path does this; the top-down file
  path keeps a constant `h` while a note is fully on screen, so it never had
  the problem and pays nothing.

- **2026-07-26: four defaults moved, all 4 engines.** Main Reverb 0% -> 50%
  (`sfEffectSettings.sf1.reverb`, the factory-reset copy, and both slider
  markup values). Strike Line **Brightness** 70% -> 100% and **Aura Height**
  50% -> 100%, then Aura Height again to 80% (see the entry above) (the
  `let` declarations, the `applyFactoryDefaults` calls, the
  markup, and all four rows of `GRAPHIC_MODE_DEFAULTS` — that table is
  applied on every Graphics Quality switch, so leaving it at 55/80 would have
  silently undone the new defaults the moment anyone changed tier).
  Layer Reverb (`sf2`) is deliberately left at 0: the layer instrument is off
  by default, so it has nothing to reverberate. Note the Strike Line panel
  labels this control **Brightness**, while earlier notes in this file call
  the same thing "Intensity" — one control, `strikeLineBrightness`.

- **2026-07-26: Glow Intensity is presented as a plain 0-100% slider, and
  three materials refuse Glow outright.**
  - The slider used to run 0-200 with a default of 100, where 200 meant
    "double the normal bleed". It now runs **0-100 with a default of 100**,
    and 100% on screen is what 200% used to be. The internal
    `noteGlowIntensity` scale is deliberately **unchanged** (still 0-200):
    `NOTE_GLOW_MAX_PAD` is calibrated against it and saved presets store it,
    so rescaling the stored number would have silently changed every existing
    preset's look. Only the presentation halves — `setNoteGlowIntensity()`
    writes `n/2` into both sliders and both labels, the `input` listener
    multiplies back by 2, and `applyFactoryDefaults` now sets 200. The
    pre-existing legacy fallback for presets saved before the field existed
    (`s.noteGlowIntensity !== undefined ? … : 35`) is left at 35 for the same
    reason the `chordTextScale` fallback was left at 100 — it is old-preset
    compatibility, not a new-user default.
  - **`GLOWLESS_STYLES` = outline, midnight.** (Batik was in this list for a
    few hours on 2026-07-26 and was taken back out on the user's call — it
    takes Glow like Default and Glass do.) `notePadFor()` returns 0
    for them, so no aura is baked and the sprite draws with no pad; the sprite
    cache key's `glowB` component is zeroed too, so the same note doesn't
    occupy two cache slots depending on a Glow setting it ignores. The Glow
    toggle and both intensity rows (`rowNoteGlow`, `rowNoteGlowIntensity`,
    `rowSettingsNoteGlow`) are hidden while one of the three is selected.
    Reason: Outline is a hollow border and Midnight is a deliberately sunken
    column — a neon bleed reads as dirt on both.

- **2026-07-26: the Batik (Parang Rusak) falling-note material, added
  identically to all 4 engines.** (Liquid shipped alongside it the same day
  and was removed hours later — see the two entries about it below.) The
  button lives in BOTH pickers every page has (the Visual → Falling Notes
  subpage `#mBatik`, and the Settings quick-panel twin
  `[data-style-target="mBatik"]`). No other control belongs to it.
  - **Child theme**: hidden in both pickers via the same
    `body.theme-child #mOutline,...` rule each engine CSS already had, AND
    refused at render time — `resolveFallingNoteStyle`/`resolveAnimStyle`
    return `'single'` for batik whenever `pianoTheme === 'child'`, so a
    saved preset or a stale localStorage value can never paint it there.
    Switching to child theme also already resets Material to Default through
    the existing `setFallingNoteStyleById('mSingle')` in `setPianoTheme`.
  - **Why neither uses the obvious approach.** A first implementation drew
    both per note with `clip()` + a pattern fill, and Liquid with a per-note
    `globalCompositeOperation:'overlay'`. Measured on a 390x844 phone viewport
    at dpr2 under 4x CPU throttling with a 1536-note roll: **Batik 36% and
    Liquid 28% of the Default material's FPS** — nowhere near shippable. The
    per-note `clip()` and the per-note blend were the whole cost.
  - **Batik is a normal baked sprite.** It is a style branch inside
    `getEffectSprite`, so note rendering stays one cached `drawImage` like
    every other material. The expensive canting work happens once per
    (colour bucket, width bucket, dpr) in `_batikTileFor()`, which
    bakes a **seamless repeat tile**: one blade per `U` along the row and rows
    spaced the same `U` makes the 45-degree lattice square, so a `U*sqrt(2)`
    tile has no seam. The sprite bake just clips the rounded rect and fills
    from that tile's `CanvasPattern`, then stretches a cached sheen over it.
    The `hB` bucket is 8 CSS px, so the sprite stretch a long note gets is
    under ~2% — the earlier worry that a woven motif would smear was wrong.
  - **Liquid was shipped on 2026-07-26 and removed the same day** on the
    user's call. Worth knowing if it ever comes back: it rendered notes as
    plain solids and modulated them afterwards with ONE stage-wide
    `'source-atop'` pass over a translucent band texture, clipped to the
    notes' bounding box and dropped under frame-time pressure. Even so it
    measured ~59% of the Default material's FPS at 4x throttle, against
    Batik's 94% — a destination-wide blend is a genuine per-pixel cost that
    no amount of caching removes.
  - **Name collision, found on removal:** `LEGACY_STYLE` already retired an
    older material called `liquid` onto Glass. The new material reused that
    name, so both the live-setting migration and `resolveFallingNoteStyle`/
    `resolveAnimStyle` now resolve `'liquid'` to **Glass** as well — one
    name, one answer. Check `LEGACY_STYLE` before naming a new material.
  - **No ground option.** The cloth is always dyed the note's own colour, so
    Gradient/Rainbow keep saying which key a note belongs to; only the wax
    stays cream. A `batikGround` picker (note / sogan / indigo / ink, backed
    by `localStorage.papianoBatikGround`) shipped on 2026-07-26 and was
    removed the same day — on a fixed ground the note colour survived only as
    a 28% tint in the wax, which meant the colour modes stopped communicating
    pitch. Don't re-add it without solving that.

- **Changed 2026-07-24 — Papiano AI (`js/aichat/aichat.js`) no longer
  auto-resumes the last conversation on open.** Previously every
  `openOverlay()` call checked a `papiano_aichat_last_session` localStorage
  key and silently reopened that session if still present, per-device (not
  synced to the account) — user-reported UX concern: is it actually
  rational for an assistant that's mostly short, unrelated Q&A (not one
  long ongoing thread) to carry stale context into a new question just
  because it happened to be the last one open? Discussed and agreed:
  default to a fresh chat on every open instead, matching how ChatGPT's and
  Claude's own web apps behave (both open to a blank composer, never
  auto-resume) — past conversations stay one tap away in the sidebar,
  chosen deliberately rather than guessed. `refreshSessionsAndOpen()` now
  unconditionally calls `startNewChat()` before the session-list fetch
  resolves, and all `lastActiveKey`/localStorage read-write plumbing across
  `startNewChat`/`openSession`/the send-message re-key path was removed
  entirely (write-only once the read was gone). `startNewChat` gained a
  `skipSidebarRender` param so `refreshSessionsAndOpen`'s call doesn't
  repaint the sidebar with the *previous* open's stale `sessions` array one
  tick before the fresh list arrives — the sidebar's own "Loading chats…"
  placeholder stays up until the real fetch resolves.
- **2026-07-20 (later same day again): full "every visual system at max
  settings" performance audit — Falling Notes, Piano Keys, Particles, all 4
  engines** — requested after the Strike Line aura fix above, to check
  whether any other system had the same class of bug (cost scaling
  disproportionately with settings rather than with actual on-screen
  content). Used two parallel research agents (Falling Notes, Particles)
  plus direct investigation (Piano Keys); Strike Line already covered
  above.
  - **Falling Notes: clean.** Canvas-based (one `drawImage` per note per
    frame, no per-note DOM), sprite cache (`_spriteCache`) already has a
    real LRU with a 200-entry cap, and colour computation is quantized
    everywhere that matters (88 discrete MIDI notes for the horizontal
    gradient axis, `VERTICAL_SWEEP_BUCKETS = 48` for the vertical axis, 12
    fixed hexes for Rainbow) — Glow bakes into the sprite itself (no live
    `ctx.filter`), and the Glass material was already written to avoid a
    per-bake `filter:blur()` round-trip specifically because "glass bakes
    are frequent... under Gradient's many-colour set" (their words, already
    in the code). Outline/Midnight/Glass are reachable on the app's normal
    ("Default") tier, not gated behind some higher tier — this app only
    has two selectable tiers (Potato/Default), no separate Medium/High.
  - **Particles: one real fix applied, one accepted tradeoff left alone.**
    - **Fixed, all 4 engines:** `_dustSpriteCache` (the small 192×192 dust-
      grain sprite cache, `getDustSprite()`) had **no eviction at all** —
      unlike `_spriteCache`, which already had the LRU-with-cap pattern.
      Dragging the Gradient Hue slider while Particles → Follow Falling
      Notes → Gradient is on produces one new permanently-cached canvas
      per distinct integer hue touched in a session (bounded by hue's 0-360
      range, not literally unbounded, but never freed either). Gave it the
      exact same LRU pattern as `_spriteCache`/`_spriteUse`
      (`_dustSpriteUse`/`_dustSpriteUseCounter`/`_DUST_SPRITE_CACHE_MAX =
      200`, `_dustSpriteCacheGet`/`_dustSpriteCacheSet`), and added
      `_clearDustSpriteCache()` (clears both maps together, matching how
      `clearEffectSpriteCache()` already treats `_spriteCache`/`_spriteUse`
      as a pair) to replace the 8 bare `_dustSpriteCache.clear()` call
      sites per engine that were leaving `_dustSpriteUse` stale.
      - **Caught and fixed a self-inflicted bug while writing this**: a
        blanket find-and-replace of `_dustSpriteCache.clear();` →
        `_clearDustSpriteCache();`, run AFTER the new function already
        existed, matched the literal `.clear()` call *inside
        `_clearDustSpriteCache()`'s own body* and rewrote it into a
        self-call — infinite recursion the instant the cache was ever
        cleared. Caught by grepping the function body before moving on,
        not by trusting the edit succeeded. Fixed by doing the blanket
        replace *before* inserting the new function for the other 3
        engines, and by always re-reading a scripted edit's actual output
        rather than assuming a clean "patched" print means the content is
        correct.
    - **Confirmed NOT a bug, left alone:** the particle pool itself is a
      fixed `Float32Array` sized `NEON_DUST_MAX = 4096` with an O(1)
      ring-buffer/steal-cursor allocator (`_allocDustSlot`) — the Particle
      Count slider (max 50) only scales spawn *rate*, never array size, so
      there's no slider-vs-buffer bounds mismatch to worry about. The
      `dustColorFollowFallingNotes` Gradient/Rainbow path already uses one
      representative colour per side (`gradientColorForMidi(64)`), computed
      once per frame, not per particle — this was a prior-session claim,
      re-verified accurate. WebGL particles are gated purely by device
      capability (`initGlParticles()` success), not by graphics tier, so
      "max settings" always gets the fast path when available.
    - **Found, deliberately NOT touched:** Gradient/Rainbow Strike-Reaction
      flares issue one GL draw call per currently-held key instead of
      batching them (`renderGlParticles`'s flare branch) — genuinely
      O(held-keys) instead of the O(1) the dust-grain batch achieves, but
      the code's own comment already reasons about and accepts this
      ("bounded by concurrently-held keys, so still cheap in practice") —
      realistic hand/pedal note counts (tens, not thousands) make each
      extra 5-point draw call trivial. Not the same class of bug as Strike
      Line's old 26-layer blur/blend stack; left as the already-considered
      tradeoff it is rather than adding batching complexity for no
      measurable gain.
  - **Piano Keys: no fix needed**, including checking whether *this
    session's own* `.active-key-light` `mix-blend-mode:screen` addition
    (see the entry below) could compound under a big held chord the same
    way Strike Line's per-segment blend-mode did. It can't in practice:
    the overlay pieces already come from a pool (`_overlayFreePool`, no
    create/remove churn), and `shouldUseLightKeyVisual()` already drops to
    the cheap real-key-element `.active` fill once
    `getPerfPressureLevel() >= 3 && activeOverlayNotes.size >= 18` — and
    that governor is a genuinely *measured* adaptive signal
    (`perfGovScale`, adjusted from real frame-time streaks), not a static
    heuristic, and is live on mobile (only force-disabled on
    `default`-tier **desktop**, which has the headroom to not need it —
    see `js/solo/solo-piano.js:1531`). So any extra per-piece cost from
    the mix-blend-mode change is self-corrected by an already-existing,
    already-adaptive mechanism, on the platform where it'd actually matter.
  - **Investigated and rejected as not worth fixing:** the Falling Notes
    research agent flagged that `js/visualizer/visualizer.js`'s
    `drawVizFallRect()` (and `learn-song-engine.js`'s equivalent) has no
    `f._recolorKey`-style memoization guard the way solo's live-input
    `drawFallingNote()` does, so it recomputes gradient accent colours
    every time it's called. Looked closer before acting on this: both
    files sit behind a "Tiled piano-roll renderer" (the big comment block
    right above `_vizRenderTile`/its ls-equivalent) that pre-bakes the
    whole song's falling notes into up to `VIZ_TILE_CACHE_MAX = 4` reusable
    screen-tall canvas tiles — in steady-state playback each frame just
    blits the 1-2 currently-visible tiles, and `drawVizFallRect` only
    actually runs once per note when a tile is first baked (cache miss) or
    during the brief "scene settling" window right after an interaction
    (resize/swipe/setting drag), per that system's own comment. This tile
    cache is a *much* stronger optimization than per-note memoization would
    add, and already absorbs the exact "dense transcribed MIDI, many
    simultaneous notes" scenario this whole audit chain started from.
    Adding recolorKey caching on top would be real but low-value —
    skipped, per the "don't add complexity beyond what's needed" rule.
- **2026-07-20 (later same day, after a different session's Strike Line
  aura rewrite landed on `main`): audited that rewrite** (commits
  `f7631fa`/`18c0d0b`/`3e4c39f` — replaced the Gradient/Rainbow/Split
  aura's up-to-13-DOM-nodes-×-2-pseudo-elements-×-`mix-blend-mode:screen`
  approach with a single native `linear-gradient()` baked into 2 CSS
  custom properties on one element, `#strikeLineAuraSegments`) at the
  user's request after they separately asked why Follow Falling Notes +
  Gradient/Rainbow was tanking FPS to a flat ~30fps across particles/
  strike line/piano keys even at max settings — traced that report to
  exactly this DOM-node-count issue before the other session's fix
  existed; confirmed after the fact that their rewrite is architecturally
  the right fix (collapses cost back to the same 2-element/2-blur-filter
  baseline Single/Double already uses) and genuinely didn't need to touch
  particle/key colour code at all, validating that those two were never
  independently expensive — just collateral from Strike Line's shared
  compositor budget being maxed out.
  - Went through every alpha value the rewrite threads into the new
    `--strike-line-multi-tint-a/b` custom properties to check they still
    match what each replaced — initially suspected a smoke-vs-shadow alpha
    mix-up (`updateStrikeLineAuraSegments` takes only `shadowAlphaA`/
    `shadowAlphaB` and uses them for both tint-a and tint-b), but
    cross-checking against exactly which background layer each tint
    variable replaces in `#strikeLineAuraSegments::before`/`::after`
    (a shadow-alpha-rooted fade layer in both cases, confirmed against
    `#strikeLine::before`/`::after`'s original 3-and-2-layer background
    lists) showed the shadow-alpha reuse is correct by design, not a bug.
    Recorded here so a future session doesn't re-flag the same false
    positive without re-deriving this.
  - Found and fixed one real (non-functional) issue: the comment
    immediately above the `auraStops` construction in
    `updateStrikeLineLine()`, in all 4 engines, still described the OLD
    mix-blend-mode/one-DOM-node-per-stop approach — directly contradicting
    the accurate, already-updated comment a few lines below on
    `updateStrikeLineAuraSegments()` itself. Rewrote it to match. No
    `.min.js` diff from this — comments don't survive minification.
- **2026-07-20 (later same day): Learn Song note-highlight bugs, child-theme
  effects menu, and key-glow timing/visuals — all 4 engines except where
  noted.**
  - **Learn Song only** (`js/visualizer/learn-song-engine.js` +
    `learn-song-stage.html` + `css/visualizer/learn-song-stage.css`), two
    bugs, both found by tracing the actual highlight/clear code rather than
    guessing:
    1. The "press this next" highlight (`.learn-song-target`, applied to
       `.white`/`.black` key elements) was invisible under the Neobrutalism
       child theme. Root cause: pure CSS specificity, not a selector
       mismatch — `body.theme-child #piano .white{...!important}` (in
       `learn-song-stage.css`) is `(1,2,1)`, beating the highlight's own
       `#piano .white.learn-song-target{...!important}` (`(1,2,0)`, defined
       in `learn-song-stage.html`'s inline `<style>`) despite both using
       `!important` — the extra `body` type selector on the child-theme
       rule is what tips it. Fixed by adding
       `body.theme-child #piano .white.learn-song-target,...` overrides
       right after the existing `body.theme-child ... .white.active` rule,
       same specificity-matching pattern already used there.
    2. Practice mode ("cicil nada") cleared ALL pending-note highlights at
       once instead of clearing each note's highlight the instant *that*
       note was correctly played. Root cause: `learnSongOnKeyDown()` never
       removed `.learn-song-target` per-note on a correct hit — the only
       place the class was ever removed was `learnSongClearHighlight()`'s
       bulk wipe, which only runs when the *whole* chord/step is satisfied
       (`learnSongAdvanceIfSatisfied()` → `learnSongGoToStep()`). Fixed by
       removing the class (and pruning `learnSongHighlighted`) for the
       specific note the instant it's added to `learnSongStepPressed`.
  - **Child theme's visual-effects menu, all 4 engines** — child theme
    already had two mechanisms hiding/force-disabling controls (a static
    CSS `display:none` list, and explicit `setStrikeLineFx`/
    `setAnimModeById` calls in each engine's `setPianoTheme()` child
    branch) but was inconsistent: Particles/Strike Line/Material style
    were correctly hidden *and* force-disabled, while Gradient color mode
    was hidden with **no** force-off — a real, pre-existing gap (a user
    with Gradient selected who switched to child theme kept rendering in
    Gradient with no button to turn it off). Changes, applied identically
    across all 4 `setPianoTheme()` functions and all 4 CSS files' shared
    `body.theme-child` hidden-selector line (byte-identical across
    engines, confirmed before editing):
    - `#mModeGradient` removed from the hidden-selector list — Gradient
      color mode is now available in child theme (this is what closed the
      inconsistency above, rather than adding a force-off for it).
    - "Glow / Neon" (`noteGlowEnabled`, the falling-note aura — distinct
      from "Key Light"/`keyGlowEnabled` on the physical keys, see below)
      and "Strike Reaction" (`strikeReactionEnabled`) are now hidden in
      child theme (`#rowNoteGlow`/`#rowNoteGlowIntensity` +
      `#rowSettingsNoteGlow` — Note Glow has a second toggle duplicated
      into the Settings quick-panel, which had no wrapping id before this
      change, added one — and `#rowStrikeReaction`/
      `#rowStrikeReactionIntensity`), and force-disabled via
      `setNoteGlowEnabled(false)`/`setStrikeLineFx('strikeReaction',
      false)` in each engine's `setPianoTheme()` child branch, matching
      the existing Particles/Strike Line pattern exactly.
  - **Key Light (`keyGlowEnabled`) — the glow on the physical piano keys,
    not to be confused with "Glow/Neon" above** (which is a different,
    falling-note-only effect; verified via full read of both rendering
    paths before touching anything):
    - **Visualizer + Learn Song only — glow now instant for MIDI-file/
      transcribed playback, matching direct touch input.** Root cause
      (found by comparing the direct-input path against the scheduled-
      playback path): direct input calls `scheduleKeyVisual()` synchronously
      inside the input event handler, so the glow is always instant. Audio
      for scheduled (MIDI file / transcribed) playback is deliberately
      decoupled from the rAF tick — `vizTick`/`lsTick`'s audio pointer
      schedules `VIZ_AUDIO_LOOKAHEAD_MS`/`LS_AUDIO_LOOKAHEAD_MS` (120ms)
      ahead using `AudioContext.currentTime`, precisely on-schedule
      regardless of frame jank — but the glow trigger (`vizKeyOn`/`lsKeyOn`)
      was still only reached from the polling `while(...){if(ev.ms>elapsed)
      break;...}` visual-pointer loop, gated on wall-clock `elapsed` updated
      once per rAF callback. On a throttled frame, or the same tick's own
      heavy `drawVizFalling()` cost (dense transcribed MIDI is the common
      case), the sound stayed on time but the glow visibly lagged. Fixed by
      giving the glow trigger the same treatment as audio: a new pointer
      (`vizVisualScheduleIdx`/`lsVisualScheduleIdx`, deliberately NOT
      reusing `vizEventIdx`/`lsEventIdx` — that index's "has this genuinely
      elapsed" meaning is relied on by the resume-from-pause audio rewind
      and the end-of-song check) walks the same 120ms lookahead window and
      pre-schedules each `vizKeyOn`/`vizKeyOff` call via `setTimeout`
      (plain `setTimeout`, not the audio clock — a DOM class toggle doesn't
      need sample accuracy, and it needs no `AudioContext` dependency).
      Pending timers are tracked (`vizVisualTimers`/`lsVisualTimers`) and
      cleared on every pause/seek/restart/fresh-start, with the pointer
      rewound to `vizEventIdx`/`lsEventIdx` on resume-from-pause exactly
      like the audio pointer already was — same reasoning: lookahead events
      cancelled by a pause need to be rescheduled, not dropped. Verified
      `vizKeyOn`/`vizKeyOff`/`lsKeyOn`/`lsKeyOff` are each still called from
      exactly one place after this change (no double-firing risk from a
      duplicated call site).
    - **Visual redesign, all 4 engines, kept deliberately cheap/mobile-safe
      per explicit instruction — no new blur radii, no new box-shadow
      layers, only gradient-stop/opacity/height tuning plus one
      `mix-blend-mode`:**
      - Fixed a real, likely-unintentional bug: `.black.active`'s glow
        box-shadow scaled off `--key-glow-intensity` while `.white.active`
        scaled off `--key-glow-spread` — since `spread` is always exactly
        2× `intensity` in every engine's `setKeyGlowIntensity()`, black
        keys were getting roughly half the blur-radius scaling white keys
        got at the same slider position. Now both scale off
        `--key-glow-spread` consistently.
      - The reported "spread looks uneven top/bottom vs left/right" is
        mostly an inherent geometric property of `box-shadow`'s isotropic
        blur on a tall, narrow rectangle (two nearby side edges'
        halos reinforce each other into neighbouring keys; the far-apart
        top/bottom edges don't) — not something fixable at box-shadow-only
        cost without a much more expensive technique (e.g. multiple offset
        pseudo-elements). The border-radius asymmetry (`0 0 2px 2px`) is a
        real but very minor secondary contributor. Chose not to chase a
        fully isotropic box-shadow given the mobile-cost constraint;
        instead strengthened `.active-key-light` (see below), whose
        gradient-based shape CAN be tuned per-axis unlike box-shadow blur,
        so the redesign perceptually compensates rather than solving the
        geometry directly.
      - `.active-key-light` (an existing but very subtle top-anchored
        radial/linear-gradient "light source" layer, already the right
        precedent per its own construction — just underpowered) is now the
        actual "key light" effect: height 36%→52% (60% on
        `.active-key-black-light`, was 46%), a hotter multi-stop gradient
        core (extra stops for a punchier white-hot-centre-to-falloff
        curve, same recipe family as the canvas dust sprite's radial
        gradient elsewhere in this codebase), opacity multiplier
        0.72→0.95, and `mix-blend-mode:screen` so it reads as light
        additively hitting the key rather than a flat white overlay (same
        technique already shipped for the Strike Line aura segments).
        `mix-blend-mode` is dropped back to `normal` under
        `.layout-changing`/`.perf-lite`, matching the existing pattern of
        that block already dropping `filter:blur` under load — no new
        compositing cost added on a throttled/mobile device.
- **2026-07-20: new default piano ("Grand Piano") + Concert Grand audio
  replaced, and the Concert Grand CDN fallback mechanism was retired
  entirely.** User supplied two new SF2 files via a shared Drive folder
  (`grand piano.sf2` "Giga B Piano", `concert piano.sf2` "SalC5Light" —
  both single-preset, 44.1 kHz stereo, already well-authored: sane
  `initialAttenuation`, `releaseVolEnv` set on their global instrument
  zone, no VST-rip double-preset/silence bugs) — used as-is, no
  `bin/shrink-piano-sf2.js` pass needed, same treatment as `atmosGrand`/
  `stagePiano`.
  - New slot `grandPiano` (`soundfonts/pack/grandPiano.sf2`, 16.8 MB) is
    now `DEFAULT_SF_KEY` and the top button in every engine's main Piano
    picker category (never offered as a layer/String option, same as
    `stagePiano`). This is a smaller default download than the previous
    default (`stagePiano`, 38 MB).
  - `sal1` ("Concert Grand")'s audio was replaced in place —
    `soundfonts/pack/salamander.sf2` now holds the new file (22.5 MB →
    25.3 MB) — and its entire CDN special-case was deleted: previously
    `sal1` loaded ~30 MP3 files live from `tonejs.github.io/audio/
    salamander/` (`fetchSalamanderSamples`/`loadSalamanderBuffers`/
    `loadConcertGrandBuffers`, with the local `.sf2` as an unreachable-CDN
    fallback only), now it's a plain pack slot loaded the same generic way
    as every other preset (`loadLocalSf2`). Removed identically from all 4
    engines: `SALAMANDER_URL`/`SALAMANDER_HOST`/`SALAMANDER_MIDIS`/
    `salamanderFileName`/`_salamanderSamplesPromise`/
    `SALAMANDER_LOAD_TIMEOUT_MS`/`SAL1_SF2_URL`, the
    `fetchSalamanderSamples`/`loadSalamanderBuffers`/
    `loadConcertGrandBuffers` functions, the `if (url === SALAMANDER_URL)`
    branch in `loadSoundfontWithProgress`, and (multiplayer-piano.js only)
    the CDN-vs-local ternary in the remote-instrument loader. `sal1`'s
    display label stays "Concert Grand" (not renamed) — only the audio
    behind it changed.
  - Multiplayer's player-info modal (main SF + layer SF shown per player)
    needed **no code changes at all** — `getSoundfontName()`/
    `instrumentLabel()`/`stringInstrumentLabel()` already derive purely
    from the shared `SF_URLS`/`SOUNDFONT_LABELS` catalog and
    `normalizeInstrumentKey()`'s fallback (updated `'stagePiano'` →
    `'grandPiano'` to match the new default), so adding the new slot to
    the catalog was sufficient for it to show correctly. Confirmed by
    reading the modal's rendering path, not by guessing.
  - Attribution: couldn't verify either new file's exact upstream
    source/license from the user (Concert Grand's replacement is an
    unverified community repack — embedded INFO name "SalC5Light" reads
    as *derived from* Salamander Grand Piano V3 but the specific repack
    author wasn't supplied), so both are marked "unspecified — gray area"
    in `soundfonts/pack/manifest.json`, same treatment as `stagePiano`/
    `softPiano`. Removed the now-unverifiable "Salamander Grand Piano
    (Alexander Holm, CC BY 3.0)" claim from `about.html`'s credits blurb
    rather than carry forward a license claim that might not apply to the
    replacement audio.
  - All 4 engines' `data-sf-key` picker markup, `SF_URLS`/
    `SOUNDFONT_LABELS` catalogs, `DEFAULT_SF_KEY`, initial `currentSf`,
    and every `currentSf = 'stagePiano'` reset/fallback point were updated
    identically — diffed `data-sf-key` across all 4 HTML files (not just
    the JS catalog) per the lesson from the 2026-07-17 Stage Piano/Atmos
    Grand picker-drift bug below, confirmed matching.
- A piano-engine fix that should apply to more than one mode must be
  made in each copy separately — there is no shared engine file to patch
  once. This is a deliberate trade-off (independence over reuse), not an
  oversight.
- Filenames are deliberately named after their mode
  (`solo-piano.js`/`.css`, `multiplayer-piano.js`/`.css`,
  `visualizer.js`/`.css`) so a filename never needs its folder to be
  disambiguated when skimming search/grep output.

- **2026-07-17: Child theme (Neobrutalism) now exists in all 5 engines**
  (solo, multiplayer, visualizer, learn-song, and the standalone Music
  Theory page at `learn.html`/`js/learn/learn-piano.js`, which has no
  Visual-settings-panel infrastructure like the other 4 — its toggle is a
  single topbar icon button instead). Palette is now white + soft pastel
  blue everywhere (`#8ecbff`), not the old cream/yellow — see
  `contexts/solo.md`. Each copy's CSS selectors are adapted to that
  engine's own class/id names (e.g. multiplayer has no `.top-action-btn`/
  `.floating-trigger`/`.toast-wrap .toast-item`, learn.html's shell is
  light by default unlike the other 4's dark stage) — don't copy-paste the
  CSS block across engines without checking selectors actually exist in
  the target page first.
- **Gotcha found while adding the above: the Kalam/Fredoka Google Fonts
  import (needed for child theme's handwritten-label styling) was present
  on solo/visualizer/learn-song-stage's `<link>` tag but silently missing
  from `multiplayer.html`'s** — its child theme CSS referenced
  `'Kalam','Fredoka','Quicksand',sans-serif` and degraded to the Quicksand
  fallback with no visible error. Added to multiplayer.html and (newly)
  learn.html. If a future engine gets a font-family added to its CSS,
  check the page's own `<link rel="preload" ... fonts.googleapis.com...>`
  actually requests that family — per-engine independence (this file's
  whole point) means there's no shared place that would catch the drift.

- **2026-07-17: visualizer-stage.html and learn-song-stage.html's
  SoundFont picker was missing Stage Piano and Atmos Grand entirely** —
  the commit that added those two soundfonts (`0fbaff9`, "Add Stage Piano
  + Atmos Grand soundfonts, make Stage Piano default") only added the
  `data-sf-key="stagePiano"`/`"atmosGrand"` `<button>`s to `solo.html` and
  `multiplayer.html`'s picker markup, plus repointed each engine's JS
  `DEFAULT_SF_KEY`/`currentSf` default — but never added the matching
  buttons to `visualizer-stage.html`/`learn-song-stage.html`, even though
  `SF_URLS`/`SOUNDFONT_LABELS` (the JS catalog) was correctly identical
  across all 4 engines from the start. Net effect: visualizer and learn
  song were **actually playing** Stage Piano by default (JS default is
  correct) but the picker had no button for it and no other button's
  `data-sf-key` matched `currentSf`, so `updateSoundfontPickerUI()` left
  every option unhighlighted and `mainSfCurrent`'s static "Concert Grand"
  text never got corrected — completely invisible via the JS catalog diff
  (which matched), only found by diffing the actual `data-sf-key`
  attributes in each HTML file. Fixed by adding both buttons to both
  files' Main/Piano category (layer/String stays sal1-first by design —
  Stage Piano/Atmos Grand were never layer options even in solo). If a
  soundfont is ever added/removed again, diff `data-sf-key` across all 4
  HTML files, not just the JS `SF_URLS` catalog — they're maintained
  independently and the JS catalog matching does NOT mean the picker
  markup does.

- **2026-07-17: the `#loadingScreen` entry loader's displayed percentage
  didn't match its own progress bar, in all 4 stage engines.** The bar
  width during the soundfont-download tail was already correctly remapped
  from the soundfont's raw 0-100% onto the bar's remaining 88-100 span
  (`88 + Math.round(pct * 0.12)`, from a prior fix, commit `43ae24d`) — but
  the TEXT label built alongside it still embedded the raw, un-remapped
  `pct`. So a bar sitting at ~91% visual width would show "22%" next to
  it — looked like the counter reset/disconnected from the earlier
  "Building Piano"/"Syncing Layout" stages. Fixed identically in all 4
  engines by computing `overallPct` once and using it for BOTH the bar
  and the label. `js/multiplayer/multiplayer-piano.js`'s version has this
  in a named `setSoundfontProgress(overallPct, label, detail)` local
  helper (the other 3 engines do it inline in the `loadSoundfontWithProgress`
  callback) — same fix, different wrapping, because multiplayer's
  soundfont-loading flow was already structured differently (resolves
  `__soundfontReadyPromise`, awaited by `enterRoom()`, instead of calling
  `setPianoEntryLoading(100,...)` itself).
- **Same session: the loading label's byte-count/percent text (e.g. "8.0MB
  / 36.7MB 91%") flipped between one line and two as the digits changed
  width, since `.ld-card` had a fixed max-width and `.ld-main-label` had
  no `white-space:nowrap`** — visible layout jank on every progress tick.
  Fixed by splitting the volatile MB/percent text out of `.ld-main-label`
  into its own new `.ld-detail-label` element/line (`#ldDetail` in each
  `*.html`'s `#loadingScreen` markup), reserving its height via CSS
  `visibility` (not `display`) so toggling it on/off between loading
  stages never changes the card's total height either — the whole card is
  now a fixed height (measured 51px) from first paint to "Ready" in all 4
  engines. `setPianoEntryLoading(progress, label, detail)` gained the
  third param; existing call sites that don't pass `detail` are unaffected
  (falsy → hidden, same as before this line existed).

- **2026-07-17: redesigned the mid-session "Loading SoundFont" overlay
  (`#sfLoadingOverlay` — shown when switching soundfont, distinct from the
  `#loadingScreen` entry loader above) in all 4 stage engines: real MB
  downloaded/total instead of the old static "0% / X% / 100%" row, and a
  working Cancel button.** Was previously identical dead-simple markup
  across all 4 (never diverged, unlike the entry loader) — a spinner, a
  soundfont name, a bar, and 3 percent labels with no way to abort.
  - **Byte tracking for Concert Grand (`sal1`)**: its CDN path
    (`fetchSalamanderSamples`, ~30 separate MP3 files from
    tonejs.github.io) only ever reported "N of 30 files done", not bytes
    — unlike the pack `.sf2` path (`loadLocalSf2`), which already streamed
    real `content-length`-based progress. Rewrote it to sum each file's
    real `content-length` (confirmed present on the CDN via GET, not
    reliably on HEAD) into `expectedBytes`/`receivedBytes`, so it now
    reports real MB the same way the pack path does. Guarded against
    double-counting a retried file's declared size (`fileExpected[idx]`
    guard) — a naive `+=` on every attempt would inflate the total on any
    dropped/retried file.
  - **Cancel**: threaded an `AbortSignal` through
    `loadSoundfontWithProgress` → `loadLocalSf2`/`loadConcertGrandBuffers`/
    `fetchSalamanderSamples`, all sharing one `AbortController` per load
    (`sfLoadAbortController`, module-level, so the Cancel button always
    aborts whichever load is actually in flight). Aborting reverts to the
    previously-selected soundfont via the SAME revert path the existing
    "load failed" branch already used — only the message differs
    ("Cancelled" vs "Load failed. Keeping current sound.") by checking
    `controller.signal.aborted` in that branch.
  - Verified live (network-throttled via CDP) end to end in all 4 engines:
    real MB/% display while downloading, Cancel actually stops the
    in-flight fetch and reverts cleanly, and the normal completion path
    still works.

- **2026-07-17: Strike Line aura (the "mist" glow, `::before`/`::after`
  on `#strikeLine`) now follows Gradient/Rainbow/Split colour instead of
  staying stuck on one representative hue, in all 4 engines.** A single
  box-shadow/pseudo-element can't spatially vary its colour, so the flat
  line above could sweep a whole 13-stop gradient while its aura stayed
  one flat colour underneath — same bug in Split Color. Fixed by
  rendering the aura as several real DOM `.sl-aura-seg` divs inside a new
  `#strikeLineAuraSegments` container (one per colour stop: 13 for
  Gradient/Rainbow, 2 for Split), each carrying its own scoped
  `--strike-line-smoke-a/b`/`--strike-line-shadow-a/b` custom properties
  that feed the exact same wave-flow/mask/blur recipe `#strikeLine`'s own
  pseudo-elements already used (shared selector,
  `#strikeLine::before, .sl-aura-seg::before{...}`) — solid/no-split mode
  is untouched, segments just stay empty. `updateStrikeLineAuraSegments()`
  (new function, added right after the existing per-engine
  `updateStrikeLine()`/`updateStrikeLineLine()`) sizes each segment by
  distance-to-nearest-neighbour-stop (`Math.min(160, Math.max(24, gap *
  2.3))`) so it works for both evenly-spaced gradient stops and the two
  unevenly-placed split stops, and reuses existing segment elements
  across calls (only adds/removes the delta) so the CSS animation never
  restarts/glitches on a colour refresh. Body class
  `strikeLine-multiColor` toggles which layer is visible
  (`#strikeLineAuraSegments` vs `#strikeLine`'s own `::before`/`::after`).
  Neighbouring segments blend via `mix-blend-mode:screen` (additive
  light, avoids a muddy/grey seam) — **this has to be set on the
  `::before`/`::after` pseudo-elements that actually paint the gradient,
  not on the zero-height `.sl-aura-seg` parent div**; an earlier draft set
  it only on the parent, which does nothing (mix-blend-mode isn't
  inherited by an element's own pseudo-elements), so overlapping segments
  alpha-composited with a hard seam instead of blending — caught during
  live Playwright verification (pixel-sampled a "blue-only" screenshot
  region and found it still red) and fixed by moving/duplicating the
  declaration onto `.sl-aura-seg::before, .sl-aura-seg::after` in all 4
  CSS files. Separately, **multiplayer-piano.css was missing the entire
  base `.sl-aura-seg`/`#strikeLineAuraSegments` ruleset** — only the
  responsive/perf-mode override blocks referenced `.sl-aura-seg`, with no
  base rule ever declaring `content:''`/position/background, so the aura
  segments were completely invisible in multiplayer regardless of mode;
  added the missing base block (mirroring solo/visualizer/learn-song)
  and re-verified via computed-style checks (`getComputedStyle(seg,
  '::before')`) since multiplayer's lobby overlay blocks pointer-based
  screenshot testing.
  - Note the tight box-shadow glow immediately hugging the line itself
    (the `haloA`-`haloE` rings, driven by the Intensity slider) is a
    *separate* layer from the aura mist and intentionally still stays a
    single representative colour (box-shadow can't spatially vary either,
    and segmenting that too would need the same DOM-segment treatment for
    a much smaller, tighter-radius glow) — this is pre-existing, already
    commented in the code, and not what "Aura Height" refers to in the
    UI. At default Intensity this halo can visually dominate near the
    line; lowering Intensity or raising Aura Height makes the segmented
    multi-colour mist the dominant signal (verified: a low-Intensity
    screenshot in Split mode shows a clean red→purple→blue blend).
  - Added a new **"Line Size" slider** (`strikeLineSizeRange`/
    `strikeLineSizeVal`, new row in the Strike Line subpage, all 4
    `*.html`) controlling the actual line thickness — bound to the same
    underlying value as the existing Tools-panel "Strike Thickness"
    slider (internal name `keyDustIntensity`, kept as-is per rules.md
    rule #9: renaming an already-serialized preset field everywhere-or-
    nothing wasn't warranted just to relabel a control that already has a
    correctly-labelled Tools-panel twin). `setKeyDustIntensity()` now
    syncs both sliders.
  - Also fixed a real dead-toggle bug found while extending this CSS:
    solo.js/multiplayer.js toggled body class `strikeLine-off` (camelCase)
    but every CSS selector checked `strike-line-off` (hyphenated), so the
    Strike Line enable/disable switch had zero visual effect in solo and
    multiplayer (visualizer/learn-song already used the correct
    hyphenated class, unaffected). Fixed the JS toggle call in both files;
    verified live (opacity correctly drops to 0 on toggle-off).
  - Verified live via Playwright in all 4 engines: segment counts (13
    gradient/rainbow, 2 split, 0 solid), `strikeLine-multiColor` body
    class toggling, per-segment colours, `mix-blend-mode:screen` on the
    pseudo-elements, Line Size slider round-trip, and the
    `strike-line-off` fix — plus visual screenshots confirming a smooth
    colour blend (not a hard seam) at the Split boundary in solo and
    visualizer.

- **2026-07-20: Strike Line aura's Gradient/Rainbow/Split mist rewritten
  from N blurred DOM segments to a single native CSS gradient, identically
  across solo/multiplayer/visualizer/learn-song.** Two bugs reported live:
  (1) visible hard-edged colour blocks ("kotak warna") instead of smooth
  smoke, and (2) the aura visibly freezing/not animating during real play,
  plus a general mobile lag complaint pointing at this system as the
  cause. Root cause of both: the 2026-07-17 aura-segments fix (above)
  rendered the multi-colour mist as up to 13 `.sl-aura-seg` DOM nodes (one
  per colour stop) × 2 pseudo-elements each = up to 26 blurred/masked/
  `mix-blend-mode:screen`-blended layers animating simultaneously — (1)
  each segment's own flat linear-gradient tint layer had no horizontal
  falloff, so adjacent differently-coloured segments met as a hard seam
  wherever their overlap wasn't enough to fully blend; (2) that many
  blurred+masked+blended layers is expensive enough that `input-burst-mode`
  had to pause the animation outright on `pointer:coarse` devices to stay
  smooth — measured **42% higher achieved FPS under 6x CPU throttling**
  comparing the old 13-segment build against the new one (Playwright +
  CDP `Emulation.setCPUThrottlingRate`, rapid `updateStrikeLineLine()`
  churn to simulate burst-mode note spam). Fixed by replacing the whole
  `.sl-aura-seg` DOM simulation with **one native multi-stop
  `linear-gradient(to right, ...)`** built in JS
  (`updateStrikeLineAuraSegments(stops, shadowAlphaA, shadowAlphaB)`,
  rewritten to just set two CSS custom properties —
  `--strike-line-multi-tint-a/b` — instead of creating/positioning DOM
  nodes) and slotted into `#strikeLineAuraSegments::before/::after` as the
  "tint" layer of the *same* wave-crest recipe `#strikeLine::before/::after`
  already use for solid colour. A native gradient is interpolated by the
  browser itself so it can never show a seam, and this collapses the cost
  back down to 2 elements total — the same as solid-colour mode, so
  Gradient/Rainbow/Split no longer needs (or gets) any special-cased perf
  treatment; the existing `input-burst-mode`/`perf-lite` freeze rules are
  left as-is (still correctly calibrated, now for a cost that no longer
  disproportionately affects multi-colour mode). One follow-on bug caught
  during the rewrite: the wave-crest radial layers read
  `--strike-line-smoke-a/b`/`--strike-line-shadow-a/b`, which were only
  ever set on the `#strikeLine` element itself — fine for `#strikeLine`'s
  own pseudo-elements (same element), but `#strikeLineAuraSegments` is a
  *sibling* of `#strikeLine`, not a descendant, so it never inherited
  them and the crests silently fell back to a hardcoded cyan regardless of
  the actual line colour; fixed by also mirroring those four custom
  properties onto `document.documentElement` in all 4 engines. `.sl-aura-seg`
  and its container's old positioning/mix-blend-mode rules were deleted
  entirely (dead code) rather than left disabled. Verified via Playwright
  in all 4 engines: no DOM segments created (`childCount: 0`), smooth
  colour blend at both default and max Aura Height with no visible seam,
  correct representative hue on the wave-crest layers, and the
  `background-position` animation actually advancing over time (not
  frozen).

- **2026-07-21: Three small fixes requested directly by the user — Chord
  Detector text-size default, pause instead of catch-up-jump on returning
  to the tab (visualizer/learn-song), and dropped an unnecessary sprite-
  cache wipe on every slider drag tick (FPS).** (1) `chordTextScale`
  default (both the `let chordTextScale = 100` initial value and the
  `setChordTextScale(100)` call inside `applyFactoryDefaults`/reset-to-
  default) changed to **80** across all 4 engines, plus the matching
  `chordTextSizeRange`/`chordTextSizeVal` markup in `solo.html`,
  `multiplayer.html`, `visualizer-stage.html`, `learn-song-stage.html`
  (was `value="100"`/`100%`, now `value="80"`/`80%`). The legacy fallback
  in the preset-load path (`s.chordTextScale !== undefined ? s.chordTextScale
  : 100`) was deliberately left at 100 — that 100 is the fallback for
  presets saved *before* this field existed, not a new-user default, so
  changing it would silently resize text in old saved presets that never
  asked for 80%. (2) Visualizer and Learn Song only: backgrounding the
  tab/app (`document.hidden` via `visibilitychange`) now calls
  `vizPause()`/`lsPause()` instead of leaving playback running. Root
  cause of the reported "kaget" (startled) feeling: `requestAnimationFrame`
  is throttled/stopped by the browser while hidden, but the elapsed-time
  math is driven by `performance.now()`, which keeps advancing — so the
  first tick after returning saw a large elapsed jump and tried to catch
  up all at once, producing a sudden burst of notes/scrubbed-looking
  playback right as the user's attention returned. Pausing outright on
  hide removes the gap to catch up from; the user resumes manually.
  Solo/multiplayer were deliberately left untouched — neither has a file-
  playback timeline (no `vizPause`/`lsPause` equivalent), they already had
  their own `visibilitychange` handling for releasing held notes, and
  that behaviour is unrelated to this bug. (3) FPS drop while holding
  notes and adjusting settings sliders, worse the more sliders you touch:
  three call sites — `syncFallingNoteVisualState()`, `setAnimRoundness()`/
  `setFallingNoteRoundness()`, and `setNoteGlowIntensity()` — were calling
  `clearEffectSpriteCache()` unconditionally, and all three are wired to
  `input` (not `change`), which fires continuously on every pixel of drag,
  not just on release. `clearEffectSpriteCache()` wipes the *entire*
  falling-note sprite cache, forcing every visible note to rebuild its
  offscreen canvas sprite from scratch on the very next frame — while
  already fighting for frame budget during active play. This clearing was
  never actually necessary: `getEffectSprite`/`getGradientSprite`'s cache
  key already bakes in every parameter that can change
  (`${style}_${color}_${w}_${h}_${size}_${roundness}_${dpr}_${glow}_${variant}`),
  so a changed value simply produces a different key and a fresh sprite
  gets built lazily on next use — the old sprite just ages out of the
  existing 200-entry LRU (`_spriteCache`/`_spriteUse`) on its own, exactly
  like the dust-sprite-cache fix earlier this session relied on the same
  self-invalidating-key property. Removed the 3 clears (with a comment at
  each site explaining why it's safe); left the other `clearEffectSpriteCache()`
  call sites alone since they're all discrete/rare (factory-reset, preset-
  load, the Note Glow on/off toggle, and DPR-change resync) rather than
  continuous-drag paths, so they were never the source of the reported lag.
  All 3 fixes applied identically across solo/multiplayer/visualizer/
  learn-song (item 2 scoped to visualizer/learn-song only, per above).
- **2026-07-30: multiplayer's Child theme was an incomplete port — two
  gaps found by diffing solo/visualizer/learn-song's `drawFallingNote`/
  `setActiveKeyOverlay` against multiplayer's copies (all four are
  otherwise identical on this).** (1) `drawFallingNote` in
  `js/multiplayer/multiplayer-piano.js` had no Neobrutalism branch at all
  — every other engine short-circuits to a thick-border/drop-shadow/flat-
  fill rounded rect when `pianoTheme === 'child'`, so multiplayer alone
  fell through to the normal Style-based renderer (solid/outline/glass/
  midnight/batik) for falling notes while the theme was active. Ported the
  branch verbatim. (2) `setActiveKeyOverlay` in the same file only
  suppressed the glow overlay for `shouldUseLightKeyVisual()`, missing the
  `|| pianoTheme === 'child'` the other three engines already have — so a
  child-theme multiplayer key press showed both the flat Neobrutalism
  key-fill (from the `.white.active`/`.black.active` CSS, correct) AND the
  non-themed Key Light glow overlay layered on top of it (wrong,
  mismatched patchwork), while solo/visualizer/learn-song correctly show
  only the flat fill with the light off. Both are now byte-for-byte the
  same fix already present in the other three engines.
- **2026-07-30: Chord Detector's Text Size default (and factory-reset
  value) changed 80% → 90%** across all four engines that carry it (solo,
  multiplayer, visualizer, learn-song stage) — `let chordTextScale`, the
  `applyFactoryDefaults`/reset call, and the `chordTextSizeRange`
  slider's/`chordTextSizeVal` label's markup default in each host HTML.
  Deliberately left the `s.chordTextScale !== undefined ? s.chordTextScale
  : 100` fallback in each preset/cloud-load path untouched — that 100 is
  what a preset saved before this field existed has always resolved to,
  and changing it would alter the rendered size of *existing users'*
  already-saved presets, which wasn't asked for.
- **Key labels vanished on a pressed key in every theme EXCEPT Child —
  and the reason is the same stacking-context trap already documented for
  `pianoSeparatorLayer`.** The pressed colour is painted by
  `#activeKeyLayer` (z-index 70), a *sibling* of `#piano`; `#piano` has
  `transform:translate3d`, so it is its own stacking context and NOTHING
  inside a key — whatever z-index it is given — can paint above that
  layer. Child theme looked fine only because `setActiveKeyOverlay()`
  deliberately skips the overlay for `pianoTheme === 'child'` (the flat
  Neobrutalism `.white.active`/`.black.active` fill does the job there),
  so in that one theme the label really is on top of the colour.
  Fix (2026-09-06): `appendActiveKeyLabel()` mirrors the key's own label
  into the overlay as an `.active-key-label-holder` piece. Three things
  make it exact rather than approximate, and all three are load-bearing:
  1. the holder is given the *key's own box* (white: `top:0;bottom:0`;
     black: `height:var(--black-key-height)`), so the label's percentage
     offsets (`bottom:6%`, `calc(var(--bk-face) + 7%)`) resolve to the
     same place they do inside the key;
  2. `#activeKeyLayer` now also carries `--bk-face` (next to the
     `--black-key-height` write that already existed for the same
     reason). `updateBlackKeyEdgeVars()` writes `--bk-face` onto the 36
     black keys individually — a deliberate perf choice — so the overlay
     cannot inherit it and was falling back to the stylesheet's 11px,
     putting the mirrored black label ~1.7px off;
  3. the label's inline `cssText` is reused verbatim from the real label
     (`updateKeyLabelStyle` already caches it per mode/width/scale), so a
     press costs one `cssText` assignment, not a restyle.
  Verified: mirrored vs. real label rect delta is `dTop 0, dCx 0` on
  solo/visualizer/learn-song; a pixel diff of the pressed key with and
  without the holders changed **1319 px inside the glyph box and 0 px
  outside** in default/sketch/8bit — i.e. the colour fill is untouched,
  there is no carved-out gap. Contrast of ink vs. fill across
  `#0088e0/#ffd60a/#ff2d55/#111827/#ffffff/#00e5ff` is 5.16–19.34:1.
  Gotcha for anyone touching the pool: pooled divs are shared between
  colour pieces and label holders, so `appendActiveKeyPiece()` blanks any
  `__lbl` child it inherits — without that, stale label text shows through
  a colour piece after a glissando. Child theme is untouched (no overlay →
  no mirror → no double label).
- **Where the piano-geometry drag cost actually is (measured 2026-09-06,
  4x CPU throttle, 40-step 30%→70% Piano Height drag).** Three findings,
  all from devtools traces — do NOT re-derive them from headless fps,
  which is software-rastered and meaningless here:
  1. **34 of the 40 frames are free.** The compositor-scale path added in
     `applyPianoGeom` works: a drag that stays inside the
     `PIANO_DRAG_SCALE_LIMIT` band produces **zero** full-layer paints.
     Oscillating 50↔53% for 40 frames: 0 big paints, and default vs
     sketch are indistinguishable. The per-frame cost that remains is
     style recalc (~2.5ms/frame at 4x), not paint.
  2. **All the cost is in the 6 commit frames.** A 30→70 drag commits a
     real height at 35/41/48/56/65% plus the final — 6 commits, each
     re-rastering `#piano` AND `#activeKeyLayer` (12 "unbounded clip"
     Paint records). Raising `PIANO_DRAG_SCALE_LIMIT` to 100 only takes
     `#piano` from 13 paints to 9 — **loosening the limit is not the
     lever**, confirming the earlier 1.15/1.25/1.40 measurement.
  3. **The default-vs-flat-theme gap is those 6 frames, and it is
     entirely the 36 black keys.** Commit-frame paint recording: default
     82ms vs Child/Sketch/8-bit 19ms — the 4x the user measured
     on-device. Declaration-by-declaration on the default theme
     (baseline paint 82ms): both chamfer pseudo-elements off → 66ms;
     body gradient collapsed to one → 64ms; body gradient flat → 45ms;
     both → 37ms. White-key gradient (80ms) and white-key box-shadow
     (86ms) are **noise** — do not "optimise" the white keys, it was
     measured and there is nothing there. `border-radius:0` on the black
     keys made it *worse* (98ms paint / 146ms raster).
  Fix shipped: `body.layout-changing #piano .black:not(.active)` drops
  the gradient, the inset shadows and the chamfer for the duration of a
  drag. Commit-frame paint 91ms → 62ms, total Paint 302ms → 237ms.
  `background-color` is deliberately left alone so the key keeps the
  exact colour it was already painting and nothing shifts hue mid-drag.
- **Why fewer keys is SLOWER, not faster** (the user's most confusing
  data point: 88→75 keys drops ~50fps, 88→33 drops to ~25fps). `#piano`
  and `#activeKeyLayer` always contain all 88 keys and are scrolled by
  transform, so the composited layer is `getPianoTotalWidthPx()` wide,
  not viewport-wide. On a 412px viewport that is **412 CSS px at 88 keys
  → 487 at 44 white → 649 at 33 white → 1071 at 20 white → 1785 at 12
  white** — a 4.3x texture while the visible window never changes. Every
  commit re-rasters that. This is the only mechanism that explains the
  inverted relationship. NOTE: headless does **not** reproduce it
  (raster measured *lower* at 20 keys than 52), so it cannot be tuned
  from here — the real fix is virtualising the key DOM to the visible
  window, which is a genuine rebuild of the scroll/offset/hit-cache path
  across all four engines and has not been done.
  Also tried and rejected: `content-visibility:auto` on `.white`/`.black`
  — zero benefit (paint slightly worse), because the keys sit inside an
  already-composited layer whose display list is recorded whole.
- **Cross-engine drift found by auditing every shared function, not by
  reading diffs (2026-09-06).** Three fixes had been landing in
  `solo-piano.js` only. The audit that found them is worth repeating
  whenever a piano change is "applied to all four": extract every
  top-level `function NAME(...)` body from all four engines, hash them,
  and report which differ — 462 functions, 19 piano-related mismatches,
  of which 3 were real regressions and the rest legitimate mode
  differences. What was missing:
  1. `resize()` lacked the `updateBlackKeyEdgeVars()` safety-net resync
     in MP/VZ/LS.
  2. `updateKeyLabelStyle()`'s `'octave'` branch still had `color = ''`
     in MP/VZ/LS, falling through to the faint shared CSS default
     (`.key-label`/`.black-label` at 0.54/0.64 alpha). This one mattered
     most: **`'octave'` is the DEFAULT label mode on the Visualizer and
     Learn Song stages** (`applyFactoryDefaults` sets it), so the faint
     label was what those users actually saw.
  3. `syncWhiteKeyGeometry()` did not set `keys-hairline-compact` in VZ,
     and `visualizer.css` had no rule for it, so 8-bit's `--kw`-scaled
     ink border still ate narrow keys there.
  Deliberately NOT propagated, because they are real mode differences:
  MP and the Learn Song stage ship **no theme CSS at all** (`theme-child`
  / `theme-sketch` / `theme-8bit` = 0 rules in their stylesheets, and
  MP's `setPianoTheme` is a guarded stub), so `keys-hairline-compact` and
  the Child-theme 2px octave line are inert there. VZ/LS's
  `shouldUseLightKeyVisual()` returning `false`, VZ's
  `getEffectiveVisibleWhiteCountRaw()` (Auto Camera's unrounded zoom),
  MP's chat entries in `getPianoGeomEls`/`isUiLayoutLocked`, and the
  stages' `setFallingNoteKeyShade` naming are all intentional.
- **Portrait defaults are Piano Height 15% / Piano Position 18%**
  (2026-09-06, was 10% / 30%). Landscape is untouched at 40% / 0% — the
  "harga mati 40%" call still holds there. Both live in
  `getDefaultPianoHeightPercent()` and `defaultPianoLiftForOrientation()`
  in all four engines, and each is read from six call sites (boot,
  orientation change, factory reset). A saved value always wins over the
  default, so an existing user only sees the new numbers after Reset
  Defaults or a storage clear.
- **The three Black Key sliders never entered `body.layout-changing`, so
  the drag-lite above never applied to them** (found 2026-09-07, after the
  Piano Height drag was already fixed and these were still reported at
  ~10fps default vs 50+ on the flat themes). Width / Height / Edge Depth
  each rewrite inline styles on all 36 black keys per tick, re-recording
  every key's gradients, inset shadows and both chamfer pseudo-elements,
  at full cost. They fire from `'input'` only with no `'change'` partner,
  so `markBlackKeyDragActive()` debounces the class off 180ms after the
  last tick rather than using a `final` flag; an overlapping Piano Height
  drag self-heals because that path re-adds the class every call.
  Measured over a 40-tick drag, 4x CPU throttle, 88 keys
  (recalc+layout+paint+raster):
  | drag | default before | default after | Sketch after |
  |---|---|---|---|
  | Black Key Width | 303ms | 186ms | 167ms |
  | Black Key Height | 850ms | 395ms | 330ms |
  | Black Key Edge Depth | 900ms | 574ms | 315ms |
  The default-vs-Sketch gap goes from 2.1-2.8x down to 1.1-1.2x, except
  Edge Depth (1.8x) which is deliberate — see below.
- **Edge Depth is the one slider the drag-lite must NOT simplify away.**
  Its whole purpose is the chamfer, so hiding it would mean setting a
  depth you cannot see. `body.bk-edge-dragging` brings `::after` back for
  that drag at its real size and taper, flattening only the fill. That
  costs 574ms against 454ms if the face were hidden outright — the price
  of the slider being honest, and worth it. The rule is guarded with
  `:not(.theme-sketch):not(.theme-8bit)`: those two themes delete the
  chamfer entirely and this rule outranks their own `display:none`, so
  without the guard a bevel they never have would flash in mid-drag
  (caught in testing — the first version regressed exactly that). Child
  keeps its chamfer, so Child is included.
- **`--piano-black-band` was lighter than the bevel it sits behind**
  (#31343a vs the chamfer's dark stop #26282d). It fills the two corners
  the chamfer's `clip-path` trapezoid leaves uncovered — geometry that is
  BEHIND the face, so it has to read darker than it, not brighter. It was
  painting two silver wedges either side of every black key: the "should
  be black, came out silver" report. Now #16181c. Measured on the chamfer
  strip: the brightest affected pixel goes rgb(76,79,83) → rgb(52,54,58),
  i.e. from brighter than the face (rgb(57,60,66)) to darker than it.
- **`--gfx-scale`: absolute px was the reason one setting looked wrong on
  every other surface** (2026-09-07). CSS px is device-INdependent but not
  surface-independent, and a line's thickness reads against the surface it
  is drawn across: the same 3px strike line is 0.73% of a 412px phone held
  upright, 0.33% of that phone turned sideways, and 0.21% of a 1440px
  laptop — reported as chunky in portrait, right in landscape, a hairline
  on a desktop. `--gfx-scale` (viewport width / 900, clamped 0.7–1.7,
  anchored on phone-landscape because that is the width the numbers were
  tuned at) turns those absolutes into a share of the surface:
  | surface | scale | strike line | note outline |
  |---|---|---|---|
  | phone portrait 412 | 0.70 | 3px → 2.09px | 18.8% → 16% of key |
  | phone landscape 915 | 1.02 | 3.05px (unchanged) | 16% |
  | tablet 834 | 0.93 | 2.77px | 16% |
  | laptop 1440 | 1.60 | 4.80px | 14.3% |
  | desktop 1920 | 1.70 | 5.09px | 10.8% |
  **It is computed in JS (`updateGfxScale`, called at boot and from
  `resize`), NOT in CSS, and that is not a style preference.** The CSS form
  needs `calc(100vw / 900)`, which is a LENGTH; clamping it between the
  plain numbers 0.7 and 1.7 mixes types, so the declaration is invalid at
  computed-value time and silently drops — in testing the strike line went
  to `height: 0` and vanished entirely. A plain number written from JS
  multiplies cleanly. Do not "simplify" this back into the stylesheet.
  JS writes `--strike-line-thickness-base` (the raw slider px) and CSS
  derives `--strike-line-thickness` from it; the inline height on
  `#strikeLine` must also go through the scale or it wins the cascade and
  undoes the whole thing.
  The falling-note outline had the same disease in a different shape: its
  `Math.max(1.5, …)` floor is absolute, so on a packed 88-key portrait
  board (keys ~7px) it beat the proportional term and the stroke ate ~21%
  of the note from each side. The floor only has to keep the stroke from
  vanishing, which is a couple of DEVICE pixels — `Math.min(1.5, 2/dpr)`
  leaves DPR 1 untouched and thins it exactly where the pixels are smaller.
- **A key-count change must not be treated as a continuous drag.**
  `.bk-face-lite` is now the single marker for "a finger is dragging", and
  only it hides the chamfer. It is deliberately NOT keyed off
  `.piano-height-dragging`, even though that class is up during both: the
  key-count reflow calls `applyPianoHeight` too, so that class cannot tell
  a real drag from a rebuild. `applyVisibleKeyCount` strips `bk-face-lite`
  in the same synchronous block it is added, so the renderer never sees it
  — otherwise the face blinks out and back over 220ms, which reads as the
  bevel re-forming itself.
  Also fixed: `reflowPianoForKeyCount` used to schedule a black-key visual
  pass of its own, but it runs BEFORE `updateKeyLayout`, so `whiteKeyWidth`
  was still the old one and `--bk-face` (= whiteKeyWidth × depth%) was
  computed for the key count you just left. `applyBlackKeyEdgeDepth` now
  takes `deferVisual` for that path; `syncWhiteKeyGeometry` calls
  `updateBlackKeyEdgeVars` once the new width is in, so the one correct
  pass was already coming. Measured after: keys and bevel land in the SAME
  frame (whiteW 45→75, `--bk-face` 10.35→12.75px, chamfer height
  10.34→12.75px, all at t+56ms) — there is no bevel-lags-keys desync left
  to chase.
- **The strike line is NOT what makes a key-count change cost.** Traced a
  52→44→36→28→20→28→36→44→52 sweep at 4x throttle: default 1893ms total,
  of which Recalc is 930ms. Per-node paint attribution puts `#document`
  (257ms), `#piano` (242ms) and `#pianoWrap` (150ms) at the top, while
  `.stage` — the element the strike line lives in — is **5ms**, and
  `#octaveLinesLayer` 2ms. Child 1261ms, Sketch 1203ms, 8-bit 1104ms. So
  re-coupling the strike line to the piano cannot buy back the gap; the
  cost is style recalc over 88 default-theme keys. Do not spend another
  pass on the `.stage` decoupling on FPS grounds.
- **The strike line's real problem was VISUAL SYNC, not FPS.** Mid-drag the
  piano moves as a compositor transform on `#pianoWrap`, while `.stage`'s
  `bottom` is a LAYOUT property. Those do not run on the same clock: the
  compositor can present a transform on frames the main thread never
  finishes, so on a busy drag the piano's top edge slid smoothly while the
  strike line only jumped on the frames layout actually landed — the line
  came unstuck from the keybed instead of riding on it.
  **This is invisible from the main thread.** `getBoundingClientRect` reads
  0.00px of gap in every single rAF, before AND after the fix, because by
  the time a rAF runs both writes have been applied. Do not use that as
  evidence the two are in sync — it only proves they agree once the main
  thread catches up, which is exactly what a dropped frame denies.
  Fix: `.stage`'s edge is split into the part it lays out and the part it
  transforms, both derived from the same two numbers `#pianoWrap` uses —
  layout part = the height actually rastered, transform = rastered minus
  logical. Mid-drag only the transform moves, so the bottom string is
  identical frame to frame (no layout write at all, 35 of 42 frames), and
  both edges are transforms in one compositor commit. Paint records over a
  height drag went 346 → 268. `.stage` already establishes a stacking
  context (`z-index:3` + `position:relative`), so adding a transform to it
  changes no layering.
  **Derive the split from STATE, never from the call's `scaleY`.** The
  first version keyed off `scaleY` and so skipped the bottom write whenever
  a call carried none — a Piano Position commit arriving while a height
  scale was still in flight left the strike line **128px** off the keybed.
  Caught by testing the mixed order (height drag → lift commit → settle →
  key count); test that sequence, not just a clean drag.

## Last updated
2026-08-29 (second) — full visual-performance audit requested after user
reported desktop/Mac running hot (high CPU/GPU, overheat risk) while
mobile stayed normal. Root cause: the adaptive perf governor only reacts
to frame-time pressure, never to physical screen/canvas size, so a
desktop GPU strong enough to hold 60fps never throttles even while
burning excess wattage; compounded by `dustMax`/`fallingMax` being 100%
dead code (declared per-tier, never enforced) and no area/DPR-aware
density scaling anywhere. Added `getCanvasPixelBudgetScale()` (physical-
pixel-area-based density scaling), real cap enforcement on both particle
and falling-note counts, and expanded `.perf-lite` to actually dampen
Strike Line (previously only piano-key glow). Applied identically to all
4 engines' JS + CSS. See the Warnings entry above.

2026-08-29 — Chord Detector revision (Cm/D fix, G7/F-vs-G/F dual-candidate
scoring resolution, 5 new chord types, one chord-name typo fix), applied
identically to all 4 engines. Full writeup in `contexts/multiplayer.md`.
See the Warnings entry above.

2026-08-03 (sixth) — audited why vertical-axis Gradient lags in every
Style (forced off the tile-cache path), and fixed 'single'/'solid'
specifically (the worst offender) by drawing its gradient live instead of
through a sprite cache that almost never hits under Vertical. Verified
pixel-identical to the old output. See the Warnings entry above.

2026-08-03 (fifth) — fixed file-playback falling notes (Visualizer + Learn
Song) popping to a fixed height instead of growing in continuously as they
cross the top edge, most visible with vertical-axis Gradient. See the
Warnings entry above.

2026-08-03 (fourth) — fixed Auto Split MIDI showing a confusing 3rd "Note
Color" row alongside Left/Right, and fixed live-played notes not matching
the chart's per-hand layer colours (Visualizer + Learn Song only). See the
Warnings entry above.

2026-08-03 (third) — fixed vertical-axis Gradient mode showing a flat,
snapping colour instead of a real top/bottom blend on every Style except
Default/Solid. `outline` now gets a real gradient stroke (verified by
direct pixel sampling); `midnight`/`glass`/`batik` only got a smoother
quantization step (48->96 buckets), true per-pixel gradients for those
three flagged as known-not-built. See the Warnings entry above.

2026-08-03 (second) — default piano height simplified to a flat 40% on
every device/mode/orientation, overriding the same-day adaptive floor/
ceiling per explicit user instruction. Verified across 6 viewport shapes.
See the Warnings entry above.

2026-08-03 — SoundFont cleanup: deleted Harpsichord (`pfHarpsi`) and
Rhodes EP (`pfRhodes`) entirely, renamed the just-added E-Piano slot from
"M1 E. Piano" to "E-Piano". All 4 engines + HTML pickers + manifest;
verified live. See the Warnings entry above.

2026-08-02 (second) — SoundFont revision: added a new "M1 E. Piano" slot
(`pfEPiano`) and replaced Stage Piano's audio in place, both user-sourced.
Updated the catalog in all 4 engines and the picker markup in all 4 HTML
files; verified live via a real SF2 parse of both new files. See the
Warnings entry above.

2026-08-02 — fixed the mobile-landscape ~90%+ default piano height
(missing percentage ceiling on the 140px short-viewport floor), applied
identically to all 4 engines. See the Warnings entry above.

2026-07-30 — multiplayer's Child theme falling notes/key-light brought to
parity with solo/visualizer/learn-song (two real gaps, see Warnings);
Chord Detector Text Size default+reset changed 80%→90% across all four
engines.

2026-07-26 (ninth) — 11 extreme keys moved off Ctrl combinations the
browser intercepts and onto spare Shift slots; they are playable again.

2026-07-26 (eighth) — the strike line now looks the same in all four engines:
solo/multiplayer no longer multiply the aura by Brightness, their dead
`strikeLine-smoke-off` toggle is spelled the way the CSS reads it, and solo's
line colour defaults to `#0099ff` like everywhere else.

2026-07-26 (seventh) — Glow now invalidates the Visualizer's roll tile cache,
so it shows on falling notes immediately instead of whenever a tile happened
to re-bake; Strike Line Aura Height default 100% -> 80%.

2026-07-26 (sixth) — layer SoundFont list matches main and plays at the same
volume; Batik no longer jitters on rising notes; child theme removed from
Learn Song only (see `contexts/learn-song.md`).

2026-07-26 (fifth) — the Batik ground picker is removed; Batik always follows
the note colour.

2026-07-26 (fourth) — Liquid removed from all 4 engines (it reused the name
of an already-retired material, so it now resolves onto Glass like the old
one did); Batik takes Glow again; Reverb defaults to 50%; Strike Line
Brightness and Aura Height default to 100%.

2026-07-26 (third) — Glow Intensity presented as 0-100% (100% == the old
200%, internal scale untouched so presets keep their look), and Outline /
Midnight / Batik now refuse Glow at both the render and the UI level.

2026-07-26 (later) — Batik (Parang Rusak) and Liquid falling-note materials
added to all 4 engines, hidden and render-blocked under the child theme. Both
were re-architected after a mobile FPS measurement failed the first design;
see the Warnings entry above for the numbers and why each is built the way it
is. Crystal/Diamond was prototyped alongside them and dropped.

2026-07-26 — Learn Song gained a hit window (timing tolerance + an on-stage
tolerance line) and a guide/pressed/repress key-state split; the practice
layer now has its own file, `contexts/learn-song.md`. Nothing in the shared
engine surface changed — only `learn-song-engine.js`'s own copy, plus two
new `__lsEngineBridge` methods (`fallSpeed`, `clearKeyPressVisual`).

2026-07-24 — Papiano AI no longer auto-resumes the last conversation on
open; every open now starts a fresh chat (past ones still one tap away in
the sidebar), matching ChatGPT/Claude's own web apps. See the Warnings
entry above for the full rationale and removed localStorage plumbing.

2026-07-21 — Chord Detector text-size default changed 100% → 80% (incl.
reset-to-default) across all 4 engines; Visualizer/Learn Song now pause
playback instead of catch-up-jumping when the tab/app regains focus after
being backgrounded; removed 3 unnecessary full sprite-cache wipes that
were firing on every continuous slider-drag tick during active play
(`syncFallingNoteVisualState`, roundness setter, note-glow-intensity
setter) — the cache's own key already makes it self-invalidating, so nothing
was lost by not clearing it eagerly. Previous entry (2026-07-20): Strike Line aura's Gradient/Rainbow/Split mist rewritten from
up to 26 blurred/masked DOM segments down to a single native CSS gradient
(2 elements total, same cost as solid-colour mode) — fixes both a visible
hard-seam "colour block" bug and the aura freezing/lagging during real
play; measured 42% higher FPS under 6x CPU throttling. Previous entry
(2026-07-17): Strike Line aura (mist) now follows Gradient/Rainbow/Split
colour with a smooth blended transition instead of staying one flat hue,
identically across solo/multiplayer/visualizer/learn-song; new "Line
Size" slider added to the Strike Line subpage; `strikeLine-off`/
`strike-line-off` dead-toggle bug fixed in solo/multiplayer. Caught and
fixed two real bugs during implementation: `mix-blend-mode:screen` was
set on the wrong element (parent div instead of its pseudo-elements) in
all 4 engines, and multiplayer-piano.css was missing the entire base
aura-segment ruleset (segments existed in the DOM/JS but had no CSS at
all). Previous entry (same day): "Loading SoundFont" overlay redesigned
with real MB/% and a working Cancel button (Concert Grand's CDN path
rewritten to track real bytes, not just file count), identically across
solo/multiplayer/visualizer/learn-song. Loading screen's displayed
percentage now matches its own progress bar (was showing the soundfont's
raw un-remapped %) and no longer reflows between one/two lines as digits
change width, also fixed identically across all 4. Also: visualizer-
stage.html/learn-song-stage.html's SoundFont picker was missing Stage
Piano/Atmos Grand (JS catalog was fine, only the picker markup drifted) —
fixed. Child theme now exists in all 5 engines (was missing from
multiplayer and learn.html entirely); see `contexts/multiplayer.md` and
`contexts/solo.md` for the fixes/redesign from the same session.

Previous entry (2026-07-14): initial entry, migrated from README.md.
