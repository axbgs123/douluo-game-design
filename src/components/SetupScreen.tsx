import { useState } from "react";
import { DIFFICULTIES, type Difficulty, type Gender } from "../../shared/game";

interface SetupScreenProps {
  busy: boolean;
  onCreate: (input: {
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
  const [gender, setGender] = useState<Gender>("男");
  const [difficulty, setDifficulty] = useState<Difficulty>("标准");
  const [seed, setSeed] = useState("");

  return (
    <main className="setup-page">
      <section className="intro-panel">
        <p className="eyebrow">第一部</p>
        <h1>武魂觉醒</h1>
        <p className="intro-copy">这里只决定性别和难度。身份抽出来以后，再按那个人的家庭、秘密和处境决定性格。</p>
      </section>

      <form
        className="setup-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (busy) return;
          void onCreate({
            gender,
            difficulty,
            seed: seed.trim() || undefined,
          });
        }}
      >
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
