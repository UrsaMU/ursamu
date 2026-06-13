---
topic: "softcode/flow"
section: softcode
---
# Softcode — Flow Control

**`while(cond, body)`** — re-evaluates `cond` each iteration while truthy.
Returns the last body result. Hard cap: 1000 iterations. Use `setq` / `r`
to maintain state across iterations.

## Examples
  `[setq(0,1)][while(lte(r(0),5),setq(0,add(r(0),1)))][r(0)]`  → 6

**`switch(str, pat1, val1, ...[, default])`** — returns the first match.
Patterns support glob wildcards and numeric comparisons (`>5`, `<10`).

## Examples
  `[switch(foo,foo,yes,bar,no,unknown)]`  → yes
  `[switch(7,>5,big,<3,small,mid)]`      → big

## See Also
  softcode, softcode/flow/iter, softcode/string, softcode/list
