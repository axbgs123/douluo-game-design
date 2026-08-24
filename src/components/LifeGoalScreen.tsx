import { useEffect, useState } from "react";
import type { CharacterShapingView, GameView } from "../../shared/game";

interface LifeGoalScreenProps {
  game: GameView;
  shaping: CharacterShapingView;
  busy: boolean;
  onReroll: (lockedSlots: number[]) => Promise<void>;
  onComplete: (input: { lifeGoal: string; activeMartialSoulIndex: number; publiclyKnownMartialSoulIndices: number[] }) => Promise<void>;
}

function eraLabel(sourceEra: NonNullable<GameView["character"]>["martialSoul"]["sourceEra"]): string {
  if (!sourceEra) return "来源待考";
  if (sourceEra === "局外") return "局外传承";
  if (sourceEra === "原创") return "斗罗世界原创变异";
  return `斗罗大陆 ${sourceEra} 代记载`;
}

export function LifeGoalScreen({ game, shaping, busy, onReroll, onComplete }: LifeGoalScreenProps) {
  const [lifeGoal, setLifeGoal] = useState(shaping.lifeGoalOptions[0] ?? "");
  const [locks, setLocks] = useState<number[]>(shaping.goalLocks.map((locked, index) => locked ? index : -1).filter((index) => index >= 0));
  const [activeSoulIndex, setActiveSoulIndex] = useState(game.character?.activeMartialSoulIndex ?? 0);
  const [publicSoulIndices, setPublicSoulIndices] = useState<number[]>(game.character?.publiclyKnownMartialSoulIndices ?? [0]);
  const character = game.character!;
  const souls = character.martialSouls?.length ? character.martialSouls : [character.martialSoul];

  useEffect(() => { setLifeGoal(shaping.lifeGoalOptions[0] ?? ""); }, [shaping.goalRerollIndex]);

  return <main className="life-goal-page">
    <header className="awakening-reveal-header"><p className="eyebrow">武魂觉醒</p><h1>{character.name}</h1><p>{souls.length === 1 ? "单武魂" : souls.length === 2 ? "双生武魂" : "三生武魂"} · 先天魂力 {character.innateSoulPower} 级</p></header>

    <section className={`awakened-soul-grid soul-count-${souls.length}`}>{souls.map((soul, index) => <article key={`${soul.name}-${index}`} className={`awakened-soul-card rarity-${soul.grade ?? "平凡"} ${activeSoulIndex === index ? "selected-primary-soul" : ""}`}><span>{activeSoulIndex === index ? "准备先修" : `第 ${index + 1} 武魂 · 尚未主修`}</span><h2>{soul.name}</h2><strong>{soul.category} · 潜质 {soul.grade ?? "未定"}</strong><p>{soul.description}</p>{soul.originFit && <p className="soul-origin-fit">{soul.originFit}</p>}<small>{eraLabel(soul.sourceEra)}</small><div className="awakening-soul-controls"><label><input type="radio" name="primary-soul" checked={activeSoulIndex === index} onChange={() => setActiveSoulIndex(index)} />先修这个武魂</label><label><input type="checkbox" checked={publicSoulIndices.includes(index)} disabled={index === 0} onChange={(event) => setPublicSoulIndices((current) => event.target.checked ? [...new Set([...current, index])] : current.filter((item) => item !== index))} />{index === 0 ? "已在仪式中显露" : "向现场公开"}</label></div></article>)}</section>

    {souls.length > 1 && <section className="awakening-disclosure-note"><strong>多武魂不会自动全部暴露</strong><p>第一武魂已经在阵中显现；其余武魂目前只有你知道。你可以压住异动，也可以当场外放。先修武魂只决定当前修炼路线，不会删除其他武魂。</p><span>现场将知道：{publicSoulIndices.map((index) => souls[index]?.name).filter(Boolean).join("、")}</span></section>}

    <section className="awakening-prose">{game.narrative.filter((entry) => entry.kind === "narration").slice(-1).map((entry) => entry.text.split("\n\n").map((paragraph, index) => <p key={`${entry.id}-${index}`}>{paragraph}</p>))}</section>

    <section className="shaping-section post-awakening-goals">
      <div className="shaping-title"><div><span>01</span><h2>看清武魂后，再定此生所求</h2><p>目标难度会参考武魂潜质、武魂数量和出身。三选一，也可以自己修改。</p></div><button type="button" className="reroll-button" disabled={busy || shaping.goalRerollsUsed >= 3 || locks.length === 3} onClick={() => void onReroll(locks)}>刷新未锁定目标 · {3 - shaping.goalRerollsUsed}/3</button></div>
      <div className="goal-draw-grid">{shaping.lifeGoalOptions.map((goal, index) => <article key={`${index}-${goal}`} className={locks.includes(index) ? "goal-slot locked" : "goal-slot"}><span className={`goal-difficulty goal-${shaping.lifeGoalDifficulties[index]}`}>{shaping.lifeGoalDifficulties[index]}</span><button type="button" className={lifeGoal === goal ? "active" : ""} onClick={() => setLifeGoal(goal)}>{goal}</button><button type="button" className="goal-lock-button" onClick={() => setLocks((current) => current.includes(index) ? current.filter((slot) => slot !== index) : [...current, index])}>{locks.includes(index) ? "已锁定" : "锁定栏位"}</button></article>)}</div>
      <label className="custom-goal"><span>自定或修改</span><textarea value={lifeGoal} onChange={(event) => setLifeGoal(event.target.value)} maxLength={160} rows={3} /></label>
    </section>

    <button type="button" className="primary-button life-goal-submit" disabled={busy || lifeGoal.trim().length < 6} onClick={() => void onComplete({ lifeGoal: lifeGoal.trim(), activeMartialSoulIndex: activeSoulIndex, publiclyKnownMartialSoulIndices: publicSoulIndices })}>{busy ? "写入人生目标…" : "确定目标与觉醒处置，开始故事"}</button>
  </main>;
}
