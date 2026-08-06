# Changelog

## 0.1.78

- Fix hero logo on `/`: SSR no longer emits a second
  `class="has-image"` attribute (browsers dropped it, so
  the title showed and the banner logo looked missing)
- `GET /site/config.json` includes `logoImage` for nav brand
- SPA return to home unhides banner after help/play/chargen
- Cache-bust SITE_ASSET_V → 20260806homelogo

## 0.1.77

- Mobile profile/account: no nested dropdown — Staff
  console + Sign out always visible in hamburger with
  48px tap targets; fix stacked document click handlers
- Cache-bust SITE_ASSET_V → 20260805acctm

## 0.1.76

- /play WS: after first live open use ?reconnect=true
- Cache-bust SITE_ASSET_V → 20260805recon

## 0.1.75

- Chargen stage 3: merit-style search pickers for seeming,
  kith, court, and second favored Regalia (with detail blurbs)
- Seeming/kith chosen in either order; favored list excludes
  seeming's built-in Regalia
- Cache-bust `SITE_ASSET_V` → `20260805catpick`

## 0.1.74

- Chargen demo catalog: drop Werewolf card (closed in cofd 1.2.8)
- Cache-bust `SITE_ASSET_V` → `20260805noww`

## 0.1.73

- Tablet/mobile: buttons grow full width — play SEND, look
  exit chips, chargen Back/Next/primary actions
- Cache-bust `SITE_ASSET_V` → `20260805btngrow`

## 0.1.72

- Fix mobile overflow: Court banner logo no longer
  `max-width: none` (header art was 659px wide)
- Banner + nav brand shrink on ≤1024px; body pad tightened
- Cache-bust `SITE_ASSET_V` → `20260805moblogo`

## 0.1.71

- Nav `logoImage` (config / theme): brand shows img when set
- Logo shrinks on tablet/mobile (≤1024px, ~28px tall)
- Cache-bust `SITE_ASSET_V` → `20260805logosm`

## 0.1.70

- Mobile / hamburger / stacked layout starts at **≤1024px**
  (tablet), was ≤720px
- Cache-bust `SITE_ASSET_V` → `20260805tab1024`

## 0.1.69

- `/play`: `+cg` / `+chargen` open Character tab (`/chargen`)
- `SiteShell.navigate` for SPA jumps from the play client
- Cache-bust `SITE_ASSET_V` → `20260805cgredir`

## 0.1.68

- Hide wiki search box on `/play` (game client only)
- Cache-bust `SITE_ASSET_V` → `20260805nosearch`

## 0.1.67

- Play +sheet layout: stat-cols (dots), health/willpower tracks,
  zebra merit lists
- Cache-bust `SITE_ASSET_V` → `20260805sheet`

## 0.1.66

- Play layout polish for inventory / glance entity lists
- Cache-bust `SITE_ASSET_V` → `20260805invgl`

## 0.1.65

- Play chat: OOC badge + muted OOC bubbles (`kind: ooc`)
- Play layout polish for `who` entity lists
- Cache-bust `SITE_ASSET_V` → `20260805oocwho`

## 0.1.64

- Merit zebra stripes use theme tokens (`--site-bg-surface` /
  `--site-accent-muted`) so Court gold/cream skins match
- Cache-bust `SITE_ASSET_V` → `20260805zebrat`

## 0.1.63

- Live sheet Merits: zebra-striped rows, no per-item divider lines
- Cache-bust `SITE_ASSET_V` → `20260805zebra`

## 0.1.62

- `/play` stays connected across SPA navigations (WS kept alive)
- Nav Play badge: count of new entries since last catch-up
- Chat-style **New** divider when not autoscrolling; clears when
  the last new post is reached (or bottom is hit)
- Cache-bust `SITE_ASSET_V` → `20260805playkeep`

## 0.1.61

- Live character sheet: Advantages moved to the bottom
- Health shown as CoFD boxes (empty / bashing / lethal / agg),
  matching `+sheet` / `+health`; Willpower as filled boxes
