# Safety & Risk Boundary

## Runtime posture
- API is loopback-only.
- Web reads local API only.
- SQLite is local and seeded for demo use.
- No external gateway exposure changes are part of this product flow.

## Publish safety
- Default mode is `dry-run`.
- Live publish requires all three:
  1. runtime env enabled
  2. UI live intent enabled
  3. credentials ready
- `X / LinkedIn` remain preflight-only in stable P1.
- High-frequency tasks remain `noDeliver`.

## Agent/tool safety
- High-risk publish actions stay publisher-only.
- Foundry generic task execution uses explicit scope:
  - default scope = `socialos`
  - `openclaw` or `multi-repo` must be explicitly declared
- Generic execution creates backup branch + `lkg` tag before running.

## Content safety
- Draft validation checks:
  - platform format limits
  - basic PII markers
  - sensitive wording markers
- Human review is still required for final brand tone and sensitive content judgement.

## Repo hygiene
- keep secrets, auth profiles, and private runtime state out of git
- keep `reports/` and local DB inspectable but not treated as secrets
- use `.env.example` as the shareable baseline
