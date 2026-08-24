# @ursamu/site — Public front-end design contract

**Product:** Player-facing site shell (not the staff console).

**Layout + type scale (canonical wireframe):** Figma **Home**
node **2054:137** — grayscale shell structure only.

- Spec: [`docs/figma-wireframe-home.md`](./docs/figma-wireframe-home.md)
- https://www.figma.com/design/BKP8DKLEwj0MzrzdFjU0m0/Court-of-Miracles?node-id=2054-137
- Profile shell: **2065:349** (same chrome)

Wireframe supplies **columns, nav height, gutters, type sizes**.
It does **not** supply Court cream/gold colors.

**Default visual system (required):** **UrsaMU violet night** —
exact color/face parity with staff console
[`packages/web/ui/src/assets/staff-theme.css`](../web/ui/src/assets/staff-theme.css).
Public names are `--site-*`; colors match staff `--*`. Type face is
**Inter** (wireframe Lato sizes mapped onto Inter).

**Not the default:** Court cream/gold (`examples/themes/court/`,
Figma Main **1:2** / client **1884:89**) is an **installable** skin
only. Do not put Smythe, cream `#F7E4DD`, or gold `#C4944A` on
builtin `default`.

---

## 1. CSS stack (order matters)

```
reset.css
tokens.css        ← design tokens only
layout.css        ← framing only (no brand colors)
components.css    ← menus, search, prose (tokens only)
skins/<name>.css  ← brand: colors, fonts, images
```

Or replace the last file with **any custom CSS** URL
(`plugins.site.skinCss`).

---

## 2. Semantic layout (stable class names)

| Role | Class | court-template id |
|------|--------|-------------------|
| Page shell | `.site-shell` | `#wrapper` |
| Top nav | `.site-nav` | `nav` |
| Brand | `.site-nav__brand` | `.logo` |
| Nav links | `.site-nav__list` | `nav ul` |
| Hero | `.site-banner` | `#header` |
| 3-col row | `.site-body` | `#container` |
| Left rail | `.site-aside--start` | `#left` |
| Main column | `.site-main` | `#center` |
| Right rail | `.site-aside--end` | `#right` |
| Search | `.site-search` | `#search` |
| Side menu | `.site-menu` | `.menu` |
| Article block | `.site-section` | `section` |
| Gold rule | `.site-rule` | `.hr` |
| Footer | `.site-footer` | `#footer` |

**Do not rename these classes in skins.** Override properties only.

Legacy ids (`#wrapper`, `#left`, …) remain on the demo markup for
drop-in familiarity with court-template CSS ports.

---

## 3. Tokens skins may override

| Token | Role |
|-------|------|
| `--site-bg` | Page background |
| `--site-text` / `-secondary` / `-muted` | Type |
| `--site-accent` | Links, titles, active nav |
| `--site-border*` | Hairlines / inputs |
| `--site-font-ui` / `--site-font-display` | Body / display |
| `--site-bg-image-top` / `-bottom` | Full-bleed art |
| `--site-rule-image` | Section divider |
| `--site-search-icon` | Search button glyph |
| `--site-banner-offset` | Space under fixed nav |
| `--site-max-w` / `--site-main-max` | Column widths |
| `--site-aside-min` / `-max` | Side rail widths |
| `--site-gutter` / `--site-sticky-top` | Spacing |

**Normative catalog (Theme Studio Phase 0):**  
`packages/theme-studio/spec/tokens.json` + `spec/SPEC.md`  
(selector allowlist: `spec/selectors.json`; draft schema:
`spec/theme-draft.schema.json`).

---

## 4. Play client (`/play`) — Figma client frame

Source: Court Figma **client** (`node 1884:89`). Player-facing;
requires sign-in. Keeps the normal 3-col shell (nav + rails).

| Region | Class | Figma / tokens |
|--------|--------|----------------|
| Output | `.play-output` | fill `--site-bg`, flex-grow scroll |
| Rule | `.play-prompt-rule` | 1px `--site-border` (cream) |
| Input | `.play-prompt__input` | mono textarea, min **78ch**, wrap; placeholder **Enter something…** |
| Button | `.play-prompt__send` | 119×55, `--site-btn-bg` / `--site-btn-fg`, label **SEND** |
| Plain text | `.play-pre` | mono; MUSH/ANSI → CSP-safe color classes |
| Layout UI | `.play-layout*` | `u.ui.layout` (look, etc.) |
| Entity row | `.play-entity` | name / short-desc / idle; `data-play-cmd` |
| Exit chip | `.play-action` | badge + label; `data-play-cmd` |

**Look** (`meta.type=look`): header → text → Characters
(`entity-list`) → Exits (`actions`). Click controls send game input.
Styles use site tokens only (see `packages/web/design.md` §11).

Enter submits (same as Send); Shift+Enter newline. Tokens only —
Court skin maps gold/cream.

### 4a. Utopia pinned deck (≤900px)

Pins hide until a `utopia-feed` or `utopia-week` layout arrives.
Desktop (>900px) keeps the log-only client. Telnet gets a 78-col
text twin of every card.

| `meta.type` | Pin / log | Components |
|-------------|-----------|------------|
| `utopia-feed` | masthead + sheet | header, list/actions; `meta.city`, `meta.week`, `meta.stories[]` |
| `utopia-week` | crew strip | header, entity-list (crew), text (plan), actions |
| `utopia-ruling` | log packet | header (HOLDS/HITCH/FAILS/REVISED), text, table |
| `utopia-sphere` | sheet / log | header, entity-list (rep), table (bills) |
| `utopia-you` | sheet / log | header, table, actions |

