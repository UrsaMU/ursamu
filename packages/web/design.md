# UrsaMU Staff Console — Editorial Dark Design System

**Product:** `@ursamu/web` staff console (wiki, boards, jobs, database,
players, settings) + optional standalone plugin SPAs under `/admin/*`.

**Reference UI:** **Wiki is the guiding visual language.** Every other
in-console section must look and behave like Wiki list + Wiki edit —
same header, search strip, table, and detail chrome. Do not invent a
second skin (card stacks, custom list buttons, one-off toolbars).

**Aesthetic:** Sleek documentation / internal wiki — **not** playful,
bubbly, or game-UI. Think Mintlify / Linear / modern docs: content
first, quiet chrome, sharp hierarchy.

**Color brand:** UrsaMU violet night (same hue family as the docs site).

**UI base:** Pico.css (structure only) + this token layer + host
classes in `ui/src/assets/styles.css`.

References (inspiration, not copies):

| Source | What we take |
|--------|----------------|
| **Wiki in this app** | **Canonical patterns** — copy these first |
| **Mintlify Themes** | Dark-first docs, calm surfaces, accent sparingly |
| **Linear / Vercel docs** | Hairline borders, density without clutter |
| **shadcn/ui dark zinc** | Neutral elevation via brightness, not glow |
| **Nextra / Starlight** | Sidebar + editorial main column |

**Canonical source files (open these before writing a new view):**

| Pattern | File |
|---------|------|
| List / browser | `ui/src/views/WikiView.vue` |
| Detail / editor | `ui/src/views/WikiEditView.vue` |
| Shell (top + side nav) | `ui/src/layouts/AppLayout.vue` |
| Shared layout CSS | `ui/src/assets/styles.css` (`.dash-*`, `.pages-*`, `.editor-*`) |
| Tokens | `ui/src/assets/staff-theme.css` |

---

## 0. Directives (non-negotiable)

These override taste and convenience. If a PR conflicts with this
section, change the PR.

### 0.1 Wiki is law

1. **List pages** match Wiki: kicker → title → lede → primary + outline
   actions → optional filter banner → full-width search toolbar →
   `dash-table` with an **Open** column.
2. **Detail pages** match Wiki edit: `editor-header` with ← back,
   mono path/id, dirty dot, Save / Discard (or equivalent) in
   `editor-actions`.
3. **Filters that scope the whole section** live in the **side nav**
   (see Wiki tags/sections), not as a second filter UI in main.
4. **Reuse host classes.** Do not fork visual chrome into scoped CSS
   that re-skins buttons, tables, or headers.
5. **One product.** Boards, Jobs, Players, DB, Settings must feel like
   the same app as Wiki — density, type, borders, button kinds.

### 0.2 MUST use (host classes)

| Need | Classes / structure |
|------|---------------------|
| Page shell | `<article id="main-…">` + optional `class="dash-browser"` |
| List header | `.dash-header` > title block + `.dash-header-actions` |
| Kicker | `.dash-kicker.muted` (short uppercase label, e.g. Library) |
| Title + count | `.page-title` + muted `(n)` or `(n of total)` |
| Lede | `.muted` one sentence under the title |
| Primary CTA | bare `<button>` (solid primary) — e.g. New page |
| Secondary | `class="secondary outline"` — e.g. Refresh |
| Active filters | `.dash-filter-banner` + Clear |
| Search strip | `.pages-toolbar` > `.pages-search-label` > `input[type=search]` |
| Data list | `.table-wrap` > `table.dash-table` |
| Row open | last column `.row-open` + outline Open button |
| Status chip | `.badge` + `.badge-draft` / `.badge-live` |
| Detail header | `.editor-header` + `.editor-path-line` + `.editor-actions` |
| Back control | `button.back-link` (“← Wiki”, “← Boards”) |
| Form grids | `.db-edit-grid` or simple stacked labels |
| Action row | `.action-row` for secondary button groups |

Shared roomy list chrome also applies to `#main-pages`, `#main-bbs`,
and `.dash-browser` in `styles.css`. Prefer those ids/classes over
new ones.

