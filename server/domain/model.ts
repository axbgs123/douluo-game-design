import type { CandidatePublic, CharacterPublic, ConditionLabel, GameView, PersonalitySetup } from "../../shared/game.js";

export interface MartialSoulTemplate {
  id: string;
  name: string;
  category: string;
  description: string;
  rarity: number;
  soulPowerRange: [number, number];
  omens: string[];
  metaRarity?: import("../../shared/game.js").MartialSoulRarity;
}

export interface HiddenCandidate {
  public: CandidatePublic;
  originId: string;
  roleTags: string[];
  martialSoul: MartialSoulTemplate;
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
  autonomyLog: Array<{ year: number; day: number; action: string; reason: string }>;
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
  npcRelations: NpcRelationState[];
  dynamicEvents: DynamicWorldEvent[];
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
    action: string;
    intent: string;
    result: string;
    year: number;
    day: number;
  }>;
}

export interface StoredGame {
  schemaVersion: number;
  view: GameView;
  hiddenCandidates: HiddenCandidate[];
  personalityProfile: PersonalityProfile;
  actionIndex: number;
  world: HiddenWorldState;
  storyMemory: StoryMemory;
  lastCommittedAction?: {
    playerInput: string;
    ruleAction: string;
    resolution: ActionResolution;
    narrativeEntryId: string;
    committedAt: string;
  };
  legacy: {
    upgrades: Record<string, number>;
    equippedHeirloom?: string;
    plannedMartialSoulId?: string;
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
}

export interface CreateGameInput {
  gender: "男" | "女";
  difficulty: GameView["difficulty"];
  personality?: PersonalitySetup;
  lifeGoal?: string;
  seed?: string;
}

export type RevealedCharacter = CharacterPublic;
