# Hackathon Live Provider Setup

Use this when you want SocialOS to switch from fallback/demo mode into live provider mode for the two bounty-specific integrations:

- `Z.AI General` via `POST /integrations/glm/generate`
- `AI Agents for Good` via `POST /integrations/flock/sdg-triage`

## Recommended Model Routing

Keep orchestration and product logic where it already lives, and only route bounty-specific calls into the external providers:

- OpenAI / Codex agent orchestration: keep your current `gpt-5.4` path
- `GLM` route for `Z.AI General`: `glm-5`
- `FLock` route for `AI Agents for Good`: `qwen3-235b-a22b-thinking-2507`

Why this setup:

- `glm-5` is the current flagship Z.AI family model and best fits judge-facing generation work.
- The FLock model recommendation is an inference from the currently available model lineup. The code keeps it easy to override if you want to trade cost or latency for a smaller model later.
- Spend stays controlled because these provider calls are isolated to the bounty routes instead of becoming the default path for every SocialOS action.

## Start Live Mode

Make sure the Keychain contains:

- `Z.ai API key`
- `Flock API key`

Then run:

```bash
cd /Users/zhouyixiaoxiao/openclaw-foundry-socialos
bash scripts/hackathon_live.sh env-check
bash scripts/hackathon_live.sh api
```

This script:

- reads `GLM_API_KEY` from Keychain label `Z.ai API key`
- reads `FLOCK_API_KEY` from Keychain label `Flock API key`
- sets `GLM_MODEL_ID=glm-5`
- sets `FLOCK_MODEL_ID=qwen3-235b-a22b-thinking-2507`
- keeps `PUBLISH_MODE=dry-run`

## Call From Another Agent

The second agent should call your local SocialOS API, not the raw provider endpoints. That keeps provider keys in one place and lets SocialOS keep writing proof artifacts.

### Z.AI General

```http
POST http://127.0.0.1:8787/integrations/glm/generate
Content-Type: application/json
```

```json
{
  "taskType": "bilingual-summary",
  "prompt": "Summarize why SocialOS fits Z.AI General for judges.",
  "context": {
    "audience": "DoraHacks judges",
    "languages": ["en", "zh"]
  },
  "bountyMode": "z-ai-general"
}
```

### AI Agents for Good

```http
POST http://127.0.0.1:8787/integrations/flock/sdg-triage
Content-Type: application/json
```

```json
{
  "text": "We need to coordinate volunteer mentors for a community workshop and help students follow up afterwards."
}
```

## Capture Proofs Sparingly

When you need judge-facing evidence, run:

```bash
bash scripts/hackathon_live.sh proofs
```

This uses the live providers and refreshes the hackathon evidence files, so avoid running it repeatedly without a reason.
