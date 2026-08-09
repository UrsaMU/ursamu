+ITEM

Create a D&D item in your inventory (builder+).

SYNTAX
  +item/create <name>=<spec>

SPECS
  weapon:<dmg>:<type>[:props]
  armor:<ac>:<light|medium|heavy>
  shield:<bonus>
  general

EXAMPLES
  +item/create Longsword=weapon:1d8:slashing
  +item/create Dagger=weapon:1d4:piercing:finesse,light
  +item/create Scale Mail=armor:14:medium
  +item/create Steel Shield=shield:2
  +wield Longsword

SEE ALSO: +help inventory, +help npc
