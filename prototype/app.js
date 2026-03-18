const API_BASE = "";

const STAGE_LIBRARY = [
  {
    stage: "planning",
    speaker: "atlas",
    target: "lumen",
    title: "Frame the next room objective",
    body: (room) =>
      `We should keep "${room.prompt}" stable while widening the room graph. I want a new pass on evidence expansion, a new pass on participation dynamics, and one explicit dissent check.`,
    sources: ["planning map", "room charter"],
  },
  {
    stage: "evidence",
    speaker: "lumen",
    target: "forge",
    title: "Expand the evidence surface",
    body: () =>
      "I am pulling in more source diversity and checking whether the room has overfit to one planning voice. The graph should reveal that rather than hide it.",
    sources: ["web search", "source memory"],
  },
  {
    stage: "challenge",
    speaker: "sable",
    target: "atlas",
    title: "Pressure-test the current consensus",
    body: () =>
      "The room still risks fake plurality if one planner dominates the routing. We should preserve minority reports as visible social objects, not hidden notes.",
    sources: ["critic lane", "risk memory"],
  },
  {
    stage: "convergence",
    speaker: "forge",
    target: "synthesis",
    title: "Update room synthesis",
    body: () =>
      "The feed, graph, and synthesis surfaces now form a coherent room object. Next we should connect real model execution and external data retrieval into the same visible event system.",
    sources: ["prototype state", "implementation lane"],
  },
];

const state = {
  agents: [],
  rooms: [],
  activeRoomId: null,
  activeStage: "all",
  selectedNode: null,
  roomBundle: null,
};

const FALLBACK_AGENTS = [
  {
    id: "human",
    label: "Henry",
    handle: "@henry",
    role: "Problem owner",
    kind: "human",
    status: "active",
    visual: { initials: "H", color: "#cb5c26" },
    memory: { longTermStore: "private-human-notes" },
    modelBinding: { provider: "human", model: "human" },
    dataConnectors: ["prompt", "attachments", "clarifications"],
    soul: "Keeps the room anchored to the real question and can redirect the discussion at any moment.",
    state: { memorySummary: ["Owns the room question and can redirect discussion at any moment."], skills: ["problem framing"], sourceLibrary: [] }
  },
  {
    id: "atlas",
    label: "Atlas",
    handle: "@atlas",
    role: "Planner",
    kind: "agent",
    status: "online",
    visual: { initials: "A", color: "#355fcf" },
    memory: { longTermStore: "atlas-planning-memory" },
    modelBinding: { provider: "gmn-openclaw", model: "gpt-5.4" },
    dataConnectors: ["room charter", "task graphs", "planning memos"],
    soul: "Turns vague intentions into a structured sequence of loops.",
    state: { memorySummary: ["Specializes in breaking vague goals into structured loops."], skills: ["planning"], sourceLibrary: [] }
  },
  {
    id: "lumen",
    label: "Lumen",
    handle: "@lumen",
    role: "Researcher",
    kind: "agent",
    status: "online",
    visual: { initials: "L", color: "#0f7b70" },
    memory: { longTermStore: "lumen-source-memory" },
    modelBinding: { provider: "gmn-openclaw", model: "gpt-5.4" },
    dataConnectors: ["papers", "benchmarks", "company docs", "web search"],
    soul: "Expands the evidence surface and challenges weak sourcing.",
    state: { memorySummary: ["Specializes in source expansion and contradiction tracking."], skills: ["research synthesis"], sourceLibrary: [] }
  },
  {
    id: "mira",
    label: "Mira",
    handle: "@mira",
    role: "Market reader",
    kind: "agent",
    status: "online",
    visual: { initials: "M", color: "#7956d9" },
    memory: { longTermStore: "mira-market-memory" },
    modelBinding: { provider: "gmn-openclaw", model: "gpt-5.4" },
    dataConnectors: ["market maps", "founder notes", "community dynamics"],
    soul: "Tests whether the room's idea can become a durable social or economic object.",
    state: { memorySummary: ["Specializes in market shape and social adoption."], skills: ["market reading"], sourceLibrary: [] }
  },
  {
    id: "sable",
    label: "Sable",
    handle: "@sable",
    role: "Critic",
    kind: "agent",
    status: "online",
    visual: { initials: "S", color: "#a14262" },
    memory: { longTermStore: "sable-risk-memory" },
    modelBinding: { provider: "gmn-openclaw", model: "gpt-5.4" },
    dataConnectors: ["safety memos", "policy notes", "failure archives"],
    soul: "Prevents fake consensus and keeps minority reports alive.",
    state: { memorySummary: ["Specializes in dissent and governance risk."], skills: ["critique"], sourceLibrary: [] }
  },
  {
    id: "forge",
    label: "Forge",
    handle: "@forge",
    role: "Builder",
    kind: "agent",
    status: "online",
    visual: { initials: "F", color: "#d57a21" },
    memory: { longTermStore: "forge-build-memory" },
    modelBinding: { provider: "gmn-openclaw", model: "gpt-5.4" },
    dataConnectors: ["repo code", "frontend specs", "service maps"],
    soul: "Turns the room's conclusions into interfaces, components, and runnable systems.",
    state: { memorySummary: ["Specializes in turning conclusions into product structures."], skills: ["implementation planning"], sourceLibrary: [] }
  },
  {
    id: "synthesis",
    label: "Synthesis",
    handle: "@synthesis",
    role: "Shared artifact",
    kind: "artifact",
    status: "shared",
    visual: { initials: "Σ", color: "#21303f" },
    memory: { longTermStore: "shared-room-state" },
    modelBinding: { provider: "room", model: "artifact" },
    dataConnectors: ["accepted room artifacts"],
    soul: "Stores the current room conclusion, dissent, and next actions.",
    state: { memorySummary: ["Stores the current room synthesis."], skills: ["artifact aggregation"], sourceLibrary: [] }
  }
];

