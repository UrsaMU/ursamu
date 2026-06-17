+attack  -- Resolve an attack against a target in an active encounter.
            Builds the dice pool, applies modifiers, rolls, and records
            damage automatically.

SYNTAX
  +attack <target>[/<switch>...]
  +attack/<switch>[/<switch>...] <target>

For switches (brawl/melee/ranged/thrown/allout/charge/aim/burst,
body parts /head /arm /leg /hand /eye /heart /torso, etc.),
see attack/switches.

EXAMPLES
  +attack Marcus              +attack/melee Marcus
  +attack/burst-med Marcus=Cass,Jax
  +attack Marcus/head         +attack/head Marcus
  +attack/wp/allout Marcus

Requires connected status and active encounter participation.

SEE ALSO: help attack/switches, help attack/defense, help attack/damage,
          help combat/modifiers, help combat
