# SocialOS DoraHacks Shared Video Backbone

Use this script structure for all five bounty videos. Each video should be `5-8 minutes`, stand alone on its own, and still reuse the same SocialOS product backbone.

## 0:00-0:25 Title
Say:

"This is SocialOS for [Bounty Name].

SocialOS is a local-first relationship and identity operating system, and in this video I will show the problem, the solution, the technical implementation, the partner integration, and a short live demo."

## 0:25-1:05 Problem
Say:

"People, context, content, and follow-through drift apart.

One real conversation becomes a note, a screenshot, a follow-up promise, maybe a post, and then the signal gets lost across different tools. SocialOS is built to keep that signal alive."

## 1:05-1:45 Solution
Say:

"SocialOS turns one messy daily input into people memory, event context, multilingual draft packages, trust-first queue handoff, and evidence-backed reflection.

The key point is that this is one product loop, not five disconnected demos."

## 1:45-2:35 Technical Implementation
Say:

"Under the surface, SocialOS runs as a local-first Node web app and API with SQLite, OpenClaw-backed agent lanes, and route-aware proof capture. The user sees one calm interface, while the system keeps memory, validation, publishing, and proof evidence separated behind the scenes."

Show:

- local `Workspace` or the bounty-specific route
- one memory or event artifact
- one proof or agent trace panel

## 2:35-4:15 Bounty-Specific Integration
Insert the matching section from `DORAHACKS_BOUNTY_SWAPS.md`.

This section must explicitly answer:

- what this bounty cares about
- why SocialOS fits
- which API or infrastructure is integrated
- what route or proof JSON a judge can verify afterwards

## 4:15-6:40 Short Live Demo
Use the local route for the target bounty:

- `Claw for Human`: `/demo`
- `Animoca Bounty`: `/hackathon?bounty=animoca`
- `Human for Claw`: `/buddy`
- `Z.AI General`: `/hackathon?bounty=z-ai-general`
- `AI Agents for Good`: `/hackathon?bounty=ai-agents-for-good`

Demo checklist:

1. show one concrete user input or product state
2. show one memory or event result
3. show one proof panel or provider result
4. show one trust boundary, such as `dry-run`, queue handoff, or public proof JSON

## 6:40-7:10 Public Verification
Say:

"After this video, judges can verify the same story on the public site. The deck stays at the root, the canonical bounty page is `/hackathon`, and the structured proof JSON is published alongside it."

Open:

- `https://zhouyixiaoxiao.org/`
- `https://zhouyixiaoxiao.org/hackathon/`
- the matching bounty proof JSON

## 7:10-7:40 Close
Say:

"SocialOS is one product with five review angles: Claw for Human, Animoca, Human for Claw, Z.AI General, and AI Agents for Good.

The core loop is the same in every case: capture, remember, express, hand off, reflect. What changes is the bounty framing and the partner proof."
