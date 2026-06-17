---
topic: "softcode/object/misc"
section: softcode
---
# Softcode — Object Functions (Continued)

See also: softcode/object (pronouns, `ueval`)

## Introspection
| Function | Description |
|----------|-------------|
| `parents(obj)` | Full ancestor chain |
| `cmds(obj)` | Commands on obj (alias: `lcmds`) |
| `listfunctions()` / `listflags()` | All functions / all flag names |
| `writable(obj,attr)` | `1` if enactor can set attr on obj |
| `template(attr,list)` | Apply attr to each list item (alias: `map`) |

## Command Wrappers
  `set(obj,attr=val)` — same as `@set`
  `wipe(obj,pattern)` — same as `@wipe`

## Examples
  `[parents(me)]` → #5 #2 #1   `[set(#12,CLIMATE=warm)]`

## See Also
  softcode/object, softcode/flow
