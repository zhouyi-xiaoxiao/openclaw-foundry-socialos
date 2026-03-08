# Reuse SocialOS

SocialOS supports two local profiles:

- `demo`: a seeded review/demo workspace for quick reproduction, recordings, and judge verification
- `local`: a blank workspace for your own notes, contacts, and follow-up loops

For API-backed features and optional live providers, see [API_SETUP.md](API_SETUP.md).

## Quickstart

Clone and run the public demo profile:

```bash
git clone https://github.com/zhouyi-xiaoxiao/openclaw-foundry-socialos.git
cd openclaw-foundry-socialos
bash scripts/quickstart.sh
```

Start your own blank local workspace:

```bash
bash scripts/quickstart.sh --profile local
```

Check optional providers and API-backed features:

```bash
bash scripts/provider_doctor.sh
```

## Demo reproduction

Use the `demo` profile when you want the public proof-ready state:

```bash
bash scripts/quickstart.sh
```

This gives you:

- seeded review/demo data
- the public-proof routes locally
- the same relationship-memory workflow used in the recorded demos

## Personal reuse

Use the `local` profile when you want your own blank workspace:

```bash
bash scripts/quickstart.sh --profile local
```

This gives you:

- a blank SQLite workspace
- no automatic demo seeding
- a safe separation from the public demo data

## Optional live-provider setup

SocialOS does not need any API keys to boot.

Add providers only when you want better retrieval or live bounty integrations:

- OpenAI for semantic embeddings and optional voice transcription
- GLM for live Z.AI generation
- FLock for live SDG triage
- Telegram for the optional volunteer channel

See [API_SETUP.md](API_SETUP.md) and [EMBEDDINGS.md](EMBEDDINGS.md) for the exact variables and behavior.

## What the script does

`scripts/quickstart.sh` will:

- verify `node`, `python3`, and `sqlite3`
- create `.env.local` with the selected profile and DB path
- initialize the profile-specific SQLite database
- seed demo data only for the `demo` profile
- start the local API and local web app

## Profile data paths

- demo profile DB: `infra/db/socialos.demo.db`
- local profile DB: `infra/db/socialos.local.db`

That separation prevents demo resets from overwriting a person’s own workspace.

## Adapting SocialOS for yourself

1. Start the `local` profile.
2. Add your own notes through `http://127.0.0.1:4173/quick-capture`.
3. Replace demo contacts by creating your own people, event, and draft history.
4. Keep the public proof site separate from your private local workspace.

## Useful commands

```bash
# Stop local services
bash scripts/stop_demo.sh

# Check service health
bash scripts/demo_status.sh

# Reset the seeded demo profile
bash scripts/quickstart.sh --profile demo --reset-demo

# Run the full repo test suite
bash scripts/test.sh

# Check optional providers and what they unlock
bash scripts/provider_doctor.sh
```

## Troubleshooting

- `sqlite3 is required`: install SQLite and rerun the quickstart command
- `Node 22 or newer is required`: upgrade Node and rerun the quickstart command
- `stale demo process`: run `bash scripts/stop_demo.sh` and then rerun quickstart
- `seed/reset confusion`: the `demo` and `local` profiles use different SQLite files, so switch profiles instead of reusing the same DB

## Public proof vs local product

The hosted site at [zhouyixiaoxiao.org](https://zhouyixiaoxiao.org/) is the read-only proof surface.

The reusable interactive product is the local app you run on your own machine.
