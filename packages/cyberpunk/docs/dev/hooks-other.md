+DEV/HOOKS-OTHER

Non-combat cpr:* event payloads.

CHARGEN AND CYBERWARE
  cpr:chargen:complete
    actorId, actorName, role, method: string
  cpr:cyberware:installed
    actorId, actorName, cyberwareName: string
    hlAdded, humanityLossTotal: number
  cpr:cyberpsychosis:threshold
    actorId, actorName: string; empCurrent, threshold: number

SOCIAL AND ROLE
  cpr:reputation:gained
    actorId, actorName: string; newRep: number; deed: string
  cpr:role:ability
    actorId, actorName, role, abilityName: string; rank: number

ECONOMY AND CRAFTING
  cpr:eb:transferred
    fromId, fromName, toId, toName: string; amount: number
  cpr:lifestyle:defaulted
    actorId, actorName, fromTier, toTier: string
  cpr:craft:started
    { techId techName projectId itemName }
  cpr:craft:completed
    { techId techName itemName success: boolean }

SEE ALSO: `ai-gm-hooks.md`, `hooks-payloads.md`
