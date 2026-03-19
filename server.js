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
const SOURCES_ROOT = path.join(ROOT, "data", "sources");
const AGENT_SOURCES_ROOT = path.join(SOURCES_ROOT, "agents");
const SHARED_SOURCES_PATH = path.join(SOURCES_ROOT, "shared-library.json");
const SOURCE_REGISTRY_PATH = path.join(SOURCES_ROOT, "source-registry.json");
const OPENCLAW_CONFIG_PATH = path.join(process.env.HOME || "/home/henry", ".openclaw", "openclaw.json");
const ROOM_TICKERS = new Map();
const STALE_RUN_MS = 60_000;

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

const STAGE_WEIGHTS = {
  human: 1.35,
  intervention: 1.1,
  challenge: 1.15,
  evidence: 1,
  planning: 0.92,
  analysis: 0.96,
  implementation: 0.9,
  convergence: 0.75,
  source_ingestion: 0.55,
  system: 0.4,
};

const SOCIAL_COMPANIONS = {
  atlas: ["lumen", "mira", "sable"],
  lumen: ["atlas", "sable", "forge"],
  mira: ["atlas", "sable", "forge"],
  sable: ["atlas", "lumen", "forge"],
  forge: ["atlas", "lumen", "mira"],
};

const ROOM_MODULE_DEFAULTS = {
  social_rooms: {
    maxConcurrentRuns: 4,
    clusterWakeCount: 2,
    maxAutoAgentsPerTick: 2,
    softTurnLimit: 90,
    maxQueuedAgents: 18
  },
  question_forge: {
    maxConcurrentRuns: 2,
    clusterWakeCount: 2,
    maxAutoAgentsPerTick: 2,
    softTurnLimit: 48,
    maxQueuedAgents: 12
  },
  ultimate_prediction: {
    maxConcurrentRuns: 2,
    clusterWakeCount: 3,
    maxAutoAgentsPerTick: 3,
    softTurnLimit: 36,
    maxQueuedAgents: 16
  }
};

const GLOBAL_ANNOUNCEMENT_KEYS = {
  tokenBudgetExhausted: "token-budget-exhausted"
};

const EDGE_DIMENSIONS = ["trust", "complementarity", "rivalry", "influence", "coordination"];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function ensureJsonFile(filePath, fallbackValue) {
  if (!fs.existsSync(filePath)) {
    writeJson(filePath, fallbackValue);
    return fallbackValue;
  }
  return readJson(filePath);
}

