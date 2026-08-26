import { useEffect, useState } from "react";
import type { CheckpointSummary, DeepSeekSettingsView, GameView, SaveSummary } from "../shared/game";
import {
  awakenCharacter,
  addMapPin,
  changeSpeed,
  completeCharacterShaping,
  createCheckpoint,
  createGame,
  createEraSuccessor,
  deleteGame,
  endRun,
  listGames,
  loadGame,
  listCheckpoints,
  rerollCandidates,
  rerollCharacterShaping,
  removeMapPin,
  selectCandidate,
  selectLifeGoal,
  getDeepSeekSettings,
  rewriteLastAction,
  restoreCheckpoint,
  ActionStreamError,
  streamAction,
} from "./api";
import { CandidateScreen } from "./components/CandidateScreen";
import { CharacterShapingScreen } from "./components/CharacterShapingScreen";
import { MetaProgressionPanel } from "./components/MetaProgressionPanel";
import { LifeGoalScreen } from "./components/LifeGoalScreen";
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
  const [lastActionRequestId, setLastActionRequestId] = useState("");
  const [lastExplanation, setLastExplanation] = useState("");
  const [actionController, setActionController] = useState<AbortController | null>(null);
  const [checkpoints, setCheckpoints] = useState<CheckpointSummary[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<SaveSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState("");

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

  const runAction = async (input: string, retryRequestId?: string) => {
    if (!game) return;
    const requestId = retryRequestId || crypto.randomUUID();
    const controller = new AbortController();
    setActionController(controller);
    setBusy(true);
    setError("");
    setActionDraft("");
    setActionPhase("准备推演");
    setLastAction("");
    try {
      let nextGame: GameView | undefined;
      let finalError: unknown;
      for (let requestAttempt = 0; requestAttempt < 2 && !nextGame; requestAttempt += 1) {
        try {
          if (requestAttempt > 0) { setActionDraft(""); setActionPhase("故事正在重新续写"); }
          nextGame = await streamAction(game.id, input, requestId, (event) => {
            if (event.type === "phase") setActionPhase(event.label);
            if (event.type === "retry") { setActionDraft(""); setActionPhase(`故事正在重新续写 · ${event.attempt}`); }
            if (event.type === "draft") setActionDraft((draft) => draft ? `${draft}\n\n${event.text}` : event.text);
            if (event.type === "done") setLastExplanation(event.explanation);
          }, controller.signal);
        } catch (caught) {
          finalError = caught;
          if (caught instanceof DOMException && caught.name === "AbortError") throw caught;
          if (caught instanceof ActionStreamError && !caught.retryable) throw caught;
          if (requestAttempt >= 1) throw caught;
        }
      }
      if (!nextGame) throw finalError ?? new Error("续写失败");
      setGame(nextGame);
      setActionDraft("");
      setActionPhase("");
      setLastAction("");
      setLastActionRequestId("");
      await refreshSaves();
    } catch (caught) {
      setLastAction(input);
      setLastActionRequestId(requestId);
      if (caught instanceof DOMException && caught.name === "AbortError") setError("已经停笔。刚才的行动没有发生。");
      else setError("这段故事暂时没能续上，刚才的行动没有发生。");
    } finally {
      setBusy(false);
      setActionController(null);
    }
  };

  const confirmDeleteSave = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    setError("");
    try {
      await deleteGame(deleteTarget.id);
      setSaves((current) => current.filter((save) => save.id !== deleteTarget.id));
      setNotice(`已删除“${deleteTarget.characterName}”的存档`);
      setDeleteTarget(null);
      await refreshSaves();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "删除存档失败");
    } finally {
      setDeleting(false);
    }
  };

  const saveCard = (save: SaveSummary, index: number, legacy = false) => <article key={save.id} className={legacy ? "legacy-save" : ""}>
    <button type="button" onClick={() => void run(() => loadGame(save.id))}>
      <i>{legacy ? `旧版存档 ${index + 1}` : `存档 ${index + 1}`}</i><strong>{save.characterName}</strong><span>{save.location}</span><small>{new Date(save.updatedAt).toLocaleString("zh-CN")}</small>
    </button>
    <button type="button" className="delete-save" onClick={() => setDeleteTarget(save)}>删除</button>
  </article>;

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
      {notice && <div className="notice-banner"><span>{notice}</span><button type="button" onClick={() => setNotice("")}>×</button></div>}

      {!game && <>
        {saves.length > 0 && <section className="save-shelf">
          <div><h2>存档</h2></div>
          <div className="save-row">{saves.slice(0, 3).map((save, index) => saveCard(save, index))}</div>
        </section>}
        {saves.length > 3 && <details className="legacy-save-manager" open><summary>管理旧版遗留存档 <b>{saves.length - 3}</b></summary><p>旧版本没有限制存档数量。这些存档不会消失，但需要删至三个以内才能开始新人生。</p><div className="save-row">{saves.slice(3).map((save, index) => saveCard(save, index, true))}</div></details>}
        {saves.length < 3 ? <SetupScreen busy={busy} onCreate={(input) => run(() => createGame(input))} /> : <section className="save-limit"><strong>三个存档位都已使用</strong><p>删除一个旧存档后才能开始新人生。每个存档都会在行动提交和关键节点后自动保存。</p></section>}
      </>}

      {game?.status === "candidate_selection" && <CandidateScreen
        era={game.era}
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
        onReroll={() => run(() => rerollCharacterShaping(game.id, "personality", []))}
        onComplete={(input) => run(() => completeCharacterShaping(game.id, input))}
      />}

      {game?.status === "life_goal_selection" && game.shaping && game.character && <LifeGoalScreen
        game={game}
        shaping={game.shaping}
        busy={busy}
        onReroll={(lockedSlots) => run(() => rerollCharacterShaping(game.id, "goals", lockedSlots))}
        onComplete={(input) => run(() => selectLifeGoal(game.id, input))}
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
        onRetry={() => { if (lastAction) return runAction(lastAction, lastActionRequestId || undefined); }}
        onRewrite={() => run(() => rewriteLastAction(game.id))}
        onCreateCheckpoint={async () => { setCheckpoints(await createCheckpoint(game.id)); }}
        onRestoreCheckpoint={(checkpointId) => run(() => restoreCheckpoint(game.id, checkpointId))}
        onAction={runAction}
        onSpeed={(speed) => run(() => changeSpeed(game.id, speed))}
        onEnd={(reason) => run(() => endRun(game.id, reason))}
        onContinueEra={() => run(() => createEraSuccessor(game.id))}
        onMapPin={(input) => run(() => addMapPin(game.id, input))}
        onMapPinRemove={(pinId) => run(() => removeMapPin(game.id, pinId))}
      />}
    </div>
    {deleteTarget && <div className="dialog-backdrop" role="presentation"><section className="delete-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-save-title"><span>删除存档</span><h2 id="delete-save-title">{deleteTarget.characterName}</h2><p>这个人物、剧情进度和三个回溯节点都会被永久删除。</p><div><button type="button" disabled={deleting} onClick={() => setDeleteTarget(null)}>保留</button><button type="button" className="danger-button" disabled={deleting} onClick={() => void confirmDeleteSave()}>{deleting ? "删除中…" : "确认删除"}</button></div></section></div>}
    <MetaProgressionPanel open={metaOpen} onClose={() => setMetaOpen(false)} />
    <SettingsPanel open={settingsOpen} gameId={game?.id} onClose={() => setSettingsOpen(false)} onSaved={setAiSettings} />
  </>;
}
