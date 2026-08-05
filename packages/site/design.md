# @ursamu/site — Public front-end design contract

**Product:** Player-facing site shell (not the staff console).

**Layout source:** court-template framing — fixed top nav, optional
hero banner, sticky left / main / right columns, footer.

**Visual system:** Same token family as
[`packages/web/design.md`](../web/design.md) (UrsaMU violet night).
Skins remap tokens + optional art to brand a game (e.g. Court cream /
gold).

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

---

## 5. Shipping a brand theme (Court example)

Court of Miracles is an **installable theme**, not a builtin skin.
Only `default` ships inside `@ursamu/site`.

1. Keep layout + components as shipped.
2. Pack `examples/themes/court/` (`deno task pack-theme`).
3. Install via Admin theme zip, or copy to
   `theme/installed/court/` with `themeDir: "theme"`.
4. Config after install:

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

## 5. Fully custom skin

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

## 6. MUST / MUST NOT

| MUST | MUST NOT |
|------|----------|
| Use `.site-*` structure | Hardcode cream/gold in layout.css |
| Override via tokens + skin file | Fork a second HTML layout per game |
| Keep main column readable (~45–75ch) | Full-width prose walls without max-width |
| Sticky asides only when space allows | Break mobile single-column stack |

---

## 7. Staff console vs public site

| | Staff (`@ursamu/web`) | Public (`@ursamu/site`) |
|--|----------------------|------------------------|
| Audience | Admins | Players / visitors |
| Aesthetic | design.md editorial | design.md tokens + optional ornate skin |
| Nav | App shell + side drawer | Fixed top nav + 3-col page |
| Path | `/admin/` | `/site/` (optional `/`) |

---

## 8. First paint

The plugin injects `title`, skin `href`, `bannerImage`, and `nav`
into `index.html` when serving. Clients still fetch
`/site/config.json` for live refresh after config changes.
