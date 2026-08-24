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
  openingStyle?: string;
  giftHint?: string;
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
  customDesign?: {
    grade: "紫级" | "黑级";
    progress: number;
    sessions: number;
    specialistId?: string;
    specialistName: string;
    martialSoulName: string;
  };
  model?: string;
  condition?: "完好" | "受损" | "大修";
  energy?: number;
  ownerId?: string;
  ownerName?: string;
}

export interface SpiritAscensionView {
  status: "已预约" | "探索中" | "待结算" | "已结算";
  tier: "初级" | "中级" | "高级";
  riskMode?: "虚拟保护" | "高拟真保护" | "真实核心层";
  mode?: "常规" | "暴动期";
  companionNames?: string[];
  uprisingEntryYears?: number[];
  entryFee: number;
  encounters: number;
  virtualDefeats: number;
  spiritualEnergy: number;
  pendingSpiritualEnergy?: number;
  neuralShock: number;
  totalEntries: number;
  bestYearsGained: number;
  exitReason?: "主动求救" | "脑波保护强制退出" | "核心层真实死亡";
  lastYearsGained?: number;
}

export interface SpiritAscensionMembershipView {
  registeredBattleArmorTier: 1 | 2 | 3 | 4;
  benefitYears: number[];
  taskPoints?: number;
  authorizationEvidence?: string[];
}

export interface StarshipProgressView {
  license: "无" | "见习指挥" | "三级指挥" | "二级指挥" | "一级指挥";
  simulatorProgress: number;
  simulatorSessions: number;
  trainingStartedAge?: number;
  loggedFlightHours?: number;
  crew: Array<{ relationId: string; name: string; role: "驾驶员" | "导航员" | "轮机师" | "战术员" | "医疗员"; readiness: number }>;
  shipName?: string;
  shipClass?: "民用穿梭艇" | "陨星级侦察舰" | "流星级攻击舰" | "饕餮级运输舰" | "辉煌级补给舰" | "龙王级护卫舰" | "战神级战列舰" | "行星级母舰";
  hull?: number;
  fuel?: number;
  supplies?: number;
  missionsCompleted: number;
  crewDrills?: number;
  crewCoordination?: number;
  crewEvidence?: Array<{ date: string; drill: string; roles: string[]; result: string }>;
  fleetOnboarding?: {
    status: "未述职" | "培训中" | "待分配" | "已分配";
    reportedAt?: string;
    trainingDays: number;
    trainingEvidence: Array<{ date: string; module: "航线与指挥" | "损管与动力" | "作战与登陆" | "军纪与保密"; result: string }>;
    assignedDepartment?: "舰队参谋部" | "龙王级护卫舰作战部";
    assignedPost?: string;
    assignmentEvidence?: string[];
  };
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
  publiclyKnownMartialSoulIndices?: number[];
  soulRingSets: SoulRingView[][];
  soulSpirits?: SoulSpiritView[];
  battleArmors?: BattleArmorView[];
  abilityDescriptors: { physique: string; spirit: string; perception: string };
  personalityTraits: string[];
  revealedGift?: string;
  specialSystem?: SpecialSystemView;
}

export interface ActiveHeirloomView {
  id: string;
  name: string;
  rarity: Extract<MartialSoulRarity, "紫色" | "金色" | "红色">;
  description: string;
  effect: string;
  trigger: string;
  status: "等待触发" | "本局已触发";
  maxUses: number;
  remainingUses: number;
  actionCommand?: string;
}

export interface SpecialSystemView {
  name: string;
  stage: string;
  progress: string;
  abilities: string[];
  resourceHint: string;
  actions?: Array<{ label: string; command: string }>;
}

export interface AffiliationView {
  id: string;
  name: string;
  role: string;
  reputation: string;
  joinedAt: string;
  contribution?: number;
  completedAssignments?: number;
  rankEvidence?: string[];
  militaryRank?: MilitaryRank;
  militaryMerit?: number;
  flightHours?: number;
  institutionFactions?: InstitutionFactionView[];
  institutionPoliticalHistory?: string[];
}

export type MilitaryRank = "列兵" | "下士" | "中士" | "少尉" | "中尉" | "上尉" | "少校" | "中校" | "上校" | "大校" | "少将";

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
  age?: number;
  lifeStage?: "相识" | "朋友" | "挚友" | "伴侣" | "配偶";
  consentEvidence?: string[];
  partnerDiscussedAtOrdinal?: number;
  marriageDiscussedAtOrdinal?: number;
}

export interface FamilyView {
  partner?: {
    relationId?: string;
    name: string;
    status: "伴侣" | "配偶";
    establishedAt: string;
    establishedAtOrdinal: number;
    consentEvidence: string[];
  };
  children: Array<{
    id: string;
    name: string;
    joinedAt: string;
    route: "出生" | "收养";
    parentNames: [string, string];
    evidence: string[];
  }>;
  householdNotes: string[];
  familyPlan?: {
    agreedAt: string;
    agreedAtOrdinal: number;
    preparedAtOrdinal?: number;
    route: "出生或收养";
    evidence: string[];
  };
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
  certifications?: string[];
  portfolio?: string[];
  commissionsCompleted?: number;
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
  transactions: EconomyTransactionView[];
  marketReports: MarketReportView[];
}

