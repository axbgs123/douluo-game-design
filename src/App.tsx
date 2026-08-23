import { useEffect, useState } from "react";
import type { CheckpointSummary, DeepSeekSettingsView, Difficulty, GameView, Gender, SaveSummary } from "../shared/game";
import {
  awakenCharacter,
  addMapPin,
  changeSpeed,
  completeCharacterShaping,
  createCheckpoint,
  createGame,
  deleteGame,
  endRun,
  listGames,
  loadGame,
  listCheckpoints,
  rerollCandidates,
  rerollCharacterShaping,
  removeMapPin,
  selectCandidate,
  getDeepSeekSettings,
  rewriteLastAction,
  restoreCheckpoint,
  streamAction,
} from "./api";
import { CandidateScreen } from "./components/CandidateScreen";
import { CharacterShapingScreen } from "./components/CharacterShapingScreen";
import { MetaProgressionPanel } from "./components/MetaProgressionPanel";
import { SettingsPanel } from "./components/SettingsPanel";
import { SetupScreen } from "./components/SetupScreen";
import { StoryScreen } from "./components/StoryScreen";

export default function App() {
  const [game, setGame] = useState<GameView | null>(null);
  const [saves, setSaves] = useState<SaveSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [metaOpen, setMetaOpen] = useState(false);
  const [aiSettings, setAiSettings] = useState<DeepSeekSettingsView | null>(null);
  const [actionPhase, setActionPhase] = useState("");
  const [actionDraft, setActionDraft] = useState("");
  const [lastAction, setLastAction] = useState("");
  const [lastExplanation, setLastExplanation] = useState("");
  const [actionController, setActionController] = useState<AbortController | null>(null);
  const [checkpoints, setCheckpoints] = useState<CheckpointSummary[]>([]);

  const refreshSaves = () => listGames().then(setSaves).catch(() => undefined);
  useEffect(() => { void refreshSaves(); void getDeepSeekSettings().then(setAiSettings).catch(() => undefined); }, []);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "auto" }));
    return () => window.cancelAnimationFrame(frame);
  }, [game?.status, game?.rerollIndex]);
  useEffect(() => { if (game?.id) void listCheckpoints(game.id).then(setCheckpoints).catch(() => setCheckpoints([])); else setCheckpoints([]); }, [game?.id, game?.narrative.length]);

  const run = async (operation: () => Promise<GameView>) => {
    setBusy(true);
    setError("");
    try {
      const nextGame = await operation();
      setGame(nextGame);
      await refreshSaves();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "发生未知错误");
    } finally {
      setBusy(false);
    }
  };

  const runAction = async (input: string) => {
    if (!game) return;
    const controller = new AbortController();
    setActionController(controller);
    setBusy(true);
    setError("");
    setActionDraft("");
    setActionPhase("准备推演");
    setLastAction("");
    try {
      const nextGame = await streamAction(game.id, input, (event) => {
        if (event.type === "phase") setActionPhase(event.label);
        if (event.type === "draft") setActionDraft((draft) => `${draft}${event.text}`);
        if (event.type === "done") setLastExplanation(event.explanation);
      }, controller.signal);
      setGame(nextGame);
      setActionDraft("");
      setActionPhase("");
      setLastAction("");
      await refreshSaves();
    } catch (caught) {
      setLastAction(input);
      if (caught instanceof DOMException && caught.name === "AbortError") setError("已取消。本次行动没有推进时间，也没有写入存档。");
      else setError(caught instanceof Error ? caught.message : "推演失败，本次行动未写入存档");
    } finally {
      setBusy(false);
      setActionController(null);
    }
  };

  return <>
    <div className="app-frame">
      <nav className="app-nav">
        <button type="button" className="brand" onClick={() => setGame(null)}><i>斗</i><span>未定之书<small>DOULUO TEXT RPG</small></span></button>
        <div className="nav-actions">
          {game && <button type="button" onClick={() => setGame(null)}>返回书架</button>}
          <button type="button" className="meta-nav-button" onClick={() => setMetaOpen(true)}><b>✦ 局外成长</b><small>传承与图鉴</small></button>
          <button type="button" onClick={() => setSettingsOpen(true)}>模型设置</button>
        </div>
      </nav>

      {error && <div className="error-banner"><span>{error}</span><button type="button" onClick={() => setError("")}>×</button></div>}

      {!game && <>
        {saves.length > 0 && <section className="save-shelf">
          <div><h2>存档</h2></div>
          <div className="save-row">{saves.slice(0, 3).map((save, index) => <article key={save.id}><button type="button" onClick={() => void run(() => loadGame(save.id))}>
            <i>存档 {index + 1}</i><strong>{save.characterName}</strong><span>{save.location}</span><small>{new Date(save.updatedAt).toLocaleString("zh-CN")}</small>
          </button><button type="button" className="delete-save" onClick={() => { if (window.confirm(`确定删除${save.characterName}的存档？此操作不能恢复。`)) void deleteGame(save.id).then(refreshSaves).catch((caught: Error) => setError(caught.message)); }}>删除</button></article>)}</div>
        </section>}
        {saves.length < 3 ? <SetupScreen busy={busy} onCreate={(input: { gender: Gender; difficulty: Difficulty; seed?: string }) => run(() => createGame(input))} /> : <section className="save-limit"><strong>三个存档位都已使用</strong><p>删除一个旧存档后才能开始新人生。每个存档都会在行动提交和关键节点后自动保存。</p></section>}
      </>}

      {game?.status === "candidate_selection" && <CandidateScreen
        candidates={game.candidates}
        birthProfileCount={game.birthProfileCount}
        rerollIndex={game.rerollIndex}
        busy={busy}
        candidateRerollsUsed={game.candidateRerollsUsed}
        candidatePaidRerolls={game.candidatePaidRerolls}
        onReroll={(lockedSlots) => run(() => rerollCandidates(game.id, lockedSlots))}
        onSelect={(candidateId, customName) => run(() => selectCandidate(game.id, candidateId, customName))}
      />}

      {game?.status === "character_shaping" && game.shaping && <CharacterShapingScreen
        candidate={game.candidates.find((candidate) => candidate.id === game.selectedCandidateId) ?? game.candidates[0]}
        shaping={game.shaping}
        busy={busy}
        onReroll={(part, lockedSlots) => run(() => rerollCharacterShaping(game.id, part, lockedSlots))}
        onComplete={(input) => run(() => completeCharacterShaping(game.id, input))}
      />}

      {game && (game.status === "awakening" || game.status === "playing" || game.status === "ended") && <StoryScreen
        game={game}
        busy={busy}
        onAwaken={() => run(() => awakenCharacter(game.id))}
        aiConnected={Boolean(aiSettings?.hasKey)}
        actionPhase={actionPhase}
        actionDraft={actionDraft}
        lastAction={lastAction}
        lastExplanation={lastExplanation}
        checkpoints={checkpoints}
        onOpenSettings={() => setSettingsOpen(true)}
        onCancelAction={() => actionController?.abort()}
        onRetry={() => { if (lastAction) return runAction(lastAction); }}
        onRewrite={() => run(() => rewriteLastAction(game.id))}
        onCreateCheckpoint={async () => { setCheckpoints(await createCheckpoint(game.id)); }}
        onRestoreCheckpoint={(checkpointId) => run(() => restoreCheckpoint(game.id, checkpointId))}
        onAction={runAction}
        onSpeed={(speed) => run(() => changeSpeed(game.id, speed))}
        onEnd={(reason) => run(() => endRun(game.id, reason))}
        onMapPin={(input) => run(() => addMapPin(game.id, input))}
        onMapPinRemove={(pinId) => run(() => removeMapPin(game.id, pinId))}
      />}
    </div>
    <MetaProgressionPanel open={metaOpen} onClose={() => setMetaOpen(false)} />
    <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} onSaved={setAiSettings} />
  </>;
}
