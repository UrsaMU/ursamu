---
topic: "locks/keys"
section: locks
dark: true
---
+LOCKS/KEYS

See also: +help locks (overview)

ATOMS (TinyMUX-style)
  me              Enactor owns the locked object
  #12             Enactor is object #12
  *Alice          Enactor is player named Alice
  +wizard         Enactor has flag wizard
  wizard          Same (bare flag / power word)
  builder+        Flag or higher (via flag system)
  tribe:red       state.tribe === "red"
  power:>=3       Numeric compare on state field
  @#5             Pass the basic lock on #5
  [softcode]      Softcode expr (if evaluator set)

OPS
  a & b    AND          a | b    OR
  !a       NOT          ( a )    group

Adjacent atoms AND: `connected wizard` = both.

SEE ALSO: +help locks/funcs, +help locks/examples
