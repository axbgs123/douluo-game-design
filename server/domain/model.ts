import type { CandidatePublic, CandidateRarity, CharacterPublic, ConditionLabel, GameView, PersonalitySetup, WorldInheritanceView } from "../../shared/game.js";

export interface MartialSoulTemplate {
  id: string;
  name: string;
  category: string;
  description: string;
  rarity: number;
  soulPowerRange: [number, number];
  omens: string[];
  metaRarity?: import("../../shared/game.js").MartialSoulRarity;
  grade?: CandidateRarity;
  sourceEra?: 1 | 2 | 3 | 4 | "原创" | "局外";
  affinityTags?: string[];
  lineageBound?: boolean;
}

export interface HiddenCandidate {
  public: CandidatePublic;
  originId: string;
  roleTags: string[];
  martialSoul: MartialSoulTemplate;
  martialSouls: MartialSoulTemplate[];
  innateSoulPower: number;
  hiddenGift?: string;
  physique: string;
  spirit: string;
  perception: string;
  originStart?: {
    coins: number;
    items: string[];
    reputation: string;
    advantage: string;
    burden: string;
    pressure: number;
  };
}

export interface PersonalityProfile {
  scores: Record<string, number>;
  summary: string[];
  evidence?: Array<{ action: string; at: string }>;
}

export interface WorldNpcState {
  id: string;
  name: string;
  alive: boolean;
  age?: number;
  soulRank?: number;
  powerTier: string;
  locationId: string;
  factionIds: string[];
  currentGoal: string;
  dispositionToPlayer: number;
  knownToPlayer: boolean;
  lastSimulatedYear: number;
  memoryOfPlayer: string[];
  episodicMemory: NpcMemoryEntry[];
  autonomyLog: Array<{ year: number; day: number; action: string; reason: string }>;
  activePlan?: NpcPlanState;
}

export interface NpcPlanState {
  id: string;
  desire: string;
  responsibility: string;
  informationBoundary: string[];
  authority: string;
  resources: string[];
  nextAction: string;
  targetLocationId: string;
  deadlineOrdinal: number;
  status: "计划中" | "执行中" | "受阻" | "完成";
  progress: number;
  createdYear: number;
  createdDay: number;
  lastOutcome?: string;
  playerImpact?: string;
}

export interface NpcMemoryEntry {
  id: string;
  text: string;
  year: number;
  day: number;
  actionIndex: number;
  significance: 1 | 2 | 3;
  source: "规则结算" | "叙事提取" | "传闻传播" | "旧存档";
  witnessed: boolean;
}

export interface SocialRumorState {
  id: string;
  publicName: string;
  locationId: string;
  summary: string;
  valence: -1 | 1;
  witnessNpcIds: string[];
  factionIds: string[];
  createdOrdinal: number;
  spreadsAtOrdinal: number;
  status: "待传播" | "已传播";
  confidence?: number;
  sourceKind?: "现场目击" | "公开登记";
  earlyCirculationChannel?: "地方告示" | "口耳传闻" | "商旅消息" | "势力通告";
  earlyCirculationStatus?: "仅本地" | "待扩散" | "已扩散";
  earlyCirculationSpreadsAtOrdinal?: number;
  earlyCirculationBasis?: string;
  mediaChannel?: string;
  mediaOutlet?: string;
  editorialStance?: string;
  editorialDecision?: string;
  corroborationCount?: number;
  verificationStatus?: "来源不足" | "同源多证待复核" | "跨关系网交叉核验" | "双记录核验" | "关联转载核验" | "更正证据已核验";
  mediaSpreadsAtOrdinal?: number;
  secondaryMediaSpreadsAtOrdinal?: number;
  mediaStatus?: "不刊发" | "待刊发" | "已刊发" | "已更正";
  mediaVersions?: Array<{ id: string; outlet: string; stance: string; framing: string; confidence: number; verificationStatus: "关联转载核验" | "更正证据已核验"; publishedOrdinal: number }>;
  auditStartedActionIndex?: number;
  correctionEvidence?: string[];
}

export interface NpcRelationState {
  leftId: string;
  rightId: string;
  bond: number;
  kind: "亲近" | "合作" | "竞争" | "敌对" | "陌生";
  lastChangedYear: number;
  dimensions: {
    affinity: number;
    trust: number;
    respect: number;
    sharedInterest: number;
    vigilance: number;
    hostility: number;
  };
  history: Array<{ year: number; day: number; delta: number; reason: string }>;
}

export type CanonCausalDomain = "identity" | "goal" | "faction" | "relationship" | "power" | "location" | "survival" | "resource" | "institution";