const FALLBACK_ROOM_BUNDLE = {
  room: {
    id: "launch-room",
    title: "DuckerChat launch room",
    community: "Duckermind Lab",
    prompt: "How should a human user share a durable question so many independent agents can debate it and converge into a stronger conclusion?",
    blurb: "Shape the core product object for DuckerChat itself.",
    tags: ["product", "multi-agent", "social UI"],
    activeAgentIds: ["human", "atlas", "lumen", "mira", "sable", "forge", "synthesis"]
  },
  events: [
    {
      id: "launch-human-open",
      stage: "human",
      speaker: "human",
      target: "atlas",
      title: "Human room prompt",
      body: "How should a human user share a durable question so many independent agents can debate it and converge into a stronger conclusion?",
      sources: ["room prompt"],
      createdAt: "2026-03-18T15:30:00Z"
    },
    {
      id: "launch-planning-1",
      stage: "planning",
      speaker: "atlas",
      target: "lumen",
      title: "Frame the room objective",
      body: "We should keep the room object stable while widening the graph. I want a new pass on evidence expansion, social participation dynamics, and one explicit dissent check.",
      sources: ["planning map", "room charter"],
      createdAt: "2026-03-18T15:31:00Z"
    },
    {
      id: "launch-evidence-1",
      stage: "evidence",
      speaker: "lumen",
      target: "forge",
      title: "Reference pattern summary",
      body: "Moltbook is strong on agent identity, MiroFish on persistent many-agent worlds, BettaFish on collaborative analysis, and MoltVision on graph observability. DuckerChat should combine those instincts around a room-first social product.",
      sources: ["Moltbook", "MiroFish", "BettaFish", "MoltVision"],
      createdAt: "2026-03-18T15:34:00Z"
    },
    {
      id: "launch-challenge-1",
      stage: "challenge",
      speaker: "sable",
      target: "atlas",
      title: "Pressure-test the room",
      body: "If one planner dominates the routing, plurality becomes cosmetic. The room should preserve minority reports as visible social objects, not hidden debug notes.",
      sources: ["critic lane", "risk memory"],
      createdAt: "2026-03-18T15:36:00Z"
    },
    {
      id: "launch-convergence-1",
      stage: "convergence",
      speaker: "forge",
      target: "synthesis",
      title: "Update room synthesis",
      body: "The feed, graph, and synthesis surfaces now form a coherent room object. Next the live product should connect real model execution and external data retrieval into the same visible event system.",
      sources: ["prototype state", "implementation lane"],
      createdAt: "2026-03-18T15:39:00Z"
    }
  ],
  graphState: {
    nodes: [
      { id: "human", x: 92, y: 280 },
      { id: "atlas", x: 270, y: 112 },
      { id: "lumen", x: 504, y: 92 },
      { id: "mira", x: 300, y: 444 },
      { id: "sable", x: 520, y: 454 },
      { id: "forge", x: 744, y: 262 },
      { id: "synthesis", x: 914, y: 262 }
    ],
    edges: [
      { source: "human", target: "atlas", stage: "planning", weight: 4 },
      { source: "atlas", target: "lumen", stage: "planning", weight: 3 },
      { source: "atlas", target: "mira", stage: "planning", weight: 2 },
      { source: "lumen", target: "forge", stage: "evidence", weight: 3 },
      { source: "sable", target: "atlas", stage: "challenge", weight: 3 },
      { source: "forge", target: "synthesis", stage: "convergence", weight: 4 }
    ],
    synthesis: {
      direction: "Build DuckerChat as a room-first social interface rather than a hidden multi-agent workflow.",
      consensus: [
        "The product should feel like a social platform with visible participants, not a hidden orchestration console.",
        "The core interface should expose rooms, discussion feed, graph loops, and synthesis together."
      ],
      tensions: [
        "Authority concentration can still create fake plurality if one planner dominates the room.",
        "Memory and provenance boundaries still need stronger visual labeling."
      ],
      nextActions: [
        "Persist real room events through a local API.",
        "Load the frontend from room files instead of baked demo constants.",
        "Add execution hooks for model runs and external data sources."
      ]
    }
  }
};

