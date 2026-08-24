# @ursamu/site

Public front-end shell for UrsaMU games.

- **Layout** from the Court template (nav · banner · left / main / right · footer)
- **Tokens** from [`design.md`](./design.md) (same family as staff `design.md`)
- **Skins** as one CSS file — ship Court look or your own

## Make a FE theme (guide + example zip)

Full walkthrough:

- **[docs/fe-theme-guide.md](./docs/fe-theme-guide.md)** — package format,
  tokens, install, troubleshooting
- **Wireframe skeleton** — `examples/themes/skeleton/`
  (greys + system sans; placement/sizing only —
  `skeleton.zip`)
- **Colored starter** — `examples/themes/starter/`
  (`starter.zip`)
- **CYBER d6** — `examples/themes/cyber-d6/`
  (phosphor terminal; tokens from the React app)
- **Full brand example** — `examples/themes/court/`
  (`court.zip`)

```bash
cd packages/site

# greyscale structure gallery (standalone theme folder)
cd examples/themes/skeleton && deno task preview:open
# → http://127.0.0.1:4173/site/
# (or: deno task preview-theme examples/themes/skeleton)

# colored starter gallery
deno task preview-theme examples/themes/starter

# pack
deno task pack-theme examples/themes/skeleton
deno task pack-theme examples/themes/starter
```

Both templates ship **`preview.html`** — markdown, wiki/help,
auth, play samples, token swatches. After install:
`/site/theme/installed/<id>/preview.html`.

Upload the zip in **Admin → Settings → Public site**, or:

```bash
# game root
mkdir -p theme/installed
unzip path/to/starter.zip -d theme/installed/
```

Then set `plugins.site.skinCss` / `bannerImage` to
`/site/theme/installed/starter/…` (or activate in Admin).

## Install

```json
// deno.json
"@ursamu/site": "jsr:@ursamu/site@^0.1.0"
```

```json
// config/config.json
{
  "server": {
    "plugins": ["@ursamu/site"]
  },
  "plugins": {
    "site": {
      "skin": "default",
      "title": "My Game",
      "serveRoot": false
    }
  }
}
```

Open **`/site/`** after start.

## Skins

| Value | Look |
|-------|------|
| `default` | design.md violet night (no art) — only builtin |
| `skinCss` URL | Installed or custom theme CSS |

Brand looks (Court of Miracles, Utopia RetroWave, CYBER d6)
are **installable themes**, not builtins — so a fresh game
stays neutral. Utopia: `examples/themes/utopia/`.
CYBER d6: `examples/themes/cyber-d6/`.

### Install a theme zip (admin)

Staff can upload a theme package in
**Admin → Settings → Public site**.

**Easiest start:** use the starter zip (minimal tokens + SVG art):

```
examples/themes/starter/starter.zip
```

Or fork the folder and recolor:

```bash
cp -R examples/themes/starter ./my-theme
# edit my-theme/theme.json (id, label, title)
# edit my-theme/site.css   (--site-* tokens)
deno task pack-theme ./my-theme --out ./my-theme.zip
```

**Production brand reference:** Court of Miracles

```bash
cd path/to/@ursamu/site
deno task pack-theme examples/themes/court
# → examples/themes/court/court.zip
```

Upload the zip in the admin UI (or
`POST /api/v1/admin/site/theme` multipart `file=`).

Install writes `theme/installed/<id>/` under the game root, sets
`plugins.site.themeDir` / `skinCss` / banner, and hot-reloads
`/site/` when activated.

**theme.json** (required):

```json
{
  "id": "starter",
  "label": "UrsaMU FE Starter",
  "version": "1.0.0",
  "css": "site.css",
  "bannerImage": "imgs/header.svg",
  "title": "My UrsaMU Game"
}
```

| Package | Path |
|---------|------|
| Guide | [`docs/fe-theme-guide.md`](./docs/fe-theme-guide.md) |
| Starter source | `examples/themes/starter/` |
| Starter zip | `examples/themes/starter/starter.zip` |
| Court source | `examples/themes/court/` |
| Court zip | `examples/themes/court/court.zip` |

### Court of Miracles (after install)

