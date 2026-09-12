# Forest Crew — game brief

Working title only. Design direction agreed through the September 12 conversation; parameters below are hypotheses to playtest, not validated balance.

## Fantasy and objective

You are one firefighter among a crew in a surreal Indonesian forest landscape. You can perform every ordinary job yourself, delegate it, teach a recruit, or rearrange the team when a plan fails. Build from a small crew into a network of capable teams and restoration sites. The long-term satisfaction is accumulating infrastructure and directing a growing force while remaining physically present among them.

The immediate objective is to complete an incident's job chain before spreading fire damages the protected grove or disables the supply station. The longer objective is to establish self-sustaining restored forest and enough crew capacity to expand to the next site.

The approved world is an archipelago of volcanic groves across broad blue water. Many groves have incidents to resolve. Pink decks mark your expanding footholds: establish supply, suppress and secure the grove, restore it, earn oxygen flow, then choose where to send your growing crew next. Later sites change the problem through supply distance, available posts and competing fronts, rather than merely adding more hit points. The first playable test contains one active grove and distant silhouettes of future destinations; travel systems and a multi-island campaign are later scope.

## Overcooked-style dependency chains

A job is a sequence of tangible prerequisites. For the first encounter: fetch hose -> connect supply -> staff pump -> aim/suppress -> finish hotspots -> restore grove. Pump repair can be a later complication. Jobs belong to the world; they are not exclusive character classes. The player can replace any teammate, and agents can switch roles after communicating.

The continuous physical interaction is sweeping water over heat. Fire visibly weakens, embers fade and surfaces become wet; completing a patch releases a satisfying hiss. A forgiving game heat/wetness model permits flare-ups that are readable rather than arbitrary. This is stylised game logic, not a real wildfire simulator.

A pump operator improves or sustains pressure while a nozzle operator suppresses. If the player changes fronts, teammates need to notice, request coverage and acknowledge a handoff. Good communication avoids two people fetching the same hose, abandoning a pump, or assuming a job is done. The challenge comes from competing tasks and limited hands, not deliberately incompetent teammates.

## Controls

Computer vision is the primary input. Keep the working finger-walking and steering feel from Hand Walk. Add one forgiving hose stance with visible avatar/tool feedback. Walking and hose gestures have explicitly separate interpretation; do not make players walk with both hands while pointing at tiny UI targets. Menus, task assignment and recording export have large gesture-accessible targets. Voice can express nuanced priorities, but routine play is possible through gestures.

Phones default to a one-hand variant: hold the phone in the other hand, alternate index/middle fingers to walk, tilt the calibrated hand to steer, point and hold to aim/spray, and open the palm to stop. Settings provide a gesture-accessible switch between one-hand and two-hand controls. This is a new playtest hypothesis; desktop two-hand controls remain available.

Use the current embodied avatar/camera for the first slice. Face-to-face conversation can frame teammates without a first-person camera rewrite. Browser camera and, later, microphone permission are browser-controlled setup steps.

## Oxygen and crew progression

Restored, healthy grove cells contribute an in-game oxygen income after a restoration stage; extinguishing flames alone does not instantly create a mature forest. A stylised time transition can make this visible in a short demo. Income is bounded by restored area/health, not idle wall-clock time in the initial MVP.

Oxygen pays for recruiting, maintaining a crew and model-driven planning. Food supports recruitment/training once the task-chain loop works; do not add a separate farming simulation to tomorrow's slice.

Each firefighter has separate fields: model backend, learned procedures, experience and role commitment. The player may select Luna, Terra, Sol, Astra or Codex Spark once a corresponding backend model is actually available. A name in the Codex app is not proof that an arbitrary hosted API accepts it. Unsupported choices are visibly unavailable; never silently substitute a model while showing another label.

Model-specific oxygen weights are tunable GAME BALANCE, not claimed provider pricing. Benchmark task success, latency and usage before choosing weights. Larger assumed capability is not guaranteed success. The player should be choosing a crew mix, not discovering one universally optimal expensive model.

Charge oxygen at planning boundaries, not per animation frame. Reserve a maximum before a decision, settle actual metered usage once, refund unused reservation, and deduplicate retried events. Long-lived actions continue locally without repeated model calls. Routine observations and idle animation do not cause continuous inference. A separate hard real-spending budget gates backend calls; gameplay income never expands it.

Avoid a bankruptcy trap: the player can still do manual jobs, recall a crew and restore a small area with basic tools when planning oxygen is exhausted. Agents finish safe already-authorised actions, then visibly await direction/budget; they must not keep spending or unexpectedly stop controlling physics.

## A crew that learns with you

Agents learn skills during actual gameplay and build flexible skill trees from their experiences with the player and one another. They begin with general reasoning and primitive tool knowledge. They discover, name, revise, combine and share reusable methods; designers do not prescribe the tree or preload firefighter strategies. Literal versioned `SKILL.md` files store the methods, with a graph linking their origins and combinations. See [the learning system](SKILLS.md) and [illustrative possible learned outputs](game-skills/README.md).

Learning follows experience -> reusable lesson -> application -> revision or branching. An operator who loses pressure after leaving a post might learn to arrange cover first, then combine that with another teammate's supply diagnosis. Actual world outcomes give the lesson evidence. Provisional methods can be used during play without a certification gate. Sharing a method gives another actor knowledge, while their experience and confidence grow through their own use. Changing the model preserves that history; this is not model weight training.

The fun is making your particular crew increasingly self-sufficient. You influence their development by playing together, explaining an approach or correcting a mistake. Agents can learn coordinated methods and adapt to your habits while respecting new instructions. Saved effort lets you expand to another grove, recruit another pair, and direct a bigger operation while still doing satisfying physical work. The first proof is one agent-authored lesson from a shared incident, visibly reused or adapted on the next; the broad skill graph grows after that works.

## Visual direction

Work directly from the user's three pasted images, retained in design/references and documented in private visual-review material. The first playable composition uses the first image's black terrain, broad blue water, pink rectangular platform and clear horizon. The grove and crew are concentrated on the land beyond the platform. Borrow the second image's empty space and isolated cloud, and the third image's peach architectural openings/reflections for the supply station. Retain recognisable compositions rather than substituting a generic pastel forest.

Three concepts are retained privately for visual review. The user approved the pink deck and volcanic grove as the first anchor, liked all three, and wants many groves to restore. A second approval against an in-engine frame verifies that the implementation retains the approved composition and feel before the full level is expanded.

The actual reference images are private design material, not redistributable game assets. New assets must be original or appropriately licensed.

## Adaptive opposition

First use understandable wind/fuel/fire rules. A later threat-director agent may select among legal, telegraphed events under a fixed budget. It may not spawn fires arbitrarily inside secured ground or erase successful work to manufacture drama. The initial proof is teammate cooperation; an opponent agent follows only once that is fun and reliable.
