import { useEffect, useState } from "react";
import type { CandidatePublic } from "../../shared/game";
import { WORLD_MAP_POINTS } from "../../shared/world-map";
import { DouluoWorldMap } from "./DouluoWorldMap";

interface CandidateScreenProps {
  candidates: CandidatePublic[];
  birthProfileCount: number;
  rerollIndex: number;
  candidateRerollsUsed: number;
  candidatePaidRerolls: number;
  busy: boolean;
  onReroll: (lockedSlots: number[]) => Promise<void>;
  onSelect: (id: string, customName?: string) => Promise<void>;
}

export function CandidateScreen({
  candidates,
  birthProfileCount,
  rerollIndex,
  candidateRerollsUsed,
  candidatePaidRerolls,
  busy,
  onReroll,
  onSelect,
}: CandidateScreenProps) {
  const [names, setNames] = useState<Record<string, string>>({});
  const [lockedSlots, setLockedSlots] = useState<number[]>([]);
  useEffect(() => setNames(Object.fromEntries(candidates.map((candidate) => [candidate.id, candidate.name]))), [candidates]);
  return (
    <main className="candidate-page">
      <header className="candidate-header">
        <p className="eyebrow">第 {rerollIndex + 1} 次抽取</p>
        <h1>选择角色</h1>
        <p>出生池现有 {birthProfileCount} 份具体档案，来自 {Math.round(birthProfileCount / 36)} 种核心身份。稀有度代表资源、异常性与故事牵连，不是没有代价的强度；武魂仍留到觉醒时揭晓。</p>
      </header>

      <section className="candidate-map-section">
        <div className="candidate-map-heading"><div><span>出生位置</span><h2>三个人此刻住在哪里</h2></div><div className="rarity-legend"><i className="legend-平凡" />平凡<i className="legend-优秀" />优秀<i className="legend-稀有" />稀有<i className="legend-传奇" />传奇<i className="legend-神话" />神话</div></div>
        <DouluoWorldMap
          landmarks={WORLD_MAP_POINTS.filter((point) => !point.hidden || candidates.some((candidate) => candidate.locationId === point.id))}
          markers={candidates.map((candidate, index) => ({
            id: candidate.id,
            label: `${index + 1} · ${candidate.name}`,
            detail: candidate.dwelling.split(" · ").at(-1),
            x: candidate.mapX,
            y: candidate.mapY,
            tone: `candidate-${index + 1}` as "candidate-1" | "candidate-2" | "candidate-3",
            onClick: () => document.getElementById(`candidate-${candidate.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }),
          }))}
        />
        <div className="candidate-house-list">{candidates.map((candidate, index) => <article key={candidate.id}><i>{index + 1}</i><div><strong>{candidate.name}</strong><span>{candidate.dwelling}</span></div></article>)}</div>
      </section>

      <section className="candidate-grid">
        {candidates.map((candidate, index) => (
          <article id={`candidate-${candidate.id}`} className={`candidate-card rarity-${candidate.rarity} ${lockedSlots.includes(index) ? "candidate-locked" : ""}`} key={candidate.id}>
            <div className="candidate-index">{String(index + 1).padStart(2, "0")}</div>
            <button type="button" className={`slot-lock ${lockedSlots.includes(index) ? "active" : ""}`} onClick={() => setLockedSlots((current) => current.includes(index) ? current.filter((slot) => slot !== index) : [...current, index])}>{lockedSlots.includes(index) ? "已锁定" : "锁定"}</button>
            <div className="candidate-meta"><span>{candidate.gender}</span><span>{candidate.eraRelation}</span><strong className="rarity-badge">出身 {candidate.rarity} · {candidate.route}</strong></div>
            <label className="candidate-name-field"><span>姓名</span><input value={names[candidate.id] ?? candidate.name} maxLength={12} onChange={(event) => setNames((current) => ({ ...current, [candidate.id]: event.target.value }))} /></label>
            <p className="candidate-origin">{candidate.originName}</p>
            <p className="candidate-summary">{candidate.originSummary}</p>
            <dl className="origin-facts">{candidate.originFacts.map((fact) => <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}</dl>
            <section className="identity-knowledge"><small>{candidate.selfKnowledge}</small><p>{candidate.knownBackground}</p></section>
            {candidate.fixedTraits.length > 0 && <div className="fixed-trait-line"><span>身份烙印</span>{candidate.fixedTraits.map((trait) => <b key={trait}>{trait}</b>)}</div>}
            <div className="location-line"><span>住处</span>{candidate.dwelling}</div>
            <section className="household-card"><header><span>家庭结构</span><strong>{candidate.household.structure}</strong></header><p>{candidate.household.summary}</p><div>{candidate.household.members.map((member) => <article key={`${member.name}-${member.role}`}><b>{member.name}</b><span>{member.role}</span><small>{member.note}</small></article>)}</div></section>
            <section className="residence-card"><header><span>住处层级</span><strong>{candidate.residence.building}</strong></header><ol><li>{candidate.residence.region}</li><li>{candidate.residence.district}</li><li>{candidate.residence.building}</li><li>{candidate.residence.room}</li></ol><small>{candidate.residence.security}</small><div className="mini-floor-plan"><i>入口</i><i>堂屋</i><i className="current-room">{candidate.residence.room}</i><i>储物</i></div></section>
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
        <button type="button" className="ghost-button" disabled={busy || lockedSlots.length === 3} onClick={() => void onReroll(lockedSlots)}>
          {candidateRerollsUsed < 3 ? `刷新未锁定栏位 · 免费 ${3 - candidateRerollsUsed}/3` : `刷新未锁定栏位 · ${8 * (candidatePaidRerolls + 1)} 传承点`}
        </button>
        <p>锁定的角色不会变化。三次免费刷新用完后，费用会逐次提高。</p>
      </div>
    </main>
  );
}
