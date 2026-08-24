# UrsaMU Theme Draft Spec (Phase 0)

**Version:** `1.0.0`  
**Package:** `@ursamu/theme-studio` + `@ursamu/site` skins  
**Status:** normative for Theme Studio import / export / apply

This document freezes what a theme may change. Layout HTML and
`.site-*` **class names** are owned by `@ursamu/site`. Themes supply
tokens, optional extra CSS on an allowlist, and assets.

---

## 1. Artifacts

| File | Role |
|------|------|
| `spec/tokens.json` | Editable `--site-*` catalog |
| `spec/selectors.json` | Safe CSS selector allowlist |
| `spec/theme-draft.schema.json` | JSON Schema for draft payloads |
| `spec/SPEC.md` | This contract |

Studio loads these at runtime (`GET /api/spec`). Validators in
`src/validate.ts` enforce them on export, save, apply, and import.

---

## 2. Theme package (on disk / zip)

```
<id>/
  theme.json     required
  site.css       required
  imgs/…         optional
  fonts/…        optional
  GUIDE.md       optional
```

### 2.1 `theme.json`

| Field | Required | Rules |
|-------|----------|--------|
| `id` | yes | `^[a-z][a-z0-9_-]{0,39}$` |
| `label` | yes | non-empty string |
| `css` | yes* | relative path, default `site.css` |
| `version` | no | semver-ish string |
| `title` | no | sets `plugins.site.title` on activate |
| `bannerImage` | no | relative image path |
| `logoImage` | no | relative image path |
| `plainBg` | no | boolean |
| `description` | no | admin blurb |

\* Or plugin-registered `skinCss` URL outside zip install.

### 2.2 `site.css`

1. Prefer a single `:root { … }` block of `--site-*` custom properties  
2. Optional extra rules **only** for allowlisted selectors  
3. After install, asset URLs must be absolute under  
   `/site/theme/installed/<id>/…`  
4. Do **not** rename or redefine layout structure classes as new
   elements — override properties only  

---

## 3. Theme Draft (studio transport)

In-memory / API payload version **`1.0.0`**:

```json
{
  "specVersion": "1.0.0",
  "manifest": { "id": "my-theme", "label": "My Theme", … },
  "tokens": { "--site-bg": "#f0f0f0", … },
  "tokensLight": { "…": "…" },
  "tokensDark": { "…": "…" },
  "activeMode": "light",
  "dual": false,
  "presetId": "skeleton",
  "cssExtras": "/* allowlisted rules only */",
  "assets": { "imgs/header.png": "<base64 optional>" }
}
```

Schema: `theme-draft.schema.json`.

**Dual light/dark (Phase 5):** when `dual` is true and both
`tokensLight` / `tokensDark` are set, export emits light `:root`
plus `@media (prefers-color-scheme: dark)` and
`:root[data-theme="dark"]` / `.site-shell[data-theme="dark"]`.

**Presets:** `spec/presets.json` (skeleton, violet-night, court-ember).

**Shareable draft:** download/upload `*.draft.json` (no server hosting).

### 2.3 postMessage bridge (live preview)

Parent (studio) → iframe (`/site/`):

```json
{ "type": "ursamu-theme-draft", "css": "/* full site.css text */" }
```

Iframe → parent when ready:

```json
{ "type": "ursamu-theme-ready" }
```

Iframe injects/updates `#ursamu-live-draft` and cache-busts
`[data-site-skin]`.

---

## 4. Tokens

Canonical list: **`tokens.json`**.

- Every skin-editable variable is named `--site-*`  
- `kind`: `color` | `text` | `size` | `image`  
- `default`: Theme Studio / wireframe starter value  
- `engineDefault`: `@ursamu/site` `public/css/tokens.css` value  
  (violet night) when it differs  

Themes **should** set tokens rather than hard-coding colors on
components. Unknown `--site-*` keys are allowed as passthrough but
warned. Non-`--site-*` custom properties in `:root` are rejected.

---

## 5. Selector allowlist (cssExtras / Grapes)

Canonical list: **`selectors.json`**.

### Allowed

- Selectors that match an allowlist pattern (e.g. `.site-nav__brand`)  
- Simple property overrides (color, font, background, border, …)  
- `@font-face` with `url()` under theme package paths  

### Forbidden

- Renaming / inventing structural IDs that replace the shell  
- `position: fixed` on `.site-body` children (layout break risk) —
  warned, not always hard-fail  
- `@import` of remote stylesheets  
- `behavior:`, `expression(`, `-moz-binding`  
- Selectors targeting `html`, `body`, or universal `*` at root
  (except inside allowlisted blocks)  
- Adding new interactive controls that replace site.js chrome  

GrapesJS runs in **skin mode**: structure locked; exported component
CSS is filtered through the same allowlist.

---

## 6. Validation levels

| Level | When | Behavior |
|-------|------|----------|
| `error` | export / save / apply | Reject payload |
| `warn` | import / export | Accept; surface messages in API/UI |

Hard errors include: bad `id`, missing `label`, empty CSS, forbidden
constructs in extras, path traversal in assets.

---

## 7. Stability

- **Class names** in `design.md` §2 are stable forever for skins  
- **Token names** in `tokens.json` are append-only within a major
  `specVersion`; renames require a new major  
- Studio and `web-template` must not invent parallel token names  

---

## 8. Related

- `@ursamu/site` → `design.md`, `public/css/tokens.css`  
- Install API → `POST /api/v1/admin/site/theme`  
- Template → https://github.com/UrsaMU/web-template  
- Studio → https://github.com/UrsaMU/theme-studio  
