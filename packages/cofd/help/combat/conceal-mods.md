combat conceal-mods  -- Concealment penalties to the attacker's pool.

Concealment imposes a penalty on the attacker's pool. Full cover
substitutes a Durability subtraction from damage instead.

  Barely concealed             -1   (office chair)
  Partially concealed          -2   (behind car hood, torso visible)
  Substantially concealed      -3   (crouching behind car)
  Full cover                   --   subtract cover Durability from damage;
                                    if Durability > weapon mod, no damage.
  Firing from concealment      -1 less than protection received
                                    (substantially = -2 to fire back).

See help combat cover for declaring cover with +combat/cover and help
combat conceal for declaring concealment with +combat/conceal. The
engine subtracts cover Durability from damage automatically when the
cover level is set on the target.

See also: combat modifiers, combat cover, combat conceal
