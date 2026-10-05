# UrsaMU Theme Studio

Standalone **visual theme builder** for
[`@ursamu/site`](https://github.com/UrsaMU/ursamu) public FE skins.

| Mode | What |
|------|------|
| **Tokens** | Edit `--site-*` with live update |
| **GrapesJS** | Locked shell canvas + style manager |
| **Live preview** | Real `site.js` (wiki / help / login) |
| **Import / Export** | Court-style theme zip |
| **Assets** | Upload imgs → bind tokens / banner |

Structure stays frozen. You skin — you don’t rebuild layout.

```
theme-studio/
  server.ts
  spec/          Phase 0 contract (tokens, selectors, draft schema)
  src/           shell, tokens, validate, import/export, apply
  public/        studio UI + Grapes client
  tests/         validation + export tests
  .draft/        working CSS + assets (gitignored)
  .preview-shell/  cached site public (gitignored)
```

### Phase 0 spec

| File | Role |
|------|------|
| [`spec/SPEC.md`](./spec/SPEC.md) | Human contract |
| `spec/tokens.json` | Canonical `--site-*` catalog |
| `spec/selectors.json` | cssExtras / Grapes allowlist |
| `spec/theme-draft.schema.json` | Draft JSON Schema `1.0.0` |

`GET /api/spec` returns the bundle. Export / save / apply run
`prepareExportPayload` (validate + filter illegal CSS).

---

## Quick start

```bash
git clone https://github.com/UrsaMU/theme-studio.git
cd theme-studio
deno task dev
# → http://127.0.0.1:4300/        studio
# → http://127.0.0.1:4300/site/   live preview (also iframe)
```

Monorepo:

```bash
cd packages/theme-studio
deno task dev
```

### Open a theme package (Phase 2)

```bash
deno run -A server.ts --theme /path/to/my-theme --open
# Save theme writes theme.json + site.css (+ assets) back to that folder
```

From **web-template** (recommended for designers):

```bash
git clone https://github.com/UrsaMU/web-template.git my-theme
cd my-theme
deno task studio
# auto-finds Theme Studio (monorepo / sibling / download)
```

First run outside the monorepo downloads `@ursamu/site` public assets
into `.preview-shell/`.

---

## Workflow

1. Set **id / label / title** in the top bar  
2. Pick a **Layout** (Home / Wiki / Article / Help / Login)  
3. Optional **Preset** (wireframe / violet night / court ember)  
4. Edit **Light / Dark** slots; enable **Export dual light/dark** if needed  
5. Watch **contrast AA** hints under presets  
6. Recolor tokens or style in **Grapes** · **Live preview**  
7. **Upload font** (`.woff2` / `.woff` / `.ttf` / `.otf`) — adds
   `@font-face` and sets UI/Display font tokens  
8. **Share draft** (JSON) · **Import draft** to resume  
9. **Save theme** (`--theme`) and/or **Export zip**  

In Grapes, in-canvas links like `#wiki` / `#login` also switch layouts.

Install on a game: **Export zip** → Admin → Settings → Public site.

Compatible starter:
[UrsaMU/web-template](https://github.com/UrsaMU/web-template).

---

## API

| Path | Role |
|------|------|
| `GET /` | Studio UI |
| `GET /site/` | Live `site.js` preview |
| `GET/POST /api/draft.css` | Draft stylesheet |
| `GET/POST /api/meta` | Manifest fields |
| `POST /api/import` | Multipart theme zip |
| `POST /api/import-css` | Bare `site.css` (+ optional manifest) |
| `POST /api/save-theme` | Write workspace (`--theme`) |
| `POST /api/open-theme` | `{ "path": "/abs/theme" }` |
| `GET /api/workspace` | Current workspace info |
| `POST /api/export` | Download theme zip |
| `POST /api/reset` | Defaults |
| `GET/POST /api/assets` | List / upload images |
| `GET /draft/assets/*` | Served draft files |
| `GET /shell/*` | Site public for Grapes canvas |
| `GET /api/catalog` | Token definitions (studio subset) |
| `GET /api/spec` | Full Phase 0 spec bundle |
| `POST /api/validate` | Validate draft without exporting |

---

## Export format

```
my-theme/
  theme.json
  site.css          ← :root tokens + extras
  GUIDE.md
  imgs/…            ← optional
```

Asset URLs in CSS are rewritten from `/draft/assets/…` to
`/site/theme/installed/<id>/…` on export.

---

## Related

| | |
|--|--|
| Engine / site package | https://github.com/UrsaMU/ursamu |
| Greyscale template | https://github.com/UrsaMU/web-template |
| FE theme guide | `packages/site/docs/fe-theme-guide.md` |

---

## License

MIT — see `LICENSE`.
