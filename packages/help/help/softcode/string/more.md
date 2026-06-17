---
topic: "softcode/string/more"
section: softcode
---
# Softcode — String Functions (Continued)

See also: softcode/string (`tr`, `printf`)

**Regedit variants** — regex find-replace:
- `regedit` / `regeditall` — first / all matches
- `regediti` / `regeditalli` — case-insensitive variants
- `regeditlit` / `regeditalllit` — literal replacement (no capture subs)

## Other Functions
| Function | Description |
|----------|-------------|
| `encode64(s)` / `decode64(s)` | Base64 encode / decode |
| `strdistance(s1,s2)` | Levenshtein distance |
| `nameq(n1,n2)` / `nameqm(name,pat)` | Name equality / glob match |
| `asc(c)` `flip(s)` `chomp(s)` | ord / reverse / strip newline |

## Examples
  `[regeditall(hello,l,L)]` → heLLo

## See Also
  softcode/string, softcode/flow
