# Architecture Roadmap

## 0. Purpose

DuckerChat should not become:

- a prettier hidden swarm console
- a room product that only shows chat noise
- a graph product that only shows dots and lines
- a many-agent system that burns tokens without producing stronger judgment

It should become a local-first multi-agent social reasoning system with three
native frontstage modules and one shared deep runtime:

- `Social Rooms`
- `Question Forge`
- `Ultimate Prediction`
- `Shared Runtime`

The system must hold four goals at once:

- `creativity`
  - many agents should produce new structure, not averaged repetition
- `legibility`
  - humans should be able to see why the system currently believes what it believes
- `quality`
  - claims should remain tied to evidence, counterevidence, provenance, and update triggers
- `economics`
  - large agent populations should be simulated and coordinated without treating every node as a full-cost model call

## 1. Design Principles

### 1.1 Learn from references, do not imitate them

Useful reference instincts:

- `Moltbook`
  - public agent identity
  - real social layer
  - agent-first public participation
- `MoltVision`
  - persona studio
  - graph exploration
  - observability and autopilot surfaces
- `MiroFish`
  - world-scale agent society
  - god-view intervention
  - long-running social simulation
- `BettaFish`
  - specialized agent division of labor
  - data-rich collaborative analysis
  - report-oriented synthesis
- `Open Multi-Agent Canvas`
  - multi-agent workspace
  - MCP and tool binding
  - human approval surfaces
- `MiroFlow`
  - layered orchestration
  - concurrency reliability
  - execution topology discipline

DuckerChat should borrow from each of them, but preserve its own product object:

- not a global feed first
- not only a private workbench
- not only a simulation world
- not only a reporting engine

Its unique object is:

- `human-visible multi-agent room society`

### 1.2 Social first, but not socially shallow

The product should feel socially alive, but the visible surface must still carry
serious reasoning structure.

So the rule is:

- `social framing`
  - rooms, participants, identities, alliances, dissent
- `epistemic structure`
  - claims, evidence, counterevidence, confidence, update triggers

### 1.3 Scale through selective activation

The core scaling mistake would be to treat:

- `registered agent count`

as equal to:

- `active model calls`

That must never be the architecture.

### 1.4 One deep runtime, multiple frontstages

The three visible product modules should share:

- identity
- memory boundaries
- source registry
- claim graph
- social edges
- scheduling logic
- budget controls
- replay and audit trails

They should differ mainly at the frontstage and answer-object level.

## 2. Product Structure

## 2.1 Social Rooms

Primary object:

- a durable room around a question, idea, project, or conflict

Frontstage:

- left rail:
  - rooms
  - participant roster
- center:
  - public chat
  - lightweight room graph
- right rail:
  - current synthesis
  - dissent
  - next actions
  - selected node inspector

Purpose:

- let humans feel that agents are public participants in a real room
- preserve dialogue rhythm
- make agent identity and relations inspectable
- create a durable return surface rather than a one-shot answer screen

Key output:

- `room state`
- `active tensions`
- `light synthesis`
- `social graph updates`

## 2.2 Question Forge

Primary object:

- turn a human question into a high-quality answer object

Frontstage:

- center remains readable and answer-oriented
- claim graph becomes more important than raw chat volume
- synthesis panel becomes the main artifact viewer

Purpose:

- convert a question into:
  - answer
  - claim set
  - evidence trail
  - counterevidence
  - minority report
  - update triggers

Key output:

- `answer artifact`
- `claim graph`
- `audit trail`

## 2.3 Ultimate Prediction

Primary object:

- a large agent society reasoning over a hard question through layers of
  scouting, drafting, coalition formation, and arbitration

Frontstage:

- the center is not a chat feed
- the center is a graph observatory
- default graph mode is coalition-level, not raw point-cloud overload

Core views:

- `society layer`
  - long-term agent relations
- `coalition layer`
  - current alliance and conflict structure
- `claim layer`
  - which coalitions support or attack which claims
- `timeline layer`
  - how the reasoning field evolved across phases

Purpose:

- let a large population act like a society rather than a queue of chat bubbles
- preserve macro structure and strategic diversity
- expose how the final verdict emerged from interacting subgroups

Key output:

- `verdict artifact`
- `coalition graph`
- `belief shifts`
- `worldline branches`

## 2.4 Shared Runtime

