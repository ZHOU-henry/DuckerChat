const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const HOST = process.env.DUCKERCHAT_HOST || "127.0.0.1";
const PORT = Number(process.env.DUCKERCHAT_PORT || 4318);
const ROOT = __dirname;
const DATA_ROOT = path.join(ROOT, "data", "rooms");
const CONFIG_ROOT = path.join(ROOT, "config");
const PROTOTYPE_ROOT = path.join(ROOT, "prototype");
const OPENCLAW_CONFIG_PATH = path.join(process.env.HOME || "/home/henry", ".openclaw", "openclaw.json");
const ROOM_TICKERS = new Map();
const STALE_RUN_MS = 60_000;

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function listRoomIds() {
  return fs
    .readdirSync(DATA_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

function loadAgents() {
  return readJson(path.join(CONFIG_ROOT, "agents.json")).agents;
}

function agentStatePath(agent) {
  return path.join(ROOT, agent.stateFile);
}

function loadAgentState(agent) {
  return readJson(agentStatePath(agent));
}

function writeAgentState(agent, state) {
  writeJson(agentStatePath(agent), state);
}

function loadRoom(roomId) {
  const roomDir = path.join(DATA_ROOT, roomId);
  return {
    room: readJson(path.join(roomDir, "room.json")),
    events: readJson(path.join(roomDir, "events.json")),
    graphState: readJson(path.join(roomDir, "graph-state.json")),
    runtimeState: readJson(path.join(roomDir, "runtime.json")),
  };
}

function summarizeRooms() {
  return listRoomIds().map((roomId) => {
    const { room, events, runtimeState } = loadRoom(roomId);
    const totalTokens = events.reduce((sum, event) => sum + (event.usage?.total_tokens || 0), 0);
    return {
      ...room,
      eventCount: events.length,
      lastEventAt: events.length ? events[events.length - 1].createdAt : null,
      totalTokens,
      queueDepth: runtimeState.scheduler.queue.length,
      schedulerEnabled: runtimeState.scheduler.enabled
    };
  });
}

function runtimeStatePath(roomId) {
  return path.join(DATA_ROOT, roomId, "runtime.json");
}

function archivedEventsPath(roomId) {
  return path.join(DATA_ROOT, roomId, "archived-events.json");
}

function writeRuntimeState(roomId, value) {
  writeJson(runtimeStatePath(roomId), value);
}

function loadRuntimeState(roomId) {
  return readJson(runtimeStatePath(roomId));
}

function reconcileRuntimeState(roomId) {
  const runtimeState = loadRuntimeState(roomId);
  const now = Date.now();
  runtimeState.scheduler.activeRuns = (runtimeState.scheduler.activeRuns || []).filter((entry) => {
    const started = Date.parse(entry.startedAt || "");
    if (!Number.isFinite(started)) return false;
    return now - started < STALE_RUN_MS;
  });
  writeRuntimeState(roomId, runtimeState);
  return runtimeState;
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  });
  res.end(`${JSON.stringify(payload, null, 2)}\n`);
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || "application/octet-stream";
  res.writeHead(200, { "Content-Type": contentType });
  fs.createReadStream(filePath).pipe(res);
}

function notFound(res, message = "Not found") {
  sendJson(res, 404, { error: message });
}

function collectBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(new Error("Body too large"));
      }
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function appendEvent(roomId, payload) {
  const roomDir = path.join(DATA_ROOT, roomId);
  const eventsPath = path.join(roomDir, "events.json");
  const graphPath = path.join(roomDir, "graph-state.json");
  const runtimePath = runtimeStatePath(roomId);
  const events = readJson(eventsPath);
  const graphState = readJson(graphPath);
  const runtimeState = readJson(runtimePath);

  const event = {
    id: payload.id || `${roomId}-${Date.now()}`,
    stage: payload.stage || "intervention",
    speaker: payload.speaker || "human",
    target: payload.target || null,
    title: payload.title || "Human intervention",
    body: payload.body || "",
    sources: payload.sources || ["live room intervention"],
    createdAt: new Date().toISOString(),
    usage: payload.usage || null
  };

  events.push(event);

  if (payload.target && payload.speaker) {
    const existingEdge = graphState.edges.find(
      (edge) => edge.source === payload.speaker && edge.target === payload.target && edge.stage === event.stage
    );
    if (existingEdge) {
      existingEdge.weight += 1;
    } else {
      graphState.edges.push({
        source: payload.speaker,
        target: payload.target,
        stage: event.stage,
        weight: 1,
      });
    }
  }

  if (event.speaker === "human") {
    graphState.synthesis.direction = event.body;
  }

  if (event.usage?.total_tokens) {
    runtimeState.metrics.totalAgentRuns += event.speaker === "human" ? 0 : 1;
    runtimeState.metrics.totalTokens += event.usage.total_tokens;
    runtimeState.budgets.tokenBudgetRemaining = Math.max(
      0,
      runtimeState.budgets.tokenBudgetRemaining - event.usage.total_tokens
    );
  }

  writeJson(eventsPath, events);
  writeJson(graphPath, graphState);
  writeJson(runtimePath, runtimeState);
  return event;
}

