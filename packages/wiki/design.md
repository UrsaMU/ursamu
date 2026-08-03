# UrsaMU Wiki — Editorial Dark Design System

**Product:** `@ursamu/wiki` staff admin + future public wiki chrome  
**Aesthetic:** Sleek documentation / internal wiki — **not** playful,  
bubbly, or game-UI. Think Mintlify / Linear / modern docs: content  
first, quiet chrome, sharp hierarchy.  
**Color brand:** UrsaMU violet night (same hue family as the docs site).  
**UI base:** Pico.css (structure only) + this token layer.

References (inspiration, not copies):

| Source | What we take |
|--------|----------------|
| **Mintlify Themes** | Dark-first docs, calm surfaces, accent sparingly |
| **Linear / Vercel docs** | Hairline borders, density without clutter |
| **shadcn/ui dark zinc** | Neutral elevation via brightness, not drop-shadow glow |
| **Nextra / Starlight** | Sidebar + editorial main column |

---

## 1. Design principles

1. **Editorial, not toy** — no pill confetti, no thick glows, no  
   “app mascot” energy. Staff tool that could sit next to GitHub.
2. **Content is the UI** — max readable column; chrome stays quiet.
3. **Elevation = surface step** — slightly lighter panels on a deep  
   base; almost no colored box-shadows.
4. **Accent is rare** — violet for primary actions, active nav, and  
   focus only. Everything else is neutral lavender-gray.
5. **Tight geometry** — small radii (4–6px). Prefer rectangles over  
   capsules except for tiny status chips.
6. **Keyboard-first** — dense controls still ≥ 36px hit targets;  
   visible focus ring in violet at low opacity.

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
| `--border` | `#2a2640` | Default hairlines |
| `--border-subtle` | `#1f1c30` | Dividers inside panels |
| `--border-strong` | `#3d3758` | Focused / selected outline |
| `--text` | `#e8e6f2` | Primary text |
| `--text-secondary` | `#9b97b0` | Body secondary, meta |
| `--text-muted` | `#6b6680` | Labels, placeholders, hints |
| `--text-inverse` | `#0b0a12` | Text on solid primary buttons |

### Brand accent (use sparingly)

| Token | Hex | Role |
|-------|-----|------|
| `--primary` | `#8b5cf6` | Primary button fill, active nav text |
| `--primary-hover` | `#9d72f7` | Hover primary |
| `--primary-muted` | `rgba(139, 92, 246, 0.12)` | Active row / soft highlight |
| `--primary-border` | `rgba(139, 92, 246, 0.35)` | Selected border |
| `--primary-focus` | `rgba(139, 92, 246, 0.45)` | Focus ring |

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
| Page title (editor) | 1.25rem (20px) | 600 | -0.02em | Not display/hero |
| Section label | 11px | 600 | 0.06em | Uppercase, muted |
| Mono / path | 12–13px | 400 | 0 | `ui-monospace`, JetBrains Mono |

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
| Content max | 720–800px for reading; editor can go wider |
| Gap (form stacks) | 12–16px |
| Page padding | 16–24px |

### Radius (anti-bubble)

| Token | Value | Use |
|-------|-------|-----|
| `--radius-xs` | 2px | Checkboxes-adjacent |
| `--radius-sm` | 4px | Inputs, buttons, tree rows |
| `--radius-md` | 6px | Dialogs, panels |
| `--radius-lg` | 8px | Rare large surfaces |
| **Avoid** | ≥ 12px / 999px pills | Except 999px for 1-line status chips only |

### Elevation

| Level | Treatment |
|-------|-----------|
| Flat | `background: var(--bg)` |
| Raised | `background: var(--bg-surface)`; `border: 1px solid var(--border)` |
| Overlay | Same + `box-shadow: 0 8px 24px rgba(0,0,0,0.45)` (neutral black, not violet) |
| **No** | `shadow-primary`, teal/coral glows, multi-layer brand glows |

---

## 5. Layout (wiki admin)

```
┌─────────────────────────────────────────────────────┐
│ header  height 48–52px · border-b · bg-elevated     │
├──────────────┬──────────────────────────────────────┤
│ sidebar      │ main                                 │
│ bg-elevated  │ bg                                    │
│ border-r     │ padding 20–24px                      │
│ tree + search│ editor OR empty state                │
└──────────────┴──────────────────────────────────────┘
```

