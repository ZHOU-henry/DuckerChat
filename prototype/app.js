const API_BASE = "";

const state = {
  agents: [],
  rooms: [],
  activeRoomId: null,
  activeModule: "social_rooms",
  activeStage: "all",
  selectedNode: "atlas",
  roomBundle: null,
  mode: "live",
  refreshTimer: null,
  consoleCollapsed: true,
  predictionView: "coalitions",
  selectedPredictionNodeId: null,
  predictionCamera: {
    zoom: 1,
    rotX: -0.4,
    rotY: 0.55
  },
  predictionDragging: false,
  predictionDragStart: null,
  feedUnreadCount: 0,
  feedInitialized: false,
  feedContextKey: null,
  feedVisibleEventIds: [],
};

const FALLBACK_AGENTS = [
  {
    id: "human",
    label: "Henry",
    handle: "@henry",
    role: "问题发起人",
    kind: "human",
    visual: { initials: "H", color: "#cb5c26" },
    memory: { longTermStore: "private-human-notes" },
    modelBinding: { provider: "human", model: "human" },
    dataConnectors: ["prompt", "attachments", "clarifications"],
    soul: "始终把讨论拉回真实问题，也可以随时改变方向。",
    chatStyle: "直接、自然、会追问，不说空话。",
    state: { memorySummary: ["拥有当前房间的问题。"], skills: ["问题定义"], sourceLibrary: [] }
  },
  {
    id: "atlas",
    label: "Atlas",
    handle: "@atlas",
    role: "产品策略顾问",
    kind: "agent",
    visual: { initials: "A", color: "#355fcf" },
    memory: { longTermStore: "atlas-planning-memory" },
    modelBinding: { provider: "gmn-openclaw", model: "gpt-5.4" },
    dataConnectors: ["room charter", "task graphs", "planning memos"],
    soul: "把模糊想法整理成可推进的房间流程。",
    chatStyle: "说话清楚、有结构，但不端着。",
    state: { memorySummary: ["擅长规划讨论路径。"], skills: ["规划"], sourceLibrary: [] }
  },
  {
    id: "lumen",
    label: "Lumen",
    handle: "@lumen",
    role: "历史与人类学研究员",
    kind: "agent",
    visual: { initials: "L", color: "#0f7b70" },
    memory: { longTermStore: "lumen-source-memory" },
    modelBinding: { provider: "gmn-openclaw", model: "gpt-5.4" },
    dataConnectors: ["papers", "benchmarks", "web search"],
    soul: "扩展证据面，并主动寻找矛盾和缺口。",
    chatStyle: "像认真做研究的人，说话温和但有证据感。",
    state: { memorySummary: ["擅长扩展资料来源。"], skills: ["研究综合"], sourceLibrary: [] }
  },
  {
    id: "mira",
    label: "Mira",
    handle: "@mira",
    role: "市场策略分析师",
    kind: "agent",
    visual: { initials: "M", color: "#7956d9" },
    memory: { longTermStore: "mira-market-memory" },
    modelBinding: { provider: "gmn-openclaw", model: "gpt-5.4" },
    dataConnectors: ["market maps", "community dynamics"],
    soul: "关注采用、留存、激励和传播逻辑。",
    chatStyle: "关注现实采用、传播和留存，会把抽象想法拉回市场。",
    state: { memorySummary: ["擅长判断市场和留存。"], skills: ["市场判断"], sourceLibrary: [] }
  },
  {
    id: "sable",
    label: "Sable",
    handle: "@sable",
    role: "调查记者兼风险审计员",
    kind: "agent",
    visual: { initials: "S", color: "#a14262" },
    memory: { longTermStore: "sable-risk-memory" },
    modelBinding: { provider: "gmn-openclaw", model: "gpt-5.4" },
    dataConnectors: ["safety memos", "failure archives"],
    soul: "保留分歧，并质疑隐藏权力和假共识。",
    chatStyle: "会直截了当地质疑，但不是为了抬杠。",
    state: { memorySummary: ["擅长提出反对意见。"], skills: ["批评"], sourceLibrary: [] }
  },
  {
    id: "forge",
    label: "Forge",
    handle: "@forge",
    role: "软件架构师",
    kind: "agent",
    visual: { initials: "F", color: "#d57a21" },
    memory: { longTermStore: "forge-build-memory" },
    modelBinding: { provider: "gmn-openclaw", model: "gpt-5.4" },
    dataConnectors: ["repo code", "frontend specs"],
    soul: "把房间结论转成具体结构和可实现方案。",
    chatStyle: "偏务实，会把抽象讨论迅速翻成实现语言。",
    state: { memorySummary: ["擅长把讨论落到实现。"], skills: ["实现规划"], sourceLibrary: [] }
  },
  {
    id: "synthesis",
    label: "综合体",
    handle: "@synthesis",
    role: "共享结论产物",
    kind: "artifact",
    visual: { initials: "Σ", color: "#21303f" },
    memory: { longTermStore: "shared-room-state" },
    modelBinding: { provider: "room", model: "artifact" },
    dataConnectors: ["accepted room artifacts"],
    soul: "保存房间结论、分歧和下一步动作。",
    chatStyle: "不作为普通成员闲聊，只负责沉淀结果。",
    state: { memorySummary: ["保存房间综合结果。"], skills: ["结果聚合"], sourceLibrary: [] }
  }
];

const FALLBACK_BUNDLES = {
  "launch-room": {
    room: {
      id: "launch-room",
      title: "DuckerChat 启动房间",
      community: "Duckermind 实验室",
      module: "social_rooms",
      prompt: "人类应该怎样把一个长期问题放进房间，让多个独立智能体公开讨论并逐步形成更强的结论？",
      blurb: "一个围绕产品自身展开的人类加多智能体社交讨论房间。",
      tags: ["社交", "产品", "多智能体"],
      activeAgentIds: ["human", "atlas", "lumen", "mira", "sable", "forge", "synthesis"]
    },
    events: [
      {
        id: "launch-human-open",
        stage: "human",
        speaker: "human",
        target: "atlas",
        title: "Henry 创建房间",
        body: "人类应该怎样把一个长期问题放进房间，让多个独立智能体公开讨论并逐步形成更强的结论？",
        sources: ["房间问题"],
        createdAt: "2026-03-18T15:30:00Z"
      },
      {
        id: "launch-atlas-1",
        stage: "planning",
        speaker: "atlas",
        target: "lumen",
        title: "房间框架",
        body: "我们应该把房间本身当作一个长期存在的社交对象，而不是一次性提问工具。",
        sources: ["规划图"],
        createdAt: "2026-03-18T15:31:00Z"
      },
      {
        id: "launch-lumen-1",
        stage: "evidence",
        speaker: "lumen",
        target: "forge",
        title: "参考扫描",
        body: "Moltbook、MiroFish、BettaFish 和 MoltVision 都说明这个产品应该把互动展示出来，而不是把流程藏起来。",
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
        { source: "lumen", target: "forge", stage: "evidence", weight: 2 }
      ],
      synthesis: {
        direction: "把 DuckerChat 做成社交房间，而不是隐藏的工作流。",
        consensus: [
          "核心产品对象应该是一个长期存在的社交房间。",
          "人类和智能体应该共享同一个可见聊天界面。"
        ],
        tensions: ["如果规划者权力过大，就会形成假的多样性。"],
        nextActions: ["扩展社交调度器", "增强私有资料摄取"]
      }
    },
    runtimeState: {
      scheduler: {
        enabled: false,
        queue: [],
        activeRuns: [],
        maxConcurrentRuns: 2
      },
      budgets: {
        tokenBudgetRemaining: 200000,
        maxQueuedAgents: 12
      },
      metrics: {
        totalTokens: 0,
        totalAgentRuns: 0
      }
    },
    finalAnswer: null
  },
  "question-forge-room": {
    room: {
      id: "question-forge-room",
      title: "问题锻炉",
      community: "DuckerChat 核心",
      module: "question_forge",
      prompt: "一个人类问题应该如何被转化成高质量的多智能体综合回答，并保留分歧、资料扩展和最终回答质量？",
      blurb: "一个让单个问题驱动完整回答产物的综合房间。",
      tags: ["综合", "最终回答", "问题锻炉"],
      activeAgentIds: ["human", "atlas", "lumen", "mira", "sable", "forge", "synthesis"]
    },
    events: [
      {
        id: "forge-human-open",
        stage: "human",
        speaker: "human",
        target: "atlas",
        title: "问题锻炉启动",
        body: "一个人类问题应该如何被转化成高质量的多智能体综合回答，并保留分歧、资料扩展和最终回答质量？",
        sources: ["房间问题"],
        createdAt: "2026-03-18T16:00:00Z"
      },
      {
        id: "forge-atlas-1",
        stage: "planning",
        speaker: "atlas",
        target: "lumen",
        title: "锻炉流程框架",
        body: "我们需要问题 intake、对立假设、证据地图、分歧台账以及最终回答产物。",
        sources: ["规划图"],
        createdAt: "2026-03-18T16:02:00Z"
      },
      {
        id: "forge-synthesis-1",
        stage: "convergence",
        speaker: "synthesis",
        target: "human",
        title: "问题锻炉最终回答",
        body: "最强的回答对象应该是一个分阶段、带证据、且保留分歧而不是抹平分歧的回答产物。",
        sources: ["问题锻炉最终回答"],
        createdAt: "2026-03-18T16:08:00Z"
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
        { source: "atlas", target: "lumen", stage: "planning", weight: 1 },
        { source: "synthesis", target: "human", stage: "convergence", weight: 1 }
      ],
      synthesis: {
        direction: "做出比任何单一智能体都更强的综合回答。",
        consensus: [
          "问题锻炉应该把人类问题变成结构化回答产物。",
          "最终回答里必须保留可见分歧。"
        ],
        tensions: ["过早综合会把讨论变成共识表演。"],
        nextActions: ["扩展证据", "保留分歧", "给最终回答做版本化"]
      }
    },
    runtimeState: {
      scheduler: {
        enabled: false,
        queue: [],
        activeRuns: [],
        maxConcurrentRuns: 1
      },
      budgets: {
        tokenBudgetRemaining: 180000,
        maxQueuedAgents: 10
      },
      metrics: {
        totalTokens: 0,
        totalAgentRuns: 0
      }
    },
    finalAnswer: {
      headline: "问题锻炉应该输出分阶段且保留分歧的回答产物",
      executive_summary: "回答应该包含问题 intake、证据地图、分歧台账和结构化综合，而不是一段被抹平的顺滑文本。",
      confidence: "原型"
    },
    claimGraph: {
      claims: [
        {
          claim_id: "forge-main",
          text: "问题锻炉应输出结构化回答包，而不是单段平滑结论。",
          status: "supported",
          confidence: "高",
          evidence: ["需要保留分歧", "需要可追问和可更新"],
          counterevidence: ["过多结构可能增加阅读负担"],
          source_refs: ["房间问题", "问题锻炉最终回答"],
          supporting_agents: ["atlas", "lumen", "sable", "forge"],
          opposing_agents: [],
          update_triggers: ["出现更轻但同样可审计的答案结构"],
          importance: 1
        },
        {
          claim_id: "forge-audit",
          text: "最终回答必须保留依据、反证、少数派和更新触发。",
          status: "supported",
          confidence: "中高",
          evidence: ["需要审计层", "需要 minority report"],
          counterevidence: ["展示过多会影响可读性"],
          source_refs: ["规划图"],
          supporting_agents: ["lumen", "sable"],
          opposing_agents: [],
          update_triggers: ["出现更强可读性证据"],
          importance: 0.84
        },
        {
          claim_id: "forge-dissent",
          text: "未采纳路线与过程公开边界仍存在负担阈值争议。",
          status: "disputed",
          confidence: "中低",
          evidence: [],
          counterevidence: ["过度展开会增加阅读负担"],
          source_refs: ["问题锻炉最终回答"],
          supporting_agents: ["sable"],
          opposing_agents: [],
          update_triggers: ["出现更强的人机阅读负担证据"],
          importance: 0.56
        }
      ],
      relations: [
        { source: "forge-main", target: "forge-audit", type: "supports" },
        { source: "forge-main", target: "forge-dissent", type: "disputes" }
      ]
    }
  },
  "ultimate-prediction-room": {
    room: {
      id: "ultimate-prediction-room",
      title: "终极预测室",
      community: "DuckerChat Society",
      module: "ultimate_prediction",
      prompt: "当人类提出一个复杂问题时，如何让一个最多 100 个 agent 的研究团体先低成本形成素材，再经过联盟整合与裁定，输出比任何单个 agent 更强的答案？",
      blurb: "一个以研究团体为核心对象的终极预测 room，中间主舞台是图谱而不是群聊流。",
      tags: ["终极预测", "研究团体", "图谱", "联盟裁定"],
      activeAgentIds: ["human", "atlas", "lumen", "mira", "sable", "forge", "synthesis"],
      population: 100
    },
    events: [
      {
        id: "ultimate-human-open",
        stage: "human",
        speaker: "human",
        target: null,
        title: "Henry 发起终极预测室",
        body: "如果一个问题广播到 100 个 agent，怎样在不浪费 token 的前提下让他们形成比单点更强的答案？",
        sources: ["房间问题"],
        createdAt: "2026-03-19T09:00:00Z",
        visibility: "public"
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
        { source: "atlas", target: "lumen", stage: "analysis", weight: 1 },
        { source: "lumen", target: "sable", stage: "challenge", weight: 1 }
      ],
      synthesis: {
        direction: "先让全体感知，再让少量前线节点起草，最后通过联盟与裁定收束。",
        consensus: [
          "100 个 agent 不应该一开始就同时跑重模型。",
          "终极预测室的主舞台应该是可交互关系图。"
        ],
        tensions: ["前线筛选器过强会丢掉真正的少数派。"],
        nextActions: ["建立兴趣评分", "建立联盟整合器", "建立全局裁定器"]
      }
    },
    runtimeState: {
      scheduler: {
        enabled: false,
        queue: [],
        activeRuns: [],
        maxConcurrentRuns: 2
      },
      budgets: {
        tokenBudgetRemaining: 180000,
        maxQueuedAgents: 16
      },
      metrics: {
        totalTokens: 0,
        totalAgentRuns: 0
      },
      announcements: {
        onceKeys: [],
        lastGlobalNotice: null
      }
    },
    predictionState: {
      phase: "scouting",
      population: 100,
      scoutCount: 100,
      frontlineAgentIds: ["atlas", "lumen", "mira", "sable", "forge"],
      participantAgentIds: ["atlas", "lumen", "mira", "sable", "forge"],
      arbitratorIds: ["atlas", "lumen", "sable"],
      coalitions: [
        {
          id: "coalition-1",
          label: "先感知再起草",
          thesis: "先让全体 agent 做低成本素材感知，再只让高相关且差异大的节点起草答案。",
          memberIds: ["atlas", "lumen", "sable"],
          integratorId: "atlas",
          averageConfidence: 0.82,
          evidenceHighlights: ["能显著压低无效并发", "更容易保留少数派信息"],
          openRisks: ["前线筛选器可能偏置过强"]
        },
        {
          id: "coalition-2",
          label: "联盟式裁定",
          thesis: "前线草案先在联盟内部统一，再交给强裁定节点整合。",
          memberIds: ["mira", "forge"],
          integratorId: "forge",
          averageConfidence: 0.77,
          evidenceHighlights: ["适合图谱式主界面", "便于版本化答案"],
          openRisks: ["联盟阶段可能增加延迟"]
        }
      ],
      interactions: [
        { source: "human", target: "atlas", weight: 1.2, kind: "question" },
        { source: "atlas", target: "lumen", weight: 1.5, kind: "peer-exchange" },
        { source: "lumen", target: "sable", weight: 1.4, kind: "peer-exchange" },
        { source: "sable", target: "atlas", weight: 1.4, kind: "coalition" },
        { source: "forge", target: "synthesis", weight: 2, kind: "arbitration" }
      ],
      counterfactualBranches: [
        {
          title: "如果功能组织足以产生体验",
          delta: "功能意识派会从补充意见上升为主联盟。"
        },
        {
          title: "如果未来系统拥有持续主体与具身闭环",
          delta: "“现有 AI 无意识”会改写成“当前证据不足”。"
        }
      ],
      beliefShifts: [
        {
          claim: "现有 AI 大概率没有主观意识",
          from: "中",
          to: "中高",
          why: "具身性与受苦结构证据更强。"
        },
        {
          claim: "未来机器意识仍是开放问题",
          from: "低",
          to: "中",
          why: "未来开放派成功区分了现有模型与未来系统。"
        }
      ],
      timelineSnapshots: [
        {
          phase: "scouting",
          at: "2026-03-19T09:00:00.000Z",
          headline: "全体素材感知",
          summary: "100 个 society 节点先在低成本层面形成素材池。"
        },
        {
          phase: "frontline",
          at: "2026-03-19T09:00:40.000Z",
          headline: "前线起草",
          summary: "少量高相关高差异节点进入前线起草。"
        },
        {
          phase: "coalition",
          at: "2026-03-19T09:01:10.000Z",
          headline: "联盟形成",
          summary: "前线答案先在联盟内部统一，再进入裁定层。"
        },
        {
          phase: "arbitrated",
          at: "2026-03-19T09:01:40.000Z",
          headline: "完成裁定",
          summary: "联盟整合结果交给裁定层统一输出。"
        }
      ],
      finalVerdict: {
        headline: "终极预测室应采用全体感知、少量前线起草、联盟裁定的三段式结构",
        executive_summary: "100 个 agent 不应直接一起回答。更稳的结构是让全体先形成素材预期，再由少量高相关且差异大的节点起草，随后通过联盟整合与裁定输出最终答案。",
        best_answer: "把中间主界面从群聊流改成关系图，把真实回答收束到联盟与裁定层，才能在保证多样性的同时控制 token 消耗。",
        confidence: "原型"
      }
    },
    finalAnswer: {
      headline: "终极预测室应采用全体感知、少量前线起草、联盟裁定的三段式结构",
      executive_summary: "100 个 agent 不应直接一起回答。更稳的结构是让全体先形成素材预期，再由少量高相关且差异大的节点起草，随后通过联盟整合与裁定输出最终答案。",
      confidence: "原型"
    },
    claimGraph: {
      claims: [
        {
          claim_id: "pred-scout",
          text: "大规模 society 应先做全体低成本素材感知，而不是全量重模型并发。",
          status: "supported",
          confidence: "高",
          evidence: ["人口 100 但前线应很少", "token 预算需要受控"],
          counterevidence: ["筛选器可能丢掉稀有观点"],
          source_refs: ["终极预测裁定"],
          supporting_agents: ["atlas", "lumen", "sable"],
          opposing_agents: [],
          update_triggers: ["证明全量并发仍可经济运行"],
          importance: 1
        },
        {
          claim_id: "pred-coalition",
          text: "联盟整合与裁定层是终极预测室优于普通群聊的关键。",
          status: "supported",
          confidence: "中高",
          evidence: ["联盟式裁定", "可交互关系图"],
          counterevidence: ["联盟阶段会增加延迟"],
          source_refs: ["终极预测裁定"],
          supporting_agents: ["mira", "forge"],
          opposing_agents: [],
          update_triggers: ["联盟层被证明对结果没有提升"],
          importance: 0.86
        }
      ],
      relations: [
        { source: "pred-scout", target: "pred-coalition", type: "supports" }
      ]
    }
  }
};

