+PLEDGE

  Manage Changeling pledges (seals, oaths, and bargains).

SYNTAX
  +pledge/seal[/strengthen] <target>=[dur/]<text>/<sanc>
  +pledge/oath <type>/<targ>=<text>/<boon>/<sanc>
  +pledge/bargain <targ>=<serv>/<pay>
  +pledge/accept|refute|release <id>
  +pledge/break <id>[=reason]
  +pledge/list [<player>]  |  +pledge/view <id>

SWITCHES
  /seal     Seal target's words (strengthen costs 1 WP).
  /oath     Propose oath (societal/personal/hostile).
  /bargain  Propose bargain (requires mien form).
  /accept   Accept pending proposed pledge/oath/bargain.
  /refute   Refute pending seal (costs 1 Glamour if Fae).
  /break    Break active pledge & trigger sanction.
