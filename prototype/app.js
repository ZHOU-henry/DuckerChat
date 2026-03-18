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
  promptInputEl.value = "";
  state.selectedNode = target;
}

async function handleAdvance() {
  const template = nextStageTemplate();
  await postEvent({
    speaker: template.speaker,
    target: template.target,
    stage: template.stage,
    title: template.title,
    body: template.body(activeRoom()),
    sources: template.sources,
  });
  state.selectedNode = template.speaker;
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
