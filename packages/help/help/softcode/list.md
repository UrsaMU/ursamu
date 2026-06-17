---
topic: "softcode/list"
section: softcode
---
# Softcode — List Functions

Lists are space-delimited by default; pass a delimiter as the last arg.

## Math
| Function | Description |
|----------|-------------|
| `avg(list)` | Arithmetic mean |
| `lmath(op,list)` | Bulk op: `sum` `mul` `max` `min` `mean` `sub` `div` |
| `nummatch(list,val)` | Count elements equal to val |
| `numpos(list,val)` | 1-indexed position of first match |

## Manipulation
- `shift` `lset` `lsub` `firstof` — first, set, subtract, first non-empty
- `sortlist` `listunion` `listinter` `listdiff` — sort/set aliases
- `dice(num,sides)` / `die(sides)` — sum of rolled dice

## Examples
  `[lmath(max,3 1 4 1 5)]` → 5   `[dice(3,6)]` → 3–18

## See Also
  softcode, softcode/string
