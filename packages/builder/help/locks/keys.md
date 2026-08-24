See also: +help locks (overview)

+KEYS

  Building blocks of a lock expression.

ATOMS
  `me`  `#12`  `*Name`  `+flag`  `attr:val`

OPERATORS
  `&` same as `&&` (AND)   `|` same as `||` (OR)
  `!` NOT                  `( )` group
  Adjacent atoms imply AND (space = `&`).

EXAMPLES
  me|*Alice
  wizard | #2
  +member & !dark
  flag(wizard)||is(#5)

SEE ALSO: +help locks/funcs, +help locks/examples