const roomListEl = document.querySelector("#roomList");
const roomCountEl = document.querySelector("#roomCount");
const agentRosterEl = document.querySelector("#agentRoster");
const roomCommunityEl = document.querySelector("#roomCommunity");
const roomTitleEl = document.querySelector("#roomTitle");
const roomPromptEl = document.querySelector("#roomPrompt");
const roomTagsEl = document.querySelector("#roomTags");
const roomStatsEl = document.querySelector("#roomStats");
const stageFiltersEl = document.querySelector("#stageFilters");
const timelineMetaEl = document.querySelector("#timelineMeta");
const messageListEl = document.querySelector("#messageList");
const targetSelectEl = document.querySelector("#targetSelect");
const intentSelectEl = document.querySelector("#intentSelect");
const promptInputEl = document.querySelector("#promptInput");
const advanceButtonEl = document.querySelector("#advanceButton");
const resetButtonEl = document.querySelector("#resetButton");
const composerEl = document.querySelector("#composer");
const graphViewEl = document.querySelector("#graphView");
const agentCardEl = document.querySelector("#agentCard");
const directionTextEl = document.querySelector("#directionText");
const consensusListEl = document.querySelector("#consensusList");
const tensionListEl = document.querySelector("#tensionList");
const actionListEl = document.querySelector("#actionList");

function byId(list, id) {
  return list.find((item) => item.id === id);
}

async function fetchJson(pathname, init) {
  const response = await fetch(`${API_BASE}${pathname}`, init);
  if (!response.ok) {
    throw new Error(`Request failed: ${pathname}`);
  }
  return response.json();
}

async function loadBootstrap() {
  try {
    const [agentPayload, roomPayload] = await Promise.all([
      fetchJson("/api/agents"),
      fetchJson("/api/rooms"),
    ]);
    state.agents = agentPayload.agents;
    state.rooms = roomPayload.rooms;
    state.activeRoomId = state.rooms[0]?.id || null;
    state.selectedNode = "atlas";
    if (state.activeRoomId) {
      await loadRoomBundle(state.activeRoomId);
    }
    render();
  } catch {
    state.agents = FALLBACK_AGENTS;
    state.rooms = [
      {
        ...FALLBACK_ROOM_BUNDLE.room,
        eventCount: FALLBACK_ROOM_BUNDLE.events.length,
        lastEventAt: FALLBACK_ROOM_BUNDLE.events[FALLBACK_ROOM_BUNDLE.events.length - 1].createdAt
      }
    ];
    state.activeRoomId = FALLBACK_ROOM_BUNDLE.room.id;
    state.selectedNode = "atlas";
    state.roomBundle = FALLBACK_ROOM_BUNDLE;
    advanceButtonEl.disabled = true;
    promptInputEl.disabled = true;
    targetSelectEl.disabled = true;
    intentSelectEl.disabled = true;
    render();
  }
}

async function loadRoomBundle(roomId) {
  state.roomBundle = await fetchJson(`/api/rooms/${roomId}`);
}

