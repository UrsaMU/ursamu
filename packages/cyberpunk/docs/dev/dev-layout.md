+DEV/DEV-LAYOUT

Project directory layout reference.

ROOT FILES
  index.ts          IPlugin export — hooks wired here
  deno.json         Package manifest, import map, tasks
  db/schemas.ts     All TypeScript interfaces

COMMANDS (commands/)
  chargen.ts        +chargen wizard and display helpers
  chargen-steps.ts  Step handlers for each chargen stage
  combat.ts         +init, +attack, +pass, +combat
  wounds.ts         +wound, +crit, +deathsave, +stabilize, +heal
  rolls.ts          +roll, +luck
  economy.ts        +eb, +lifestyle, +drug, +rep, +facedown
  improve.ts        +improve
  sheet.ts          +sheet, +score
  market.ts         +market, +chopshop, +bodysculpt
  pharma.ts         +pharma
  crafting.ts       +craft
  scavenge.ts       +scavenge
  jobs.ts           +job
  admin.ts          +cpr (admin overrides)

ENGINE AND DATA
  engine/           Pure domain logic — no SDK calls, fully testable
  data/             Static tables: skills, weapons, armor, drugs, etc.
  hooks/            augment.ts (event types) + emitters.ts (typed emit)
  tests/            Deno unit tests + tests/helpers/mockU.ts

SEE ALSO: `development.md`, `dev-hooks.md`
