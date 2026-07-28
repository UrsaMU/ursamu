See also: +help locks (overview)

+FUNCS

  Lock functions (engine built-ins). Fail closed on error.

FUNCS
  `flag(name)`         Enactor has flag
  `attr(name)`         Enactor has attribute
  `attr(name,val)`     Attribute equals val
  `type(name)`         Type flag match
  `is(#id)`            Enactor is object
  `holds(#id)`         Enactor holds object
  `perm(level)`        Privilege level
  `owner()`            Enactor owns target

EXAMPLES
  flag(wizard)
  perm(builder)&!flag(guest)

SEE ALSO: +help locks/keys, +help locks/examples
