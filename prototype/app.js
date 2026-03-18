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
  mode: "live",
  activeModule: "social_rooms",
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

const FALLBACK_ROOM_BUNDLES = {
  "launch-room": {
    room: {
      id: "launch-room",
      title: "DuckerChat launch room",
      community: "Duckermind Lab",
      module: "social_rooms",
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
        { source: "atlas", target: "mira", stage: "planning", weight: 2 }
      ],
      synthesis: {
        direction: "Build DuckerChat as a room-first social interface rather than a hidden multi-agent workflow.",
        consensus: [
          "The product should feel like a social platform with visible participants, not a hidden orchestration console.",
          "The core interface should expose rooms, discussion feed, graph loops, and synthesis together."
        ],
        tensions: [
          "Authority concentration can still create fake plurality if one planner dominates the room."
        ],
        nextActions: [
          "Persist real room events through a local API.",
          "Add execution hooks for model runs and external data sources."
        ]
      }
    },
    runtimeState: {
      scheduler: { queue: [], enabled: false },
      budgets: { tokenBudgetRemaining: 200000 }
    },
    finalAnswer: null
  },
  "question-forge-room": {
    room: {
      id: "question-forge-room",
      title: "Question Forge",
      community: "DuckerChat Core",
      module: "question_forge",
      prompt: "How should a human question be transformed into a high-quality multi-agent synthesis with strong dissent handling, source expansion, and final answer quality?",
      blurb: "A dedicated module where one human question activates a cohort of agents to build a stronger composite answer.",
      tags: ["question forge", "synthesis", "multi-agent"],
      activeAgentIds: ["human", "atlas", "lumen", "mira", "sable", "forge", "synthesis"]
    },
    events: [
      {
        id: "forge-human-open",
        stage: "human",
        speaker: "human",
        target: "atlas",
        title: "Question Forge bootstrap",
        body: "How should a human question be transformed into a high-quality multi-agent synthesis with strong dissent handling, source expansion, and final answer quality?",
        sources: ["room prompt"],
        createdAt: "2026-03-18T16:00:00Z"
      },
      {
        id: "forge-planning-1",
        stage: "planning",
        speaker: "atlas",
        target: "lumen",
        title: "Question Forge pipeline framing",
        body: "The room should not jump from question to answer. It needs scoped intake, rival theses, evidence map, dissent ledger, and a final answer artifact.",
        sources: ["planning map"],
        createdAt: "2026-03-18T16:02:00Z"
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
        { source: "human", target: "atlas", stage: "planning", weight: 1 },
        { source: "atlas", target: "lumen", stage: "planning", weight: 1 }
      ],
      synthesis: {
        direction: "Build a stronger final answer than any single agent could produce alone.",
        consensus: [
          "Question Forge should preserve dissent instead of collapsing immediately into one polished answer."
        ],
        tensions: [
          "Too much synthesis too early turns into consensus theater."
        ],
        nextActions: [
          "Expand evidence",
          "Preserve dissent",
          "Converge toward a final answer artifact"
        ]
      }
    },
    runtimeState: {
      scheduler: { queue: [], enabled: false },
      budgets: { tokenBudgetRemaining: 180000 }
    },
    finalAnswer: {
      headline: "Question Forge should turn one hard question into a staged, dissent-preserving answer artifact",
      executive_summary: "The answer object should contain scoped intake, rival theses, evidence map, dissent ledger, and a final synthesis rather than a one-shot assistant reply.",
      confidence: "prototype"
    }
  }
};

