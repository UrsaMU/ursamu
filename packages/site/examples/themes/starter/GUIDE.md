# UrsaMU FE starter theme

Colored **violet-night** starter for `@ursamu/site`.
Fork, recolor, swap art, pack, upload.

> Full docs: **[README.md](./README.md)** · Studio:
> https://github.com/UrsaMU/theme-studio

## Commands

```bash
deno task preview:open   # fixture site.js gallery
deno task studio         # Theme Studio on this folder
deno task pack           # → starter.zip
```

## Layout

```
starter/
  theme.json
  site.css
  imgs/
  fixtures/          preview wiki/help
  preview.ts
  studio.ts
  pack.ts
  deno.json
```

Asset URLs in `site.css` use `/site/theme/installed/starter/…`.
Change `id` in theme.json when you rename the folder.
