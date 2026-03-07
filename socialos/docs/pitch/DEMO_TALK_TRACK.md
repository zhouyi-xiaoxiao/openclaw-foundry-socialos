# SocialOS Demo Talk Track

For slide-by-slide deck reading, see `socialos/docs/pitch/DECK_PAGE_SCRIPT.md`.

## URLs To Open
- Workspace: `http://127.0.0.1:4173/quick-capture`
- Demo: `http://127.0.0.1:4173/demo`
- Hackathon: `http://127.0.0.1:4173/hackathon`
- Buddy: `http://127.0.0.1:4173/buddy`
- Contacts: `http://127.0.0.1:4173/people`
- Logbook: `http://127.0.0.1:4173/events`
- Drafts: `http://127.0.0.1:4173/drafts`
- Queue: `http://127.0.0.1:4173/queue`
- Mirror: `http://127.0.0.1:4173/self-mirror`
- Settings: `http://127.0.0.1:4173/settings`

Public proof pages:
- `https://zhouyixiaoxiao.org/`
- `https://zhouyixiaoxiao.org/demo/`
- `https://zhouyixiaoxiao.org/hackathon/`
- `https://zhouyixiaoxiao.org/buddy/`

## Recommended Sequence
### 1. Workspace capture
Say:
“I can start with one natural note, not a form. SocialOS stays quiet until structure is actually useful.”

Type a note about meeting someone.

### 2. Fuzzy recall
Say:
“The same workspace can recall people and events from fuzzy context, not just exact names.”

Ask a fuzzy question and let the contact or event appear.

Fallback if recall misses:
- open `Contacts`
- search with the natural-language command bar

### 3. Event to drafts
Say:
“Once something becomes worth expressing, I can turn it into an event and generate one clean platform-native set.”

Open `Drafts` for the event and show:
- LinkedIn / X / Instagram in English
- Zhihu / Rednote / WeChat Moments / WeChat Official Account in Chinese

### 4. Queue handoff
Say:
“The first version is trust-first. It prepares the handoff instead of pretending everything should auto-post.”

Open `Queue` and show:
- `Ready`
- `Manual Step`
- `Done / Failed`

### 5. Mirror
Say:
“This is not a personality quiz. It is a reflection layer grounded in what actually happened.”

Open `Mirror` and show:
- Daily reflection
- Weekly synthesis
- one evidence-backed insight

### 6. Public proof handoff
Say:
"After the recording, judges can reopen the public proof site without needing access to the localhost runtime."

Open:
- public `/`
- public `/hackathon/`
- public `/demo/` or `/buddy/` depending on the target bounty

## Likely Judge Questions
### Why local-first?
Because the most valuable information here is deeply personal, and users need a tight trust boundary before they will let a system organize it.

### Why multi-agent?
Because capture, memory, reflection, validation, and publish handoff are different jobs that become safer and clearer when they are separated.

### How is this different from a CRM or social media tool?
It closes the loop between relationships, content, and self-understanding instead of optimizing only one of those surfaces.

### How do users onboard real data?
The next implementation layer is review-first import: raw notes, screenshots, business cards, and chat excerpts go into an Import Inbox, then the user only confirms or merges.