### 0.3 MUST NOT

| Forbidden | Why / do this instead |
|-----------|------------------------|
| Nested “card” rows (each row a bordered button) | Use `dash-table` |
| Full-width Pico buttons in headers/toolbars | `width: auto` via `.dash-header-actions` |
| Second theme or redefined `:root` tokens | Use host tokens only |
| Custom list chrome that only one plugin owns | Promote to host or use Wiki classes |
| Filters duplicated in main + side nav | Side nav owns section filters |
| Long top-nav labels (“Bulletin Board System”) | Short labels (Boards, Wiki, Jobs) |
| Emoji as structural chrome | Text / mono / badges only |
| Multi-stop gradients, glow shadows, large pills | Flat surfaces, 4–6px radius |
| Solid mid-purple under white labels | `--btn-primary-*` for solid CTAs |
| Leaving a blank void detail pane | Actions and content near the header |

### 0.4 List page skeleton (copy this)

```html
<article id="main-…" class="dash-browser">
  <header class="dash-header">
    <div>
      <p class="muted dash-kicker">Library</p>
      <h1 class="page-title">
        Wiki <span class="muted">(12)</span>
      </h1>
      <p class="muted">
        Browse and open pages — filters live in the side nav.
      </p>
    </div>
    <div class="dash-header-actions">
      <button type="button">New page</button>
      <button type="button" class="secondary outline">Refresh</button>
    </div>
  </header>

  <!-- optional -->
  <p class="dash-filter-banner">… <button class="secondary outline">Clear</button></p>

  <section class="pages-toolbar" aria-label="Search …">
    <label class="pages-search-label">
      <span class="sr-only">Search</span>
      <input type="search" placeholder="Search …" autocomplete="off" />
    </label>
  </section>

  <div class="table-wrap">
    <table class="dash-table">
      <thead>…</thead>
      <tbody>
        <tr tabindex="0" @click="open">
          … <td class="row-open"><button class="secondary outline">Open</button></td>
        </tr>
      </tbody>
    </table>
  </div>
</article>
```

### 0.5 Detail page skeleton (copy this)

```html
<article id="main-…">
  <header class="editor-header">
    <div>
      <p class="editor-path-line">
        <button type="button" class="back-link">← Section</button>
        <code>path-or-id</code>
        <span v-if="dirty" class="dirty-dot">●</span>
      </p>
      <h1 class="page-title page-title-tight">Title</h1>
    </div>
    <div class="editor-actions">
      <button type="button" class="secondary outline">Discard</button>
      <button type="button">Save</button>
    </div>
  </header>
  <!-- form fields or nested dash-table for children -->
</article>
```

### 0.6 Nav badges

- Top tabs may show a **red count pill** (`.top-badge`) when a
  `badgeKey` has a non-zero value.
- **Clear on view:** opening that section acknowledges the current
  count (client `sessionStorage`). The chip hides until the value
  **changes** again (new activity).
- Badges are attention signals, not permanent status meters.
- Plugins publish via `setStaffBadge(key, count, title?)` and
  `StaffNavItem.badgeKey`.

### 0.7 Decision rule

When unsure:

1. Open Wiki list or Wiki edit.
2. Match structure and classes.
3. Only then add **minimal** scoped CSS for domain layout
   (grid columns, compose form), never colors or button skins.

---

## 1. Design principles

1. **Editorial, not toy** — no pill confetti, no thick glows, no
   “app mascot” energy. Staff tool that could sit next to GitHub.
2. **Content is the UI** — tables and forms carry the page; chrome
   stays quiet.
3. **Elevation = surface step** — slightly lighter panels on a deep
   base; almost no colored box-shadows.
4. **Accent is rare** — violet for primary actions, active nav, and
   focus only. Everything else is neutral lavender-gray.
5. **Tight geometry** — small radii (4–6px). Prefer rectangles over
   capsules except for tiny status chips and top-nav count pills.
6. **Keyboard-first** — dense controls still ≥ 36px hit targets;
   table rows open on Enter; Ctrl/⌘+S where editing.

