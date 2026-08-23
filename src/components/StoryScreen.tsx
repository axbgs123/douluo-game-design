import { useEffect, useRef, useState } from "react";
import type { CheckpointSummary, GameSpeed, GameView, HuntingView, MapLevel } from "../../shared/game";
import { formatSoulCoins } from "../../shared/currency";
import { worldMapPoint } from "../../shared/world-map";
import { DouluoWorldMap } from "./DouluoWorldMap";

interface StoryScreenProps {
  game: GameView;
  busy: boolean;
  aiConnected: boolean;
  actionPhase: string;
  actionDraft: string;
  lastAction: string;
  lastExplanation: string;
  checkpoints: CheckpointSummary[];
  onAwaken: () => Promise<void>;
  onAction: (input: string) => Promise<void>;
  onCancelAction: () => void;
  onRetry: () => Promise<void> | void;
  onRewrite: () => Promise<void> | void;
  onCreateCheckpoint: () => Promise<void> | void;
  onRestoreCheckpoint: (checkpointId: number) => Promise<void> | void;
  onOpenSettings: () => void;
  onSpeed: (speed: GameSpeed) => Promise<void>;
  onEnd: (reason?: string) => Promise<void>;
  onMapPin: (input: { label: string; x: number; y: number }) => Promise<void>;
  onMapPinRemove: (pinId: string) => Promise<void>;
}

type Panel = "人物" | "武魂" | "背包" | "地图" | "关系" | "任务" | "情报" | "手记" | "猎魂" | "世界";
const PANELS: Panel[] = ["人物", "武魂", "背包", "地图", "关系", "任务", "情报", "手记", "猎魂", "世界"];

function panelBadge(game: GameView, panel: Panel): string | undefined {
  if (panel === "人物" && game.character?.injuries.length) return String(game.character.injuries.length);
  if (panel === "关系" && game.relations.length > 2) return String(game.relations.length);
  if (panel === "任务") return String(game.tasks.filter((task) => task.status === "进行中").length || "");
  if (panel === "情报") return String(Math.min(9, game.intelligence.filter((item) => item.freshness === "新鲜").length) || "");
  if (panel === "手记" && game.storyArchive.openThreads.length) return String(Math.min(9, game.storyArchive.openThreads.length));
  if (panel === "猎魂" && game.hunting && game.hunting.stage !== "完成") return "!";
  if (panel === "世界" && (game.activeEvents.length || game.news.length)) return game.activeEvents.length ? "!" : String(Math.min(9, game.news.length));
  return undefined;
}

