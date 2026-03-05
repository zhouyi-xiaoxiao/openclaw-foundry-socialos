# capture-person

Extract structured person + self check-in info from low-friction text capture.

## Inputs
- Raw capture text
- Optional context tags (event, location, timestamp)

## Output contracts
- Person Card: name, tags, platforms, next follow-up, notes
- Self Check-in: energy(-2..+2), emotion tags, trigger, one-line reflection

## Required side effects
- `crm_upsert_person`
- `self_log_checkin`
- write markdown memory file under `memory/people/` when available
