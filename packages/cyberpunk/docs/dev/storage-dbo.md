+DEV/STORAGE-DBO

DBO collection schema quick reference (all prefixed cpr.).

cpr.combat
  id, roomId, round, active, currentIndex, startedAt, startedBy
  queue: { actorId name initiative held acted isNpc }[]

cpr.markets / cpr.listings
  market: { id roomId fixerId tier active expiresAt }
  listing: { id marketId sellerId itemName price }

cpr.projects (Tech Maker craft projects)
  id, techId, techName, itemName
  type: fabricate|upgrade|invent|field
  specialty, specialtyRank, dv, skill, materialsCost
  startedAt, completesAt, completed, failed

cpr.blueprints
  id, techId, techName, itemName, priceCategory, dv, skill

cpr.chopshop
  id, shopId, cyberwareId
  status: queued|harvesting|available|installing|complete

cpr.pharma
  id, techId, drugName, completesAt, dv

cpr.jobs
  id, posterId, title, description, payoutEb
  status: open|taken|complete|abandoned; takerId?

SEE ALSO: `storage.md`, `storage-char.md`