export function StoryScreen({ game, busy, aiConnected, actionPhase, actionDraft, lastAction, lastExplanation, checkpoints, onAwaken, onAction, onCancelAction, onRetry, onRewrite, onCreateCheckpoint, onRestoreCheckpoint, onOpenSettings, onSpeed, onEnd, onMapPin, onMapPinRemove }: StoryScreenProps) {
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
          <div className="world-clock"><span>{game.character ? `${game.character.age} 岁` : game.worldTime?.era}</span><strong>{game.worldTime ? `${game.worldTime.season} · ${canonYearLabel(game.worldTime.year)} · 第 ${game.worldTime.day} 日 · ${game.worldTime.time}` : "觉醒日前"}</strong></div>
        </div>
      </header>

      <div className="story-layout">
        <section className="story-column">
          <div className="chapter-rule"><span>第 {game.chapter.number} 章</span><i /><span>{game.status === "ended" ? "此生已定" : game.chapter.title}</span></div>
          {game.status === "playing" && game.chapterObjective && <section className="chapter-objective"><div><span>当前章节目标</span><strong>{game.chapterObjective.title}</strong><p>{game.chapterObjective.stakes}</p></div><ol>{game.chapterObjective.steps.map((step) => <li key={step.id} className={`objective-${step.status}`}><i>{step.status === "完成" ? "✓" : step.status === "进行中" ? "→" : "·"}</i>{step.text}</li>)}</ol></section>}
          <div className="narrative-stream" aria-live="polite">
            {game.narrative.map((entry) => entry.kind === "player"
              ? <blockquote key={entry.id} className="player-entry">{entry.text}</blockquote>
              : entry.kind === "system"
                ? <p key={entry.id} className="system-entry">{entry.text}</p>
                : <article key={entry.id} className="prose-entry">{entry.text.split("\n\n").map((paragraph, index) => <p key={`${entry.id}-${index}`}>{paragraph}</p>)}</article>)}
            {busy && actionPhase && <>
              {actionDraft && <article className="prose-entry draft-prose">{actionDraft.split("\n\n").map((paragraph, index) => <p key={`draft-${index}`}>{paragraph}</p>)}</article>}
              <div className="writing-indicator"><i /><span>{actionDraft ? "故事仍在继续……" : "故事正在续写……"}</span><button type="button" onClick={onCancelAction}>停笔</button></div>
            </>}
            <div ref={narrativeEnd} />
          </div>

          {game.status === "awakening" ? <div className="awakening-action"><button className="primary-button" type="button" disabled={busy} onClick={() => void onAwaken()}>{busy ? "觉醒中…" : "觉醒武魂"}</button></div>
            : game.status === "ended" ? <EndingPanel game={game} />
              : !aiConnected ? <div className="ai-required-card"><strong>连接 AI 后开始正文</strong><p>当前仍可查看角色、地图、资料和模型设置，但正式行动不会在无 AI 时推进。</p><button type="button" onClick={onOpenSettings}>设置模型</button></div>
                : <div className="action-area">
                    <div className="suggestion-list">{game.suggestions.map((suggestion, index) => <button type="button" key={`${suggestion}-${index}`} disabled={busy} onClick={() => submit(suggestion)}><span>{index + 1}</span>{suggestion}</button>)}</div>
                    <form onSubmit={(event) => { event.preventDefault(); submit(input); }} className="action-form"><textarea value={input} onChange={(event) => setInput(event.target.value)} placeholder="输入行动或对话……" rows={3} disabled={busy} /><button className="send-button" type="submit" disabled={busy || !input.trim()}>{busy ? "推演中" : "行动"}</button></form>
                    <div className="action-bottom-row"><span className="action-tools">{lastAction && !busy && <button type="button" onClick={() => void onRetry()}>重试未提交行动</button>} {!busy && game.narrative.some((entry) => entry.kind === "player") && <button type="button" onClick={() => void onRewrite()}>只重写正文</button>}<button type="button" disabled={busy} onClick={() => void onCreateCheckpoint()}>手动存档</button>{(lastExplanation || game.lastActionReceipt) && <details><summary>查看判定</summary>{game.lastActionReceipt ? <div className="action-receipt"><strong>{game.lastActionReceipt.intent}</strong><p>{game.lastActionReceipt.summary}</p><small>行动 {game.lastActionReceipt.actionIndex} · 世界时间推进 {game.lastActionReceipt.elapsedMinutes} 分钟 · 审校规则 {game.lastActionReceipt.appliedRuleIds.length} 条</small></div> : <p>{lastExplanation}</p>}</details>}{checkpoints.length > 0 && <details className="checkpoint-menu"><summary>回溯关键节点</summary><div><small>只保留最近三个节点；回溯会扣本局表现分。</small>{checkpoints.map((checkpoint) => <button type="button" key={checkpoint.id} disabled={busy} onClick={() => { if (window.confirm(`回溯到“${checkpoint.label}”会扣除本局表现分，并减少局外点数。继续吗？`)) void onRestoreCheckpoint(checkpoint.id); }}><strong>{checkpoint.label}</strong><small>行动 {checkpoint.actionIndex} · {new Date(checkpoint.createdAt).toLocaleString("zh-CN")}</small></button>)}</div></details>}</span>{!confirmEnd ? <button type="button" disabled={busy} onClick={() => setConfirmEnd(true)}>申请结算</button> : <span className="end-confirm"><small>结局类型、目标是否完成与收益均由当前存档数据判断。</small><button type="button" onClick={() => void onEnd()}>交给程序判定</button><button type="button" onClick={() => setConfirmEnd(false)}>取消</button></span>}</div>
                  </div>}
        </section>

        <aside className="side-panel">
          <nav className="panel-tabs">{PANELS.map((item) => { const badge = panelBadge(game, item); return <button key={item} type="button" className={panel === item ? "active" : ""} onClick={() => setPanel(item)}><span>{item}</span>{badge && <b>{badge}</b>}</button>; })}</nav>
          <div className="panel-content">
            {panel === "人物" && <CharacterPanel game={game} />}
            {panel === "武魂" && <SoulPanel game={game} />}
            {panel === "背包" && <InventoryPanel game={game} submit={submit} busy={busy} />}
            {panel === "地图" && <MapPanel game={game} submit={submit} busy={busy} onMapPin={onMapPin} onMapPinRemove={onMapPinRemove} />}
            {panel === "关系" && <RelationPanel game={game} />}
            {panel === "任务" && <TaskPanel game={game} />}
            {panel === "情报" && <IntelligencePanel game={game} />}
            {panel === "手记" && <ArchivePanel game={game} />}
            {panel === "猎魂" && <HuntPanel game={game} submit={submit} busy={busy} />}
            {panel === "世界" && <WorldPanel game={game} submit={submit} busy={busy} />}
          </div>
          <footer className="panel-footer"><span>{game.difficulty}</span><span>{game.speed}</span></footer>
        </aside>
      </div>
    </main>
  );
}

