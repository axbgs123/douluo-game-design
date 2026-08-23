import { useEffect, useState } from "react";
import { DIFFICULTIES, type MetaProgressionView } from "../../shared/game";
import { getMetaProgression } from "../api";

interface MetaProgressionPanelProps {
  open: boolean;
  onClose: () => void;
}

function UnlockList({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return <article className="meta-unlock-card">
    <h3>{title}</h3>
    {items.length > 0
      ? <div className="meta-tags">{items.map((item) => <span key={item}>{item}</span>)}</div>
      : <p>{empty}</p>}
  </article>;
}

export function MetaProgressionPanel({ open, onClose }: MetaProgressionPanelProps) {
  const [meta, setMeta] = useState<MetaProgressionView | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    void getMetaProgression().then(setMeta).catch((caught: Error) => setError(caught.message));
  }, [open]);

  if (!open) return null;
  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="meta-modal" role="dialog" aria-modal="true" aria-label="局外成长" onMouseDown={(event) => event.stopPropagation()}>
      <button type="button" className="modal-close" onClick={onClose}>×</button>
      <header className="meta-header">
        <div><p className="eyebrow">跨存档</p><h2>局外成长</h2></div>
      </header>

      {error && <p className="settings-message">{error}</p>}
      {!meta && !error && <p className="meta-loading">正在读取本地传承记录……</p>}
      {meta && <>
        <section className="meta-stats">
          <article><span>传承点</span><strong>{meta.legacyPoints}</strong></article>
          <article><span>完成周目</span><strong>{meta.completedRuns}</strong></article>
          <article><span>武魂图鉴</span><strong>{meta.discoveredMartialSouls}</strong></article>
          <article><span>出身图鉴</span><strong>{meta.discoveredOrigins}</strong></article>
        </section>

        <section className="meta-section">
          <div className="meta-section-heading"><h3>传承预算</h3></div>
          <div className="budget-grid">
            {DIFFICULTIES.map((difficulty) => <article key={difficulty}>
              <strong>{difficulty}</strong>
              <span>{meta.difficultyBudgets[difficulty]} 预算</span>
              <small>结算 ×{meta.difficultyMultipliers[difficulty].toFixed(2)}</small>
            </article>)}
          </div>
        </section>

        <section className="meta-section">
          <div className="meta-section-heading"><h3>已解锁</h3></div>
          <div className="meta-unlocks">
            <UnlockList title="出身池" items={meta.unlockedOrigins} empty="还没有额外出身" />
            <UnlockList title="特殊天赋" items={meta.unlockedTraits} empty="在剧情中发现后解锁" />
            <UnlockList title="可携带遗物" items={meta.unlockedHeirlooms} empty="完成特定结局后解锁" />
          </div>
        </section>

        <div className="meta-note"><span>结局结算和装备功能尚未完成。</span></div>
      </>}
    </section>
  </div>;
}
