# CYBER d6 theme

Phosphor terminal skin for `@ursamu/site`. Forked from the
starter theme package; tokens remapped from the React app.

> Full docs: **[README.md](./README.md)** · Studio:
> https://github.com/UrsaMU/theme-studio

## Commands

```bash
deno task preview:open   # fixture site.js gallery
deno task studio         # Theme Studio on this folder
deno task pack           # → cyber-d6.zip
```

## Token map

| cyber-d6 | hex | `--site-*` |
|----------|-----|------------|
| bg / ink | `#04090a` | bg, code, btn-fg, on-accent |
| panel | `#08191a` | elevated, surface |
| dimLine | `#0e3230` | border-subtle, surface-2 |
| line | `#14514c` | border, border-strong |
| phosphor | `#31ded2` | accent, btn-bg, success |
| text | `#c9fffa` | text |
| mid | `#5fc9c2` | secondary, accent-hover |
| dim | `#2f9c95` | muted |
| alert | `#ff4d7d` | error, warning |
| alertDim | `#7a2038` | error fill |
| mono | Courier New | ui / display / mono |
| space | 4 6 10 14 | pad / gutter |
| radius | 0 | radius-sm / md |

## Layout

```
cyber-d6/
  theme.json
  site.css
  fixtures/          preview wiki/help
  preview.ts
  studio.ts
  pack.ts
  deno.json
```

No `imgs/` — the source app is a bare terminal.
