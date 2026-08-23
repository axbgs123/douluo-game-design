import { useEffect, useRef, useState } from "react";
import type { GameView } from "../../shared/game";

interface StoryScreenProps {
  game: GameView;
  busy: boolean;
  onAwaken: () => Promise<void>;
  onAction: (input: string) => Promise<void>;
}

type Panel = "人物" | "武魂" | "背包" | "关系" | "任务";

export function StoryScreen({ game, busy, onAwaken, onAction }: StoryScreenProps) {
  const [input, setInput] = useState("");
  const [panel, setPanel] = useState<Panel>("人物");
  const narrativeEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    narrativeEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [game.narrative.length]);

  const submit = (value: string) => {
    const action = value.trim();
    if (!action || busy) return;
    setInput("");
    void onAction(action);
  };

  return (
    <main className="game-shell">
      <header className="game-topbar">
        <div>
          <p className="eyebrow">{game.character ? `${game.character.name}的故事` : "武魂觉醒"}</p>
          <h1>{game.location}</h1>
        </div>
        <div className="world-clock">
          <span>{game.worldTime?.era}</span>
          <strong>第 {game.worldTime?.day ?? 1} 日 · {game.worldTime?.time ?? "08:00"}</strong>
        </div>
      </header>

      <div className="story-layout">
        <section className="story-column">
          <div className="chapter-rule"><span>卷一</span><i /><span>觉醒之日</span></div>
          <div className="narrative-stream" aria-live="polite">
            {game.narrative.map((entry) => (
              entry.kind === "player"
                ? <blockquote key={entry.id} className="player-entry">{entry.text}</blockquote>
                : entry.kind === "system"
                  ? <p key={entry.id} className="system-entry">{entry.text}</p>
                  : <article key={entry.id} className="prose-entry">
                      {entry.text.split("\n\n").map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                    </article>
            ))}
            <div ref={narrativeEnd} />
          </div>

          {game.status === "awakening" ? (
            <div className="awakening-action">
              <button className="primary-button" type="button" disabled={busy} onClick={() => void onAwaken()}>
                {busy ? "觉醒中…" : "觉醒武魂"}
              </button>
            </div>
          ) : (
            <div className="action-area">
              <div className="suggestion-list">
                {game.suggestions.map((suggestion, index) => (
                  <button type="button" key={`${suggestion}-${index}`} disabled={busy} onClick={() => submit(suggestion)}>
                    <span>{index + 1}</span>{suggestion}
                  </button>
                ))}
              </div>
              <form onSubmit={(event) => { event.preventDefault(); submit(input); }} className="action-form">
                <textarea
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder="输入行动或对话……"
                  rows={3}
                  disabled={busy}
                />
                <button className="send-button" type="submit" disabled={busy || !input.trim()}>{busy ? "推演中" : "行动"}</button>
              </form>
              <p className="action-hint">可自由输入</p>
            </div>
          )}
        </section>

        <aside className="side-panel">
          <nav className="panel-tabs">
            {(["人物", "武魂", "背包", "关系", "任务"] as Panel[]).map((item) => (
              <button key={item} type="button" className={panel === item ? "active" : ""} onClick={() => setPanel(item)}>{item}</button>
            ))}
          </nav>
          <div className="panel-content">
            {panel === "人物" && <CharacterPanel game={game} />}
            {panel === "武魂" && <SoulPanel game={game} />}
            {panel === "背包" && <SimpleList title="随身物品" values={game.inventory} empty="目前没有可用物品" />}
            {panel === "关系" && <RelationPanel game={game} />}
            {panel === "任务" && <TaskPanel game={game} />}
          </div>
          <footer className="panel-footer">
            <span>难度 · {game.difficulty}</span>
            <span>速度 · {game.speed}</span>
          </footer>
        </aside>
      </div>
    </main>
  );
}

function CharacterPanel({ game }: { game: GameView }) {
  if (!game.character) return <LockedPanel text="觉醒后显示" />;
  return <div className="detail-stack">
    <div className="identity-block"><small>姓名</small><strong>{game.character.name}</strong><span>{game.character.originName}</span></div>
    <dl className="stat-list">
      <div><dt>魂力</dt><dd>{game.character.soulRank} 级</dd></div>
      <div><dt>体魄</dt><dd>{game.character.abilityDescriptors.physique}</dd></div>
      <div><dt>精神</dt><dd>{game.character.abilityDescriptors.spirit}</dd></div>
      <div><dt>感知</dt><dd>{game.character.abilityDescriptors.perception}</dd></div>
    </dl>
    <div className="trait-cloud">{game.character.personalityTraits.map((trait) => <span key={trait}>{trait}</span>)}</div>
  </div>;
}

function SoulPanel({ game }: { game: GameView }) {
  if (!game.character) return <LockedPanel text="尚未觉醒" />;
  return <div className="detail-stack">
    <div className="identity-block"><small>{game.character.martialSoul.category}</small><strong>{game.character.martialSoul.name}</strong></div>
    <p className="panel-copy">{game.character.martialSoul.description}</p>
    <dl className="stat-list"><div><dt>先天魂力</dt><dd>{game.character.innateSoulPower} 级</dd></div><div><dt>魂环</dt><dd>尚未获得</dd></div></dl>
  </div>;
}

function RelationPanel({ game }: { game: GameView }) {
  if (!game.relations.length) return <LockedPanel text="暂无关系" />;
  return <div className="card-list">{game.relations.map((relation) => <article key={relation.name}><strong>{relation.name}</strong><span>{relation.relation}</span><p>{relation.impression}</p></article>)}</div>;
}

function TaskPanel({ game }: { game: GameView }) {
  if (!game.tasks.length) return <LockedPanel text="暂无记录" />;
  return <div className="card-list">{game.tasks.map((task) => <article key={task.title}><span>{task.kind}</span><strong>{task.title}</strong><p>{task.detail}</p></article>)}</div>;
}

function SimpleList({ title, values, empty }: { title: string; values: string[]; empty: string }) {
  return <div><h3 className="panel-title">{title}</h3>{values.length ? <ul className="simple-list">{values.map((value) => <li key={value}>{value}</li>)}</ul> : <LockedPanel text={empty} />}</div>;
}

function LockedPanel({ text }: { text: string }) {
  return <div className="locked-panel"><span>未显现</span><p>{text}</p></div>;
}