function canonYearLabel(year: number): string {
  if (year === 0) return "唐三觉醒同年";
  return year < 0 ? `唐三觉醒前 ${Math.abs(year)} 年` : `唐三觉醒后 ${year} 年`;
}

function CharacterPanel({ game }: { game: GameView }) {
  if (!game.character) return <LockedPanel text="觉醒后显示" />;
  const character = game.character;
  return <div className="detail-stack">
    <div className="identity-block"><small>{character.age} 岁 · {character.gender}</small><strong>{character.name}</strong><span>{character.originName}</span></div>
    <dl className="stat-list">
      <div><dt>魂力</dt><dd>{character.soulRank} 级 · {character.cultivationProgress}</dd></div><div><dt>状态</dt><dd>{character.condition} · {character.fatigue}</dd></div>
      <div><dt>体魄</dt><dd>{character.abilityDescriptors.physique}</dd></div><div><dt>精神</dt><dd>{character.abilityDescriptors.spirit}</dd></div><div><dt>感知</dt><dd>{character.abilityDescriptors.perception}</dd></div>
      <div><dt>魂币</dt><dd>{formatSoulCoins(character.coins)}</dd></div><div><dt>名望</dt><dd>{character.reputation}</dd></div>
    </dl>
    {character.injuries.length > 0 && <SimpleList title="伤势" values={character.injuries} empty="" />}
    <p className="panel-label">人生目标</p><p className="panel-copy">{game.lifeGoal}</p><small className="goal-verification-note">结算时由魂力、任务、关系、探索与真实历史影响共同验收。</small>
    {game.affiliations.length > 0 && <><p className="panel-label">身份</p><div className="affiliation-list">{game.affiliations.map((item) => <article key={item.id}><strong>{item.name}</strong><span>{item.role} · {item.reputation}</span></article>)}</div></>}
    {game.reputations.length > 0 && <><p className="panel-label">分地区名声</p><div className="reputation-list">{game.reputations.map((item) => <article key={`${item.scope}-${item.publicName}`}><strong>{item.publicName}</strong><span>{item.scope} · {item.reputation}</span><small>追查热度 {item.heat} · {item.source}</small></article>)}</div></>}
    {game.professions.length > 0 && <><p className="panel-label">技艺与研究</p><div className="profession-list">{game.professions.map((item) => <article key={item.id}><header><strong>{item.name}</strong><span>{item.level}</span></header><progress max={100} value={item.progress} /><small>实验 {item.experiments} · 失败 {item.failures} · 已掌握 {item.knownMethods.length}</small></article>)}</div></>}
    <div className="trait-cloud">{character.personalityTraits.map((trait) => <span key={trait}>{trait}</span>)}</div>
  </div>;
}

