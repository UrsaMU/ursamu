+gear durability  -- Item Durability, Structure, and broken state.

Every CoFD item has two values:
  Durability       Flat damage soak applied to incoming damage. Catalog-
                   seeded; weapons default 2, armor default 2, gear uses
                   the catalog Durability rating, ammo defaults 1.
  Structure        Current "hp." Starts equal to maxStructure (catalog
                   Structure for gear, Size for weapons/armor/ammo).
                   Clamped to [0, maxStructure].

Soak math:
  damage_applied = max(0, raw_damage - Durability)
  next_structure = max(0, current_structure - damage_applied)

When structure reaches 0 the item flips to broken=true. Broken items are
force-unequipped: the dark flag is cleared, equippedBy is unset, and the
sheet's equippedWeapon/equippedArmor pointer is nulled. The owner's room
gets a broadcast that the item failed.

Damaging and repairing:
  +gear/damage <ref>[=<n>]       Apply <n> raw damage (default 1).
  +gear/repair <ref>[=<n>]       Heal <n> hp (default 1), clamped at max.

Repair is builder+ for cross-player edits (canEdit). The +attack command
can also damage items directly -- aim at an inert object instead of a PC
and the soak path runs automatically.

Examples:
  +gear/damage rifle=4           Apply 4 raw damage to your rifle.
  +gear/repair vest=2            Repair 2 hp on your vest.
  +attack the-rifle              Smash a dropped rifle in the room.

See also: gear, gear ammo, attack
