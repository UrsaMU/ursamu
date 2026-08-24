# Guide: Make an UrsaMU public FE theme

This guide shows how to build an **installable front-end theme** for
`@ursamu/site` — the public shell at `/site/` (home, wiki chrome, play
shell framing, chargen pages that use site tokens).

You ship a **zip**. Staff upload it in Admin. No fork of `@ursamu/site`
required.

---

## 1. Concepts

| Term | Meaning |
|------|---------|
| **Shell** | HTML + layout CSS shipped by `@ursamu/site` |
| **Tokens** | `--site-*` CSS variables (colors, type, geometry) |
| **Theme package** | Zip: `theme.json` + `site.css` + optional art/fonts |
| **Skin** | The active brand CSS (`skin` id or `skinCss` URL) |

**Stable class names** (never rename in your CSS):

`.site-shell` · `.site-nav` · `.site-nav__brand` · `.site-nav__list` ·
`.site-banner` · `.site-body` · `.site-aside--start` · `.site-main` ·
`.site-aside--end` · `.site-footer` · `.site-search` · `.site-menu` ·
`.site-section` · `.site-rule`

Full contract: [`design.md`](../design.md).

---

## 2. Fastest path

Two example packages:

| Package | Use when |
|---------|----------|
| **`skeleton`** | Wireframe first — greys, system sans, spacing/placement |
| **`starter`** | Colored violet-night + SVG art; same preview/studio/pack |
| **`cyber-d6`** | Phosphor terminal; tokens copied from the React app |

### A. Wireframe skeleton (structure only)

```bash
# Standalone (clone of UrsaMU/web-template or this folder)
cd examples/themes/skeleton   # or your clone root
deno task preview:open
# → http://127.0.0.1:4173/site/

# Visual editor (Theme Studio) on this package — Phase 2
deno task studio
# → http://127.0.0.1:4300/  (--theme this folder, Save enabled)

deno task pack
# → ./skeleton.zip
```

From the monorepo site package:

```bash
cd packages/site
deno task preview-theme examples/themes/skeleton --open
cd ../theme-studio && deno run -A server.ts \
  --theme ../site/examples/themes/skeleton --open
```

Greyscale paper look, dashed column boxes, no brand hue or art.
Best for measuring nav / rails / type scale before skinning.

Preview boots the **production shell** (`site.js`) against fixture
APIs under `fixtures/` — not a static HTML mock. No monorepo
required: `preview.ts` fetches shell assets from GitHub when needed.

### B. Colored starter

```bash
deno task pack-theme examples/themes/starter
# → examples/themes/starter/starter.zip
```

### C. Preview while you design (no game server)

```bash
cd packages/site
deno task preview-theme examples/themes/skeleton
# or: examples/themes/starter
# → http://127.0.0.1:4173/
#    full markdown / wiki / help / auth / play gallery
```

```bash
deno task preview-theme ./my-neon-city --open
```

The gallery is `preview.html` in the theme folder. It loads shell CSS
from `public/` and your `site.css` as
`/site/theme/installed/<id>/site.css`. Edit tokens, hard-refresh
(or click **Reload CSS**).

After install on a live game you can also open:

```
/site/theme/installed/<id>/preview.html
```

### D. Customize

```bash
cp -R examples/themes/skeleton ./my-neon-city
# or: examples/themes/starter
# edit my-neon-city/theme.json  (change id + label + title)
# edit my-neon-city/site.css    (colors, fonts)
# add/replace imgs/* when you leave wireframe
```

**Critical:** set `"id"` in `theme.json` to your folder name
(e.g. `my-neon-city`), and update CSS paths:

```css
--site-bg-image-top: url("/site/theme/installed/my-neon-city/imgs/background.svg");
```

### C. Pack

```bash
deno task pack-theme ./my-neon-city --out ./my-neon-city.zip
```

### D. Install

1. Game running with `"@ursamu/site"` in plugins  
2. **Admin → Settings → Public site**  
3. Upload zip → activate  

Manual:

```bash
# game root
mkdir -p theme/installed
unzip my-neon-city.zip -d theme/installed/
```

```json
"plugins": {
  "site": {
    "skin": "my-neon-city",
    "themeDir": "theme",
    "skinCss": "/site/theme/installed/my-neon-city/site.css",
    "bannerImage": "/site/theme/installed/my-neon-city/imgs/header.svg",
    "title": "Neon City"
  }
}
```

---

## 3. Package format

### Zip layout

The packer stores paths as **`<folderName>/file`**:

```
my-theme/
  theme.json
  site.css
  imgs/header.png
  imgs/background.png
  fonts/display.woff2
```