export interface CanonCausalFootprint {
  id: string;
  source: string;
  description: string;
  atYear: number;
  atDay: number;
  locationId: string;
  affectedNpcIds: string[];
  affectedFactionIds: string[];
  strength: number;
  domains?: CanonCausalDomain[];
  expiresOrdinal?: number;
  originEventId?: string;
  propagationDepth?: number;
}

export interface CanonTimelineBranch {
  id: string;
  eventId: string;
  state: "延后" | "替代" | "取消";
  originalYear: number;
  originalDay: number;
  resolveOrdinal: number;
  causeIds: string[];
  affectedNpcIds: string[];
  affectedFactionIds: string[];
  summary: string;
  status: "待结算" | "已结算";
  replacementEventId?: string;
  recheckCount?: number;
}

export interface DynamicWorldEvent {
  id: string;
  title: string;
  kind: "地方" | "势力" | "人物" | "历史前兆";
  locationId: string;
  participantIds: string[];
  detail: string;
  stakes: number;
  status: "可介入" | "已解决" | "错过";
  createdYear: number;
  createdDay: number;
  expiresOrdinal: number;
  outcome?: string;
  consequences?: string[];
}

export interface LocalWorldConsequence {
  id: string;
  sourceEventId: string;
  locationId: string;
  kind: "供需" | "治安" | "伤亡" | "制度" | "关系" | "势力" | "生态";
  summary: string;
  magnitude: number;
  marketEffects: Array<{ category: "药材" | "金属" | "粮食" | "魂导材料" | "日用品"; supplyDelta: number; demandDelta: number }>;
  riskDelta: number;
  startedOrdinal: number;
  expiresOrdinal: number;
  status: "生效中" | "已消退";
}

export interface StoryMemory {
  summary: string;
  openThreads: string[];
  keyChoices: string[];
  npcNotes: Record<string, string>;
  chapterNumber: number;
  chapterTitle: string;
  lastUpdatedAction: number;
}

export interface HiddenWorldState {
  npcs: Record<string, WorldNpcState>;
  firedCanonEvents: string[];
  suppressedCanonEvents: string[];
  deviation: number;
  canonCausalFootprints: CanonCausalFootprint[];
  canonTimelineBranches: CanonTimelineBranch[];
  npcRelations: NpcRelationState[];
  dynamicEvents: DynamicWorldEvent[];
  localConsequences: LocalWorldConsequence[];
  socialRumors: SocialRumorState[];
  lastAutonomyOrdinal: number;
  resurrectionCount: number;
  resurrectionRecords: Array<{
    targetId: "player" | string;
    source: string;
    conditions: string[];
    costs: string[];
    year: number;
    day: number;
  }>;
  discoveredLocations: string[];
  intelligenceRecords: Array<{
    id: string;
    subjectType: "人物" | "地点" | "势力" | "事件" | "物品";
    subjectId: string;
    title: string;
    detail: string;
    source: string;
    confidence: number;
    year: number;
    day: number;
    status: "确定" | "推测" | "传闻" | "矛盾";
  }>;
  flags: Record<string, boolean | number | string>;
  trainingPoints: number;
  healthPoints: number;
  fatiguePoints: number;
  metrics: {
    discoveries: number;
    relationshipsBuilt: number;
    historicalImpact: number;
    completedHunts: number;
    promisesKept: number;
    battlesWon: number;
  };
  actionLedger: Array<{
    index: number;
    requestId?: string;
    action: string;
    intent: string;
    result: string;
    year: number;
    day: number;
  }>;
}

export interface StoredGame {
  schemaVersion: number;
  revision: number;
  view: GameView;
  hiddenCandidates: HiddenCandidate[];
  personalityProfile: PersonalityProfile;
  actionIndex: number;
  world: HiddenWorldState;
  storyMemory: StoryMemory;
  lastCommittedAction?: {
    requestId?: string;
    playerInput: string;
    ruleAction: string;
    resolution: ActionResolution;
    narrativeEntryId: string;
    committedAt: string;
    traceGroupId?: string;
  };
  legacy: {
    upgrades: Record<string, number>;
    equippedHeirloom?: string;
    plannedMartialSoulId?: string;
    plannedOriginId?: string;
    worldInheritance?: WorldInheritanceView;
  };
}

export interface ActionResolution {
  intent: string;
  minutes: number;
  ruleSummary: string;
  fallbackNarrative: string;
  suggestions: string[];
  systemMessages?: string[];
  conditionAfter?: ConditionLabel;
  appliedRuleIds?: number[];
  routing?: { selected: string; candidates: string[] };
}

export interface CreateGameInput {
  era?: 1 | 2 | 3 | 4;
  gender: "男" | "女";
  difficulty: GameView["difficulty"];
  personality?: PersonalitySetup;
  lifeGoal?: string;
  seed?: string;
}

export type RevealedCharacter = CharacterPublic;
