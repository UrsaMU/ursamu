+extended contested  -- Two characters racing toward conflicting goals.

A contested Extended Action pairs two actions so the first to resolve as
succeeded wins. The other half is auto-abandoned, but its accumulated
total is preserved on the record so the ST can use it for narrative
consequence (e.g. how close the loser came).

Setup:
  Both actions must already exist as separate +extended/start records and
  must both be active. A storyteller then links them:

    +extended/contest <idA>+<idB>

Resolution:
  Each owner rolls their action normally. On the first /roll that takes one
  side past its target, that action transitions to succeeded; the linked
  sibling is set to abandoned in the same database call and the resolve
  hook fires for both.

  A /finish from staff also triggers the auto-abandon of the sibling.

  A failed (max-rolls-exhausted) action does NOT abandon the sibling --
  the loser simply ran out of time and the contest continues until the
  other side resolves or also fails.

Notes:
  Pairs are linked by a generated contestId stored on each record.
  An action can only belong to one contest at a time; staff should not
  re-link an already-paired action.

See also: extended, extended intervals
