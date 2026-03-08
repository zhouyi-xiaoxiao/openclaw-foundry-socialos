# Reuse SocialOS

SocialOS supports two local profiles:

- `demo`: a seeded review/demo workspace for quick reproduction, recordings, and judge verification
- `local`: a blank workspace for your own notes, contacts, and follow-up loops

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
```

## Troubleshooting

- `sqlite3 is required`: install SQLite and rerun the quickstart command
- `Node 22 or newer is required`: upgrade Node and rerun the quickstart command
- `stale demo process`: run `bash scripts/stop_demo.sh` and then rerun quickstart
- `seed/reset confusion`: the `demo` and `local` profiles use different SQLite files, so switch profiles instead of reusing the same DB

## Public proof vs local product

The hosted site at [zhouyixiaoxiao.org](https://zhouyixiaoxiao.org/) is the read-only proof surface.

The reusable interactive product is the local app you run on your own machine.
