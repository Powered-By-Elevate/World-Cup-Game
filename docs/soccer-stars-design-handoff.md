# Soccer Stars — Design Hand-off (graphics & ambiance)

**Status:** playable alpha. Physics, controls, and game feel are **locked and approved** — do not change gameplay. This doc is a brief to **max out the visuals and atmosphere** on top of the existing, working game.

**One-line:** foosball-style table soccer. Your nation's flag discs vs a rival's, bumper-car collisions, pull-back-to-aim + power, ball in the net, first to 3.

- **Branch:** `claude/soccer-stars-2d` (local only, not deployed)
- **Live preview:** `npm run dev` → open the app → **My Team → green "Soccer Stars" card**
- **Code:** `src/views/SoccerStars.tsx` (game + all canvas drawing) · `src/styles.css` (HUD, the `.ss-*` block ~L637–665)

---

## 1. How it's rendered (read this first — it shapes everything)

The playfield is **one HTML5 `<canvas>` redrawn every frame (~60fps)** in a fixed **logical world of 480 × 300 units** (landscape), then scaled to fit the screen width. **Everything on the grass is drawn procedurally in code today** — there are no image assets yet (except the flags). That's the opportunity: most "art" is currently vector primitives we can replace with designed textures/sprites.

Two layers:

| Layer | Tech | What's here | How you style it |
|---|---|---|---|
| **Playfield** | `<canvas>` 2D, world 480×300 | pitch, markings, goals, discs, ball, glow, aim arrow, goal flash | Hand off **sprites/textures + specs**; an engineer wires them into the draw calls. Provide art, not CSS. |
| **HUD / chrome** | HTML + CSS (`.ss-*`) | top bar (players + scoreboard), turn hint, end card, the dark modal backdrop | Standard CSS — you can mock these directly and we port 1:1. |

**Hard constraints**
- **Mobile-first**, portrait phone. The game sits in a full-screen modal over a dark backdrop; the landscape pitch is centered with empty space above/below (prime real estate for **ambiance** — see §4 Background).
- **Respect `prefers-reduced-motion`** (app-wide rule). Any ambient motion/particles must have a static fallback.
- **Performance budget:** this runs a physics loop every frame on phones. Keep added textures modest; prefer a few reusable sprites over many large PNGs. Target **< ~300 KB** total new image weight, gzipped.
- **Flags** are loaded at runtime from `flagcdn.com` (`w160` PNG) and clipped into circles. They can be tinted/framed but the flag image itself is external.
- Canvas draws at **device-pixel-ratio up to 2.5**, so author raster art at **@3x** of world size to stay crisp.

---

## 2. Brand palette & type (stay on-brand)

Pulled from `src/styles.css` design tokens — reuse these so the game matches the app.

| Token | Hex | Use |
|---|---|---|
| `--ink` | `#15120C` | near-black warm — backdrop, outlines, text |
| `--paper` | `#F4EEE1` | warm cream — light text/surfaces |
| `--lime` | `#C8F23C` | **signature energy accent** — scoreboard, primary CTA, "GOAL!" |
| `--gold` | `#FFB000` | Favorites / #1 / keeper ring |
| `--cyan` | `#07C2C7` | Underdogs (currently the "your turn" halo leans cyan `#39E0FF`) |
| `--magenta` | `#FF3D9A` | Longshots |
| `--live` | `#FF2D2D` | live/negative — "they scored" |
| ease | `cubic-bezier(.2,.8,.2,1)` | standard easing |

**Type:** `Anton` (condensed display — scoreboard, names, "GOAL!"), `Archivo` (UI labels/eyebrows, 800 weight, letter-spaced uppercase for small caps). Both already loaded.

Pot ring colors (used on the player flag in the header via `ring="pot"`): FAV→gold, UND→cyan, LNG→magenta.

---

## 3. Current look (reference frames)

