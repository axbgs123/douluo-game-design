export interface CanonEventDependencyRule {
  requiredAll?: string[];
  requiredAny?: string[];
  catalysts?: string[];
  siblings?: string[];
  observationRoute?: string[];
}

const hard = (...requiredAll: string[]): CanonEventDependencyRule => ({ requiredAll });

export const CANON_EVENT_DEPENDENCIES: Record<string, CanonEventDependencyRule> = {
  "clear-sky-retreat": hard("ayin-sacrifice"),
  "notting-arrival": hard("tang-awakening"),
  "xiao-wu-notting-meeting": hard("notting-arrival"),
  "notting-master-disciple": hard("notting-arrival"),
  "first-ring-tang-san": hard("notting-master-disciple"),
  "notting-years": hard("first-ring-tang-san"),
  "shrek-enrollment": { requiredAll: ["notting-years"], catalysts: ["dai-mubai-arrives-soto"] },
  "zhao-wuji-test": hard("shrek-enrollment"),
  "star-dou-first-hunt": hard("zhao-wuji-test"),
  "titan-ape-appearance": { observationRoute: ["star-dou-first-hunt"] },
  "human-spider-absorption": hard("star-dou-first-hunt"),
  "suotuo-spirit-arena": hard("shrek-enrollment"),
  "imperial-team-battle": hard("suotuo-spirit-arena"),
  "shrek-to-heaven-royal": hard("imperial-team-battle"),
  "shrek-relocation": hard("shrek-to-heaven-royal"),
  "blue-tyrant-merge": hard("shrek-to-heaven-royal"),
  "golden-triangle-reunion": hard("blue-tyrant-merge"),
  "seven-devils-herbs": hard("ice-fire-herbs"),
  "academy-tournament": { catalysts: ["shrek-relocation"] },
  "five-elements-clash": hard("academy-tournament"),
  "tournament-finals": hard("academy-tournament"),
  "pope-palace-conflict": hard("tournament-finals"),
  "five-year-training": { catalysts: ["pope-palace-conflict"] },
  "tang-san-awakens-emperor": hard("five-year-training"),
  "slaughter-city-entry": hard("tang-san-awakens-emperor"),
  "slaughter-domain": hard("slaughter-city-entry"),
  "moon-pavilion-training": hard("slaughter-domain"),
  "five-year-reunion": hard("moon-pavilion-training"),
  "clear-sky-return": hard("tang-san-awakens-emperor"),
  "xiao-wu-sacrifice": hard("five-year-reunion"),
  "tang-sect-preparation": hard("xiao-wu-sacrifice"),
  "single-clans-gather": hard("tang-sect-preparation"),
  "tang-sect-founded": hard("single-clans-gather"),
  "tang-sect-four-halls": hard("tang-sect-founded"),
  "gengxin-forging": { catalysts: ["tang-sect-founded"] },
  "sea-voyage-pirates": { observationRoute: ["sea-voyage"] },
  "sea-god-trials": hard("sea-voyage"),
  "sea-pillar-tests": hard("sea-god-trials"),
  "evil-orca-war": { catalysts: ["sea-pillar-tests"] },
  "deep-sea-whale-battle": { catalysts: ["evil-orca-war"] },
  "bo-saixi-sacrifice": hard("deep-sea-whale-battle"),
  "seven-treasure-attack": { requiredAll: ["soul-hunt-operation"], siblings: ["blue-lightning-destruction"] },
  "blue-lightning-destruction": { requiredAll: ["soul-hunt-operation"], siblings: ["seven-treasure-attack"] },
  "continental-war": { catalysts: ["heaven-dou-coup", "soul-hunt-operation"] },
  "twin-empires-war": hard("continental-war"),
  "jialing-pass": hard("twin-empires-war"),

  "d2-tang-sect-meeting": hard("d2-huo-leaves-duke-estate"),
  "d2-shrek-enrollment": hard("d2-tang-sect-meeting"),
  "d2-freshman-assessment": hard("d2-shrek-enrollment"),
  "d2-soul-tournament": hard("d2-freshman-assessment"),
  "d2-soul-spirit-born": hard("d2-snow-empress-embryo"),
  "d2-mingdu-tournament": { observationRoute: ["d2-body-sect-raid"] },
  "d2-beibei-tangya-rescue": { catalysts: ["d2-mingdu-tournament"] },
  "d2-sun-moon-war": { catalysts: ["d2-mingdu-tournament"] },
  "d2-shrek-defense": hard("d2-sun-moon-war"),
  "d2-undead-demesne": { catalysts: ["d2-shrek-defense"] },
  "d2-spirit-pagoda-founded": { requiredAll: ["d2-soul-spirit-born"], catalysts: ["d2-beast-tide"] },
  "d2-final-holy-spirit": { catalysts: ["d2-beibei-tangya-rescue"] },
  "d2-god-realm-ascent": { catalysts: ["d2-final-holy-spirit"] },

  "d3-east-sea-enrollment": hard("d3-wulin-awakening"),
  "d3-zero-class": hard("d3-east-sea-enrollment"),
  "d3-shrek-entry": hard("d3-zero-class"),
  "d3-student-competition": hard("d3-shrek-entry"),
  "d3-star-luo-exchange": { catalysts: ["d3-student-competition"] },
  "d3-dragon-valley": hard("d3-star-luo-exchange"),
  "d3-shrek-destruction": { requiredAll: ["d3-godkiller-coordinated-strike"], siblings: ["d3-tang-sect-strike"] },
  "d3-tang-sect-strike": { requiredAll: ["d3-godkiller-coordinated-strike"], siblings: ["d3-shrek-destruction"] },
  "d3-blood-god": { catalysts: ["d3-shrek-destruction"] },
  "d3-abyss-war": hard("d3-blood-god"),
  "d3-five-gods": { catalysts: ["d3-abyss-war"] },
  "d3-spirit-pagoda-conflict": { siblings: ["d3-federation-coup"] },
  "d3-shrek-rebuild": hard("d3-shrek-destruction"),
  "d3-final-abyss": { requiredAll: ["d3-abyss-war"], catalysts: ["d3-shrek-rebuild"] },
  "d3-wulin-guye-sleep": hard("d3-final-abyss"),

  "d4-family-moves-tianluo": hard("d4-xuanyu-found"),
  "d4-xuanyu-awakening": { observationRoute: ["d4-family-moves-tianluo"] },
  "d4-high-energy-class": hard("d4-xuanyu-awakening"),
  "d4-shrek-exam": { catalysts: ["d4-high-energy-class"] },
  "d4-forest-star-trial": hard("d4-shrek-exam"),
  "d4-thirty-three-wing": hard("d4-shrek-exam"),
  "d4-elf-star": { catalysts: ["d4-forest-star-trial"] },
  "d4-fleet-entry": { catalysts: ["d4-thirty-three-wing", "d4-elf-star"] },
  "d4-dragon-horse-infiltration": hard("d4-fleet-entry"),
  "d4-rising-dragon": hard("d4-dragon-horse-infiltration"),
  "d4-heavenly-dragon-test": hard("d4-dragon-horse-infiltration"),
  "d4-dragon-horse-federation-founded": { catalysts: ["d4-rising-dragon"] },
  "d4-future-rookies": { catalysts: ["d4-rising-dragon"] },
  "d4-crimson-ultimatum": hard("d4-dragon-horse-federation-founded"),
  "d4-crimson-domain": hard("d4-crimson-ultimatum"),
  "d4-final-space-war": hard("d4-crimson-domain"),
  "d4-dragon-god-return": hard("d4-final-space-war"),
};

export function canonEventHardPrerequisites(eventId: string): string[] {
  const rule = CANON_EVENT_DEPENDENCIES[eventId];
  return [...(rule?.requiredAll ?? []), ...(rule?.requiredAny ?? [])];
}

export function canonEventDependencyRule(eventId: string): CanonEventDependencyRule | undefined {
  return CANON_EVENT_DEPENDENCIES[eventId];
}

export function canonEventAllReferences(eventId: string): string[] {
  const rule = CANON_EVENT_DEPENDENCIES[eventId];
  return [...new Set([...(rule?.requiredAll ?? []), ...(rule?.requiredAny ?? []), ...(rule?.catalysts ?? []), ...(rule?.siblings ?? []), ...(rule?.observationRoute ?? [])])];
}
