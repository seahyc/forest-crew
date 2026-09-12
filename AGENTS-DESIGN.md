# Agent design: cooperation before scale

Status: target architecture plus protocol work. Tardigrade is a candidate to validate, not installed or runtime-proven by the research note.

## Authority and identity

The game simulation owns positions, resources, fire, task preconditions and completion. It is the referee. Each teammate is a separate persistent actor with a model configuration, capabilities, current commitment, mailbox, recent observations and learned procedures. Actors independently select goals and tools; no fixed screenplay assigns who must perform which job at which timestamp.

A model chooses intentions at meaningful events. Deterministic movement, hose handling, animation and collision execute accepted intentions every frame. Scripted low-level mechanics do not imply scripted high-level decisions. Render/game ticks never wait for inference.

## Shared jobs and communication

The smallest encounter requires one actor staffing the pump while another operates the hose. The player can take either post. All actors may attempt all ordinary jobs; training affects reliability/procedure knowledge rather than arbitrary tool access classes.

Expose schema-bound tools: observe, claim_task, perform_task, release_task, message_actor, acknowledge_message. Claims use expected world revision and expiring leases. Results include success, blocked/stale reason, current revision and observable effects. Calls carry actor ID and call ID; duplicate effects and duplicate oxygen charges are rejected or return the previous result. Server-side caller identity must be bound by transport authentication, never trusted from client text alone.

Messages identify sender, recipient, relevant task and requested action. Acknowledge receipt separately from accepting a job. Communicate request -> acceptance/decline -> commitment -> completion/blocker; a broadcast or acknowledgement does not prove cooperation. A peer can suggest a task but cannot directly call another actor's tools or impersonate the player. Team chat is world data, not permission to bypass budgets or the game rules.

## Context and memory

Construct each decision from a compact view: mission and priorities, own state, observed nearby world and last revision, shared committed jobs, outstanding requests, recent tool outcomes, oxygen budget and relevant learned procedures. Preserve unresolved commitments, hazards and unsatisfied preconditions explicitly across compaction. Retrieve older events by task/incident ID instead of dumping full history every turn.

Keep a durable event log with checkpoints and a short working summary. Summaries are derived context, never the authority for whether a pump is connected or a job has finished. Refresh current world state after long reasoning or restoration from a checkpoint. Bound observations, mailbox window, reply length, tool depth, wall-clock time and concurrent turns per actor. Coalesce repeated heat updates; wake on changed conditions, player instructions, messages and completion/blockage.

Agents author reusable `SKILL.md` methods from actual gameplay events and grow a flexible graph by revising, branching, combining and sharing them. They start with primitive tool knowledge, not the authored examples in `game-skills/`. The [skill contract](SKILLS.md) defines event-driven extraction, lazy loading, bounded graph growth and per-actor outcome evidence. Pin loaded and proposed content hashes in traces. Methods can be provisional and usable immediately within world rules; no certification curriculum gates ordinary work. Sharing transfers knowledge, not a recipient's experience or authority over their decisions. Packages cannot grant tools, alter the oxygen ledger or override world authority. Unresolved commitments remain explicit outside skill prose and survive compaction. The deterministic protocol currently has no skill-loader, learning store or provider runtime; none of this learning has been demonstrated yet.

On timeout or missing provider budget, show a delayed/planning state and continue the last valid action if safe. Do not fabricate a generated reply. Low-level safety/recovery can park an actor and release an expired commitment; it cannot secretly solve the encounter while claiming model-driven agency.

## Oxygen and actual compute

The authoritative game ledger reserves oxygen under decisionId before inference. Settlement is idempotent and cannot exceed reservation; usage reporting, timeouts and cancellations have explicit settlement rules. Normalised input/output usage can later feed a calibrated game cost, but no guessed API price is authoritative. Tool-call budget is an additional bound, not a substitute for inference metering.

Separate actor model ID from its displayed label and learned memory. Register only providers/models actually verified in the configured backend; do not send Codex app display names to a generic API. Real-money/account budgets stay on the service side and never increase when the game grants oxygen.

## Tardigrade spike acceptance

1. Pin a tested framework version and configure one genuinely callable backend without client secrets.
2. Create two durable actors with independent contexts, the same constrained world tools and acknowledged mailbox transport.
3. Demonstrate help request -> peer tool effect -> changed world observation -> coordinated completion in a real trace.
4. Perturb the hose position or remove an operator mid-job; let the actors choose a new allocation without a scripted recovery plan.
5. Crash/resume and replay pending effects: one task effect and one oxygen charge per call/decision ID.
6. Force compaction, provider timeout and zero oxygen: retain commitments and truthfully surface limitations.
7. Compare different verified models and communication-disabled runs; record success, latency, oxygen and real provider usage.

A local Codex app-server adapter now executes real actor tools; see [server/README.md](server/README.md) for current scope and limits. Tardigrade is not installed. Durable host recovery and public per-player agent deployment remain separate work.
