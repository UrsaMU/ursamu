+sheet  -- View and edit Chronicles of Darkness character sheets.

SYNTAX
  +sheet [<player>]                  View a sheet (live or chargen draft).
  +sheet/set <trait>=<value>         Set a trait on your live sheet.
  +sheet/set <player>/<trait>=<v>    Set on another (builder+).
  +sheet/set specialty/<skill>=<n>   Add a skill specialty.
  +sheet/set specialty/<skill>=<n>: <description>
  +sheet/set specialty/<skill>=      Remove all specialties on a skill.
  +sheet/set <trait>=                Reset trait to template default.
  +sheet/virtue [<p>] [= <reason>]   Virtue triggered: full WP.
  +sheet/vice   [<p>] [= <reason>]   Vice indulged: +1 WP.
  +sheet/rest   [<p>] [= <reason>]   Full rest: full WP.

VIEWING
  +sheet always works for you. During +cg it shows your draft (or a
  blank Mortal base if you have not started). After approval it shows
  the live sheet. Others' drafts need canEdit (builder+).

EDITING
  +sheet/set edits the live sheet only. Build traits with +cg/set until
  staff approves. Edit others, own Size, or regen WP for others needs
  builder+ (canEdit).

EXAMPLES: +sheet
          +sheet/set strength=3
          +sheet/set specialty/athletics=Climbing

SEE ALSO: help sheet/traits, help sheet/willpower, help sheet/size,
          help sheet/specialties, help cg, help virtues, help vices
