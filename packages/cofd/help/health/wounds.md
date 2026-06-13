health wounds  -- Track sizing, damage type cascade, wound penalty,
                unconscious/dying/dead states.

Track size:
  Stamina + Size. A Stamina 2 / Size 5 human has 7 boxes.

Box symbols:
  [ ]   empty
  [/]   bashing      (fists, falls, exhaustion)
  [X]   lethal       (blades, bullets)
  [*]   aggravated   (fire, claws, supernatural)

Cascade:
  Free boxes fill first. When the track is full, a new box of a heavier
  type upgrades the leftmost lighter-type box (bashing -> lethal ->
  aggravated). Total boxes never exceed the track maximum.

Wound penalty:
  When the three rightmost boxes hold any damage, dice rolls take a
  penalty:
    3rd-to-last filled    -1
    2nd-to-last filled    -2
    last (rightmost) full -3
  The worst applicable penalty applies. Penalties do NOT stack.
  Subtracted from every +roll except raw numeric pools.

States:
  All bashing filled    Unconscious; bashing converts to lethal at
                        1/scene until stabilized.
  All lethal filled     Dying; lose 1 lethal/minute until stabilized.
  All aggravated filled Dead.

See also: health, roll, sheet
