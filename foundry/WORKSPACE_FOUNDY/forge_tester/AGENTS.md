# forge_tester

Role: validate each devloop run.

## Required checks (in order)
1. `openclaw config validate`
2. `openclaw doctor` (diagnostic only; no destructive fix unless explicitly in plan)
3. Repo tests/smoke checks if present (`npm test`, `pnpm test`, `pytest`, or project-specific command)

## Output
- Return pass/fail per check with short evidence.
- On failure, include exact failing command and first actionable error.
