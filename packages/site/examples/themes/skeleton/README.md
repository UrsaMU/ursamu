# UrsaMU Web Template

Blank **greyscale wireframe** theme for the
[`@ursamu/site`](https://github.com/UrsaMU/ursamu) public front end
(`/site/`).

Use it to learn placement, type scale, and spacing — then fork it into
your game’s brand. No accent hue, no display fonts, no decorative art.

| | |
|--|--|
| **Package id** | `skeleton` (change me) |
| **Shell** | Real `@ursamu/site` (`site.js`) |
| **Preview** | Fixture APIs + route/auth toolbar |
| **Install** | Zip → Admin → Public site |

```
web-template/                 ← this repo (theme package)
  theme.json                  required manifest
  site.css                    greyscale wireframe skin
  preview.ts                  standalone preview (site.js fixtures)
  studio.ts                   launch Theme Studio on this folder
  pack.ts                     zip for Admin upload
  deno.json                   preview | studio | pack
  fixtures/                   preview wiki/help samples
  .preview-shell/             cached site public (gitignored)
  .theme-studio/              cached Theme Studio (gitignored)
  README.md
```

---

## Requirements

- **[Deno](https://deno.land)** — preview + pack (one install)
- A game with **`@ursamu/site`** — only for final install on a MU

---

## Quick start

### 1. Clone and rename

```bash
git clone https://github.com/UrsaMU/web-template.git my-theme
cd my-theme
```

Edit `theme.json`:

```json
{
  "id": "my-theme",
  "label": "My Theme",
  "version": "0.1.0",
  "description": "Short blurb for the admin UI",
  "css": "site.css",
  "title": "My Game",
  "plainBg": true
}
```

**`id` rules:** lowercase, start with a letter,
`[a-z][a-z0-9_-]{0,39}`. Prefer matching the folder name.

### 2. Preview (fixture shell)

```bash
deno task preview
# or open the browser for you:
deno task preview:open
# → http://127.0.0.1:4173/site/
```

No monorepo checkout. On first run the script downloads the
`@ursamu/site` public shell (css/js) into **`.preview-shell/`**
(gitignored, cached). Later runs reuse the cache.

### 2b. Theme Studio (visual editor · Phase 2)

Edit this package in the GrapesJS studio with live `site.js` preview,
token panel, import/export, and **Save** back to disk:

```bash
deno task studio
# → http://127.0.0.1:4300/
# loads this folder via --theme
```

Resolves [UrsaMU/theme-studio](https://github.com/UrsaMU/theme-studio)
from the monorepo, a sibling clone, `URSAMU_THEME_STUDIO`, or
auto-downloads into `.theme-studio/`.

| Action | Result |
|--------|--------|
| Edit tokens / Grapes | Live draft |
| **Live preview** | Real shell iframe |
| **Save theme** | Writes `theme.json` + `site.css` here |
| **Export zip** | Download for Admin upload |
| **Import zip / CSS** | Load existing work |

```bash
# optional: point at a local studio checkout
URSAMU_THEME_STUDIO=/path/to/theme-studio deno task studio
```

```bash
# force re-download shell from GitHub main
deno task preview:refresh

# or point at a local packages/site/public
URSAMU_SITE_PUBLIC=/path/to/ursamu/packages/site/public \
  deno task preview
```

Preview boots the **real** public shell (`site.js`): sticky nav,
hamburger, left menu macros, search, TOC scroll-spy, account menu,
wiki SPA, help browser, login gate — against **fixture APIs** in
this package.

**Bottom toolbar**

| Control | What it exercises |
|---------|-------------------|
| Home | Hero banner, home wiki body, featured left rail |
| Wiki | Directory table listing |
| Article | Wiki article + Related menu + TOC |
| Help | Help index / sections |
| Topic | Help topic body + crumbs |
| Login | Auth gate (any password → mock token) |
| Guest / Player / Staff | Account chip, staff nav, sign-out |
| Reload CSS | Bust skin cache after `site.css` edits |
| Narrow | ~390px frame for mobile nav |

**Fixture APIs**

| Path | Source |
|------|--------|
| `/site/config.json` | `theme.json` + preview nav/leftMenu |
| `/api/v1/wiki` | `fixtures/wiki/**/*.md` |
| `/api/v1/wiki/home` | `fixtures/wiki/home.md` |
| `/api/v1/help` | `fixtures/help/index.json` |
| `/api/v1/me` · login | Mock guest / player / staff |

Edit markdown under `fixtures/wiki/` to change gallery content.
Edit `site.css` → **Reload CSS** or hard-refresh.

### 3. Customize

| File | What to change |
|------|----------------|
| `theme.json` | `id`, `label`, `title`, optional `bannerImage` |
| `site.css` | `--site-*` colors, fonts, art URLs, polish |
| `imgs/` | optional — add when you leave wireframe |
| `fonts/` | optional `.woff2` / `.woff` |

**Wireframe cues to remove when branding:**

- Dashed borders on `.site-aside` / `.site-main`
- `aside · start` / `aside · end` `::before` labels
- Flat `radius: 0` if you want soft UI
- Pure greys → your palette

**Do not rename** stable shell classes
(`.site-shell`, `.site-nav`, `.site-main`, …). Override properties
only. Contract: [`design.md`](https://github.com/UrsaMU/ursamu/blob/main/packages/site/design.md)
in `@ursamu/site`.

Asset URLs after install look like:

```css
--site-bg-image-top: url("/site/theme/installed/my-theme/imgs/bg.png");
```

### 4. Pack a zip

**From this repo** (recommended):

```bash
deno task pack
# → ./<folder-name>.zip
```

**Plain zip** (folder name must equal `theme.json` `id`):

```bash
cd /path/to/parent
zip -r my-theme.zip my-theme \
  -x "*.zip" -x "**/.DS_Store" -x "**/.git/**" \
  -x "**/.preview-shell/**"
```

Zip root must be:

```
my-theme/theme.json
my-theme/site.css
…
```

not bare `theme.json` at the archive root.

### 5. Install on a game

1. Game running with `"@ursamu/site"` in plugins  
2. **Admin → Settings → Public site**  
3. Upload zip → activate  

Manual:

```bash
# game root
mkdir -p theme/installed
unzip my-theme.zip -d theme/installed/
```

```json
"plugins": {
  "site": {
    "skin": "my-theme",
    "themeDir": "theme",
    "skinCss": "/site/theme/installed/my-theme/site.css",
    "title": "My Game",
    "plainBg": true
  }
}
```

Open `/site/` and hard-refresh.

---

## `theme.json` fields

| Field | Required | Meaning |
|-------|----------|---------|
| `id` | yes | Theme id / install folder name |
| `label` | yes | Admin UI name |
| `css` | yes | Main CSS path inside the package |
| `version` | no | Semver string |
| `description` | no | Admin blurb |
| `bannerImage` | no | Hero image path (relative) |
| `logoImage` | no | Nav logo path (relative) |
| `title` | no | Sets `plugins.site.title` on activate |
| `plainBg` | no | `true` = no top background art |

### Upload limits

| Limit | Value |
|-------|--------|
| Zip size | 20 MB |
| Files | 250 |
| Per file | 8 MB |
| Extensions | `css` `json` `html` `png` `jpg` `jpeg` `webp` `gif` `svg` `woff` `woff2` `ttf` `otf` `md` `txt` |

No `..` paths, no hidden dotfiles.

---

## What’s intentional (wireframe)

| Choice | Why |
|--------|-----|
| Greys only | No brand distraction |
| `system-ui` sans | Neutral default face |
| `plainBg: true` | No background art |
| No `imgs/` | Structure without chrome art |
| Dashed column borders | Rails vs main read as boxes |
| Region labels | Layout map while designing |
| Radius `0` | Flat wireframe, not soft UI |
| Figma 2054:137 geometry | Canonical shell sizes |

## What’s missing on purpose

- Brand accent / violet night defaults  
- Display typefaces  
- Banner / footer / rule / search art  
- Soft shadows and rounded chips  
- Chromatic status colors (success/warn/error are grey too)  

When you want a colored starting palette instead of greys, see
`examples/themes/starter` in
[`@ursamu/site`](https://github.com/UrsaMU/ursamu/tree/main/packages/site/examples/themes/starter).

---

## CSS stack (for context)

Your `site.css` is the last layer:

```
reset.css → tokens.css → layout.css → components.css → site.css
```

Override `--site-*` tokens first; layout and components already
consume them. Full token list and class contract:
[packages/site/design.md](https://github.com/UrsaMU/ursamu/blob/main/packages/site/design.md)
· guide:
[packages/site/docs/fe-theme-guide.md](https://github.com/UrsaMU/ursamu/blob/main/packages/site/docs/fe-theme-guide.md).

---

## Checklist before upload

- [ ] Gallery looks right (`preview-theme` or installed `preview.html`)
- [ ] `theme.json` `id` matches folder name
- [ ] `css` path exists in the package
- [ ] Asset URLs use `/site/theme/installed/<id>/…`
- [ ] Zip contains `<id>/theme.json` (not bare root files)
- [ ] Activated in Admin; `/site/` hard-refreshed

---

## Related

| Resource | Link |
|----------|------|
| UrsaMU engine | https://github.com/UrsaMU/ursamu |
| **Theme Studio (GrapesJS)** | https://github.com/UrsaMU/theme-studio |
| `@ursamu/site` package | `packages/site` in that repo |
| FE theme guide | `packages/site/docs/fe-theme-guide.md` |
| Design contract | `packages/site/design.md` |
| Court brand example | `packages/site/examples/themes/court` |

---

## License

MIT — same terms as UrsaMU. See the monorepo `LICENSE` or add one
at the root of this repository when publishing.
