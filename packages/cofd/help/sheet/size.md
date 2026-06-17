sheet size  -- Size, Speed, and Health track math.

Size is a staff-only trait (admin or builder). Default Size is 5
(human-scale). Changing it recomputes derived stats at sheet render
time.

Derived stats:
  Speed     Strength + Dexterity + Size, modified by gear and Tilts.
  Health    Stamina + Size. Lowering Size clamps the Health track to
            the new maximum; existing damage is preserved up to the cap.

Editing:
  +sheet/set size=4 for Marcus     Staff: shrink Marcus to Size 4.
  +sheet/set size=                 Reset Size to default (5).

Children, scaled creatures, and certain templates may legitimately
sit outside the default. The 1-10 range is enforced; out-of-range
input is rejected.

See also: sheet, sheet traits, health