function enqueueAgent(roomId, agentId, reason) {
  const runtimeState = loadRuntimeState(roomId);
  const queue = runtimeState.scheduler.queue || [];
  if (
    queue.some((entry) => entry.agentId === agentId) ||
    (runtimeState.scheduler.activeRuns || []).some((entry) => entry.agentId === agentId)
  ) {
    return;
  }
  if (queue.length >= runtimeState.budgets.maxQueuedAgents) {
    return;
  }
  queue.push({
    agentId,
    reason,
    enqueuedAt: new Date().toISOString()
  });
  runtimeState.scheduler.queue = queue;
  writeRuntimeState(roomId, runtimeState);
}

function queueSuggestedTargets(roomId, targets, reason) {
  for (const target of targets || []) {
    if (!target || target === "synthesis") continue;
    enqueueAgent(roomId, target, reason);
  }
}

function compactRoomIfNeeded(roomId) {
  const { events, runtimeState } = loadRoom(roomId);
  const { compactBatchSize, keepRecentEvents, summaryNotes } = runtimeState.compaction;
  if (events.length <= keepRecentEvents + compactBatchSize) {
    return;
  }

  const archivePath = archivedEventsPath(roomId);
  const archived = readJson(archivePath);
  const compacted = events.slice(0, compactBatchSize);
  const retained = events.slice(compactBatchSize);

  const uniqueSpeakers = Array.from(new Set(compacted.map((event) => event.speaker)));
  summaryNotes.push({
    id: `${roomId}-summary-${Date.now()}`,
    fromEventId: compacted[0].id,
    toEventId: compacted[compacted.length - 1].id,
    eventCount: compacted.length,
    speakers: uniqueSpeakers,
    summary:
      compacted
        .map((event) => `${event.speaker}: ${event.title}`)
        .join(" | ")
        .slice(0, 600),
    createdAt: new Date().toISOString()
  });

  runtimeState.compaction.summaryNotes = summaryNotes.slice(-30);
  writeJson(path.join(DATA_ROOT, roomId, "events.json"), retained);
  writeJson(archivePath, archived.concat(compacted));
  writeRuntimeState(roomId, runtimeState);
}

function getOpenClawProvider() {
  const config = readJson(OPENCLAW_CONFIG_PATH);
  return config.models.providers.gmn;
}

function extractOutputText(responseJson) {
  const textParts = [];
  for (const item of responseJson.output || []) {
    if (item.type !== "message") continue;
    for (const content of item.content || []) {
      if (content.type === "output_text" && content.text) {
        textParts.push(content.text);
      }
    }
  }
  return textParts.join("\n").trim();
}

function extractUsage(responseJson) {
  if (!responseJson.usage) return null;
  return {
    input_tokens: responseJson.usage.input_tokens || 0,
    output_tokens: responseJson.usage.output_tokens || 0,
    total_tokens: responseJson.usage.total_tokens || 0
  };
}

function estimateTokenCount(text) {
  if (!text) return 0;
  return Math.ceil(String(text).length / 4);
}

function tryParseJsonBlock(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}$/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

