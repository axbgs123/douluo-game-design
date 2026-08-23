export const DIFFICULTIES = ["爽", "简单", "标准", "困难", "地狱"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export type Gender = "男" | "女";
export type CandidateRarity = "平凡" | "优秀" | "稀有" | "传奇" | "神话";
export type GameStatus = "candidate_selection" | "character_shaping" | "awakening" | "playing" | "ended";
export type GameSpeed = "标准" | "高速";
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
  lifeGoalOptions: string[];
  personalityOptions: PersonalityDraftView[];
  fixedTraits: string[];
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

export interface CharacterPublic extends CandidatePublic {
  age: number;
  martialSoul: { name: string; category: string; description: string };
  innateSoulPower: number;
  soulRank: number;
  cultivationProgress: string;
  condition: ConditionLabel;
  fatigue: string;
  coins: number;
  reputation: string;
  injuries: string[];
  soulRings: SoulRingView[];
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
}

export interface TaskView {
  id?: string;
  title: string;
  kind: "承诺" | "线索" | "计划" | "修炼需求" | "悬赏";
  detail: string;
  status?: "进行中" | "完成" | "失败";
  deadline?: string;
  destinationId?: string;
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
}

export interface KnownFigureView {
  id: string;
  name: string;
  title?: string;
  faction?: string;
  knownPower: string;
  location: string;
  status: string;
}

export interface RunSettlementView {
  ending: string;
  baseScore: number;
  multiplier: number;
  legacyPoints: number;
  highlights: string[];
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

export interface GameView {
  id: string;
  seed: string;
  status: GameStatus;
  difficulty: Difficulty;
  speed: GameSpeed;
  personality: PersonalitySetup;
  personalitySummary: string[];
  lifeGoal: string;
  rerollIndex: number;
  birthProfileCount: number;
  candidates: CandidatePublic[];
  selectedCandidateId?: string;
  shaping?: CharacterShapingView;
  character?: CharacterPublic;
  narrative: NarrativeEntry[];
  suggestions: string[];
  worldTime?: WorldTimeView;
  relations: RelationView[];
  tasks: TaskView[];
  inventory: string[];
  location?: string;
  locationId?: string;
  map: MapLocationView[];
  mapPins: MapPinView[];
  news: WorldNewsView[];
  activeEvents: WorldEventView[];
  canonInfluences: CanonInfluenceView[];
  storyArchive: StoryArchiveView;
  knownFigures: KnownFigureView[];
  affiliations: AffiliationView[];
  chapter: StoryChapterView;
  hunting?: HuntingView;
  combat?: CombatView;
  runProgress: RunProgressView;
  createdAt: string;
  updatedAt: string;
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

export interface DeepSeekSettingsView { hasKey: boolean; baseUrl: string; model: string }

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
  difficultyBudgets: Record<Difficulty, number>;
  difficultyMultipliers: Record<Difficulty, number>;
}

export interface WorldCatalogStatsView {
  birthProfiles: number;
  characters: number;
  powerSnapshots: number;
  factions: number;
  locations: number;
  events: number;
  soulBeasts: number;
  narrativeRules: number;
}
