# Court of Miracles — Figma Main page (node 1:2)

Source: https://www.figma.com/design/BKP8DKLEwj0MzrzdFjU0m0/Court-of-Miracles?node-id=1-2  
Frame: **1728 × 1374**

## Columns (implemented in CSS tokens)

| Region | Figma | CSS token |
|--------|-------|-----------|
| Shell max | 1728 | `--site-max-w: 1728px` |
| Side gutter | 40 | `--site-gutter: 40px` |
| Left / right | ~331 (max 353) | `--site-aside-width: 331px` |
| Main | ~885 (x≈448) | `--site-main-max: 885px` |
| Col gaps | ~50.5 each | `--site-col-gap` ≈ 50px @ 1728 |

Gap math at 1728:

```
(1728 - 2×40 - 331 - 885 - 331) / 2 = 50.5px
```

Layout is **CSS grid** (not absolute):  
`minmax(aside) | minmax(main) | minmax(aside)` + `column-gap`.  
Below ~1100px rails shrink but stay 3-column. Stack only
on phones (≤720px): main → left → right.

## Type

| Role | Family | Size |
|------|--------|------|
| Hero | Smythe | 100 |
| Section H1 | Smythe | 40 |
| Menu titles | Smythe | 24 |
| Nav | Smythe | 20 |
| Body | Lato | 16 |

## Palette

- BG `#020201` · cream `#F7E4DD` · gold `#C4944A`
