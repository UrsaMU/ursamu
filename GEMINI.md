# UrsaMU — Gemini Instructions & Resources

This document outlines key instructions and references for the Gemini AI agent working on the UrsaMU engine and plugins.

## Authoritative Resources

- **D&D 5e SRD**: [D&D Beyond SRD](https://www.dndbeyond.com/srd)
- **UrsaMU API Reference**: Located at `/Users/kumakun/.claude/skills/ursamu-dev/references/api-reference.md`
- **Core Monorepo Packages**: Consumed via JSR packages `@ursamu/ursamu` and `@ursamu/help-plugin`

## Development Constraints
- **Line Length**: Enforce a maximum line width of 78 characters on all code/text modifications.
- **Deno / TypeScript**: Ensure code passes type checking (`deno task test` / `deno check`) and runs cleanly.
