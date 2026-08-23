import { useEffect, useState } from "react";
import type { CandidatePublic } from "../../shared/game";

interface CandidateScreenProps {
  candidates: CandidatePublic[];
  rerollIndex: number;
  personalitySummary: string[];
  busy: boolean;
  onReroll: () => Promise<void>;
  onSelect: (id: string, customName?: string) => Promise<void>;
}

export function CandidateScreen({
  candidates,
  rerollIndex,
  personalitySummary,
  busy,
  onReroll,
  onSelect,
}: CandidateScreenProps) {
  const [names, setNames] = useState<Record<string, string>>({});
  useEffect(() => setNames(Object.fromEntries(candidates.map((candidate) => [candidate.id, candidate.name]))), [candidates]);
  return (
    <main className="candidate-page">
      <header className="candidate-header">
        <p className="eyebrow">第 {rerollIndex + 1} 次抽取</p>
        <h1>选择角色</h1>
        <div className="trait-line">性格 · {personalitySummary.join(" · ")}</div>
      </header>

      <section className="candidate-grid">
        {candidates.map((candidate, index) => (
          <article className="candidate-card" key={candidate.id}>
            <div className="candidate-index">{String(index + 1).padStart(2, "0")}</div>
            <div className="candidate-meta"><span>{candidate.gender}</span><span>{candidate.eraRelation}</span></div>
            <label className="candidate-name-field"><span>姓名</span><input value={names[candidate.id] ?? candidate.name} maxLength={12} onChange={(event) => setNames((current) => ({ ...current, [candidate.id]: event.target.value }))} /></label>
            <p className="candidate-origin">{candidate.originName}</p>
            <p className="candidate-summary">{candidate.originSummary}</p>
            <dl className="origin-facts">{candidate.originFacts.map((fact) => <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}</dl>
            <div className="location-line"><span>出生地</span>{candidate.location}</div>
            <div className="omens">
              <h3>先天征兆</h3>
              {candidate.omens.map((omen) => <p key={omen}>{omen}</p>)}
            </div>
            <button type="button" className="select-button" disabled={busy || !(names[candidate.id] ?? "").trim()} onClick={() => void onSelect(candidate.id, names[candidate.id])}>
              选择
            </button>
          </article>
        ))}
      </section>

      <div className="candidate-actions">
        <button type="button" className="ghost-button" disabled={busy} onClick={() => void onReroll()}>
          重抽
        </button>
      </div>
    </main>
  );
}
