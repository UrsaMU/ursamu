# Changelog

## 0.2.73

- Wiki edit save: keep original page **author** in the live list;
  only the last-edit **date** updates (server is source of truth).

## 0.2.72

- Remove **Play** tab from staff console top nav. Game client
  lives on the public site at `/play`; `/admin/play` redirects
  there.

## 0.2.71

- Wiki edit: **Delete** page button (staff confirm →
  `DELETE /api/v1/wiki/<path>`, leaves list)

## 0.2.68

- DbView object image: force HTTP upload, 8 MB limit, full-width
  contain preview (height 300px + object-fit)


## 0.2.67

- Admin Settings login splash preview: iframe with live site
  tokens, skin CSS, and play-md markup (matches /play)


## 0.2.66

- Admin Database: object image upload, URL import, clear, preview

## 0.2.65

- Admin login splash: markdown or HTML (sanitized preview)

## 0.2.64

- Login splash preview: no extra centering styles; content images
  full width, max-height 300px, `object-fit: contain` (not avatars)

## 0.2.63

- Admin Settings → Game: **Web login splash** editor (markdown +
  live preview). Saves to `server.texts` id=`welcome` via
  `loginMarkdown` on GET/PATCH settings. Shown on `/play` pre-auth;
  telnet still uses `text/default_connect.txt`.

## 0.2.62

- Play prompt: mono ≥78ch textarea (Enter send / Shift+Enter wrap);
  client column fits 78ch
- `mushTextToHtml` strips legacy engine HTML spans before coloring

## 0.2.61

- Play game client: plain `msg` → mono `.game-pre` with MUSH colors;
  `data.ui` layout → host tables/panels (design.md §11)
- `mushTextToHtml`, GameOutput, GameLayout, PlayView `/admin/play`


## 0.2.60

- Help FE matches wiki design tokens: Library kicker, dash-table,
  filter banner, side-nav sources, WikiBodyField + md preview

## 0.2.59

- Host staff UI: Help (`HelpView`) — browse topics, DB overrides
- Admin WS RPC allowlist: `/api/v1/help`
- Routes: `/admin/help`, `/admin/help/t/:topic`

## 0.2.58

- Host staff UIs: Mail (`MailView`) and Channels (`ChannelsView`)
- Admin WS RPC allowlist: `/api/v1/mail`, `/api/v1/channels`
- Routes: `/admin/mail`, `/admin/mail/:id`, `/admin/channels`,
  `/admin/channels/:id`

## 0.2.57

- Fix empty Mail/Channels/Help top tabs: never pass unresolved
  named routes to RouterLink (Vue resolve threw → empty `<li>`)
- Auto-register pending stub routes for `registerStaffNav({ route })`
  entries the host does not yet own (`/admin/mail` etc.)
- Recompute primary tabs when stub/module routes land (epoch)

## 0.2.56

- Force topbar `height: auto !important` in base styles + overrides
  so section tabs never clip (root cause of “missing” tabs until
  Boards was clicked).


## 0.2.55

- Topbar **auto-height** so wrapped section tabs are not clipped
  (fixed 3.5rem bar hid Mail/Channels until Boards reflowed).
- Smaller top tabs; Boards side labels clearer as categories.


## 0.2.54

- Top nav: show **all** section tabs (no horizontal hide/scroll).
  Clicking Boards no longer “reveals” Mail/Channels/etc.
- Boards side nav: label board groups under **Categories**.


## 0.2.53

- Nav badges: remember “seen” counts in **localStorage** (per staff
  id) so the same drafts/jobs chips do not return on every login.
- Database online chip counts **other** players only (not you).


## 0.2.52

- Database nav badge: ack `players:online` when opening Database
  (was still tied to removed Players section, so the chip never cleared).


## 0.2.51

- Wiki Images panel: align Upload / URL / Import on one control height.


## 0.2.50

- Sync plugin.version with package version (was stuck at 0.2.46).


## 0.2.49

- Images panel inserts short markdown: `![crest](crest.png)`.
  Preview resolves bare filenames via the page path.

## 0.2.48

- Wiki edit **Images** panel: upload a file or import a URL;
  files are stored on the server under the page’s `_assets/`
  folder. Insert adds markdown into the body. Multiple images
  per article.
- Staff preview renders markdown images.

## 0.2.47

- Wiki edit: **Background image** checkbox (`bgImage`, default off).
  Public site uses home-height layout when on; compact otherwise.
  Included in dirty snapshot so Save enables on toggle.

## 0.2.46

- Wiki Featured checkbox label: left menu on public site
  (not site home page).

## 0.2.45

- Wiki edit: include `featured` in dirty snapshot so checking
  Featured enables Save and persists to frontmatter.

## 0.2.44

- Remove separate **Players** section — folded into **Database**
  (side nav: Players / Online / Offline / Staff). Legacy
  `/admin/players` redirects to DB filters.

## 0.2.43

- Database view matches Wiki design.md patterns: dash-header,
  search toolbar, `dash-table` + Open; object detail uses
  `editor-header` (← Database, dirty dot, Save/Discard). Removed
  card-row list and split pane chrome.

## 0.2.42

- Settings: clearer label for plain background
  ("Hide top background art") so theme backgrounds are not
  turned off by accident.

## 0.2.41

- Settings: auto-save on blur (game + public site). Dirty check
  skips no-ops; concurrent edits are queued. Site still hot-reloads
  without reboot.

## 0.2.40

- Declare `jsr:@ursamu/site` dependency; theme activate / settings
  hot-reload fall back to `import("jsr:@ursamu/site")` when the bare
  specifier is missing from the web package graph (JSR-only games)

## 0.2.39

- Align plugin `version` with package (was stuck at 0.2.36)

## 0.2.38

- Theme activate: verify live `getSiteRuntime` after
  `setSiteRuntime`; log active skin; return applied config
  fields (builtin clears `skinCss`) so Settings form matches FE

## 0.2.37

- Admin: upload Court-style FE theme zip and install/activate
  (`POST /api/v1/admin/site/theme`, Settings → Public site)
- List themes in settings payload; activate installed/builtin
- Multipart upload over HTTP (FormData); activate via WS JSON
- Site title help: clear field to hide hero heading

## 0.2.36

- Staff console release (mobile tables, live indicator, wiki nav)