function SoulPanel({ game }: { game: GameView }) {
  if (!game.character) return <LockedPanel text="尚未觉醒" />;
  const character = game.character;
  const souls = character.martialSouls?.length ? character.martialSouls : [character.martialSoul];
  return <div className="detail-stack">
    {souls.map((soul, index) => <section key={`${soul.name}-${index}`} className="soul-entry"><div className={`identity-block ${soul.rarity ? `soul-panel-${soul.rarity}` : ""} ${soul.grade ? `soul-grade-${soul.grade}` : ""}`}><small>{index === 0 ? "主武魂" : `第 ${index + 1} 武魂 · 尚未修炼`} · {soul.rarity ? `${soul.rarity} · ` : ""}{soul.grade ? `潜质 ${soul.grade} · ` : ""}{soul.category}</small><strong>{soul.name}</strong></div><p className="panel-copy">{soul.description}</p></section>)}
    <dl className="stat-list"><div><dt>先天魂力</dt><dd>{character.innateSoulPower} 级</dd></div><div><dt>魂环</dt><dd>{character.soulRings.length} 枚</dd></div></dl>
    {character.revealedGift && <article className="gift-card"><span>已发现</span><strong>{character.revealedGift}</strong></article>}
    {character.specialSystem && <article className="special-system-card"><header><span>独立体系</span><strong>{character.specialSystem.name}</strong></header><p>{character.specialSystem.stage} · {character.specialSystem.progress}</p><div className="trait-cloud">{character.specialSystem.abilities.map((ability) => <span key={ability}>{ability}</span>)}</div><small>{character.specialSystem.resourceHint}</small></article>}
    <div className="ring-list">{character.soulRings.map((ring) => <article key={ring.index}><i className={`ring-dot ring-${ring.color}`} /><div><strong>第 {ring.index} 环 · {ring.beastName}</strong><span>{ring.years} 年 · {ring.skillName}</span><p>{ring.skillDescription}</p></div></article>)}</div>
    {!character.soulRings.length && <LockedPanel text="达到瓶颈后可猎取魂环" />}
  </div>;
}

function InventoryPanel({ game, submit, busy }: { game: GameView; submit: (value: string) => void; busy: boolean }) {
  return <div><div className={`inventory-load load-${game.inventoryLoad.state}`}><strong>{game.inventoryLoad.used} / {game.inventoryLoad.capacity}</strong><span>随身负重 · {game.inventoryLoad.state}</span></div><h3 className="panel-title">随身物品</h3>{game.inventory.length ? <div className="inventory-grid">{game.inventory.map((value, index) => <article key={`${value}-${index}`}><i>{String(index + 1).padStart(2, "0")}</i><strong>{value}</strong><button type="button" disabled={busy || game.status === "ended"} onClick={() => submit(`使用${value}`)}>使用</button><button type="button" disabled={busy || game.status === "ended"} onClick={() => submit(`把${value}存放在住处`)}>存放</button></article>)}</div> : <LockedPanel text="背包是空的" />}{game.inventoryLoad.storage.length > 0 && <><h3 className="panel-title">住处与仓库</h3><div className="inventory-grid">{game.inventoryLoad.storage.map((value, index) => <article key={`${value}-stored-${index}`}><i>藏</i><strong>{value}</strong><button type="button" disabled={busy} onClick={() => submit(`从住处取回${value}`)}>取回</button></article>)}</div></>}</div>;
}

