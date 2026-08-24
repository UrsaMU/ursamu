+DEV/STORAGE-CHAR

ICPRCharacter fields stored at state.cpr on the player IDBObj.

IDENTITY AND STATS
  role, roleRank, chargenComplete, chargenMethod
  stats: { int ref dex tech cool will luck move body emp }
  hp: { current max }
  woundState: healthy | lightly | seriously | mortally | dead
  deathSave (= BODY), empBase (= EMP before HL), humanityLoss

SKILLS AND ECONOMY
  skills: Record<string, number>    skill name to rank 0-10
  eurodollars, lifestyle, nextLifestyleDue
  luckPool, luckMax (= LUCK stat)
  reputation, reputationDeeds: string[]

COMBAT
  armorBody, armorHead: IArmorState | null
    IArmorState: { name sp currentSp penalty }
  criticalInjuries: ICriticalInjury[]   capped at 20
    ICriticalInjury: { id location roll name effects
                       deathSavePenalty appliedAt }

CYBERWARE AND DRUGS
  cyberware: ICyberwareState[]
  activeDrugEffects: IDrugEffect[]
    IDrugEffect: { drugName effect appliedAt expiresAt }
  roleData: Record<string, unknown>
  lifepath: ILifepath

SEE ALSO: `storage.md`, `storage-dbo.md`
