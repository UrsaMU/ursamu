+aid  -- Render first aid using Dexterity + Medicine.

Syntax:
  +aid <target>             Treat the named character.
  +aid                      Self-aid (must have damage to treat).
  +aid/reset <player>       Staff: clear a patient's once-per-scene lock.

Permissions:
  Self-aid       connected.
  Aid other      connected + canEdit (builder+) on the patient.
  Reset lock     connected + canEdit on the patient.

Mechanics:
  Pool      Dexterity + Medicine. Untrained Medicine inflicts -3.
  Wound     The medic's own wound penalty applies.
  Result    Per success, convert 1 lethal box to 1 bashing. With no lethal
            left, each success clears 1 bashing instead. Aggravated damage
            cannot be treated by first aid.
  Bonus     Exceptional success (5+) also clears one bashing automatically.
  Botched   Dramatic failure adds 1 lethal to the patient.
  Cap       Once per scene per patient. The +aid/reset switch clears the
            lock for the next scene.

Examples:
  +aid Marcus              Treat Marcus's wounds.
  +aid                     Self-aid for a wounded medic.
  +aid/reset Marcus        Clear Marcus's scene cap (staff).

See also: health, condition, combat