function MapPanel({ game, submit, busy, onMapPin, onMapPinRemove }: { game: GameView; submit: (value: string) => void; busy: boolean; onMapPin: (input: { label: string; x: number; y: number }) => Promise<void>; onMapPinRemove: (pinId: string) => Promise<void> }) {
  const [zoom, setZoom] = useState(1);
  const [level, setLevel] = useState<MapLevel>("大陆");
  const [pinLabel, setPinLabel] = useState("");
  const [pendingPoint, setPendingPoint] = useState<{ x: number; y: number }>();
  const visible = game.map;
  if (!visible.length) return <LockedPanel text="还没有地图信息" />;
  const current = visible.find((item) => item.current) ?? visible[0];
  const routes = visible.filter((item) => item.id !== current.id && item.travelMinutes >= 0);
  const markers = [
    { id: `current-${current.id}`, label: game.character?.name ?? "主角", detail: "当前位置", x: current.x, y: current.y, tone: "current" as const },
    ...visible.filter((item) => item.objective).map((item) => ({ id: `objective-${item.id}`, label: item.name, detail: item.objective, x: item.x, y: item.y, tone: "objective" as const, onClick: item.travelMinutes >= 0 ? () => submit(`前往${item.name}`) : undefined })),
  ];
  const levelNodes = game.mapHierarchy.nodes.filter((node) => node.level === level);
  return <div className="map-panel-visual">
    <nav className="map-level-tabs">{(["大陆", "聚居地", "建筑"] as MapLevel[]).map((item) => <button type="button" key={item} className={level === item ? "active" : ""} onClick={() => setLevel(item)}>{item === "大陆" ? game.mapHierarchy.continentName : item === "聚居地" ? game.mapHierarchy.settlementName : game.mapHierarchy.buildingName}</button>)}</nav>
    {level !== "大陆" ? <div className={`local-map local-map-${level}`}><svg viewBox="0 0 100 100" role="img" aria-label={`${level}地图`}>
      <path d="M8 86 L92 86 M12 52 L88 52 M50 10 L50 92" className="local-road" />
      {levelNodes.map((node) => <g key={node.id} transform={`translate(${node.x} ${node.y})`} className={node.current ? "local-node current" : node.objective ? "local-node objective" : "local-node"}><circle r={node.current ? 4.8 : 3.5} /><text y="-6" textAnchor="middle">{node.name}</text><title>{node.description} · {node.source} · 可信度 {node.confidence}%</title></g>)}
    </svg><div className="local-map-list">{levelNodes.map((node) => <article key={node.id}><header><strong>{node.name}</strong><span>{node.current ? "当前位置" : node.kind}</span></header><p>{node.description}</p><small>{node.source} · 可信度 {node.confidence}%</small></article>)}</div></div> : <>
    <div className="map-tools"><div><button type="button" onClick={() => setZoom((value) => Math.max(1, value - .25))}>−</button><span>{Math.round(zoom * 100)}%</span><button type="button" onClick={() => setZoom((value) => Math.min(2.5, value + .25))}>＋</button></div><small>输入名称后点击地图即可标点</small></div>
    <DouluoWorldMap
      zoom={zoom}
      landmarks={visible.map((location) => ({ ...worldMapPoint(location.id), name: location.name, muted: !location.discovered && !location.current }))}
      markers={markers}
      pins={game.mapPins}
      onCanvasClick={!busy ? (x, y) => setPendingPoint({ x, y }) : undefined}
      onPinRemove={busy ? undefined : (pinId) => void onMapPinRemove(pinId)}
    />
    <div className="map-pin-form"><input value={pinLabel} maxLength={24} onChange={(event) => setPinLabel(event.target.value)} placeholder="标点名称，如：可疑洞口" /><button type="button" disabled={busy || !pinLabel.trim()} onClick={() => { const point = pendingPoint ?? { x: current.x, y: current.y }; void onMapPin({ label: pinLabel.trim(), ...point }); setPinLabel(""); setPendingPoint(undefined); }}>保存标点</button><span>{pendingPoint ? `已选地图坐标 ${pendingPoint.x.toFixed(1)}, ${pendingPoint.y.toFixed(1)}` : game.mapPins.length ? "点地图选位置；点击已有标点可删除" : "点地图选位置；未选择时标在当前位置"}</span></div>
    {game.mapPins.length > 0 && <div className="saved-pin-list">{game.mapPins.map((pin) => <article key={pin.id}><span>⌖</span><strong>{pin.label}</strong><small>{pin.x.toFixed(1)}, {pin.y.toFixed(1)}</small><button type="button" disabled={busy} onClick={() => void onMapPinRemove(pin.id)}>删除</button></article>)}</div>}
    <article className="map-current-detail"><strong>{current.name}</strong><p>{current.description}</p><span>{current.region} · 危险 {current.danger}</span></article>
    <div className="map-route-list"><h4>可直接前往</h4>{routes.length ? routes.map((location) => <button type="button" key={location.id} disabled={busy || game.status === "ended"} onClick={() => submit(`前往${location.name}`)}><strong>{location.name}</strong><span>{Math.max(1, Math.ceil(location.travelMinutes / 60))} 小时 · {location.danger}</span></button>) : <p>当前没有确认过的直达路线。</p>}</div>
    </>}
  </div>;
}