Crew `entity-list` items: `meta` is `ready` or `wait`;
`action.cmd` is `+week/ready`. Dock chips send `+week`,
`+act take-job`, `+act gather-information`, `+act hack`,
`+act lay-low`, `+act`.

Engine owns numbers. LLM writes packet body only.

**Theme:** installable `examples/themes/utopia/` (RetroWave mapped
to `--site-*`). Glow on masthead, SEND, and ruling packets only.
`prefers-reduced-motion`: static border, no pulse.

| RetroWave | Token |
|-----------|--------|
| Surface Base `#0A0A2E` | `--site-bg` |
| Surface raised `#12123A` | `--site-bg-surface` |
| Hot Pink `#FF006E` | `--site-accent` / `--site-btn-bg` |
| Purple `#8338EC` | `--site-border-strong` |
| Electric Blue `#3A86FF` | `--site-info` |
| Neon green / gold / pink | `--site-success` / `-warning` / `-error` |
| Bebas Neue | `--site-font-display` (masthead) |
| Poppins | `--site-font-ui` |
| IBM Plex Mono | `--site-font-mono` |

---

## 5. Default skin checklist (violet night)

| Check | Source |
|-------|--------|
| Surfaces `#0b0a12` / `#161422` | staff `--bg` / `--bg-surface` |
| Accent `#a78bfa` (links only) | staff `--primary` |
| Solid CTA `#6d28d9` + white label | staff `--btn-primary-*` |
| Never light purple fill + dark text on primary buttons | design.md staff §0.3 |
| UI font Inter | staff `--font-ui` |
| Radius 4px / 6px | staff `--radius-sm` / `-md` |
| Control height ~2.35rem | staff `--control-h` |

`public/css/tokens.css` + `skins/default.css` implement this.
Chargen/play CTAs must use `--site-btn-*`, not `--site-accent` fill.

## 5a. Shipping a brand theme (Court example)

Court of Miracles is an **installable theme**, not a builtin skin.
Only `default` (UrsaMU violet night) ships inside `@ursamu/site`.

1. Keep layout + components as shipped.
2. Pack `examples/themes/court/` (`deno task pack-theme`).
3. Install via Admin theme zip, or copy to
   `theme/installed/court/` with `themeDir: "theme"`.
4. Court CSS loads its own fonts (Smythe/Lato) — not index.html.
5. Config after install:

```json
"plugins": {
  "site": {
    "skin": "court",
    "skinCss": "/site/theme/installed/court/site.css",
    "themeDir": "theme",
    "bannerImage": "/site/theme/installed/court/imgs/header.png",
    "title": "Court of Miracles"
  }
}
```

---

## 5b. Fully custom skin

1. Copy `css/skins/custom.example.css` → `theme/site.css` in your game.
2. Change token values and image URLs.
3. Point the plugin at it:

```json
"plugins": {
  "site": {
    "themeDir": "theme",
    "skinCss": "/site/theme/site.css",
    "title": "My Game",
    "bannerImage": "/site/theme/imgs/header.png"
  }
}
```

`themeDir` is the game-root folder served at `/site/theme/`.
Alternatively host CSS on a CDN and set `skinCss` to that URL.

The base stack stays; only the last stylesheet changes.

---

## 6. Width policy (Figma shell 2054:137)

**Always keep the wireframe chrome** — nav + left rail + main +
right rail (see `docs/figma-wireframe-home.md`). Tools do not get a
separate layout.

At **1728** the center column is ~885px. That is the default
`--site-main-max`. Tool modes may let the center track grow with
`1fr` so leftover width goes to main while asides stay ~331px.

| Mode | Width |
|------|--------|
| Wiki / help / home prose | Center capped at `--site-main-max` (885) |
| **Chargen** (`is-mode-chargen`) | Same 3-col shell; main fills center track; **right = Draft sheet** |
| **Play** (`is-mode-play`) | Same 3-col shell; main fills center (see §4) |
| Cards / pickers / steppers | `width: 100%` of main; grids `auto-fill` |

**Prefer** (match CoFD chargen + Figma profile 2065:349)

- Shell 3-col: left search/menu · main stage · **right “Draft sheet”**
- Catalog fields: searchable input + suggest list
  (`.cg-catalog-picker` / `.cg-merit-suggest`)
- Stage chrome: stepper · `cg-error` / `cg-ok` · `cg-actions`
- Compact hero (no banner) under fixed nav, like profile wireframe

**Avoid**

- Nesting a second summary column *inside* main
- Dropping the right rail on desktop chargen
- A second page chrome that ignores 2054:137
- Card walls for long single-choice lists (use catalog search)

Prose articles may still limit line length for readability
(`max-width` on `.site-section` / wiki body only).

---

## 7. MUST / MUST NOT

| MUST | MUST NOT |
|------|----------|
| Use `.site-*` structure | Hardcode cream/gold in layout.css |
| Override via tokens + skin file | Fork a second HTML layout per game |
| Keep Figma 3-col shell on tools | Nested two-column layouts inside main |
| Right rail = draft / context | Hide right draft on desktop chargen |
| Sticky asides only when space allows | Break mobile single-column stack |

---

## 8. Staff console vs public site

| | Staff (`@ursamu/web`) | Public (`@ursamu/site`) |
|--|----------------------|------------------------|
| Audience | Admins | Players / visitors |
| Aesthetic | design.md editorial | design.md tokens + optional ornate skin |
| Nav | App shell + side drawer | Fixed top nav + 3-col page |
| Path | `/admin/` | `/site/` (optional `/`) |

---

## 9. First paint

The plugin injects `title`, skin `href`, `bannerImage`, and `nav`
into `index.html` when serving. Clients still fetch
`/site/config.json` for live refresh after config changes.
