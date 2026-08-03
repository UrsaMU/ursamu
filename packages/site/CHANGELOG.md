# Changelog

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
