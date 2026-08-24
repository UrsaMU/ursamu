---
topic: "locks/keys"
section: locks
dark: true
---
+LOCKS/KEYS

See also: +help locks (overview)

ATOMS
  me  #12  *Alice  +wizard  wizard
  builder+  tribe:red  @#5  [softcode]

OPERATORS
  `&` = `&&` (AND)   `|` = `||` (OR)
  `!` NOT            `( )` group
  Space between atoms also means AND.

EXAMPLES
  wizard | #2
  +member & !dark
  flag(wizard) || is(#5)
  me|*Alice

SEE ALSO: +help locks/funcs, +help locks/examples