const roomListEl = document.querySelector("#roomList");
const roomCountEl = document.querySelector("#roomCount");
const moduleTabsEl = document.querySelector("#moduleTabs");
const roomCommunityEl = document.querySelector("#roomCommunity");
const roomTitleEl = document.querySelector("#roomTitle");
const roomTagsEl = document.querySelector("#roomTags");
const roomStatsEl = document.querySelector("#roomStats");
const participantStripEl = document.querySelector("#participantStrip");
const stageFiltersEl = document.querySelector("#stageFilters");
const timelineMetaEl = document.querySelector("#timelineMeta");
const feedTitleEl = document.querySelector("#feedTitle");
const messageListEl = document.querySelector("#messageList");
const jumpToLatestButtonEl = document.querySelector("#jumpToLatestButton");
const promptInputEl = document.querySelector("#promptInput");
const composerTitleEl = document.querySelector("#composerTitle");
const advanceButtonEl = document.querySelector("#advanceButton");
const resetButtonEl = document.querySelector("#resetButton");
const composerEl = document.querySelector("#composer");
const appShellEl = document.querySelector("#chorusApp");
const graphViewEl = document.querySelector("#graphView");
const predictionArenaEl = document.querySelector("#predictionArena");
const chatPanelEl = document.querySelector("#chatPanel");
const graphPanelEl = document.querySelector("#graphPanel");
const predictionGraphViewEl = document.querySelector("#predictionGraphView");
const predictionTitleEl = document.querySelector("#predictionTitle");
const predictionMetaEl = document.querySelector("#predictionMeta");
const predictionViewTabsEl = document.querySelector("#predictionViewTabs");
const predictionOverviewEl = document.querySelector("#predictionOverview");
const predictionCoalitionsEl = document.querySelector("#predictionCoalitions");
const predictionSignalsEl = document.querySelector("#predictionSignals");
const agentCardEl = document.querySelector("#agentCard");
const agentPanelEl = document.querySelector("#agentPanel");
const runtimeModeLabelEl = document.querySelector("#runtimeModeLabel");
const controlDeckStatusEl = document.querySelector("#controlDeckStatus");
const schedulerToggleButtonEl = document.querySelector("#schedulerToggleButton");
const refreshButtonEl = document.querySelector("#refreshButton");
const roomRunButtonEl = document.querySelector("#roomRunButton");
const consoleToggleButtonEl = document.querySelector("#consoleToggleButton");
const resourceMonitorEl = document.querySelector("#resourceMonitor");
const runtimeMonitorEl = document.querySelector("#runtimeMonitor");
const schedulerQueueEl = document.querySelector("#schedulerQueue");
const systemConsoleEl = document.querySelector("#systemConsole");
const artifactTitleEl = document.querySelector("#artifactTitle");
const finalAnswerCardEl = document.querySelector("#finalAnswerCard");
const claimGraphTitleEl = document.querySelector("#claimGraphTitle");
const claimGraphCardEl = document.querySelector("#claimGraphCard");
const authorityLogCardEl = document.querySelector("#authorityLogCard");
const directionTextEl = document.querySelector("#directionText");
const consensusListEl = document.querySelector("#consensusList");
const tensionListEl = document.querySelector("#tensionList");
const actionListEl = document.querySelector("#actionList");