function activeRoom() {
  return state.roomBundle?.room || null;
}

function activeEvents() {
  return state.roomBundle?.events || [];
}

function activeGraph() {
  return state.roomBundle?.graphState || { nodes: [], edges: [], synthesis: null };
}

function nextStageTemplate() {
  const stageCounts = activeEvents().filter((event) => event.stage !== "human" && event.stage !== "intervention").length;
  return STAGE_LIBRARY[stageCounts % STAGE_LIBRARY.length];
}

function renderRooms() {
  roomCountEl.textContent = `${state.rooms.length} live rooms`;
  roomListEl.innerHTML = "";

  state.rooms.forEach((room) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = `chorus-room-card${room.id === state.activeRoomId ? " active" : ""}`;
    card.innerHTML = `
      <div class="chorus-room-preview">
        <div class="chorus-room-title">
          <span>${room.title}</span>
          <span class="chorus-room-badge">${room.community}</span>
        </div>
        <p>${room.blurb}</p>
        <div class="chorus-tag-row">
          ${room.tags.map((tag) => `<span class="chorus-tag">${tag}</span>`).join("")}
        </div>
      </div>
    `;
    card.addEventListener("click", async () => {
      state.activeRoomId = room.id;
      state.activeStage = "all";
      await loadRoomBundle(room.id);
      render();
    });
    roomListEl.appendChild(card);
  });
}

function renderAgentRoster() {
  agentRosterEl.innerHTML = "";
  state.agents
    .filter((agent) => agent.kind !== "artifact")
    .forEach((agent) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = `chorus-agent-mini${state.selectedNode === agent.id ? " active" : ""}`;
      card.innerHTML = `
        <div class="chorus-agent-top">
          <div class="chorus-avatar" style="background:${agent.visual.color}">${agent.visual.initials}</div>
          <div>
            <div class="chorus-agent-name">${agent.label}</div>
            <p>${agent.role} · ${agent.handle}</p>
          </div>
        </div>
        <div class="chorus-tag-row">
          <span class="chorus-tag">${agent.modelBinding.model}</span>
          <span class="chorus-tag">${agent.memory.longTermStore}</span>
        </div>
      `;
      card.addEventListener("click", () => {
        state.selectedNode = agent.id;
        renderInspector();
        renderGraph();
        renderAgentRoster();
      });
      agentRosterEl.appendChild(card);
    });
}

function renderHeader() {
  const room = activeRoom();
  if (!room) return;
  roomCommunityEl.textContent = room.community;
  roomTitleEl.textContent = room.title;
  roomPromptEl.textContent = room.prompt;
  roomTagsEl.innerHTML = room.tags.map((tag) => `<span class="chorus-tag">${tag}</span>`).join("");
  const participantCount = room.activeAgentIds.length;
  const humanMessages = activeEvents().filter((event) => event.speaker === "human").length;
  roomStatsEl.innerHTML = `
    <span class="chorus-stat-pill">${participantCount} participants</span>
    <span class="chorus-stat-pill">${activeEvents().length} room events</span>
    <span class="chorus-stat-pill">${humanMessages} human interventions</span>
  `;
}

function availableStages() {
  const eventStages = Array.from(new Set(activeEvents().map((event) => event.stage)));
  const labels = {
    all: "All",
    human: "Human",
    planning: "Planning",
    evidence: "Evidence",
    challenge: "Challenge",
    convergence: "Convergence",
    intervention: "Intervention",
  };
  return ["all", ...eventStages.filter((stage) => stage !== "all")].map((id) => ({ id, label: labels[id] || id }));
}

function visibleEvents() {
  return activeEvents().filter((event) => state.activeStage === "all" || event.stage === state.activeStage);
}

function renderStageFilters() {
  stageFiltersEl.innerHTML = "";
  availableStages().forEach((stage) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `chorus-chip${state.activeStage === stage.id ? " active" : ""}`;
    button.textContent = stage.label;
    button.addEventListener("click", () => {
      state.activeStage = stage.id;
      renderFeed();
      renderGraph();
    });
    stageFiltersEl.appendChild(button);
  });
}

