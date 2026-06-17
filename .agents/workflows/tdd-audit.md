---
description: Run the complete TDD Remediation Autonomous Audit
risk: low
source: personal
date_added: "2024-01-01"
audited_by: lcanady
last_audited: "2026-03-25"
audit_status: safe
---
Please use the TDD Remediation Protocol Auto-Audit skill (located in the `skills/tdd-remediation` folder) to secure this repository.

Follow the full Auto-Audit protocol from `auto-audit.md`:

1. **Detect** the tech stack (package.json, pubspec.yaml, go.mod, etc.) and scope the scan to relevant patterns only.
2. **Explore** the codebase using Glob, Grep, and Read. Focus on controllers, routes, middleware, and database layers. Search for the vulnerability patterns defined in Phase 0 of the auto-audit prompt.
3. **Present** a structured Audit Report, grouped by severity (CRITICAL / HIGH / MEDIUM / LOW), with a plain-language risk explanation and effort estimate for each finding. Wait for confirmation before making any changes.
4. **Remediate** each confirmed vulnerability one at a time, top-down by severity, applying the full Red-Green-Refactor loop:
   - Write the exploit test (Red — must fail)
   - Apply the patch (Green — test must pass)
   - Run the full suite (Refactor — no regressions)
5. **Harden** the codebase proactively after all vulnerabilities are patched:
   - Security headers (Helmet / CSP)
   - Rate limiting on auth routes
   - Dependency vulnerability audit (npm audit / pip-audit / govulncheck)
   - Secret history scan (gitleaks / trufflehog)
   - Production error handling (no stack traces)
   - CSRF protection and secure cookie flags
6. **Report** a final Remediation Summary table (including the fix applied for each item) when all issues are addressed.

Do not skip steps. Do not advance to the next vulnerability until the current one is fully proven closed by a passing test.

Pass `--scan` to generate the Audit Report only without making any code changes.