export interface MarketReportView {
  locationId: string;
  location: string;
  category: "药材" | "金属" | "粮食" | "魂导材料" | "日用品";
  supply: number;
  demand: number;
  priceIndex: number;
  reason: string;
  updatedAt: string;
}

export interface EconomyTransactionView {
  id: string;
  date: string;
  kind: "收入" | "支出" | "存款" | "取款" | "借贷" | "还款" | "投资";
  amount: number;
  balance: number;
  counterparty: string;
  note: string;
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
  kind: "承诺" | "线索" | "计划" | "修炼需求" | "悬赏" | "运输合同";
  detail: string;
  status?: "进行中" | "完成" | "失败";
  deadline?: string;
  destinationId?: string;
  ownerId?: string;
  createdActionIndex?: number;
  progressEvidence?: string[];
  logistics?: LogisticsContractView;
  institutionAssignment?: InstitutionAssignmentView;
}

export interface InstitutionAssignmentView {
  route: string;
  specialization?: "外勤" | "情报" | "支援" | "专业";
  risk?: string;
  stageIndex: number;
  stageStartedActionIndex: number;
  stages: Array<{ title: string; detail: string; evidenceKeywords: string[] }>;
  reviewer?: InstitutionReviewerView;
  counterReviewer?: InstitutionReviewerView;
  factions?: InstitutionFactionView[];
  conflictStatus?: "未触发" | "待复核" | "已协调" | "保留分歧";
  playerAlignment?: string;
  resolutionEvidence?: string[];
}

export interface InstitutionReviewerView {
  name: string;
  role: string;
  stance: string;
  factionName?: string;
  trust: number;
  objections: number;
  meetings: number;
  evidence: string[];
}

export interface InstitutionFactionView {
  name: string;
  priority: string;
  influence: number;
  playerTrust: number;
  evidence: string[];
}

export interface LogisticsContractView {
  category: MarketReportView["category"];
  originId: string;
  originName: string;
  destinationId: string;
  destinationName: string;
  cargoLabel: string;
  purchaseCost: number;
  payout: number;
  cargoIntegrity: number;
  deadlineOrdinal: number;
  mode: "陆路托运" | "星际货运";
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
  allies?: Array<{ name: string; role?: CompanionRole; readiness: number; condition: "完好" | "疲惫" | "受伤" }>;
  controlResistance?: number;
  controlStatus?: string;
  comboPreparation?: {
    name: string;
    roles: CompanionRole[];
    allyNames: string[];
    preparedAtRound: number;
    expiresAfterRound: number;
    mastery?: number;
    branch?: string;
  };
  comboCooldownUntilRound?: number;
  comboHistory?: string[];
  lastExchange?: string;
}

export type CompanionRole = "强攻" | "防护" | "控制" | "治疗" | "侦察" | "协同";

export interface ComboTrainingView {
  id: string;
  name: string;
  roles: CompanionRole[];
  companionNames: string[];
  sessions: number;
  failures: number;
  mastery: number;
  branch?: string;
  evidence: Array<{ date: string; result: string }>;
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
  lineage: LineageRecordView[];
  branches: LineageBranchView[];
  chronology: InterEraHistoryEventView[];
  institutions: InheritedInstitutionView[];
}

export interface InterEraHistoryEventView {
  id: string;
  year: number;
  kind: "终章封存" | "档案转交" | "制度衰减" | "当代再发现";
  title: string;
  detail: string;
  source: string;
  confidence: number;
  verification: "传闻" | "部分核验" | "已核验";
  evidence: string[];
}

export interface LineageRecordView {
  generation: number;
  era: GameEra;
  name: string;
  ending: string;
  highestSoulRank: number;
  historicalImpact: number;
  verification: "传闻" | "部分核验" | "已核验";
  evidence: string[];
  family?: { partnerName?: string; childCount: number; evidence: string[] };
}

export interface LineageBranchView {
  id: string;
  sourceGeneration: number;
  sourceEra: GameEra;
  name: string;
  route: "出生" | "收养";
  parentNames: string[];
  verification: "传闻" | "部分核验" | "已核验";
  evidence: string[];
}

export interface InheritedInstitutionView {
  id: string;
  name: string;
  sourceEra: GameEra;
  formerRole: string;
  state: "有据可查" | "碎片传承" | "仅存传闻" | "已知断绝";
  verification: "传闻" | "部分核验" | "已核验";
  evidence: string[];
  currentEvidence?: string[];
  claimStatus?: "未主张" | "待审理" | "有限承认" | "已驳回";
  claimEvidence?: string[];
  recognizedRight?: string;
  reestablishedBusiness?: string;
}

