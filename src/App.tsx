import { useEffect, useState } from "react";
import type { Difficulty, GameView, Gender, SaveSummary } from "../shared/game";
import {
  awakenCharacter,
  addMapPin,
  changeSpeed,
  completeCharacterShaping,
  createGame,
  endRun,
  listGames,
  loadGame,
  rerollCandidates,
  rerollCharacterShaping,
  removeMapPin,
  selectCandidate,
  submitAction,
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

  const refreshSaves = () => listGames().then(setSaves).catch(() => undefined);
  useEffect(() => { void refreshSaves(); }, []);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "auto" }));
    return () => window.cancelAnimationFrame(frame);
  }, [game?.status, game?.rerollIndex]);

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
          <div className="save-row">{saves.slice(0, 4).map((save) => <button type="button" key={save.id} onClick={() => void run(() => loadGame(save.id))}>
            <strong>{save.characterName}</strong><span>{save.location}</span><small>{new Date(save.updatedAt).toLocaleString("zh-CN")}</small>
          </button>)}</div>
        </section>}
        <SetupScreen busy={busy} onCreate={(input: { gender: Gender; difficulty: Difficulty; seed?: string }) => run(() => createGame(input))} />
      </>}

      {game?.status === "candidate_selection" && <CandidateScreen
        candidates={game.candidates}
        birthProfileCount={game.birthProfileCount}
        rerollIndex={game.rerollIndex}
        busy={busy}
        onReroll={() => run(() => rerollCandidates(game.id))}
        onSelect={(candidateId, customName) => run(() => selectCandidate(game.id, candidateId, customName))}
      />}

      {game?.status === "character_shaping" && game.shaping && <CharacterShapingScreen
        candidate={game.candidates.find((candidate) => candidate.id === game.selectedCandidateId) ?? game.candidates[0]}
        shaping={game.shaping}
        busy={busy}
        onReroll={(part) => run(() => rerollCharacterShaping(game.id, part))}
        onComplete={(input) => run(() => completeCharacterShaping(game.id, input))}
      />}

      {game && (game.status === "awakening" || game.status === "playing" || game.status === "ended") && <StoryScreen
        game={game}
        busy={busy}
        onAwaken={() => run(() => awakenCharacter(game.id))}
        onAction={(input) => run(() => submitAction(game.id, input))}
        onSpeed={(speed) => run(() => changeSpeed(game.id, speed))}
        onEnd={(reason) => run(() => endRun(game.id, reason))}
        onMapPin={(input) => run(() => addMapPin(game.id, input))}
        onMapPinRemove={(pinId) => run(() => removeMapPin(game.id, pinId))}
      />}
    </div>
    <MetaProgressionPanel open={metaOpen} onClose={() => setMetaOpen(false)} />
    <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
  </>;
}
