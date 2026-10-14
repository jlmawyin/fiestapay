# FiestaPay implementation rules

- Read docs/PLAN_DIARIO.md and docs/API.md. Approved P1: fixed covers, Recaudado only, fixed-price full payments, one sandbox receiver. P2 has zero committed hours.
- Codex integrates. Claude owns apps/api; AGY Gemini owns apps/web. Do not revert others or edit outside assigned ownership. No independent git commits/pushes by workers.
- Use graph discovery first; check coverage. Docs and new files may require exact source fallback. Never claim graph completeness when missing/stale.
- Amounts come from server integer cents. No payment success without verified capture. Attendance and payment separate. No secrets in Git/logs/browser; no real judge data.
- Tests for money/permissions/concurrency are required. Maximum three evaluated deliveries per issue; then evidence and a new hypothesis.
- Never change other Contabo apps, DNS apex or global proxy defaults. Isolated FiestaPay services and database only.
- External review is independent of constructor. Do not claim live APIs, human tests, video or submission passed without evidence.
