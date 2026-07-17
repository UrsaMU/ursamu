---
dark: true
---
combat/order  -- Reading the initiative table and turn order.

SEE ALSO: help combat (overview).

DISPLAY
  +combat/order shows each participant in descending init order:
    Name      Init  HP      Status
    Jax       14    OOO...  (active)
    Marcus    11    OOOOO.
  HP boxes: O healthy, / bashing, X lethal, * aggravated.
  '!' next to name = Beaten Down.

TURN FLOW
  Highest init acts first. /next ends the current turn; any following
  NPCs act via AI until a PC (or a manual NPC) is up. After the last
  actor, the round counter loops and Defense resets. /next/manual
  advances one slot with no AI.

DELAY / DROP
  /delay pushes your action later; /act reclaims.
  Reaching 0 HP, Immobilized, or /leave removes you from rotation.

SEE ALSO: help combat, help combat/initiative, help combat/delaying