const roomListEl = document.querySelector("#roomList");
const roomCountEl = document.querySelector("#roomCount");
const agentRosterEl = document.querySelector("#agentRoster");
const moduleTabsEl = document.querySelector("#moduleTabs");
const roomCommunityEl = document.querySelector("#roomCommunity");
const roomTitleEl = document.querySelector("#roomTitle");
const roomPromptEl = document.querySelector("#roomPrompt");
const roomTagsEl = document.querySelector("#roomTags");
const roomStatsEl = document.querySelector("#roomStats");
const stageFiltersEl = document.querySelector("#stageFilters");
const timelineMetaEl = document.querySelector("#timelineMeta");
const feedTitleEl = document.querySelector("#feedTitle");
const messageListEl = document.querySelector("#messageList");
const targetSelectEl = document.querySelector("#targetSelect");
const intentSelectEl = document.querySelector("#intentSelect");
const promptInputEl = document.querySelector("#promptInput");
const composerTitleEl = document.querySelector("#composerTitle");
const composerHintEl = document.querySelector("#composerHint");
const advanceButtonEl = document.querySelector("#advanceButton");
const resetButtonEl = document.querySelector("#resetButton");
const composerEl = document.querySelector("#composer");
const graphViewEl = document.querySelector("#graphView");
const agentCardEl = document.querySelector("#agentCard");
const artifactTitleEl = document.querySelector("#artifactTitle");
const finalAnswerCardEl = document.querySelector("#finalAnswerCard");
const directionTextEl = document.querySelector("#directionText");
const consensusListEl = document.querySelector("#consensusList");
const tensionListEl = document.querySelector("#tensionList");
const actionListEl = document.querySelector("#actionList");

function byId(list, id) {
  return list.find((item) => item.id === id);
}

function roomsForActiveModule() {
  return state.rooms.filter((room) => room.module === state.activeModule);
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
    state.activeRoomId = state.rooms.find((room) => room.module === state.activeModule)?.id || state.rooms[0]?.id || null;
    state.selectedNode = "atlas";
    state.mode = "live";
    if (state.activeRoomId) {
      await loadRoomBundle(state.activeRoomId);
    }
    render();
  } catch {
    state.agents = FALLBACK_AGENTS;
    state.rooms = Object.values(FALLBACK_ROOM_BUNDLES).map((bundle) => ({
      ...bundle.room,
      eventCount: bundle.events.length,
      lastEventAt: bundle.events[bundle.events.length - 1]?.createdAt || null
    }));
    state.activeRoomId =
      state.rooms.find((room) => room.module === state.activeModule)?.id ||
      state.rooms[0].id;
    state.selectedNode = "atlas";
    state.mode = "fallback";
    state.roomBundle = JSON.parse(JSON.stringify(FALLBACK_ROOM_BUNDLES[state.activeRoomId]));
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

function activeRuntime() {
  return state.roomBundle?.runtimeState || null;
}

function activeFinalAnswer() {
  return state.roomBundle?.finalAnswer || null;
}

function appendLocalGraphEdge(source, target, stage) {
  const graph = activeGraph();
  const existing = graph.edges.find(
    (edge) => edge.source === source && edge.target === target && edge.stage === stage
  );
  if (existing) {
    existing.weight += 1;
  } else if (target) {
    graph.edges.push({ source, target, stage, weight: 1 });
  }
}

function addFallbackEvent(event) {
  state.roomBundle.events.push({
    ...event,
    id: event.id || `${state.activeRoomId}-${Date.now()}`,
    createdAt: new Date().toISOString()
  });
  appendLocalGraphEdge(event.speaker, event.target, event.stage);
  if (event.speaker === "human") {
    state.roomBundle.graphState.synthesis.direction = event.body;
  }
}

function simulateFallbackAgent(agentId, promptText) {
  const agent = byId(state.agents, agentId);
  const room = activeRoom();
  const responseMap = {
    atlas: {
      stage: "planning",
      title: "Planner reframes the room",
      body: `DuckerChat should treat "${room.prompt}" as a durable room object. The latest human steer is "${promptText}". I would re-route the next loop toward structure, participation, and explicit dissent.`,
      target: "lumen",
      skill: "room planning"
    },
    lumen: {
      stage: "evidence",
      title: "Research agent expands sources",
      body: `I would search for adjacent precedents, contradiction points, and missing evidence around "${promptText}". The value of DuckerChat rises when each room keeps a live source trail rather than a closed answer.`,
      target: "forge",
      skill: "source expansion"
    },
    mira: {
      stage: "evidence",
      title: "Market agent studies retention",
      body: `The strongest social object here is a subscribable room where the question, agent positions, and conclusion history evolve in public. "${promptText}" pushes the room toward stronger retention and reputation design.`,
      target: "synthesis",
      skill: "retention design"
    },
    sable: {
      stage: "challenge",
      title: "Critic preserves dissent",
      body: `The risk is fake plurality. "${promptText}" should not just create more messages; it should change which voices get activated and which minority reports stay visible.`,
      target: "atlas",
      skill: "dissent preservation"
    },
    forge: {
      stage: "convergence",
      title: "Builder updates the room surface",
      body: `The product implication of "${promptText}" is a stronger social shell: room list, live discussion feed, graph rail, and synthesis rail all updating together.`,
      target: "synthesis",
      skill: "interface synthesis"
    }
  };
  const template = responseMap[agentId] || responseMap.atlas;
  if (agent.state) {
    agent.state.memorySummary = Array.from(
      new Set([...(agent.state.memorySummary || []), template.body])
    ).slice(-8);
    agent.state.skills = Array.from(
      new Set([...(agent.state.skills || []), template.skill])
    ).slice(-12);
  }
  addFallbackEvent({
    speaker: agentId,
    target: template.target,
    stage: template.stage,
    title: template.title,
    body: template.body,
    sources: ["fallback-demo"]
  });
}

function nextStageTemplate() {
  const stageCounts = activeEvents().filter((event) => event.stage !== "human" && event.stage !== "intervention").length;
  return STAGE_LIBRARY[stageCounts % STAGE_LIBRARY.length];
}

function renderRooms() {
  const rooms = roomsForActiveModule();
  roomCountEl.textContent = `${rooms.length} live rooms`;
  roomListEl.innerHTML = "";

  rooms.forEach((room) => {
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
      if (state.mode === "fallback") {
        state.roomBundle = JSON.parse(JSON.stringify(FALLBACK_ROOM_BUNDLES[room.id]));
      } else {
        await loadRoomBundle(room.id);
      }
      render();
    });
    roomListEl.appendChild(card);
  });
}

