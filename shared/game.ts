export const DIFFICULTIES = ["爽", "简单", "标准", "困难", "地狱"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export type Gender = "男" | "女";
export type CandidateRarity = "平凡" | "优秀" | "稀有" | "传奇" | "神话";
export type MartialSoulRarity = "白色" | "蓝色" | "紫色" | "金色" | "红色" | "七彩";
export type LifeGoalDifficulty = "普通" | "困难" | "极难";
export type GameStatus = "candidate_selection" | "character_shaping" | "awakening" | "life_goal_selection" | "playing" | "ended";
export type GameSpeed = "标准" | "高速";
export type GameEra = 1 | 2 | 3 | 4;
export type ConditionLabel = "良好" | "疲惫" | "轻伤" | "重伤" | "濒死" | "死亡";
export type HuntingStage = "需求" | "调查" | "准备" | "旅行" | "追踪" | "战斗" | "吸收" | "后果" | "完成";

export interface PersonalitySetup {
  keywords: string[];
  answers: Record<string, string>;
}

export interface CandidatePublic {
  id: string;
  name: string;
  gender: Gender;
  eraRelation: string;
  birthYearOffset?: number;
  location: string;
  locationId: string;
  dwelling: string;
  mapX: number;
  mapY: number;
  birthProfileId: string;
  originName: string;
  originSummary: string;
  originFacts: Array<{ label: string; value: string }>;
  startingRelations: RelationView[];
  omens: string[];
  route: string;
  rarity: CandidateRarity;
  selfKnowledge: string;
  knownBackground: string;
  fixedTraits: string[];
  originAdvantage: string;
  originBurden: string;
  household: {
    structure: string;
    summary: string;
    members: Array<{ name: string; role: string; note: string }>;
  };
  residence: {
    region: string;
    settlement: string;
    district: string;
    building: string;
    room: string;
    security: string;
    nearby: string[];
  };
}

export interface ScenarioQuestionView {
  id: string;
  prompt: string;
  options: Array<{ id: string; label: string }>;
}

export interface PersonalityDraftView {
  id: string;
  title: string;
  keywords: string[];
  description: string;
  questions: ScenarioQuestionView[];
}

export interface CharacterShapingView {
  goalRerollIndex: number;
  personalityRerollIndex: number;
  goalRerollsUsed: number;
  goalLocks: boolean[];
  lifeGoalOptions: string[];
  lifeGoalDifficulties: LifeGoalDifficulty[];
  personalityOptions: PersonalityDraftView[];
  fixedTraits: string[];
  fixedTraitEffects: Array<{ trait: string; effect: string }>;
}

export interface ChapterObjectiveView {
  title: string;
  stakes: string;
  destinationId?: string;
  steps: Array<{ id: string; text: string; status: "未开始" | "进行中" | "完成" }>;
}

export interface SoulRingView {
  index: number;
  beastId: string;
  beastName: string;
  years: number;
  color: string;
  skillName: string;
  skillDescription: string;
}

export interface SoulSpiritView {
  id: string;
  name: string;
  beastId: string;
  beastName: string;
  years: number;
  grade: "十年" | "百年" | "千年" | "万年";
  bond: number;
  status: "磨合" | "稳定" | "共鸣";
  abilities: string[];
  source: "人工魂灵" | "自愿契约";
}

export interface SoulSpiritContractView {
  stage: "调查" | "评估" | "可签约";
  provider: string;
  beastId: string;
  beastName: string;
  years: number;
  compatibility: number;
  cost: number;
  warning: string;
}

export interface BattleArmorView {
  tier: 1 | 2 | 3 | 4;
  title: string;
  pieces: string[];
  completion: number;
  compatibility: number;
  status: "设计中" | "制作中" | "完整";
  maker: string;
}

export interface BattleArmorProjectView {
  tier: 1 | 2 | 3 | 4;
  blueprintProgress: number;
  compatibility: number;
  failedPieces: number;
  nextPiece: string;
}

export interface MechaProgressView {
  license: "无" | "白级" | "黄级" | "紫级" | "黑级";
  simulatorProgress: number;
  simulatorSessions: number;
  practicalPasses: number;
  model?: string;
  condition?: "完好" | "受损" | "大修";
  energy?: number;
}

export interface StarshipProgressView {
  license: "无" | "见习指挥" | "三级指挥" | "二级指挥" | "一级指挥";
  simulatorProgress: number;
  simulatorSessions: number;
  trainingStartedAge?: number;
  crew: Array<{ relationId: string; name: string; role: "驾驶员" | "导航员" | "轮机师" | "战术员" | "医疗员"; readiness: number }>;
  shipName?: string;
  shipClass?: "穿梭艇" | "小型探索舰" | "护卫舰";
  hull?: number;
  fuel?: number;
  supplies?: number;
  missionsCompleted: number;
}

export interface MartialSoulView {
  name: string;
  category: string;
  description: string;
  rarity?: MartialSoulRarity;
  grade?: CandidateRarity;
  sourceEra?: 1 | 2 | 3 | 4 | "原创" | "局外";
  cultivationState?: "主修" | "未修炼";
  originFit?: string;
}

export interface CharacterPublic extends CandidatePublic {
  age: number;
  martialSoul: MartialSoulView;
  martialSouls: MartialSoulView[];
  innateSoulPower: number;
  soulRank: number;
  cultivationProgress: string;
  condition: ConditionLabel;
  fatigue: string;
  coins: number;
  reputation: string;
  injuries: string[];
  soulRings: SoulRingView[];
  activeMartialSoulIndex: number;
  soulRingSets: SoulRingView[][];
  soulSpirits?: SoulSpiritView[];
  battleArmors?: BattleArmorView[];
  abilityDescriptors: { physique: string; spirit: string; perception: string };
  personalityTraits: string[];
  revealedGift?: string;
  specialSystem?: SpecialSystemView;
}

export interface SpecialSystemView {
  name: string;
  stage: string;
  progress: string;
  abilities: string[];
  resourceHint: string;
}

export interface AffiliationView {
  id: string;
  name: string;
  role: string;
  reputation: string;
  joinedAt: string;
}

export interface StoryChapterView {
  number: number;
  title: string;
  summary: string;
}

export interface NarrativeEntry {
  id: string;
  kind: "narration" | "player" | "system";
  text: string;
  createdAt: string;
}

export interface RelationView {
  id?: string;
  name: string;
  relation: string;
  impression: string;
  faction?: string;
  lastSeen?: string;
  strength?: number;
  category?: "亲属" | "师友" | "同伴" | "势力" | "敌对" | "其他";
  dimensions?: { closeness: number; trust: number; respect: number; sharedInterest: number; vigilance: number; hostility: number; favorDebt: number; identityKnowledge: number };
  history?: Array<{ date: string; reason: string; changes: string }>;
}

export interface ReputationNetworkView {
  scope: string;
  publicName: string;
  reputation: string;
  heat: number;
  source: string;
}

export interface ProfessionView {
  id: string;
  name: string;
  level: string;
  progress: number;
  experiments: number;
  failures: number;
  knownMethods: string[];
}

export interface ManagedFactionView {
  id: string;
  name: string;
  role: string;
  members: number;
  resources: number;
  territory: string[];
  departments: string[];
  internalIssues: string[];
}

export interface EconomyView {
  cash: number;
  bankBalance: number;
  debt: number;
  salary: number;
  business?: string;
  bounty: number;
  blackMarketAccess: boolean;
}

export interface InventoryLoadView {
  used: number;
  capacity: number;
  state: "轻便" | "适中" | "沉重" | "超载";
  storage: string[];
}

export interface NpcRelationEvidenceView {
  id: string;
  leftName: string;
  rightName: string;
  kind: "亲近" | "合作" | "竞争" | "敌对" | "陌生";
  dimensions: {
    affinity: number;
    trust: number;
    respect: number;
    sharedInterest: number;
    vigilance: number;
    hostility: number;
  };
  reason: string;
  date: string;
}

export interface TaskView {
  id?: string;
  title: string;
  kind: "承诺" | "线索" | "计划" | "修炼需求" | "悬赏";
  detail: string;
  status?: "进行中" | "完成" | "失败";
  deadline?: string;
  destinationId?: string;
  ownerId?: string;
  createdActionIndex?: number;
  progressEvidence?: string[];
}

export interface WorldTimeView {
  era: string;
  year: number;
  day: number;
  time: string;
  season: "春" | "夏" | "秋" | "冬";
}

export interface MapLocationView {
  id: string;
  name: string;
  region: string;
  description: string;
  danger: string;
  travelMinutes: number;
  discovered: boolean;
  current: boolean;
  x: number;
  y: number;
  objective?: "任务" | "猎魂" | "事件";
}

export interface MapPinView {
  id: string;
  label: string;
  x: number;
  y: number;
  createdAt: string;
}

export type MapLevel = "大陆" | "聚居地" | "建筑";
export interface MapNodeView {
  id: string;
  name: string;
  level: MapLevel;
  parentId?: string;
  kind: string;
  description: string;
  x: number;
  y: number;
  current: boolean;
  objective?: "任务" | "猎魂" | "事件";
  confidence: number;
  source: string;
}

export interface MapHierarchyView {
  continentName: string;
  settlementName: string;
  buildingName: string;
  nodes: MapNodeView[];
}

export interface IntelligenceView {
  id: string;
  subjectType: "人物" | "地点" | "势力" | "事件" | "物品";
  subjectId: string;
  title: string;
  detail: string;
  source: string;
  confidence: number;
  acquiredAt: string;
  freshness: "新鲜" | "尚可" | "过期";
  status: "确定" | "推测" | "传闻" | "矛盾";
}

export interface WorldNewsView { id: string; title: string; detail: string; date: string }

export interface WorldEventView {
  id: string;
  title: string;
  kind: string;
  detail: string;
  location: string;
  status: string;
  remaining: string;
}

export interface CanonInfluenceView {
  id: string;
  action: string;
  affects: string;
  strength: string;
  date: string;
}

export interface StoryConsequenceView {
  id: string;
  action: string;
  result: string;
  date: string;
  tone: "普通" | "转折" | "危险" | "收获";
}

export interface ActionReceiptView {
  action: string;
  intent: string;
  summary: string;
  elapsedMinutes: number;
  appliedRuleIds: number[];
  actionIndex: number;
}

export interface StoryArchiveView {
  summary: string;
  openThreads: string[];
  keyChoices: string[];
  recentConsequences: StoryConsequenceView[];
  continuity: Array<{ label: string; detail: string; status: "稳定" | "留意" | "变化" }>;
}

export interface HuntRecommendationView {
  beastId: string;
  name: string;
  estimatedYears: string;
  risk: string;
  fit: string;
  source: string;
}

export interface HuntingView {
  stage: HuntingStage;
  ringIndex: number;
  targetBeastId?: string;
  targetName?: string;
  targetYears?: number;
  locationId?: string;
  recommendations: HuntRecommendationView[];
  preparation: string[];
  trailProgress: string;
  absorptionRisk?: string;
  result?: string;
}

export interface CombatView {
  id: string;
  enemyName: string;
  enemyPower: string;
  round: number;
  playerCondition: ConditionLabel;
  enemyCondition: string;
  distance: string;
  escaped: boolean;
  insight?: number;
  guard?: number;
  allies?: Array<{ name: string; readiness: number; condition: "完好" | "疲惫" | "受伤" }>;
  controlResistance?: number;
  controlStatus?: string;
  lastExchange?: string;
}

export interface KnownFigureView {
  id: string;
  name: string;
  title?: string;
  faction?: string;
  knownPower: string;
  location: string;
  status: string;
  source?: string;
  confidence?: number;
}

export interface RunSettlementView {
  ending: string;
  baseScore: number;
  multiplier: number;
  legacyPoints: number;
  highlights: string[];
  qualified: boolean;
}

export interface RunProgressView {
  lifeGoal: string;
  highestSoulRank: number;
  discoveries: number;
  relationshipsBuilt: number;
  historicalImpact: number;
  completedHunts: number;
  ending?: string;
  settlement?: RunSettlementView;
}

export interface WorldInheritanceView {
  generation: number;
  sourceEra: GameEra;
  targetEra: GameEra;
  ancestorName: string;
  ending: string;
  highestSoulRank: number;
  historicalImpact: number;
  legacyArtifact: string;
  echoes: string[];
}

export interface GameView {
  id: string;
  seed: string;
  era: GameEra;
  status: GameStatus;
  difficulty: Difficulty;
  speed: GameSpeed;
  personality: PersonalitySetup;
  personalitySummary: string[];
  lifeGoal: string;
  rerollIndex: number;
  candidateRerollsUsed: number;
  candidatePaidRerolls: number;
  birthProfileCount: number;
  candidates: CandidatePublic[];
  selectedCandidateId?: string;
  shaping?: CharacterShapingView;
  character?: CharacterPublic;
  narrative: NarrativeEntry[];
  suggestions: string[];
  worldTime?: WorldTimeView;
  relations: RelationView[];
  npcRelations: NpcRelationEvidenceView[];
  reputations: ReputationNetworkView[];
  tasks: TaskView[];
  inventory: string[];
  inventoryLoad: InventoryLoadView;
  professions: ProfessionView[];
  soulSpiritContract?: SoulSpiritContractView;
  battleArmorProject?: BattleArmorProjectView;
  mecha?: MechaProgressView;
  starship?: StarshipProgressView;
  managedFactions: ManagedFactionView[];
  economy: EconomyView;
  location?: string;
  locationId?: string;
  map: MapLocationView[];
  mapHierarchy: MapHierarchyView;
  mapPins: MapPinView[];
  news: WorldNewsView[];
  activeEvents: WorldEventView[];
  canonInfluences: CanonInfluenceView[];
  storyArchive: StoryArchiveView;
  lastActionReceipt?: ActionReceiptView;
  knownFigures: KnownFigureView[];
  intelligence: IntelligenceView[];
  affiliations: AffiliationView[];
  chapter: StoryChapterView;
  chapterObjective?: ChapterObjectiveView;
  hunting?: HuntingView;
  combat?: CombatView;
  runProgress: RunProgressView;
  worldInheritance?: WorldInheritanceView;
  createdAt: string;
  updatedAt: string;
}

export interface MartialSoulCodexEntryView {
  id: string;
  name: string;
  category: string;
  description: string;
  rarity: MartialSoulRarity;
  charges: number;
  completedRuns: number;
  enabled: boolean;
  initialSoulPowers: number[];
  growthRoutes: string[];
}

export interface SaveSummary {
  id: string;
  characterName: string;
  status: GameStatus;
  location: string;
  soulRank?: number;
  difficulty?: Difficulty;
  updatedAt: string;
}

export interface CheckpointSummary {
  id: number;
  label: string;
  actionIndex: number;
  createdAt: string;
}

export interface DeepSeekSettingsView { hasKey: boolean; baseUrl: string; model: string; novelEngineEnabled: boolean }

export interface MetaProgressionView {
  legacyPoints: number;
  completedRuns: number;
  discoveredMartialSouls: number;
  discoveredOrigins: number;
  unlockedOrigins: string[];
  unlockedMartialSouls: string[];
  unlockedTraits: string[];
  unlockedHeirlooms: string[];
  codexEntries: string[];
  weightPreferences: { origin: string; martialSoul: string; gift: string };
  purchasedUpgrades: Record<string, number>;
  equippedHeirloom?: string;
  martialSoulCodex: MartialSoulCodexEntryView[];
  equippedMartialSoulId?: string;
  martialSoulDrawTickets: number;
  martialSoulDrawPity: number;
  difficultyBudgets: Record<Difficulty, number>;
  difficultyMultipliers: Record<Difficulty, number>;
}

export interface WorldCatalogStatsView {
  birthProfiles: number;
  martialSouls: number;
  characters: number;
  powerSnapshots: number;
  factions: number;
  locations: number;
  events: number;
  soulBeasts: number;
  narrativeRules: number;
}