After install:

```
<game>/theme/installed/my-theme/...
```

Served as:

```
/site/theme/installed/my-theme/site.css
/site/theme/installed/my-theme/imgs/header.png
```

### theme.json

```json
{
  "id": "my-theme",
  "label": "My Theme",
  "version": "1.0.0",
  "description": "Short blurb for admin UI",
  "css": "site.css",
  "bannerImage": "imgs/header.png",
  "logoImage": "imgs/logo.png",
  "title": "My Game Title",
  "plainBg": false
}
```

| Field | Rules |
|-------|--------|
| `id` | `^[a-z][a-z0-9_-]{0,39}$` |
| `css` | Relative path inside package |
| images | Relative; must exist |

### Upload limits

| Limit | Value |
|-------|--------|
| Zip size | 20 MB |
| Files | 250 |
| Per file | 8 MB |
| Extensions | css, json, html, png, jpg, jpeg, webp, gif, svg, woff, woff2, ttf, otf, md, txt |

No `..`, no hidden dotfiles.

---

## 4. Writing `site.css`

### Prefer tokens

Override variables first — layout and components already consume them:

```css
:root {
  --site-bg: #0a0a0f;
  --site-text: #f5f5ff;
  --site-accent: #00e5a8;
  --site-btn-bg: #00c896;
  --site-btn-fg: #04120e;
  --site-font-display: "Orbitron", sans-serif;

  --site-bg-image-top: url("/site/theme/installed/my-theme/imgs/bg.png");
  --site-bg-image-bottom: url("/site/theme/installed/my-theme/imgs/footer.png");
  --site-rule-image: url("/site/theme/installed/my-theme/imgs/hr.svg");
  --site-search-icon: url("/site/theme/installed/my-theme/imgs/search.svg");
}
```

### Token cheat sheet

| Token | Use |
|-------|-----|
| `--site-bg` | Page background |
| `--site-bg-elevated` / `--site-bg-surface*` | Cards / panels |
| `--site-text` / `-muted` | Body / secondary |
| `--site-accent` | Links, titles, active nav |
| `--site-btn-bg` / `-fg` | Primary buttons |
| `--site-border*` | Lines / inputs |
| `--site-font-ui` / `-display` | Body / brand |
| `--site-bg-image-top` / `-bottom` | Full-bleed art |
| `--site-banner-offset` | Space under fixed nav |
| `--site-max-w` / `--site-main-max` | Widths |
| `--site-aside-min` / `-max` | Rails |
| `--site-success` / `-warning` / `-error` | Status |

### Optional class polish

Safe overrides (properties only):

```css
.site-nav__brand { font-size: 1.75rem; }
.site-banner { min-height: 14rem; }
.play-prompt__send { border-radius: 4px; }
```

### Local fonts

```css
@font-face {
  font-family: "BrandDisplay";
  src: url("/site/theme/installed/my-theme/fonts/brand.woff2")
    format("woff2");
  font-display: swap;
}
:root {
  --site-font-display: "BrandDisplay", serif;
}
```

---

## 5. Art tips

| Asset | Typical role | Notes |
|-------|--------------|--------|
| `imgs/header.*` | Hero / banner | Wide crop; set as `bannerImage` |
| `imgs/background.*` | Top page wash | `--site-bg-image-top` |
| `imgs/footer.*` | Bottom wash | `--site-bg-image-bottom` |
| `imgs/hr.*` | Section rule | SVG works well |
| `imgs/search.*` | Search button | 24×24-ish |
| `imgs/sep-top.*` | Media **top** end-cap | Bracket on the right |
| `imgs/sep-bottom.*` | Media **bottom** end-cap | Bracket on the left |

PNG/WebP for photos; SVG for UI chrome. Starter ships SVG placeholders
you can replace.

### Media seps (`sep-top` / `sep-bottom`)

```
[======== CSS hairline ========][sep-top]     ← top rail
┌──────────────────────────────┐
│            IMAGE             │
└──────────────────────────────┘
[sep-bottom][======== hairline ========]     ← bottom rail
```

| Asset | Role |
|-------|------|
| `sep-top.svg` (~53×15) | Top-rail **end cap** (right); also title underline bracket |
| `sep-bottom.svg` (~53×15) | Bottom-rail **end cap** (left) |
| CSS hairline | Long tail between caps (`--site-sep-line-color`) |
| Banner (`.site-media--banner`) | **No seps** |

Open-end insets (default 25px): top rail `right: 25px`, bottom rail
`left: 25px`.