- Cache-bust `SITE_ASSET_V` → `20260805hbox`

## 0.1.60

- Play input grows with typed text (min 55px, max 300px);
  output column flex-shrinks. Scrolls inside field past max.
- Shift+Enter still inserts a newline; Enter sends.
- Cache-bust `SITE_ASSET_V` → `20260805inpgrow`

## 0.1.59

- Command input echo is faded (opacity ~0.42, muted color)
- Plain text only — no MUSH color codes on `> cmd` lines
- Cache-bust `SITE_ASSET_V` → `20260805cmdefade`

## 0.1.54

- `/play` requires login again — guests redirect to `/login?next=/play`
- Mobile look rows: flex shrink (tighter cols) kept


## 0.1.47

- Fix play.js parse error (block comment closed by `on*/`)
- `/play` mounts without waiting on auth; public connect client
- Clear error if SitePlay fails to load (no infinite skeleton)


## 0.1.46

- `/play` is public by default (connect client); no longer forces login redirect
- Cache-bust `SITE_ASSET_V` → `20260805playpub`

## 0.1.45

- Connect splash accepts sanitized HTML or markdown (auto-detect)
- Cache-bust `SITE_ASSET_V` → `20260805htmlsplash`

## 0.1.44

- Login/md splash: no forced center or max-width; theme tokens only
- Content images (not avatars): full width, max-height 300px,
  `object-fit: contain`
- Play markdown supports `![alt](url)`
- Cache-bust `SITE_ASSET_V` → `20260805mdimg`

## 0.1.42

- Play layout: interactive `entity-list` + `actions` (look UI);
  `data-play-cmd` click sends game input
- Look-shaped sections use site design tokens (not Figma paint)

## 0.1.41

- Play output: always convert MUSH `%c` client-side (no trust of
  broken engine HTML spans); strip legacy span junk
- Command input is mono ≥78ch textarea with wrap; Enter sends,
  Shift+Enter newline; main column wide enough for 78ch + SEND

## 0.1.40

- Play client matches Figma client frame (output / input / SEND)
  using site tokens; keeps 3-col shell

## 0.1.39

- Player **/play** chat client: output window + bottom input;
  MUSH-colored pre or JSON layout; requires sign-in


## Unreleased

- Chargen form fields use full main-column width
  (removed 28–36rem caps on inputs / cards / merits)

## 0.1.38

- Chargen merits: autocomplete + allowed-dot costs only

## 0.1.37

- Chargen Attributes/Skills: Mental|Physical|Social in three columns (in-game layout)

## 0.1.36

- Keep traditional 3-column layout; only stack on phones (≤720px). Medium widths shrink rails instead.

## 0.1.35

- Chargen: keep session after Next/Back/Set (`started` flag + FE normalize)

## 0.1.34

- Register `/chargen` SPA route under serveRoot

## 0.1.33

- Public **/chargen** FE: in-game-style stepper, Court/Figma look
- Stages 1–7 forms, draft sheet rail, demo mode (`?demo=1`)
- Cache-bust `SITE_ASSET_V` → `20260804cg1`

## 0.1.32

- Wiki FE matches Figma: full hero chrome (not compact)
- Wikilink titles wait for page index before render
- TOC skips page title; CSP-safe skeleton widths
- Cache-bust `SITE_ASSET_V` → `20260804wikihero`

## 0.1.31

- Cache-bust `SITE_ASSET_V` → `20260804onesearch`
- Help uses the single left search box (placeholder “Search help…”);
  removed duplicate Search help field. `?q=` filters the topic table.

## 0.1.30

- Help index: single Topic column (no Section/Open), Figma table
- Help bodies: escape `<>`, keep line breaks, SYNTAX headings,
  fenced example blocks — prose matches wiki sample

## 0.1.29

- Help section filters use `?section=` so they never clash with
  topic names (e.g. `channel`).

## 0.1.28