Captured from the running build (390px phone). See `C:\Users\MatthewKnowles\wc-qa\shots\soccer-01-open.png` / `soccer-02-aim.png`:
- Green striped pitch, white markings, simple goal mouths L/R.
- Discs = flag clipped to a circle + white ring (gold ring for keepers), soft drop shadow.
- Ball = white circle with a dark center dot.
- "Your turn" → soft cyan **glow halo** under each of your discs (red halo under CPU's on its turn).
- Aim → dashed pull line + colored power arrow (lime→yellow→red as power rises) + a power arc on the disc.
- HUD → close button, `[flag] TEAM / SPAIN`, lime `0 – 0` scoreboard, `BRAZIL / CPU [flag]`.

It's clean and readable. The brief is to make it feel **premium and alive** without hurting clarity.

---

## 4. Element-by-element brief

For each: **Now → Max it out → Asset spec.** Asset sizes are @3x of the logical world (world unit × 3).

### Pitch / turf  ·  `draw()` L348–363
- **Now:** vertical gradient green + faint translucent stripes + white stroked lines/center circle/boxes.
- **Max it out:** real turf texture (subtle mow arcs or chevrons, grain, faint wear near goals), softly **vignetted** edges, a gentle top-down **light bloom** off-center, crisp painted lines with slight chalk texture. Optional: animated **light sweep** drifting across the grass (matches the app's "flag gleam" motion language — reduced-motion: hold still).
- **Asset spec:** `pitch@3x.png` **1440 × 900** (world 480×300). Provide markings as a **separate transparent overlay** `pitch-lines@3x.png` 1440×900 so we can keep them razor-sharp independent of turf. Keep the playable area inset ~7 world units (21px @3x) from each edge.

### Goals & nets  ·  `drawGoal()` L452–467
- **Now:** a white mouth line + tiny posts + faint net shading, on the left and right **vertical** edges. Mouth height = 110 world units, centered.
- **Max it out:** proper 3/4 or top-down **goal frame + net** with depth, a subtle net ripple on a goal, post highlights. Net should read as "behind" the pitch plane.
- **Asset spec:** `goal-left@3x.png` and mirrored `goal-right@3x.png`, each ~**90 × 360** (covers the mouth ≈110 tall + frame). Transparent PNG. Net as its own layer if you want it to ripple.

### Discs (flag chips) — the hero element  ·  `drawDisc()` L423–450
- **Now:** flag image clipped to a circle, flat white ring, drop shadow; keepers get a gold ring; kit-color gradient fallback with country code if the flag hasn't loaded.
- **Max it out:** make these feel like **physical playing pieces / poker chips** — beveled rim, glossy top highlight, inner shadow where the flag meets the rim, a thin metallic ring (silver for outfield, **gold for keeper**). The flag art stays in the center; you're designing the **frame + lighting overlay** that sits on top of any flag.
- **Asset spec:** two reusable transparent overlays sized to the disc (world diameter 36 → **108 × 108 @3x**, author at **128 × 128** with padding):
  - `disc-frame.png` — rim/bevel/gloss, drawn **over** the clipped flag.
  - `disc-frame-keeper.png` — gold variant.
  - Optional `disc-shadow.png` for a nicer contact shadow.
  - Keep the center ~80% transparent so the flag shows through.

### Ball  ·  `draw()` L385–393
- **Now:** white circle + dark center dot.
- **Max it out:** a real **soccer ball** (classic pentagon panels or a modern World-Cup-style ball), with a soft shadow and a tiny spin cue. Must stay legible at ~18px.
- **Asset spec:** `ball@3x.png` **72 × 72** (world 24), transparent, centered. Optional 4–6 frame **spin sheet** `ball-spin@3x.png` if you want rotation while moving.

### Turn glow / halo  ·  `draw()` L375–384
- **Now:** radial glow under each disc of the side whose turn it is (cyan for you, red for CPU).
- **Max it out:** define the exact **glow color, radius, and pulse**. A slow breathing pulse on the active side reads as "your move." Consider a brighter ring on the **disc you're currently dragging**. Reduced-motion: steady glow, no pulse.
- **Deliverable:** color + radius + opacity + pulse timing values (we apply in code), or a `halo.png` 160×160 sprite to tint.

### Aim feedback (pull-back)  ·  `draw()` L395–420
- **Now:** dashed line to your finger, a power arrow (lime→yellow→red), and a power arc around the disc.
- **Max it out:** a more game-y **aim indicator** — e.g. a tapered arrow or a row of chevrons that fill with power, a trajectory of fading dots, subtle screen-edge "charge" at max power. This is pure juice and sells the mechanic. Specify colors/shape; we render on canvas.
- **Deliverable:** redline/mock of the aim states at low / mid / max power. Optional chevron/arrow sprite.

### Header / HUD & scoreboard  ·  JSX L269–284, CSS L637–665
- **Now:** close button; each side = flag + team name + sub-label; centered lime `score – score` pill.
- **Max it out:** this is **CSS — mock it directly.** Ideas: player "cards" with avatar + level chip (your 1st screenshot), a center **VS / turn token**, an animated count-up + glow when the score changes, a subtle active-player highlight (it already dims the inactive side). Mind small screens (team names truncate at ~96px).
- **Deliverable:** Figma of the top bar at 390px + 430px wide; we port to CSS.

### Goal moment  ·  `toast` JSX L296, CSS `.ss-toast` L658–661
- **Now:** a big `GOAL!` / `They scored` text flash (Anton, lime/red) for ~1.15s, then kickoff resets.
- **Max it out:** the **signature celebration** — confetti/streamer burst in the scorer's colors, a flash/shockwave, scoreboard pop, optional crowd-roar SFX, brief slow-mo. Different, smaller treatment for conceding. Keep it ≤ ~1.2s so pace stays snappy. Reduced-motion: simple flash, no particles.
- **Asset spec:** confetti/spark **sprite sheet** (transparent, ~512×512), in team palette; we can emit particles on canvas. Provide motion notes (duration, spread, gravity feel).

### End card  ·  JSX L298–311, CSS `.ss-end` L662–664
- **Now:** dark blur panel, "Full time", big `score – score`, a line of copy, Done / Play again buttons.
- **Max it out:** a proper **win/lose moment** — trophy or crest, the winning flag enlarged, maybe a "★ Player of the match," shareable card styling (this app loves shareable moments). CSS/DOM — mock directly.

### Background & ambiance (the empty space above/below the pitch)  ·  `.ss-overlay` L638
- **Now:** flat dark vertical gradient.
- **Max it out:** turn the modal into a **stadium at night** — darkened stands, stadium-light flares, faint crowd texture/bokeh, a soft spotlight pooling on the pitch, maybe drifting light. This is where most of the "ambiance" lift lives and it's cheap (static CSS/image behind the canvas). Reduced-motion: static image.
- **Asset spec:** `stadium-bg@2x.png` portrait **~860 × 1844** (covers tall phones) OR a CSS gradient + a tileable crowd/light texture. Must keep strong contrast behind the bright pitch so the game stays the focus.

### Idle life & micro-motion
- Subtle continuous life when it's your turn: the active halo breathing, a faint turf light sweep, flags catching a gleam (reuse the app's existing flag-gleam treatment). Everything gated on reduced-motion.

### Sound & haptics (optional but high-impact)
- Not built yet. If desired, spec a small set: **kick/click** (disc launch), **thud** (disc-on-disc), **post ping**, **net swish** (goal), **whistle** (full time), light **crowd ambiance** loop. Short, compressed, royalty-free/original. The app already has a synthesized sound/haptic layer we can hook into. A phone **haptic** on goal + on hard collisions adds a lot.

---

## 5. Asset checklist (sizes summary)

All raster transparent PNG unless noted; author @3x of world units, named for easy wiring.

| Asset | Pixel size | Notes |
|---|---|---|
| `pitch@3x.png` | 1440 × 900 | turf only |
| `pitch-lines@3x.png` | 1440 × 900 | markings overlay, transparent |
| `goal-left@3x.png` / `goal-right@3x.png` | ~90 × 360 | frame + net, mirrored |
| `disc-frame.png` / `disc-frame-keeper.png` | 128 × 128 | rim/gloss overlay; center transparent |
| `ball@3x.png` (+ optional spin sheet) | 72 × 72 | centered |
| `halo.png` | 160 × 160 | tintable glow (or just give values) |
| `confetti-sheet.png` | ~512 × 512 | goal particles, team palette |
| `stadium-bg@2x.png` | ~860 × 1844 | behind the canvas; or CSS spec |
| HUD / end-card / aim mocks | Figma | we port to CSS / canvas |
| SFX set (optional) | — | kick, thud, post, net, whistle, crowd |

Drop image assets in `src/assets/soccer/` (we'll create it) and ping us with the Figma for the CSS pieces.

---

## 6. Priority

- **P0 (biggest lift, lowest cost):** stadium **background/ambiance** + **disc frame** (chip look) + **ball** sprite. These three transform the feel immediately.
- **P1:** **goal celebration** (confetti + scoreboard pop) + turf texture + goal/net art + scoreboard/HUD polish.
- **P2:** aim-indicator juice, idle micro-motion, SFX/haptics, end-card win moment.

---

## 7. Gotchas / constraints recap
- **Don't change gameplay** — physics constants (`SoccerStars.tsx` L15–26) are tuned and approved.
- **Reduced-motion** fallback required for every animated thing.
- **Perf:** 60fps physics on phones — keep textures lean, reuse sprites, avoid per-frame large draws.
- **Contrast:** the bright green pitch + flags must stay the clear focal point; keep backgrounds/chrome darker and lower-contrast.
- **Safe areas / small screens:** HUD must survive 360px width and notch/safe-area insets; pitch scales to width (height follows 480:300).
- **Flags are external** (flagcdn) and can taint the canvas — fine for display, but we can't read pixels back, so don't design anything that needs sampling flag colors at runtime.

---

## 8. Preview & iterate
- Run `npm run dev`, open the app, **My Team → Soccer Stars**.
- Screenshot harness for quick before/afters: `node C:\Users\MatthewKnowles\wc-qa\soccer-test.mjs` → PNGs in `wc-qa\shots\` (drives a real shot + full turn cycle).
- Questions / asset drops → back to engineering; we wire sprites into the draw calls and CSS into the HUD.

## 9. Open questions for design
1. **Art direction:** clean/modern (FIFA-app slick) vs. playful/arcade (poker-chip + confetti) vs. retro-table-football? Pick a lane.
2. **Stadium vs. abstract** background — literal night stadium, or branded abstract energy field in app colors?
3. Disc style: **flag-in-chip** (current) or flag + small crest/initials ring?
4. How big should the **goal celebration** go (snappy flash vs. full confetti + slow-mo)?
5. Do we want **sound/haptics** in this pass?
