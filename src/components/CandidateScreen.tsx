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
        <h1>先看家里，再决定跟谁走</h1>
        <p>这三个人都还没觉醒。你现在能知道的只有出身、住处和一些反常的小事。</p>
        <p className="random-note">本地规则负责抽取，DeepSeek 只写选定后的剧情。每次新游戏都会换随机种子，相同种子则能复现结果。</p>
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
          换三个人
        </button>
        <p>可以一直换，稀有结果的概率不会偷偷上涨。</p>
      </div>
    </main>
  );
}
