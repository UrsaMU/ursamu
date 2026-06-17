---
topic: "softcode/object"
section: softcode
---
# Softcode — Object Functions

**Pronouns** — return pronouns for the target based on its `SEX` attribute.
`obj(ref)` `subj(ref)` `poss(ref)` `aposs(ref)`
The `%s` `%o` `%p` `%a` substitutions do the same for the enactor.

## Examples
  `[subj(#5)]`   → he / she / they / it
  `[obj(#5)]`    → him / her / them / it
  `[poss(#5)]`   → his / her / their / its
  `[aposs(#5)]`  → his / hers / theirs / its

**User function variants** — `u2(attr,a,b)` / `u2local(attr,a,b)` are
aliases for `u()` / `ulocal()`. **`ueval(actor-ref, attr-spec, args...)`**
evaluates an attr as a different actor; `%N` expands as that actor's name.

## Examples
  `[ueval(#5,me/GREETING)]`  run GREETING as if #5 triggered it

## See Also
  softcode, softcode/object/misc, softcode/flow
