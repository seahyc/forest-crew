# Skills emerge from playing together

Status: design target. The current deterministic world fixture does not yet run model actors, learn skills, persist a skill graph or demonstrate transfer. The authored files under `game-skills/` are illustrative possible learned outputs; they must not be preloaded as a starter curriculum.

## The player promise

Your crew learns through the incidents you tackle together. Agents observe you and one another, try approaches, notice outcomes, and develop reusable methods. Their flexible skill trees grow from those experiences. You help shape a distinctive crew by playing, explaining, correcting and assigning increasingly challenging problems.

Actors start with general model reasoning and knowledge of primitive game tools and their rules: observe, move, connect, operate, claim, communicate. Designers author the world and its affordances. Agents discover strategies, name their skills and build relationships between them. This is persistent experiential knowledge, not a claim of model weight training. Changing an actor's model preserves their learned knowledge and history.

## Learning happens inside missions

1. **Experience.** An actor observes a player demonstration, tries an approach, helps a colleague, or encounters a failure. Record observable actions, messages, conditions and outcomes.
2. **Extract.** At a meaningful result or quiet moment, the actor proposes a reusable lesson: when it applies, what to try, what to check, and when to ask for help. Save it as a versioned `SKILL.md` node linked to the actual experience.
3. **Apply.** On a relevant subsequent task, the actor retrieves and adapts that method. Provisional methods can be tried immediately within ordinary world rules; there is no certification exam or unlock gate for normal work.
4. **Revise and connect.** Success adds evidence within the observed conditions. Failure may narrow the scope, revise a method or create a different branch. Actors can combine complementary skills, merge duplicates or retire an unhelpful method.
5. **Share.** A teammate explains or demonstrates a method during shared work. The recipient can adopt and adapt it, but receiving the file does not confer the teacher's experience or prove competence.

Reflection is bounded and event-driven, never required for each animation frame. The world keeps moving while an actor thinks. Learning and inference consume explicitly budgeted game oxygen; real provider spending has a separate cap.

## Flexible trees, implemented as a graph

There is no designer-enumerated progression such as repair level 1 -> repair level 2. A node is an agent-authored reusable method, not a badge, task completion or raw memory. Links can express that a method builds on another, combines several methods, specialises one for a condition, or was learned from a teammate. Prerequisite links express useful knowledge dependencies, not arbitrary permission locks. Reject circular prerequisite chains while retaining ordinary associative links.

For example, one crew might discover:

- Keeping water available while a colleague sprays.
- After losing pressure when an operator leaves: arranging replacement coverage before leaving a post.
- Combining coverage with diagnosing supply failure: maintaining a supply team with less player intervention.
- Later branching into a fast setup for one grove or coordinating supply across several fronts.

These names and branches are examples, not expected outputs or mandated solutions. Another crew might organise around relays, specialist pairs or the player's habits. Multi-front mechanics are later scope, not capabilities of the current boolean fixture.

The player sees what someone learned, the incident that taught it, and what it helps them do. Show a quiet, gesture-accessible crew journal after an incident. No skill-tree administration is required during a fire. Player-specific habits remain conditional and revisable: a learned preference must not override a new instruction.

## Literal SKILL.md as learned memory

Each node has a short name/description, applicability, method, decision points, team dependencies, checks and known limitations. Methods reference current observations rather than memorised coordinates. Save immutable revisions with source event IDs. The agent proposes content and graph changes; storage validates structure and references, while world events supply outcome evidence. An agent cannot manufacture successful experience by declaring itself skilled.

Suggested persistence (not implemented):

```text
state/skills/<skill-id>/<content-hash>/SKILL.md # agent-authored revisions
state/crew/<actor-id>/skills.json              # graph links, current revisions, individual evidence
state/learning/<episode-id>.json              # conditions, contributions, outcomes, interventions
```

A skill reference includes `skillId`, `contentHash`, `sourceEpisodeIds`, `learnedFrom`, `relations`, `observedScope`, and success/failure/assistance evidence. Confidence is scoped to observed conditions, not a universal intelligence score. Preserve revision history and distinguish evidence for an old version from evidence for its replacement. Shared content can be deduplicated; each actor's experience remains individual.

Only create durable nodes for reusable lessons. Bound the library and context through relevance retrieval, duplicate merging and archival of stale or unsupported methods. Do not reward skill count: the reward is a crew that needs less micromanagement and can handle new combinations of jobs.

## Cooperation skills belong to cooperating actors

A joint method can describe complementary roles and a handoff protocol. Every participant still decides whether to accept a role, obtains its own task claim and performs its own world actions. One actor's skill file cannot command another actor or silently assign its commitment.

A task is one concrete application with an owner, resources and completion conditions. A skill is knowledge for approaching many such tasks. Observable joint success requires each participant's contribution and the dependent result, not just an exchange of confident messages. Shared lessons retain who contributed what and what actually happened.

## Context and tools

The local crew preview implements `list_skills`, `read_skill`, and `remember_skill` with actor-scoped versioned storage, successful-event evidence and parent links. Explicit cross-actor sharing is not implemented yet. Retrieve one or two relevant methods instead of replaying all history. Keep current commitments, outstanding handoffs and authoritative world state separate from skill prose so compaction does not erase responsibilities.

Trace actor/model, observations, loaded skill hashes, proposed changes, tool calls/results, messages, outcomes and oxygen usage. Never log hidden chain-of-thought. Refresh world state after delayed decisions. Skills remain advisory knowledge: they cannot grant tools, override world rules, change budgets or bypass action preconditions.

## First proof: learn once, adapt on the next incident

Start two real model actors with primitive tool knowledge and no authored firefighting packages. Have them solve one small supply problem alongside the player. Let an actor extract one useful coordination lesson from what happened and store its own method. In a subsequent supported variation, observe whether it retrieves, applies or revises that method and works with its teammate with less prompting.

A backstage evaluator compares memory-retained and memory-reset runs over matched states, models and budgets. Repeat runs because model outcomes vary. Inspect task effects, pressure interruptions, player interventions, duplicate work, time, communication and provider usage. The evaluator must not require a particular skill name, branch structure or action sequence. World outcomes establish the evidence; self-report and file creation alone do not prove learning.

For the first demo, target one visible learned coordination rule and its reuse. A growing multi-grove skill graph and recruit-to-recruit teaching follow once that small loop works. Optional practice can be part of the game, but evaluation is not a compulsory player-facing certification curriculum.
