+GEAR

Manage carried **inventory** (weapons, armor, misc).

SYNTAX
  +gear[/switch] [<argument>]

SWITCHES
  /list              Show all gear (default).
  /add <name>=<type> Add item (`weapon` `armor` `gear` `ammo`…).
  /equip <id>=<slot> Slot: `wielded` `worn` `carried`.
  /conceal <id>      Toggle concealed flag.
  /remove <id>       Drop item from inventory.

EXAMPLES
  +gear                        List your gear.
  +gear/add Knife=weapon       Add a knife.
  +gear/equip abc12345=wielded Equip by id prefix.

SEE ALSO: +help armor, +help scrap, +help market
