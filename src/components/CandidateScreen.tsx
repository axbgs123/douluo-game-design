import { useEffect, useState } from "react";
import type { CandidatePublic } from "../../shared/game";

interface CandidateScreenProps {
  candidates: CandidatePublic[];
  rerollIndex: number;
  busy: boolean;
  onReroll: () => Promise<void>;
  onSelect: (id: string, customName?: string) => Promise<void>;
}

export function CandidateScreen({
  candidates,
  rerollIndex,
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
        <p>每组三张至少会出现一名稀有或传奇身份。武魂仍留到觉醒时揭晓。</p>
      </header>

      <section className="candidate-grid">
        {candidates.map((candidate, index) => (
          <article className={`candidate-card rarity-${candidate.rarity}`} key={candidate.id}>
            <div className="candidate-index">{String(index + 1).padStart(2, "0")}</div>
            <div className="candidate-meta"><span>{candidate.gender}</span><span>{candidate.eraRelation}</span><strong>{candidate.rarity} · {candidate.route}</strong></div>
            <label className="candidate-name-field"><span>姓名</span><input value={names[candidate.id] ?? candidate.name} maxLength={12} onChange={(event) => setNames((current) => ({ ...current, [candidate.id]: event.target.value }))} /></label>
            <p className="candidate-origin">{candidate.originName}</p>
            <p className="candidate-summary">{candidate.originSummary}</p>
            <dl className="origin-facts">{candidate.originFacts.map((fact) => <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}</dl>
            <section className="identity-knowledge"><small>{candidate.selfKnowledge}</small><p>{candidate.knownBackground}</p></section>
            {candidate.fixedTraits.length > 0 && <div className="fixed-trait-line"><span>身份烙印</span>{candidate.fixedTraits.map((trait) => <b key={trait}>{trait}</b>)}</div>}
            <div className="location-line"><span>出生地</span>{candidate.location}</div>
            <div className="omens">
              <h3>先天征兆</h3>
              {candidate.omens.map((omen) => <p key={omen}>{omen}</p>)}
            </div>
            <button type="button" className="select-button" disabled={busy || !(names[candidate.id] ?? "").trim()} onClick={() => void onSelect(candidate.id, names[candidate.id])}>
              选定并塑造性格
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
