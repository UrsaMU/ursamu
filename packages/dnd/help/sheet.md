+sheet  -- View or modify character sheets.

SYNTAX
  +sheet [<player>]
  +sheet/set [<player>/]<trait>=<value>

TRAITS
  Basic:
    class, subclass, species, background, level, ac, speed, hp
  Abilities:
    strength, dexterity, constitution, intelligence, wisdom, charisma
  Skills:
    skill/athletics, skill/stealth, skill/perception, etc.
    Values: none, proficient, expert
  Saving Throws:
    save/strength, save/dexterity, etc.
    Values: yes, no, proficient, none

EXAMPLES
  +sheet                          - View your own sheet.
  +sheet/set Strength=15          - Set your Strength to 15.
  +sheet/set skill/stealth=expert - Set your Stealth to Expert.
  +sheet/set save/wisdom=yes      - Become proficient in Wisdom saves.
  +sheet/set level=3              - Change your level to 3.

SEE ALSO: help dnd, help roll
