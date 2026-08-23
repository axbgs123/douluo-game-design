import type { CandidatePublic } from "../../shared/game";

interface CandidateScreenProps {
  candidates: CandidatePublic[];
  rerollIndex: number;
  personalitySummary: string[];
  busy: boolean;
  onReroll: () => Promise<void>;
  onSelect: (id: string) => Promise<void>;
}

export function CandidateScreen({
  candidates,
  rerollIndex,
  personalitySummary,
  busy,
  onReroll,
  onSelect,
}: CandidateScreenProps) {
  return (
    <main className="candidate-page">
      <header className="candidate-header">
        <p className="eyebrow">命运候选 · 第 {rerollIndex + 1} 轮</p>
        <h1>三段人生，只有征兆</h1>
        <p>武魂、天赋、金手指与风险仍然隐藏。选择以后，你要亲自走进觉醒阵。</p>
        <div className="trait-line">初始性格：{personalitySummary.join(" · ")}</div>
      </header>

      <section className="candidate-grid">
        {candidates.map((candidate, index) => (
          <article className="candidate-card" key={candidate.id}>
            <div className="candidate-index">{String(index + 1).padStart(2, "0")}</div>
            <div className="candidate-meta"><span>{candidate.gender}</span><span>{candidate.eraRelation}</span></div>
            <h2>{candidate.name}</h2>
            <p className="candidate-origin">{candidate.originName}</p>
            <p className="candidate-summary">{candidate.originSummary}</p>
            <div className="location-line"><span>出生地</span>{candidate.location}</div>
            <div className="omens">
              <h3>先天征兆</h3>
              {candidate.omens.map((omen) => <p key={omen}>{omen}</p>)}
            </div>
            <button type="button" className="select-button" disabled={busy} onClick={() => void onSelect(candidate.id)}>
              选择这段人生
            </button>
          </article>
        ))}
      </section>

      <div className="candidate-actions">
        <button type="button" className="ghost-button" disabled={busy} onClick={() => void onReroll()}>
          舍弃三人，重新抽取
        </button>
        <p>无限重抽不会提高隐藏强度，只会重写可能性。</p>
      </div>
    </main>
  );
}