function RelationPanel({ game }: { game: GameView }) {
  if (!game.relations.length && !game.npcRelations.length) return <LockedPanel text="暂无关系" />;
  const shown = game.relations.slice(0, 8);
  return <div className="relation-panel"><div className="relation-graph">
    <svg viewBox="0 0 320 310" aria-hidden="true">{shown.map((relation, index) => { const point = radialPoint(index, shown.length, 116); return <line key={relation.id ?? `${relation.name}-${index}`} className={`edge-${relation.category ?? "其他"}`} x1="160" y1="155" x2={point.x} y2={point.y} strokeWidth={Math.max(1.2, Math.min(4, (relation.strength ?? 12) / 22))} />; })}</svg>
    <div className="relation-center"><small>主角</small><strong>{game.character?.name}</strong></div>
    {shown.map((relation, index) => { const point = radialPoint(index, shown.length, 116); return <article key={relation.id ?? `${relation.name}-${index}`} className={`relation-node relation-${relation.category ?? "其他"}`} style={{ left: `${point.x / 3.2}%`, top: `${point.y / 3.1}%` }} title={relation.impression}><small>{relation.relation}</small><strong>{relation.name}</strong><span>{relation.faction ?? relation.impression}</span></article>; })}
  </div><div className="relation-legend"><span>亲属</span><span>师友</span><span>势力</span><span>敌对</span></div>{game.relations.length > shown.length && <p className="panel-copy">另有 {game.relations.length - shown.length} 段次要关系，关系增强后会进入主图。</p>}
  <h3 className="panel-title">关系明细</h3><div className="player-relation-ledger">{shown.map((relation) => <article key={`detail-${relation.id ?? relation.name}`}><header><strong>{relation.name}</strong><span>{relation.relation}</span></header><p>{relation.impression}</p><small>亲近 {relation.dimensions?.closeness ?? relation.strength ?? 0} · 信任 {relation.dimensions?.trust ?? relation.strength ?? 0} · 敬重 {relation.dimensions?.respect ?? 0} · 戒备 {relation.dimensions?.vigilance ?? 0} · 仇恨 {relation.dimensions?.hostility ?? 0}</small>{relation.history?.at(-1) && <em>{relation.history.at(-1)!.date}：{relation.history.at(-1)!.reason}</em>}</article>)}</div>
  {game.npcRelations.length > 0 && <><h3 className="panel-title">人物之间</h3><div className="npc-relation-ledger">{game.npcRelations.map((relation) => <article key={relation.id}><header><strong>{relation.leftName} — {relation.rightName}</strong><span>{relation.kind}</span></header><p>{relation.reason}</p><small>{relation.date} · 信任 {relation.dimensions.trust} · 戒备 {relation.dimensions.vigilance} · 利益 {relation.dimensions.sharedInterest}</small></article>)}</div></>}
  </div>;
}

function TaskPanel({ game }: { game: GameView }) {
  if (!game.tasks.length) return <LockedPanel text="暂无记录" />;
  return <div className="task-timeline">{game.tasks.map((task, index) => { const destination = task.destinationId ? game.map.find((location) => location.id === task.destinationId)?.name : undefined; return <article key={task.id ?? `${task.title}-${index}`} className={`task-${task.status ?? "进行中"}`}><i>{task.status === "完成" ? "✓" : task.status === "失败" ? "×" : index + 1}</i><div><span>{task.kind} · {task.status ?? "进行中"}</span><strong>{task.title}</strong><p>{task.detail}</p>{destination && <small>目的地 · {destination}</small>}{task.deadline && <small>{task.deadline}</small>}</div></article>; })}</div>;
}