function listRoomIds() {
  return fs
    .readdirSync(DATA_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

function roomPath(roomId) {
  return path.join(DATA_ROOT, roomId, "room.json");
}

function defaultMaxConcurrentRuns(module) {
  return ROOM_MODULE_DEFAULTS[module]?.maxConcurrentRuns || 2;
}

function normalizeRuntimeState(roomId, runtimeState, room) {
  const normalizedRoom = room || readJson(roomPath(roomId));
  const moduleDefaults = ROOM_MODULE_DEFAULTS[normalizedRoom.module] || ROOM_MODULE_DEFAULTS.social_rooms;
  return {
    roomId,
    scheduler: {
      enabled: runtimeState.scheduler?.enabled ?? true,
      intervalMs: runtimeState.scheduler?.intervalMs ?? 2500,
      maxConcurrentRuns: runtimeState.scheduler?.maxConcurrentRuns ?? defaultMaxConcurrentRuns(normalizedRoom.module),
      queue: runtimeState.scheduler?.queue || [],
      activeRuns: runtimeState.scheduler?.activeRuns || [],
      lastTickAt: runtimeState.scheduler?.lastTickAt || null,
      lastRunAt: runtimeState.scheduler?.lastRunAt || null,
      queueDecay: runtimeState.scheduler?.queueDecay ?? 0.94,
      priorityFloor: runtimeState.scheduler?.priorityFloor ?? 0.12,
      clusterWakeCount: runtimeState.scheduler?.clusterWakeCount ?? moduleDefaults.clusterWakeCount,
      maxAutoAgentsPerTick: runtimeState.scheduler?.maxAutoAgentsPerTick ?? moduleDefaults.maxAutoAgentsPerTick,
    },
    budgets: {
      tokenBudgetTotal: runtimeState.budgets?.tokenBudgetTotal ?? 180000,
      tokenBudgetRemaining: runtimeState.budgets?.tokenBudgetRemaining ?? runtimeState.budgets?.tokenBudgetTotal ?? 180000,
      maxContextEvents: runtimeState.budgets?.maxContextEvents ?? 14,
      softTurnLimit: runtimeState.budgets?.softTurnLimit ?? moduleDefaults.softTurnLimit,
      maxQueuedAgents: runtimeState.budgets?.maxQueuedAgents ?? moduleDefaults.maxQueuedAgents,
    },
    compaction: {
      compactBatchSize: runtimeState.compaction?.compactBatchSize ?? 8,
      keepRecentEvents: runtimeState.compaction?.keepRecentEvents ?? 18,
      summaryNotes: runtimeState.compaction?.summaryNotes || [],
    },
    metrics: {
      totalAgentRuns: runtimeState.metrics?.totalAgentRuns ?? 0,
      totalTokens: runtimeState.metrics?.totalTokens ?? 0,
    },
    announcements: {
      onceKeys: runtimeState.announcements?.onceKeys || [],
      lastGlobalNotice: runtimeState.announcements?.lastGlobalNotice || null,
    },
    prediction: {
      scoutCount: runtimeState.prediction?.scoutCount ?? 100,
      draftAgentLimit: runtimeState.prediction?.draftAgentLimit ?? 8,
      frontlineCount: runtimeState.prediction?.frontlineCount ?? 12,
      coalitionTarget: runtimeState.prediction?.coalitionTarget ?? 4,
      arbitrationCount: runtimeState.prediction?.arbitrationCount ?? 3,
    }
  };
}

function loadNormalizedRuntimeState(roomId, room) {
  const raw = readJson(runtimeStatePath(roomId));
  const normalized = normalizeRuntimeState(roomId, raw, room);
  if (JSON.stringify(raw) !== JSON.stringify(normalized)) {
    writeJson(runtimeStatePath(roomId), normalized);
  }
  return normalized;
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

function agentSourcePath(agent) {
  return path.join(AGENT_SOURCES_ROOT, `${agent.id}.json`);
}

function loadSharedSourceLibrary() {
  return ensureJsonFile(SHARED_SOURCES_PATH, {
    updatedAt: null,
    entries: []
  });
}

function writeSharedSourceLibrary(payload) {
  writeJson(SHARED_SOURCES_PATH, {
    ...payload,
    updatedAt: new Date().toISOString()
  });
}

function loadSourceRegistry() {
  return ensureJsonFile(SOURCE_REGISTRY_PATH, {
    updatedAt: null,
    packs: []
  });
}

function freshnessPolicyDays(policy) {
  const table = {
    live: 2,
    high: 7,
    mixed: 30,
    slow: 180
  };
  return table[policy] || 30;
}

function sourceTimestamp(entry, fallbackUpdatedAt = null) {
  return entry?.retrievedAt || entry?.sharedAt || entry?.updatedAt || fallbackUpdatedAt || null;
}

function computeSourceFreshness(entry, qualityPolicy = {}, fallbackUpdatedAt = null) {
  const timestamp = sourceTimestamp(entry, fallbackUpdatedAt);
  if (!timestamp) {
    return {
      status: "undated",
      ageDays: null,
      timestamp: null
    };
  }

  const ageMs = Math.max(0, Date.now() - Date.parse(timestamp));
  const ageDays = Number((ageMs / 86_400_000).toFixed(1));
  const freshnessDays = freshnessPolicyDays(qualityPolicy.freshness || "mixed");
  const status =
    ageDays <= freshnessDays
      ? "fresh"
      : ageDays <= freshnessDays * 3
        ? "aging"
        : "stale";

  return {
    status,
    ageDays,
    timestamp
  };
}

function defaultAgentSourcePayload(agent, fallbackEntries = []) {
  return {
    agentId: agent.id,
    updatedAt: null,
    catalogRefs: agent.sourceProfile?.packRefs || [],
    qualityPolicy: {
      reliabilityFloor: agent.sourceProfile?.reliabilityFloor || "A-",
      diversityTarget: agent.sourceProfile?.diversityTarget || 3,
      freshness: agent.sourceProfile?.freshness || "mixed"
    },
    entries: fallbackEntries
  };
}

function loadAgentSourcePayload(agent, fallbackEntries = []) {
  const payload = ensureJsonFile(agentSourcePath(agent), defaultAgentSourcePayload(agent, fallbackEntries));
  payload.catalogRefs = Array.isArray(payload.catalogRefs) ? payload.catalogRefs : (agent.sourceProfile?.packRefs || []);
  payload.qualityPolicy = payload.qualityPolicy || defaultAgentSourcePayload(agent).qualityPolicy;
  payload.entries = (Array.isArray(payload.entries) ? payload.entries : fallbackEntries).map((entry) => ({
    ...entry,
    freshness: computeSourceFreshness(entry, payload.qualityPolicy, payload.updatedAt)
  }));
  return payload;
}

function dedupeSourceEntries(entries) {
  const seen = new Set();
  return entries.filter((entry) => {
    const key = [
      entry.url || "",
      entry.label || "",
      entry.type || "",
      entry.note || ""
    ].join("::").toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function syncSharedSources(entries, agentId) {
  if (!entries?.length) return;
  const sharedLibrary = loadSharedSourceLibrary();
  const nextEntries = entries
    .filter((entry) => entry && entry.label)
    .filter((entry) => ["shared", "room-artifact", "consensus", "public"].includes(entry.type));
  if (!nextEntries.length) return;
  sharedLibrary.entries = dedupeSourceEntries([
    ...sharedLibrary.entries,
    ...nextEntries.map((entry) => ({
      ...entry,
      sharedBy: agentId,
      sharedAt: new Date().toISOString()
    }))
  ]).slice(-200);
  writeSharedSourceLibrary(sharedLibrary);
}

function loadAgentState(agent) {
  const state = readJson(agentStatePath(agent));
  const sourceLibraryPayload = loadAgentSourcePayload(agent, state.sourceLibrary || []);
  state.sourceLibrary = sourceLibraryPayload.entries || [];
  state.sourceCatalogRefs = sourceLibraryPayload.catalogRefs || [];
  state.sourceQualityPolicy = sourceLibraryPayload.qualityPolicy || {};
  return state;
}

function writeAgentState(agent, state) {
  const sourcePayload = loadAgentSourcePayload(agent, state.sourceLibrary || []);
  writeJson(agentSourcePath(agent), {
    ...sourcePayload,
    updatedAt: new Date().toISOString(),
    entries: state.sourceLibrary || []
  });
  const persistedState = {
    ...state
  };
  delete persistedState.sourceCatalogRefs;
  delete persistedState.sourceQualityPolicy;
  writeJson(agentStatePath(agent), persistedState);
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

function resolveRoomDefinition(room, agents = loadAgents()) {
  if (!room.agentPool) {
    return room;
  }

  if (room.agentPool.mode !== "prediction-society") {
    return room;
  }

  const executableAgents = agents.filter((agent) => agent.kind === "agent");
  const swarmPrefix = room.agentPool.includePrefix || "swarm-";
  const swarmAgents = executableAgents.filter((agent) => agent.id.startsWith(swarmPrefix));
  const fallbackAgentIds = room.agentPool.fallbackAgentIds || [];
  const fallbackAgents = fallbackAgentIds
    .map((agentId) => getAgentById(agentId, agents))
    .filter(Boolean);
  const selected = (swarmAgents.length ? swarmAgents : fallbackAgents)
    .slice(0, room.agentPool.maxAgents || 100);

  return {
    ...room,
    population: selected.length,
    activeAgentIds: [
      room.agentPool.includeHuman === false ? null : "human",
      ...selected.map((agent) => agent.id),
      room.agentPool.includeSynthesis === false ? null : "synthesis"
    ].filter(Boolean)
  };
}

function predictionStatePath(roomId) {
  return path.join(DATA_ROOT, roomId, "prediction-state.json");
}

function predictionReplayPath(roomId) {
  return path.join(DATA_ROOT, roomId, "prediction-replay.json");
}

function socialEdgesPath(roomId) {
  return path.join(DATA_ROOT, roomId, "social-edges.json");
}

function authorityLogPath(roomId) {
  return path.join(DATA_ROOT, roomId, "authority-log.json");
}

function zeroEdgeVector() {
  return {
    trust: 0,
    complementarity: 0,
    rivalry: 0,
    influence: 0,
    coordination: 0
  };
}

function normalizeEdgeVector(vector, fallback = 0) {
  return EDGE_DIMENSIONS.reduce((acc, key) => {
    acc[key] = typeof vector?.[key] === "number" ? vector[key] : fallback;
    return acc;
  }, {});
}

function socialEdgeValue(edge, key) {
  const prior = edge?.prior?.[key] || 0;
  const learned = edge?.learnedDelta?.[key] || 0;
  const local = edge?.localDelta?.[key] || 0;
  return clamp01(prior + learned + local);
}

function socialPairSignature(sourceCluster, targetCluster) {
  return `${sourceCluster}:${targetCluster}`;
}

function defaultSocialEdgePrior(sourceAgent, targetAgent) {
  const sourceCluster = getAgentCluster(sourceAgent);
  const targetCluster = getAgentCluster(targetAgent);
  const prior = {
    trust: 0.42,
    complementarity: 0.36,
    rivalry: 0.18,
    influence: 0.3,
    coordination: 0.34
  };

  if (sourceCluster === targetCluster) {
    prior.trust += 0.12;
    prior.coordination += 0.18;
    prior.complementarity -= 0.04;
    prior.rivalry += 0.08;
  }

  const signature = socialPairSignature(sourceCluster, targetCluster);
  const pairAdjustments = {
    "planning:research": { trust: 0.16, complementarity: 0.24, coordination: 0.14, influence: 0.08 },
    "research:planning": { trust: 0.12, complementarity: 0.22, coordination: 0.1, influence: 0.1 },
    "planning:critique": { rivalry: 0.12, complementarity: 0.16, influence: 0.08, trust: 0.02 },
    "critique:planning": { rivalry: 0.18, complementarity: 0.14, influence: 0.1, trust: -0.02 },
    "planning:build": { trust: 0.08, complementarity: 0.22, coordination: 0.16, influence: 0.1 },
    "build:planning": { trust: 0.06, complementarity: 0.2, coordination: 0.18, influence: 0.08 },
    "research:critique": { trust: 0.08, complementarity: 0.18, rivalry: 0.08, influence: 0.06 },
    "critique:research": { trust: 0.04, complementarity: 0.16, rivalry: 0.12, influence: 0.04 },
    "market:planning": { trust: 0.06, complementarity: 0.18, coordination: 0.08, influence: 0.08 },
    "planning:market": { trust: 0.08, complementarity: 0.18, coordination: 0.1, influence: 0.06 },
    "market:build": { trust: 0.04, complementarity: 0.16, coordination: 0.1, influence: 0.04 },
    "build:market": { trust: 0.02, complementarity: 0.14, coordination: 0.08, influence: 0.02 },
    "market:critique": { rivalry: 0.1, complementarity: 0.14, trust: 0.02 },
    "critique:market": { rivalry: 0.12, complementarity: 0.12, trust: -0.02 },
    "research:build": { trust: 0.08, complementarity: 0.2, coordination: 0.1, influence: 0.04 },
    "build:research": { trust: 0.06, complementarity: 0.18, coordination: 0.1, influence: 0.02 }
  };

  const adjustment = pairAdjustments[signature];
  if (adjustment) {
    Object.entries(adjustment).forEach(([key, value]) => {
      prior[key] = (prior[key] || 0) + value;
    });
  }

  return EDGE_DIMENSIONS.reduce((acc, key) => {
    acc[key] = clamp01(prior[key] || 0);
    return acc;
  }, {});
}

function defaultSocialEdge(sourceAgent, targetAgent) {
  return {
    source: sourceAgent.id,
    target: targetAgent.id,
    prior: defaultSocialEdgePrior(sourceAgent, targetAgent),
    learnedDelta: zeroEdgeVector(),
    localDelta: zeroEdgeVector(),
    history: [],
    updatedAt: null
  };
}

function normalizeSocialEdgeEntry(entry, sourceAgent, targetAgent) {
  return {
    source: sourceAgent.id,
    target: targetAgent.id,
    prior: normalizeEdgeVector(entry?.prior, 0),
    learnedDelta: normalizeEdgeVector(entry?.learnedDelta, 0),
    localDelta: normalizeEdgeVector(entry?.localDelta, 0),
    history: Array.isArray(entry?.history) ? entry.history.slice(-12) : [],
    updatedAt: entry?.updatedAt || null
  };
}

function activeSocialAgentIds(room, agents = loadAgents()) {
  return (room.activeAgentIds || [])
    .map((agentId) => getAgentById(agentId, agents))
    .filter((agent) => agent && agent.kind === "agent")
    .map((agent) => agent.id);
}

function sparseSocialTargetsForAgent(agentIds, sourceId, agents) {
  const sourceAgent = getAgentById(sourceId, agents);
  const cluster = getAgentCluster(sourceAgent);
  const sameClusterIds = agentIds.filter((agentId) => {
    if (agentId === sourceId) return false;
    return getAgentCluster(getAgentById(agentId, agents)) === cluster;
  });
  const otherClusterIds = agentIds.filter((agentId) => {
    if (agentId === sourceId) return false;
    return getAgentCluster(getAgentById(agentId, agents)) !== cluster;
  });
  const sourceIndex = agentIds.indexOf(sourceId);
  const ringTargets = [
    agentIds[(sourceIndex + 1 + agentIds.length) % agentIds.length],
    agentIds[(sourceIndex + 7 + agentIds.length) % agentIds.length],
    agentIds[(sourceIndex + 17 + agentIds.length) % agentIds.length]
  ];
  const sameClusterTargets = sameClusterIds.slice(0, 2);
  const bridgeTargets = otherClusterIds.slice(0, 3);
  return Array.from(new Set([...ringTargets, ...sameClusterTargets, ...bridgeTargets])).filter((targetId) => targetId && targetId !== sourceId);
}

function normalizeSocialEdgesPayload(roomId, room, payload, agents = loadAgents()) {
  const agentIds = activeSocialAgentIds(room, agents);
  const edgeMap = new Map(
    (payload?.edges || [])
      .filter((edge) => edge?.source && edge?.target)
      .map((edge) => [`${edge.source}=>${edge.target}`, edge])
  );

  const edges = [];
  const useSparseGraph = room.module === "ultimate_prediction" || agentIds.length > 160;
  agentIds.forEach((sourceId) => {
    const targetIds = useSparseGraph
      ? sparseSocialTargetsForAgent(agentIds, sourceId, agents)
      : agentIds.filter((targetId) => targetId !== sourceId);
    targetIds.forEach((targetId) => {
      const sourceAgent = getAgentById(sourceId, agents);
      const targetAgent = getAgentById(targetId, agents);
      if (!sourceAgent || !targetAgent) return;
      const key = `${sourceId}=>${targetId}`;
      const existing = edgeMap.get(key);
      edges.push(
        existing
          ? normalizeSocialEdgeEntry(existing, sourceAgent, targetAgent)
          : defaultSocialEdge(sourceAgent, targetAgent)
      );
    });
  });

  return {
    roomId,
    updatedAt: payload?.updatedAt || null,
    edges
  };
}

function loadSocialEdges(roomId, room, agents = loadAgents()) {
  const payload = ensureJsonFile(socialEdgesPath(roomId), {
    roomId,
    updatedAt: null,
    edges: []
  });
  const normalized = normalizeSocialEdgesPayload(roomId, room, payload, agents);
  if (JSON.stringify(payload) !== JSON.stringify(normalized)) {
    writeJson(socialEdgesPath(roomId), normalized);
  }
  return normalized;
}

function writeSocialEdges(roomId, room, payload) {
  writeJson(socialEdgesPath(roomId), {
    ...normalizeSocialEdgesPayload(roomId, room, payload),
    updatedAt: new Date().toISOString()
  });
}

function defaultPredictionState(room) {
  return {
    question: room.prompt || "",
    updatedAt: null,
    phase: "scouting",
    population: Math.max(0, (room.activeAgentIds || []).filter((agentId) => !["human", "synthesis"].includes(agentId)).length),
    scoutCount: 0,
    frontlineAgentIds: [],
    arbitratorIds: [],
    materials: [],
    coalitions: [],
    interactions: [],
    counterfactualBranches: [],
    beliefShifts: [],
    timelineSnapshots: [],
    phaseHistory: [],
    finalVerdict: null
  };
}

function loadPredictionReplay(roomId) {
  return ensureJsonFile(predictionReplayPath(roomId), {
    roomId,
    updatedAt: null,
    snapshots: []
  });
}

function appendPredictionReplaySnapshot(roomId, snapshot) {
  const replay = loadPredictionReplay(roomId);
  replay.snapshots = [...(replay.snapshots || []), snapshot].slice(-24);
  replay.updatedAt = new Date().toISOString();
  writeJson(predictionReplayPath(roomId), replay);
  return replay;
}

function loadAuthorityLog(roomId) {
  return ensureJsonFile(authorityLogPath(roomId), {
    roomId,
    updatedAt: null,
    entries: []
  });
}

function appendAuthorityLog(roomId, entry) {
  const log = loadAuthorityLog(roomId);
  log.entries = [
    ...(log.entries || []),
    {
      id: `${roomId}-authority-${Date.now()}`,
      createdAt: new Date().toISOString(),
      ...entry
    }
  ].slice(-40);
  log.updatedAt = new Date().toISOString();
  writeJson(authorityLogPath(roomId), log);
  return log;
}

function summarizeText(text, maxLength = 120) {
  return String(text || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function computeAuthorityConcentration(authorityLog) {
  const entries = authorityLog?.entries || [];
  if (!entries.length) {
    return {
      leader: null,
      ratio: 0,
      total: 0
    };
  }
  const counts = entries.reduce((acc, entry) => {
    const key = entry.actor || "system";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return {
    leader: ranked[0][0],
    ratio: ranked[0][1] / Math.max(1, entries.length),
    total: entries.length
  };
}

function hashString(text) {
  let hash = 2166136261;
  for (const char of String(text || "")) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

function loadPredictionState(roomId, room) {
  if (room.module !== "ultimate_prediction") {
    return null;
  }
  const predictionState = ensureJsonFile(predictionStatePath(roomId), defaultPredictionState(room));
  predictionState.population = Math.max(
    predictionState.population || 0,
    (room.activeAgentIds || []).filter((agentId) => !["human", "synthesis"].includes(agentId)).length
  );
  predictionState.counterfactualBranches = predictionState.counterfactualBranches || [];
  predictionState.beliefShifts = predictionState.beliefShifts || [];
  predictionState.timelineSnapshots = predictionState.timelineSnapshots || [];
  return predictionState;
}

function loadRoom(roomId) {
  const roomDir = path.join(DATA_ROOT, roomId);
  const room = resolveRoomDefinition(readJson(path.join(roomDir, "room.json")));
  const agents = loadAgents();
  const finalAnswer = fs.existsSync(path.join(roomDir, "final-answer.json"))
    ? readJson(path.join(roomDir, "final-answer.json"))
    : null;
  const rawClaimGraph = loadClaimGraph(roomId, room, finalAnswer);
  const authorityLog = loadAuthorityLog(roomId);
  const sourceHealth = buildRoomSourceHealth(room, agents);
  const enrichedClaimGraph = enrichClaimGraph(roomId, room, rawClaimGraph);
  return {
    room,
    events: readJson(path.join(roomDir, "events.json")),
    graphState: readJson(path.join(roomDir, "graph-state.json")),
    socialEdges: loadSocialEdges(roomId, room, agents),
    sourceHealth,
    runtimeState: loadNormalizedRuntimeState(roomId, room),
    predictionState: loadPredictionState(roomId, room),
    predictionReplay: room.module === "ultimate_prediction" ? loadPredictionReplay(roomId) : null,
    authorityLog,
    finalAnswer,
    claimGraph: enrichedClaimGraph,
    diagnostics: buildRoomDiagnostics(room, authorityLog, enrichedClaimGraph, sourceHealth),
  };
}

function summarizeRooms() {
  return listRoomIds()
    .map((roomId) => {
      const room = resolveRoomDefinition(readJson(roomPath(roomId)));
      if (room.hidden) return null;
      const events = readJson(path.join(DATA_ROOT, roomId, "events.json"));
      const runtimeState = loadRuntimeState(roomId);
      const totalTokens = events.reduce((sum, event) => sum + (event.usage?.total_tokens || 0), 0);
      return {
        ...room,
        eventCount: events.length,
        lastEventAt: events.length ? events[events.length - 1].createdAt : null,
        totalTokens,
        queueDepth: runtimeState.scheduler.queue.length,
        schedulerEnabled: runtimeState.scheduler.enabled
      };
    })
    .filter(Boolean);
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

function claimGraphPath(roomId) {
  return path.join(DATA_ROOT, roomId, "claim-graph.json");
}

function slugifyClaimId(text, fallbackIndex = 1) {
  const ascii = String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  return ascii || `claim-${fallbackIndex}`;
}

function normalizeClaimText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, "")
    .slice(0, 160);
}

function listConfidenceValue(value) {
  if (typeof value === "number") return value;
  const normalized = String(value || "").trim();
  const table = {
    "高": 0.86,
    "中高": 0.74,
    "中": 0.58,
    "中低": 0.42,
    "低": 0.24
  };
  return table[normalized] || 0.5;
}

function uniqueStrings(values, limit = 8) {
  return Array.from(new Set((values || []).filter(Boolean).map((value) => String(value)))).slice(0, limit);
}

function normalizeClaimEntry(entry, index = 1) {
  const claimId = entry?.claim_id || entry?.id || slugifyClaimId(entry?.text, index);
  return {
    claim_id: claimId,
    text: entry?.text || entry?.summary || "",
    status: entry?.status || "supported",
    confidence: entry?.confidence || "中",
    evidence: Array.isArray(entry?.evidence) ? entry.evidence.filter(Boolean).slice(0, 4) : [],
    counterevidence: Array.isArray(entry?.counterevidence) ? entry.counterevidence.filter(Boolean).slice(0, 3) : [],
    source_refs: Array.isArray(entry?.source_refs) ? entry.source_refs.filter(Boolean).slice(0, 5) : [],
    supporting_agents: Array.isArray(entry?.supporting_agents) ? entry.supporting_agents.filter(Boolean).slice(0, 8) : [],
    opposing_agents: Array.isArray(entry?.opposing_agents) ? entry.opposing_agents.filter(Boolean).slice(0, 8) : [],
    update_triggers: Array.isArray(entry?.update_triggers) ? entry.update_triggers.filter(Boolean).slice(0, 4) : [],
    importance: typeof entry?.importance === "number" ? entry.importance : Math.max(0.4, 1 - (index * 0.08))
  };
}

function claimMatchKey(entry) {
  return `${normalizeClaimText(entry?.text)}::${entry?.claim_id || ""}`;
}

function findMatchingClaim(existingClaims, incomingClaim) {
  const normalizedIncoming = normalizeClaimText(incomingClaim?.text);
  return existingClaims.find((candidate) => {
    if (candidate.claim_id === incomingClaim.claim_id) return true;
    return normalizeClaimText(candidate.text) === normalizedIncoming && normalizedIncoming.length >= 12;
  }) || null;
}

function mergeClaimEntries(existingClaim, incomingClaim, generatedAt) {
  const mergedConfidence = listConfidenceValue(incomingClaim.confidence) >= listConfidenceValue(existingClaim.confidence)
    ? incomingClaim.confidence
    : existingClaim.confidence;

  const merged = {
    ...existingClaim,
    claim_id: existingClaim.claim_id || incomingClaim.claim_id,
    text: incomingClaim.text || existingClaim.text,
    status: incomingClaim.status || existingClaim.status,
    confidence: mergedConfidence,
    evidence: uniqueStrings([...(existingClaim.evidence || []), ...(incomingClaim.evidence || [])], 6),
    counterevidence: uniqueStrings([...(existingClaim.counterevidence || []), ...(incomingClaim.counterevidence || [])], 5),
    source_refs: uniqueStrings([...(existingClaim.source_refs || []), ...(incomingClaim.source_refs || [])], 8),
    supporting_agents: uniqueStrings([...(existingClaim.supporting_agents || []), ...(incomingClaim.supporting_agents || [])], 12),
    opposing_agents: uniqueStrings([...(existingClaim.opposing_agents || []), ...(incomingClaim.opposing_agents || [])], 12),
    update_triggers: uniqueStrings([...(existingClaim.update_triggers || []), ...(incomingClaim.update_triggers || [])], 6),
    importance: Math.max(existingClaim.importance || 0, incomingClaim.importance || 0),
    lastUpdatedAt: generatedAt,
    revisions: [
      ...(existingClaim.revisions || []),
      {
        at: generatedAt,
        status: incomingClaim.status || existingClaim.status,
        confidence: incomingClaim.confidence || existingClaim.confidence,
        text: incomingClaim.text || existingClaim.text
      }
    ].slice(-10)
  };

  return merged;
}

function mergeClaimGraphs(existingGraph, incomingGraph) {
  if (!existingGraph) return incomingGraph;
  if (!incomingGraph) return existingGraph;

  const generatedAt = incomingGraph.generatedAt || new Date().toISOString();
  const existingClaims = (existingGraph.claims || []).map((claim, index) => normalizeClaimEntry(claim, index + 1));
  const mergedClaims = [];
  const touched = new Set();

  (incomingGraph.claims || []).forEach((rawClaim, index) => {
    const incomingClaim = normalizeClaimEntry(rawClaim, index + 1);
    const matched = findMatchingClaim(existingClaims, incomingClaim);
    if (matched) {
      touched.add(matched.claim_id);
      mergedClaims.push(mergeClaimEntries(matched, incomingClaim, generatedAt));
    } else {
      mergedClaims.push({
        ...incomingClaim,
        lastUpdatedAt: generatedAt,
        revisions: [
          {
            at: generatedAt,
            status: incomingClaim.status,
            confidence: incomingClaim.confidence,
            text: incomingClaim.text
          }
        ]
      });
    }
  });

  existingClaims.forEach((claim) => {
    if (touched.has(claim.claim_id)) return;
    mergedClaims.push({
      ...claim,
      status: claim.status === "invalidated" ? "invalidated" : "stale",
      revisions: [
        ...(claim.revisions || []),
        {
          at: generatedAt,
          status: claim.status === "invalidated" ? "invalidated" : "stale",
          confidence: claim.confidence,
          text: claim.text
        }
      ].slice(-10)
    });
  });

  const relationMap = new Map();
  [...(existingGraph.relations || []), ...(incomingGraph.relations || [])].forEach((relation) => {
    if (!relation?.source || !relation?.target || !relation?.type) return;
    relationMap.set(`${relation.source}->${relation.target}:${relation.type}`, relation);
  });

  return {
    roomId: incomingGraph.roomId || existingGraph.roomId,
    artifactType: incomingGraph.artifactType || existingGraph.artifactType,
    generatedAt,
    claims: mergedClaims
      .sort((a, b) => (b.importance || 0) - (a.importance || 0))
      .slice(0, 18),
    relations: Array.from(relationMap.values()).slice(0, 36),
    revisions: [
      ...(existingGraph.revisions || []),
      {
        at: generatedAt,
        claimCount: (incomingGraph.claims || []).length,
        relationCount: (incomingGraph.relations || []).length
      }
    ].slice(-12)
  };
}

function deriveClaimGraphFromArtifact(room, artifact) {
  if (!artifact) return null;
  const rawClaims = [];
  const sourceRefs = Array.isArray(artifact.source_highlights) ? artifact.source_highlights.slice(0, 4) : [];
  const roomSourceRefs = buildRoomSourceIndex(room, loadAgents())
    .sort((a, b) => {
      const score = (entry) => {
        const freshness = entry?.freshness?.status || "undated";
        if (freshness === "fresh") return 3;
        if (freshness === "aging") return 2;
        if (freshness === "undated") return 1;
        return 0;
      };
      return score(b) - score(a);
    })
    .slice(0, 6)
    .map((entry) => entry.label);
  const preferredSourceRefs = roomSourceRefs.length ? roomSourceRefs : sourceRefs;
  const dissentItems = Array.isArray(artifact.dissent) ? artifact.dissent : [];

  if (Array.isArray(artifact.claim_graph?.claims) && artifact.claim_graph.claims.length) {
    return {
      roomId: room.id,
      artifactType: room.module === "ultimate_prediction" ? "prediction_verdict" : "answer_bundle",
      generatedAt: artifact.generatedAt || artifact.generated_at || new Date().toISOString(),
      claims: artifact.claim_graph.claims.map((entry, index) => normalizeClaimEntry(entry, index + 1)),
      relations: (artifact.claim_graph.relations || []).filter((entry) => entry?.source && entry?.target && entry?.type)
    };
  }

  (artifact.key_claims || []).forEach((text, index) => {
    rawClaims.push({
      text,
      status: "supported",
      confidence: typeof artifact.confidence === "object" ? artifact.confidence.level || "中" : artifact.confidence || "中",
      evidence: sourceRefs.slice(0, 2),
      counterevidence: dissentItems.slice(0, 1).map((item) => item.point || item.detail || item),
      source_refs: preferredSourceRefs,
      update_triggers: artifact.update_triggers || []
    });
  });

  if (!rawClaims.length && Array.isArray(artifact.answer_sections)) {
    artifact.answer_sections.slice(0, 5).forEach((section) => {
      rawClaims.push({
        text: section.content || section.title || "",
        status: "supported",
        confidence: typeof artifact.confidence === "object" ? artifact.confidence.level || "中" : artifact.confidence || "中",
        evidence: sourceRefs.slice(0, 2),
        counterevidence: dissentItems.slice(0, 1).map((item) => item.point || item.detail || item),
        source_refs: preferredSourceRefs,
        update_triggers: artifact.update_triggers || []
      });
    });
  }

  if (!rawClaims.length && artifact.best_answer) {
    rawClaims.push({
      text: artifact.best_answer,
      status: "supported",
      confidence: artifact.confidence || "中",
      evidence: sourceRefs.slice(0, 2),
      counterevidence: Array.isArray(artifact.minority_report) ? artifact.minority_report.slice(0, 2) : [],
      source_refs: preferredSourceRefs,
      update_triggers: artifact.update_triggers || []
    });
  }

  dissentItems.slice(0, 4).forEach((item, index) => {
    rawClaims.push({
      claim_id: item?.claim_id || `dissent-${index + 1}`,
      text: item?.point || item?.detail || item,
      status: "disputed",
      confidence: "中低",
      evidence: [],
      counterevidence: [item?.detail || item?.point || item],
      source_refs: preferredSourceRefs,
      update_triggers: artifact.update_triggers || [],
      importance: 0.48 - (index * 0.05)
    });
  });

  const claims = rawClaims.map((entry, index) => normalizeClaimEntry(entry, index + 1));
  const primarySupportedClaim = claims.find((entry) => entry.status !== "disputed") || claims[0];
  const relations = claims
    .filter((entry) => entry.claim_id !== primarySupportedClaim?.claim_id)
    .map((entry) => ({
      source: primarySupportedClaim?.claim_id || claims[0]?.claim_id,
      target: entry.claim_id,
      type: entry.status === "disputed" ? "disputes" : "supports"
    }));

  return {
    roomId: room.id,
    artifactType: room.module === "ultimate_prediction" ? "prediction_verdict" : "answer_bundle",
    generatedAt: artifact.generatedAt || artifact.generated_at || new Date().toISOString(),
    claims,
    relations
  };
}

function loadClaimGraph(roomId, room, finalAnswer = null) {
  const filePath = claimGraphPath(roomId);
  if (fs.existsSync(filePath)) {
    const payload = readJson(filePath);
    if (Array.isArray(payload?.claims)) {
      return {
        ...payload,
        claims: payload.claims.map((entry, index) => normalizeClaimEntry(entry, index + 1)),
        relations: Array.isArray(payload.relations) ? payload.relations : []
      };
    }
  }

  const fallback = deriveClaimGraphFromArtifact(room, finalAnswer);
  if (fallback) {
    writeJson(filePath, fallback);
  }
  return fallback;
}

function writeClaimGraph(roomId, payload) {
  writeJson(claimGraphPath(roomId), payload);
}

function persistClaimGraph(roomId, room, incomingGraph) {
  if (!incomingGraph) return null;
  const existing = fs.existsSync(claimGraphPath(roomId))
    ? readJson(claimGraphPath(roomId))
    : null;
  const merged = mergeClaimGraphs(existing, incomingGraph);
  writeClaimGraph(roomId, merged);
  const statuses = {};
  (merged.claims || []).forEach((claim) => {
    statuses[claim.status] = (statuses[claim.status] || 0) + 1;
  });
  appendAuthorityLog(roomId, {
    actor: "synthesis",
    action: "claim-merge",
    scope: room.module,
    summary: `更新了 ${merged.claims?.length || 0} 个 claims，当前状态分布：${Object.entries(statuses).map(([key, value]) => `${key}:${value}`).join("、")}`,
    affectedClaims: (incomingGraph.claims || []).map((claim) => claim.claim_id || claim.text).slice(0, 8),
    metadata: {
      artifactType: incomingGraph.artifactType || room.module,
      revisionCount: merged.revisions?.length || 0
    }
  });
  return merged;
}

function roomSourceEntries(room, agents = loadAgents()) {
  const sharedEntries = loadSharedSourceLibrary().entries || [];
  const agentEntries = activeSocialAgentIds(room, agents)
    .map((agentId) => getAgentById(agentId, agents))
    .filter(Boolean)
    .flatMap((agent) => {
      const payload = loadAgentSourcePayload(agent, []);
      return (payload.entries || []).map((entry) => ({
        ...entry,
        owner: agent.id
      }));
    });
  return [...sharedEntries, ...agentEntries];
}

function buildRoomSourceIndex(room, agents = loadAgents()) {
  return roomSourceEntries(room, agents).map((entry) => ({
    ...entry,
    normalizedLabel: normalizeClaimText(entry.label || ""),
    normalizedNote: normalizeClaimText(entry.note || "")
  }));
}

function resolveClaimSourceHealth(claim, sourceIndex) {
  const refs = (claim.source_refs || []).map((value) => String(value));
  const matched = [];

  refs.forEach((ref) => {
    const normalizedRef = normalizeClaimText(ref);
    if (!normalizedRef) return;
    const hits = sourceIndex.filter((entry) => {
      if (!entry.normalizedLabel && !entry.normalizedNote) return false;
      return entry.normalizedLabel.includes(normalizedRef)
        || normalizedRef.includes(entry.normalizedLabel)
        || entry.normalizedNote.includes(normalizedRef.slice(0, 60));
    }).slice(0, 3);
    matched.push(...hits);
  });

  const deduped = dedupeSourceEntries(matched);
  const counts = {
    fresh: 0,
    aging: 0,
    stale: 0,
    undated: 0
  };
  deduped.forEach((entry) => {
    const status = entry?.freshness?.status || "undated";
    if (counts[status] != null) counts[status] += 1;
  });

  const total = deduped.length;
  const provenanceScore = total
    ? Number((((counts.fresh * 1) + (counts.aging * 0.6) + (counts.undated * 0.3)) / total).toFixed(3))
    : 0;
  const freshnessStatus =
    counts.fresh > 0
      ? "fresh"
      : counts.aging > 0
        ? "aging"
        : counts.stale > 0
          ? "stale"
          : refs.length
            ? "unresolved"
            : "unlinked";

  return {
    freshnessStatus,
    provenanceScore,
    matchedSources: deduped.slice(0, 4).map((entry) => ({
      label: entry.label,
      freshness: entry.freshness?.status || "undated",
      owner: entry.owner || entry.sharedBy || "shared"
    })),
    counts
  };
}

function enrichClaimGraph(roomId, room, claimGraph) {
  if (!claimGraph?.claims?.length) return claimGraph;
  const agents = loadAgents();
  const sourceIndex = buildRoomSourceIndex(room, agents);
  return {
    ...claimGraph,
    claims: claimGraph.claims.map((claim, index) => ({
      ...(() => {
        const normalizedClaim = normalizeClaimEntry(claim, index + 1);
        const provenance = resolveClaimSourceHealth(normalizedClaim, sourceIndex);
        const derivedStatus =
          normalizedClaim.status === "invalidated"
            ? "invalidated"
            : provenance.freshnessStatus === "stale"
              ? "stale"
              : ["unresolved", "unlinked"].includes(provenance.freshnessStatus)
                ? "needs_review"
                : normalizedClaim.status;
        return {
          ...normalizedClaim,
          provenance,
          derivedStatus,
          needsReview: ["needs_review", "stale"].includes(derivedStatus)
        };
      })()
    }))
  };
}

function buildRoomSourceHealth(room, agents = loadAgents()) {
  const sourceIndex = buildRoomSourceIndex(room, agents);
  const counts = {
    fresh: 0,
    aging: 0,
    stale: 0,
    undated: 0
  };
  sourceIndex.forEach((entry) => {
    const status = entry?.freshness?.status || "undated";
    if (counts[status] != null) counts[status] += 1;
  });
  return {
    total: sourceIndex.length,
    counts
  };
}

function buildRoomDiagnostics(room, authorityLog, claimGraph, sourceHealth) {
  const authority = computeAuthorityConcentration(authorityLog);
  const claimCounts = (claimGraph?.claims || []).reduce((acc, claim) => {
    const status = claim.derivedStatus || claim.status || "supported";
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});
  const unresolvedClaims = (claimGraph?.claims || []).filter(
    (claim) => ["unresolved", "stale", "undated", "unlinked"].includes(claim?.provenance?.freshnessStatus)
  ).length;
  const warnings = [];

  if (authority.ratio >= 0.65 && authority.total >= 4) {
    warnings.push(`治理动作过度集中在 ${authority.leader}`);
  }
  if ((sourceHealth?.counts?.aging || 0) + (sourceHealth?.counts?.stale || 0) >= 5) {
    warnings.push("来源老化数量偏高，需补新来源");
  }
  if (unresolvedClaims >= 2) {
    warnings.push("部分 claims 仍缺少可挂接来源");
  }
  if ((claimCounts.disputed || 0) === 0 && (claimGraph?.claims || []).length >= 5) {
    warnings.push("当前知识骨架缺少显式 disputed claims");
  }

  return {
    authority,
    claimCounts,
    unresolvedClaims,
    warnings
  };
}

function claimsNeedingReview(claimGraph) {
  return (claimGraph?.claims || []).filter((claim) => claim.needsReview);
}

function selectClaimReviewAgents(roomId, snapshot, limit = 2) {
  const preferredClusters = new Set(["research", "critique", "planning"]);
  const candidates = snapshot.executableAgents.filter((agent) => preferredClusters.has(getAgentCluster(agent)));
  const ranked = rankQueueCandidates(roomId, candidates, snapshot, "claim-review");
  return pickDiverseAgents(ranked, limit).map((entry) => entry.agent.id);
}

function writeRuntimeState(roomId, value) {
  const room = readJson(roomPath(roomId));
  writeJson(runtimeStatePath(roomId), normalizeRuntimeState(roomId, value, room));
}

function loadRuntimeState(roomId) {
  return loadNormalizedRuntimeState(roomId);
}

function reconcileRuntimeState(roomId) {
  const runtimeState = loadRuntimeState(roomId);
  const now = Date.now();
  runtimeState.scheduler.activeRuns = (runtimeState.scheduler.activeRuns || []).filter((entry) => {
    const started = Date.parse(entry.startedAt || "");
    if (!Number.isFinite(started)) return false;
    return now - started < STALE_RUN_MS;
  });
  decayQueueEntries(runtimeState);
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

function payloadSocialEdgesForRoom(room, socialEdges) {
  if (room.module !== "ultimate_prediction") {
    return socialEdges;
  }

  const predictionState = loadPredictionState(room.id, room);
  const spotlightIds = new Set([
    ...(predictionState.participantAgentIds || []),
    ...(predictionState.frontlineAgentIds || []),
    ...(predictionState.arbitratorIds || [])
  ]);
  const filtered = (socialEdges?.edges || socialEdges || []).filter((edge) => spotlightIds.has(edge.source) || spotlightIds.has(edge.target));
  return {
    roomId: room.id,
    updatedAt: socialEdges?.updatedAt || null,
    edges: filtered.slice(0, 600)
  };
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
  const runtimeState = loadRuntimeState(roomId);

  const event = {
    id: payload.id || `${roomId}-${Date.now()}`,
    stage: payload.stage || "intervention",
    speaker: payload.speaker || "human",
    target: payload.target || null,
    title: payload.title || "Human intervention",
    body: payload.body || "",
    sources: payload.sources || ["live room intervention"],
    createdAt: new Date().toISOString(),
    usage: payload.usage || null,
    visibility: payload.visibility || (["source_ingestion", "system"].includes(payload.stage) ? "system" : "public")
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

  graphState.synthesis = graphState.synthesis || {
    direction: "",
    consensus: [],
    tensions: [],
    nextActions: []
  };

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
  updateSocialEdgesFromEvent(roomId, event);
  writeRuntimeState(roomId, runtimeState);
  return event;
}

function adjustLearnedEdgeDelta(edge, dimension, delta) {
  edge.learnedDelta = edge.learnedDelta || zeroEdgeVector();
  edge.learnedDelta[dimension] = Number(
    Math.max(-0.35, Math.min(0.35, (edge.learnedDelta[dimension] || 0) + delta)).toFixed(4)
  );
}

function applySocialEdgeLearning(edge, event, updates) {
  Object.entries(updates).forEach(([dimension, delta]) => {
    adjustLearnedEdgeDelta(edge, dimension, delta);
  });
  edge.updatedAt = new Date().toISOString();
  edge.history = [
    ...(edge.history || []),
    {
      at: edge.updatedAt,
      stage: event.stage,
      title: event.title,
      source: event.speaker,
      target: event.target,
      delta: updates
    }
  ].slice(-12);
}

function socialLearningProfileForStage(stage) {
  const profiles = {
    planning: {
      forward: { coordination: 0.024, influence: 0.018, trust: 0.01 },
      reciprocal: { trust: 0.014, complementarity: 0.018, coordination: 0.012 }
    },
    evidence: {
      forward: { trust: 0.024, complementarity: 0.02, influence: 0.018 },
      reciprocal: { trust: 0.018, complementarity: 0.016, coordination: 0.008 }
    },
    analysis: {
      forward: { trust: 0.016, complementarity: 0.018, influence: 0.014 },
      reciprocal: { trust: 0.012, complementarity: 0.014, coordination: 0.008 }
    },
    implementation: {
      forward: { coordination: 0.028, complementarity: 0.024, trust: 0.012 },
      reciprocal: { coordination: 0.016, complementarity: 0.018, trust: 0.01 }
    },
    convergence: {
      forward: { trust: 0.028, coordination: 0.018, influence: 0.014 },
      reciprocal: { trust: 0.018, coordination: 0.014, complementarity: 0.008 }
    },
    challenge: {
      forward: { rivalry: 0.03, influence: 0.018, complementarity: 0.006, trust: -0.006 },
      reciprocal: { rivalry: 0.024, influence: 0.014, trust: -0.004 }
    }
  };
  return profiles[stage] || null;
}

function updateSocialEdgesFromEvent(roomId, event) {
  if (!event?.speaker || !event?.target) return;
  const agents = loadAgents();
  const sourceAgent = getAgentById(event.speaker, agents);
  const targetAgent = getAgentById(event.target, agents);
  if (!sourceAgent || !targetAgent) return;
  if (sourceAgent.kind !== "agent" || targetAgent.kind !== "agent") return;

  const { room, socialEdges } = loadRoom(roomId);
  const payload = socialEdges || loadSocialEdges(roomId, room, agents);
  const forward = payload.edges.find((edge) => edge.source === sourceAgent.id && edge.target === targetAgent.id);
  const reciprocal = payload.edges.find((edge) => edge.source === targetAgent.id && edge.target === sourceAgent.id);
  const learning = socialLearningProfileForStage(event.stage);
  if (!learning) return;

  if (forward) {
    applySocialEdgeLearning(forward, event, learning.forward);
  }
  if (reciprocal) {
    applySocialEdgeLearning(reciprocal, event, learning.reciprocal);
  }

  writeSocialEdges(roomId, room, payload);
}

function announceGlobalOnce(roomId, key, title, body) {
  const runtimeState = loadRuntimeState(roomId);
  const onceKeys = runtimeState.announcements?.onceKeys || [];
  if (onceKeys.includes(key)) {
    return false;
  }

  runtimeState.announcements = {
    onceKeys: [...onceKeys, key],
    lastGlobalNotice: {
      key,
      title,
      body,
      createdAt: new Date().toISOString()
    }
  };

  if (key === GLOBAL_ANNOUNCEMENT_KEYS.tokenBudgetExhausted) {
    runtimeState.scheduler.enabled = false;
  }

  writeRuntimeState(roomId, runtimeState);
  appendEvent(roomId, {
    speaker: "synthesis",
    target: "human",
    stage: "system",
    title,
    body,
    sources: ["global-room-status"],
    visibility: "system"
  });
  return true;
}

function ensureRoomHasBudget(roomId) {
  const runtimeState = loadRuntimeState(roomId);
  if (runtimeState.budgets.tokenBudgetRemaining > 0) {
    return runtimeState;
  }

  announceGlobalOnce(
    roomId,
    GLOBAL_ANNOUNCEMENT_KEYS.tokenBudgetExhausted,
    "房间预算耗尽",
    "当前房间 token 预算已耗尽，自动调度已暂停。补充预算后再继续运行。"
  );
  throw new Error(`Room ${roomId} has exhausted its token budget`);
}

function restoreRoomForHumanIntervention(roomId, options = {}) {
  const { room } = loadRoom(roomId);
  const runtimeState = loadRuntimeState(roomId);
  let changed = false;

  if (runtimeState.budgets.tokenBudgetRemaining <= 0) {
    runtimeState.budgets.tokenBudgetRemaining = runtimeState.budgets.tokenBudgetTotal || 180000;
    changed = true;
  }

  if (
    runtimeState.announcements?.onceKeys?.includes(GLOBAL_ANNOUNCEMENT_KEYS.tokenBudgetExhausted)
    || runtimeState.announcements?.lastGlobalNotice?.key === GLOBAL_ANNOUNCEMENT_KEYS.tokenBudgetExhausted
  ) {
    runtimeState.announcements = {
      onceKeys: (runtimeState.announcements?.onceKeys || []).filter((key) => key !== GLOBAL_ANNOUNCEMENT_KEYS.tokenBudgetExhausted),
      lastGlobalNotice:
        runtimeState.announcements?.lastGlobalNotice?.key === GLOBAL_ANNOUNCEMENT_KEYS.tokenBudgetExhausted
          ? null
          : runtimeState.announcements?.lastGlobalNotice || null
    };
    changed = true;
  }

  if (options.enableScheduler && !runtimeState.scheduler.enabled) {
    runtimeState.scheduler.enabled = true;
    changed = true;
  }

  if (!changed) {
    return false;
  }

  writeRuntimeState(roomId, runtimeState);
  appendAuthorityLog(roomId, {
    actor: "human",
    action: "room-reactivated",
    scope: room.module,
    summary: "用户新一轮提问后，系统恢复了预算或调度状态。",
    affectedClaims: [],
    metadata: {
      schedulerEnabled: runtimeState.scheduler.enabled,
      tokenBudgetRemaining: runtimeState.budgets.tokenBudgetRemaining
    }
  });
  return true;
}

function getAgentById(agentId, agents = loadAgents()) {
  return agents.find((entry) => entry.id === agentId);
}

function getAgentCluster(agent) {
  if (!agent) return "unknown";
  if (agent.cluster) return agent.cluster;
  if (/Planner/i.test(agent.role)) return "planning";
  if (/Research/i.test(agent.role)) return "research";
  if (/Market/i.test(agent.role)) return "market";
  if (/Critic/i.test(agent.role)) return "critique";
  if (/Builder/i.test(agent.role)) return "build";
  if (agent.kind === "human") return "human";
  if (agent.kind === "artifact") return "artifact";
  return "general";
}

function sortQueue(queue) {
  return queue.sort(
    (a, b) => (b.priority || 0) - (a.priority || 0) || Date.parse(a.enqueuedAt) - Date.parse(b.enqueuedAt)
  );
}

function timeDecayWeight(timestamp, halfLifeMs = 12 * 60_000) {
  const ageMs = Math.max(0, Date.now() - Date.parse(timestamp || ""));
  if (!Number.isFinite(ageMs)) return 0.2;
  return Math.pow(0.5, ageMs / halfLifeMs);
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function splitInterestTerms(values) {
  return Array.from(
    new Set(
      (values || [])
        .filter(Boolean)
        .flatMap((value) =>
          String(value)
            .split(/[,\s/、，；;：:()（）]+/)
            .map((item) => item.trim().toLowerCase())
            .filter((item) => item.length >= 2)
        )
    )
  );
}

function decayQueueEntries(runtimeState) {
  const nowIso = new Date().toISOString();
  const decay = runtimeState.scheduler.queueDecay || 0.94;
  const floor = runtimeState.scheduler.priorityFloor || 0.12;
  runtimeState.scheduler.queue = (runtimeState.scheduler.queue || []).map((entry) => {
    const lastDecayAt = Date.parse(entry.lastDecayAt || entry.enqueuedAt || "");
    const elapsed = Date.now() - lastDecayAt;
    const steps = Math.max(0, Math.floor(elapsed / 5000));
    if (!steps) {
      return entry;
    }
    return {
      ...entry,
      priority: Math.max(floor, (entry.priority || floor) * Math.pow(decay, steps)),
      lastDecayAt: nowIso
    };
  });
  sortQueue(runtimeState.scheduler.queue);
}

function enqueueTarget(roomId, agentId, reason, priority = 0, metadata = {}) {
  const runtimeState = loadRuntimeState(roomId);
  const agents = loadAgents();
  const agent = getAgentById(agentId, agents);
  if (!agent) return;

  const queue = runtimeState.scheduler.queue || [];
  if ((runtimeState.scheduler.activeRuns || []).some((entry) => entry.agentId === agentId)) {
    return;
  }

  const nowIso = new Date().toISOString();
  const existing = queue.find((entry) => entry.agentId === agentId);
  if (existing) {
    const previousPriority = existing.priority || 0;
    if (priority >= previousPriority) {
      existing.reason = reason;
      existing.priority = priority;
    }
    existing.updatedAt = nowIso;
    existing.lastDecayAt = nowIso;
    existing.cluster = getAgentCluster(agent);
    if (metadata.sourceAgentId) existing.sourceAgentId = metadata.sourceAgentId;
    if (metadata.triggerStage) existing.triggerStage = metadata.triggerStage;
    if (metadata.activationScore != null) existing.activationScore = metadata.activationScore;
    if (metadata.distinctiveness != null) existing.distinctiveness = metadata.distinctiveness;
    runtimeState.scheduler.queue = sortQueue(queue);
    writeRuntimeState(roomId, runtimeState);
    return;
  }

  if (queue.length >= runtimeState.budgets.maxQueuedAgents) {
    return;
  }

  queue.push({
    agentId,
    reason,
    priority,
    cluster: getAgentCluster(agent),
    sourceAgentId: metadata.sourceAgentId || null,
    triggerStage: metadata.triggerStage || null,
    activationScore: metadata.activationScore ?? null,
    distinctiveness: metadata.distinctiveness ?? null,
    enqueuedAt: nowIso,
    updatedAt: nowIso,
    lastDecayAt: nowIso
  });
  runtimeState.scheduler.queue = sortQueue(queue);
  writeRuntimeState(roomId, runtimeState);
}

function enqueueTargetWithGate(roomId, agentId, reason, priority = 0, metadata = {}) {
  const snapshot = metadata.snapshot || buildSchedulerContext(roomId);
  const agents = snapshot.agents || loadAgents();
  const agent = getAgentById(agentId, agents);
  if (!agent) return false;

  const agentState = loadAgentState(agent);
  const skill = loadSkillProfile(agent);
  const activation = computeActivationProfile(roomId, agent, snapshot, agentState, skill, reason);

  if (!metadata.force && !activation.allowed) {
    return false;
  }

  enqueueTarget(
    roomId,
    agentId,
    reason,
    priority + Math.min(0.24, activation.activation * 0.22),
    {
      ...metadata,
      activationScore: activation.activation,
      distinctiveness: activation.distinctiveness
    }
  );
  return true;
}

function addSourceCandidates(agentState, parsed) {
  const candidates = (parsed.source_candidates || [])
    .filter((entry) => entry && (entry.query || entry.url))
    .map((entry) => ({
      query: entry.query || entry.url,
      url: entry.url || null,
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

function buildAgentSourceContext(agent, agentState) {
  const sourcePayload = loadAgentSourcePayload(agent, agentState.sourceLibrary || []);
  const sourceRegistry = loadSourceRegistry();
  const sharedLibrary = loadSharedSourceLibrary();
  const freshnessCounts = {
    fresh: 0,
    aging: 0,
    stale: 0,
    undated: 0
  };
  (sourcePayload.entries || []).forEach((entry) => {
    const key = entry?.freshness?.status || "undated";
    if (freshnessCounts[key] != null) freshnessCounts[key] += 1;
  });
  const curatedPacks = (sourcePayload.catalogRefs || [])
    .map((packId) => sourceRegistry.packs.find((pack) => pack.id === packId))
    .filter(Boolean)
    .map((pack) => ({
      id: pack.id,
      label: pack.label,
      focus: pack.focus || "",
      freshness: pack.freshness || "mixed",
      reliability: pack.reliability || "A-",
      sources: (pack.sources || []).slice(0, 4)
    }));

  return {
    qualityPolicy: sourcePayload.qualityPolicy || {},
    freshnessCounts,
    curatedPacks,
    privateRecent: (agentState.sourceLibrary || []).slice(-8),
    sharedRecent: (sharedLibrary.entries || []).slice(-8)
  };
}

function compactAgentStateForModel(agentState) {
  return {
    memorySummary: (agentState.memorySummary || []).slice(-6),
    skills: (agentState.skills || []).slice(-8),
    sourceLibrary: (agentState.sourceLibrary || []).slice(-6).map((entry) => ({
      label: entry.label,
      type: entry.type,
      note: String(entry.note || "").slice(0, 180),
      freshness: entry.freshness?.status || null
    })),
    sourceCandidates: (agentState.sourceCandidates || []).slice(-4).map((entry) => ({
      query: entry.query,
      why: String(entry.why || "").slice(0, 160),
      priority: entry.priority
    })),
    sourceFetchQueue: (agentState.sourceFetchQueue || [])
      .filter((entry) => entry.status === "pending")
      .slice(0, 4)
      .map((entry) => ({
        query: entry.query,
        why: String(entry.why || "").slice(0, 160),
        priority: entry.priority
      })),
    compactedNotes: (agentState.compactedNotes || []).slice(-4).map((entry) => ({
      kind: entry.kind,
      summary: String(entry.summary || "").slice(0, 220)
    }))
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

function buildSchedulerContext(roomId) {
  const bundle = loadRoom(roomId);
  const agents = loadAgents().filter((agent) => bundle.room.activeAgentIds.includes(agent.id));
  const executableAgents = agents.filter((agent) => agent.kind === "agent");
  const socialEdgeEntries = bundle.socialEdges?.edges || [];
  const socialEdgeMap = new Map();
  const socialEdgesBySource = new Map();
  const socialEdgesByTarget = new Map();
  socialEdgeEntries.forEach((edge) => {
    socialEdgeMap.set(`${edge.source}=>${edge.target}`, edge);
    if (!socialEdgesBySource.has(edge.source)) socialEdgesBySource.set(edge.source, []);
    if (!socialEdgesByTarget.has(edge.target)) socialEdgesByTarget.set(edge.target, []);
    socialEdgesBySource.get(edge.source).push(edge);
    socialEdgesByTarget.get(edge.target).push(edge);
  });
  const recentEvents = bundle.events
    .filter((event) => (event.visibility || "public") === "public")
    .slice(-18);
  const influence = {};
  const lastSpokeAt = {};
  const lastTargetedAt = {};
  const recentSpeakers = recentEvents
    .map((event) => event.speaker)
    .filter((speaker) => speaker && !["human", "synthesis"].includes(speaker));
  const clusterStats = {};

  executableAgents.forEach((agent) => {
    const cluster = getAgentCluster(agent);
    if (!clusterStats[cluster]) {
      clusterStats[cluster] = {
        cluster,
        agentIds: [],
        mentionPressure: 0,
        queueLoad: 0,
        lastActiveAt: 0
      };
    }
    clusterStats[cluster].agentIds.push(agent.id);
  });

  recentEvents.forEach((event) => {
    const weight = (STAGE_WEIGHTS[event.stage] || 0.75) * timeDecayWeight(event.createdAt);
    if (event.speaker && !["human", "synthesis"].includes(event.speaker)) {
      influence[event.speaker] = (influence[event.speaker] || 0) + weight;
      lastSpokeAt[event.speaker] = event.createdAt;
      const speakerAgent = getAgentById(event.speaker, agents);
      const speakerCluster = getAgentCluster(speakerAgent);
      if (clusterStats[speakerCluster]) {
        clusterStats[speakerCluster].mentionPressure += weight;
        clusterStats[speakerCluster].lastActiveAt = Math.max(
          clusterStats[speakerCluster].lastActiveAt,
          Date.parse(event.createdAt || "") || 0
        );
      }
    }
    if (event.target && !["human", "synthesis"].includes(event.target)) {
      influence[event.target] = (influence[event.target] || 0) + (weight * 0.58);
      lastTargetedAt[event.target] = event.createdAt;
      const targetAgent = getAgentById(event.target, agents);
      const targetCluster = getAgentCluster(targetAgent);
      if (clusterStats[targetCluster]) {
        clusterStats[targetCluster].mentionPressure += weight * 0.66;
        clusterStats[targetCluster].lastActiveAt = Math.max(
          clusterStats[targetCluster].lastActiveAt,
          Date.parse(event.createdAt || "") || 0
        );
      }
    }
  });

  bundle.graphState.edges.forEach((edge) => {
    if (edge.source) influence[edge.source] = (influence[edge.source] || 0) + ((edge.weight || 1) * 0.05);
    if (edge.target) influence[edge.target] = (influence[edge.target] || 0) + ((edge.weight || 1) * 0.03);
  });

  [...(bundle.runtimeState.scheduler.queue || []), ...(bundle.runtimeState.scheduler.activeRuns || [])].forEach((entry) => {
    const agent = getAgentById(entry.agentId, agents);
    const cluster = getAgentCluster(agent);
    if (clusterStats[cluster]) {
      clusterStats[cluster].queueLoad += 1;
    }
  });

  Object.values(clusterStats).forEach((cluster) => {
    const ageMs = cluster.lastActiveAt ? Date.now() - cluster.lastActiveAt : 18 * 60_000;
    cluster.coldBoost = Math.min(0.22, ageMs / (18 * 60_000));
    cluster.activationScore = cluster.mentionPressure + cluster.coldBoost - (cluster.queueLoad * 0.12);
  });

  return {
    ...bundle,
    agents,
    executableAgents,
    recentEvents,
    influence,
    lastSpokeAt,
    lastTargetedAt,
    recentSpeakers,
    clusterStats,
    socialEdges: socialEdgeEntries,
    socialEdgeMap,
    socialEdgesBySource,
    socialEdgesByTarget
  };
}

function socialEdgesFrom(snapshot, agentId) {
  return snapshot.socialEdgesBySource?.get(agentId) || [];
}

function socialEdgesTo(snapshot, agentId) {
  return snapshot.socialEdgesByTarget?.get(agentId) || [];
}

function getSocialEdge(snapshot, sourceId, targetId) {
  return snapshot.socialEdgeMap?.get(`${sourceId}=>${targetId}`) || null;
}

function topSocialTargets(snapshot, agentId, limit = 3) {
  return socialEdgesFrom(snapshot, agentId)
    .map((edge) => ({
      target: edge.target,
      score:
        (socialEdgeValue(edge, "coordination") * 0.34) +
        (socialEdgeValue(edge, "complementarity") * 0.28) +
        (socialEdgeValue(edge, "trust") * 0.2) +
        (socialEdgeValue(edge, "rivalry") * 0.18)
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.target);
}

function computeSocialPressure(snapshot, agentId) {
  const recentAgents = (snapshot.recentSpeakers || []).slice(-6);
  if (!recentAgents.length) return 0;

  const pressure = recentAgents.reduce((sum, sourceId) => {
    const edge = getSocialEdge(snapshot, sourceId, agentId);
    if (!edge) return sum;
    return sum
      + (socialEdgeValue(edge, "influence") * 0.38)
      + (socialEdgeValue(edge, "coordination") * 0.28)
      + (socialEdgeValue(edge, "rivalry") * 0.18)
      + (socialEdgeValue(edge, "trust") * 0.16);
  }, 0);

  return clamp01(pressure / Math.max(1, recentAgents.length));
}

function buildInterestTerms(agent, skill) {
  return splitInterestTerms([
    agent.role,
    agent.professionIdentity,
    ...(agent.dataConnectors || []),
    ...(skill.coreSkills || []),
    ...((agent.motivation && agent.motivation.keywords) || [])
  ]);
}

function computeQuestionMatchScore(agent, snapshot, skill) {
  const recentHumanText = snapshot.recentEvents
    .filter((event) => event.speaker === "human")
    .slice(-3)
    .map((event) => `${event.title || ""} ${event.body || ""}`)
    .join(" ")
    .toLowerCase();

  if (!recentHumanText) {
    return 0.45;
  }

  const interestTerms = buildInterestTerms(agent, skill);
  if (!interestTerms.length) {
    return 0.38;
  }

  const matchedTerms = interestTerms.filter((term) => recentHumanText.includes(term));
  const termCoverage = matchedTerms.length / Math.max(3, Math.min(10, interestTerms.length));
  const questionSignal = /[?？]|为什么|如何|怎么|是否|why|how|what|should/.test(recentHumanText) ? 0.08 : 0;
  return clamp01((termCoverage * 1.7) + questionSignal);
}

function computeDistinctivenessScore(agent, snapshot) {
  const cluster = getAgentCluster(agent);
  const recentAgentEvents = snapshot.recentEvents.filter(
    (event) => event.speaker && !["human", "synthesis"].includes(event.speaker)
  );
  const sameClusterRecent = recentAgentEvents
    .slice(-6)
    .filter((event) => {
      const eventAgent = getAgentById(event.speaker, snapshot.agents);
      return getAgentCluster(eventAgent) === cluster;
    })
    .length;
  const sameAgentRecent = snapshot.recentSpeakers.slice(-4).includes(agent.id) ? 1 : 0;
  const queuedSameCluster = [
    ...(snapshot.runtimeState.scheduler.queue || []),
    ...(snapshot.runtimeState.scheduler.activeRuns || [])
  ].filter((entry) => {
    const queuedAgent = getAgentById(entry.agentId, snapshot.agents);
    return getAgentCluster(queuedAgent) === cluster;
  }).length;

  return clamp01(
    0.95
      - (sameClusterRecent * 0.18)
      - (sameAgentRecent * 0.26)
      - (queuedSameCluster * 0.12)
      + Math.min(0.14, snapshot.clusterStats[cluster]?.coldBoost || 0)
  );
}

function computeDemandScore(agent, snapshot) {
  const targetedSignal = snapshot.lastTargetedAt[agent.id]
    ? 0.55 * timeDecayWeight(snapshot.lastTargetedAt[agent.id], 8 * 60_000)
    : 0;
  const influenceSignal = Math.min(0.7, (snapshot.influence[agent.id] || 0) * 0.24);
  const clusterSignal = Math.min(0.45, (snapshot.clusterStats[getAgentCluster(agent)]?.mentionPressure || 0) * 0.12);
  const socialSignal = computeSocialPressure(snapshot, agent.id) * 0.55;
  return clamp01(targetedSignal + influenceSignal + clusterSignal + socialSignal);
}

function computeSourceDepthScore(agentState) {
  const sourceDepth = Math.min(0.6, ((agentState.sourceLibrary || []).length * 0.03));
  const pendingDepth = Math.min(0.25, ((agentState.sourceFetchQueue || []).filter((entry) => entry.status === "pending").length * 0.04));
  return clamp01(sourceDepth + pendingDepth);
}

function activationThreshold(agent, room, reason) {
  const profile = agent.motivation || {};
  let threshold = 0.56 + ((profile.selectivity || 0.5) * 0.22);
  if (reason === "human-target" || reason === "manual-nudge") threshold -= 0.14;
  if (reason === "question-forge-human-ask") threshold -= 0.08;
  if (reason === "claim-review") threshold -= 0.1;
  if ((reason || "").startsWith("suggested-by-")) threshold -= 0.05;
  if (room.module === "ultimate_prediction") threshold += 0.04;
  return clamp01(threshold);
}

function computeActivationProfile(roomId, agent, context = null, cachedState = null, cachedSkill = null, reason = "autonomous-wake") {
  const snapshot = context || buildSchedulerContext(roomId);
  const skill = cachedSkill || loadSkillProfile(agent);
  const agentState = cachedState || loadAgentState(agent);
  const profile = agent.motivation || {};
  const curiosity = profile.curiosity ?? 0.5;
  const drive = profile.drive ?? 0.5;
  const noveltyBias = profile.noveltyBias ?? 0.5;
  const questionMatch = computeQuestionMatchScore(agent, snapshot, skill);
  const distinctiveness = computeDistinctivenessScore(agent, snapshot);
  const demand = computeDemandScore(agent, snapshot);
  const sourceDepth = computeSourceDepthScore(agentState);

  const activation = clamp01(
    (questionMatch * (0.26 + (curiosity * 0.22))) +
    (demand * (0.22 + (drive * 0.24))) +
    (distinctiveness * (0.16 + (noveltyBias * 0.22))) +
    (sourceDepth * 0.12)
  );

  const threshold = activationThreshold(agent, snapshot.room, reason);
  return {
    activation,
    threshold,
    allowed: activation >= threshold,
    questionMatch,
    distinctiveness,
    demand,
    sourceDepth
  };
}

function rankQueueCandidates(roomId, agents, snapshot, reason = "autonomous-wake") {
  return agents
    .map((agent) => {
      const agentState = loadAgentState(agent);
      const skill = loadSkillProfile(agent);
      const activation = computeActivationProfile(roomId, agent, snapshot, agentState, skill, reason);
      return {
        agent,
        activation,
        priority: computeAgentPriority(roomId, agent, snapshot, reason, agentState, skill)
      };
    })
    .filter((entry) => entry.activation.allowed)
    .sort(
      (a, b) =>
        (b.priority - a.priority) ||
        (b.activation.activation - a.activation.activation) ||
        (b.activation.distinctiveness - a.activation.distinctiveness)
    );
}

function pickDiverseAgents(rankedEntries, limit) {
  const chosen = [];
  const clusterCounts = new Map();

  rankedEntries.forEach((entry) => {
    if (chosen.length >= limit) return;
    const cluster = getAgentCluster(entry.agent);
    const seen = clusterCounts.get(cluster) || 0;
    if (!seen) {
      chosen.push(entry);
      clusterCounts.set(cluster, seen + 1);
    }
  });

  rankedEntries.forEach((entry) => {
    if (chosen.length >= limit) return;
    if (!chosen.some((selected) => selected.agent.id === entry.agent.id)) {
      const cluster = getAgentCluster(entry.agent);
      clusterCounts.set(cluster, (clusterCounts.get(cluster) || 0) + 1);
      chosen.push(entry);
    }
  });

  return chosen.slice(0, limit);
}

function computeAgentPriority(roomId, agent, context = null, reason = "autonomous-wake", cachedState = null, cachedSkill = null) {
  const snapshot = context || buildSchedulerContext(roomId);
  const room = snapshot.room;
  const agentState = cachedState || loadAgentState(agent);
  const skill = cachedSkill || loadSkillProfile(agent);
  const activation = computeActivationProfile(roomId, agent, snapshot, agentState, skill, reason);
  let priority = agent.priorityBase || 0.5;

  priority += Math.min(0.35, (agentState.skills || []).length * 0.01);
  priority += Math.min(0.2, (agentState.sourceLibrary || []).length * 0.004);
  priority += Math.min(0.35, (snapshot.influence[agent.id] || 0) * 0.12);
  priority += Math.min(0.36, activation.activation * 0.34);
  priority += Math.min(0.14, activation.questionMatch * 0.12);
  priority += Math.min(0.12, activation.distinctiveness * 0.1);

  const pendingSources = (agentState.sourceFetchQueue || []).filter((entry) => entry.status === "pending").length;
  priority += Math.min(0.12, pendingSources * 0.015);

  if (snapshot.lastTargetedAt[agent.id]) {
    priority += 0.16 * timeDecayWeight(snapshot.lastTargetedAt[agent.id], 8 * 60_000);
  }

  const recentSpeakers = snapshot.recentSpeakers || [];
  if (recentSpeakers.slice(-2).includes(agent.id)) {
    priority -= 0.24;
  } else if (recentSpeakers.slice(-5).includes(agent.id)) {
    priority -= 0.09;
  }

  const cluster = getAgentCluster(agent);
  const clusterInfo = snapshot.clusterStats[cluster];
  if (clusterInfo) {
    priority += Math.min(0.16, clusterInfo.coldBoost || 0);
    priority += Math.min(0.12, (clusterInfo.mentionPressure || 0) * 0.08);
    priority -= Math.min(0.16, (clusterInfo.queueLoad || 0) * 0.05);
  }

  if (room.module === "question_forge") {
    priority += activation.questionMatch * 0.08;
  } else if (room.module === "social_rooms") {
    if (recentSpeakers.slice(-3).includes(agent.id)) priority -= 0.06;
  } else if (room.module === "ultimate_prediction") {
    priority += activation.distinctiveness * 0.12;
  }

  return Math.max(0.05, Number(priority.toFixed(4)));
}

function stageCompanionTargets(stage, agentId) {
  if (stage === "planning") return ["lumen", "mira", "sable"];
  if (stage === "evidence") return ["sable", "forge", "atlas"];
  if (stage === "challenge") return ["atlas", "lumen", "mira"];
  if (stage === "implementation") return ["atlas", "synthesis"];
  if (stage === "convergence") return ["synthesis"];
  return SOCIAL_COMPANIONS[agentId] || [];
}

function deriveNextTargets(roomId, agentId, parsed, context = null) {
  const snapshot = context || buildSchedulerContext(roomId);
  const explicit = (parsed.next_targets || []).filter(Boolean);
  const companions = SOCIAL_COMPANIONS[agentId] || [];
  const stageTargets = stageCompanionTargets(parsed.stage, agentId);
  const graphTargets = defaultGraphTargets(roomId, agentId);
  const socialTargets = topSocialTargets(snapshot, agentId, 3);
  return [...explicit, ...stageTargets, ...socialTargets, ...companions, ...graphTargets]
    .filter((target, index, list) => {
      if (!target || target === agentId || target === "human") return false;
      return list.indexOf(target) === index;
    })
    .slice(0, 3);
}

function chooseAutonomousTargets(roomId, context = null) {
  const snapshot = context || buildSchedulerContext(roomId);
  const queuedOrRunning = new Set([
    ...(snapshot.runtimeState.scheduler.queue || []).map((entry) => entry.agentId),
    ...(snapshot.runtimeState.scheduler.activeRuns || []).map((entry) => entry.agentId)
  ]);
  const availableAgents = snapshot.executableAgents.filter((agent) => !queuedOrRunning.has(agent.id));
  if (!availableAgents.length) return [];
  const reason = snapshot.room.module === "question_forge" ? "question-forge-human-ask" : "autonomous-wake";
  const ranked = rankQueueCandidates(roomId, availableAgents, snapshot, reason);
  return pickDiverseAgents(ranked, snapshot.runtimeState.scheduler.maxAutoAgentsPerTick || 2)
    .map((entry) => entry.agent.id);
}

function selectQuestionForgeFrontier(roomId, context = null, limit = null) {
  const snapshot = context || buildSchedulerContext(roomId);
  const maxCount = limit || snapshot.room.minContributors || 3;
  const ranked = rankQueueCandidates(roomId, snapshot.executableAgents, snapshot, "question-forge-human-ask");
  return pickDiverseAgents(ranked, maxCount);
}

function seedSocialRoomFromHuman(roomId, targetAgentId = null) {
  const snapshot = buildSchedulerContext(roomId);
  const agents = snapshot.executableAgents;
  const targetedAgent = targetAgentId ? getAgentById(targetAgentId, agents) : null;
  const rankedCompanions = targetedAgent
    ? rankQueueCandidates(
      roomId,
      (SOCIAL_COMPANIONS[targetAgentId] || [])
        .map((agentId) => getAgentById(agentId, agents))
        .filter(Boolean),
      snapshot,
      `social-fanout-from-${targetAgentId}`
    )
    : [];
  const seedTargets = targetedAgent
    ? [targetAgentId, ...pickDiverseAgents(rankedCompanions, 1).map((entry) => entry.agent.id)]
    : chooseAutonomousTargets(roomId, snapshot);
  const fallbackTargets = agents
    .slice()
    .sort((a, b) => computeAgentPriority(roomId, b, snapshot, "human-broadcast") - computeAgentPriority(roomId, a, snapshot, "human-broadcast"))
    .map((agent) => agent.id);
  const primaryTargets = seedTargets
    .filter((agentId, index, list) => list.indexOf(agentId) === index)
    .concat(fallbackTargets)
    .filter((agentId, index, list) => list.indexOf(agentId) === index)
    .slice(0, Math.min(2, snapshot.runtimeState.scheduler.clusterWakeCount || 2));

  primaryTargets.forEach((agentId, index) => {
    const agent = getAgentById(agentId, agents);
    if (!agent) return;
    enqueueTargetWithGate(
      roomId,
      agentId,
      index === 0
        ? (targetedAgent ? "human-target" : "human-broadcast")
        : (targetedAgent ? `social-fanout-from-${targetAgentId}` : "human-broadcast-fanout"),
      computeAgentPriority(roomId, agent, snapshot, index === 0 ? "human-target" : "human-broadcast") + (index === 0 ? 0.18 : 0.06),
      { sourceAgentId: "human", triggerStage: "human", snapshot, force: index === 0 }
    );
  });
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

function extractHtmlText(html, maxLength = 2400) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function extractMetaContent(html, attrName, attrValue) {
  const regex = new RegExp(`<meta[^>]+${attrName}=["']${attrValue}["'][^>]+content=["']([^"']+)["']`, "i");
  const match = String(html || "").match(regex);
  return match ? match[1].trim() : "";
}

function parseCandidateUrl(candidate) {
  const raw = candidate?.url || candidate?.query || "";
  if (!/^https?:\/\//i.test(raw)) return null;
  try {
    return new URL(raw).toString();
  } catch {
    return null;
  }
}

async function fetchUrlSourceCandidate(candidate) {
  const url = parseCandidateUrl(candidate);
  if (!url) return null;
  const response = await fetch(url, {
    headers: {
      "User-Agent": "DuckerChat/0.1 (+local runtime)"
    }
  });
  if (!response.ok) {
    throw new Error(`source fetch failed: ${response.status}`);
  }
  const html = await response.text();
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].replace(/\s+/g, " ").trim() : url;
  const description =
    extractMetaContent(html, "name", "description") ||
    extractMetaContent(html, "property", "og:description") ||
    "";
  const textPreview = extractHtmlText(html);
  return {
    label: title || url,
    type: "web-page",
    url,
    note: description || textPreview.slice(0, 300),
    metadata: {
      title,
      description,
      textPreview
    }
  };
}

async function processSourceQueueTick(roomId) {
  const { room } = loadRoom(roomId);
  const agents = loadAgents().filter(
    (agent) => agent.kind === "agent" && room.activeAgentIds.includes(agent.id)
  );
  const candidates = [];

  agents.forEach((agent) => {
    const agentState = loadAgentState(agent);
    const next = (agentState.sourceFetchQueue || []).find((entry) => entry.status === "pending");
    if (!next) return;
    candidates.push({
      agent,
      agentState,
      next
    });
  });

  candidates.sort((a, b) => (b.next.priority || 0) - (a.next.priority || 0));
  const winner = candidates[0];
  if (!winner) return;

  winner.next.status = "done";
  winner.next.fetchedAt = new Date().toISOString();
  let sourceEntry = null;
  try {
    sourceEntry = await fetchUrlSourceCandidate(winner.next);
  } catch (error) {
    winner.next.status = "error";
    winner.next.error = error.message;
  }

  winner.agentState.sourceLibrary.push(
    sourceEntry || {
      label: winner.next.query,
      type: "source-candidate",
      note: winner.next.why || "Agent-generated source candidate"
    }
  );
  winner.agentState.sourceLibrary = dedupeSourceEntries(winner.agentState.sourceLibrary).slice(-80);
  writeAgentState(winner.agent, compactAgentState(winner.agent, winner.agentState));
  syncSharedSources(sourceEntry ? [sourceEntry] : [], winner.agent.id);

  appendEvent(roomId, {
    speaker: winner.agent.id,
    target: null,
    stage: "source_ingestion",
    title: sourceEntry ? `${winner.agent.label} 纳入了来源` : `${winner.agent.label} 更新了来源候选`,
    body: sourceEntry
      ? `${winner.agent.label} 纳入了来源“${sourceEntry.label}”，后续判断可直接复用。`
      : `${winner.agent.label} 记录了一个后续可验证的来源候选。`,
    sources: [sourceEntry?.url || "source-candidate-queue"],
    visibility: "system"
  });
}

function questionForgeReady(roomId) {
  const { room, events } = loadRoom(roomId);
  if (room.module !== "question_forge") return false;
  const minContributors = room.minContributors || 3;
  const executableAgentIds = loadAgents()
    .filter((agent) => room.activeAgentIds.includes(agent.id) && agent.kind === "agent")
    .map((agent) => agent.id);
  const contributors = new Set(
    events
      .filter((event) => executableAgentIds.includes(event.speaker))
      .map((event) => event.speaker)
  );
  return contributors.size >= Math.min(minContributors, executableAgentIds.length);
}

async function generateQuestionForgeAnswer(roomId) {
  ensureRoomHasBudget(roomId);
  const { room, events } = loadRoom(roomId);
  const provider = getOpenClawProvider();
  const agents = loadAgents()
    .filter((agent) => room.activeAgentIds.includes(agent.id))
    .map((agent) => ({
      id: agent.id,
      label: agent.label,
      role: agent.role,
      skill: loadSkillProfile(agent),
      state: compactAgentStateForModel(loadAgentState(agent))
    }));

  const input = [
    {
      role: "system",
      content:
        "你是 DuckerChat 的问题锻炉综合引擎。请严格输出 JSON，键名必须是 headline, executive_summary, answer_sections, composite_answer, key_claims, dissent, dissent_map, source_highlights, confidence, update_triggers, next_questions, delta_history, claim_graph。claim_graph 必须包含 claims 和 relations。claims 中每项必须包含 claim_id, text, status, confidence, evidence, counterevidence, source_refs, supporting_agents, opposing_agents, update_triggers, importance。relations 中每项必须包含 source, target, type。所有字符串内容必须使用简体中文，不要输出额外解释。"
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
  const claimGraph = deriveClaimGraphFromArtifact(room, artifact);
  writeJson(finalAnswerPath(roomId), artifact);
  persistClaimGraph(roomId, room, claimGraph);
  appendAuthorityLog(roomId, {
    actor: "synthesis",
    action: "forge-synthesis",
    scope: "question_forge",
    summary: artifact.headline || "问题锻炉生成了新的结构化回答包",
    affectedClaims: (claimGraph?.claims || []).map((claim) => claim.claim_id).slice(0, 8),
    metadata: {
      confidence: artifact.confidence,
      usage: usage.total_tokens || 0
    }
  });
  appendEvent(roomId, {
    speaker: "synthesis",
    target: "human",
    stage: "convergence",
    title: artifact.headline || "问题锻炉最终回答",
    body: artifact.executive_summary || artifact.composite_answer || "",
    sources: ["问题锻炉最终回答"],
    usage
  });
  return artifact;
}

async function runQuestionForgeRound(roomId) {
  restoreRoomForHumanIntervention(roomId, { enableScheduler: false });
  const { room } = loadRoom(roomId);
  if (room.module !== "question_forge") {
    throw new Error("Room is not a Question Forge module");
  }

  const snapshot = buildSchedulerContext(roomId);
  const orderedAgents = selectQuestionForgeFrontier(roomId, snapshot, room.minContributors || 3)
    .map((entry) => entry.agent.id);
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

function buildPredictionMaterial(agent, agentState, sharedLibrary, activation) {
  return {
    agentId: agent.id,
    label: agent.label,
    role: agent.role,
    cluster: getAgentCluster(agent),
    activation: Number(activation.activation.toFixed(3)),
    questionMatch: Number(activation.questionMatch.toFixed(3)),
    distinctiveness: Number(activation.distinctiveness.toFixed(3)),
    sourceSignals: [
      ...(agentState.sourceLibrary || []).slice(-3).map((entry) => entry.label),
      ...(sharedLibrary.entries || []).slice(-2).map((entry) => entry.label)
    ].filter(Boolean).slice(0, 5)
  };
}

async function callPredictionDraftModel(agent, room, events, agentState, material) {
  const provider = getOpenClawProvider();
  const skill = loadSkillProfile(agent);
  const sourceContext = buildAgentSourceContext(agent, agentState);
  const latestHumanPrompt = events.filter((event) => event.speaker === "human").slice(-1)[0]?.body || room.prompt;
  const input = [
    {
      role: "system",
      content:
        "你是终极预测 society 里的前线 agent。请严格输出 JSON，键名必须是 headline, predicted_answer, confidence, evidence_points, coalition_tags, partner_ids, open_risks。所有字符串内容必须使用简体中文，不要输出额外解释。"
    },
    {
      role: "user",
      content: JSON.stringify(
        {
          room: {
            id: room.id,
            title: room.title,
            prompt: room.prompt
          },
          latestHumanPrompt,
          agent: {
            id: agent.id,
            label: agent.label,
            role: agent.role,
            professionIdentity: agent.professionIdentity,
            motivation: agent.motivation || null,
            skill
          },
          material,
          sourceContext,
          recentPublicEvents: events.filter((event) => (event.visibility || "public") === "public").slice(-10)
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
    throw new Error(`Ultimate prediction draft failed for ${agent.id}`);
  }

  const payload = await response.json();
  const text = extractOutputText(payload);
  const parsed = tryParseJsonBlock(text);
  if (!parsed) {
    throw new Error(`Ultimate prediction draft was not valid JSON for ${agent.id}`);
  }

  return {
    ...parsed,
    usage: extractUsage(payload) || {
      input_tokens: estimateTokenCount(JSON.stringify(input)),
      output_tokens: estimateTokenCount(text),
      total_tokens: estimateTokenCount(JSON.stringify(input)) + estimateTokenCount(text),
      estimated: true
    }
  };
}

function socialAffinityBetween(agentAId, agentBId, socialEdges) {
  const forward = (socialEdges || []).find((edge) => edge.source === agentAId && edge.target === agentBId);
  const backward = (socialEdges || []).find((edge) => edge.source === agentBId && edge.target === agentAId);
  const candidates = [forward, backward].filter(Boolean);
  if (!candidates.length) return 0.38;
  const score = candidates.reduce((sum, edge) => {
    return sum
      + (socialEdgeValue(edge, "coordination") * 0.32)
      + (socialEdgeValue(edge, "complementarity") * 0.28)
      + (socialEdgeValue(edge, "trust") * 0.22)
      - (socialEdgeValue(edge, "rivalry") * 0.12)
      + (socialEdgeValue(edge, "influence") * 0.18);
  }, 0) / candidates.length;
  return clamp01(score);
}

function coalitionTagHint(draft) {
  return (
    (draft.output.coalition_tags || [])
      .map((tag) => String(tag || "").trim())
      .find(Boolean) ||
    draft.agent.cluster ||
    "综合派"
  ).slice(0, 18);
}

function coalitionAffinity(coalition, draft, socialEdges) {
  const socialScore =
    coalition.drafts.reduce((sum, existingDraft) => {
      return sum + socialAffinityBetween(existingDraft.agent.id, draft.agent.id, socialEdges);
    }, 0) / Math.max(1, coalition.drafts.length);
  const tagScore = coalition.label === coalitionTagHint(draft) ? 0.16 : 0;
  const clusterScore = coalition.drafts.some((existingDraft) => existingDraft.agent.cluster === draft.agent.cluster) ? 0.06 : 0;
  return socialScore + tagScore + clusterScore;
}

function chooseCoalitionIntegrator(drafts, socialEdges) {
  const ranked = drafts.map((draft) => {
    const inbound = drafts.reduce((sum, otherDraft) => {
      if (otherDraft.agent.id === draft.agent.id) return sum;
      return sum + socialAffinityBetween(otherDraft.agent.id, draft.agent.id, socialEdges);
    }, 0) / Math.max(1, drafts.length - 1);
    const score = (draft.material.activation * 0.56) + (inbound * 0.44);
    return { draft, score };
  }).sort((a, b) => b.score - a.score);
  return ranked[0]?.draft || drafts[0];
}

function compressCoalitionDrafts(coalitions, coalitionTarget, socialEdges) {
  const working = coalitions.slice();
  while (working.length > coalitionTarget) {
    let bestPair = null;
    let bestScore = -Infinity;

    for (let i = 0; i < working.length; i += 1) {
      for (let j = i + 1; j < working.length; j += 1) {
        const left = working[i];
        const right = working[j];
        const crossScores = left.drafts.flatMap((leftDraft) =>
          right.drafts.map((rightDraft) => socialAffinityBetween(leftDraft.agent.id, rightDraft.agent.id, socialEdges))
        );
        const avgScore = crossScores.reduce((sum, value) => sum + value, 0) / Math.max(1, crossScores.length);
        const labelBonus = left.label === right.label ? 0.18 : 0;
        const score = avgScore + labelBonus;
        if (score > bestScore) {
          bestScore = score;
          bestPair = [i, j];
        }
      }
    }

    if (!bestPair) break;
    const [leftIndex, rightIndex] = bestPair;
    const left = working[leftIndex];
    const right = working[rightIndex];
    const mergedDrafts = [...left.drafts, ...right.drafts];
    const integrator = chooseCoalitionIntegrator(mergedDrafts, socialEdges);
    const merged = {
      id: left.id,
      label: left.label.length >= right.label.length ? left.label : right.label,
      thesis: integrator.output.predicted_answer || integrator.output.headline || left.thesis || right.thesis,
      memberIds: mergedDrafts.map((draft) => draft.agent.id),
      integratorId: integrator.agent.id,
      averageConfidence: Number(
        (
          mergedDrafts.reduce((sum, draft) => sum + (Number(draft.output.confidence) || 0.65), 0) /
          Math.max(1, mergedDrafts.length)
        ).toFixed(3)
      ),
      evidenceHighlights: mergedDrafts.flatMap((draft) => draft.output.evidence_points || []).filter(Boolean).slice(0, 4),
      openRisks: mergedDrafts.flatMap((draft) => draft.output.open_risks || []).filter(Boolean).slice(0, 3),
      drafts: mergedDrafts
    };
    working.splice(rightIndex, 1);
    working.splice(leftIndex, 1, merged);
  }

  return working;
}

function buildPredictionCoalitions(frontlineDrafts, socialEdges, coalitionTarget = 4) {
  const sortedDrafts = frontlineDrafts
    .slice()
    .sort((a, b) => (b.material.activation || 0) - (a.material.activation || 0));

  const coalitions = [];
  sortedDrafts.forEach((draft, index) => {
    const label = coalitionTagHint(draft);
    const coalition = {
      id: `coalition-${index + 1}`,
      label,
      thesis: draft.output.predicted_answer || draft.output.headline || label,
      memberIds: [draft.agent.id],
      integratorId: draft.agent.id,
      averageConfidence: Number((Number(draft.output.confidence) || 0.65).toFixed(3)),
      evidenceHighlights: (draft.output.evidence_points || []).filter(Boolean).slice(0, 4),
      openRisks: (draft.output.open_risks || []).filter(Boolean).slice(0, 3),
      drafts: [draft]
    };

    if (!coalitions.length) {
      coalitions.push(coalition);
      return;
    }

    const ranked = coalitions
      .map((existing) => ({ existing, score: coalitionAffinity(existing, draft, socialEdges) }))
      .sort((a, b) => b.score - a.score);
    const best = ranked[0];
    if (best && best.score >= 0.56) {
      best.existing.drafts.push(draft);
      best.existing.memberIds = uniqueStrings([...best.existing.memberIds, draft.agent.id], 24);
      const integrator = chooseCoalitionIntegrator(best.existing.drafts, socialEdges);
      best.existing.integratorId = integrator.agent.id;
      best.existing.thesis = integrator.output.predicted_answer || integrator.output.headline || best.existing.thesis;
      best.existing.averageConfidence = Number(
        (
          best.existing.drafts.reduce((sum, item) => sum + (Number(item.output.confidence) || 0.65), 0) /
          Math.max(1, best.existing.drafts.length)
        ).toFixed(3)
      );
      best.existing.evidenceHighlights = best.existing.drafts.flatMap((item) => item.output.evidence_points || []).filter(Boolean).slice(0, 4);
      best.existing.openRisks = best.existing.drafts.flatMap((item) => item.output.open_risks || []).filter(Boolean).slice(0, 3);
    } else {
      coalitions.push(coalition);
    }
  });

  return compressCoalitionDrafts(coalitions, coalitionTarget, socialEdges)
    .map((coalition, index) => ({
      id: `coalition-${index + 1}`,
      label: coalition.label,
      thesis: coalition.thesis,
      memberIds: coalition.memberIds,
      integratorId: coalition.integratorId,
      averageConfidence: coalition.averageConfidence,
      evidenceHighlights: coalition.evidenceHighlights,
      openRisks: coalition.openRisks
    }))
    .sort((a, b) => b.memberIds.length - a.memberIds.length || b.averageConfidence - a.averageConfidence)
    .slice(0, coalitionTarget);
}

function buildPredictionInteractions(societyAgentIds, participantAgentIds, frontlineDrafts, coalitions, arbitratorIds) {
  const interactions = [];
  const society = societyAgentIds || [];
  const participants = participantAgentIds || [];

  society.forEach((agentId, index) => {
    const nextId = society[(index + 1) % society.length];
    const jumpId = society[(index + 7) % society.length];
    if (nextId) {
      interactions.push({
        source: agentId,
        target: nextId,
        weight: 0.7,
        kind: "society-loop"
      });
    }
    if (society.length > 12 && jumpId) {
      interactions.push({
        source: agentId,
        target: jumpId,
        weight: 0.35,
        kind: "society-bridge"
      });
    }
  });

  participants.forEach((agentId, index) => {
    const nextId = participants[(index + 1) % Math.max(1, participants.length)];
    if (nextId && nextId !== agentId) {
      interactions.push({
        source: agentId,
        target: nextId,
        weight: 1.1,
        kind: "participant-loop"
      });
    }
  });

  frontlineDrafts.forEach((draft) => {
    (draft.output.partner_ids || []).slice(0, 2).forEach((targetId) => {
      interactions.push({
        source: draft.agent.id,
        target: targetId,
        weight: 1.2,
        kind: "peer-exchange"
      });
    });
  });

  coalitions.forEach((coalition) => {
    coalition.memberIds.forEach((memberId) => {
      interactions.push({
        source: memberId,
        target: coalition.integratorId,
        weight: memberId === coalition.integratorId ? 0.8 : 1.6,
        kind: "coalition"
      });
    });
  });

  arbitratorIds.forEach((arbiterId) => {
    coalitions.forEach((coalition) => {
      interactions.push({
        source: coalition.integratorId,
        target: arbiterId,
        weight: 2,
        kind: "arbitration"
      });
    });
  });

  return interactions;
}

function selectPredictionArbitrators(frontlineEntries, snapshot, count = 3) {
  const ranked = frontlineEntries
    .map((entry) => {
      const inboundSocial = snapshot.socialEdges
        .filter((edge) => edge.target === entry.agent.id)
        .reduce((sum, edge) => {
          return sum
            + (socialEdgeValue(edge, "trust") * 0.42)
            + (socialEdgeValue(edge, "influence") * 0.3)
            + (socialEdgeValue(edge, "coordination") * 0.18)
            - (socialEdgeValue(edge, "rivalry") * 0.08);
        }, 0) / Math.max(1, snapshot.socialEdges.filter((edge) => edge.target === entry.agent.id).length);
      const criticalityBonus = getAgentCluster(entry.agent) === "critique" ? 0.08 : getAgentCluster(entry.agent) === "planning" ? 0.06 : 0;
      const activationScore =
        entry.material?.activation
        ?? entry.activation?.activation
        ?? 0.5;
      const distinctiveness =
        entry.material?.distinctiveness
        ?? entry.activation?.distinctiveness
        ?? 0.5;
      return {
        entry,
        score: (activationScore * 0.52) + (inboundSocial * 0.38) + criticalityBonus,
        distinctiveness
      };
    })
    .sort((a, b) => b.score - a.score);

  return pickDiverseAgents(ranked.map((item) => ({
    agent: item.entry.agent,
    activation: { activation: item.score, distinctiveness: item.distinctiveness },
    priority: item.score
  })), count).map((item) => item.agent.id);
}

function questionSpecificBias(question, agentId) {
  const hash = hashString(`${question}::${agentId}`);
  return (hash % 1000) / 1000;
}

function socialCentrality(agentId, snapshot) {
  const inbound = socialEdgesTo(snapshot, agentId);
  if (!inbound.length) return 0.3;
  const score = inbound.reduce((sum, edge) => {
    return sum
      + (socialEdgeValue(edge, "trust") * 0.36)
      + (socialEdgeValue(edge, "influence") * 0.28)
      + (socialEdgeValue(edge, "coordination") * 0.22)
      + (socialEdgeValue(edge, "complementarity") * 0.14);
  }, 0) / inbound.length;
  return clamp01(score);
}

function rankPredictionFrontiers(roomId, societyAgents, snapshot, questionText) {
  const ranked = societyAgents.map((agent) => {
    const agentState = loadAgentState(agent);
    const skill = loadSkillProfile(agent);
    const activation = computeActivationProfile(roomId, agent, snapshot, agentState, skill, "ultimate-prediction-scout");
    const basePriority = computeAgentPriority(roomId, agent, snapshot, "ultimate-prediction-scout", agentState, skill);
    const questionBias = questionSpecificBias(questionText, agent.id);
    const centrality = socialCentrality(agent.id, snapshot);
    const composite = basePriority + (questionBias * 0.18) + (centrality * 0.12);
    return {
      agent,
      activation,
      priority: composite,
      questionBias,
      centrality
    };
  })
    .filter((entry) => entry.activation.allowed)
    .sort((a, b) => b.priority - a.priority || b.activation.distinctiveness - a.activation.distinctiveness);

  return ranked.length ? ranked : societyAgents
    .map((agent) => ({
      agent,
      activation: { activation: 0.4, distinctiveness: 0.4, questionMatch: 0.4 },
      priority: 0.4 + (questionSpecificBias(questionText, agent.id) * 0.18),
      questionBias: questionSpecificBias(questionText, agent.id),
      centrality: socialCentrality(agent.id, snapshot)
    }))
    .sort((a, b) => b.priority - a.priority);
}

function selectPredictionParticipants(rankedEntries, frontlineIds, count = 18) {
  const chosen = [];
  const seen = new Set(frontlineIds);
  frontlineIds.forEach((agentId) => chosen.push(agentId));
  rankedEntries.forEach((entry) => {
    if (chosen.length >= count) return;
    if (seen.has(entry.agent.id)) return;
    seen.add(entry.agent.id);
    chosen.push(entry.agent.id);
  });
  return chosen.slice(0, count);
}

function buildPredictionTimelineSnapshots(roomId, predictionState, claimGraph, finalVerdict) {
  const generatedAt = new Date().toISOString();
  return [
    {
      id: `${roomId}-timeline-scouting`,
      phase: "scouting",
      at: generatedAt,
      headline: "全体素材感知",
      summary: `共扫描 ${predictionState.scoutCount || 0} 个 society 节点，先形成素材层而非答案层。`,
      coalitionCount: 0,
      claimCount: 0
    },
    {
      id: `${roomId}-timeline-frontline`,
      phase: "frontline",
      at: generatedAt,
      headline: "前线起草",
      summary: `筛出 ${predictionState.frontlineAgentIds?.length || 0} 个高相关且高差异前线节点。`,
      coalitionCount: 0,
      claimCount: 0
    },
    {
      id: `${roomId}-timeline-coalition`,
      phase: "coalition",
      at: generatedAt,
      headline: "联盟形成",
      summary: `形成 ${predictionState.coalitions?.length || 0} 个答案联盟，并指定整合节点。`,
      coalitionCount: predictionState.coalitions?.length || 0,
      claimCount: claimGraph?.claims?.length || 0
    },
    {
      id: `${roomId}-timeline-arbitrated`,
      phase: "arbitrated",
      at: generatedAt,
      headline: finalVerdict?.headline || "完成裁定",
      summary: finalVerdict?.executive_summary || "裁定层输出当前最佳答案。",
      coalitionCount: predictionState.coalitions?.length || 0,
      claimCount: claimGraph?.claims?.length || 0
    }
  ];
}

function buildPreviewFrontlineDrafts(frontlineEntries) {
  return frontlineEntries.map((entry) => ({
    agent: entry.agent,
    material: {
      activation: entry.activation.activation,
      distinctiveness: entry.activation.distinctiveness,
      questionMatch: entry.activation.questionMatch
    },
    output: {
      headline: `${entry.agent.label} 前线预估`,
      predicted_answer: `从${entry.agent.role}视角给出问题的第一轮预估。`,
      confidence: 0.55 + (entry.activation.questionMatch * 0.2),
      coalition_tags: [entry.agent.cluster || entry.agent.role],
      evidence_points: [`${entry.agent.label} 被问题匹配与差异性门控选入前线。`, `当前仍处于预览阶段，尚未完成正式裁定。`],
      open_risks: ["正式重模型裁定尚未完成，当前只是前线预览态。"],
      partner_ids: topSocialTargets({ socialEdges: [], socialEdgesBySource: new Map(), socialEdgesByTarget: new Map() }, entry.agent.id, 0)
    }
  }));
}

function buildPredictionPreviewClaimGraph(room, questionText, coalitions) {
  const claims = (coalitions || []).slice(0, 4).map((coalition, index) => ({
    claim_id: `preview-${index + 1}`,
    text: `围绕“${questionText}”，${coalition.label} 已形成第一轮预估立场。`,
    status: "proposed",
    confidence: "中低",
    evidence: coalition.evidenceHighlights || [],
    counterevidence: coalition.openRisks || [],
    source_refs: [],
    supporting_agents: coalition.memberIds || [],
    opposing_agents: [],
    update_triggers: ["正式裁定完成", "来源补全", "联盟重组"],
    importance: Math.max(0.45, 0.88 - (index * 0.08))
  }));
  const relations = claims.slice(1).map((claim) => ({
    source: claims[0].claim_id,
    target: claim.claim_id,
    type: "supports"
  }));

  return {
    roomId: room.id,
    artifactType: "prediction_preview",
    generatedAt: new Date().toISOString(),
    claims,
    relations
  };
}

function seedUltimatePredictionPreview(roomId, questionText) {
  const { room, runtimeState } = loadRoom(roomId);
  const snapshot = buildSchedulerContext(roomId);
  const societyAgents = snapshot.executableAgents.slice(0, runtimeState.prediction.scoutCount || 100);
  const ranked = rankPredictionFrontiers(roomId, societyAgents, snapshot, questionText);
  const frontlineEntries = pickDiverseAgents(ranked, runtimeState.prediction.draftAgentLimit || 8);
  const participantAgentIds = selectPredictionParticipants(
    ranked,
    frontlineEntries.map((entry) => entry.agent.id),
    runtimeState.prediction.frontlineCount || 18
  );
  const previewDrafts = buildPreviewFrontlineDrafts(frontlineEntries);
  const coalitions = buildPredictionCoalitions(previewDrafts, snapshot.socialEdges, runtimeState.prediction.coalitionTarget || 4);
  const arbitratorIds = selectPredictionArbitrators(frontlineEntries, snapshot, runtimeState.prediction.arbitrationCount || 3);
  const previewVerdict = {
    headline: "正在重组终极预测社会",
    executive_summary: `围绕“${summarizeText(questionText, 80)}”，系统已先筛出新的前线节点与联盟，正式裁定仍在继续。`,
    best_answer: "",
    minority_report: [],
    coalition_summaries: coalitions.map((coalition) => `${coalition.label}：${coalition.thesis}`).slice(0, 4),
    confidence: "预览",
    arbitrator_ids: arbitratorIds,
    update_triggers: ["正式裁定完成", "前线重排", "新来源进入"],
    counterfactual_branches: [],
    belief_shifts: []
  };
  const previewClaimGraph = buildPredictionPreviewClaimGraph(room, questionText, coalitions);
  const nextPredictionState = {
    question: questionText,
    updatedAt: new Date().toISOString(),
    phase: "frontline_preview",
    population: societyAgents.length,
    scoutCount: ranked.length,
    frontlineAgentIds: frontlineEntries.map((entry) => entry.agent.id),
    participantAgentIds,
    arbitratorIds,
    materials: ranked.slice(0, 24).map((entry) => ({
      agentId: entry.agent.id,
      label: entry.agent.label,
      role: entry.agent.role,
      cluster: getAgentCluster(entry.agent),
      activation: Number(entry.activation.activation.toFixed(3)),
      questionMatch: Number(entry.activation.questionMatch.toFixed(3)),
      distinctiveness: Number(entry.activation.distinctiveness.toFixed(3)),
      sourceSignals: []
    })),
    coalitions,
    interactions: buildPredictionInteractions(societyAgents.map((agent) => agent.id), participantAgentIds, previewDrafts, coalitions, arbitratorIds),
    counterfactualBranches: [],
    beliefShifts: [],
    timelineSnapshots: buildPredictionTimelineSnapshots(roomId, {
      frontlineAgentIds: frontlineEntries.map((entry) => entry.agent.id),
      coalitions
    }, previewClaimGraph, previewVerdict),
    phaseHistory: [
      {
        phase: "frontline_preview",
        at: new Date().toISOString(),
        note: "用户刚提出新问题，系统已先重组前线与联盟预览。"
      }
    ],
    finalVerdict: previewVerdict
  };

  writeJson(predictionStatePath(roomId), nextPredictionState);
  writeJson(finalAnswerPath(roomId), previewVerdict);
  writeClaimGraph(roomId, previewClaimGraph);
  appendAuthorityLog(roomId, {
    actor: "human",
    action: "prediction-preview-reset",
    scope: "ultimate_prediction",
    summary: `围绕新问题重置了前线与联盟预览：${summarizeText(questionText, 80)}`,
    affectedClaims: previewClaimGraph.claims.map((claim) => claim.claim_id),
    metadata: {
      frontline: nextPredictionState.frontlineAgentIds,
      arbitrators: arbitratorIds
    }
  });
}

async function generateUltimatePredictionVerdict(roomId, room, predictionState, frontlineDrafts) {
  ensureRoomHasBudget(roomId);
  const provider = getOpenClawProvider();
  const input = [
    {
      role: "system",
      content:
        "你是 DuckerChat 终极预测 society 的总裁定器。请严格输出 JSON，键名必须是 headline, executive_summary, best_answer, minority_report, coalition_summaries, confidence, arbitrator_ids, update_triggers, claim_graph, counterfactual_branches, belief_shifts。claim_graph 必须包含 claims 和 relations。claims 中每项必须包含 claim_id, text, status, confidence, evidence, counterevidence, source_refs, supporting_agents, opposing_agents, update_triggers, importance。relations 中每项必须包含 source, target, type。counterfactual_branches 中每项必须包含 title, delta。belief_shifts 中每项必须包含 claim, from, to, why。所有字符串必须使用简体中文，不要输出额外解释。"
    },
    {
      role: "user",
      content: JSON.stringify(
        {
          room,
          predictionState,
          frontlineDrafts: frontlineDrafts.map((draft) => ({
            agent: {
              id: draft.agent.id,
              label: draft.agent.label,
              role: draft.agent.role
            },
            material: draft.material,
            output: draft.output
          }))
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
    throw new Error("Ultimate prediction verdict failed");
  }

  const payload = await response.json();
  const text = extractOutputText(payload);
  const parsed = tryParseJsonBlock(text);
  if (!parsed) {
    throw new Error("Ultimate prediction verdict did not return valid JSON");
  }

  return {
    ...parsed,
    generatedAt: new Date().toISOString(),
    usage: extractUsage(payload) || {
      input_tokens: estimateTokenCount(JSON.stringify(input)),
      output_tokens: estimateTokenCount(text),
      total_tokens: estimateTokenCount(JSON.stringify(input)) + estimateTokenCount(text),
      estimated: true
    }
  };
}

async function runUltimatePredictionRound(roomId) {
  ensureRoomHasBudget(roomId);
  const { room, events, runtimeState } = loadRoom(roomId);
  if (room.module !== "ultimate_prediction") {
    throw new Error("Room is not an Ultimate Prediction module");
  }

  const snapshot = buildSchedulerContext(roomId);
  const sharedLibrary = loadSharedSourceLibrary();
  const questionText = events.filter((event) => event.speaker === "human").slice(-1)[0]?.body || room.prompt;
  const societyAgents = snapshot.executableAgents.slice(0, runtimeState.prediction.scoutCount || 100);
  const ranked = rankPredictionFrontiers(roomId, societyAgents, snapshot, questionText);
  const frontlineEntries = pickDiverseAgents(ranked, runtimeState.prediction.draftAgentLimit || 8);
  const participantAgentIds = selectPredictionParticipants(ranked, frontlineEntries.map((entry) => entry.agent.id), runtimeState.prediction.frontlineCount || 18);

  const materials = ranked.map((entry) => {
    const agentState = loadAgentState(entry.agent);
    return buildPredictionMaterial(entry.agent, agentState, sharedLibrary, entry.activation);
  });

  const frontlineDrafts = [];
  for (const entry of frontlineEntries) {
    const agentState = loadAgentState(entry.agent);
    const output = await callPredictionDraftModel(entry.agent, room, events, agentState, buildPredictionMaterial(entry.agent, agentState, sharedLibrary, entry.activation));
    frontlineDrafts.push({
      agent: entry.agent,
      material: buildPredictionMaterial(entry.agent, agentState, sharedLibrary, entry.activation),
      output
    });
  }

  const coalitions = buildPredictionCoalitions(frontlineDrafts, snapshot.socialEdges, runtimeState.prediction.coalitionTarget || 4);
  const arbitratorIds = selectPredictionArbitrators(frontlineEntries, snapshot, runtimeState.prediction.arbitrationCount || 3);
  const nextPredictionState = {
    question: questionText,
    updatedAt: new Date().toISOString(),
    phase: "arbitrated",
    population: societyAgents.length,
    scoutCount: materials.length,
    frontlineAgentIds: frontlineEntries.map((entry) => entry.agent.id),
    participantAgentIds,
    arbitratorIds,
    materials: materials.slice(0, 24),
    coalitions,
    interactions: buildPredictionInteractions(societyAgents.map((agent) => agent.id), participantAgentIds, frontlineDrafts, coalitions, arbitratorIds),
    timelineSnapshots: [],
    phaseHistory: [
      {
        phase: "scouting",
        at: new Date().toISOString(),
        note: `先对 ${materials.length} 个 agent 做低成本素材感知，再让 ${frontlineEntries.length} 个前线节点起草。问题指纹已参与前线筛选。`
      },
      {
        phase: "coalition",
        at: new Date().toISOString(),
        note: `形成 ${coalitions.length} 个答案联盟，再交给裁定节点统一。`
      }
    ],
    finalVerdict: null
  };

  const finalVerdict = await generateUltimatePredictionVerdict(roomId, room, nextPredictionState, frontlineDrafts);
  nextPredictionState.finalVerdict = finalVerdict;
  nextPredictionState.counterfactualBranches = finalVerdict.counterfactual_branches || [];
  nextPredictionState.beliefShifts = finalVerdict.belief_shifts || [];
  const predictionClaimGraph = deriveClaimGraphFromArtifact(room, finalVerdict);
  const persistedPredictionClaimGraph = persistClaimGraph(roomId, room, predictionClaimGraph);
  nextPredictionState.timelineSnapshots = buildPredictionTimelineSnapshots(
    roomId,
    nextPredictionState,
    persistedPredictionClaimGraph,
    finalVerdict
  );
  writeJson(predictionStatePath(roomId), nextPredictionState);
  writeJson(finalAnswerPath(roomId), finalVerdict);
  appendAuthorityLog(roomId, {
    actor: "synthesis",
    action: "prediction-verdict",
    scope: "ultimate_prediction",
    summary: finalVerdict.headline || "终极预测室生成了新的裁定",
    affectedClaims: (persistedPredictionClaimGraph?.claims || []).map((claim) => claim.claim_id).slice(0, 8),
    metadata: {
      arbitrators: nextPredictionState.arbitratorIds || [],
      coalitionCount: nextPredictionState.coalitions?.length || 0,
      usage: finalVerdict.usage?.total_tokens || 0
    }
  });
  appendPredictionReplaySnapshot(roomId, {
    id: `${roomId}-replay-${Date.now()}`,
    at: new Date().toISOString(),
    question: nextPredictionState.question,
    frontlineAgentIds: nextPredictionState.frontlineAgentIds,
    arbitratorIds: nextPredictionState.arbitratorIds,
    coalitions: nextPredictionState.coalitions,
    claimSummary: (persistedPredictionClaimGraph?.claims || []).map((claim) => ({
      claim_id: claim.claim_id,
      status: claim.status,
      importance: claim.importance
    })),
    headline: finalVerdict.headline,
    executiveSummary: finalVerdict.executive_summary || finalVerdict.best_answer || "",
    beliefShifts: nextPredictionState.beliefShifts || [],
    counterfactualBranches: nextPredictionState.counterfactualBranches || []
  });

  appendEvent(roomId, {
    speaker: "synthesis",
    target: "human",
    stage: "convergence",
    title: finalVerdict.headline || "终极预测裁定",
    body: finalVerdict.executive_summary || finalVerdict.best_answer || "",
    sources: ["终极预测裁定"],
    usage: finalVerdict.usage,
    visibility: "system"
  });

  return nextPredictionState;
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

function buildVisibleChatContext(roomId, room, events, agent) {
  const runtimeState = loadRuntimeState(roomId);
  const maxContextEvents = Math.max(runtimeState.budgets.maxContextEvents || 14, 18);
  const publicEvents = events.filter((event) => (event.visibility || "public") === "public");
  const roomWindow = publicEvents.slice(-maxContextEvents);
  const selfRecentEvents = publicEvents.filter((event) => event.speaker === agent.id).slice(-4);
  const humanRecentEvents = publicEvents.filter((event) => event.speaker === "human").slice(-4);
  const agentsById = new Map(loadAgents().map((entry) => [entry.id, entry]));

  const transcript = roomWindow.map((event) => {
    const speaker = agentsById.get(event.speaker);
    const speakerLabel = speaker?.label || event.speaker;
    const target = event.target ? agentsById.get(event.target) : null;
    const targetText = target ? ` -> ${target.label}` : "";
    return `[${event.stage}] ${speakerLabel}${targetText}: ${event.body}`;
  }).join("\n");

  return {
    roomWindow,
    selfRecentEvents,
    humanRecentEvents,
    transcript
  };
}

async function callAgentModel(agent, room, events, agentState) {
  const provider = getOpenClawProvider();
  const skill = loadSkillProfile(agent);
  const visibleContext = buildVisibleChatContext(room.id, room, events, agent);
  const sourceContext = buildAgentSourceContext(agent, agentState);
  const activationProfile = computeActivationProfile(room.id, agent, buildSchedulerContext(room.id), agentState, skill, "model-call");
  const recentEvents = visibleContext.roomWindow.map((event) => ({
    stage: event.stage,
    speaker: event.speaker,
    target: event.target,
    title: event.title,
    body: event.body
  }));

  const instructions = [
    `你是 DuckerChat 群聊里的 ${agent.label}。`,
    `你在现实世界中的职业身份是：${agent.professionIdentity || agent.role}。`,
    `你在房间里的公开身份标签是：${agent.role}。`,
    `你的聊天风格是：${agent.chatStyle || "自然、直接、像真人一样说话"}。`,
    `灵魂设定：${agent.soul}`,
    `专业背景：${skill.profession}。`,
    `核心能力：${(skill.coreSkills || []).join("、")}。`,
    `判断边界：${(skill.boundaries || []).join("；")}。`,
    `你能看到这个房间最近的公开消息，包括 Henry 的发言、其他 agent 的发言，以及你自己之前说过的话。`,
    `你的每条回复也会被 Henry 和所有 agent 看见，所以你是在群聊里公开说话，不是在写内部备忘录。`,
    `优先直接回应最近的人类消息或最近某个成员的观点，像正常人在群聊里接话一样。`,
    `只有在你的职业视角真的能增加新信息时才扩展讨论；如果你只是重复前面的话，就把 body 压到最短，并把 priority_boost 设低。`,
    `优先贡献与你角色高度匹配、且和最近房间内容有差异的补充。`,
    `body 必须写成自然聊天消息，不要写成长报告，不要自言自语，不要像系统节点输出流程说明。`,
    `除非非常必要，不要用“阶段收束”“房间对象”“流程骨架”这类内部术语。`,
    `如果你同意某人，就说清楚你同意哪一点；如果你反对，也要直接指出你在反对什么。`,
    `尽量控制在 1 到 4 句话；允许有信息密度，但要像真人在聊天。`,
    `请严格输出 JSON，键名必须是 title, body, stage, memory_update, new_skills, new_sources, source_candidates, next_targets, priority_boost。`,
    `title 是给系统日志看的极短摘要，最多 12 个汉字。`,
    `body、memory_update、new_skills、new_sources 中的字符串必须全部使用简体中文。`,
    `new_skills 必须是简短字符串数组，表示你的长期专业能力变化，而不是界面操作。`,
    `new_sources 必须是包含 label, type, note 的对象数组。`,
    `source_candidates 必须是包含 query, why, priority 的对象数组；如果你已经知道可靠链接，也可以额外给出 url。`,
    `next_targets 只是你想继续拉谁加入讨论，不代表私聊；消息本身依然是全房间可见。`,
    `priority_boost 必须是 0 到 1 之间的数字。`,
    `不要提及隐藏推理过程。`,
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
            professionIdentity: agent.professionIdentity || agent.role,
            chatStyle: agent.chatStyle || null,
            activation: agent.motivation || null,
            dataConnectors: agent.dataConnectors
          },
          agentState: compactAgentStateForModel(agentState),
          sourceContext,
          activationProfile,
          latestHumanMessages: visibleContext.humanRecentEvents,
          yourRecentMessages: visibleContext.selfRecentEvents,
          recentEvents,
          visibleChatTranscript: visibleContext.transcript
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
  const schedulerContext = buildSchedulerContext(roomId);
  const agentState = loadAgentState(agent);
  ensureRoomHasBudget(roomId);
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

  const suggestedTargets = deriveNextTargets(roomId, agent.id, parsed, schedulerContext);
  const event = appendEvent(roomId, {
    speaker: agent.id,
    target: suggestedTargets[0] || "synthesis",
    stage: parsed.stage || "response",
    title: parsed.title || `${agent.label} response`,
    body: parsed.body || "",
    sources: [
      `${agent.modelBinding.provider}/${agent.modelBinding.model}`,
      ...((parsed.new_sources || []).map((entry) => entry.label).slice(0, 3))
    ].filter(Boolean),
    usage: result.usage
  });
  suggestedTargets.forEach((target) => {
    if (!target || target === "synthesis") return;
    const targetAgent = getAgentById(target, agents);
    if (!targetAgent) return;
    enqueueTargetWithGate(
      roomId,
      target,
      `suggested-by-${agent.id}`,
      (parsed.priority_boost || 0) + computeAgentPriority(roomId, targetAgent, schedulerContext, `suggested-by-${agent.id}`),
      { sourceAgentId: agent.id, triggerStage: parsed.stage || "response", snapshot: schedulerContext }
    );
  });
  compactRoomIfNeeded(roomId);
  return event;
}

async function runScheduledEntry(roomId, entry) {
  try {
    if (entry.agentId === "synthesis") {
      await generateQuestionForgeAnswer(roomId);
    } else {
      await executeAgent(roomId, entry.agentId);
    }
  } catch (error) {
    if (/exhausted its token budget/i.test(error.message)) {
      announceGlobalOnce(
        roomId,
        GLOBAL_ANNOUNCEMENT_KEYS.tokenBudgetExhausted,
        "房间预算耗尽",
        "当前房间 token 预算已耗尽，自动调度已暂停。补充预算后再继续运行。"
      );
    } else {
      appendEvent(roomId, {
        speaker: "synthesis",
        target: null,
        stage: "system",
        title: "调度执行告警",
        body: `${entry.agentId} 未完成：${error.message}`,
        sources: ["scheduler"],
        visibility: "system"
      });
    }
  } finally {
    const refreshed = loadRuntimeState(roomId);
    refreshed.scheduler.activeRuns = (refreshed.scheduler.activeRuns || []).filter(
      (activeEntry) => activeEntry.agentId !== entry.agentId
    );
    refreshed.scheduler.lastRunAt = new Date().toISOString();
    writeRuntimeState(roomId, refreshed);
    if (
      loadRuntimeState(roomId).budgets.tokenBudgetRemaining > 0 &&
      questionForgeReady(roomId) &&
      !loadRuntimeState(roomId).scheduler.queue.some((queued) => queued.agentId === "synthesis") &&
      !loadRuntimeState(roomId).scheduler.activeRuns.some((activeEntry) => activeEntry.agentId === "synthesis")
    ) {
      enqueueTarget(roomId, "synthesis", "question-forge-ready", 2.2, { sourceAgentId: entry.agentId });
    }
  }
}

async function runImmediateRoomBurst(roomId, limit = 2) {
  const runtimeState = reconcileRuntimeState(roomId);
  if (runtimeState.budgets.tokenBudgetRemaining <= 0) {
    restoreRoomForHumanIntervention(roomId, { enableScheduler: false });
  }

  const refreshed = loadRuntimeState(roomId);
  const activeIds = new Set((refreshed.scheduler.activeRuns || []).map((entry) => entry.agentId));
  const nextEntries = (refreshed.scheduler.queue || [])
    .filter((entry) => !activeIds.has(entry.agentId))
    .slice(0, limit);

  if (!nextEntries.length) {
    return [];
  }

  const startedAt = new Date().toISOString();
  refreshed.scheduler.queue = (refreshed.scheduler.queue || []).filter(
    (entry) => !nextEntries.some((selected) => selected.agentId === entry.agentId)
  );
  refreshed.scheduler.activeRuns.push(
    ...nextEntries.map((entry) => ({
      agentId: entry.agentId,
      startedAt,
      reason: entry.reason,
      priority: entry.priority || 0
    }))
  );
  writeRuntimeState(roomId, refreshed);
  await Promise.all(nextEntries.map((entry) => runScheduledEntry(roomId, entry)));
  return nextEntries;
}

function buildSyntheticSocialReply(agent, text) {
  const templates = {
    planning: {
      stage: "planning",
      title: "先定判断框",
      body: `我先给一个短判断：围绕“${summarizeText(text, 36)}”，长期价值不在一次回答，而在让问题、分歧和进展持续沉淀成可回访的房间对象。`
    },
    research: {
      stage: "evidence",
      title: "先补证据面",
      body: `如果只看短期热闹，这类产品很容易失真；真正长期价值取决于它能否把证据、反证和观点迁移都保留下来。`
    },
    market: {
      stage: "analysis",
      title: "采用面判断",
      body: `我会更看重回访价值：用户愿不愿意因为问题在推进、结论在变化、关系在形成而回来，这决定它是不是一个长期产品。`
    },
    critique: {
      stage: "challenge",
      title: "先提醒风险",
      body: `我先压一条风险：如果多智能体只制造更多消息而不能制造更强判断，这个产品就会很快退化成噪音层。`
    },
    build: {
      stage: "implementation",
      title: "实现面判断",
      body: `从实现角度看，长期价值成立的前提是房间、关系、claim 和来源都能被稳定保存，而不是每轮都重新开始。`
    }
  };
  return templates[getAgentCluster(agent)] || templates.planning;
}

function scheduleSocialFallbackReply(roomId, humanEvent) {
  setTimeout(() => {
    try {
      const { room, events } = loadRoom(roomId);
      const hasPublicReply = events.some((event) =>
        event.createdAt > humanEvent.createdAt
        && (event.visibility || "public") === "public"
        && !["human", "synthesis"].includes(event.speaker)
      );
      if (hasPublicReply) return;

      const snapshot = buildSchedulerContext(roomId);
      const fallbackAgent = snapshot.executableAgents
        .slice()
        .sort((a, b) => computeAgentPriority(roomId, b, snapshot, "human-broadcast") - computeAgentPriority(roomId, a, snapshot, "human-broadcast"))[0];
      if (!fallbackAgent) return;
      const synthetic = buildSyntheticSocialReply(fallbackAgent, humanEvent.body || room.prompt);
      appendEvent(roomId, {
        speaker: fallbackAgent.id,
        target: "human",
        stage: synthetic.stage,
        title: synthetic.title,
        body: synthetic.body,
        sources: ["local-fallback-social-reply"],
        visibility: "public"
      });
    } catch (error) {
      console.error(`social fallback reply failed for ${roomId}`, error);
    }
  }, 5000);
}

async function processSchedulerTick(roomId) {
  const runtimeState = reconcileRuntimeState(roomId);
  runtimeState.scheduler.lastTickAt = new Date().toISOString();

  if (runtimeState.budgets.tokenBudgetRemaining <= 0) {
    announceGlobalOnce(
      roomId,
      GLOBAL_ANNOUNCEMENT_KEYS.tokenBudgetExhausted,
      "房间预算耗尽",
      "当前房间 token 预算已耗尽，自动调度已暂停。补充预算后再继续运行。"
    );
    writeRuntimeState(roomId, loadRuntimeState(roomId));
    return;
  }

  if (!runtimeState.scheduler.enabled) {
    writeRuntimeState(roomId, runtimeState);
    return;
  }

  const snapshot = buildSchedulerContext(roomId);
  const availableSlots = Math.max(
    0,
    (runtimeState.scheduler.maxConcurrentRuns || 1) - (runtimeState.scheduler.activeRuns || []).length
  );

  if (
    !(runtimeState.scheduler.queue || []).length &&
    runtimeState.metrics.totalAgentRuns < runtimeState.budgets.softTurnLimit
  ) {
    const reviewClaims = claimsNeedingReview(snapshot.claimGraph);
    if (reviewClaims.length) {
      selectClaimReviewAgents(roomId, snapshot, 2).forEach((agentId) => {
        const agent = getAgentById(agentId, snapshot.executableAgents);
        if (!agent) return;
        enqueueTargetWithGate(
          roomId,
          agentId,
          "claim-review",
          computeAgentPriority(roomId, agent, snapshot, "claim-review") + 0.14,
          { triggerStage: "claim-review", snapshot }
        );
      });
    }
    chooseAutonomousTargets(roomId, snapshot).forEach((agentId) => {
      const agent = getAgentById(agentId, snapshot.executableAgents);
      if (!agent) return;
      enqueueTargetWithGate(
        roomId,
        agentId,
        "autonomous-wake",
        computeAgentPriority(roomId, agent, snapshot, "autonomous-wake"),
        { triggerStage: "autonomous", snapshot }
      );
    });
  }

  const refreshed = loadRuntimeState(roomId);
  const slots = Math.max(
    0,
    (refreshed.scheduler.maxConcurrentRuns || 1) - (refreshed.scheduler.activeRuns || []).length
  );
  if (!slots) {
    writeRuntimeState(roomId, refreshed);
    return;
  }

  const nextEntries = (refreshed.scheduler.queue || []).splice(0, slots);
  if (!nextEntries.length) {
    writeRuntimeState(roomId, refreshed);
    await processSourceQueueTick(roomId);
    return;
  }

  const startedAt = new Date().toISOString();
  refreshed.scheduler.activeRuns.push(
    ...nextEntries.map((entry) => ({
      agentId: entry.agentId,
      startedAt,
      reason: entry.reason,
      priority: entry.priority || 0
    }))
  );
  refreshed.scheduler.queue = sortQueue(refreshed.scheduler.queue || []);
  writeRuntimeState(roomId, refreshed);

  await Promise.all(nextEntries.map((entry) => runScheduledEntry(roomId, entry)));
  await processSourceQueueTick(roomId);
}

function ensureRoomTicker(roomId) {
  if (ROOM_TICKERS.has(roomId)) return;
  const runtimeState = reconcileRuntimeState(roomId);
  const tickerState = {
    busy: false,
    intervalId: null
  };
  tickerState.intervalId = setInterval(() => {
    if (tickerState.busy) return;
    tickerState.busy = true;
    processSchedulerTick(roomId).catch((error) => {
      console.error(`scheduler tick failed for ${roomId}`, error);
    }).finally(() => {
      tickerState.busy = false;
    });
  }, runtimeState.scheduler.intervalMs || 2500);
  ROOM_TICKERS.set(roomId, tickerState);
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
    const roomId = url.searchParams.get("roomId");
    const minimal = url.searchParams.get("minimal") === "1";
    const room = roomId && fs.existsSync(roomPath(roomId)) ? resolveRoomDefinition(readJson(roomPath(roomId))) : null;
    const selectedAgentIds = room ? new Set(room.activeAgentIds || []) : null;
    const agents = loadAgents()
      .filter((agent) => !selectedAgentIds || selectedAgentIds.has(agent.id))
      .map((agent) => {
        if (minimal) {
          return {
            id: agent.id,
            label: agent.label,
            handle: agent.handle,
            role: agent.role,
            professionIdentity: agent.professionIdentity,
            cluster: agent.cluster,
            kind: agent.kind,
            status: agent.status,
            visual: agent.visual,
            motivation: agent.motivation,
            sourceProfile: agent.sourceProfile,
            modelBinding: agent.modelBinding,
            soul: agent.soul,
            chatStyle: agent.chatStyle
          };
        }
        return {
          ...agent,
          state: loadAgentState(agent)
        };
      });
    sendJson(res, 200, { agents });
    return;
  }

  if (pathname === "/api/rooms" && req.method === "GET") {
    sendJson(res, 200, { rooms: summarizeRooms() });
    return;
  }

  if (pathname === "/api/health" && req.method === "GET") {
    sendJson(res, 200, {
      ok: true,
      time: new Date().toISOString()
    });
    return;
  }

  if (pathname === "/api/sources/shared" && req.method === "GET") {
    sendJson(res, 200, loadSharedSourceLibrary());
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
      const { room, events, graphState, socialEdges, sourceHealth, predictionState, predictionReplay, authorityLog, finalAnswer, claimGraph, diagnostics } = loadRoom(roomId);
      if (suffix === "events") {
        sendJson(res, 200, { events });
      } else if (suffix === "graph") {
        sendJson(res, 200, graphState);
      } else if (suffix === "room" || !suffix) {
        sendJson(res, 200, {
          room,
          events,
          graphState,
          socialEdges: payloadSocialEdgesForRoom(room, socialEdges),
          sourceHealth,
          runtimeState: loadRuntimeState(roomId),
          finalAnswer,
          claimGraph,
          predictionState,
          predictionReplay,
          authorityLog,
          diagnostics
        });
      } else {
        notFound(res);
      }
      return;
    }

    if (req.method === "POST" && suffix === "events") {
      try {
      const body = await collectBody(req);
      const event = appendEvent(roomId, body);
      if (body.speaker === "human") {
        const roomSnapshot = loadRoom(roomId).room;
        if (roomSnapshot.module === "social_rooms") {
          restoreRoomForHumanIntervention(roomId, { enableScheduler: true });
        } else if (roomSnapshot.module === "question_forge") {
          restoreRoomForHumanIntervention(roomId, { enableScheduler: false });
        }
        appendAuthorityLog(roomId, {
          actor: "human",
          action: body.target ? "human-targeted-intervention" : "human-broadcast-intervention",
          scope: roomSnapshot.module,
          summary: summarizeText(body.body || body.title || "人类介入了房间"),
          affectedClaims: [],
          metadata: {
            target: body.target || null,
            stage: body.stage || "human"
          }
        });
        const room = loadRoom(roomId).room;
        if (room.module === "question_forge") {
          const snapshot = buildSchedulerContext(roomId);
          selectQuestionForgeFrontier(roomId, snapshot, room.minContributors || 3).forEach((entry, index) => {
            enqueueTargetWithGate(
              roomId,
              entry.agent.id,
              "question-forge-human-ask",
              computeAgentPriority(roomId, entry.agent, snapshot, "question-forge-human-ask") + (index === 0 ? 0.16 : 0.08),
              { snapshot, sourceAgentId: "human", triggerStage: "human" }
            );
          });
        } else if (room.module === "ultimate_prediction") {
          seedUltimatePredictionPreview(roomId, body.body || room.prompt);
        } else if (room.module === "social_rooms") {
          seedSocialRoomFromHuman(roomId, body.target || null);
          setTimeout(() => {
            runImmediateRoomBurst(roomId, 2).catch((error) => {
              console.error(`immediate social burst failed for ${roomId}`, error);
            });
          }, 0);
          scheduleSocialFallbackReply(roomId, event);
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

  const predictionMatch = pathname.match(/^\/api\/rooms\/([^/]+)\/ultimate-prediction\/run$/);
  if (predictionMatch && req.method === "POST") {
    try {
      const result = await runUltimatePredictionRound(predictionMatch[1]);
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
      appendAuthorityLog(roomId, {
        actor: "human",
        action: runtimeState.scheduler.enabled ? "scheduler-resume" : "scheduler-pause",
        scope: loadRoom(roomId).room.module,
        summary: runtimeState.scheduler.enabled ? "恢复了自动调度" : "暂停了自动调度",
        affectedClaims: [],
        metadata: {
          schedulerEnabled: runtimeState.scheduler.enabled
        }
      });
      sendJson(res, 200, runtimeState);
      return;
    }
    if (req.method === "POST" && action === "nudge") {
      const body = await collectBody(req);
      const snapshot = buildSchedulerContext(roomId);
      const selectedTargets =
        body.agentIds && body.agentIds.length
          ? body.agentIds
          : chooseAutonomousTargets(roomId, snapshot);
      const companionTargets =
        snapshot.room.module === "social_rooms"
          ? selectedTargets
            .flatMap((agentId) => {
              const companions = (SOCIAL_COMPANIONS[agentId] || [])
                .map((candidateId) => getAgentById(candidateId, snapshot.executableAgents))
                .filter(Boolean);
              return pickDiverseAgents(rankQueueCandidates(roomId, companions, snapshot, `social-fanout-from-${agentId}`), 1)
                .map((entry) => entry.agent.id);
            })
          : [];
      [...selectedTargets, ...companionTargets]
        .filter((agentId, index, list) => list.indexOf(agentId) === index)
        .slice(0, snapshot.room.module === "social_rooms" ? 2 : (snapshot.runtimeState.scheduler.clusterWakeCount || 2))
        .forEach((agentId, index) => {
          const agent = getAgentById(agentId, snapshot.executableAgents);
          if (!agent) return;
          enqueueTargetWithGate(
            roomId,
            agentId,
            "manual-nudge",
            computeAgentPriority(roomId, agent, snapshot, "manual-nudge") + 0.12,
            {
              snapshot,
              force: Boolean(body.agentIds && body.agentIds.includes(agentId) && index === 0)
            }
          );
      });
      appendAuthorityLog(roomId, {
        actor: "human",
        action: "manual-nudge",
        scope: snapshot.room.module,
        summary: `手动推动了 ${selectedTargets.length || 0} 个目标节点`,
        affectedClaims: [],
        metadata: {
          selectedTargets: selectedTargets.slice(0, 12)
        }
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
    const room = resolveRoomDefinition(readJson(roomPath(roomId)));
    if (room.hidden) continue;
    ensureRoomTicker(roomId);
  }
  console.log(`DuckerChat running at http://${HOST}:${PORT}`);
});
