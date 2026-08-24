# Cyberpunk RED plugin — developer docs

In-game help lives under `../help/` and is registered with
`registerHelpDir` (section `cpr`). This folder is **not** loaded
into `+help`.

## Contents

| Doc | Audience |
|-----|----------|
| [getting-started.md](./getting-started.md) | Install and first run |
| [commands.md](./commands.md) | Full command catalog |
| [FIRST-HOUR.md](../FIRST-HOUR.md) | Player first session |
| [dev/](./dev/) | Storage, hooks, rules coverage |

## dev/

Former `help/_dev/` material for maintainers and AI-GM integrators:

| File | Topic |
|------|--------|
| development.md | Test / lint / contribute |
| dev-layout.md | Package layout |
| dev-hooks.md | Hook overview |
| hooks-payloads.md | `cpr:*` payloads |
| hooks-other.md | Other hook notes |
| ai-gm-hooks.md | AI-GM bridge |
| storage.md | Storage overview |
| storage-char.md | `state.cpr` layout |
| storage-dbo.md | `cpr.*` DBO collections |
| rules-coverage.md | Rulebook coverage map |
| rules-combat.md | Combat rules notes |
| rules-systems.md | Non-combat systems |

## Help standards (in-game)

Player topics under `help/` follow ursamu-dev / project rules:

- Max **22** lines of content (count blanks)
- Max **78** characters per line
- Title `+TOPIC` ALL CAPS; sections `SYNTAX` / `SWITCHES` /
  `EXAMPLES` / `SEE ALSO`
- Subtle markdown only (`**bold**`, `` `code` ``)
- Split long topics into named subdirs with `SEE ALSO` links
