# FE wireframe skeleton

> Full docs for publishing / GitHub: see **[README.md](./README.md)**.

Blank **greyscale** theme for layout, type scale, and spacing.
No brand hue, no decorative art, one system sans-serif stack.

Use this to:

- See column placement (left / main / right)
- Check nav height, gutters, banner slab, search size
- Review markdown / wiki / auth / play structure
- Fork into a real brand (then switch to `starter` colors)

## Preview (standalone)

```bash
# from this theme folder (or the web-template clone)
deno task preview:open
# → http://127.0.0.1:4173/site/
```

No monorepo needed. Shell CSS/JS downloads to `.preview-shell/`
on first run. Real `site.js` + fixtures + bottom toolbar
(routes, Guest/Player/Staff, Reload CSS).

## What’s intentional

| Choice | Why |
|--------|-----|
| Greys only | No brand distraction |
| `system-ui` sans | Neutral default face |
| `plainBg: true` | No background art |
| No `imgs/` | Structure without chrome art |
| Dashed column borders | Rails vs main read as boxes |
| `aside · start` labels | Region map (remove when branding) |
| Radius `0` | Flat wireframe, not soft UI |
| Wireframe geometry tokens | Figma 2054:137 sizes kept |

## What’s missing on purpose

- Accent color / violet night
- Display font
- Banner / footer / rule images
- Search icon art
- Soft shadows, rounded chips
- Status colors (success etc. are grey too)

## Fork into a brand

```bash
cp -R examples/themes/skeleton ./my-theme
# 1. theme.json → new id, label, title; plainBg as needed
# 2. site.css → real --site-* hues, fonts, art URLs
# 3. drop region ::before labels + dashed borders
# 4. add imgs/ if you want art
deno task preview-theme ./my-theme
deno task pack-theme ./my-theme
```

Or start from `examples/themes/starter/` when you already
want a colored token set.

## Pack / install

```bash
deno task pack-theme examples/themes/skeleton
# → examples/themes/skeleton/skeleton.zip
```

Upload in **Admin → Settings → Public site**, or:

```bash
unzip skeleton.zip -d theme/installed/
```

Gallery after install:

```
/site/theme/installed/skeleton/preview.html
```

## Full docs

`docs/fe-theme-guide.md` · contract: `design.md` ·
colored template: `examples/themes/starter/`
