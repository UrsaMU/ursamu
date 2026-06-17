gear inventory  -- Slot model and equip/unequip mechanics.

Inventory:
  Each catalog item added to inventory gets a stable id so that
  /equip and /remove survive reordering. Slots are 1-based and shown
  on +gear with the slot number, item name, and equipped marker.

Adding:
  +gear/add <key>                Add a catalog item to inventory.
  +gear/add <key>/<note>         Add with a free-text note.
  +gear/add <key> for <player>   Staff: add to another player.

Removing:
  +gear/remove <#>               Drop the item at slot # (1-based).
                                 If equipped, the slot is cleared in
                                 the same write.

Equipping:
  +gear/equip <#>                Equip slot # into its natural slot
                                 (weapon or armor). Items that aren't
                                 weapons or armor cannot be equipped.
  +gear/unequip <weapon|armor>   Clear the named slot.

Effects on the sheet:
  Equipped armor applies its Defense and Speed penalty on the sheet
  automatically; equipped weapon damage feeds +roll/weapon and
  +attack as the weapon modifier. Unequipping reverses the changes.

See also: gear, gear weapons, gear armor
