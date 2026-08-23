import { useEffect, useState } from "react";
import type { Difficulty, GameView, Gender, PersonalitySetup, SaveSummary } from "../shared/game";
import {
  awakenCharacter,
  createGame,
  listGames,
  loadGame,
  rerollCandidates,
  selectCandidate,
  submitAction,
} from "./api";
import { CandidateScreen } from "./components/CandidateScreen";
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
          <button type="button" className="meta-nav-button" onClick={() => setMetaOpen(true)}>局外成长</button>
          <button type="button" onClick={() => setSettingsOpen(true)}>模型设置</button>
        </div>
      </nav>

      {error && <div className="error-banner"><span>{error}</span><button type="button" onClick={() => setError("")}>×</button></div>}

      {!game && <>
        {saves.length > 0 && <section className="save-shelf">
          <div><p className="eyebrow">本地书架</p><h2>继续未完的人生</h2></div>
          <div className="save-row">{saves.slice(0, 4).map((save) => <button type="button" key={save.id} onClick={() => void run(() => loadGame(save.id))}>
            <strong>{save.characterName}</strong><span>{save.location}</span><small>{new Date(save.updatedAt).toLocaleString("zh-CN")}</small>
          </button>)}</div>
        </section>}
        <SetupScreen busy={busy} onCreate={(input: { gender: Gender; difficulty: Difficulty; personality: PersonalitySetup; seed?: string }) => run(() => createGame(input))} />
      </>}

      {game?.status === "candidate_selection" && <CandidateScreen
        candidates={game.candidates}
        rerollIndex={game.rerollIndex}
        personalitySummary={game.personalitySummary}
        busy={busy}
        onReroll={() => run(() => rerollCandidates(game.id))}
        onSelect={(candidateId) => run(() => selectCandidate(game.id, candidateId))}
      />}

      {game && (game.status === "awakening" || game.status === "playing") && <StoryScreen
        game={game}
        busy={busy}
        onAwaken={() => run(() => awakenCharacter(game.id))}
        onAction={(input) => run(() => submitAction(game.id, input))}
      />}
    </div>
    <MetaProgressionPanel open={metaOpen} onClose={() => setMetaOpen(false)} />
    <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
  </>;
}