---

## 2. Color tokens (UrsaMU violet, de-bubbled)

Keep the **hue family** from the docs site. Drop glassmorphism and
radial “nebula” washes for a flatter editorial dark.

### Core

| Token | Hex | Role |
|-------|-----|------|
| `--bg` | `#0b0a12` | Page / app background (near-black violet) |
| `--bg-elevated` | `#12101c` | Sidebar, sticky header |
| `--bg-surface` | `#161422` | Panels, dialogs, inputs |
| `--bg-surface-2` | `#1c1929` | Hover rows, code blocks |
| `--bg-code` | `#0e0c16` | Textarea / mono panes |
| `--border` | `#3a3554` | Default hairlines (AA borders) |
| `--border-subtle` | `#2a2640` | Dividers inside panels |
| `--border-strong` | `#5a5480` | Focused / selected outline |
| `--text` | `#f0eef8` | Primary text |
| `--text-secondary` | `#c4c0d4` | Body secondary, meta (≥ AA) |
| `--text-muted` | `#b0a9c4` | Labels, placeholders (≥ AA) |
| `--text-on-primary` | `#ffffff` | Label on solid primary buttons |
| `--text-inverse` | `#0b0a12` | Rare dark-on-light chips |

### Brand accent (use sparingly)

| Token | Hex | Role |
|-------|-----|------|
| `--primary` | `#a78bfa` | Links, active nav (light enough on dark) |
| `--primary-hover` | `#c4b5fd` | Hover link / accent |
| `--primary-muted` | `rgba(167, 139, 250, 0.16)` | Active row / soft highlight |
| `--primary-border` | `rgba(167, 139, 250, 0.45)` | Selected border |
| `--btn-primary-bg` | `#6d28d9` | **Solid** primary button fill |
| `--btn-primary-bg-hover` | `#7c3aed` | Solid primary hover |
| `--btn-primary-fg` | `#ffffff` | Solid primary label (≥ 7:1) |

**Contrast rule:** Never put mid-purple (`#8b5cf6`) under white or
near-black labels. Solid CTAs use `--btn-primary-*`; links use
lighter `--primary` on `--bg`.

### Semantic

| Token | Hex | Role |
|-------|-----|------|
| `--success` | `#3ecf8e` | Saved / published |
| `--warning` | `#e6b84d` | Draft / unsaved |
| `--error` | `#f07178` | Errors, destructive |
| `--info` | `#7eb8ff` | Neutral info |

### Atmosphere

**Do not** use multi-stop radial purple glows on `body`.
Solid `--bg` only. Optional: 1px top border on header — nothing else.

```css
body {
  background: var(--bg);
  color: var(--text);
}
```

---

## 3. Typography

Editorial docs scale — slightly tighter than “marketing site.”

| Role | Size | Weight | Tracking | Notes |
|------|------|--------|----------|-------|
| App chrome | 13–14px | 500 | 0 | Nav, tree, buttons |
| Body / forms | 14px | 400 | 0 | Line-height 1.55 |
| Page title | 1.25rem (20px) | 600 | -0.02em | Not display/hero |
| Section label / kicker | 11px | 600 | 0.06em | Uppercase, muted |
| Mono / path | 12–13px | 400 | 0 | `ui-monospace` |

**Font stack**

- UI: `Inter`, `ui-sans-serif`, system-ui
- Mono: `ui-monospace`, `SFMono-Regular`, `JetBrains Mono`, Menlo

Avoid decorative display fonts. No emoji as structural chrome.

---

## 4. Spacing & geometry

| Token | Value |
|-------|-------|
| Base unit | 4px |
| Control height | 36px (compact) / 40px (default) |
| Sidebar width | 260–280px |
| Content max | full main pane for tables; forms readable |
| Gap (form stacks) | 12–16px |
| Page padding | from `.main-pane` gutters |

### Radius (anti-bubble)