async function callAgentModel(agent, room, events, agentState) {
  const provider = getOpenClawProvider();
  const recentEvents = events.slice(-12).map((event) => ({
    stage: event.stage,
    speaker: event.speaker,
    target: event.target,
    title: event.title,
    body: event.body
  }));

  const instructions = [
    `You are ${agent.label} (${agent.role}) inside DuckerChat.`,
    `Soul: ${agent.soul}`,
    `You use the model binding ${agent.modelBinding.provider}/${agent.modelBinding.model}.`,
    `You have your own long-term memory summary, skills, and source library.`,
    `Respond in strict JSON with keys: title, body, stage, memory_update, new_skills, new_sources, next_targets.`,
    `new_skills must be an array of short strings.`,
    `new_sources must be an array of objects with label, type, note.`,
    `next_targets must be an array of agent ids.`,
    `Keep body concise but substantive.`,
    `Do not mention hidden chain-of-thought.`,
  ].join(" ");

  const input = [
    {
      role: "system",
      content: instructions
    },
    {
      role: "user",
      content: JSON.stringify(
        {
          room,
          agentProfile: {
            id: agent.id,
            label: agent.label,
            role: agent.role,
            memory: agent.memory,
            dataConnectors: agent.dataConnectors
          },
          agentState,
          recentEvents
        },
        null,
        2
      )
    }
  ];

  const requestBody = {
    model: agent.modelBinding.model,
    input,
    text: {
      format: { type: "text" },
      verbosity: "medium"
    },
    reasoning: {
      effort: "medium"
    },
    store: false
  };

  const response = await fetch(`${provider.baseUrl}/responses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${provider.apiKey}`
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    throw new Error(`Model request failed for ${agent.id}`);
  }

  const payload = await response.json();
  const text = extractOutputText(payload);
  const parsed = tryParseJsonBlock(text);
  if (!parsed) {
    throw new Error(`Model output was not valid JSON for ${agent.id}`);
  }
  const explicitUsage = extractUsage(payload);
  const estimatedUsage =
    explicitUsage ||
    {
      input_tokens: estimateTokenCount(JSON.stringify(requestBody)),
      output_tokens: estimateTokenCount(text),
      total_tokens:
        estimateTokenCount(JSON.stringify(requestBody)) + estimateTokenCount(text),
      estimated: true
    };
  return {
    parsed,
    usage: estimatedUsage
  };
}

async function executeAgent(roomId, agentId) {
  const agents = loadAgents();
  const agent = agents.find((entry) => entry.id === agentId);
  if (!agent) {
    throw new Error(`Unknown agent ${agentId}`);
  }
  if (agent.kind !== "agent") {
    throw new Error(`Agent ${agentId} is not executable`);
  }

  const { room, events, runtimeState } = loadRoom(roomId);
  const agentState = loadAgentState(agent);
  if (runtimeState.budgets.tokenBudgetRemaining <= 0) {
    throw new Error(`Room ${roomId} has exhausted its token budget`);
  }
  const result = await callAgentModel(agent, room, events, agentState);
  const parsed = result.parsed;

  const updatedState = {
    ...agentState,
    memorySummary: Array.from(new Set([...(agentState.memorySummary || []), parsed.memory_update].filter(Boolean))).slice(-12),
    skills: Array.from(new Set([...(agentState.skills || []), ...((parsed.new_skills || []).filter(Boolean))])).slice(-24),
    sourceLibrary: [...(agentState.sourceLibrary || []), ...((parsed.new_sources || []).filter((entry) => entry && entry.label))].slice(-40)
  };
  writeAgentState(agent, updatedState);

  const event = appendEvent(roomId, {
    speaker: agent.id,
    target: (parsed.next_targets && parsed.next_targets[0]) || "synthesis",
    stage: parsed.stage || "response",
    title: parsed.title || `${agent.label} response`,
    body: parsed.body || "",
    sources: [
      `${agent.modelBinding.provider}/${agent.modelBinding.model}`,
      ...((parsed.new_sources || []).map((entry) => entry.label).slice(0, 3))
    ].filter(Boolean),
    usage: result.usage
  });
  queueSuggestedTargets(roomId, parsed.next_targets, `suggested-by-${agent.id}`);
  compactRoomIfNeeded(roomId);
  return event;
}

async function processSchedulerTick(roomId) {
  const runtimeState = reconcileRuntimeState(roomId);
  runtimeState.scheduler.lastTickAt = new Date().toISOString();

  if (!runtimeState.scheduler.enabled) {
    writeRuntimeState(roomId, runtimeState);
    return;
  }

  if (runtimeState.scheduler.activeRuns.length >= runtimeState.scheduler.maxConcurrentRuns) {
    writeRuntimeState(roomId, runtimeState);
    return;
  }

  const next = runtimeState.scheduler.queue.shift();
  if (!next) {
    writeRuntimeState(roomId, runtimeState);
    return;
  }

  runtimeState.scheduler.activeRuns.push({
    agentId: next.agentId,
    startedAt: new Date().toISOString(),
    reason: next.reason
  });
  writeRuntimeState(roomId, runtimeState);

  try {
    await executeAgent(roomId, next.agentId);
  } catch (error) {
    appendEvent(roomId, {
      speaker: "synthesis",
      target: null,
      stage: "system",
      title: "Scheduler execution warning",
      body: `${next.agentId} did not complete: ${error.message}`,
      sources: ["scheduler"]
    });
  } finally {
    const refreshed = loadRuntimeState(roomId);
    refreshed.scheduler.activeRuns = refreshed.scheduler.activeRuns.filter(
      (entry) => entry.agentId !== next.agentId
    );
    refreshed.scheduler.lastRunAt = new Date().toISOString();
    writeRuntimeState(roomId, refreshed);
  }
}

