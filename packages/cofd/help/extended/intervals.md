+extended intervals  -- Time-step labels for Extended Actions.

The interval describes how much narrative time one attempt represents.
The engine stores the label for display only -- it does NOT enforce
real-time gating between rolls. Storytellers and players use the label
to pace the scene.

Intervals:
  turn    A single combat turn (3 seconds). Use for fast tasks during a
          fight: prying a door open, hacking a panel under fire.
  hour    One in-character hour. Use for research, slow crafting, and
          recovery downtime.
  day     One full in-character day. Use for major projects: forging an
          identity, learning a language, healing aggravated damage in
          downtime.
  scene   The current scene (default). Use when the rules don't specify
          and the ST wants the action wrapped before the scene ends.

Setting the interval:
  +extended/start <pool>=<target>/<maxRolls>/<interval>[/cum] <desc>
  e.g.  +extended/start wits+investigation=8/4/hour Comb the archives

Defaults:
  If you omit /<interval> the action uses 'scene'.
  If you omit /<maxRolls> the engine uses Resolve + Composure.

See also: extended, extended contested
