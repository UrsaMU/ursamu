See also: +help locks (overview)

+KEYS

  Building blocks of a lock expression.

ATOMS
  `me`         The enactor
  `#12`        Object by id
  `*Name`      Named player
  `+flag`      Has flag (engine-dependent)
  `attr:val`   Attribute equals value

  Combine with `&` / `&&`, `|` / `||`, `!`, and parentheses.
  Adjacent atoms often imply AND.

EXAMPLES
  me|*Alice
  !(me)
  flag(wizard)|is(#5)

SEE ALSO: +help locks/funcs, +help locks/examples