- Header: wordmark + user + sign out. No gradient bar.  
- Sidebar: quiet list; **selected** = muted primary fill + 1px  
  primary-border left edge (2px max).  
- Main empty: centered short copy + single primary button. No orbs.  
- Dialog: centered, max-width ~32–36rem, surface + border, neutral  
  shadow. Native `<dialog>` is fine.

---

## 6. Components

### Buttons

| Kind | Style |
|------|--------|
| **Primary** | Solid `--primary`, text inverse, radius-sm, **no** gradient |
| **Secondary** | Transparent / surface, border `--border`, text secondary |
| **Ghost** | No border, muted text, hover surface-2 |
| **Danger** | Outline or text `--error` |

Hover: slight brightness change only. Active: 1px darker.  
Disabled: 40% opacity.

### Inputs / textarea / select

- bg `--bg-code` or `--bg-surface`  
- border `--border`  
- focus: border `--border-strong` + 2px ring `--primary-focus`  
- placeholder `--text-muted`  
- Mono class on path and body editors  

### Tree item

- height ≥ 36px  
- hover: `--bg-surface-2`  
- selected: `--primary-muted` + left border primary  
- path slug: mono, muted, right-aligned ellipsis  

### Tags

- Small chips: radius 999 **only here**, height ~22px  
- bg `--primary-muted`, border `--primary-border`, text primary-light  
- Remove control is muted ×, error on hover  

### Status

| State | Treatment |
|-------|-----------|
| Unsaved | warning text or small amber dot (not a bounce animation) |
| Draft | muted chip “Draft” |
| Saved | success text flash / quiet “Saved” |

### Preview pane

- Same surface as code  
- Border subtle  
- FE-parity markdown (headings, lists, tables, wikilinks)  
- No card “lift” on hover  

---

## 7. Motion

| Motion | Spec |
|--------|------|
| Default | 120–180ms ease |
| Dialog | opacity + 4px translateY max |
| **Forbidden** | bounce, pulse glow, infinite shimmer on idle chrome |

Respect `prefers-reduced-motion: reduce`.

---

## 8. Do’s and don’ts

**Do**

1. Use hairline borders and surface steps for structure.  
2. Keep primary violet for one strong action per view.  
3. Prefer 4–6px radius everywhere.  
4. Write UI copy like a product tool (“Save”, “Discard”).  
5. Match staff density: less padding than marketing pages.

**Don’t**

1. Don’t use multi-stop brand gradients on buttons or backgrounds.  
2. Don’t use large soft colored shadows.  
3. Don’t use oversized rounded “app cards” or decorative orbs.  
4. Don’t uppercase whole sentences; only micro-labels.  
5. Don’t load emoji icon systems as layout chrome.  
6. Don’t fight Pico with heavy custom chrome — override tokens  
   toward flat, then add minimal layout CSS.

---

## 9. Pico.css mapping

Pico provides structure; **this file owns the look**.

| Pico variable | Maps to |
|---------------|---------|
| `--pico-background-color` | `--bg` |
| `--pico-card-background-color` | `--bg-surface` |
| `--pico-color` | `--text` |
| `--pico-muted-color` | `--text-secondary` |
| `--pico-primary` / `-background` | `--primary` (solid, no gradient) |
| `--pico-form-element-*` | surface / border / muted |
| `--pico-border-radius` | `4px`–`6px` |
| `--pico-card-box-shadow` | none or neutral soft |

---

## 10. Product flows (unchanged functionally)

Auth, create (`POST`), edit (`GET`/`PATCH`), dirty state, shortcuts  
(`N`, `/`, `Ctrl/⌘+S`) stay as implemented. This document only  
changes **visual language**.

API map remains in § of prior revisions; see `docs/guides/wiki.md`.

---

## 11. Implementation checklist

- [x] Token rewrite (this file)  
- [x] `admin/styles.css` — flat editorial Pico overrides  
- [x] Remove body radial washes / glow CTAs  
- [x] Tighten radii, strip pill chrome except tags  
- [x] Pico self-hosted for engine CSP (`'self'` assets)  
- [x] Lighthouse / a11y pass: block labels, contrast, skip link,
      focus rings, meta description, single heading hierarchy

---

## Changelog

| Date | Note |
|------|------|
| 2026-07-29 | **Editorial dark** rewrite — Mintlify/Linear-inspired; UrsaMU violet; anti-bubble |
| 2026-07-29 | PR 3 edit pane, PR 2 create, PR 1 shell, Pico base |