function IntelligencePanel({ game }: { game: GameView }) {
  if (!game.intelligence.length) return <LockedPanel text="还没有通过亲历、调查或可靠消息获得情报" />;
  return <div className="intel-panel"><div className="intel-legend"><span>确定</span><span>推测</span><span>传闻</span><span>矛盾</span></div>{game.intelligence.map((intel) => <article key={intel.id} className={`intel-${intel.status}`}><header><small>{intel.subjectType} · {intel.status}</small><strong>{intel.title}</strong><b>{intel.confidence}%</b></header><p>{intel.detail}</p><footer><span>{intel.source}</span><span>{intel.acquiredAt} · {intel.freshness}</span></footer></article>)}</div>;
}

function ArchivePanel({ game }: { game: GameView }) {
  const archive = game.storyArchive;
  return <div className="archive-panel">
    <article className="chapter-card"><small>第 {game.chapter.number} 章</small><strong>{game.chapter.title}</strong><p>{archive.summary}</p></article>
    <h3 className="panel-title">连续性</h3><div className="continuity-grid">{archive.continuity.map((item) => <article key={item.label} className={`continuity-${item.status}`}><span>{item.label}</span><strong>{item.status}</strong><p>{item.detail}</p></article>)}</div>
    <h3 className="panel-title">还没解决</h3>{archive.openThreads.length ? <ul className="thread-list">{archive.openThreads.map((thread) => <li key={thread}>{thread}</li>)}</ul> : <p className="panel-copy">眼前没有挂着的线索。</p>}
    {archive.keyChoices.length > 0 && <><h3 className="panel-title">关键选择</h3><ol className="choice-ledger">{archive.keyChoices.map((choice, index) => <li key={`${choice}-${index}`}>{choice}</li>)}</ol></>}
    <h3 className="panel-title">最近留下的后果</h3>{archive.recentConsequences.length ? <div className="consequence-list">{archive.recentConsequences.map((item) => <article key={item.id} className={`consequence-${item.tone}`}><header><span>{item.date}</span><strong>{item.action}</strong></header><p>{item.result}</p></article>)}</div> : <p className="panel-copy">故事刚开始，还没有需要回头核对的后果。</p>}
  </div>;
}

function radialPoint(index: number, total: number, radius: number): { x: number; y: number } {
  const angle = -Math.PI / 2 + (Math.PI * 2 * index) / Math.max(1, total);
  return { x: 160 + Math.cos(angle) * radius, y: 155 + Math.sin(angle) * radius };
}

function HuntPanel({ game, submit, busy }: { game: GameView; submit: (value: string) => void; busy: boolean }) {
  const hunting: HuntingView | undefined = game.hunting;
  const rank = game.character?.soulRank ?? 0;
  const canHunt = rank > 0 && rank % 10 === 0 && (game.character?.soulRings.length ?? 0) < Math.floor(rank / 10);
  if (!hunting) return <div className="hunt-start"><p>{canHunt ? "魂力已经到达瓶颈，可以开始调查目标。" : `当前 ${rank} 级，达到下一个十级瓶颈后才能吸收魂环。`}</p><button type="button" disabled={busy || !canHunt} onClick={() => submit("开始调查适合当前武魂的魂兽")}>调查魂兽</button></div>;
  return <div className="hunt-panel">
    <div className="hunt-stage"><span>第 {hunting.ringIndex} 魂环</span><strong>{hunting.stage}</strong><small>{hunting.trailProgress}</small></div>
    {hunting.targetName && <article className="hunt-target"><span>目标</span><strong>{hunting.targetName}</strong>{hunting.targetYears && <small>约 {hunting.targetYears} 年</small>}</article>}
    {hunting.recommendations.map((item) => <article className="recommendation-card" key={item.beastId}><strong>{item.name}</strong><span>{item.estimatedYears} · {item.risk}</span><p>{item.fit}</p><small>{item.source}</small><button type="button" disabled={busy} onClick={() => submit(`选择${item.name}作为魂环目标`)}>选择</button></article>)}
    {hunting.preparation.length > 0 && <SimpleList title="准备" values={hunting.preparation} empty="" />}{hunting.absorptionRisk && <p className="risk-line">吸收风险：{hunting.absorptionRisk}</p>}{hunting.result && <p className="result-line">{hunting.result}</p>}
  </div>;
}

