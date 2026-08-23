import { useEffect, useRef, useState } from "react";
import type { GameSpeed, GameView, HuntingView, MapLocationView } from "../../shared/game";

interface StoryScreenProps {
  game: GameView;
  busy: boolean;
  onAwaken: () => Promise<void>;
  onAction: (input: string) => Promise<void>;
  onSpeed: (speed: GameSpeed) => Promise<void>;
  onEnd: (reason?: string) => Promise<void>;
}

type Panel = "人物" | "武魂" | "背包" | "地图" | "关系" | "任务" | "猎魂" | "世界";
const PANELS: Panel[] = ["人物", "武魂", "背包", "地图", "关系", "任务", "猎魂", "世界"];

function panelBadge(game: GameView, panel: Panel): string | undefined {
  if (panel === "人物" && game.character?.injuries.length) return String(game.character.injuries.length);
  if (panel === "关系" && game.relations.length > 2) return String(game.relations.length);
  if (panel === "任务") return String(game.tasks.filter((task) => task.status === "进行中").length || "");
  if (panel === "猎魂" && game.hunting && game.hunting.stage !== "完成") return "!";
  if (panel === "世界" && (game.activeEvents.length || game.news.length)) return game.activeEvents.length ? "!" : String(Math.min(9, game.news.length));
  return undefined;
}

export function StoryScreen({ game, busy, onAwaken, onAction, onSpeed, onEnd }: StoryScreenProps) {
  const [input, setInput] = useState("");
  const [panel, setPanel] = useState<Panel>("人物");
  const [confirmEnd, setConfirmEnd] = useState(false);
  const narrativeEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    narrativeEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [game.narrative.length]);

  const submit = (value: string) => {
    const action = value.trim();
    if (!action || busy || game.status === "ended") return;
    setInput("");
    void onAction(action);
  };

  return (
    <main className="game-shell">
      <header className="game-topbar">
        <div><p className="eyebrow">{game.character ? `${game.character.name}的故事` : "武魂觉醒"}</p><h1>{game.location}</h1></div>
        <div className="topbar-tools">
          <div className="speed-switch" aria-label="游戏速度">
            {(["标准", "高速"] as GameSpeed[]).map((speed) => <button key={speed} type="button" disabled={busy || game.status === "ended"} className={game.speed === speed ? "active" : ""} onClick={() => void onSpeed(speed)}>{speed}</button>)}
          </div>
          <div className="world-clock"><span>{game.worldTime?.era}{game.character ? ` · ${game.character.age} 岁` : ""}</span><strong>{game.worldTime ? `${game.worldTime.season} · 原作 ${game.worldTime.year >= 0 ? "+" : ""}${game.worldTime.year} 年 · 第 ${game.worldTime.day} 日 · ${game.worldTime.time}` : "觉醒日前"}</strong></div>
        </div>
      </header>

      <div className="story-layout">
        <section className="story-column">
          <div className="chapter-rule"><span>第 {game.chapter.number} 章</span><i /><span>{game.status === "ended" ? "此生已定" : game.chapter.title}</span></div>
          <div className="narrative-stream" aria-live="polite">
            {game.narrative.map((entry) => entry.kind === "player"
              ? <blockquote key={entry.id} className="player-entry">{entry.text}</blockquote>
              : entry.kind === "system"
                ? <p key={entry.id} className="system-entry">{entry.text}</p>
                : <article key={entry.id} className="prose-entry">{entry.text.split("\n\n").map((paragraph, index) => <p key={`${entry.id}-${index}`}>{paragraph}</p>)}</article>)}
            <div ref={narrativeEnd} />
          </div>

          {game.status === "awakening" ? <div className="awakening-action"><button className="primary-button" type="button" disabled={busy} onClick={() => void onAwaken()}>{busy ? "觉醒中…" : "觉醒武魂"}</button></div>
            : game.status === "ended" ? <EndingPanel game={game} />
              : <div className="action-area">
                  <div className="suggestion-list">{game.suggestions.map((suggestion, index) => <button type="button" key={`${suggestion}-${index}`} disabled={busy} onClick={() => submit(suggestion)}><span>{index + 1}</span>{suggestion}</button>)}</div>
                  <form onSubmit={(event) => { event.preventDefault(); submit(input); }} className="action-form"><textarea value={input} onChange={(event) => setInput(event.target.value)} placeholder="输入行动或对话……" rows={3} disabled={busy} /><button className="send-button" type="submit" disabled={busy || !input.trim()}>{busy ? "推演中" : "行动"}</button></form>
                  <div className="action-bottom-row"><span>可自由输入</span>{!confirmEnd ? <button type="button" disabled={busy} onClick={() => setConfirmEnd(true)}>结束此生</button> : <span className="end-confirm">结算为 <button type="button" onClick={() => void onEnd("完成目标")}>目标完成</button><button type="button" onClick={() => void onEnd("时间线结束")}>时代结束</button><button type="button" onClick={() => void onEnd("玩家主动结束了这一生")}>普通结局</button><button type="button" onClick={() => setConfirmEnd(false)}>取消</button></span>}</div>
                </div>}
        </section>

        <aside className="side-panel">
          <nav className="panel-tabs">{PANELS.map((item) => { const badge = panelBadge(game, item); return <button key={item} type="button" className={panel === item ? "active" : ""} onClick={() => setPanel(item)}><span>{item}</span>{badge && <b>{badge}</b>}</button>; })}</nav>
          <div className="panel-content">
            {panel === "人物" && <CharacterPanel game={game} />}
            {panel === "武魂" && <SoulPanel game={game} />}
            {panel === "背包" && <InventoryPanel game={game} submit={submit} busy={busy} />}
            {panel === "地图" && <MapPanel game={game} submit={submit} busy={busy} />}
            {panel === "关系" && <RelationPanel game={game} />}
            {panel === "任务" && <TaskPanel game={game} />}
            {panel === "猎魂" && <HuntPanel game={game} submit={submit} busy={busy} />}
            {panel === "世界" && <WorldPanel game={game} submit={submit} busy={busy} />}
          </div>
          <footer className="panel-footer"><span>{game.difficulty}</span><span>{game.speed}</span></footer>
        </aside>
      </div>
    </main>
  );
}

