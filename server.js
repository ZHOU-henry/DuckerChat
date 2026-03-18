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
const SKILLS_ROOT = path.join(ROOT, "skills");
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

function loadSkillProfile(agent) {
  return readJson(path.join(ROOT, agent.skillFile));
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

function compactAgentState(agent, state) {
  const compacted = { ...state };
  compacted.memorySummary = compacted.memorySummary || [];
  compacted.skills = compacted.skills || [];
  compacted.sourceLibrary = compacted.sourceLibrary || [];
  compacted.compactedNotes = compacted.compactedNotes || [];
  compacted.sourceCandidates = compacted.sourceCandidates || [];
  compacted.sourceFetchQueue = compacted.sourceFetchQueue || [];

  if (compacted.memorySummary.length > 10) {
    const overflow = compacted.memorySummary.slice(0, compacted.memorySummary.length - 6);
    compacted.compactedNotes.push({
      kind: "memory",
      summary: overflow.join(" | ").slice(0, 800),
      createdAt: new Date().toISOString()
    });
    compacted.memorySummary = compacted.memorySummary.slice(-6);
  }

  if (compacted.sourceLibrary.length > 24) {
    const overflow = compacted.sourceLibrary.slice(0, compacted.sourceLibrary.length - 18);
    compacted.compactedNotes.push({
      kind: "sources",
      summary: overflow.map((entry) => entry.label).join(", ").slice(0, 800),
      createdAt: new Date().toISOString()
    });
    compacted.sourceLibrary = compacted.sourceLibrary.slice(-18);
  }

  compacted.compactedNotes = compacted.compactedNotes.slice(-12);
  compacted.sourceCandidates = compacted.sourceCandidates.slice(-24);
  compacted.sourceFetchQueue = compacted.sourceFetchQueue.slice(-24);
  return compacted;
}

function loadRoom(roomId) {
  const roomDir = path.join(DATA_ROOT, roomId);
  return {
    room: readJson(path.join(roomDir, "room.json")),
    events: readJson(path.join(roomDir, "events.json")),
    graphState: readJson(path.join(roomDir, "graph-state.json")),
    runtimeState: readJson(path.join(roomDir, "runtime.json")),
    finalAnswer: fs.existsSync(path.join(roomDir, "final-answer.json"))
      ? readJson(path.join(roomDir, "final-answer.json"))
      : null,
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

function finalAnswerPath(roomId) {
  return path.join(DATA_ROOT, roomId, "final-answer.json");
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

  if (event.stage === "convergence" && event.speaker !== "human") {
    graphState.synthesis.consensus = Array.from(
      new Set([...(graphState.synthesis.consensus || []), event.body])
    ).slice(-6);
  }

  if (event.stage === "challenge") {
    graphState.synthesis.tensions = Array.from(
      new Set([...(graphState.synthesis.tensions || []), event.body])
    ).slice(-8);
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

function enqueueTarget(roomId, agentId, reason, priority = 0) {
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
    priority,
    enqueuedAt: new Date().toISOString()
  });
  queue.sort(
    (a, b) => (b.priority || 0) - (a.priority || 0) || Date.parse(a.enqueuedAt) - Date.parse(b.enqueuedAt)
  );
  runtimeState.scheduler.queue = queue;
  writeRuntimeState(roomId, runtimeState);
}

function addSourceCandidates(agentState, parsed) {
  const candidates = (parsed.source_candidates || [])
    .filter((entry) => entry && entry.query)
    .map((entry) => ({
      query: entry.query,
      why: entry.why || "",
      priority: entry.priority || 0.5,
      createdAt: new Date().toISOString(),
      status: "pending"
    }));

  if (!candidates.length) return agentState;

  return {
    ...agentState,
    sourceCandidates: [...(agentState.sourceCandidates || []), ...candidates].slice(-24),
    sourceFetchQueue: [...(agentState.sourceFetchQueue || []), ...candidates].slice(-24)
  };
}

function defaultGraphTargets(roomId, agentId) {
  const { graphState } = loadRoom(roomId);
  return graphState.edges
    .filter((edge) => edge.source === agentId)
    .sort((a, b) => b.weight - a.weight)
    .map((edge) => edge.target)
    .filter((target) => target && target !== "synthesis");
}

function chooseAutonomousTargets(roomId) {
  const { room, runtimeState } = loadRoom(roomId);
  const agentIds = room.activeAgentIds.filter((id) => !["human", "synthesis"].includes(id));
  const recentSpeakers = loadRoom(roomId).events.slice(-8).map((event) => event.speaker);
  const coldAgents = agentIds.filter((id) => !recentSpeakers.includes(id));
  if (room.module === "question_forge") {
    return (coldAgents.length ? coldAgents : agentIds).slice(0, 2);
  }
  return (coldAgents.length ? coldAgents : agentIds)
    .sort(() => Math.random() - 0.5)
    .slice(0, 2);
}

function computeAgentPriority(roomId, agent) {
  const room = loadRoom(roomId).room;
  const agentState = loadAgentState(agent);
  const skill = loadSkillProfile(agent);
  let priority = agent.priorityBase || 0.5;

  priority += Math.min(0.35, (agentState.skills || []).length * 0.01);
  priority += Math.min(0.2, (agentState.sourceLibrary || []).length * 0.004);

  if (room.module === "question_forge") {
    if (/Planner|Researcher|Critic|Builder/.test(agent.role)) priority += 0.15;
    if (skill.profession.includes("Final answer")) priority += 0.2;
  } else if (room.module === "social_rooms") {
    if (/Market|Critic|Researcher/.test(agent.role)) priority += 0.08;
  }

  return priority;
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

async function processSourceQueueTick(roomId) {
  const agents = loadAgents().filter((agent) => agent.kind === "agent");
  for (const agent of agents) {
    const agentState = loadAgentState(agent);
    const queue = agentState.sourceFetchQueue || [];
    const next = queue.find((entry) => entry.status === "pending");
    if (!next) continue;

    next.status = "done";
    next.fetchedAt = new Date().toISOString();
    agentState.sourceLibrary.push({
      label: next.query,
      type: "source-candidate",
      note: next.why || "Agent-generated source candidate"
    });
    writeAgentState(agent, compactAgentState(agent, agentState));

    appendEvent(roomId, {
      speaker: agent.id,
      target: null,
      stage: "source_ingestion",
      title: `${agent.label} added a private source candidate`,
      body: `${agent.label} added "${next.query}" into its private source library.`,
      sources: ["source-candidate-queue"]
    });
    break;
  }
}

function questionForgeReady(roomId) {
  const { room, events } = loadRoom(roomId);
  if (room.module !== "question_forge") return false;
  const contributors = new Set(events.filter((event) => !["human", "synthesis"].includes(event.speaker)).map((event) => event.speaker));
  return ["atlas", "lumen", "mira", "sable", "forge"].every((agentId) => contributors.has(agentId));
}

async function generateQuestionForgeAnswer(roomId) {
  const { room, events } = loadRoom(roomId);
  const provider = getOpenClawProvider();
  const agents = loadAgents()
    .filter((agent) => room.activeAgentIds.includes(agent.id))
    .map((agent) => ({
      id: agent.id,
      label: agent.label,
      role: agent.role,
      skill: loadSkillProfile(agent),
      state: loadAgentState(agent)
    }));

  const input = [
    {
      role: "system",
      content:
        "You are the DuckerChat Question Forge synthesis engine. Produce a final answer artifact in strict JSON with keys: headline, executive_summary, composite_answer, key_claims, dissent, source_highlights, confidence, next_questions."
    },
    {
      role: "user",
      content: JSON.stringify(
        {
          room,
          agents,
          recentEvents: events.slice(-16)
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
      model: "gpt-5.4",
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
    throw new Error("Question Forge synthesis failed");
  }

  const payload = await response.json();
  const text = extractOutputText(payload);
  const parsed = tryParseJsonBlock(text);
  if (!parsed) {
    throw new Error("Question Forge synthesis did not return valid JSON");
  }

  const usage =
    extractUsage(payload) || {
      input_tokens: estimateTokenCount(JSON.stringify(input)),
      output_tokens: estimateTokenCount(text),
      total_tokens: estimateTokenCount(JSON.stringify(input)) + estimateTokenCount(text),
      estimated: true
    };

  const artifact = {
    ...parsed,
    generatedAt: new Date().toISOString(),
    usage
  };
  writeJson(finalAnswerPath(roomId), artifact);
  appendEvent(roomId, {
    speaker: "synthesis",
    target: "human",
    stage: "convergence",
    title: artifact.headline || "Question Forge final answer",
    body: artifact.executive_summary || artifact.composite_answer || "",
    sources: ["question-forge-final-answer"],
    usage
  });
  return artifact;
}

async function runQuestionForgeRound(roomId) {
  const { room } = loadRoom(roomId);
  if (room.module !== "question_forge") {
    throw new Error("Room is not a Question Forge module");
  }

  const orderedAgents = ["atlas", "lumen", "mira", "sable", "forge"];
  const results = [];
  for (const agentId of orderedAgents) {
    results.push(await executeAgent(roomId, agentId));
  }
  const finalAnswer = await generateQuestionForgeAnswer(roomId);
  return {
    events: results,
    finalAnswer
  };
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
  const skill = loadSkillProfile(agent);
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
    `Profession: ${skill.profession}.`,
    `Core skills: ${(skill.coreSkills || []).join(", ")}.`,
    `Role boundaries: ${(skill.boundaries || []).join("; ")}.`,
    `You use the model binding ${agent.modelBinding.provider}/${agent.modelBinding.model}.`,
    `You have your own long-term memory summary, skills, and source library.`,
    `Respond in strict JSON with keys: title, body, stage, memory_update, new_skills, new_sources, source_candidates, next_targets, priority_boost.`,
    `new_skills must be an array of short strings.`,
    `new_sources must be an array of objects with label, type, note.`,
    `source_candidates must be an array of objects with query, why, priority.`,
    `next_targets must be an array of agent ids.`,
    `priority_boost must be a number between 0 and 1.`,
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

  const enrichedState = addSourceCandidates(agentState, parsed);
  const updatedState = compactAgentState(agent, {
    ...enrichedState,
    memorySummary: Array.from(new Set([...(enrichedState.memorySummary || []), parsed.memory_update].filter(Boolean))).slice(-12),
    skills: Array.from(new Set([...(enrichedState.skills || []), ...((parsed.new_skills || []).filter(Boolean))])).slice(-24),
    sourceLibrary: [...(enrichedState.sourceLibrary || []), ...((parsed.new_sources || []).filter((entry) => entry && entry.label))].slice(-40)
  });
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
  const suggestedTargets =
    parsed.next_targets && parsed.next_targets.length
      ? parsed.next_targets
      : defaultGraphTargets(roomId, agent.id);
  suggestedTargets.forEach((target) => {
    if (!target || target === "synthesis") return;
    enqueueTarget(
      roomId,
      target,
      `suggested-by-${agent.id}`,
      (parsed.priority_boost || 0) + computeAgentPriority(roomId, agent)
    );
  });
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
    if (runtimeState.metrics.totalAgentRuns < runtimeState.budgets.softTurnLimit) {
      chooseAutonomousTargets(roomId).forEach((agentId) => {
        const agent = loadAgents().find((entry) => entry.id === agentId);
        enqueueTarget(roomId, agentId, "autonomous-wake", computeAgentPriority(roomId, agent));
      });
    }
    writeRuntimeState(roomId, runtimeState);
    await processSourceQueueTick(roomId);
    return;
  }

  runtimeState.scheduler.activeRuns.push({
    agentId: next.agentId,
    startedAt: new Date().toISOString(),
    reason: next.reason
  });
  writeRuntimeState(roomId, runtimeState);

  try {
    if (next.agentId === "synthesis") {
      await generateQuestionForgeAnswer(roomId);
    } else {
      await executeAgent(roomId, next.agentId);
    }
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
    await processSourceQueueTick(roomId);
    if (questionForgeReady(roomId) && !loadRuntimeState(roomId).scheduler.queue.some((entry) => entry.agentId === "synthesis")) {
      enqueueTarget(roomId, "synthesis", "question-forge-ready", 2);
    }
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
        sendJson(res, 200, { room, events, graphState, runtimeState: loadRuntimeState(roomId), finalAnswer: loadRoom(roomId).finalAnswer });
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
        const room = loadRoom(roomId).room;
        if (room.module === "question_forge") {
          ["atlas", "lumen", "mira", "sable", "forge"].forEach((agentId) => {
            const agent = loadAgents().find((entry) => entry.id === agentId);
            enqueueTarget(roomId, agentId, "question-forge-human-ask", computeAgentPriority(roomId, agent) + 0.2);
          });
        } else {
          const agents = loadAgents();
          const targetAgent = agents.find((entry) => entry.id === body.target);
          const criticAgent = agents.find((entry) => entry.id === "sable");
          enqueueTarget(roomId, body.target, "human-target", computeAgentPriority(roomId, targetAgent) + 0.15);
          enqueueTarget(roomId, "sable", "critic-followup", computeAgentPriority(roomId, criticAgent) + 0.05);
        }
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

  const forgeMatch = pathname.match(/^\/api\/rooms\/([^/]+)\/question-forge\/run$/);
  if (forgeMatch && req.method === "POST") {
    try {
      const result = await runQuestionForgeRound(forgeMatch[1]);
      sendJson(res, 201, result);
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
      activeTargets.slice(0, 3).forEach((agentId) => {
        const agent = loadAgents().find((entry) => entry.id === agentId);
        enqueueTarget(roomId, agentId, "manual-nudge", computeAgentPriority(roomId, agent) + 0.1);
      });
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