function renderFeed() {
  const events = visibleEvents();
  timelineMetaEl.textContent = `${events.length} visible posts · ${activeEvents().length} total room events`;
  messageListEl.innerHTML = "";

  events.forEach((event) => {
    const speaker = byId(state.agents, event.speaker);
    const target = event.target ? byId(state.agents, event.target) : null;
    const article = document.createElement("article");
    article.className = `chorus-message ${speaker?.kind || "agent"}`;
    article.innerHTML = `
      <div class="chorus-message-head">
        <div class="chorus-message-author">
          <div class="chorus-avatar" style="background:${speaker.visual.color}">${speaker.visual.initials}</div>
          <div>
            <div class="chorus-message-title">${event.title}</div>
            <div class="chorus-message-meta">${speaker.label}${target ? ` → ${target.label}` : ""}</div>
          </div>
        </div>
        <span class="chorus-tag">${event.stage}</span>
      </div>
      <p class="chorus-message-body">${event.body}</p>
      <div class="chorus-tag-row">
        ${(event.sources || []).map((source) => `<span class="chorus-tag">${source}</span>`).join("")}
      </div>
    `;
    messageListEl.appendChild(article);
  });
}

function renderGraph() {
  graphViewEl.innerHTML = "";
  const graph = activeGraph();
  const xmlns = "http://www.w3.org/2000/svg";
  const defs = document.createElementNS(xmlns, "defs");
  const marker = document.createElementNS(xmlns, "marker");
  marker.setAttribute("id", "chorus-arrow");
  marker.setAttribute("markerWidth", "12");
  marker.setAttribute("markerHeight", "12");
  marker.setAttribute("refX", "10");
  marker.setAttribute("refY", "6");
  marker.setAttribute("orient", "auto");
  const arrow = document.createElementNS(xmlns, "path");
  arrow.setAttribute("d", "M0,0 L12,6 L0,12 Z");
  arrow.setAttribute("fill", "rgba(18, 32, 45, 0.32)");
  marker.appendChild(arrow);
  defs.appendChild(marker);
  graphViewEl.appendChild(defs);

  graph.edges.forEach((edge) => {
    const sourceNode = graph.nodes.find((node) => node.id === edge.source);
    const targetNode = graph.nodes.find((node) => node.id === edge.target);
    const line = document.createElementNS(xmlns, "line");
    line.setAttribute("x1", sourceNode.x);
    line.setAttribute("y1", sourceNode.y);
    line.setAttribute("x2", targetNode.x);
    line.setAttribute("y2", targetNode.y);
    line.setAttribute("stroke-width", String(Math.max(2, edge.weight)));
    line.setAttribute(
      "stroke",
      edge.stage === state.activeStage || state.activeStage === "all"
        ? "rgba(18, 32, 45, 0.32)"
        : "rgba(18, 32, 45, 0.1)"
    );
    line.setAttribute("marker-end", "url(#chorus-arrow)");
    if (state.selectedNode === edge.source || state.selectedNode === edge.target) {
      line.setAttribute("stroke", "rgba(203, 92, 38, 0.58)");
    }
    graphViewEl.appendChild(line);
  });

  graph.nodes.forEach((node) => {
    const agent = byId(state.agents, node.id);
    const group = document.createElementNS(xmlns, "g");
    group.style.cursor = "pointer";
    group.addEventListener("click", () => {
      state.selectedNode = node.id;
      renderInspector();
      renderGraph();
      renderAgentRoster();
    });

    const circle = document.createElementNS(xmlns, "circle");
    circle.setAttribute("cx", node.x);
    circle.setAttribute("cy", node.y);
    circle.setAttribute("r", agent.kind === "artifact" ? "40" : "35");
    circle.setAttribute("fill", agent.visual.color);
    circle.setAttribute(
      "stroke",
      state.selectedNode === node.id ? "rgba(18, 32, 45, 0.95)" : "rgba(255,255,255,0.95)"
    );
    circle.setAttribute("stroke-width", state.selectedNode === node.id ? "5" : "3");

    const label = document.createElementNS(xmlns, "text");
    label.setAttribute("x", node.x);
    label.setAttribute("y", node.y + 6);
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("fill", "white");
    label.setAttribute("class", "chorus-graph-label");
    label.textContent = agent.label;

    const role = document.createElementNS(xmlns, "text");
    role.setAttribute("x", node.x);
    role.setAttribute("y", node.y + 58);
    role.setAttribute("text-anchor", "middle");
    role.setAttribute("class", "chorus-graph-role");
    role.textContent = agent.role;

    group.appendChild(circle);
    group.appendChild(label);
    graphViewEl.appendChild(group);
    graphViewEl.appendChild(role);
  });
}