```css
:root {
  --site-sep-top: url("…/imgs/sep-top.svg");
  --site-sep-bottom: url("…/imgs/sep-bottom.svg");
  --site-sep-h: 15px;
  --site-sep-pad-y: 15px;       /* >= h so rails sit above/below img */
  --site-sep-inset-end: 25px;
  --site-sep-bracket-w: 53px;   /* native cap width */
  --site-sep-line-color: rgba(255, 255, 255, 0.5);
}
```

**Portrait** (Figma `1713:1955`): same rails via
`.termv-char__portrait.site-media` / `.site-media--portrait`.

| Element | Seps? |
|---------|-------|
| Content media / sheet art / **portrait** | **Yes** |
| Logo (`.site-media--banner`) | No |
| Nav / account avatar | No |

Starter: `examples/themes/starter/imgs/sep-{top,bottom}.svg`.

---

## 6. Two install modes

### A. Theme zip (recommended for brands)

Admin upload → `theme/installed/<id>/` + config fields set on activate.

### B. Loose `themeDir` (dev)

```bash
mkdir -p theme
cp site.css theme/site.css
# assets under theme/imgs/
```

```json
"plugins": {
  "site": {
    "themeDir": "theme",
    "skinCss": "/site/theme/site.css",
    "bannerImage": "/site/theme/imgs/header.png",
    "title": "Dev Skin"
  }
}
```

Use absolute `/site/theme/…` URLs in CSS for this mode (no `installed/<id>`).

---

## 7. Plugin-registered themes (advanced)

Games/plugins can register without a zip:

```ts
import { registerSiteTheme } from "@ursamu/site";

registerSiteTheme({
  id: "cyber-night",
  label: "Cyber Night",
  source: "registered",
  skinCss: "/site/p/myplugin/theme.css",
  bannerHref: "/site/p/myplugin/banner.png",
  title: "Cyber Night",
});
```

Serve static files via `registerSiteStatic`.

---

## 8. Chargen / play / CPR sheets

- **Shell chrome** (nav, rails, footer) → site theme tokens  
- **Play bubbles / OOC tags** → mostly `play.css` + `--site-*`  
- **CPR chargen sheet** → `cpr-sheet.css` / chargen CSS; still reads many
  `--site-*` values when nested in the shell  

If chargen looks “unstyled”, ensure `/site/` CSS loaded and your theme
does not zero out required tokens.

---

## 9. Reference packages

| Path | What |
|------|------|
| `examples/themes/skeleton/` | Greyscale wireframe (structure only) |
| `examples/themes/skeleton/skeleton.zip` | Wireframe zip |
| `examples/themes/starter/` | Colored starter + preview/studio/pack (parity) |
| `examples/themes/starter/starter.zip` | Colored starter zip |
| `examples/themes/court/` | Full production brand (Court of Miracles) |
| `public/css/skins/custom.example.css` | Loose-file skin sketch |
| `public/css/tokens.css` | Default token values |
| `design.md` | Class + token contract |
| `scripts/preview-theme.ts` | Local gallery server |
| [`packages/theme-studio`](../../theme-studio/) | GrapesJS visual skin builder (own project) |
| https://github.com/UrsaMU/theme-studio | Standalone Theme Studio clone |
| `packages/theme-studio/spec/SPEC.md` | Phase 0 theme draft contract |

```bash
deno task preview-theme examples/themes/skeleton
deno task preview-theme examples/themes/starter
deno task pack-theme examples/themes/court
```

---

## 10. Troubleshooting

| Symptom | Fix |
|---------|-----|
| Upload rejected | Check zip layout (`id/theme.json`), extensions, size |
| CSS 404 | Paths must be `/site/theme/installed/<id>/…` after zip install |
| Still default violet | Hard-refresh; confirm `skinCss` in config; theme activated |
| Banner missing | `bannerImage` path + file inside zip |
| Fonts missing | `@font-face` URL + files under `fonts/` |
| Layout broken | You renamed a `.site-*` class — restore name |

---

## 11. Checklist

- [ ] `theme.json` valid id + label + css  
- [ ] `site.css` only overrides tokens / decorations  
- [ ] Asset URLs match install path  
- [ ] `deno task preview-theme` gallery looks right  
  (headings, tables, code, auth, play samples)  
- [ ] Packed with `deno task pack-theme`  
- [ ] Uploaded and activated  
- [ ] `/site/` hard-refresh looks correct  
- [ ] Play + chargen still readable  

---

## 12. API (automation)

```
POST /api/v1/admin/site/theme
Content-Type: multipart/form-data
file=<theme.zip>
```

(Staff auth required — same session as Admin.)

---

*Package: `@ursamu/site` · Starter: `examples/themes/starter`*
