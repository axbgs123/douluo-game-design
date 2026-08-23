import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export type DouluoEra = 1 | 2 | 3 | 4;
export type FanfictionRuleKind = "硬规则" | "场景规则" | "文风规则" | "审稿规则";

export interface FanfictionRule {
  era: DouluoEra;
  id: number;
  section: number;
  sectionName: string;
  tag: string;
  text: string;
  kind: FanfictionRuleKind;
  conditional: boolean;
}

const ERA_FILES: Record<DouluoEra, string> = {
  1: "douluo1-fanfiction-1000-checklist.md",
  2: "douluo2-fanfiction-1000-checklist.md",
  3: "douluo3-fanfiction-1000-checklist.md",
  4: "douluo4-fanfiction-1000-checklist.md",
};

const CONDITIONAL_SECTIONS = new Set([
  4, 6, 22, 24, 32, 33, 34, 35, 36, 37, 39, 42, 44, 45, 46, 47, 48, 49, 50,
  54, 55, 56, 61, 62, 63, 64, 65, 67, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80,
  82, 83, 84, 85, 86, 87, 88, 89, 90,
]);

const HARD_SECTIONS = new Set([2, 5, 11, 12, 14, 15, 17, 18, 21, 25, 26, 27, 30, 40, 41, 43, 57, 69, 70, 91, 92, 93, 94, 98, 100]);
const STYLE_SECTIONS = new Set([6, 7, 8, 9, 10, 53, 60, 81, 89, 90, 95, 96, 97, 99]);

function classify(section: number): FanfictionRuleKind {
  if (section === 100) return "审稿规则";
  if (HARD_SECTIONS.has(section)) return "硬规则";
  if (STYLE_SECTIONS.has(section)) return "文风规则";
  return "场景规则";
}

function parseRulebook(era: DouluoEra): FanfictionRule[] {
  const path = resolve(process.cwd(), "docs", ERA_FILES[era]);
  if (!existsSync(path)) return [];
  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  const rules: FanfictionRule[] = [];
  let section = 0;
  let sectionName = "未分类";
  for (const line of lines) {
    const heading = line.match(/^###\s+(\d+)\.\s+(.+?)（/);
    if (heading) {
      section = Number(heading[1]);
      sectionName = heading[2].trim();
      continue;
    }
    const match = line.match(/^(\d+)\.\s+【([^】]+)】(.+)$/);
    if (!match || !section) continue;
    const tag = match[2].trim();
    rules.push({
      era,
      id: Number(match[1]),
      section,
      sectionName,
      tag,
      text: match[3].trim(),
      kind: classify(section),
      conditional: CONDITIONAL_SECTIONS.has(section) || tag.includes("·"),
    });
  }
  return rules;
}

export const FANFICTION_RULES: FanfictionRule[] = ([1, 2, 3, 4] as DouluoEra[]).flatMap(parseRulebook);

export function rulesForEra(era: DouluoEra): FanfictionRule[] {
  return FANFICTION_RULES.filter((rule) => rule.era === era);
}

export function rulesForSections(era: DouluoEra, sections: Iterable<number>, limit = 36): FanfictionRule[] {
  const wanted = new Set(sections);
  return rulesForEra(era)
    .filter((rule) => wanted.has(rule.section))
    .sort((left, right) => Number(left.conditional) - Number(right.conditional) || left.id - right.id)
    .slice(0, limit);
}

export function rulebookStats(): Record<DouluoEra, number> {
  return { 1: rulesForEra(1).length, 2: rulesForEra(2).length, 3: rulesForEra(3).length, 4: rulesForEra(4).length };
}
