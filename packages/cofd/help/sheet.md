+sheet  -- View and edit Chronicles of Darkness character sheets.

SYNTAX
  +sheet [<player>]                  View a sheet.
  +sheet/set <trait>=<value>         Set a trait on your sheet.
  +sheet/set <player>/<trait>=<v>    Set on another (builder+).
  +sheet/set specialty/<skill>=<n>   Add a skill specialty.
  +sheet/set specialty/<skill>=<n>: <description>
  +sheet/set specialty/<skill>=      Remove all specialties on a skill.
  +sheet/set <trait>=                Reset trait to template default.
  +sheet/virtue [<p>] [= <reason>]   Virtue triggered: full WP.
  +sheet/vice   [<p>] [= <reason>]   Vice indulged: +1 WP.
  +sheet/rest   [<p>] [= <reason>]   Full rest: full WP.

Edit own sheet after chargen submission. Edit others, own Size, or
regen WP for others requires builder+ (canEdit).

EXAMPLES: +sheet/set strength=3
          +sheet/set specialty/athletics=Climbing

SEE ALSO: help sheet/traits, help sheet/willpower, help sheet/size,
          help sheet/specialties, help cg, help virtues, help vices
