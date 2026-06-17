+gear [<player>] [<filter>]  -- Browse equipment and manage carried items.

CORE SYNTAX
  +gear [<player>] [<filter>]   View inventory; filter: ammo|weapons|
                                armor|gear.
  +gear/list [<cat>]            Catalog by section.
  +gear/show <key>              Full catalog entry.
  +gear/add <key>[/<note>] [for <p>]
  +gear/remove <#> [for <p>]
  +gear/equip <#> [for <p>]
  +gear/unequip <weapon|armor> [for <p>]
  +gear/reload [<#|name>] [for <p>]
  +gear/split <#>=<n> [for <p>]
  +gear/damage <#|name>[=<n>] [for <p>]
  +gear/repair <#|name>[=<n>] [for <p>]

Modifying another player's gear requires canEdit (builder+).
Use native get/drop/give to move items between players and rooms.

SEE ALSO: help gear/ammo, help gear/durability, help gear/reload,
          help gear/weapons, help gear/armor, help gear/inventory,
          help attack, help reload