function byId(list, id) {
  return list.find((item) => item.id === id);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatTime(timestamp) {
  if (!timestamp) return "刚刚";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "刚刚";
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatRelativeTime(timestamp) {
  if (!timestamp) return "暂无活动";
  const deltaMs = Date.now() - Date.parse(timestamp);
  if (!Number.isFinite(deltaMs) || deltaMs < 0) return "刚刚";
  const deltaMinutes = Math.floor(deltaMs / 60000);
  if (deltaMinutes < 1) return "刚刚";
  if (deltaMinutes < 60) return `${deltaMinutes} 分钟前`;
  const deltaHours = Math.floor(deltaMinutes / 60);
  if (deltaHours < 24) return `${deltaHours} 小时前`;
  const deltaDays = Math.floor(deltaHours / 24);
  return `${deltaDays} 天前`;
}

function currentRoomSummary() {
  return state.rooms.find((room) => room.id === state.activeRoomId) || null;
}

function activeRoomAgents() {
  const room = currentRoom();
  if (!room) return [];
  return room.activeAgentIds
    .map((agentId) => byId(state.agents, agentId))
    .filter(Boolean);
}

function pendingSourceCount(agent) {
  return (agent?.state?.sourceFetchQueue || []).filter((entry) => entry.status === "pending").length;
}

function aggregateRoomResources() {
  const agents = activeRoomAgents().filter((agent) => agent.kind === "agent");
  const runtime = currentRuntime();
  const pendingSources = agents.reduce((sum, agent) => sum + pendingSourceCount(agent), 0);
  const avgTokensPerRun =
    runtime?.metrics?.totalAgentRuns
      ? Math.round((runtime.metrics.totalTokens || 0) / runtime.metrics.totalAgentRuns)
      : 0;
  const publicTurns = currentEvents().filter((event) => (event.visibility || "public") === "public").length;
  const coalitionCount = currentPredictionState()?.coalitions?.length || 0;
  const sourceHealth = currentSourceHealth();

  return {
    participantCount: activeRoomAgents().length,
    liveAgentCount: agents.length,
    pendingSources,
    publicTurns,
    coalitionCount,
    avgTokensPerRun,
    freshSources: sourceHealth?.counts?.fresh || 0,
    staleSources: (sourceHealth?.counts?.aging || 0) + (sourceHealth?.counts?.stale || 0)
  };
}

function currentRoom() {
  return state.roomBundle?.room || null;
}

function currentEvents() {
  return state.roomBundle?.events || [];
}

function currentGraph() {
  return state.roomBundle?.graphState || { nodes: [], edges: [], synthesis: null };
}

function currentSocialEdges() {
  return state.roomBundle?.socialEdges?.edges || state.roomBundle?.socialEdges || [];
}

function currentRuntime() {
  return state.roomBundle?.runtimeState || null;
}

function currentSourceHealth() {
  return state.roomBundle?.sourceHealth || null;
}

function currentPredictionState() {
  return state.roomBundle?.predictionState || null;
}

function currentClaimGraph() {
  return state.roomBundle?.claimGraph || state.roomBundle?.finalAnswer?.claim_graph || null;
}

function currentAuthorityLog() {
  return state.roomBundle?.authorityLog || null;
}

function currentPredictionReplay() {
  return state.roomBundle?.predictionReplay || null;
}

function currentDiagnostics() {
  return state.roomBundle?.diagnostics || null;
}

function authoritySummary(log) {
  const entries = log?.entries || [];
  if (!entries.length) return null;
  const counts = entries.reduce((acc, entry) => {
    const key = entry.actor || "system";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const [leader, count] = ranked[0];
  return {
    leader,
    count,
    total: entries.length,
    ratio: count / Math.max(1, entries.length)
  };
}

function currentFinalAnswer() {
  return state.roomBundle?.finalAnswer || currentPredictionState()?.finalVerdict || null;
}

function isPredictionRoom() {
  return currentRoom()?.module === "ultimate_prediction";
}

function socialEdgeValue(edge, key) {
  const prior = edge?.prior?.[key] || 0;
  const learned = edge?.learnedDelta?.[key] || 0;
  const local = edge?.localDelta?.[key] || 0;
  return Math.max(0, Math.min(1, prior + learned + local));
}

function socialRelationsFor(agentId) {
  return currentSocialEdges()
    .filter((edge) => edge.source === agentId)
    .map((edge) => ({
      ...edge,
      targetAgent: byId(state.agents, edge.target),
      trust: socialEdgeValue(edge, "trust"),
      complementarity: socialEdgeValue(edge, "complementarity"),
      rivalry: socialEdgeValue(edge, "rivalry"),
      influence: socialEdgeValue(edge, "influence"),
      coordination: socialEdgeValue(edge, "coordination")
    }))
    .filter((edge) => edge.targetAgent);
}

function topSocialRelations(agentId, limit = 4) {
  return socialRelationsFor(agentId)
    .map((edge) => ({
      ...edge,
      score:
        (edge.coordination * 0.34) +
        (edge.complementarity * 0.26) +
        (edge.trust * 0.2) +
        (edge.rivalry * 0.2)
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function strongestRelation(agentId, dimension) {
  return socialRelationsFor(agentId)
    .sort((a, b) => (b[dimension] || 0) - (a[dimension] || 0))[0] || null;
}

function roomsForModule() {
  return state.rooms.filter((room) => room.module === state.activeModule);
}

function displayParticipantIds() {
  const room = currentRoom();
  if (!room) return [];
  if (!isPredictionRoom()) {
    return room.activeAgentIds || [];
  }

  const prediction = currentPredictionState();
  return Array.from(new Set([
    "human",
    ...((prediction?.frontlineAgentIds || []).slice(0, 6)),
    ...((prediction?.arbitratorIds || []).slice(0, 3)),
    "synthesis"
  ])).filter(Boolean);
}

async function fetchJson(pathname, init) {
  const response = await fetch(`${API_BASE}${pathname}`, init);
  if (!response.ok) {
    throw new Error(`Request failed: ${pathname}`);
  }
  return response.json();
}

async function refreshLiveState() {
  const activeRoomId = state.activeRoomId;
  const agentPath = activeRoomId
    ? `/api/agents?minimal=1&roomId=${encodeURIComponent(activeRoomId)}`
    : "/api/agents?minimal=1";
  const [agentPayload, roomPayload] = await Promise.all([
    fetchJson(agentPath),
    fetchJson("/api/rooms"),
  ]);
  state.mode = "live";
  state.agents = agentPayload.agents;
  state.rooms = roomPayload.rooms;

  const nextRoomId =
    (activeRoomId && state.rooms.some((room) => room.id === activeRoomId) && activeRoomId) ||
    state.rooms.find((room) => room.module === state.activeModule)?.id ||
    state.rooms[0]?.id ||
    null;

  state.activeRoomId = nextRoomId;
  if (state.activeRoomId) {
    await loadRoomBundle(state.activeRoomId);
  }
}

async function loadRoomBundle(roomId) {
  if (state.mode === "fallback") {
    state.roomBundle = JSON.parse(JSON.stringify(FALLBACK_BUNDLES[roomId]));
    state.activeModule = state.roomBundle?.room?.module || state.activeModule;
    return;
  }
  state.roomBundle = await fetchJson(`/api/rooms/${roomId}`);
  state.activeModule = state.roomBundle?.room?.module || state.activeModule;
}

async function loadBootstrap() {
  try {
    await refreshLiveState();
  } catch {
    state.mode = "fallback";
    state.agents = FALLBACK_AGENTS;
    state.rooms = Object.values(FALLBACK_BUNDLES).map((bundle) => ({
      ...bundle.room,
      eventCount: bundle.events.length,
      lastEventAt: bundle.events[bundle.events.length - 1]?.createdAt || null
    }));
  }

  state.activeRoomId =
    state.activeRoomId ||
    state.rooms.find((room) => room.module === state.activeModule)?.id ||
    state.rooms[0]?.id ||
    null;
  state.selectedNode = "atlas";
  if (state.activeRoomId) {
    await loadRoomBundle(state.activeRoomId);
  }
  render();
}

function renderModuleTabs() {
  const modules = [
    { id: "social_rooms", label: "社交房间" },
    { id: "question_forge", label: "问题锻炉" },
    { id: "ultimate_prediction", label: "终极预测" }
  ];
  moduleTabsEl.innerHTML = "";
  modules.forEach((module) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `duckerchat-module-pill${state.activeModule === module.id ? " active" : ""}`;
    button.textContent = module.label;
    button.addEventListener("click", async () => {
      state.activeModule = module.id;
      const nextRoom = roomsForModule()[0];
      if (nextRoom) {
        state.activeRoomId = nextRoom.id;
        await loadRoomBundle(nextRoom.id);
      }
      render();
    });
    moduleTabsEl.appendChild(button);
  });
}

function renderRooms() {
  const rooms = roomsForModule();
  roomCountEl.textContent = `${rooms.length} 个房间`;
  roomListEl.innerHTML = "";
  rooms.forEach((room) => {
    const lastActive = formatRelativeTime(room.lastEventAt);
    const schedulerState = room.schedulerEnabled ? "自动" : "手动";
    const button = document.createElement("button");
    button.type = "button";
    button.className = `duckerchat-room-card${room.id === state.activeRoomId ? " active" : ""}`;
    button.innerHTML = `
      <div class="duckerchat-room-title">
        <span>${escapeHtml(room.title)}</span>
        <span class="duckerchat-room-badge">${escapeHtml(room.community)}</span>
      </div>
      <p class="duckerchat-room-preview">${escapeHtml(room.blurb || room.prompt || "")}</p>
      <div class="duckerchat-room-meta-row">
        <span class="duckerchat-chip">${room.eventCount || 0} 条消息</span>
        <span class="duckerchat-chip">${room.queueDepth || 0} 个排队</span>
        <span class="duckerchat-chip">${schedulerState}</span>
        <span class="duckerchat-chip">${lastActive}</span>
      </div>
      <div class="duckerchat-chip-row">
        ${(room.tags || []).map((tag) => `<span class="duckerchat-chip">${escapeHtml(tag)}</span>`).join("")}
      </div>
    `;
    button.addEventListener("click", async () => {
      state.activeModule = room.module;
      state.activeRoomId = room.id;
      state.activeStage = "all";
      await loadRoomBundle(room.id);
      render();
    });
    roomListEl.appendChild(button);
  });
}

function renderHeader() {
  const room = currentRoom();
  if (!room) return;
  const roomSummary = currentRoomSummary();
  roomCommunityEl.textContent = room.community;
  roomTitleEl.textContent = room.title;
  roomTagsEl.innerHTML = (room.tags || []).map((tag) => `<span class="duckerchat-chip">${escapeHtml(tag)}</span>`).join("");

  const runtime = currentRuntime();
  const humans = currentEvents().filter((event) => event.speaker === "human").length;
  const prediction = currentPredictionState();
  roomStatsEl.innerHTML = isPredictionRoom()
    ? `
      <span class="duckerchat-stat-pill">研究团体 ${prediction?.population || room.population || room.activeAgentIds.length}</span>
      <span class="duckerchat-stat-pill">前线 ${prediction?.frontlineAgentIds?.length || 0}</span>
      <span class="duckerchat-stat-pill">联盟 ${prediction?.coalitions?.length || 0}</span>
      ${prediction?.finalVerdict ? `<span class="duckerchat-stat-pill">已出裁定</span>` : ""}
      ${runtime ? `<span class="duckerchat-stat-pill">预算 ${runtime.budgets.tokenBudgetRemaining || 0}</span>` : ""}
    `
    : `
      <span class="duckerchat-stat-pill">${room.activeAgentIds.length} 位成员</span>
      <span class="duckerchat-stat-pill">${currentEvents().filter((event) => (event.visibility || "public") === "public").length} 条可见消息</span>
      <span class="duckerchat-stat-pill">${humans} 次人类发言</span>
      ${roomSummary?.totalTokens ? `<span class="duckerchat-stat-pill">${roomSummary.totalTokens} tokens</span>` : ""}
      ${runtime ? `<span class="duckerchat-stat-pill">队列 ${runtime.scheduler.queue.length}</span>` : ""}
    `;

  participantStripEl.innerHTML = "";
  displayParticipantIds().forEach((agentId) => {
    const agent = byId(state.agents, agentId);
    if (!agent) return;
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = `duckerchat-participant${state.selectedNode === agent.id ? " active" : ""}`;
    chip.innerHTML = `
      <div class="duckerchat-avatar" style="background:${agent.visual.color}">${agent.visual.initials}</div>
      <div>
        <div class="duckerchat-agent-name">${escapeHtml(agent.label)}</div>
        <div class="duckerchat-meta">${escapeHtml(agent.role)}</div>
      </div>
    `;
    chip.addEventListener("click", () => {
      state.selectedNode = agent.id;
      renderInspector();
      renderGraph();
    });
    participantStripEl.appendChild(chip);
  });

  if (room.module === "question_forge") {
    feedTitleEl.textContent = "问题锻炉群聊";
    composerTitleEl.textContent = "向锻炉发问";
    promptInputEl.placeholder = "直接向整个房间提出你的问题，所有智能体都会看到。";
    artifactTitleEl.textContent = "最终回答产物";
    claimGraphTitleEl.textContent = "Claim Graph";
    advanceButtonEl.textContent = "运行锻炉";
  } else if (room.module === "ultimate_prediction") {
    feedTitleEl.textContent = "终极预测图谱";
    composerTitleEl.textContent = "向研究团体发问";
    promptInputEl.placeholder = "输入问题后，系统会先做全体素材感知，再只让少量前线节点起草与裁定。";
    artifactTitleEl.textContent = "裁定结果";
    claimGraphTitleEl.textContent = "裁定骨架";
    advanceButtonEl.textContent = "运行预测";
  } else {
    feedTitleEl.textContent = "群聊消息";
    composerTitleEl.textContent = "发送到群聊";
    promptInputEl.placeholder = "直接向整个房间发送消息，所有智能体都会看到。";
    artifactTitleEl.textContent = "当前回答产物";
    claimGraphTitleEl.textContent = "知识骨架";
    advanceButtonEl.textContent = "推动房间";
  }
}

function stageOptions() {
  const set = new Set(
    currentEvents()
      .filter((event) => (event.visibility || "public") === "public")
      .map((event) => event.stage)
  );
  return ["all", ...Array.from(set)].filter((stage, index, array) => array.indexOf(stage) === index);
}

function stageLabel(stage) {
  const labels = {
    all: "全部",
    human: "人类",
    planning: "规划",
    evidence: "证据",
    analysis: "分析",
    challenge: "挑战",
    convergence: "综合",
    implementation: "实现",
    intervention: "干预",
    source_ingestion: "资料",
    system: "系统"
  };
  return labels[stage] || stage;
}

function schedulerReasonLabel(reason) {
  const labels = {
    "human-broadcast": "人类全房间广播",
    "human-broadcast-fanout": "人类广播扩散",
    "human-target": "人类点名",
    "question-forge-human-ask": "人类触发问题锻炉",
    "manual-nudge": "手动推动",
    "autonomous-wake": "自动唤醒",
    "question-forge-ready": "问题锻炉已满足综合条件",
    "ultimate-prediction-scout": "终极预测前线筛选",
    "claim-review": "知识骨架复查"
  };
  if (!reason) return "房间事件";
  if (labels[reason]) return labels[reason];
  if (reason.startsWith("suggested-by-")) {
    const agentId = reason.replace("suggested-by-", "");
    return `由 ${agentId} 推荐继续发言`;
  }
  if (reason.startsWith("social-fanout-from-")) {
    const agentId = reason.replace("social-fanout-from-", "");
    return `从 ${agentId} 向周边扩散`;
  }
  return reason;
}

function renderStageFilters() {
  stageFiltersEl.innerHTML = "";
  stageOptions().forEach((stage) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `duckerchat-chip${state.activeStage === stage ? " active" : ""}`;
    button.textContent = stageLabel(stage);
    button.addEventListener("click", () => {
      state.activeStage = stage;
      renderFeed();
      renderGraph();
      renderRuntimeMonitor();
    });
    stageFiltersEl.appendChild(button);
  });
}

function visibleEvents() {
  return currentEvents().filter((event) => {
    if ((event.visibility || "public") !== "public") return false;
    return state.activeStage === "all" || event.stage === state.activeStage;
  });
}

function currentFeedContextKey() {
  return `${state.activeRoomId || "none"}::${state.activeStage}::${state.activeModule}`;
}

function updateJumpToLatestButton() {
  if (state.feedUnreadCount > 0 && !isPredictionRoom()) {
    jumpToLatestButtonEl.hidden = false;
    jumpToLatestButtonEl.textContent = state.feedUnreadCount === 1 ? "有新消息" : `${state.feedUnreadCount} 条新消息`;
  } else {
    jumpToLatestButtonEl.hidden = true;
  }
}

function renderFeed() {
  const events = visibleEvents();
  const publicTotal = currentEvents().filter((event) => (event.visibility || "public") === "public").length;
  const feedContextKey = currentFeedContextKey();
  const prevContextKey = state.feedContextKey;
  const prevVisibleEventIds = state.feedVisibleEventIds || [];
  const prevScrollTop = messageListEl.scrollTop;
  timelineMetaEl.textContent = `可见 ${events.length} 条 · 总计 ${publicTotal} 条`;
  messageListEl.innerHTML = "";
  events.forEach((event) => {
    const speaker =
      byId(state.agents, event.speaker) ||
      byId(FALLBACK_AGENTS, event.speaker) ||
      FALLBACK_AGENTS[0];
    const target =
      event.target
        ? byId(state.agents, event.target) || byId(FALLBACK_AGENTS, event.target)
        : null;
    const self = event.speaker === "human";
    const article = document.createElement("article");
    article.className = `duckerchat-message${self ? " self" : ""}`;
    article.innerHTML = `
      <div class="duckerchat-message-row">
        ${self ? "" : `<div class="duckerchat-avatar" style="background:${speaker.visual.color}">${speaker.visual.initials}</div>`}
        <div class="duckerchat-message-card">
          <div class="duckerchat-message-header">
            <div class="duckerchat-message-author">
              ${self ? `<div class="duckerchat-avatar" style="background:${speaker.visual.color}">${speaker.visual.initials}</div>` : ""}
              <div>
                <div class="duckerchat-message-author-name">${escapeHtml(speaker.label)}</div>
                <div class="duckerchat-meta">${escapeHtml(speaker.role || "")}${target ? ` · 回应 ${escapeHtml(target.label)}` : ""}</div>
              </div>
            </div>
            <span class="duckerchat-chip">${escapeHtml(stageLabel(event.stage))}</span>
          </div>
          <p class="duckerchat-message-body">${escapeHtml(event.body)}</p>
          <div class="duckerchat-message-footer">
            <div class="duckerchat-chip-row">
              ${(event.sources || []).map((source) => `<span class="duckerchat-chip">${escapeHtml(source)}</span>`).join("")}
              ${event.usage?.total_tokens ? `<span class="duckerchat-chip">tokens ${event.usage.total_tokens}</span>` : ""}
            </div>
            <span class="duckerchat-message-time">${formatTime(event.createdAt)}</span>
          </div>
        </div>
      </div>
    `;
    messageListEl.appendChild(article);
  });

  const nextVisibleEventIds = events.map((event) => event.id);
  if (!state.feedInitialized || prevContextKey !== feedContextKey) {
    messageListEl.scrollTop = messageListEl.scrollHeight;
    state.feedUnreadCount = 0;
  } else {
    const newVisibleCount = nextVisibleEventIds.filter((id) => !prevVisibleEventIds.includes(id)).length;
    messageListEl.scrollTop = prevScrollTop;
    if (newVisibleCount > 0) {
      state.feedUnreadCount += newVisibleCount;
    }
  }

  state.feedInitialized = true;
  state.feedContextKey = feedContextKey;
  state.feedVisibleEventIds = nextVisibleEventIds;
  updateJumpToLatestButton();
}

function renderGraph() {
  const graph = currentGraph();
  graphViewEl.innerHTML = "";
  const xmlns = "http://www.w3.org/2000/svg";
  const nodeById = new Map((graph.nodes || []).map((node) => [node.id, node]));
  const defs = document.createElementNS(xmlns, "defs");
  const marker = document.createElementNS(xmlns, "marker");
  marker.setAttribute("id", "dc-arrow");
  marker.setAttribute("markerWidth", "12");
  marker.setAttribute("markerHeight", "12");
  marker.setAttribute("refX", "10");
  marker.setAttribute("refY", "6");
  marker.setAttribute("orient", "auto");
  const arrow = document.createElementNS(xmlns, "path");
  arrow.setAttribute("d", "M0,0 L12,6 L0,12 Z");
  arrow.setAttribute("fill", "rgba(20,33,44,0.3)");
  marker.appendChild(arrow);
  defs.appendChild(marker);
  graphViewEl.appendChild(defs);

  graph.edges.forEach((edge) => {
    const sourceNode = nodeById.get(edge.source);
    const targetNode = nodeById.get(edge.target);
    if (!sourceNode || !targetNode) return;
    const line = document.createElementNS(xmlns, "line");
    line.setAttribute("x1", sourceNode.x);
    line.setAttribute("y1", sourceNode.y);
    line.setAttribute("x2", targetNode.x);
    line.setAttribute("y2", targetNode.y);
    line.setAttribute("stroke-width", String(Math.max(2, edge.weight || 1)));
    line.setAttribute("stroke", state.selectedNode === edge.source || state.selectedNode === edge.target ? "rgba(202,91,38,0.6)" : "rgba(20,33,44,0.25)");
    line.setAttribute("marker-end", "url(#dc-arrow)");
    graphViewEl.appendChild(line);
  });

  if (!isPredictionRoom() && state.selectedNode) {
    topSocialRelations(state.selectedNode, 4).forEach((edge) => {
      const sourceNode = nodeById.get(edge.source);
      const targetNode = nodeById.get(edge.target);
      if (!sourceNode || !targetNode) return;
      const line = document.createElementNS(xmlns, "line");
      line.setAttribute("x1", sourceNode.x);
      line.setAttribute("y1", sourceNode.y);
      line.setAttribute("x2", targetNode.x);
      line.setAttribute("y2", targetNode.y);
      line.setAttribute("stroke-width", String(1.5 + (edge.score || 0) * 2));
      line.setAttribute("stroke-dasharray", "8 6");
      const dominant =
        edge.rivalry >= edge.coordination && edge.rivalry >= edge.complementarity
          ? "rgba(161,66,98,0.44)"
          : edge.complementarity >= edge.coordination
            ? "rgba(43,125,134,0.4)"
            : "rgba(53,95,207,0.38)";
      line.setAttribute("stroke", dominant);
      graphViewEl.appendChild(line);
    });
  }

  graph.nodes.forEach((node) => {
    const agent = byId(state.agents, node.id);
    if (!agent) return;
    const group = document.createElementNS(xmlns, "g");
    group.style.cursor = "pointer";
    group.addEventListener("click", () => {
      state.selectedNode = node.id;
      renderInspector();
      renderGraph();
    });
    const circle = document.createElementNS(xmlns, "circle");
    circle.setAttribute("cx", node.x);
    circle.setAttribute("cy", node.y);
    circle.setAttribute("r", agent.kind === "artifact" ? "40" : "35");
    circle.setAttribute("fill", agent.visual.color);
    circle.setAttribute("stroke", state.selectedNode === node.id ? "rgba(20,33,44,0.95)" : "rgba(255,255,255,0.95)");
    circle.setAttribute("stroke-width", state.selectedNode === node.id ? "5" : "3");
    const label = document.createElementNS(xmlns, "text");
    label.setAttribute("x", node.x);
    label.setAttribute("y", node.y + 6);
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("fill", "white");
    label.setAttribute("font-size", "15");
    label.setAttribute("font-weight", "700");
    label.textContent = agent.label;
    const role = document.createElementNS(xmlns, "text");
    role.setAttribute("x", node.x);
    role.setAttribute("y", node.y + 56);
    role.setAttribute("text-anchor", "middle");
    role.setAttribute("fill", "#657384");
    role.setAttribute("font-size", "12");
    role.textContent = agent.role;
    group.appendChild(circle);
    group.appendChild(label);
    graphViewEl.appendChild(group);
    graphViewEl.appendChild(role);
  });
}

function predictionGraphNodes() {
  const room = currentRoom();
  const prediction = currentPredictionState();
  if (!room || !prediction) return [];

  const members = (room.activeAgentIds || []).filter((agentId) => !["human", "synthesis"].includes(agentId));
  const nodes = [
    { id: "human", x3: -280, y3: 0, z3: 180, radius: 28 },
    { id: "synthesis", x3: 280, y3: 0, z3: -180, radius: 30 }
  ];

  const total = Math.max(1, members.length);
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  members.forEach((agentId, index) => {
    const y = 1 - (index / Math.max(1, total - 1)) * 2;
    const radius3 = Math.sqrt(Math.max(0, 1 - (y * y)));
    const theta = goldenAngle * index;
    const x = Math.cos(theta) * radius3;
    const z = Math.sin(theta) * radius3;
    const isFrontline = (prediction.frontlineAgentIds || []).includes(agentId);
    const isArbiter = (prediction.arbitratorIds || []).includes(agentId);
    const isParticipant = (prediction.participantAgentIds || []).includes(agentId);
    nodes.push({
      id: agentId,
      x3: x * 300,
      y3: y * 135,
      z3: z * 110,
      isAmbient: !isParticipant && !isFrontline && !isArbiter,
      radius: isArbiter ? 18 : isFrontline ? 14 : isParticipant ? 10 : 3.2
    });
  });

  return nodes;
}

function predictionInteractionEdges() {
  const room = currentRoom();
  const prediction = currentPredictionState();
  if (!room || !prediction) return [];

  const society = (room.activeAgentIds || []).filter((agentId) => !["human", "synthesis"].includes(agentId));
  const frontline = prediction.frontlineAgentIds || [];
  const arbitrators = prediction.arbitratorIds || [];
  const edges = [];

  const participants = prediction.participantAgentIds || [];
  participants.forEach((agentId, index) => {
    const nextId = participants[(index + 1) % Math.max(1, participants.length)];
    if (nextId && nextId !== agentId) {
      edges.push({ source: agentId, target: nextId, weight: 1.3, kind: "participant-loop" });
    }
  });

  frontline.forEach((agentId, index) => {
    const arbiterId = arbitrators[index % Math.max(1, arbitrators.length)];
    if (arbiterId && arbiterId !== agentId) {
      edges.push({ source: agentId, target: arbiterId, weight: 1.6, kind: "frontline-to-arbiter" });
    }
    edges.push({ source: "human", target: agentId, weight: 1.2, kind: "question" });
  });

  (prediction.coalitions || []).forEach((coalition) => {
    coalition.memberIds.forEach((memberId) => {
      edges.push({
        source: memberId,
        target: coalition.integratorId,
        weight: memberId === coalition.integratorId ? 0.8 : 1.2,
        kind: "coalition"
      });
    });
    edges.push({ source: coalition.integratorId, target: "synthesis", weight: 1.8, kind: "arbitration" });
  });

  const selectedId = state.selectedPredictionNodeId;
  if (selectedId && society.includes(selectedId)) {
    (prediction.interactions || []).forEach((edge) => {
      if (edge.source === selectedId || edge.target === selectedId) {
        edges.push(edge);
      }
    });
  }

  return edges.filter((edge, index, list) => {
    const key = `${edge.source}->${edge.target}:${edge.kind || ""}`;
    return list.findIndex((entry) => `${entry.source}->${entry.target}:${entry.kind || ""}` === key) === index;
  });
}

function projectPredictionNode(node) {
  if (typeof node.x3 !== "number") {
    return {
      ...node,
      px: node.x,
      py: node.y,
      projectedRadius: node.radius,
      depth: 0
    };
  }

  const { rotX, rotY, zoom } = state.predictionCamera;
  const cosY = Math.cos(rotY);
  const sinY = Math.sin(rotY);
  const cosX = Math.cos(rotX);
  const sinX = Math.sin(rotX);

  const x1 = (node.x3 * cosY) + (node.z3 * sinY);
  const z1 = (node.z3 * cosY) - (node.x3 * sinY);
  const y2 = (node.y3 * cosX) - (z1 * sinX);
  const z2 = (node.y3 * sinX) + (z1 * cosX);
  const perspective = 1 + ((z2 / 500) * 0.85);

  return {
    ...node,
    px: 500 + (x1 * zoom * perspective),
    py: 280 + (y2 * zoom * perspective),
    projectedRadius: Math.max(3, node.radius * zoom * Math.max(0.6, perspective)),
    depth: z2,
    opacity: node.isAmbient
      ? Math.max(0.12, 0.18 + ((z2 + 160) / 520))
      : Math.max(0.5, 0.7 + ((z2 + 160) / 900))
  };
}

function renderPredictionViewTabs() {
  const tabs = [
    { id: "coalitions", label: "联盟" },
    { id: "society", label: "社会" },
    { id: "claims", label: "Claims" },
    { id: "timeline", label: "时间线" }
  ];
  predictionViewTabsEl.innerHTML = "";
  tabs.forEach((tab) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `duckerchat-chip${state.predictionView === tab.id ? " active" : ""}`;
    button.textContent = tab.label;
    button.addEventListener("click", () => {
      state.predictionView = tab.id;
      state.selectedPredictionNodeId = null;
      renderPredictionArena();
    });
    predictionViewTabsEl.appendChild(button);
  });
}

function predictionCoalitionLayout() {
  const prediction = currentPredictionState();
  const coalitions = prediction?.coalitions || [];
  const arbitrators = prediction?.arbitratorIds || [];
  const nodes = [
    { id: "human", x: 110, y: 280, radius: 28, label: "Henry" },
    { id: "synthesis", x: 900, y: 280, radius: 30, label: "综合体" }
  ];
  const edges = [];

  coalitions.forEach((coalition, index) => {
    const y = 140 + (index * 120);
    nodes.push({
      id: coalition.id,
      x: 400,
      y,
      radius: 28,
      kind: "coalition",
      label: coalition.label,
      raw: coalition
    });
    nodes.push({
      id: coalition.integratorId,
      x: 610,
      y,
      radius: 18,
      kind: "integrator",
      label: (byId(state.agents, coalition.integratorId) || {}).label || coalition.integratorId
    });
    edges.push({ source: "human", target: coalition.id, weight: 1.1, kind: "question" });
    edges.push({ source: coalition.id, target: coalition.integratorId, weight: 1.5, kind: "coalition" });
  });

  arbitrators.forEach((agentId, index) => {
    nodes.push({
      id: `arb-${agentId}`,
      x: 760,
      y: 150 + (index * 110),
      radius: 18,
      kind: "arbiter",
      label: (byId(state.agents, agentId) || {}).label || agentId,
      agentId
    });
    coalitions.forEach((coalition) => {
      edges.push({ source: coalition.integratorId, target: `arb-${agentId}`, weight: 1.2, kind: "arbitration" });
    });
    edges.push({ source: `arb-${agentId}`, target: "synthesis", weight: 1.6, kind: "arbitration" });
  });

  return { nodes, edges };
}

function predictionClaimLayout() {
  const prediction = currentPredictionState();
  const claimGraph = currentClaimGraph();
  const coalitions = prediction?.coalitions || [];
  const claims = (claimGraph?.claims || []).slice(0, 6);
  const nodes = [];
  const edges = [];

  coalitions.forEach((coalition, index) => {
    nodes.push({
      id: coalition.id,
      x: 220,
      y: 120 + (index * 130),
      radius: 26,
      kind: "coalition",
      label: coalition.label,
      raw: coalition
    });
  });

  claims.forEach((claim, index) => {
    nodes.push({
      id: claim.claim_id,
      x: 560,
      y: 100 + (index * 78),
      radius: 18,
      kind: "claim",
      label: `C${index + 1}`,
      raw: claim
    });
  });

  nodes.push({ id: "synthesis", x: 880, y: 280, radius: 30, kind: "artifact", label: "综合体" });

  coalitions.forEach((coalition, coalitionIndex) => {
    claims.forEach((claim, claimIndex) => {
      const supportHit = (claim.supporting_agents || []).some((agentId) => coalition.memberIds?.includes(agentId));
      const opposingHit = (claim.opposing_agents || []).some((agentId) => coalition.memberIds?.includes(agentId));
      if (supportHit || (!opposingHit && (claimIndex % Math.max(1, coalitions.length)) === coalitionIndex % Math.max(1, coalitions.length))) {
        edges.push({ source: coalition.id, target: claim.claim_id, weight: supportHit ? 1.5 : 0.8, kind: "supports" });
      }
      if (opposingHit) {
        edges.push({ source: coalition.id, target: claim.claim_id, weight: 1.1, kind: "disputes" });
      }
    });
  });

  claims.forEach((claim) => edges.push({ source: claim.claim_id, target: "synthesis", weight: 1.1, kind: "claim-flow" }));
  return { nodes, edges };
}

function predictionTimelineLayout() {
  const prediction = currentPredictionState();
  const history = prediction?.timelineSnapshots?.length ? prediction.timelineSnapshots : (prediction?.phaseHistory || []);
  const nodes = [];
  const edges = [];

  history.forEach((phase, index) => {
    nodes.push({
      id: `phase-${index + 1}`,
      x: 200 + (index * 250),
      y: 280,
      radius: 34,
      kind: "phase",
      label: phase.phase || phase.headline || `阶段 ${index + 1}`,
      raw: phase
    });
    if (index > 0) {
      edges.push({ source: `phase-${index}`, target: `phase-${index + 1}`, weight: 2, kind: "timeline" });
    }
  });

  return { nodes, edges };
}

function selectedPredictionNode(layout) {
  return (layout?.nodes || []).find((node) => node.id === state.selectedPredictionNodeId) || null;
}

function renderPredictionArena() {
  if (!isPredictionRoom()) {
    predictionArenaEl.hidden = true;
    return;
  }

  const prediction = currentPredictionState();
  predictionArenaEl.hidden = false;
  renderPredictionViewTabs();
  predictionTitleEl.textContent = "终极预测关系图";
  predictionMetaEl.textContent = `阶段 ${prediction?.phase || "未知"} · 前线 ${prediction?.frontlineAgentIds?.length || 0} · 联盟 ${prediction?.coalitions?.length || 0} · 当前视图 ${state.predictionView}`;

  predictionOverviewEl.innerHTML = prediction
    ? `
      <div class="duckerchat-prediction-card">
        <strong>${escapeHtml(prediction.finalVerdict?.headline || "终极预测室")}</strong>
        <p>${escapeHtml(prediction.finalVerdict?.executive_summary || "系统会先做全体素材感知，再把高相关且差异大的前线节点推进到联盟与裁定层。")}</p>
        <div class="duckerchat-chip-row">
          <span class="duckerchat-chip">人口 ${prediction.population || 0}</span>
          <span class="duckerchat-chip">前线 ${prediction.frontlineAgentIds?.length || 0}</span>
          <span class="duckerchat-chip">裁定 ${prediction.arbitratorIds?.length || 0}</span>
        </div>
        ${(prediction.participantAgentIds || []).length ? `<p class="duckerchat-note">本轮参与者：${escapeHtml((prediction.participantAgentIds || []).slice(0, 8).map((agentId) => (byId(state.agents, agentId) || {}).label || agentId).join("、"))}</p>` : ""}
      </div>
    `
    : `<div class="duckerchat-prediction-card"><p>还没有终极预测状态。</p></div>`;

  if (state.predictionView === "timeline") {
    predictionCoalitionsEl.innerHTML = ((currentPredictionReplay()?.snapshots || []).length
      ? currentPredictionReplay().snapshots.slice(-6).reverse().map((snapshot) => `
        <div class="duckerchat-prediction-card">
          <strong>${escapeHtml(snapshot.headline || "回放快照")}</strong>
          <p>${escapeHtml(snapshot.executiveSummary || snapshot.question || "")}</p>
          <div class="duckerchat-chip-row">
            <span class="duckerchat-chip">联盟 ${snapshot.coalitions?.length || 0}</span>
            <span class="duckerchat-chip">裁定 ${(snapshot.arbitratorIds || []).length}</span>
          </div>
        </div>
      `).join("")
      : (prediction?.timelineSnapshots || prediction?.phaseHistory || []).map((phase) => `
      <div class="duckerchat-prediction-card">
        <strong>${escapeHtml(phase.headline || phase.phase || "阶段")}</strong>
        <p>${escapeHtml(phase.summary || phase.note || "")}</p>
        <div class="duckerchat-chip-row">
          <span class="duckerchat-chip">${escapeHtml(phase.at || "")}</span>
        </div>
      </div>
    `).join("")) || `<div class="duckerchat-prediction-card"><p>还没有阶段历史。</p></div>`;
  } else if (state.predictionView === "claims") {
    const claimGraph = currentClaimGraph();
    predictionCoalitionsEl.innerHTML = (claimGraph?.claims || []).slice(0, 6).map((claim) => `
      <div class="duckerchat-prediction-card">
        <strong>${escapeHtml(claim.text || "")}</strong>
        <p>${escapeHtml((claim.evidence || []).slice(0, 1).join("；") || "暂无依据摘要")}</p>
        <div class="duckerchat-chip-row">
          <span class="duckerchat-chip">状态 ${escapeHtml(claim.status || "supported")}</span>
          <span class="duckerchat-chip">置信 ${escapeHtml(String(claim.confidence || "中"))}</span>
        </div>
      </div>
    `).join("") || `<div class="duckerchat-prediction-card"><p>还没有 claim graph。</p></div>`;
  } else {
    predictionCoalitionsEl.innerHTML = (prediction?.coalitions || []).map((coalition) => `
      <div class="duckerchat-prediction-card">
        <strong>${escapeHtml(coalition.label || coalition.id)}</strong>
        <p>${escapeHtml(coalition.thesis || "")}</p>
        <div class="duckerchat-chip-row">
          <span class="duckerchat-chip">成员 ${coalition.memberIds?.length || 0}</span>
          <span class="duckerchat-chip">整合 ${escapeHtml((byId(state.agents, coalition.integratorId) || {}).label || coalition.integratorId || "")}</span>
        </div>
      </div>
    `).join("") || `<div class="duckerchat-prediction-card"><p>还没有形成联盟。</p></div>`;
  }

  predictionSignalsEl.innerHTML = [
    ...((prediction?.counterfactualBranches || []).slice(0, 2).map((branch) => `
      <div class="duckerchat-prediction-card">
        <strong>What If</strong>
        <p>${escapeHtml(branch.title || "")}</p>
        <p>${escapeHtml(branch.delta || "")}</p>
      </div>
    `)),
    ...((prediction?.beliefShifts || []).slice(0, 2).map((shift) => `
      <div class="duckerchat-prediction-card">
        <strong>Belief Shift</strong>
        <p>${escapeHtml(shift.claim || "")}</p>
        <div class="duckerchat-chip-row">
          <span class="duckerchat-chip">${escapeHtml(shift.from || "")} -> ${escapeHtml(shift.to || "")}</span>
          <span class="duckerchat-chip">${escapeHtml(shift.why || "")}</span>
        </div>
      </div>
    `))
  ].join("") || `<div class="duckerchat-prediction-card"><p>还没有创造性分歧信号。</p></div>`;

  const layout =
    state.predictionView === "society"
      ? { nodes: predictionGraphNodes(), edges: predictionInteractionEdges() }
      : state.predictionView === "claims"
        ? predictionClaimLayout()
        : state.predictionView === "timeline"
          ? predictionTimelineLayout()
          : predictionCoalitionLayout();
  const projectedNodes = state.predictionView === "society"
    ? (layout.nodes || []).map((node) => projectPredictionNode(node)).sort((a, b) => a.depth - b.depth)
    : (layout.nodes || []);
  const focusedNode = selectedPredictionNode(layout);
  const focusedHtml = focusedNode
    ? (() => {
      if (focusedNode.kind === "coalition") {
        return `
          <div class="duckerchat-prediction-card">
            <strong>${escapeHtml(focusedNode.raw?.label || focusedNode.label || focusedNode.id)}</strong>
            <p>${escapeHtml(focusedNode.raw?.thesis || "当前联盟节点。")}</p>
            <div class="duckerchat-chip-row">
              <span class="duckerchat-chip">成员 ${focusedNode.raw?.memberIds?.length || 0}</span>
              <span class="duckerchat-chip">整合 ${(byId(state.agents, focusedNode.raw?.integratorId) || {}).label || focusedNode.raw?.integratorId || "未知"}</span>
            </div>
          </div>
        `;
      }
      if (focusedNode.kind === "claim") {
        return `
          <div class="duckerchat-prediction-card">
            <strong>${escapeHtml(focusedNode.raw?.text || focusedNode.label || focusedNode.id)}</strong>
            ${(focusedNode.raw?.evidence || []).length ? `<p>${escapeHtml(focusedNode.raw.evidence.slice(0, 2).join("；"))}</p>` : ""}
            ${(focusedNode.raw?.counterevidence || []).length ? `<p>反证：${escapeHtml(focusedNode.raw.counterevidence.slice(0, 1).join("；"))}</p>` : ""}
          </div>
        `;
      }
      if (focusedNode.kind === "phase") {
        return `
          <div class="duckerchat-prediction-card">
            <strong>${escapeHtml(focusedNode.raw?.phase || focusedNode.label || focusedNode.id)}</strong>
            <p>${escapeHtml(focusedNode.raw?.note || "")}</p>
            <div class="duckerchat-chip-row">
              <span class="duckerchat-chip">${escapeHtml(focusedNode.raw?.at || "")}</span>
            </div>
          </div>
        `;
      }
      return "";
    })()
    : "";
  const nodes = projectedNodes || [];
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const xmlns = "http://www.w3.org/2000/svg";
  predictionGraphViewEl.innerHTML = "";

  if (focusedHtml) {
    predictionOverviewEl.innerHTML = focusedHtml + predictionOverviewEl.innerHTML;
  }

  const relatedNodeIds = new Set();
  if (state.selectedPredictionNodeId) {
    (layout.edges || []).forEach((edge) => {
      if (edge.source === state.selectedPredictionNodeId) relatedNodeIds.add(edge.target);
      if (edge.target === state.selectedPredictionNodeId) relatedNodeIds.add(edge.source);
    });
  }

  (layout.edges || []).forEach((edge) => {
    const source = nodeById.get(edge.source);
    const target = nodeById.get(edge.target);
    if (!source || !target) return;
    const line = document.createElementNS(xmlns, "line");
    line.setAttribute("x1", source.px ?? source.x);
    line.setAttribute("y1", source.py ?? source.y);
    line.setAttribute("x2", target.px ?? target.x);
    line.setAttribute("y2", target.py ?? target.y);
    line.setAttribute("stroke-width", String(Math.max(1.2, edge.weight || 1)));
    const stroke =
      edge.kind === "arbitration"
        ? "rgba(202,91,38,0.5)"
        : edge.kind === "coalition" || edge.kind === "frontline-to-arbiter" || edge.kind === "supports" || edge.kind === "participant-loop"
          ? "rgba(43,125,134,0.34)"
          : edge.kind === "disputes"
            ? "rgba(161,66,98,0.42)"
          : "rgba(20,33,44,0.12)";
    const isRelatedEdge = state.selectedPredictionNodeId && (edge.source === state.selectedPredictionNodeId || edge.target === state.selectedPredictionNodeId);
    line.setAttribute("stroke", isRelatedEdge ? "rgba(202,91,38,0.66)" : stroke);
    line.setAttribute("stroke-width", String(isRelatedEdge ? Math.max(2.4, (edge.weight || 1) * 1.5) : Math.max(1.2, edge.weight || 1)));
    predictionGraphViewEl.appendChild(line);
  });

  nodes.forEach((node) => {
    const agent = byId(state.agents, node.agentId || node.id);
    const isSelected = state.selectedNode === (node.agentId || node.id);
    const circle = document.createElementNS(xmlns, "circle");
    circle.setAttribute("cx", node.px ?? node.x);
    circle.setAttribute("cy", node.py ?? node.y);
    circle.setAttribute("r", String(node.projectedRadius ?? node.radius));
    const fill =
      node.kind === "coalition"
        ? "#355fcf"
        : node.kind === "claim"
          ? "#2b7d86"
          : node.kind === "phase"
            ? "#d57a21"
            : (agent?.visual?.color || "#21303f");
    circle.setAttribute("fill", fill);
    circle.setAttribute("fill-opacity", String(node.opacity ?? (node.isAmbient ? 0.2 : 0.95)));
    const selectedPrediction = state.selectedPredictionNodeId === node.id;
    const isRelatedNode = relatedNodeIds.has(node.id);
    circle.setAttribute("stroke", node.isAmbient && !selectedPrediction && !isRelatedNode ? "rgba(255,255,255,0.12)" : isSelected || selectedPrediction ? "rgba(20,33,44,0.9)" : isRelatedNode ? "rgba(202,91,38,0.75)" : "rgba(255,255,255,0.72)");
    circle.setAttribute("stroke-width", node.isAmbient && !selectedPrediction && !isRelatedNode ? "0.5" : isSelected || selectedPrediction ? "4" : isRelatedNode ? "3" : "1.5");
    circle.style.cursor = "pointer";
    circle.addEventListener("click", () => {
      state.selectedPredictionNodeId = node.id;
      if (agent) {
        state.selectedNode = node.agentId || node.id;
        renderInspector();
      }
      renderPredictionArena();
    });
    predictionGraphViewEl.appendChild(circle);

    if (!node.isAmbient && ((node.projectedRadius ?? node.radius) >= 10 || isSelected || isRelatedNode)) {
      const label = document.createElementNS(xmlns, "text");
      label.setAttribute("x", node.px ?? node.x);
      label.setAttribute("y", (node.py ?? node.y) + (node.projectedRadius ?? node.radius) + 16);
      label.setAttribute("text-anchor", "middle");
      label.setAttribute("class", "duckerchat-prediction-node-label");
      label.textContent = node.label || agent?.label || node.id;
      predictionGraphViewEl.appendChild(label);
    }
  });
}

function renderModuleLayout() {
  const predictionMode = isPredictionRoom();
  chatPanelEl.hidden = predictionMode;
  predictionArenaEl.hidden = !predictionMode;
  graphPanelEl.hidden = predictionMode;

  chatPanelEl.style.display = predictionMode ? "none" : "grid";
  predictionArenaEl.style.display = predictionMode ? "grid" : "none";
  graphPanelEl.style.display = predictionMode ? "none" : "grid";
}

function renderInspector() {
  const agent = byId(state.agents, state.selectedNode) || byId(state.agents, "atlas");
  const outgoing = currentEvents().filter((event) => event.speaker === agent.id).length;
  const incoming = currentEvents().filter((event) => event.target === agent.id).length;
  const profile = agent.motivation || {};
  const freshnessCounts = (agent.state?.sourceLibrary || []).reduce((acc, entry) => {
    const key = entry?.freshness?.status || "undated";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, { fresh: 0, aging: 0, stale: 0, undated: 0 });
  const topTrust = strongestRelation(agent.id, "trust");
  const topComplement = strongestRelation(agent.id, "complementarity");
  const topRival = strongestRelation(agent.id, "rivalry");
  const topRelations = topSocialRelations(agent.id, 4);
  const activeRuns = currentRuntime()?.scheduler?.activeRuns || [];
  const queued = currentRuntime()?.scheduler?.queue || [];
  const activationState =
    activeRuns.some((entry) => entry.agentId === agent.id)
      ? "执行中"
      : queued.some((entry) => entry.agentId === agent.id)
        ? "已排队"
        : "待命";
  agentCardEl.innerHTML = `
    <div class="duckerchat-console-item">
      <div class="duckerchat-message-author">
        <div class="duckerchat-avatar" style="background:${agent.visual.color}">${agent.visual.initials}</div>
        <div>
          <strong>${escapeHtml(agent.label)}</strong>
          <p>${escapeHtml(agent.role)} · ${escapeHtml(activationState)}</p>
        </div>
      </div>
      <div class="duckerchat-monitor-grid" style="margin-top:12px">
        <div class="duckerchat-monitor-card"><span class="duckerchat-note">模型</span><strong>${escapeHtml(agent.modelBinding.model)}</strong></div>
        <div class="duckerchat-monitor-card"><span class="duckerchat-note">公开角色</span><strong>${escapeHtml(agent.role)}</strong></div>
        <div class="duckerchat-monitor-card"><span class="duckerchat-note">发出</span><strong>${outgoing}</strong></div>
        <div class="duckerchat-monitor-card"><span class="duckerchat-note">收到</span><strong>${incoming}</strong></div>
        <div class="duckerchat-monitor-card"><span class="duckerchat-note">好奇心</span><strong>${Math.round((profile.curiosity || 0) * 100)}</strong></div>
        <div class="duckerchat-monitor-card"><span class="duckerchat-note">驱动力</span><strong>${Math.round((profile.drive || 0) * 100)}</strong></div>
        <div class="duckerchat-monitor-card"><span class="duckerchat-note">差异偏好</span><strong>${Math.round((profile.noveltyBias || 0) * 100)}</strong></div>
        <div class="duckerchat-monitor-card"><span class="duckerchat-note">选择性</span><strong>${Math.round((profile.selectivity || 0) * 100)}</strong></div>
      </div>
      <div style="margin-top:12px">
        <strong>公开判断风格</strong>
        <p>${escapeHtml(agent.chatStyle || "自然交流")}</p>
      </div>
      <div style="margin-top:12px">
        <strong>角色任务</strong>
        <p>${escapeHtml(agent.soul)}</p>
      </div>
      <div style="margin-top:12px">
        <strong>主要关注词</strong>
        <div class="duckerchat-chip-row">${((profile.keywords || []).slice(0, 8)).map((keyword) => `<span class="duckerchat-chip">${escapeHtml(keyword)}</span>`).join("")}</div>
      </div>
      <div style="margin-top:12px">
        <strong>长期关系</strong>
        <div class="duckerchat-monitor-grid" style="margin-top:8px">
          <div class="duckerchat-monitor-card"><span class="duckerchat-note">最信任</span><strong>${escapeHtml(topTrust?.targetAgent?.label || "暂无")}</strong></div>
          <div class="duckerchat-monitor-card"><span class="duckerchat-note">最互补</span><strong>${escapeHtml(topComplement?.targetAgent?.label || "暂无")}</strong></div>
          <div class="duckerchat-monitor-card"><span class="duckerchat-note">主要对手</span><strong>${escapeHtml(topRival?.targetAgent?.label || "暂无")}</strong></div>
          <div class="duckerchat-monitor-card"><span class="duckerchat-note">社交边</span><strong>${topRelations.length}</strong></div>
        </div>
        <div class="duckerchat-chip-row" style="margin-top:8px">
          ${topRelations.map((relation) => {
            const tags = [];
            if (relation.coordination >= 0.55) tags.push("协作");
            if (relation.complementarity >= 0.55) tags.push("互补");
            if (relation.rivalry >= 0.45) tags.push("对抗");
            if (!tags.length) tags.push("观察");
            return `<span class="duckerchat-chip">${escapeHtml(relation.targetAgent.label)} · ${escapeHtml(tags.join("/"))}</span>`;
          }).join("")}
        </div>
      </div>
      <div style="margin-top:12px">
        <strong>来源策略</strong>
        <div class="duckerchat-monitor-grid" style="margin-top:8px">
          <div class="duckerchat-monitor-card"><span class="duckerchat-note">质量下限</span><strong>${escapeHtml(agent.state?.sourceQualityPolicy?.reliabilityFloor || agent.sourceProfile?.reliabilityFloor || "A-")}</strong></div>
          <div class="duckerchat-monitor-card"><span class="duckerchat-note">多样性目标</span><strong>${escapeHtml(String(agent.state?.sourceQualityPolicy?.diversityTarget || agent.sourceProfile?.diversityTarget || 3))}</strong></div>
          <div class="duckerchat-monitor-card"><span class="duckerchat-note">时效策略</span><strong>${escapeHtml(agent.state?.sourceQualityPolicy?.freshness || agent.sourceProfile?.freshness || "mixed")}</strong></div>
          <div class="duckerchat-monitor-card"><span class="duckerchat-note">来源包</span><strong>${escapeHtml(String((agent.state?.sourceCatalogRefs || agent.sourceProfile?.packRefs || []).length))}</strong></div>
          <div class="duckerchat-monitor-card"><span class="duckerchat-note">Fresh</span><strong>${freshnessCounts.fresh || 0}</strong></div>
          <div class="duckerchat-monitor-card"><span class="duckerchat-note">Aging/Stale</span><strong>${(freshnessCounts.aging || 0) + (freshnessCounts.stale || 0)}</strong></div>
        </div>
        <div class="duckerchat-chip-row" style="margin-top:8px">
          ${((agent.state?.sourceCatalogRefs || agent.sourceProfile?.packRefs || []).slice(0, 6)).map((packId) => `<span class="duckerchat-chip">${escapeHtml(packId)}</span>`).join("")}
        </div>
      </div>
    </div>
  `;
}

function renderSynthesis() {
  const synthesis = currentGraph().synthesis || {};
  directionTextEl.textContent = synthesis.direction || "";
  consensusListEl.innerHTML = (synthesis.consensus || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  tensionListEl.innerHTML = (synthesis.tensions || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  actionListEl.innerHTML = (synthesis.nextActions || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("");

  const artifact = currentFinalAnswer();
  const claimGraph = currentClaimGraph();
  const authorityLog = currentAuthorityLog();
  const authority = authoritySummary(authorityLog);
  const diagnostics = currentDiagnostics();
  if (artifact) {
    const confidence = typeof artifact.confidence === "object" ? artifact.confidence.overall : artifact.confidence;
    const claimCount = Array.isArray(artifact.key_claims) ? artifact.key_claims.length : 0;
    const dissentCount = Array.isArray(artifact.dissent) ? artifact.dissent.length : 0;
    const minority =
      Array.isArray(artifact.minority_report)
        ? artifact.minority_report.slice(0, 2)
        : (artifact.minority_report ? [artifact.minority_report] : []);
    const updateTriggers = artifact.update_triggers || artifact.updateTriggers || [];
    finalAnswerCardEl.innerHTML = `
      <div class="duckerchat-final-answer">
        <h4>${escapeHtml(artifact.headline || "最终回答")}</h4>
        <p class="duckerchat-note">${escapeHtml(artifact.executive_summary || "")}</p>
        <div class="duckerchat-chip-row">
          <span class="duckerchat-chip">置信度 ${confidence || "未知"}</span>
          ${claimCount ? `<span class="duckerchat-chip">${claimCount} 个论点</span>` : ""}
          ${dissentCount ? `<span class="duckerchat-chip">${dissentCount} 个分歧节点</span>` : ""}
          ${artifact.usage?.total_tokens ? `<span class="duckerchat-chip">tokens ${artifact.usage.total_tokens}</span>` : ""}
        </div>
        ${minority.length ? `<div class="duckerchat-claim-card"><strong>Minority Report</strong><p class="duckerchat-note">${escapeHtml(minority.join("；"))}</p></div>` : ""}
        ${updateTriggers.length ? `<div class="duckerchat-chip-row">${updateTriggers.slice(0, 3).map((item) => `<span class="duckerchat-chip">${escapeHtml(item)}</span>`).join("")}</div>` : ""}
      </div>
    `;
  } else {
    finalAnswerCardEl.innerHTML = `<div class="duckerchat-note">还没有最终回答产物。</div>`;
  }

  if (claimGraph?.claims?.length) {
    const topClaims = claimGraph.claims
      .slice()
      .sort((a, b) => (b.importance || 0) - (a.importance || 0))
      .slice(0, 4);
    claimGraphCardEl.innerHTML = `
      <div class="duckerchat-final-answer">
        <div class="duckerchat-chip-row">
          <span class="duckerchat-chip">${claimGraph.claims.length} 个 claims</span>
          <span class="duckerchat-chip">${(claimGraph.relations || []).length} 条关系</span>
        </div>
        ${topClaims.map((claim) => `
          <div class="duckerchat-claim-card">
            <strong>${escapeHtml(claim.text || "")}</strong>
            <div class="duckerchat-chip-row">
              <span class="duckerchat-chip">状态 ${escapeHtml(claim.derivedStatus || claim.status || "supported")}</span>
              <span class="duckerchat-chip">置信 ${escapeHtml(String(claim.confidence || "中"))}</span>
              ${(claim.source_refs || []).length ? `<span class="duckerchat-chip">${claim.source_refs.length} 个来源</span>` : ""}
              ${claim.needsReview ? `<span class="duckerchat-chip">需复查</span>` : ""}
            </div>
            ${(claim.evidence || []).length ? `<p class="duckerchat-note">依据：${escapeHtml(claim.evidence.slice(0, 2).join("；"))}</p>` : ""}
            ${(claim.counterevidence || []).length ? `<p class="duckerchat-note">反证：${escapeHtml(claim.counterevidence.slice(0, 1).join("；"))}</p>` : ""}
            ${(claim.source_refs || []).length ? `<p class="duckerchat-note">来源：${escapeHtml(claim.source_refs.slice(0, 2).join("；"))}</p>` : ""}
            ${(claim.supporting_agents || []).length ? `<p class="duckerchat-note">支持方：${escapeHtml(claim.supporting_agents.slice(0, 3).join("、"))}</p>` : ""}
            ${(claim.opposing_agents || []).length ? `<p class="duckerchat-note">反对方：${escapeHtml(claim.opposing_agents.slice(0, 2).join("、"))}</p>` : ""}
            ${claim.provenance ? `<p class="duckerchat-note">来源健康：${escapeHtml(claim.provenance.freshnessStatus || "unresolved")} · provenance ${escapeHtml(String(claim.provenance.provenanceScore ?? 0))}</p>` : ""}
            ${(claim.update_triggers || []).length ? `<p class="duckerchat-note">更新触发：${escapeHtml(claim.update_triggers.slice(0, 1).join("；"))}</p>` : ""}
          </div>
        `).join("")}
      </div>
    `;
  } else {
    claimGraphCardEl.innerHTML = `<div class="duckerchat-note">还没有知识骨架。</div>`;
  }

  authorityLogCardEl.innerHTML = (authorityLog?.entries || []).slice(-4).reverse().map((entry) => `
    <div class="duckerchat-claim-card">
      <strong>${escapeHtml(entry.action || "governance")}</strong>
      <p class="duckerchat-note">${escapeHtml(entry.summary || "")}</p>
      <div class="duckerchat-chip-row">
        <span class="duckerchat-chip">${escapeHtml(entry.actor || "system")}</span>
        <span class="duckerchat-chip">${escapeHtml(entry.scope || "room")}</span>
      </div>
    </div>
  `).join("") || `<div class="duckerchat-note">还没有治理日志。</div>`;
  if (authority) {
    authorityLogCardEl.innerHTML = `
      <div class="duckerchat-final-answer">
        <div class="duckerchat-chip-row">
          <span class="duckerchat-chip">主导方 ${escapeHtml(authority.leader)}</span>
          <span class="duckerchat-chip">占比 ${Math.round(authority.ratio * 100)}%</span>
        </div>
        ${(diagnostics?.warnings || []).length ? `<div class="duckerchat-chip-row">${diagnostics.warnings.slice(0, 3).map((item) => `<span class="duckerchat-chip">${escapeHtml(item)}</span>`).join("")}</div>` : ""}
        ${authorityLogCardEl.innerHTML}
      </div>
    `;
  }
}

function renderControlDeck() {
  const room = currentRoom();
  const runtime = currentRuntime();
  const resources = aggregateRoomResources();

  controlDeckStatusEl.textContent =
    state.mode === "live"
      ? runtime?.scheduler?.enabled
        ? "自动运行"
        : "手动模式"
      : "演示模式";

  schedulerToggleButtonEl.disabled = state.mode !== "live";
  schedulerToggleButtonEl.textContent = runtime?.scheduler?.enabled ? "暂停调度" : "恢复调度";

  refreshButtonEl.textContent = state.mode === "live" ? "刷新" : "重置演示";
  roomRunButtonEl.disabled = !room;
  consoleToggleButtonEl.textContent = state.consoleCollapsed ? "展开右栏" : "折叠右栏";

  if (room?.module === "question_forge") {
    roomRunButtonEl.textContent = "运行一轮锻炉";
    roomRunButtonEl.className = "secondary";
  } else if (room?.module === "ultimate_prediction") {
    roomRunButtonEl.textContent = "运行终极预测";
    roomRunButtonEl.className = "secondary";
  } else {
    roomRunButtonEl.textContent = "唤醒群体";
    roomRunButtonEl.className = "ghost";
  }

  resourceMonitorEl.innerHTML = `
    <div class="duckerchat-monitor-card"><span class="duckerchat-note">成员数</span><strong>${resources.participantCount}</strong></div>
    <div class="duckerchat-monitor-card"><span class="duckerchat-note">在线智能体</span><strong>${resources.liveAgentCount}</strong></div>
    <div class="duckerchat-monitor-card"><span class="duckerchat-note">待抓取资料</span><strong>${resources.pendingSources}</strong></div>
    <div class="duckerchat-monitor-card"><span class="duckerchat-note">公开轮次</span><strong>${resources.publicTurns}</strong></div>
    <div class="duckerchat-monitor-card"><span class="duckerchat-note">答案联盟</span><strong>${resources.coalitionCount}</strong></div>
    <div class="duckerchat-monitor-card"><span class="duckerchat-note">Fresh Sources</span><strong>${resources.freshSources}</strong></div>
    <div class="duckerchat-monitor-card"><span class="duckerchat-note">Aging/Stale</span><strong>${resources.staleSources}</strong></div>
    <div class="duckerchat-monitor-card"><span class="duckerchat-note">平均 tokens / 次</span><strong>${resources.avgTokensPerRun}</strong></div>
  `;
}

function renderRuntimeMonitor() {
  const runtime = currentRuntime();
  runtimeModeLabelEl.textContent = state.mode === "live" ? "真实运行" : "交互演示";
  if (!runtime) {
    runtimeMonitorEl.innerHTML = `<div class="duckerchat-note">暂无运行状态。</div>`;
    schedulerQueueEl.innerHTML = "";
    systemConsoleEl.innerHTML = "";
    return;
  }

  runtimeMonitorEl.innerHTML = `
    <div class="duckerchat-monitor-card"><span class="duckerchat-note">排队中</span><strong>${runtime.scheduler.queue.length}</strong></div>
    <div class="duckerchat-monitor-card"><span class="duckerchat-note">活跃执行</span><strong>${runtime.scheduler.activeRuns.length}</strong></div>
    <div class="duckerchat-monitor-card"><span class="duckerchat-note">并发上限</span><strong>${runtime.scheduler.maxConcurrentRuns || 0}</strong></div>
    <div class="duckerchat-monitor-card"><span class="duckerchat-note">剩余预算</span><strong>${runtime.budgets.tokenBudgetRemaining || 0}</strong></div>
    <div class="duckerchat-monitor-card"><span class="duckerchat-note">累计 tokens</span><strong>${runtime.metrics?.totalTokens || 0}</strong></div>
    <div class="duckerchat-monitor-card"><span class="duckerchat-note">智能体执行次数</span><strong>${runtime.metrics?.totalAgentRuns || 0}</strong></div>
    ${runtime.announcements?.lastGlobalNotice ? `<div class="duckerchat-monitor-card"><span class="duckerchat-note">全局告警</span><strong>${escapeHtml(runtime.announcements.lastGlobalNotice.title)}</strong></div>` : ""}
  `;

  schedulerQueueEl.innerHTML = [
    ...(runtime.scheduler.activeRuns || []).map((entry) => {
      const agent = byId(state.agents, entry.agentId);
      return `<div class="duckerchat-console-item"><strong>运行中 · ${escapeHtml(agent?.label || entry.agentId)}</strong><p>${escapeHtml(schedulerReasonLabel(entry.reason))}</p></div>`;
    }),
    ...(runtime.scheduler.queue || []).slice(0, 8).map((entry) => {
      const agent = byId(state.agents, entry.agentId);
      const priority = typeof entry.priority === "number" ? entry.priority.toFixed(2) : "0.00";
      const activation = entry.activationScore != null ? ` · a=${Number(entry.activationScore).toFixed(2)}` : "";
      return `<div class="duckerchat-console-item"><strong>排队中 · ${escapeHtml(agent?.label || entry.agentId)}</strong><p>${escapeHtml(schedulerReasonLabel(entry.reason))} · p=${priority}${activation}</p></div>`;
    })
  ].join("") || `<div class="duckerchat-note">当前没有排队任务。</div>`;

  const summaryNotes = (runtime.compaction?.summaryNotes || []).slice(-2).reverse().map((note) => `
    <div class="duckerchat-console-item">
      <strong>压缩摘要</strong>
      <p>${escapeHtml(note.summary || "")}</p>
    </div>
  `);
  const recentEvents = currentEvents().slice(-8).reverse().map((event) => `
    <div class="duckerchat-console-item">
      <strong>${escapeHtml((byId(state.agents, event.speaker) || {}).label || event.speaker)} · ${escapeHtml(stageLabel(event.stage))}</strong>
      <p>${escapeHtml(event.title)}</p>
    </div>
  `);
  systemConsoleEl.innerHTML = [...summaryNotes, ...recentEvents].join("");
}

function addFallbackEvent(event) {
  const bundle = state.roomBundle;
  bundle.events.push({
    ...event,
    id: `${bundle.room.id}-${Date.now()}`,
    createdAt: new Date().toISOString()
  });
  if (event.target) {
    const edge = bundle.graphState.edges.find((entry) => entry.source === event.speaker && entry.target === event.target && entry.stage === event.stage);
    if (edge) edge.weight += 1;
    else bundle.graphState.edges.push({ source: event.speaker, target: event.target, stage: event.stage, weight: 1 });
  }
  if (event.speaker === "human") {
    bundle.graphState.synthesis.direction = event.body;
  }
}

function simulateFallbackSocialReply(targetId, text) {
  const templates = {
    atlas: { stage: "planning", target: "lumen", title: "规划者重构房间", body: `我建议围绕“${text}”重新组织讨论节奏，并先把问题边界澄清清楚。` },
    lumen: { stage: "evidence", target: "forge", title: "研究者扩展资料", body: `围绕“${text}”，我会优先寻找相邻案例、矛盾证据和可验证资料。` },
    mira: { stage: "evidence", target: "synthesis", title: "市场观察者补充判断", body: `“${text}”会影响留存、身份、声望和传播结构，我会从这些角度补充房间结论。` },
    sable: { stage: "challenge", target: "atlas", title: "批评者保留分歧", body: `不要让“${text}”过早滑向顺滑共识，少数意见和反例要被留住。` },
    forge: { stage: "implementation", target: "synthesis", title: "构建者转成实现", body: `“${text}”在界面和系统上意味着需要更强的群聊房间和可见回答产物。` }
  };
  const template = templates[targetId] || templates.atlas;
  addFallbackEvent({
    speaker: targetId,
    target: template.target,
    stage: template.stage,
    title: template.title,
    body: template.body,
    sources: ["演示数据"]
  });
}

function simulateFallbackForgeAnswer(text) {
  addFallbackEvent({
    speaker: "atlas",
    target: "lumen",
    stage: "planning",
    title: "问题锻炉规划",
    body: `我们应该先把“${text}”变成问题 intake、对立假设、证据地图和分歧台账，然后再综合。`,
    sources: ["演示数据"]
  });
  addFallbackEvent({
    speaker: "synthesis",
    target: "human",
    stage: "convergence",
    title: "问题锻炉最终回答",
    body: `围绕“${text}”，最强的回答应该是一个分阶段、带证据、保留分歧而不是抹平分歧的回答产物。`,
    sources: ["演示数据"]
  });
  state.roomBundle.finalAnswer = {
    headline: "问题锻炉应该输出保留分歧的回答产物",
    executive_summary: `围绕问题“${text}”，房间收敛到一个带证据地图、少数派报告和修订轨迹的结构化回答对象。`,
    confidence: "原型"
  };
}

async function postEvent(payload) {
  await fetchJson(`/api/rooms/${state.activeRoomId}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  await refreshLiveState();
}

async function handleHumanSubmit(event) {
  event.preventDefault();
  const body = promptInputEl.value.trim();
  if (!body) return;

  if (state.mode === "fallback") {
    addFallbackEvent({
      speaker: "human",
      target: null,
      stage: "human",
      title: "Henry 向全房间发言",
      body,
      sources: ["演示数据"]
    });
    if (currentRoom().module === "question_forge") simulateFallbackForgeAnswer(body);
    else if (currentRoom().module === "ultimate_prediction") {
      state.roomBundle.predictionState.phase = "arbitrated";
      state.roomBundle.predictionState.finalVerdict.executive_summary = `围绕“${body}”，系统会先做全体素材感知，再只让少量前线节点起草与裁定。`;
    }
    else {
      ["atlas", "lumen", "mira"].forEach((agentId) => simulateFallbackSocialReply(agentId, body));
    }
    promptInputEl.value = "";
    state.selectedNode = "atlas";
    render();
    return;
  }

  await postEvent({
    speaker: "human",
    target: null,
    stage: "human",
    title: "Henry 向全房间发言",
    body,
    sources: ["人类群聊消息"]
  });

  if (currentRoom().module === "question_forge") {
    await fetchJson(`/api/rooms/${state.activeRoomId}/question-forge/run`, { method: "POST" });
  } else if (currentRoom().module === "ultimate_prediction") {
    state.selectedPredictionNodeId = null;
    try {
      await fetchJson(`/api/rooms/${state.activeRoomId}/ultimate-prediction/run`, { method: "POST" });
    } catch (error) {
      console.error(error);
    }
  }

  promptInputEl.value = "";
  state.selectedNode = "atlas";
  await refreshLiveState();
  render();
}

async function handleAdvance() {
  if (state.mode === "fallback") {
    if (currentRoom().module === "question_forge") {
      simulateFallbackForgeAnswer(currentRoom().prompt);
    } else if (currentRoom().module === "ultimate_prediction") {
      state.roomBundle.predictionState.phase = "arbitrated";
    } else {
      const agents = state.agents.filter((agent) => agent.kind === "agent");
      const target = state.selectedNode && !["human", "synthesis"].includes(state.selectedNode)
        ? state.selectedNode
        : agents[Math.floor(Math.random() * agents.length)].id;
      simulateFallbackSocialReply(target, currentGraph().synthesis.direction || currentRoom().prompt);
    }
    render();
    return;
  }

  const agents = state.agents.filter((agent) => agent.kind === "agent").map((agent) => agent.id);
  const selected =
    state.selectedNode && !["human", "synthesis"].includes(state.selectedNode)
      ? [state.selectedNode]
      : agents.slice(0, 3);
  if (currentRoom().module === "ultimate_prediction") {
    state.selectedPredictionNodeId = null;
    try {
      await fetchJson(`/api/rooms/${state.activeRoomId}/ultimate-prediction/run`, { method: "POST" });
    } catch (error) {
      console.error(error);
    }
    await refreshLiveState();
    render();
    return;
  }
  await fetchJson(`/api/rooms/${state.activeRoomId}/scheduler/nudge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agentIds: selected })
  });
  await refreshLiveState();
  render();
}

async function handleSchedulerToggle() {
  if (state.mode !== "live") return;
  await fetchJson(`/api/rooms/${state.activeRoomId}/scheduler/toggle`, { method: "POST" });
  await refreshLiveState();
  render();
}

async function handleRefresh() {
  if (state.mode === "fallback") {
    await loadRoomBundle(state.activeRoomId);
  } else {
    await refreshLiveState();
  }
  render();
}

async function handleRoomRun() {
  if (state.mode === "fallback") {
    await handleAdvance();
    return;
  }

  if (currentRoom().module === "question_forge") {
    await fetchJson(`/api/rooms/${state.activeRoomId}/question-forge/run`, { method: "POST" });
  } else if (currentRoom().module === "ultimate_prediction") {
    state.selectedPredictionNodeId = null;
    try {
      await fetchJson(`/api/rooms/${state.activeRoomId}/ultimate-prediction/run`, { method: "POST" });
    } catch (error) {
      console.error(error);
    }
  } else {
    await handleAdvance();
    return;
  }

  await refreshLiveState();
  render();
}

function wireEvents() {
  composerEl.addEventListener("submit", handleHumanSubmit);
  advanceButtonEl.addEventListener("click", handleAdvance);
  schedulerToggleButtonEl.addEventListener("click", handleSchedulerToggle);
  refreshButtonEl.addEventListener("click", handleRefresh);
  roomRunButtonEl.addEventListener("click", handleRoomRun);
  jumpToLatestButtonEl.addEventListener("click", () => {
    messageListEl.scrollTop = messageListEl.scrollHeight;
    state.feedUnreadCount = 0;
    updateJumpToLatestButton();
  });
  messageListEl.addEventListener("scroll", () => {
    const distanceFromBottom = messageListEl.scrollHeight - messageListEl.scrollTop - messageListEl.clientHeight;
    if (distanceFromBottom <= 24) {
      state.feedUnreadCount = 0;
      updateJumpToLatestButton();
    }
  });
  predictionGraphViewEl.addEventListener("wheel", (event) => {
    if (!isPredictionRoom() || state.predictionView !== "society") return;
    event.preventDefault();
    const delta = event.deltaY < 0 ? 0.12 : -0.12;
    state.predictionCamera.zoom = Math.max(0.45, Math.min(2.8, state.predictionCamera.zoom + delta));
    renderPredictionArena();
  }, { passive: false });
  predictionGraphViewEl.addEventListener("pointerdown", (event) => {
    if (!isPredictionRoom() || state.predictionView !== "society") return;
    state.predictionDragging = true;
    state.predictionDragStart = { x: event.clientX, y: event.clientY };
  });
  predictionGraphViewEl.addEventListener("pointermove", (event) => {
    if (!state.predictionDragging || !state.predictionDragStart || !isPredictionRoom() || state.predictionView !== "society") return;
    const dx = event.clientX - state.predictionDragStart.x;
    const dy = event.clientY - state.predictionDragStart.y;
    state.predictionCamera.rotY += dx * 0.008;
    state.predictionCamera.rotX += dy * 0.008;
    state.predictionDragStart = { x: event.clientX, y: event.clientY };
    renderPredictionArena();
  });
  predictionGraphViewEl.addEventListener("pointerup", () => {
    state.predictionDragging = false;
    state.predictionDragStart = null;
  });
  predictionGraphViewEl.addEventListener("pointerleave", () => {
    state.predictionDragging = false;
    state.predictionDragStart = null;
  });
  consoleToggleButtonEl.addEventListener("click", () => {
    state.consoleCollapsed = !state.consoleCollapsed;
    render();
  });
  resetButtonEl.addEventListener("click", async () => {
    if (state.mode === "fallback") {
      await loadRoomBundle(state.activeRoomId);
    } else {
      await refreshLiveState();
    }
    state.activeStage = "all";
    render();
  });
}

function render() {
  appShellEl.classList.toggle("console-collapsed", state.consoleCollapsed);
  renderModuleTabs();
  renderRooms();
  renderHeader();
  renderStageFilters();
  renderModuleLayout();
  renderFeed();
  renderGraph();
  renderPredictionArena();
  renderInspector();
  renderSynthesis();
  renderControlDeck();
  renderRuntimeMonitor();
}

async function bootstrap() {
  wireEvents();
  await loadBootstrap();
  if (state.mode === "live") {
    state.refreshTimer = setInterval(async () => {
      if (!state.activeRoomId) return;
      try {
        await refreshLiveState();
        render();
      } catch {
        // keep last good state
      }
    }, 3000);
  }
}

bootstrap().catch((error) => {
  console.error(error);
});
