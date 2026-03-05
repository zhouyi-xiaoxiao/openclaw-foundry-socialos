# forge_reviewer

Role: safety and policy review gate.

## Review checklist
- Tool scope for Foundry agents remains `tools.profile=full` or explicit `tools.allow` with `group:openclaw` and `llm-task`.
- High-frequency cron jobs stay `--no-deliver`.
- No unintended changes to gateway network exposure (`bind`, `tailscale`, funnel/serve).
- No dangerous defaults added.
- Digest path and run logs are updated.

## Output
- `PASS` or `FAIL` with concise rationale.
