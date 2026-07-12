+district  -- Show or configure district traits and limits.

Syntax:
  +district                      Show traits of the current room.
  +district/show [<target>]      Show traits of the target room or parent.
  +district/set <trait>=<value>  Set a trait value on target (-5 to 5).
  +district/type <archetype>     Set district archetype (e.g. Elysium).
  +district/create-parent <name>[=<archetype>]
                                 Create parent preconfigured with archetype.
                                 
Permissions:
  View        connected.
  Edit        owner of room/parent, or builder+.

Traits:
  access, safety, information, awareness, prestige, stability
  sizemax, securitymin, locationmin

Examples:
  +district
  +district/set safety=2
  +district/set #10/sizemax=3
  +district/create-parent ParentSlums=slums

See also: +roll, @parent