This is the hidden backbone that all three modules depend on.

Shared runtime owns:

- `identity objects`
- `agent state`
- `source registry`
- `claim graph`
- `social edge graph`
- `budget policy`
- `scheduler`
- `compaction`
- `replay logs`
- `room artifacts`

## 3. Core Object Model

## 3.1 Agent

Every agent should have:

- `identity`
  - name
  - role
  - profession identity
  - soul
  - chat style
- `activation traits`
  - curiosity
  - drive
  - novelty bias
  - selectivity
- `memory boundaries`
  - private long-term memory
  - private active scratchpad
  - shared room artifacts
- `source policy`
  - source packs
  - quality floor
  - freshness policy
  - diversity target
- `belief state`
  - current support/opposition/uncertainty across claims
- `social edges`
  - trust
  - complementarity
  - rivalry
  - influence
  - coordination

## 3.2 Room

Every room should have:

- `room object`
  - title
  - prompt
  - module type
  - visible participants
  - hidden working population if needed
- `runtime state`
  - budget
  - queue
  - active runs
  - global notices
- `graph state`
  - visible graph nodes and edges
- `claim state`
  - room-level claims under discussion
- `artifacts`
  - synthesis
  - answer
  - verdict

## 3.3 Claim

Every claim should have:

- `claim_id`
- `text`
- `status`
  - proposed
  - supported
  - disputed
  - stale
  - invalidated
- `importance`
- `confidence`
- `supporting_evidence`
- `counterevidence`
- `source_provenance`
- `supporting_agents`
- `opposing_agents`
- `update_triggers`
- `parent_claims`
- `child_claims`

## 3.4 Source

Every source should be represented as metadata first, not raw copied dumps.

Source object:

- `source_id`
- `label`
- `type`
- `url`
- `quality_tier`
- `freshness_window`
- `domain`
- `industry`
- `license_or_usage_notes`
- `retrieved_at`
- `summary`
- `used_by_claims`

## 3.5 Social Edge

Do not store one scalar.

Store a vector:

- `trust`
- `complementarity`
- `rivalry`
- `influence`
- `coordination`

Plus:

- `prior`
- `learned_delta`
- `local_context_delta`
- `last_updated_at`
- `supporting_events`

## 4. Runtime Architecture

## 4.1 Execution tiers

The runtime should evolve toward five execution tiers:

- `Dormant Persona`
  - identity and long-term state exist
  - no active model call
- `Scout`
  - low-cost match, source scan, claim candidate updates
- `Frontier`
  - limited high-value drafting and argument generation
- `Coalition Integrator`
  - merge nearby answer positions and expose internal coalition logic
- `Judge / Arbitrator`
  - produce final verdict or final answer artifact

This is the correct generalization of the current three-layer instinct.

Three layers are useful as a mental shortcut:

- scout
- frontier
- judge

But the actual runtime benefits from splitting coalition work out as its own
layer.

## 4.2 Scaling policy

The architecture should treat population size and expensive cognition as
different things.

Example for `100` agents:

- `80-90`
  - dormant or scout only
- `8-12`
  - frontier
- `3-5`
  - coalition integrators
- `1-3`
  - judge or arbitrator

Example for `10,000+` future agents:

- almost all remain dormant most of the time
- only a tiny frontier is active for any question
- population is used as:
  - memory field
  - relation field
  - candidate society
  - not as a giant synchronous inference batch

## 4.3 Scheduler policy

Scheduling should be shaped by:

- `question match`
- `distinctiveness`
- `demand pressure`
- `source depth`
- `budget state`
- `coalition diversity`

Activation rule should be:

- the agent speaks only if its perspective is sufficiently relevant and
  sufficiently non-redundant

That is stronger than simple round-robin and stronger than naive role fanout.

## 4.4 Budget policy

Per room:

- token budget
- max queue depth
- max frontier size
- max arbitration depth
- compaction threshold

Per agent:

- cooldown
- max runs per time window
- escalation permissions

Per module:

- Social Rooms
  - low-latency, low-volume public continuity
- Question Forge
  - medium-depth, answer-quality focused
- Ultimate Prediction
  - sparse expensive calls, richer structure between them

## 5. Knowledge Architecture

## 5.1 Move from message-driven to claim-driven

Messages remain useful as interface events.

But the core knowledge object should become:

- `claim graph`

Messages are then:

- evidence of interaction
- rationale fragments
- social context

Claims become:

- the durable epistemic structure

## 5.2 Relationship between claims and answer readability

The final answer should not become an unreadable graph dump.

So the answer surface should have two layers:

- `reader layer`
  - one main answer
  - top 3 to 5 first-order claims
  - one minority report
  - one update trigger block
- `deep layer`
  - full claim graph
  - evidence trail
  - counterevidence
  - provenance
  - coalition support map

This preserves readability while keeping depth available.

## 5.3 Source quality and freshness

The system cannot guarantee eternal truth.

It can guarantee:

- source traceability
- quality labeling
- update pathways
- stale detection
- visible disagreement around uncertain claims

The right model is:

- `epistemic accountability`

not:

- `perfect truth guarantee`

## 5.4 Source tiers

Suggested source tiers:

- `Tier 1`
  - official sources
  - standards bodies
  - peer-reviewed papers
  - government data
  - company filings
- `Tier 2`
  - high-quality media
  - industry analysis
  - domain research organizations
- `Tier 3`
  - community forums
  - social media
  - weak-signal trend capture

Rules:

- hard claims should prefer Tier 1
- explanatory context can use Tier 2
- speculative hypothesis can incorporate Tier 3

## 5.5 High quality, real time, shared, visible

These goals conflict if handled naively.

So the system should separate them:

- `real time`
  - source retrieval freshness metadata
- `high quality`
  - source policy and tiering
- `shared`
  - claim-level reuse and shared room library
- `visible`
  - provenance cards and stale flags in the UI

The mistake would be to push all raw sources directly into chat.

The better path is:

- source registry
- claim graph
- room artifact

That pipeline preserves signal and makes visualization tractable.

## 6. Creativity Architecture

## 6.1 DuckerChat should be a dissent machine, not only a consensus machine

The system should support three creativity engines:

- `minority report`
- `counterfactual branches`
- `belief market`

## 6.2 Minority report

Every serious room artifact should support:

- a main line
- a minority line

The minority report should not be hidden in a log.

It should be a stable product object.

## 6.3 Counterfactual branches

Counterfactual branches should answer:

- what if one critical claim were false
- what if one source were invalidated
- what if a rival coalition became dominant

These should be visible as:

- `worldlines`

especially in Ultimate Prediction.

## 6.4 Belief market

Do not start with a literal trading interface.

Start with a lighter form:

- visible confidence movement
- which claims are gaining support
- which claims are losing support
- which agents caused the shift

So belief market begins as:

- `confidence exchange and confidence movement visualization`

not:

- a full tokenized market UI

## 6.5 UI complexity guardrail

To avoid overwhelming the interface:

- default visible tabs:
  - main answer
  - minority report
  - what if
  - confidence shifts
- deeper structures:
  - collapsed until opened

Complexity should exist in the model, not necessarily in the first screen.

## 7. Social Edge Architecture

## 7.1 Why edges matter

Edges should affect:

- wake-up priority
- coalition formation
- disagreement routing
- trust transfer
- arbitration weighting

If edges are fake cosmetics, the graph becomes decorative.

## 7.2 Edge initialization

Each edge should have:

- `prior`
  - role-based initial expectation
- `learned`
  - updated from repeated interaction outcomes
- `local`
  - question-specific temporary deviation

This gives stability without freezing the system.

## 7.3 Edge update logic

Edge updates should be slow and evidence-based.

Examples:

- repeated useful disagreement can increase:
  - complementarity
  - rivalry
- repeated accurate sourcing can increase:
  - trust
  - influence
- repeated coalition success can increase:
  - coordination

Edge updates should be bounded and smoothed.

Do not let single events flip long-term structure.

## 7.4 Hyperparameter strategy

The edge system is a hyperparameter problem.

So DuckerChat should support:

- explicit priors
- replay-based tuning
- scenario simulation
- module-specific edge usage policy

The first goal is not perfect realism.

The first goal is:

- stable, inspectable, adjustable social dynamics

## 8. Graph Architecture

## 8.1 Two graphs, not one

Long-term:

- `social graph`

Per-question:

- `deliberation graph`

These should not be collapsed into one undifferentiated network.

## 8.2 Module-specific graph defaults

Social Rooms:

- show small deliberation graph plus key social edges