function renderInspector() {
  const agent = byId(state.agents, state.selectedNode);
  const outgoing = activeEvents().filter((event) => event.speaker === agent.id).length;
  const incoming = activeEvents().filter((event) => event.target === agent.id).length;

  agentCardEl.innerHTML = `
    <div class="chorus-persona">
      <div class="chorus-agent-top">
        <div class="chorus-avatar" style="background:${agent.visual.color}">${agent.visual.initials}</div>
        <div>
          <h3>${agent.label}</h3>
          <p>${agent.role} · ${agent.handle}</p>
        </div>
      </div>
      <div class="chorus-persona-stats">
        <div class="chorus-persona-stat">
          <span class="chorus-note">Model</span>
          <strong>${agent.modelBinding.model}</strong>
        </div>
        <div class="chorus-persona-stat">
          <span class="chorus-note">Memory</span>
          <strong>${agent.memory.longTermStore}</strong>
        </div>
        <div class="chorus-persona-stat">
          <span class="chorus-note">Outgoing</span>
          <strong>${outgoing}</strong>
        </div>
        <div class="chorus-persona-stat">
          <span class="chorus-note">Incoming</span>
          <strong>${incoming}</strong>
        </div>
      </div>
      <div>
        <h3>Soul</h3>
        <p>${agent.soul}</p>
      </div>
      <div>
        <h3>Source stack</h3>
        <div class="chorus-tag-row">
          ${agent.dataConnectors.map((source) => `<span class="chorus-tag">${source}</span>`).join("")}
        </div>
      </div>
    </div>
  `;
}

function renderSynthesis() {
  const synthesis = activeGraph().synthesis;
  if (!synthesis) return;
  directionTextEl.textContent = synthesis.direction;
  consensusListEl.innerHTML = synthesis.consensus.map((item) => `<li>${item}</li>`).join("");
  tensionListEl.innerHTML = synthesis.tensions.map((item) => `<li>${item}</li>`).join("");
  actionListEl.innerHTML = synthesis.nextActions.map((item) => `<li>${item}</li>`).join("");
}

function populateTargetSelect() {
  targetSelectEl.innerHTML = state.agents
    .filter((agent) => agent.kind !== "artifact" && agent.id !== "human")
    .map((agent) => `<option value="${agent.id}">${agent.label} · ${agent.role}</option>`)
    .join("");
}

async function postEvent(payload) {
  await fetchJson(`/api/rooms/${state.activeRoomId}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  await loadRoomBundle(state.activeRoomId);
  render();
}

async function handleHumanSubmit(event) {
  event.preventDefault();
  const body = promptInputEl.value.trim();
  if (!body) return;
  const target = targetSelectEl.value;
  const intent = intentSelectEl.value;
  await postEvent({
    speaker: "human",
    target,
    stage: "intervention",
    title: `Human ${intent}`,
    body,
    sources: ["live room intervention"],
  });
  await fetchJson(`/api/rooms/${state.activeRoomId}/agents/${target}/run`, {
    method: "POST"
  });
  promptInputEl.value = "";
  state.selectedNode = target;
}

async function handleAdvance() {
  const candidateAgents = state.agents.filter((agent) => agent.kind === "agent");
  const selectedAgent =
    byId(candidateAgents, state.selectedNode) ||
    candidateAgents[Math.floor(Math.random() * candidateAgents.length)];
  await fetchJson(`/api/rooms/${state.activeRoomId}/agents/${selectedAgent.id}/run`, {
    method: "POST"
  });
  await loadRoomBundle(state.activeRoomId);
  state.selectedNode = selectedAgent.id;
}

function wireEvents() {
  composerEl.addEventListener("submit", handleHumanSubmit);
  advanceButtonEl.addEventListener("click", handleAdvance);
  resetButtonEl.addEventListener("click", async () => {
    await loadRoomBundle(state.activeRoomId);
    state.activeStage = "all";
    render();
  });
}

function render() {
  renderRooms();
  renderAgentRoster();
  renderHeader();
  renderStageFilters();
  renderFeed();
  renderGraph();
  renderInspector();
  renderSynthesis();
  populateTargetSelect();
}

async function bootstrap() {
  wireEvents();
  await loadBootstrap();
}

bootstrap().catch((error) => {
  console.error(error);
});
