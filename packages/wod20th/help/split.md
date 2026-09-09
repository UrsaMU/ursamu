SPLIT -- Declare multiple actions in a turn

  Canon WoD20 pool-splitting. Declare N actions; each takes -(N-1)
  dice. Without a split you have one full-pool action per turn.

SYNTAX
  +split <N>             Declare N actions (1-5).
  +split/clear           Cancel the declaration.
  +split                 Show the current declaration.

MECHANICS
  +attack consumes one slot.
  A declared +defend consumed by an attack also consumes one slot.
  When all slots are used the declaration clears automatically.

  +split 1   1 action, no penalty.
  +split 2   2 actions, each at -1 (e.g. attack + declared defend).
  +split 3   3 actions, each at -2.

  A declared +defend without a +split = "abort to defense": you give
  up your action that turn for a full-pool defense.

EXAMPLES
  +split 2               You will attack AND have a declared defense.
  +defend/dodge          Queue the defense at -1 (split tax applied
                         when the attack hits).
  +attack Bran           Your attack rolls at -1.

SEE ALSO: +help attack, +help defend, +help init
