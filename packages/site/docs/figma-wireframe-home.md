# Default shell wireframe — Home (node 2054:137)

**Layout + type-scale source of truth for the public site.**

Figma:
https://www.figma.com/design/BKP8DKLEwj0MzrzdFjU0m0/Court-of-Miracles?node-id=2054-137

Frame: **1728 × 1359** (grayscale wireframe).  
This is the **UrsaMU default shell structure**, not the Court
cream/gold brand skin. Colors stay staff violet night
(`tokens.css` / `staff-theme.css`). Court is an installable
override of faces/colors only.

Reference PNG: `figma-wireframe-home-2054-137.png`

---

## Measured from Figma API (node tree)

| Token | Figma | CSS |
|-------|-------|-----|
| Shell max | 1728 | `--site-max-w: 1728px` |
| Nav height | **102** | `--site-nav-h: 102px` |
| Side gutter | **42** | `--site-gutter: 42px` |
| Left rail | **314** | `--site-aside-width: 314px` |
| Right rail | **312** | same token (314) |
| Main column | **977–980** | `--site-main-max: 977px` |
| Col gap | **~21** | `--site-col-gap: 21px` |
| Search row | **44** tall | `--site-search-h: 44px` |

```
gutter 42 | aside 314 | gap 21 | main 977 | gap ~17 | aside 312 | gutter 42
= 1728
```

Nav group: `navigation` 1728×102.  
Left: `left menu` @ x=42 (search 314×44 + menu).  
Right: `Side Menu` @ x=1374 w=312.  
Main copy @ x≈377 w≈977.

---

## Type scale (wireframe faces → default Inter)

Wireframe uses **Lato** (body) + **Bodoni 72** (footer).  
Default skin maps sizes onto **Inter** (staff). Court may swap
to Smythe/Lato.

| Role | Wireframe | Token |
|------|-----------|--------|
| Brand | Lato 24/700 | `--site-type-brand` |
| Nav link | Lato 16/400 | `--site-type-nav` |
| Menu title | Lato 20/700 | `--site-type-menu-title` |
| Menu link | Lato 16/400 | `--site-type-menu-link` |
| H1 | Lato 40/700 | `--site-type-h1` |
| H2 | Lato 32/700 | `--site-type-h2` |
| Body | Lato 16/400 | `--site-font-size` |
| Host line | Lato 20/400 | `--site-type-connect` |
| Footer | Bodoni 16 | `--site-type-footer` |

---

## Colors

Wireframe fills are black / gray / white only.  
**Do not** take Court cream `#F7E4DD` or gold `#C4944A` from
styled frames (1:2, client 1884:89) into the default theme.

Default palette = staff violet night (`#0b0a12`, `#a78bfa`, …).

---

## Related frames

| Node | Role |
|------|------|
| **2054:137** | Default shell wireframe (this doc) |
| **2065:349** | Character profile — same shell |
| **1:2** | Court-styled Main art (installable skin) |
| **1884:89** | Court-styled Play client |
