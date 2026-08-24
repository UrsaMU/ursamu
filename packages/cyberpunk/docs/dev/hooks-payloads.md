+DEV/HOOKS-PAYLOADS

Key combat event payload types for cpr:* gameHooks events.

cpr:combat:start
  roomId, startedBy: string
  participants: { actorId: string; name: string }[]

cpr:attack:resolved
  attackerId, attackerName, defenderId, defenderName: string
  weaponName?: string
  attackRoll, attackTotal, defenseTotal: number
  hit: boolean
  rawDamage, netDamage: number
  isCritical, aimed, autofire: boolean

cpr:wound:changed
  actorId, actorName, woundState: string
  hpCurrent, hpMax, delta: number

cpr:death_save:rolled
  actorId, actorName: string
  roll, threshold: number
  survived: boolean

cpr:critical_injury
  actorId, actorName, location: string
  injuryName, effects: string
  deathSavePenalty: number

SEE ALSO: `ai-gm-hooks.md`, `hooks-other.md`
