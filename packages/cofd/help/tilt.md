+tilt  -- View or modify active Tilts (Personal + Environmental).
         Tilts award no Beats -- scene-bound, not Conditions. /clear at
         scene end.

SYNTAX
  +tilt                              View your active Tilts.
  +tilt <player>                     View another's.
  +tilt/list [<scope>]               Catalog. personal | environmental.
  +tilt/show <key>                   Full entry.
  +tilt/add <key>[/<note>] [for <p>] Inflict (optional note).
  +tilt/remove <key> [for <p>]       Remove one.
  +tilt/clear [for <p>]              Scene-end sweep.

Modifying others requires canEdit (builder+).
Resolving/removing = 0 Beats (CoFD 2e p.282).

EXAMPLES
  +tilt/show stunned     +tilt/add stunned
  +tilt/add ice for Marcus

SEE ALSO: help tilt/scope, help condition, help health