function CharacterPanel({ game }: { game: GameView }) {
  if (!game.character) return <LockedPanel text="觉醒后显示" />;
  const character = game.character;
  return <div className="detail-stack">
    <div className="identity-block"><small>{character.age} 岁 · {character.gender}</small><strong>{character.name}</strong><span>{character.originName}</span></div>
    <dl className="stat-list">
      <div><dt>魂力</dt><dd>{character.soulRank} 级 · {character.cultivationProgress}</dd></div><div><dt>状态</dt><dd>{character.condition} · {character.fatigue}</dd></div>
      <div><dt>体魄</dt><dd>{character.abilityDescriptors.physique}</dd></div><div><dt>精神</dt><dd>{character.abilityDescriptors.spirit}</dd></div><div><dt>感知</dt><dd>{character.abilityDescriptors.perception}</dd></div>
      <div><dt>钱</dt><dd>{character.coins} 枚</dd></div><div><dt>名望</dt><dd>{character.reputation}</dd></div>
    </dl>
    {character.injuries.length > 0 && <SimpleList title="伤势" values={character.injuries} empty="" />}
    <p className="panel-label">人生目标</p><p className="panel-copy">{game.lifeGoal}</p>
    {game.affiliations.length > 0 && <><p className="panel-label">身份</p><div className="affiliation-list">{game.affiliations.map((item) => <article key={item.id}><strong>{item.name}</strong><span>{item.role} · {item.reputation}</span></article>)}</div></>}
    <div className="trait-cloud">{character.personalityTraits.map((trait) => <span key={trait}>{trait}</span>)}</div>
  </div>;
}