- Help index is a flat topic table (Topic / Section / Open),
  like wiki — not a section directory. Side nav sections filter.

## 0.1.27

- Help browser sends Bearer token when signed in so staff
  see admin topics; public/anonymous only get player help.

## 0.1.26

- Public **Wiki** index and directory listings use tables
  (Title / Path / Type / Updated / Tags / Open) instead of
  bullet lists.

## 0.1.25

- Public Help index + section pages use **tables** instead of
  card groups (Section/Topics/Sample and Topic/Summary).

## 0.1.24

- Public **Help** browser at `/help/` (and `/site/help/`):
  section index, section listings, topic pages, left-rail
  search. Uses `GET /api/v1/help` from `@ursamu/help`.
- Default nav: Home / Wiki / Help (Help no longer `#`).
- Strips MUSH color codes; ALL-CAPS labels → headings.

## 0.1.23

- Sync plugin.version with package version (was stuck at 0.1.19).

## 0.1.22

- Short wiki image refs: `![crest](crest.png)` expands to the
  current page’s `/api/v1/wiki/<page>/_assets/crest.png`.

## 0.1.21

- Markdown images: `![alt](url)` renders as `<img>` (lazy).
  Use on-server wiki assets:
  `/api/v1/wiki/<page>/_assets/<file>`.
- Body images are responsive (`max-width: 100%`).

## 0.1.20

- Wiki pages honor frontmatter `bgImage` (default false):
  - **on** — theme top background + home-height spacer
  - **off** — compact under nav (no title height)
- Home chrome still follows site `plainBg` / hero settings only.

## 0.1.19

- Left menu Figma order: **Featured**, then **Related**
  (section siblings). Was section-first without a Related title.

## 0.1.18

- Home main content loads wiki path **home** only (not featured).
- Featured pages stay left-menu links only.
- Brand/logo href is public home (`/` when serveRoot).

## 0.1.17

- Nav account: more space between avatar and name; show moniker
  colors via `/api/v1/me` `monikerHtml` (web-safe palette).

## 0.1.16

- Fix mobile hamburger: call `wireNavMenu()` on boot.

## 0.1.15

- Mobile hamburger nav (≤720px): brand + toggle; links open in a
  slide-down drawer. Escape / outside tap / link / resize close it.

## 0.1.14

- Theme install rewrites relative `url(...)` in CSS to absolute
  `/site/theme/installed/<id>/…` paths (CSS vars resolve against
  layout.css under `/site/css/`, which broke Court backgrounds).
- Court example theme uses absolute asset URLs; `plainBg` default
  false so the background art shows.

## 0.1.13

- Drop right-rail **Connect** menu. When `title` and `telnet` are
  both set, show the host under the hero title (`.site-banner__connect`).

## 0.1.12

- **Court is installable, not builtin.** Removed `changeling` /
  `court` named skins and `public/skins/{changeling,court}` assets
  from the package. Only `default` ships as a builtin skin.
- Court of Miracles lives at `examples/themes/court/` — pack with
  `deno task pack-theme` and install via Admin theme zip (or
  `theme/installed/court/`).
- `applySkinDefaults` no longer injects Court title/banner for a
  bare `skin: "court"` name.

## 0.1.11

- Spacing under search: left menu no longer sits flush on the
  search box (Figma ~44px). `--site-search-below` + bare-list fix
  when the first panel has no section title

## 0.1.10

- injectSiteHtml rewrites all `/site/…?v=` to current `SITE_ASSET_V`
  (base CSS links no longer stick on a stale literal in index.html)

## 0.1.9

- `plugin.version` matches package version (was stuck at 0.1.7,
  which made court safe-update report a false mismatch)

## 0.1.8

- Column gaps match Figma Main/Wiki (1728): `--site-col-gap` ≈ 50px
  between search rail and main, and main and right menu (was ~35px
  from a too-tight `clamp` max / `2vw`)
- Document gap math in `docs/figma-court-main.md`
- Cache-bust `SITE_ASSET_V` → `20260803d`

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