```json
"plugins": {
  "site": {
    "skin": "court",
    "skinCss": "/site/theme/installed/court/site.css",
    "themeDir": "theme",
    "title": "Court of Miracles",
    "bannerImage": "/site/theme/installed/court/imgs/header.png",
    "nav": [
      { "label": "Home", "href": "/", "order": 10 },
      { "label": "Wiki", "href": "/wiki/", "order": 20 }
    ]
  }
}
```

Or copy the example tree once:

```bash
mkdir -p theme/installed
cp -R path/to/@ursamu/site/examples/themes/court \
  theme/installed/court
```

### Fully custom CSS (re-skin)

1. Copy the example skin:

```bash
mkdir -p theme
cp node_modules…/css/skins/custom.example.css theme/site.css
# or from the package after install:
#   public/css/skins/custom.example.css
```

2. Edit tokens and image URLs in `theme/site.css`.

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

`themeDir` is resolved from the game root and served under
`/site/theme/…`. Put CSS, fonts, and images there.

You can also host CSS on a CDN:

```json
"skinCss": "https://cdn.example.com/my-game.css"
```

## CSS architecture

```
/site/css/reset.css
/site/css/tokens.css       ← variables only (design.md family)
/site/css/layout.css       ← framing (no brand colors)
/site/css/components.css   ← menus, search, prose
/site/css/skins/*.css      ← brand (last wins)
```

Stable classes: `.site-shell`, `.site-nav`, `.site-banner`,
`.site-body`, `.site-aside--start|end`, `.site-main`, `.site-footer`.

See [design.md](./design.md) for the full contract.

## Config reference

| Field | Type | Default | Notes |
|-------|------|---------|--------|
| `skin` | string | `"default"` | builtin id or installed theme id |
| `skinCss` | string | — | Wins over `skin` |
| `title` | string | game name | Brand + document title |
| `bannerImage` | string | — | Hero image URL |
| `plainBg` | boolean | `false` | Drop top background art (home only) |

Wiki pages use the same home-height hero + top background as
the homepage (Figma wiki layout). Help stays compact under the nav.
| `mount` | string | `"/site"` | URL prefix |
| `serveRoot` | boolean | `false` | Also serve index at `/` |
| `themeDir` | string | — | Game dir → `/site/theme/` |
| `nav` | array | demo | `{ id?, label, href, order? }` |
| `leftMenu` | string | featured+section | Markdown-ish left rail template |
| `telnet` | string | — | Connect panel address |

### Left menu template

```text
[[section]]

## Featured
[[featured]]

## More
[[my-plugin-block]]
- [Home](/site/)
```

- `## Heading` then a block or bullet list.
- `[[name]]` / `[[name:arg]]` — built-ins `featured`, `section`;
  plugins add more via `registerSiteMenuBlock`.
- Empty blocks drop their heading (no blank sections).

## Plugin contributions

Other plugins can extend the public FE **without forking site**.
Soft-import so the game still runs if `@ursamu/site` is absent.

```ts
// in your plugin init / engine:ready
try {
  const site = await import("@ursamu/site");

  site.registerSiteNav?.({
    id: "events",
    label: "Events",
    href: "/site/p/events/",
    order: 40,
  });

  site.registerSiteStatic?.({
    id: "events",
    root: new URL("./public/", import.meta.url),
  });
  // → files at /site/p/events/

  site.registerSiteMenuBlock?.("events-links", () => ({
    items: [
      { label: "Calendar", href: "/site/p/events/" },
    ],
  }));
} catch {
  /* site optional */
}
```

| API | Effect |
|-----|--------|
| `registerSiteNav` | Top nav link (config `nav` wins on same `id`) |
| `registerSiteMenuBlock` | `[[name]]` macro for `leftMenu` |
| `registerSiteStatic` | Static tree at `/site/p/<id>/` |

Unregister mirrors: `unregisterSiteNav`, `unregisterSiteMenuBlock`,
`unregisterSiteStatic`. Call them from `plugin.remove()`.

## Dev

```bash
cd packages/site
deno task check
deno task test
# With a running game that loads @ursamu/site:
open http://127.0.0.1:4203/site/
```

Force a skin in the browser without config:

```html
<html data-skin="court">
```
