+LOCKS

  Boolean keys checked when someone uses an
  object or exit. Empty lock always passes.

TOPICS
  **lock**       @lock command syntax
  **keys**       Atoms + `&` `|` operators
  **types**      Basic, use, enter, …
  **funcs**      flag() holds() is() …
  **examples**   Exit and room patterns

OPERATORS
  `&` / `&&` AND   `|` / `||` OR   `!` NOT
  Shorthand single-char forms preferred.
  Space between atoms also means AND.

Channel join/speak: same keys via `@chanset`.
SEE ALSO: +help locks/keys, +help staff/locks
