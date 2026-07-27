---
topic: "locks/funcs"
section: locks
dark: true
---
+LOCKS/FUNCS

See also: +help locks (overview)

Built-in lock functions (fail-closed if unknown):

  flag(name)           Enactor has flag
  attr(name)           state has own property name
  attr(name, val)      state.name === val
  type(name)           Same as flag (player/room/…)
  is(#id)              Enactor id is #id
  holds(#id)           Enactor carries #id
  carries(#id)         Alias for holds
  owner()              Enactor owns locked object
  perm(level)          Privilege (builder, admin, …)

EXAMPLES
  @lock box=holds(#42)
  @lock gate=flag(wizard) | is(#2)
  @lock/use tool=perm(builder)

Softcode keys: `@lock here=[gt(money(%#),10)]`
(requires lock evaluator).

SEE ALSO: +help locks/keys, +help locks/examples