| Token | Value | Use |
|-------|-------|-----|
| `--radius-xs` | 2px | Checkboxes-adjacent |
| `--radius-sm` | 4px | Inputs, buttons, table chrome |
| `--radius-md` | 6px | Dialogs, panels, table-wrap |
| `--radius-lg` | 8px | Rare large surfaces |
| **Avoid** | ≥ 12px / 999px pills | Except tags + top-nav count badge |

### Elevation

| Level | Treatment |
|-------|-----------|
| Flat | `background: var(--bg)` |
| Raised | `background: var(--bg-surface)`; `border: 1px solid var(--border)` |
| Overlay | Same + `box-shadow: 0 8px 24px rgba(0,0,0,0.45)` (neutral) |
| **No** | `shadow-primary`, teal/coral glows, multi-layer brand glows |

---

## 5. App shell layout

```
┌─────────────────────────────────────────────────────┐
│ topbar  height ~56px · border-b · bg-elevated       │
├──────────────┬──────────────────────────────────────┤
│ side nav     │ main-pane                            │
│ bg-elevated  │ bg · padding from gutters            │
│ section menu │ Wiki-pattern article (list or edit)  │
└──────────────┴──────────────────────────────────────┘
```

- **Topbar:** brand + section tabs (short labels) + live dot + user.
  Badge pills on tabs when acknowledged counts change.
- **Side nav:** quiet list for the active section; filters and
  shortcuts (Wiki tags, BBS categories, job buckets). Selected =
  surface-2 fill, not a loud pill.
- **Main:** one article; list **or** detail — prefer full-page
  detail (Wiki edit) over a forever-empty split pane.

### Mobile (≤900px)

- **Hamburger** opens an off-canvas drawer under the topbar.
- Drawer holds **primary tabs + section shortcuts** (same data as
  desktop top tabs + side nav). Close via backdrop, Esc, toggle,
  or navigation.
- Topbar keeps brand, section chip, live dot, and Sign out.
- Main column is full width; wide tables scroll and drop secondary
  columns below 640px. Safe-area insets apply on notched devices.
- CSS lives in `ui/src/assets/vue-overrides.css` (drawer + topbar);
  shell state in `AppLayout.vue` (`navOpen`).

---

## 6. Components

### Buttons

| Kind | Markup / style |
|------|----------------|
| **Primary** | bare `<button>` — solid `--btn-primary-*`, white label |
| **Secondary outline** | `class="secondary outline"` — Refresh, Open, Discard |
| **Ghost / back** | `class="back-link"` — no border, primary text |
| **Danger** | outline/text `--error` (Delete) |

Hover: slight brightness only. Disabled: ~55% opacity.
**Never** leave Pico’s default full-width buttons in headers.

### Inputs / textarea / select

- bg `--bg-code` or `--bg-surface`
- border `--border`
- focus: stronger border only (no purple glow ring in staff UI)
- placeholder `--text-muted`
- Mono class on locks, paths, ids

### Tables (primary list pattern)

- One outer border on `.table-wrap` — not per-row cards
- Header row: uppercase micro-labels, elevated bg
- Body rows: hover surface-2; cursor pointer; Enter opens
- Last column: compact Open outline button

### Tags & badges

- Content tags: small radius-999 chips (Wiki tags only pattern)
- Status: `.badge` / `.badge-draft` / `.badge-live`
- Top-nav attention: `.top-badge` red count pill

### Status copy

| State | Treatment |
|-------|-----------|
| Unsaved | warning text or small amber `●` dirty-dot |
| Draft | `.badge-draft` “Draft” |
| Saved | quiet “Saved” / status line |

---

## 7. Motion

| Motion | Spec |
|--------|------|
| Default | 120–180ms ease |
| Route fade | short opacity only |
| **Forbidden** | bounce, pulse glow, infinite shimmer on idle chrome |

Respect `prefers-reduced-motion: reduce`.

---

## 8. Do’s and don’ts (summary)

**Do**

1. Start from WikiView / WikiEditView.
2. Use hairline borders and surface steps for structure.
3. One solid primary action per header; Refresh is outline.
4. Prefer 4–6px radius everywhere.
5. Write UI copy like a product tool (“Save”, “Discard”, “Open”).
6. Keep staff density: less padding than marketing pages.
7. Put section-wide filters in the side nav.