function SoulPanel({ game }: { game: GameView }) {
  if (!game.character) return <LockedPanel text="尚未觉醒" />;
  const character = game.character;
  return <div className="detail-stack">
    <div className="identity-block"><small>{character.martialSoul.category}</small><strong>{character.martialSoul.name}</strong></div><p className="panel-copy">{character.martialSoul.description}</p>
    <dl className="stat-list"><div><dt>先天魂力</dt><dd>{character.innateSoulPower} 级</dd></div><div><dt>魂环</dt><dd>{character.soulRings.length} 枚</dd></div></dl>
    {character.revealedGift && <article className="gift-card"><span>已发现</span><strong>{character.revealedGift}</strong></article>}
    {character.specialSystem && <article className="special-system-card"><header><span>独立体系</span><strong>{character.specialSystem.name}</strong></header><p>{character.specialSystem.stage} · {character.specialSystem.progress}</p><div className="trait-cloud">{character.specialSystem.abilities.map((ability) => <span key={ability}>{ability}</span>)}</div><small>{character.specialSystem.resourceHint}</small></article>}
    <div className="ring-list">{character.soulRings.map((ring) => <article key={ring.index}><i className={`ring-dot ring-${ring.color}`} /><div><strong>第 {ring.index} 环 · {ring.beastName}</strong><span>{ring.years} 年 · {ring.skillName}</span><p>{ring.skillDescription}</p></div></article>)}</div>
    {!character.soulRings.length && <LockedPanel text="达到瓶颈后可猎取魂环" />}
  </div>;
}

function InventoryPanel({ game, submit, busy }: { game: GameView; submit: (value: string) => void; busy: boolean }) {
  if (!game.inventory.length) return <LockedPanel text="背包是空的" />;
  return <div><h3 className="panel-title">随身物品</h3><div className="inventory-list">{game.inventory.map((value, index) => <article key={`${value}-${index}`}><span>{value}</span><button type="button" disabled={busy || game.status === "ended"} onClick={() => submit(`使用${value}`)}>使用</button></article>)}</div></div>;
}

function MapPanel({ game, submit, busy }: { game: GameView; submit: (value: string) => void; busy: boolean }) {
  const visible = game.map;
  if (!visible.length) return <LockedPanel text="还没有地图信息" />;
  return <div className="map-list">{visible.map((location: MapLocationView) => <article key={location.id} className={location.current ? "current" : ""}><header><strong>{location.name}</strong><span>{location.current ? "当前" : location.travelMinutes ? `${Math.ceil(location.travelMinutes / 60)} 小时` : location.region}</span></header><p>{location.description}</p><small>危险：{location.danger}</small>{!location.current && <button type="button" disabled={busy || game.status === "ended"} onClick={() => submit(`前往${location.name}`)}>前往</button>}</article>)}</div>;
}

function RelationPanel({ game }: { game: GameView }) {
  if (!game.relations.length) return <LockedPanel text="暂无关系" />;
  return <div className="card-list">{game.relations.map((relation, index) => <article key={relation.id ?? `${relation.name}-${index}`}><span>{relation.relation}{relation.faction ? ` · ${relation.faction}` : ""}</span><strong>{relation.name}</strong><p>{relation.impression}</p>{relation.lastSeen && <small>{relation.lastSeen}</small>}</article>)}</div>;
}

function TaskPanel({ game }: { game: GameView }) {
  if (!game.tasks.length) return <LockedPanel text="暂无记录" />;
  return <div className="card-list">{game.tasks.map((task, index) => <article key={task.id ?? `${task.title}-${index}`}><span>{task.kind} · {task.status ?? "进行中"}</span><strong>{task.title}</strong><p>{task.detail}</p>{task.deadline && <small>{task.deadline}</small>}</article>)}</div>;
}

