# Import Inbox Spec

## Why It Exists
Users will not pre-clean their lives for the system. Onboarding only works if SocialOS can accept messy data and ask for lightweight confirmation instead of heavy data entry.

## Product Default
Import must be review-first:

`raw import -> parse -> review -> merge -> use`

## Accepted Inputs
- pasted notes
- screenshots
- business cards
- chat excerpts
- CSV/contact exports
- event rosters and recap text

## Required Output Shape
The inbox should parse toward:
- people candidates
- event candidates
- interaction candidates
- identity candidates
- duplicate/merge candidates

## Guardrail
Import must not mutate the main system on first parse. The user confirms, merges, edits lightly, or skips.
