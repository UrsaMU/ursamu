---
topic: "softcode/flow/iter"
section: softcode
---
# Softcode — Iteration Functions

See also: softcode/flow (`while`, `switch`)

**`iter(list, body, [iSep], [oSep])`** — evaluates body for each element.
`##` = current item; `#@` = 1-based position. Alias: `parse`.
Use `itext(n)` / `inum(n)` for outer levels in nested iter (`n=0` inner).

## Examples
  `[iter(a b c,##-#@)]`        → a-1 b-2 c-3
  `[iter(a:b:c,upper(##),:)]`  → A B C

**`reswitch`** — regex-based switch. `reswitchall` returns all matches;
`reswitchi` / `reswitchalli` are case-insensitive.

## Examples
  `[reswitch(foo,^fo,MATCH,DEFAULT)]`    → MATCH
  `[reswitchall(foobar,^foo,F,bar$,B)]`  → F B
  `[reswitchi(FOO,^foo,yes)]`            → yes

## See Also
  softcode/flow, softcode/string/more