**Don’t**

1. Don’t invent a parallel layout language for one plugin.
2. Don’t use multi-stop brand gradients on buttons or backgrounds.
3. Don’t use large soft colored shadows or decorative orbs.
4. Don’t uppercase whole sentences; only kickers / table headers.
5. Don’t load emoji icon systems as layout chrome.
6. Don’t redefine host design tokens in plugin CSS.
7. Don’t fight Pico with heavy custom chrome — tokens + host classes.

---

## 9. Pico.css mapping

Pico provides structure; **this file + host CSS own the look**.

| Pico variable | Maps to |
|---------------|---------|
| `--pico-background-color` | `--bg` |
| `--pico-card-background-color` | `--bg-surface` |
| `--pico-color` | `--text` |
| `--pico-muted-color` | `--text-secondary` |
| `--pico-primary` / `-background` | `--primary` / btn tokens (no gradient) |
| `--pico-form-element-*` | surface / border / muted |
| `--pico-border-radius` | `4px`–`6px` |
| `--pico-card-box-shadow` | none or neutral soft |

---

## 10. Product flows

Auth, create, edit, dirty state, shortcuts (`Ctrl/⌘+S`) stay as
implemented. This document defines **visual language**, not API
contracts.

Wiki API notes: engine wiki routes / package docs as applicable.

---

## 11. Game client output (Play)

**Player FE:** site `/play` (`play.js` + `play.css`) — primary client.  
**Staff console** does not ship a Play tab; `/admin/play` redirects
to public `/play`. Same `data.ui` contract if embedding later.

### Message contract (WS `{ msg, data }`)

| Payload | Render |
|---------|--------|
| `data.ui` with `components[]` | Structured layout (interactive when items carry `action`) |
| No `data.ui` (plain `msg`) | Mono / MUSH-colored pre block |

Commands that call `u.ui.layout({ components, meta })` emit
`{ msg: "", data: { ui: { type: "layout", components, meta } } }`.
Telnet never receives `data.ui` — text path only.

### Interactive actions

Items may include:

```json
{ "action": { "cmd": "n" } }
```

The FE sends `cmd` as normal player input (same as typing + Enter).
Use for exits, `look <name>`, future buttons/radios/dropdowns.

### Look layout (`meta.type: "look"`)

Composition (Figma client look blocks — structure only; **styles from
this file / site tokens**, not Figma paint):

| Block | `type` | Notes |
|-------|--------|--------|
| Room name | `header` | `title` |
| Optional art | `media` | `url`, `alt` when IMAGE set |
| Description | `text` | body prose |
| Characters | `entity-list` | items: label, sublabel (short-desc), meta (idle), `action.cmd` = `look Name` |
| Contents | `entity-list` | things in room |
| Exits | `actions` | items: label, badge (alias), `action.cmd` = exit alias |

### Structured layout path

| `component.type` | Treatment |
|------------------|-----------|
| `header` | Section title (UI/display font, hairline) |
| `text` | Body prose |
| `media` | Optional image |
| `entity-list` | Rows: name / short-desc / meta; clickable if `action` |
| `actions` | Chip/button row; clickable if `action` |
| `table` | Host table |
| `list` | Plain list |
| `panel` | Surface + optional title |

Labels may still carry MUSH `%c` / ANSI; FE converts to safe markup
(CSP-safe classes on site).

### MUST / MUST NOT

| Do | Don’t |
|----|--------|
| Reuse dash-header + prompt toolbar | Invent a floating MUD HUD |
| Mono only inside `.game-pre` / output | Style the whole admin shell as a game |
| Escape plain text in `mushTextToHtml` | `v-html` unsanitized server HTML |
| Cap history (socket composable) | Unbounded DOM growth |

---

## 12. Plugin UI contract (required)

The **host** (`@ursamu/web`) owns visual design. Plugin UIs — whether
in-console Vue views (`registerStaffNav` + `route`) or standalone SPAs
under `/admin/*` — must match §0 and the Wiki reference files.

