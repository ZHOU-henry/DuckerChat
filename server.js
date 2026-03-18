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
    sendJson(res, 200, readJson(path.join(CONFIG_ROOT, "agents.json")));
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
