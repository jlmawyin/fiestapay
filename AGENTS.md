# FiestaPay implementation rules

- Read docs/PLAN_DIARIO.md and docs/API.md. The October25 P0-P6 priorities and October31 delivery deadline supersede the historic plan. Fixed covers, fixed-price payments and one sandbox receiver remain; open funds/deposits/physical contributions remain out of scope. All financial calculations stay server-side in integer cents.
- Follow dirigir-agentes as explicitly requested by Jorge: GROK implements assigned packages, AGY verifies independently, Claude handles recovery under the skill rules, and Codex coordinates/integrates. Maximum two construction fronts. Do not revert others or edit outside assigned ownership. No independent git commits/pushes by workers.
- Use graph discovery first; check coverage. Docs and new files may require exact source fallback. Never claim graph completeness when missing/stale.
- Amounts come from server integer cents. No payment success without verified capture. Attendance and payment separate. No secrets in Git/logs/browser; no real judge data.
- Tests for money/permissions/concurrency are required. Maximum three evaluated deliveries per issue; then evidence and a new hypothesis.
- Never change other Contabo apps, DNS apex or global proxy defaults. Isolated FiestaPay services and database only.
- External review is independent of constructor. Do not claim live APIs, human tests, video or submission passed without evidence.