function WorldPanel({ game, submit, busy }: { game: GameView; submit: (value: string) => void; busy: boolean }) {
  return <div className="world-panel"><h3 className="panel-title">原作因果</h3>{game.canonInfluences.length ? <div className="causal-chain">{game.canonInfluences.map((cause, index) => <article key={cause.id}><i>{index + 1}</i><div><strong>{cause.action}</strong><span>{cause.affects} · {cause.strength}</span><small>{cause.date}</small></div></article>)}</div> : <article className="canon-stable"><strong>原作轨迹稳定</strong><p>主角还没有接触关键人物、势力或事件，原作节点不会自行改变。</p></article>}{game.managedFactions.length > 0 && <><h3 className="panel-title">掌管势力</h3><div className="managed-faction-list">{game.managedFactions.map((faction) => <article key={faction.id}><header><strong>{faction.name}</strong><span>{faction.role}</span></header><p>{faction.members} 人 · 资源 {faction.resources} · {faction.territory.join("、")}</p><small>{faction.departments.join("、")}；待处理：{faction.internalIssues.join("、") || "暂无"}</small></article>)}</div></>}{game.activeEvents.length > 0 && <><h3 className="panel-title">眼前事件</h3><div className="world-event-list">{game.activeEvents.map((event) => <article key={event.id}><header><span>{event.kind} · {event.remaining}</span><strong>{event.title}</strong></header><p>{event.detail}</p><small>{event.location}</small><div><button type="button" disabled={busy} onClick={() => submit(`调查${event.title}`)}>调查</button><button type="button" disabled={busy} onClick={() => submit(`帮助处理${event.title}`)}>介入</button><button type="button" disabled={busy} onClick={() => submit(`拒绝${event.title}`)}>拒绝</button></div></article>)}</div></>}<h3 className="panel-title">近日消息</h3>{game.news.length ? <div className="news-list">{game.news.map((item) => <article key={item.id}><span>{item.date}</span><strong>{item.title}</strong><p>{item.detail}</p></article>)}</div> : <p className="panel-copy">暂时没有传到角色耳中的大事。</p>}<h3 className="panel-title">已知人物</h3>{game.knownFigures.length ? <div className="figure-list">{game.knownFigures.map((figure) => <article key={figure.id}><header><strong>{figure.name}</strong><span>{figure.knownPower}</span></header><p>{figure.title ?? figure.faction ?? "身份不详"}</p><small>{figure.location} · {figure.status} · {figure.source} {figure.confidence}%</small></article>)}</div> : <p className="panel-copy">角色还没有接触到重要人物。</p>}</div>;
}

function EndingPanel({ game }: { game: GameView }) {
  const settlement = game.runProgress.settlement;
  return <section className="ending-panel"><p className="eyebrow">程序结算</p><h2>{settlement?.ending ?? game.runProgress.ending ?? "故事结束"}</h2>{settlement ? <><div className={`ending-score ${settlement.qualified ? "" : "unqualified"}`}><strong>{settlement.legacyPoints}</strong><span>{settlement.qualified ? "传承点" : "中止收益"}</span><small>{settlement.baseScore} × {settlement.multiplier.toFixed(2)}</small></div><ul>{settlement.highlights.map((item) => <li key={item}>{item}</li>)}</ul></> : <p>这一生已经结束，记录已写入存档。</p>}</section>;
}

function SimpleList({ title, values, empty }: { title: string; values: string[]; empty: string }) {
  return <div><h3 className="panel-title">{title}</h3>{values.length ? <ul className="simple-list">{values.map((value, index) => <li key={`${value}-${index}`}>{value}</li>)}</ul> : <LockedPanel text={empty} />}</div>;
}

function LockedPanel({ text }: { text: string }) {
  return <div className="locked-panel"><span>未显现</span><p>{text}</p></div>;
}
