+HURT / +HEAL

  Apply or remove damage from a character's health track.

SYNTAX
  +hurt <target>=<amount><type>   Apply damage.
  +heal <target>=<amount><type>   Heal damage.

  target  : "me" for yourself; any name for others (staff only).
  amount  : number of damage boxes.
  type    : b / bashing  |  l / lethal  |  a / agg / aggravated

EXAMPLES
  +hurt me=3b          Take 3 bashing damage.
  +hurt me=1lethal     Take 1 lethal damage.
  +heal me=2b          Heal 2 bashing on yourself.
  +hurt alice=2agg     Apply 2 aggravated to Alice (staff only).
  +heal alice=1agg     Heal 1 aggravated on Alice (staff only).

SEE ALSO: +help sheet, +help wod20th
