---
topic: "softcode"
section: softcode
---
# Softcode Functions

UrsaMU implements a TinyMUX 2.x softcode evaluator. Call functions with
square brackets: `[funcname(arg1, arg2)]`.

## Topics
| Topic | Contents |
|-------|----------|
| `softcode/string` | `tr`, `printf`, regex variants, char predicates |
| `softcode/list` | `avg`, `dice`, `lmath`, `listunion`, `firstof` |
| `softcode/object` | `ueval`, pronouns, `parents`, `template` |
| `softcode/flow` | `while`, `switch`, `reswitch` variants, `iter` |

## Examples
  `[add(3,4)]`           → 7
  `[strlen(hello)]`      → 5
  `[iter(a b c,##-#@)]`  → a-1 b-2 c-3

## See Also
  softcode/string, softcode/list, softcode/object, softcode/flow
