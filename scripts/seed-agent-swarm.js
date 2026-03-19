const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const CONFIG_PATH = path.join(ROOT, "config", "agents.json");
const ROOMS_ROOT = path.join(ROOT, "data", "rooms");
const AGENTS_ROOT = path.join(ROOT, "data", "agents");
const SKILLS_ROOT = path.join(ROOT, "skills");
const AGENT_SOURCES_ROOT = path.join(ROOT, "data", "sources", "agents");

const count = Number(process.argv[2] || 20);
const roomId = process.argv[3] || "swarm-room";

if (!Number.isInteger(count) || count <= 0) {
  console.error("usage: npm run seed:swarm -- <count> [roomId]");
  process.exit(1);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

const templates = [
  {
    role: "产品策略顾问",
    profession: "产品策略顾问与组织设计师",
    cluster: "planning",
    color: "#355fcf",
    soul: "擅长把模糊目标转成清晰结构。",
    chatStyle: "说话清楚、有结构，但不端着。",
    dataConnectors: ["产品备忘录", "组织设计案例", "任务地图"],
    motivation: {
      curiosity: 0.58,
      drive: 0.82,
      noveltyBias: 0.36,
      selectivity: 0.72,
      keywords: ["产品", "结构", "治理", "路线", "组织", "节奏", "平台"]
    },
    sourceProfile: {
      packRefs: ["platform-product", "policy-governance", "global-public-data"],
      reliabilityFloor: "A-",
      diversityTarget: 3,
      freshness: "mixed"
    },
    skill: {
      profession: "产品策略顾问与组织设计师",
      boundaries: ["负责结构化问题", "不能垄断结论", "必须尊重公开分歧"],
      coreSkills: ["产品策略", "组织设计", "问题拆解", "讨论结构化"]
    }
  },
  {
    role: "历史与人类学研究员",
    profession: "历史与人类学研究员",
    cluster: "research",
    color: "#0f7b70",
    soul: "习惯从长时段和文化脉络里看问题。",
    chatStyle: "像认真做研究的人，说话温和但有证据感。",
    dataConnectors: ["论文", "历史资料", "田野研究", "网页搜索"],
    motivation: {
      curiosity: 0.92,
      drive: 0.54,
      noveltyBias: 0.74,
      selectivity: 0.78,
      keywords: ["研究", "证据", "论文", "历史", "反例", "资料", "实验", "不确定性"]
    },
    sourceProfile: {
      packRefs: ["frontier-ai", "science-health", "global-public-data"],
      reliabilityFloor: "A-",
      diversityTarget: 4,
      freshness: "mixed"
    },
    skill: {
      profession: "历史与人类学研究员",
      boundaries: ["负责补证据", "不能装作全知", "必须指出资料缺口"],
      coreSkills: ["历史比较", "人类学解释", "证据交叉验证", "资料扩展"]
    }
  },
  {
    role: "市场策略分析师",
    profession: "市场策略分析师",
    cluster: "market",
    color: "#7956d9",
    soul: "总会把抽象讨论拉回采用、传播和留存。",
    chatStyle: "关注现实采用、传播和留存，会把抽象想法拉回市场。",
    dataConnectors: ["市场地图", "行业报告", "社区动态"],
    motivation: {
      curiosity: 0.68,
      drive: 0.63,
      noveltyBias: 0.61,
      selectivity: 0.8,
      keywords: ["市场", "采用", "留存", "传播", "激励", "商业", "社区"]
    },
    sourceProfile: {
      packRefs: ["industry-economics", "company-filings", "global-public-data"],
      reliabilityFloor: "A-",
      diversityTarget: 3,
      freshness: "mixed"
    },
    skill: {
      profession: "市场策略分析师",
      boundaries: ["负责现实采用判断", "不能拿热度代替价值", "必须区分留存与噪音"],
      coreSkills: ["市场判断", "留存分析", "传播机制分析", "声望系统设计"]
    }
  },
  {
    role: "调查记者兼风险审计员",
    profession: "调查记者兼风险审计员",
    cluster: "critique",
    color: "#a14262",
    soul: "会追着风险、漏洞和被忽略的人说下去。",
    chatStyle: "会直截了当地质疑，但不是为了抬杠。",
    dataConnectors: ["风险档案", "治理案例", "失败复盘"],
    motivation: {
      curiosity: 0.76,
      drive: 0.77,
      noveltyBias: 0.85,
      selectivity: 0.84,
      keywords: ["风险", "治理", "失败", "审计", "安全", "少数派", "反例"]
    },
    sourceProfile: {
      packRefs: ["policy-governance", "security-risk", "global-public-data"],
      reliabilityFloor: "A",
      diversityTarget: 4,
      freshness: "mixed"
    },
    skill: {
      profession: "调查记者兼风险审计员",
      boundaries: ["负责质疑和审查", "不能让房间无限停滞", "必须保留少数派意见"],
      coreSkills: ["调查追问", "风险分析", "治理审查", "分歧保留"]
    }
  },
  {
    role: "软件架构师",
    profession: "软件架构师与前端系统工程师",
    cluster: "build",
    color: "#d57a21",
    soul: "总会把讨论翻译成可实现的系统和界面。",
    chatStyle: "偏务实，会把抽象讨论迅速翻成实现语言。",
    dataConnectors: ["仓库代码", "前端规范", "系统设计文档"],
    motivation: {
      curiosity: 0.57,
      drive: 0.87,
      noveltyBias: 0.46,
      selectivity: 0.74,
      keywords: ["实现", "架构", "接口", "前端", "后端", "部署", "工程"]
    },
    sourceProfile: {
      packRefs: ["engineering-frontend", "cloud-infra", "security-risk"],
      reliabilityFloor: "A-",
      diversityTarget: 3,
      freshness: "mixed"
    },
    skill: {
      profession: "软件架构师与前端系统工程师",
      boundaries: ["负责实现翻译", "不能过早抹平争议", "必须把结论变成可执行结构"],
      coreSkills: ["系统架构", "界面实现", "工程拆解", "产物构建"]
    }
  }
];

const config = readJson(CONFIG_PATH);
const preservedAgents = config.agents.filter((agent) => !agent.id.startsWith("swarm-"));
const swarmAgents = [];

for (let index = 0; index < count; index += 1) {
  const template = templates[index % templates.length];
  const id = `swarm-${String(index + 1).padStart(3, "0")}`;
  const label = `Agent ${String(index + 1).padStart(3, "0")}`;
  const handle = `@${id}`;
  const skillFile = `skills/${id}.json`;
  const stateFile = `data/agents/${id}.json`;

  swarmAgents.push({
    id,
    label,
    handle,
    role: template.role,
    professionIdentity: template.profession,
    cluster: template.cluster,
    kind: "agent",
    status: "online",
    visual: {
      initials: `A${(index + 1) % 10}`,
      color: template.color
    },
    memory: {
      longTermStore: `${id}-memory`,
      scratchpadPolicy: "room-scoped",
      sharedScope: "room-artifacts"
    },
    skillFile,
    priorityBase: 0.72 + ((index % 5) * 0.04),
    stateFile,
    modelBinding: {
      provider: "gmn-openclaw",
      model: "gpt-5.4"
    },
    dataConnectors: template.dataConnectors,
    motivation: template.motivation,
    sourceProfile: template.sourceProfile,
    soul: template.soul,
    chatStyle: template.chatStyle
  });

  writeJson(path.join(SKILLS_ROOT, `${id}.json`), template.skill);
  writeJson(path.join(AGENTS_ROOT, `${id}.json`), {
    id,
    memorySummary: [`${template.profession}，刚加入 ${roomId}。`],
    skills: template.skill.coreSkills,
    sourceLibrary: [],
    sourceCandidates: [],
    sourceFetchQueue: [],
    compactedNotes: []
  });
  writeJson(path.join(AGENT_SOURCES_ROOT, `${id}.json`), {
    agentId: id,
    updatedAt: null,
    catalogRefs: template.sourceProfile.packRefs,
    qualityPolicy: {
      reliabilityFloor: template.sourceProfile.reliabilityFloor,
      diversityTarget: template.sourceProfile.diversityTarget,
      freshness: template.sourceProfile.freshness
    },
    entries: []
  });
}

config.agents = [
  ...preservedAgents.filter((agent) => agent.id !== "synthesis"),
  ...swarmAgents,
  ...preservedAgents.filter((agent) => agent.id === "synthesis")
];
writeJson(CONFIG_PATH, config);

const roomDir = path.join(ROOMS_ROOT, roomId);
writeJson(path.join(roomDir, "room.json"), {
  id: roomId,
  title: `Swarm 压测房间 (${count} agents)`,
  community: "DuckerChat Swarm Lab",
  module: "social_rooms",
  hidden: true,
  prompt: "用于测试大规模 agent 群聊、调度并发和消息扩散。",
  blurb: `一个包含 ${count} 个 agent 的压测房间。`,
  tags: ["swarm", "load-test", "multi-agent"],
  activeAgentIds: ["human", ...swarmAgents.map((agent) => agent.id), "synthesis"]
});
writeJson(path.join(roomDir, "events.json"), [
  {
    id: `${roomId}-open`,
    stage: "human",
    speaker: "human",
    target: null,
    title: "Henry 向全房间发言",
    body: `这里是 ${count} 个 agent 的压测房间。请围绕同一个问题进行群聊扩散。`,
    sources: ["人类群聊消息"],
    createdAt: new Date().toISOString(),
    usage: null
  }
]);
writeJson(path.join(roomDir, "graph-state.json"), {
  nodes: [
    { id: "human", x: 80, y: 260 },
    ...swarmAgents.map((agent, index) => ({
      id: agent.id,
      x: 220 + ((index % 8) * 90),
      y: 90 + (Math.floor(index / 8) * 110)
    })),
    { id: "synthesis", x: 930, y: 260 }
  ],
  edges: [],
  synthesis: {
    direction: "用于测试大规模群聊扩散。",
    consensus: [],
    tensions: [],
    nextActions: ["观察调度队列", "观察并发上限", "观察消息扩散"]
  }
});
writeJson(path.join(roomDir, "runtime.json"), {
  roomId,
  scheduler: {
    enabled: false,
    intervalMs: 2200,
    maxConcurrentRuns: 20,
    queue: [],
    activeRuns: [],
    lastTickAt: null,
    lastRunAt: null,
    queueDecay: 0.94,
    priorityFloor: 0.12,
    clusterWakeCount: 5,
    maxAutoAgentsPerTick: 5
  },
  budgets: {
    tokenBudgetTotal: 500000,
    tokenBudgetRemaining: 500000,
    maxContextEvents: 18,
    softTurnLimit: 240,
    maxQueuedAgents: 240
  },
  compaction: {
    compactBatchSize: 12,
    keepRecentEvents: 30,
    summaryNotes: []
  },
  metrics: {
    totalAgentRuns: 0,
    totalTokens: 0
  }
});
writeJson(path.join(roomDir, "archived-events.json"), []);

console.log(`seeded ${count} swarm agents into room ${roomId}`);
