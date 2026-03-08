# Hackathon Live Provider Setup

Use this document to verify and refresh the live provider paths used by the final DoraHacks submission pack:

- `Z.AI General` via `POST /integrations/glm/generate`
- `AI Agents for Good` via `POST /integrations/flock/sdg-triage`
- `AI Agents for Good` Telegram channel via `GET /integrations/telegram/status` and `POST /integrations/telegram/send`

## Recommended Routing
- `GLM_MODEL_ID=glm-5`
- `FLOCK_MODEL_ID=qwen3-235b-a22b-instruct-2507`
- `STRUCTURED_MODEL_TIMEOUT_MS=20000`
- `PUBLISH_MODE=dry-run`

## Keychain Labels
The scripts read provider keys from macOS Keychain by default:

- `Z.ai API key`
- `Flock API key`
- `Telegram Bot Token`
- `Telegram Webhook Secret`
- `Telegram Default Chat ID`
- `Telegram Bot Username`

## Verify Configuration
Run:

```bash
cd /Users/zhouyixiaoxiao/openclaw-foundry-socialos
bash scripts/hackathon_live.sh env-check
```

## Refresh Live Proofs
Run:

```bash
bash scripts/hackathon_live.sh proofs
```

This command:

- requires both provider keys
- captures live GLM and FLock responses
- captures Telegram channel proof when Telegram credentials are present
- refuses to write fallback-only proof snapshots
- refreshes `socialos/docs/evidence/hackathon-*.json`

## Record-Ready End-To-End Flow
Run:

```bash
bash scripts/hackathon_preflight.sh
```

That command verifies the provider configuration, restarts the local demo, captures live evidence, and exports the public static proof site.
