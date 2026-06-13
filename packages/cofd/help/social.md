+social  -- Chronicles of Darkness Social Maneuvering (Core p.81-83).

Track a persistent social encounter: doors, impression, leverage,
capitulation.

SYNTAX
  +social                                List active maneuvers.
  +social/start <target>=<goal>          Open a maneuver.
  +social/impression <level> [for <t>]   Set impression (ST/canEdit).
  +social/door [<reason>] [for <t>]      Roll one door attempt.
  +social/soft <kind>=<text> [for <t>]   Soft leverage (asp|vice|gift).
  +social/hard [severe] <text> [for <t>] Hard leverage (threat).
  +social/force [for <t>]                Force the doors (one shot).
  +social/status [<target>]              Show panel.
  +social/end [for <t>]                  Abandon.

EXAMPLES
  +social/start Marcus=Loan me the grimoire
  +social/soft aspiration=Help him achieve academic glory

SEE ALSO: help social/doors, help social/impression,
          help social/leverage, help social/force
