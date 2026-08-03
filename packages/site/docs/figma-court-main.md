# Court of Miracles — Figma Main page (node 1:2)

Source: https://www.figma.com/design/BKP8DKLEwj0MzrzdFjU0m0/Court-of-Miracles?node-id=1-2  
Frame: **1728 × 1374**

## Columns (implemented in CSS tokens)

| Region | Figma | CSS token |
|--------|-------|-----------|
| Shell max | 1728 | `--site-max-w: 1728px` |
| Left / right | ~331 (max 353) | `--site-aside-width: 331px` |
| Main | ~885 | `--site-main-max: 885px` |
| Gaps | fluid | `--site-col-gap` (flex gap) |

Layout is **flex**, not absolute: asides `flex: 0 1 331px`, main `flex: 1 1 885px`.
Below 1100px columns stack (main → left → right).

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