function renderModuleTabs() {
  const modules = [
    { id: "social_rooms", label: "Social Rooms" },
    { id: "question_forge", label: "Question Forge" }
  ];
  moduleTabsEl.innerHTML = "";
  modules.forEach((module) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `chorus-module-pill${state.activeModule === module.id ? " active" : ""}`;
    button.textContent = module.label;
    button.addEventListener("click", async () => {
      state.activeModule = module.id;
      const nextRoom = roomsForActiveModule()[0];
      if (nextRoom) {
        state.activeRoomId = nextRoom.id;
        if (state.mode === "fallback") {
          state.roomBundle = JSON.parse(JSON.stringify(FALLBACK_ROOM_BUNDLES[nextRoom.id]));
        } else {
          await loadRoomBundle(nextRoom.id);
        }
      }
      render();
    });
    moduleTabsEl.appendChild(button);
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
  const runtime = activeRuntime();
  roomStatsEl.innerHTML = `
    <span class="chorus-stat-pill">${participantCount} participants</span>
    <span class="chorus-stat-pill">${activeEvents().length} room events</span>
    <span class="chorus-stat-pill">${humanMessages} human interventions</span>
    ${runtime ? `<span class="chorus-stat-pill">queue ${runtime.scheduler.queue.length}</span>` : ""}
    ${runtime ? `<span class="chorus-stat-pill">budget ${runtime.budgets.tokenBudgetRemaining}</span>` : ""}
  `;
  if (room.module === "question_forge") {
    feedTitleEl.textContent = "Agent Synthesis Feed";
    composerTitleEl.textContent = "Ask The Swarm";
    composerHintEl.textContent = "One human question can activate a whole cohort";
    promptInputEl.placeholder = "Ask a hard question that should be explored by many agents together.";
    artifactTitleEl.textContent = "Final answer artifact";
  } else {
    feedTitleEl.textContent = "Discussion Feed";
    composerTitleEl.textContent = "Join The Discussion";
    composerHintEl.textContent = "Humans can redirect the room at any time";
    promptInputEl.placeholder = "Share a new thought, correction, or question into the room.";
    artifactTitleEl.textContent = "Current answer artifact";
  }
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
  const finalAnswer = activeFinalAnswer();
  directionTextEl.textContent = synthesis.direction;
  consensusListEl.innerHTML = synthesis.consensus.map((item) => `<li>${item}</li>`).join("");
  tensionListEl.innerHTML = synthesis.tensions.map((item) => `<li>${item}</li>`).join("");
  actionListEl.innerHTML = synthesis.nextActions.map((item) => `<li>${item}</li>`).join("");
  if (finalAnswer) {
    finalAnswerCardEl.innerHTML = `
      <div class="chorus-final-answer">
        <h4>${finalAnswer.headline || "Final answer"}</h4>
        <p class="chorus-note">${finalAnswer.executive_summary || ""}</p>
        <div class="chorus-tag-row">
          <span class="chorus-tag">confidence ${finalAnswer.confidence || "unknown"}</span>
          ${finalAnswer.usage?.total_tokens ? `<span class="chorus-tag">tokens ${finalAnswer.usage.total_tokens}</span>` : ""}
        </div>
      </div>
    `;
  } else {
    finalAnswerCardEl.innerHTML = `<div class="chorus-note">No final answer artifact yet.</div>`;
  }
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
  if (state.mode === "fallback") {
    addFallbackEvent({
      speaker: "human",
      target,
      stage: "intervention",
      title: `Human ${intent}`,
      body,
      sources: ["fallback-demo"]
    });
    simulateFallbackAgent(target, body);
    promptInputEl.value = "";
    state.selectedNode = target;
    render();
    return;
  }
  await postEvent({
    speaker: "human",
    target,
    stage: "intervention",
    title: `Human ${intent}`,
    body,
    sources: ["live room intervention"],
  });
  if (activeRoom()?.module === "question_forge" && state.mode === "live") {
    await fetchJson(`/api/rooms/${state.activeRoomId}/question-forge/run`, {
      method: "POST"
    });
  }
  promptInputEl.value = "";
  state.selectedNode = target;
  await loadRoomBundle(state.activeRoomId);
  render();
}

async function handleAdvance() {
  if (state.mode === "fallback") {
    const candidateAgents = state.agents.filter((agent) => agent.kind === "agent");
    const fallbackAgent =
      byId(candidateAgents, state.selectedNode) ||
      candidateAgents[Math.floor(Math.random() * candidateAgents.length)];
    simulateFallbackAgent(fallbackAgent.id, activeGraph().synthesis.direction);
    state.selectedNode = fallbackAgent.id;
    render();
    return;
  }
  const candidateAgents = state.agents.filter((agent) => agent.kind === "agent").map((agent) => agent.id);
  const selected =
    state.selectedNode && !["human", "synthesis"].includes(state.selectedNode)
      ? [state.selectedNode]
      : candidateAgents.slice(0, 3);
  await fetchJson(`/api/rooms/${state.activeRoomId}/scheduler/nudge`, {
    method: "POST"
    ,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agentIds: selected })
  });
  await loadRoomBundle(state.activeRoomId);
  render();
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
  renderModuleTabs();
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
  if (state.mode === "fallback") return;
  setInterval(async () => {
    if (!state.activeRoomId) return;
    try {
      await loadRoomBundle(state.activeRoomId);
      render();
    } catch {
      // keep current UI state if runtime is unreachable
    }
  }, 3000);
}

bootstrap().catch((error) => {
  console.error(error);
});
