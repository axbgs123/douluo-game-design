export const DIFFICULTIES = ["爽", "简单", "标准", "困难", "地狱"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export type Gender = "男" | "女";
export type GameStatus = "candidate_selection" | "awakening" | "playing" | "ended";

export interface PersonalitySetup {
  keywords: string[];
  answers: Record<string, string>;
}

export interface CandidatePublic {
  id: string;
  name: string;
  gender: Gender;
  eraRelation: string;
  location: string;
  originName: string;
  originSummary: string;
  omens: string[];
}

export interface CharacterPublic extends CandidatePublic {
  martialSoul: {
    name: string;
    category: string;
    description: string;
  };
  innateSoulPower: number;
  soulRank: number;
  abilityDescriptors: {
    physique: string;
    spirit: string;
    perception: string;
  };
  personalityTraits: string[];
}

export interface NarrativeEntry {
  id: string;
  kind: "narration" | "player" | "system";
  text: string;
  createdAt: string;
}

export interface RelationView {
  name: string;
  relation: string;
  impression: string;
}

export interface TaskView {
  title: string;
  kind: "承诺" | "线索" | "计划" | "修炼需求" | "悬赏";
  detail: string;
}

export interface WorldTimeView {
  era: string;
  day: number;
  time: string;
}

export interface GameView {
  id: string;
  seed: string;
  status: GameStatus;
  difficulty: Difficulty;
  speed: "标准" | "高速";
  personality: PersonalitySetup;
  personalitySummary: string[];
  rerollIndex: number;
  candidates: CandidatePublic[];
  selectedCandidateId?: string;
  character?: CharacterPublic;
  narrative: NarrativeEntry[];
  suggestions: string[];
  worldTime?: WorldTimeView;
  relations: RelationView[];
  tasks: TaskView[];
  inventory: string[];
  location?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SaveSummary {
  id: string;
  characterName: string;
  status: GameStatus;
  location: string;
  updatedAt: string;
}

export interface DeepSeekSettingsView {
  hasKey: boolean;
  baseUrl: string;
  model: string;
}
