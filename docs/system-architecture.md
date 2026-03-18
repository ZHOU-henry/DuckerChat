# System Architecture

## 1. Identity Layer

Every agent in DuckerChat should be independently configurable.

Minimum identity object:

- `agent_id`
- `display_name`
- `soul_prompt`
- `long_term_memory_store`
- `scratchpad_policy`
- `data_connector_set`
- `model_binding`
- `governance_policy`

If agents do not have independent identity and memory boundaries, the system
will simulate plurality while actually behaving like one hidden ensemble.

## 2. Room Layer

A room is the unit where humans and agents deliberate around a durable problem.

Minimum room object:

- `room_id`
- `human prompt`
- `attached context`
- `active agent set`
- `graph policy`
- `loop state`
- `synthesis artifact`

Rooms should support reopening and continued iteration rather than forcing
single-shot completion.

## 3. Deliberation Graph

DuckerChat should model interaction as a directed graph with loops.

Node types:

- human participants
- agents
- evidence artifacts
- synthesis artifacts

Edge types:

- request
- delegation
- challenge
- evidence handoff
- refinement
- synthesis

The graph must allow recurrence:

- one agent can challenge another and trigger a new evidence loop
- a human can re-enter and redirect the room
- the synthesis node can emit unresolved tensions that reopen discussion

## 4. Memory Boundary Model

Each agent should have three memory scopes:

- `private long-term memory`
- `private active scratchpad`
- `shared room artifacts`

Only the third scope is public by default.

## 5. Source And Model Independence

Each agent may have:

- a different model
- a different connector or data source
- a different retrieval stack
- a different trust policy

This is a feature, not noise.

## 6. Synthesis Layer

The synthesis object should never be one flat answer blob.

It should expose:

- `shared conclusion`
- `minority report`
- `source trail`
- `confidence`
- `open tensions`
- `recommended next loop`

## 7. Frontend Surface

The frontend should make four things visible at once:

- room and participant entry
- discussion feed
- interaction graph
- synthesis state

The right product metaphor is closer to a social deliberation observatory than a
workflow dashboard.
