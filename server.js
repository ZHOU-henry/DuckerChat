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
  };
}

function summarizeRooms() {
  return listRoomIds().map((roomId) => {
    const { room, events } = loadRoom(roomId);
    return {
      ...room,
      eventCount: events.length,
      lastEventAt: events.length ? events[events.length - 1].createdAt : null,
    };
  });
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
  const events = readJson(eventsPath);
  const graphState = readJson(graphPath);

  const event = {
    id: payload.id || `${roomId}-${Date.now()}`,
    stage: payload.stage || "intervention",
    speaker: payload.speaker || "human",
    target: payload.target || null,
    title: payload.title || "Human intervention",
    body: payload.body || "",
    sources: payload.sources || ["live room intervention"],
    createdAt: new Date().toISOString(),
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

  writeJson(eventsPath, events);
  writeJson(graphPath, graphState);
  return event;
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

  const response = await fetch(`${provider.baseUrl}/responses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${provider.apiKey}`
    },
    body: JSON.stringify({
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
    })
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
  return parsed;
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

  const { room, events } = loadRoom(roomId);
  const agentState = loadAgentState(agent);
  const result = await callAgentModel(agent, room, events, agentState);

  const updatedState = {
    ...agentState,
    memorySummary: Array.from(new Set([...(agentState.memorySummary || []), result.memory_update].filter(Boolean))).slice(-12),
    skills: Array.from(new Set([...(agentState.skills || []), ...((result.new_skills || []).filter(Boolean))])).slice(-24),
    sourceLibrary: [...(agentState.sourceLibrary || []), ...((result.new_sources || []).filter((entry) => entry && entry.label))].slice(-40)
  };
  writeAgentState(agent, updatedState);

  return appendEvent(roomId, {
    speaker: agent.id,
    target: (result.next_targets && result.next_targets[0]) || "synthesis",
    stage: result.stage || "response",
    title: result.title || `${agent.label} response`,
    body: result.body || "",
    sources: [
      `${agent.modelBinding.provider}/${agent.modelBinding.model}`,
      ...((result.new_sources || []).map((entry) => entry.label).slice(0, 3))
    ].filter(Boolean)
  });
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
        sendJson(res, 200, { room, events, graphState });
      } else {
        notFound(res);
      }
      return;
    }

    if (req.method === "POST" && suffix === "events") {
      try {
        const body = await collectBody(req);
        const event = appendEvent(roomId, body);
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

  const filePath =
    pathname === "/" ? path.join(PROTOTYPE_ROOT, "index.html") : path.join(PROTOTYPE_ROOT, pathname.slice(1));
  if (filePath.startsWith(PROTOTYPE_ROOT) && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    sendFile(res, filePath);
    return;
  }

  notFound(res);
});

server.listen(PORT, HOST, () => {
  console.log(`DuckerChat running at http://${HOST}:${PORT}`);
});
