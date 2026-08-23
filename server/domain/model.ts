import type { CandidatePublic, CharacterPublic, ConditionLabel, GameView, PersonalitySetup } from "../../shared/game.js";

export interface MartialSoulTemplate {
  id: string;
  name: string;
  category: string;
  description: string;
  rarity: number;
  soulPowerRange: [number, number];
  omens: string[];
}

export interface HiddenCandidate {
  public: CandidatePublic;
  martialSoul: MartialSoulTemplate;
  innateSoulPower: number;
  hiddenGift?: string;
  physique: string;
  spirit: string;
  perception: string;
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
}

export interface HiddenWorldState {
  npcs: Record<string, WorldNpcState>;
  firedCanonEvents: string[];
  suppressedCanonEvents: string[];
  deviation: number;
  discoveredLocations: string[];
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
}

export interface StoredGame {
  schemaVersion: number;
  view: GameView;
  hiddenCandidates: HiddenCandidate[];
  personalityProfile: PersonalityProfile;
  actionIndex: number;
  world: HiddenWorldState;
}

export interface ActionResolution {
  intent: string;
  minutes: number;
  ruleSummary: string;
  fallbackNarrative: string;
  suggestions: string[];
  systemMessages?: string[];
  conditionAfter?: ConditionLabel;
}

export interface CreateGameInput {
  gender: "男" | "女";
  difficulty: GameView["difficulty"];
  personality: PersonalitySetup;
  lifeGoal?: string;
  seed?: string;
}

export type RevealedCharacter = CharacterPublic;