function HuntPanel({ game, submit, busy }: { game: GameView; submit: (value: string) => void; busy: boolean }) {
  const hunting: HuntingView | undefined = game.hunting;
  const rank = game.character?.soulRank ?? 0;
  const canHunt = rank > 0 && rank % 10 === 0 && (game.character?.soulRings.length ?? 0) < Math.floor(rank / 10);
  if (!hunting) return <div className="hunt-start"><p>{canHunt ? "魂力已经到达瓶颈，可以开始调查目标。" : `当前 ${rank} 级，达到下一个十级瓶颈后才能吸收魂环。`}</p><button type="button" disabled={busy || !canHunt} onClick={() => submit("开始调查适合我的魂兽")}>调查魂兽</button></div>;
  return <div className="hunt-panel">
    <div className="hunt-stage"><span>第 {hunting.ringIndex} 魂环</span><strong>{hunting.stage}</strong><small>{hunting.trailProgress}</small></div>
    {hunting.targetName && <article className="hunt-target"><span>目标</span><strong>{hunting.targetName}</strong>{hunting.targetYears && <small>约 {hunting.targetYears} 年</small>}</article>}
    {hunting.recommendations.map((item) => <article className="recommendation-card" key={item.beastId}><strong>{item.name}</strong><span>{item.estimatedYears} · {item.risk}</span><p>{item.fit}</p><small>{item.source}</small><button type="button" disabled={busy} onClick={() => submit(`选择${item.name}作为魂环目标`)}>选择</button></article>)}
    {hunting.preparation.length > 0 && <SimpleList title="准备" values={hunting.preparation} empty="" />}{hunting.absorptionRisk && <p className="risk-line">吸收风险：{hunting.absorptionRisk}</p>}{hunting.result && <p className="result-line">{hunting.result}</p>}
  </div>;
}

function WorldPanel({ game, submit, busy }: { game: GameView; submit: (value: string) => void; busy: boolean }) {
  return <div className="world-panel">{game.activeEvents.length > 0 && <><h3 className="panel-title">眼前事件</h3><div className="world-event-list">{game.activeEvents.map((event) => <article key={event.id}><header><span>{event.kind} · {event.remaining}</span><strong>{event.title}</strong></header><p>{event.detail}</p><small>{event.location}</small><div><button type="button" disabled={busy} onClick={() => submit(`调查${event.title}`)}>调查</button><button type="button" disabled={busy} onClick={() => submit(`帮助处理${event.title}`)}>介入</button></div></article>)}</div></>}<h3 className="panel-title">近日消息</h3>{game.news.length ? <div className="news-list">{game.news.map((item) => <article key={item.id}><span>{item.date}</span><strong>{item.title}</strong><p>{item.detail}</p></article>)}</div> : <p className="panel-copy">暂时没有传到你耳中的大事。</p>}<h3 className="panel-title">已知人物</h3>{game.knownFigures.length ? <div className="figure-list">{game.knownFigures.map((figure) => <article key={figure.id}><header><strong>{figure.name}</strong><span>{figure.knownPower}</span></header><p>{figure.title ?? figure.faction ?? "身份不详"}</p><small>{figure.location} · {figure.status}</small></article>)}</div> : <p className="panel-copy">你还没有接触到重要人物。</p>}</div>;
}

function EndingPanel({ game }: { game: GameView }) {
  const settlement = game.runProgress.settlement;
  return <section className="ending-panel"><p className="eyebrow">本轮结算</p><h2>{settlement?.ending ?? game.runProgress.ending ?? "故事结束"}</h2>{settlement ? <><div className="ending-score"><strong>{settlement.legacyPoints}</strong><span>传承点</span><small>{settlement.baseScore} × {settlement.multiplier.toFixed(2)}</small></div><ul>{settlement.highlights.map((item) => <li key={item}>{item}</li>)}</ul></> : <p>这一生已经结束，记录已写入存档。</p>}</section>;
}

function SimpleList({ title, values, empty }: { title: string; values: string[]; empty: string }) {
  return <div><h3 className="panel-title">{title}</h3>{values.length ? <ul className="simple-list">{values.map((value, index) => <li key={`${value}-${index}`}>{value}</li>)}</ul> : <LockedPanel text={empty} />}</div>;
}

function LockedPanel({ text }: { text: string }) {
  return <div className="locked-panel"><span>未显现</span><p>{text}</p></div>;
}
