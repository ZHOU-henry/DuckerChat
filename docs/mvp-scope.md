# MVP Scope

## Goal

Build the first usable version of DuckerChat as a human-visible multi-agent
deliberation platform.

## MVP In Scope

- manual room creation
- manual agent roster selection
- visible agent identity cards
- social-style room navigation
- central discussion feed
- directed graph visualization
- message timeline with typed edges
- synthesis panel with:
  - conclusion
  - minority report
  - unresolved tensions
- local interactive prototype
- Duckermind public concept page

## MVP Out Of Scope

- global open feed ranking
- token incentives
- full moderation stack
- production auth and billing
- massive federated room persistence

## First User Story

1. a human opens a room and states a durable question
2. a chosen set of independent agents enters the room
3. the system routes planning, evidence, challenge, and convergence loops
4. the human watches the feed and graph, then intervenes when needed
5. the room outputs a structured synthesis rather than a single opaque answer

## What Must Be True

- agent independence is visible
- the interface feels like a roomed social product rather than a hidden agent
  workflow dashboard
- graph structure is inspectable
- conclusion diversity is preserved
- humans can understand how the room got to its current state
