# API Setup

SocialOS runs locally with zero API keys by default.

Use this guide when you want to unlock better embeddings, live bounty providers, or the optional Telegram channel.

## I just want the demo to run

You do not need any API keys.

Run:

```bash
bash scripts/quickstart.sh
bash scripts/provider_doctor.sh
```

What you get:

- local web app
- local API
- seeded demo dataset
- local embeddings fallback
- hackathon routes and public proof links

## I want better embeddings

Add to `.env`:

```bash
EMBEDDINGS_PROVIDER=auto
OPENAI_API_KEY=your_key_here
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
```

What this unlocks:

- semantic retrieval on top of the normal keyword fallback
- better People search and retrieval quality
- optional voice-note transcription support

If you keep `EMBEDDINGS_PROVIDER=auto` and remove the key later, SocialOS falls back to local embeddings automatically.

## I want live Z.AI

Add to `.env`:

```bash
GLM_API_KEY=your_key_here
GLM_MODEL_ID=glm-4.7
```

What this unlocks:

- live `Z.AI General` route
- live `POST /integrations/glm/generate`
- GLM-backed summaries and draft-generation proof flows

## I want live FLock

Add to `.env`:

```bash
FLOCK_API_KEY=your_key_here
FLOCK_MODEL_ID=qwen3-30b-a3b-instruct-2507
```

What this unlocks:

- live `AI Agents for Good` SDG triage
- live `POST /integrations/flock/sdg-triage`
- open-source-model-backed impact workflow proof

## I want Telegram

Add to `.env`:

```bash
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_DEFAULT_CHAT_ID=your_chat_id
TELEGRAM_WEBHOOK_SECRET=your_secret
TELEGRAM_BOT_USERNAME=your_bot_username
```

Minimum useful setup:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_DEFAULT_CHAT_ID`

What this unlocks:

- optional volunteer/channel handoff
- live Telegram send proof
- webhook proof when `TELEGRAM_WEBHOOK_SECRET` is also set

## I want my own blank workspace

Run:

```bash
bash scripts/quickstart.sh --profile local
bash scripts/provider_doctor.sh
```

What this changes:

- uses `infra/db/socialos.local.db`
- does not seed the public demo dataset
- keeps your own notes and contacts separate from the demo profile

## Quick checks

Use the provider doctor after any change:

```bash
bash scripts/provider_doctor.sh
```

It reports:

- whether `.env` and `.env.local` exist
- which profile is active
- requested and effective embeddings provider
- whether OpenAI, GLM, FLock, and Telegram are configured
- what each provider actually unlocks