function ensureRoomTicker(roomId) {
  if (ROOM_TICKERS.has(roomId)) return;
  const runtimeState = reconcileRuntimeState(roomId);
  const ticker = setInterval(() => {
    processSchedulerTick(roomId).catch((error) => {
      console.error(`scheduler tick failed for ${roomId}`, error);
    });
  }, runtimeState.scheduler.intervalMs || 2500);
  ROOM_TICKERS.set(roomId, ticker);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    });
    res.end();
    return;
  }

  if (pathname === "/api/agents" && req.method === "GET") {
    const agents = loadAgents().map((agent) => ({
      ...agent,
      state: loadAgentState(agent)
    }));
    sendJson(res, 200, { agents });
    return;
  }

  if (pathname === "/api/rooms" && req.method === "GET") {
    sendJson(res, 200, { rooms: summarizeRooms() });
    return;
  }

  const roomMatch = pathname.match(/^\/api\/rooms\/([^/]+)(?:\/(events|graph|room))?$/);
  if (roomMatch) {
    const roomId = roomMatch[1];
    const suffix = roomMatch[2];
    const roomDir = path.join(DATA_ROOT, roomId);
    if (!fs.existsSync(roomDir)) {
      notFound(res, `Room ${roomId} not found`);
      return;
    }

    if (req.method === "GET") {
      const { room, events, graphState } = loadRoom(roomId);
      if (suffix === "events") {
        sendJson(res, 200, { events });
      } else if (suffix === "graph") {
        sendJson(res, 200, graphState);
      } else if (suffix === "room" || !suffix) {
        sendJson(res, 200, { room, events, graphState, runtimeState: loadRuntimeState(roomId) });
      } else {
        notFound(res);
      }
      return;
    }

    if (req.method === "POST" && suffix === "events") {
      try {
        const body = await collectBody(req);
        const event = appendEvent(roomId, body);
        if (body.speaker === "human" && body.target) {
          enqueueAgent(roomId, body.target, "human-target");
          enqueueAgent(roomId, "sable", "critic-followup");
        }
        sendJson(res, 201, { event });
      } catch (error) {
        sendJson(res, 400, { error: error.message });
      }
      return;
    }
  }

  const runMatch = pathname.match(/^\/api\/rooms\/([^/]+)\/agents\/([^/]+)\/run$/);
  if (runMatch && req.method === "POST") {
    try {
      const event = await executeAgent(runMatch[1], runMatch[2]);
      sendJson(res, 201, { event });
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return;
  }

  const schedulerMatch = pathname.match(/^\/api\/rooms\/([^/]+)\/scheduler\/(status|nudge|toggle)$/);
  if (schedulerMatch) {
    const roomId = schedulerMatch[1];
    const action = schedulerMatch[2];
    if (req.method === "GET" && action === "status") {
      sendJson(res, 200, loadRuntimeState(roomId));
      return;
    }
    if (req.method === "POST" && action === "toggle") {
      const runtimeState = loadRuntimeState(roomId);
      runtimeState.scheduler.enabled = !runtimeState.scheduler.enabled;
      writeRuntimeState(roomId, runtimeState);
      sendJson(res, 200, runtimeState);
      return;
    }
    if (req.method === "POST" && action === "nudge") {
      const body = await collectBody(req);
      const { room } = loadRoom(roomId);
      const activeTargets = body.agentIds && body.agentIds.length ? body.agentIds : room.activeAgentIds.filter((id) => !["human", "synthesis"].includes(id));
      activeTargets.slice(0, 3).forEach((agentId) => enqueueAgent(roomId, agentId, "manual-nudge"));
      sendJson(res, 200, loadRuntimeState(roomId));
      return;
    }
  }

  const filePath =
    pathname === "/" ? path.join(PROTOTYPE_ROOT, "index.html") : path.join(PROTOTYPE_ROOT, pathname.slice(1));
  if (filePath.startsWith(PROTOTYPE_ROOT) && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    sendFile(res, filePath);
    return;
  }

  notFound(res);
});

server.listen(PORT, HOST, () => {
  for (const roomId of listRoomIds()) {
    ensureRoomTicker(roomId);
  }
  console.log(`DuckerChat running at http://${HOST}:${PORT}`);
});
