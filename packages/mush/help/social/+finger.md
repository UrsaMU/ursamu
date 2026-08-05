+FINGER

MUSH-style profile card for a character. Shows status, idle, full
name, and default + custom profile fields.

SYNTAX
  +finger [<player>]            Show your own or another's card.
  +finger/set <field>=<value>   Set a profile field on yourself.
  +finger/set <field>=          Clear a profile field.
  +finger/set <field>=@@        Keep the value but hide it.
  +finger/set <field>           Show the field's current value.

SWITCHES
  /set       Set, clear, hide, or inspect a field on yourself.

EXAMPLES
  +finger                       Your own profile.
  +finger Alice                 Look up Alice (also matches alias).
  +finger/set pronouns=she/her  Set the Pronouns field.
  +finger/set position=         Clear Position.

SEE ALSO: +gname, +staff, +glance
