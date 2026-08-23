import { useState } from "react";
import { DIFFICULTIES, type Difficulty, type GameEra, type Gender } from "../../shared/game";

interface SetupScreenProps {
  busy: boolean;
  onCreate: (input: {
    era: GameEra;
    gender: Gender;
    difficulty: Difficulty;
    seed?: string;
  }) => Promise<void>;
}

const DIFFICULTY_COPY: Record<Difficulty, string> = {
  爽: "低风险",
  简单: "较宽松",
  标准: "默认",
  困难: "高风险",
  地狱: "无兜底",
};

export function SetupScreen({ busy, onCreate }: SetupScreenProps) {
  const [era, setEra] = useState<GameEra>(1);
  const [gender, setGender] = useState<Gender>("男");
  const [difficulty, setDifficulty] = useState<Difficulty>("标准");
  const [seed, setSeed] = useState("");

  return (
    <main className="setup-page">
      <section className="intro-panel">
        <p className="eyebrow">斗罗同人世界 · 第 {era} 部时代</p>
        <h1>{era === 1 ? "武魂觉醒" : era === 2 ? "绝世唐门" : era === 3 ? "龙王传说" : "终极斗罗"}</h1>
        <p className="intro-copy">这里只决定性别和难度。身份抽出来以后，再按那个人的家庭、秘密和处境决定性格。</p>
      </section>

      <form
        className="setup-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (busy) return;
          void onCreate({
            era,
            gender,
            difficulty,
            seed: seed.trim() || undefined,
          });
        }}
      >
        <section className="form-section compact-section">
          <div className="section-heading"><h2>时代</h2></div>
          <div className="choice-row">
            {([1, 2, 3, 4] as const).map((value) => (
              <button key={value} type="button" className={era === value ? "choice active" : "choice"} onClick={() => setEra(value)}>
                斗{value === 1 ? "一" : value === 2 ? "二" : value === 3 ? "三" : "四"}
              </button>
            ))}
          </div>
        </section>
        <section className="form-section compact-section">
          <div className="section-heading">
            <h2>性别</h2>
          </div>
          <div className="choice-row">
            {(["男", "女"] as const).map((value) => (
              <button key={value} type="button" className={gender === value ? "choice active" : "choice"} onClick={() => setGender(value)}>
                {value}
              </button>
            ))}
          </div>
        </section>

        <section className="form-section">
          <div className="section-heading">
            <h2>难度</h2>
          </div>
          <div className="difficulty-grid">
            {DIFFICULTIES.map((value) => (
              <button key={value} type="button" className={difficulty === value ? "difficulty active" : "difficulty"} onClick={() => setDifficulty(value)}>
                <strong>{value}</strong><small>{DIFFICULTY_COPY[value]}</small>
              </button>
            ))}
          </div>
        </section>

        <details className="seed-details">
          <summary>随机种子</summary>
          <input className="text-field" value={seed} onChange={(event) => setSeed(event.target.value)} placeholder="留空随机；同一种子可复现" />
        </details>

        <button type="submit" className="primary-button create-button" disabled={busy}>
          {busy ? "抽取中…" : "抽取三名角色"}
        </button>
      </form>
    </main>
  );
}
