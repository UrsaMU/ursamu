sheet specialties  -- Skill specialties: syntax and description notes.

Specialties grant +1 die to rolls that fall within the specialty's
narrative scope (CoFD 2e core). Each character may have any number
per skill, subject to the Storyteller's narrative gate.

Syntax:
  +sheet/set specialty/<skill>=<name>
  +sheet/set specialty/<skill>=<name>: <description>
  +sheet/set specialty/<skill>=                 Remove all specialties.

Description notes:
  The optional ': <description>' adds a short inline note shown on
  +sheet. Max 80 characters. Re-setting the same specialty name
  without ': <description>' preserves the existing description.

Removal:
  Setting specialty/<skill>= with an empty value clears every
  specialty on that skill. Re-add them one at a time.

Examples:
  +sheet/set specialty/athletics=Climbing
  +sheet/set specialty/brawl=Boxing: southpaw stance
  +sheet/set specialty/firearms=Pistols
  +sheet/set specialty/athletics=               (clears Climbing)

See also: sheet, sheet traits, roll
