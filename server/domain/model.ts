import type {
  CandidatePublic,
  CharacterPublic,
  GameView,
  PersonalitySetup,
} from "../../shared/game.js";

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
}

export interface StoredGame {
  view: GameView;
  hiddenCandidates: HiddenCandidate[];
  personalityProfile: PersonalityProfile;
  actionIndex: number;
}

export interface ActionResolution {
  minutes: number;
  ruleSummary: string;
  fallbackNarrative: string;
  suggestions: string[];
}

export interface CreateGameInput {
  gender: "男" | "女";
  difficulty: GameView["difficulty"];
  personality: PersonalitySetup;
  seed?: string;
}

export type RevealedCharacter = CharacterPublic;
