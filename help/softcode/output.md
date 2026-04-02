SOFTCODE OUTPUT FUNCTIONS

These functions send messages to players. They return empty string so they
can be used inside larger expressions for side effects.

See also: softcode/index, softcode/object, @trigger

-------------------------------------------------------------------------------
EMIT FUNCTIONS
-------------------------------------------------------------------------------

pemit(<player>,<message>)
  Sends <message> to <player> privately (only that player sees it).
  <player> can be a dbref, name, or "me".
  > [pemit(me,You feel a chill.)]
  > [pemit(#5,Alice waves at you.)]

npemit(<player>,<message>)
  Like pemit() but does NOT prepend the player's name. Identical to
  pemit() in this implementation.

remit(<room>,<message>)
  Sends <message> to everyone in <room>.
  > [remit(here,The lights flicker.)]
  > [remit(#10,A distant bell tolls.)]

oemit(<player>,<message>)
  Sends <message> to everyone in the same room as <player>,
  EXCEPT <player> themselves.
  Useful for "you do X" / "player does X" split messages.
  > [oemit(me,Alice waves at the crowd.)]

emit(<message>)
  Sends <message> to everyone in the executor's current room,
  including the executor.
  > [emit(The ground trembles.)]

cemit(<channel>,<message>)
  Sends <message> to all players on <channel>.
  > [cemit(public,The gates open at dusk.)]

-------------------------------------------------------------------------------
TRIGGERS
-------------------------------------------------------------------------------

trigger(<obj>/<attr>[,<arg0>[,<arg1>...]])
  Triggers the attribute <attr> on <obj> as a queued softcode action.
  Arguments are passed as %0, %1, etc. to the triggered attribute.
  > [trigger(me/ON_ENTER,#5)]
  > [trigger(#15/ALARM,fire,east wing)]

  NOTE: trigger() queues the action via @trigger; it does not execute
  the attribute inline. The attribute runs asynchronously.

-------------------------------------------------------------------------------
TEXT FILES
-------------------------------------------------------------------------------

textfile(<file>)
  Returns the contents of a named text file from the help/text directory.
  (Not available in this version — returns empty string.)

text(<file>)
  Alias for textfile().

-------------------------------------------------------------------------------
COMMON PATTERNS
-------------------------------------------------------------------------------

"You do X" / "Others see Y" split:
  [pemit(me,You wave at %0.)]
  [oemit(me,[name(me)] waves at [name(#%0)].)]

Room announcement with exclusion:
  [remit(here,The alarm sounds!)]

Channel announcement from softcode:
  [cemit(ooc,[name(me)] announces: %0)]

Chained emit (no output to command buffer):
  [null([pemit(me,Done.)][remit(here,[name(me)] finishes.)])]