### Source of truth

| Asset | Location |
|-------|----------|
| Directives + patterns | **this file** (§0 first) |
| Tokens + `.staff-*` utilities | `ui/src/assets/staff-theme.css` |
| Runtime theme URL | `GET /admin/staff-theme.css` |
| List/detail layout classes | `ui/src/assets/styles.css` |
| Reference implementations | `WikiView.vue`, `WikiEditView.vue` |

### Rules for plugin authors

1. **Do not redefine** `:root` color / radius / font tokens.
2. **Use CSS variables** for any custom layout rules:
   `var(--bg-surface)`, `var(--text-muted)`, `var(--primary)`, …
3. **Prefer host layout classes** (§0.2) for list/detail pages.
   Prefer `.staff-*` from `staff-theme.css` only when building a
   **standalone SPA** without the full Vue shell.
4. **Scoped CSS is structure only** (grid, spacing) — never
   hard-coded brand hex or button re-skins.
5. **Standalone SPAs** must load the host theme first:

   ```html
   <link rel="stylesheet" href="/admin/staff-theme.css" />
   ```

   If the host is absent, ship a **synced copy** of
   `staff-theme.css` (see `packages/bbs/ui/src/vendor/`).
   Sync with: `deno task theme:sync` from `@ursamu/web`.

6. **In-console pages** inherit host CSS automatically — add only
   minimal scoped layout CSS; follow §0 skeletons.
7. **Nav labels stay short** (Boards, not Bulletin Board System).
   Put the long name in `description` / page lede if needed.
8. **Badges:** `setStaffBadge` + `badgeKey`; expect clear-on-view.

### Custom components

Shared building blocks live in `@ursamu/web` (e.g. `PlayerSelect`).
Prefer host components. New shared widgets land in the host package.

### Checklist before shipping a staff UI

- [ ] Matches §0 directives (Wiki is law)
- [ ] List uses `dash-header` + `pages-toolbar` + `dash-table`
- [ ] Detail uses `editor-header` + back-link (if drill-in)
- [ ] No nested card-button rows
- [ ] No new `:root { --primary: … }` overrides
- [ ] Buttons / inputs use tokens or host classes
- [ ] Standalone SPA loads `/admin/staff-theme.css` (or vendor)
- [ ] Top-nav label is short
- [ ] Side nav owns section filters
- [ ] Screenshot compared side-by-side with Wiki

### Visual QA (real screenshot vs Wiki)

1. **Title block** — short kicker; H1; normal-case lede; count muted.
2. **Buttons** — one solid primary; Refresh/Open outline; not stacked
   full-width.
3. **Search** — full width inside `pages-toolbar`.
4. **Table** — single outer border; Open column; hover row.
5. **Detail** — back link + actions on one header row.
6. **Contrast** — body text ≥ 4.5:1 on `--bg` / `--bg-surface`.
7. **No second skin** — if it doesn’t look like Wiki, it fails.

---

## 12. Implementation checklist (host)

- [x] Token layer + editorial Pico overrides
- [x] Remove body radial washes / glow CTAs
- [x] Tighten radii; pill chrome only for tags + nav badges
- [x] Wiki list + edit as reference implementations
- [x] Shared browser chrome for `#main-pages`, `#main-bbs`,
      `.dash-browser`
- [x] Boards list/detail aligned to Wiki patterns
- [x] Top-nav badges: red pill + clear-on-view
- [ ] Jobs / Players / DB list UIs migrated to §0 skeletons
      (same language as Wiki)

---

## Changelog

| Date | Note |
|------|------|
| 2026-07-30 | **§0 Directives** — Wiki is law; MUST/MUST NOT; skeletons; badges; renumbered sections |
| 2026-07-30 | Boards aligned to Wiki browser; shared `.dash-browser` chrome |
| 2026-07-29 | Editorial dark rewrite — Mintlify/Linear-inspired; anti-bubble |
| 2026-07-29 | PR 3 edit pane, PR 2 create, PR 1 shell, Pico base |