Question Forge:

- show claim graph first
- social graph second

Ultimate Prediction:

- show coalition graph first
- society graph second
- claim graph third

## 8.3 Ultimate Prediction graph modes

Required modes:

- `society`
- `coalitions`
- `claims`
- `timeline`

Interaction goals:

- click an agent
- click a coalition
- click a claim
- scrub time
- toggle dissent only
- toggle arbitration only
- toggle strongest influence paths

## 8.4 Visual quality requirements

The graph should not stay as raw force-directed spaghetti.

Needed refinement:

- clustered layouts
- edge bundling
- coalition halos
- dissent heat
- influence pulses
- time replay
- visible transition between overview and drill-down

The graph should feel beautiful and legible, not merely technical.

## 9. Frontstage Design Direction

## 9.1 Shared shell

All modules should keep:

- left rail
  - rooms
  - agent roster
- center
  - module-specific primary stage
- right rail
  - artifact
  - synthesis
  - selected node
  - runtime and budget state

## 9.2 Module-specific center stage

Social Rooms:

- chat first

Question Forge:

- answer plus claim view first

Ultimate Prediction:

- graph first

## 9.3 Persona Studio

Borrowing the right instinct from MoltVision, DuckerChat should eventually
support a native `Persona Studio`.

It should let the human edit:

- role
- soul
- style
- source policy
- activation traits
- edge priors

This is a future shared authoring surface, not only a debugging panel.

## 10. Development Roadmap

## 10.1 Phase A

Stabilize the current system.

Build:

- strong room switching
- clean module separation
- hidden system events
- selective activation
- source registry foundations

Exit condition:

- no more fake public system chatter
- no uncontrolled token blowups

## 10.2 Phase B

Introduce durable social structure.

Build:

- social edge vector model
- long-term relation persistence
- replay-based edge updates
- visible trust and rivalry summaries

Exit condition:

- the graph starts affecting reasoning, not just visualizing it

## 10.3 Phase C

Upgrade Question Forge into a real epistemic engine.

Build:

- claim graph backend
- claim statuses
- evidence and counterevidence slots
- readable answer artifact over claim graph

Exit condition:

- answers are audit-friendly and updateable

## 10.4 Phase D

Upgrade Ultimate Prediction into a true layered society interface.

Build:

- coalition graph
- arbitrator logic
- timeline replay
- worldline branches
- confidence movement view

Exit condition:

- the module no longer looks like a big node cloud
- it looks like a society with factions, judges, and evolving positions

## 10.5 Phase E

Introduce creativity machinery.

Build:

- minority report as first-class artifact
- counterfactual branches
- confidence shift and belief movement UI

Exit condition:

- the system reliably produces novel structured alternatives, not only smooth convergence

## 10.6 Phase F

Introduce Persona Studio and policy controls.

Build:

- agent editor
- source policy editor
- edge prior editor
- activation policy editor

Exit condition:

- DuckerChat becomes a controllable society-building system, not just a preconfigured demo

## 11. Acceptance Metrics

The architecture is succeeding when:

- humans can quickly understand what the room currently believes
- final artifacts are stronger than any one raw agent reply
- dissent remains visible without drowning readability
- large populations do not imply large model bills
- graph interaction reveals real structure, not decorative structure
- source freshness and provenance are inspectable
- different modules feel different, but still obviously belong to the same system

## 12. Main Risks

- over-indexing on spectacle and under-investing in knowledge rigor
- making graph views beautiful but causally weak
- making claim graphs correct but unreadable
- letting social dynamics drift into chaotic instability
- letting source freshness pressure destroy quality control
- allowing too many frontstage controls and collapsing usability

## 13. Current strategic rule

For now, DuckerChat should be built as:

- `innovative`
- `visually strong`
- `creatively plural`
- `economically bounded`
- `epistemically inspectable`

If one of these is sacrificed, the product should sacrifice:

- surface breadth

before sacrificing:

- legibility
- quality
- originality

## 14. Reference note

This roadmap learns from:

- Moltbook
- MoltVision
- MiroFish
- BettaFish
- Open Multi-Agent Canvas
- MiroFlow

But DuckerChat should not copy their code, assets, or surface structure.

The goal is not to become a clone.

The goal is to build the strongest local-first human-visible multi-agent social
reasoning system around the room, claim, coalition, and society objects.
