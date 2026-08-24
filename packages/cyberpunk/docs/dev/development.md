+DEV/DEVELOPMENT

Development setup and workflow for the CPR plugin.

PREREQUISITES
  Deno >= 1.40. No npm/pip — Deno fetches from JSR on first run.

COMMANDS
  deno task test          Run full test suite (must stay green)
  deno lint               Lint check (must be clean)
  deno check index.ts     Full type check
  deno fmt                Format (2-space indent, double quotes)

TEST STRUCTURE
  tests/dice.test.ts          Dice primitives, skill checks, damage
  tests/character.test.ts     Stats, wounds, healing, chargen
  tests/combat.test.ts        Attack resolution, armor, initiative
  tests/market.test.ts        Markets, EB, drugs, lifestyle
  tests/crafting.test.ts      Maker ranks, projects, blueprints
  tests/security/             TDD exploit tests (red-green-refactor)

MOCK SDK
  const u = mockU({ args: ["Alice", "100"], targetResult: alice });
  Inspect: u._sent[], u._sentTo[], u._dbCalls[]

ADDING A COMMAND
  1. Add addCmd() in commands/ file
  2. Ensure commands/index.ts imports it (side-effect)
  3. Write tests against engine/ functions it uses
  4. Run: deno task test && deno check index.ts

SEE ALSO: `dev-layout.md`, `dev-hooks.md`
