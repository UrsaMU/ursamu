+PLEDGE

  Manage Changeling pledges -- seals, oaths, and bargains.
  Pledges bind parties with Wyrd-sworn consequences for breach.

SYNTAX
  +pledge/seal[/strengthen] <target>=[dur/]<text>/<sanc>
  +pledge/oath <type>/<target>=<text>/<boon>/<sanc>
  +pledge/bargain <target>=<service>/<payment>
  +pledge/accept|refute|release <id>
  +pledge/break <id>[=reason]
  +pledge/list [<player>]  |  +pledge/view <id>

SWITCHES
  /seal         Seal target's words (1 Glamour). Mortal targets auto-accept.
                Fae targets receive a pending proposal requiring /accept.
  /seal/strengthen
                Strengthen the seal (1 Glamour + 1 Willpower). A strengthened
                seal fires a Contract on breach if contractTrigger is set.
  /oath         Propose a formal oath (1 Glamour from each party on accept).
                Types: societal, personal, hostile.
                Accepting a societal court oath grants first dot of Mantle.
  /bargain      Bargain with a mortal (requires mien form; 1 Glamour).
                Accepting applies the Obliged condition to the changeling.
  /accept       Accept a pending pledge/oath/bargain addressed to you.
  /refute       Refuse a pending proposed seal (costs 1 Glamour if Fae).
  /release      End an active pledge safely; both parties are freed.
  /break        Break an active pledge and trigger its sanction.
                Oath breach adds the Oathbreaker condition.
                Sanction text is parsed for: bashing, lethal, willpower.
  /list         View all pledges involving you. Staff: pass a name to view
                another player's list.
  /view         View full details of a pledge by ID (last 8 chars work).

EXAMPLES
  +pledge/seal Bob=scene/Keep quiet/1 bashing
  +pledge/seal/strengthen Bob=I will come to your aid/2 bashing
  +pledge/oath societal/Alice=join Spring court/first dance/oathbreaker
  +pledge/oath personal/Charlie=protect you/swap-pools/notoriety
  +pledge/bargain Mortal=sew my gown/three gold coins
  +pledge/accept 4a8b7c9e
  +pledge/refute 4a8b7c9e
  +pledge/list
  +pledge/view 4a8b7c9e
  +pledge/release 4a8b7c9e
  +pledge/break 4a8b7c9e=I lied

SEE ALSO: +help changeling, +help contract, +help shift