export interface MediaOutletReputationView {
  name: string;
  stance: string;
  trustScore: number;
  publications: number;
  corrections: number;
  linkedReports: number;
  status: "待观察" | "信誉稳定" | "受到质疑" | "高度可信";
  evidence: string[];
  responsibleEditor?: {
    name: string;
    role: "责任编辑" | "值班核验编辑";
    sourceTrust: number;
    handledReports: number;
    responsibility: "在岗核验" | "已签发更正" | "待复核";
    evidence: string[];
    playerTrust?: number;
    interactions?: number;
    lastContactAt?: string;
    requestedEvidenceAtActionIndex?: number;
    activeRumorId?: string;
  };
}

export interface MediaCompetitionView {
  id: string;
  outlets: [string, string];
  scores: Record<string, number>;
  sharedTopics: number;
  leader?: string;
  status: "并列观察" | "首发竞争" | "核验拉锯" | "更正问责";
  playerChoice?: string;
  evidence: string[];
  topics: MediaAgendaView[];
}

export interface MediaAgendaView {
  id: string;
  title: string;
  sourceRumorId: string;
  status: "候选议题" | "优先排期" | "延后排期" | "共同核验";
  priorityScores: Record<string, number>;
  evidence: string[];
}

export interface MediaAllianceView {
  id: string;
  name: string;
  competitionId: string;
  outlets: string[];
  status: "提议中" | "试运行" | "资源冲突" | "暂停合作" | "修复审核" | "受限恢复" | "成员不足";
  sharedVerificationPool: number;
  priorityAgendaId?: string;
  delayedAgendaIds: string[];
  agendas: MediaAgendaView[];
  recoveryPlanStartedAtActionIndex?: number;
  suspensionInteractionCounts?: Record<string, number>;
  suspendedOutletNames?: string[];
  probationVerificationsRemaining?: number;
  recoveryEvidence?: string[];
  resourceDepletedAtActionIndex?: number;
  resourceDepletionInteractionCounts?: Record<string, number>;
  resourceRefillCount?: number;
  minimumMembers?: number;
  statusBeforeMemberShortage?: "试运行" | "资源冲突";
  departures?: Array<{
    outlet: string;
    editorName: string;
    status: "待退出复核" | "已退出";
    requestedAtActionIndex: number;
    approvedAtActionIndex?: number;
    interactionCounts: Record<string, number>;
    evidence: string[];
  }>;
  membershipApplications?: Array<{
    outlet: string;
    stance: string;
    editorName: string;
    status: "候选核验" | "替补核验" | "已加入" | "已拒绝";
    kind?: "扩员" | "替补";
    replacesOutlet?: string;
    registeredAtActionIndex: number;
    evidence: string[];
  }>;
  evidence: string[];
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
  family: FamilyView;
  npcRelations: NpcRelationEvidenceView[];
  reputations: ReputationNetworkView[];
  tasks: TaskView[];
  inventory: string[];
  activeHeirloom?: ActiveHeirloomView;
  inventoryLoad: InventoryLoadView;
  professions: ProfessionView[];
  soulSpiritContract?: SoulSpiritContractView;
  battleArmorProject?: BattleArmorProjectView;
  mecha?: MechaProgressView;
  spiritAscension?: SpiritAscensionView;
  spiritAscensionMembership?: SpiritAscensionMembershipView;
  starship?: StarshipProgressView;
  managedFactions: ManagedFactionView[];
  economy: EconomyView;
  location?: string;
  locationId?: string;
  map: MapLocationView[];
  mapHierarchy: MapHierarchyView;
  mapPins: MapPinView[];
  news: WorldNewsView[];
  mediaOutlets: MediaOutletReputationView[];
  mediaCompetitions: MediaCompetitionView[];
  mediaAlliances: MediaAllianceView[];
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
  comboTrainings: ComboTrainingView[];
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
  unlimited: boolean;
  completedRuns: number;
  enabled: boolean;
  initialSoulPowers: number[];
  growthRoutes: string[];
  favorite?: boolean;
}

export interface MetaSummonHistoryEntryView {
  id: string;
  kind: "martialSoul" | "heirloom";
  name: string;
  rarity: MartialSoulRarity;
  description: string;
  duplicate: boolean;
  drawnAt: string;
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

export interface ModelUsageView {
  calls: number;
  failures: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  totalLatencyMs: number;
  lastCallAt?: string;
}

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
  martialSoulSummonPoolSize: number;
  equippedMartialSoulId?: string;
  martialSoulDrawTickets: number;
  martialSoulDrawPity: number;
  summonGoldPity: number;
  summonRedPity: number;
  summonRainbowPity: number;
  summonHistory: MetaSummonHistoryEntryView[];
  difficultyBudgets: Record<Difficulty, number>;
  difficultyMultipliers: Record<Difficulty, number>;
}

export interface MetaSummonHeirloomView {
  id: string;
  name: string;
  rarity: Extract<MartialSoulRarity, "紫色" | "金色" | "红色">;
  description: string;
  duplicate: boolean;
}

export type MetaSummonResultView =
  | { kind: "martialSoul"; meta: MetaProgressionView; drawn: MartialSoulCodexEntryView; cost: number }
  | { kind: "heirloom"; meta: MetaProgressionView; drawn: MetaSummonHeirloomView; cost: number };

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
