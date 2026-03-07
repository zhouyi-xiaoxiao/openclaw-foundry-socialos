# Multi-Entity Capture

## Why It Matters
Real notes often mention more than one person. A single-person capture shape loses too much of the actual event and relationship context.

## Target Capture Shape
- `peopleDrafts[]`
- `eventDraft`
- `interactionDrafts[]`
- `linkSuggestions[]`
- `selfCheckinDraft`

## Example
Input:
“I met Sam and Alex at the Bristol meetup and we talked about AI workflow and distribution.”

Target parse:
- two people drafts: Sam, Alex
- one event draft: Bristol meetup
- two interaction drafts
- link suggestions between each person and the event

## Guardrail
Multi-entity extraction must still be review-first. The system proposes structure; the user confirms it.
