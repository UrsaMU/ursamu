# Changelog

## 0.1.7

- Fix flashing home/Welcome page content during wiki page navigation:
  - Blank initial section title and skeleton pulse placeholder in `index.html`
  - Instant loading state injection in `site.js`
  - SPA router and `popstate` link handler to prevent full browser reloads


- Wiki: nested paths no longer 404 (`lore/city` was encoded as
  `lore%2Fcity`). Encode path segments; keep `/`.
- Wiki index `/wiki/` lists pages instead of stuck "Loading…"
- Directory API responses render a section listing
- Wiki mode hides site hero banner; document title is
  `Page · Site` (not site title alone on every page)

## 0.1.5

- JSR-safe public assets: serve `public/` via `fetch(import.meta.url)`
  when the package is loaded from `https://jsr.io/…` (no
  `fromFileUrl` on non-file URLs). Path checkouts still use disk.
- `listBuiltinSkins` returns shipped names under JSR (no readdir).

## 0.1.4

- Theme hot-reload: `setSiteRuntime` uses process-wide
  `globalThis` so admin activate reaches the live FE even when
  `@ursamu/web` and the site plugin resolve different module URLs
- `liveSkinHref` adds `g=<gen>` cache-bust after each theme swap
- `site.js` no longer overwrites server `skin` with stale HTML
  `data-skin` when `skinCss` is empty
- Import `registerPluginRoute` from `@ursamu/mush` (not bare
  `ursamu`) to share the game's route registry

## 0.1.3

- `serveRoot`: SPA at `/`, `/login`, `/profile`, `/wiki/*`
  (for apex hosts like court.ursamu.io)
- Client links honor apex vs `/site` mount
- Works with mush 1.0.7+ (`/` no longer always → /admin/)

## 0.1.2

- Compact layout when hero title and banner image are empty
  (Figma no-banner: content sits under nav)
- Empty `plugins.site.title` from admin stays empty (Court
  skin no longer re-fills "Court of Miracles")
- Theme zip install: `installThemeZip`, `listAllThemes`,
  `registerSiteTheme`; Court example package + `pack-theme`
- Cache-bust `SITE_ASSET_V` → `20260802k`

## 0.1.1

- Theme zip packages: `theme.json` + `site.css` + assets
- `installThemeZip` / `listAllThemes` / `registerSiteTheme`
- Install under `theme/installed/<id>/` (served via `themeDir`)
- Court example: `examples/themes/court/` + `deno task pack-theme`
- Admin upload: `POST /api/v1/admin/site/theme` (via `@ursamu/web`)

## 0.1.0

- Initial public front-end shell from court-template framing
- design.md token stack (`reset → tokens → layout → components → skin`)
- Built-in skins: `default` (violet night), `court` (Court of Miracles)
- Custom re-skin via `plugins.site.skinCss` + optional `themeDir`
- Server-side HTML injection for title / skin / banner / nav (no FOUC)
- Example skin: `public/css/skins/custom.example.css`
