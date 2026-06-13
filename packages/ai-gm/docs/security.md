# ai-gm — Security

This plugin was developed with a full OWASP Top 10 audit plus multiple follow-on
code reviews.

## Mitigations

| Class                 | Mitigation                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------- |
| Path traversal        | `booksDir` is resolved and validated against `Deno.cwd()` before any file operation         |
| Prototype pollution   | `ALLOWED_DRAFT_FIELDS` allowlist on all dynamic field writes in the ingestion pipeline      |
| Prompt injection      | `<book-text>` XML structural delimiters isolate document content in every LLM call          |
| SSRF                  | Wiki base URL sourced from environment only — never from LLM tool arguments                 |
| Secret exposure       | API key redacted in all `+gm` command output; errors sanitized before display               |
| Insecure randomness   | `crypto.getRandomValues()` with rejection sampling throughout                               |
| DoS (ingestion)       | Concurrent ingestion guard; `roundTimeoutSeconds` bounded 30–86400; LLM commands staff-only |
| Schema injection      | Zod validates all DB-loaded game system records before registration                         |
| TOCTOU (credits)      | `spendCredits()` is serialised per-player via a promise queue to prevent overdraft          |
| Private page leakage  | GM pages use targeted `send([playerId])` not broadcast                                      |
| Phantom credits       | Webhook renewal skips when plan is unknown rather than granting a hardcoded fallback        |
| ANSI escape injection | Persona names are stripped of ANSI CSI sequences before display                             |
| Empty slug injection  | `slugify()` returns `"unknown"` fallback on empty/whitespace-only input                     |

## Known Tracked Item

[ursamu#57](https://github.com/UrsaMU/ursamu/issues/57) — atomic `$push` needed
for concurrent pose writes in `addPose()`. Current behaviour: last writer wins
on simultaneous poses. Impact is low (rare edge case, no data loss — only one
pose is dropped), but tracked for future engine support.

## Reporting

For security issues, open a GitHub issue marked **[SECURITY]** or contact the
maintainer directly. Do not include exploit code in public issues.
