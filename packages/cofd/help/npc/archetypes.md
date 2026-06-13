npc archetypes  -- Archetype catalog and default loadouts.

Each archetype prepopulates an NPC's attributes, skills, and starting
gear. Default tier is listed in parentheses.

  thug          Street muscle. Brawl 3, club.            (minor)
  cultist       Devoted believer. Occult 3, knife.       (minor)
  soldier       Trained combatant. Firearms 3, pistol.   (minor)
  beast         Feral predator. Strength 4, Brawl 3.     (minor)
  lieutenant    Mid-tier antagonist. Weaponry 3.         (major)
  boss          Top of the food chain.                   (major)
  hunter        Monster hunter. Firearms 3, Occult 3.    (major)
  professional  Operator. Firearms 4, Stealth 3.         (major)
  occultist     Mortal practitioner. Occult 4.           (major)
  ghost         Restless dead. Materialize, Phantasm.    (major)
  spirit        Ephemeral from the Shadow.               (major)
  mastermind    Nemesis. PC-equivalent.                  (storyteller)

Tier override:
  +npc/build Goon=thug/major   Promote a Thug to major tier.

AI archetypes (drive NPC behavior in combat):
  beshilu-swarmer       Rat-host. Flee under 25%, gang-up, revenge, weakest.
  azlu-stalker          Spider-host. Ambush unrevealed, seek cover, isolate.
  spirit-ridden-feral   Possessed mortal. Frenzy when damaged, target attacker.

Set with:
  +npc/ai <name>=<ai-archetype>

Default for newly built NPCs is beshilu-swarmer. Override anytime.

See also: npc, npc tiers, npc derived, turn

