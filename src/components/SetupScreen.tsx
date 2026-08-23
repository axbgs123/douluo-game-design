import { useMemo, useState } from "react";
import { DIFFICULTIES, type Difficulty, type Gender, type PersonalitySetup } from "../../shared/game";
import { PERSONALITY_QUESTIONS } from "../../shared/personality";

interface SetupScreenProps {
  busy: boolean;
  onCreate: (input: {
    gender: Gender;
    difficulty: Difficulty;
    personality: PersonalitySetup;
    lifeGoal?: string;
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
  const [keywordText, setKeywordText] = useState("谨慎，重情，好学，坚韧，自由");
  const [lifeGoal, setLifeGoal] = useState("成为自己认可的强者");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [seed, setSeed] = useState("");

  const keywords = useMemo(
    () => keywordText.split(/[，,、\s]+/).map((item) => item.trim()).filter(Boolean),
    [keywordText],
  );
  const ready = keywords.length >= 3
    && keywords.length <= 8
    && PERSONALITY_QUESTIONS.every((question) => answers[question.id]);

  return (
    <main className="setup-page">
      <section className="intro-panel">
        <p className="eyebrow">第一部</p>
        <h1>武魂觉醒</h1>
      </section>

      <form
        className="setup-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!ready || busy) return;
          void onCreate({
            gender,
            difficulty,
            personality: { keywords, answers },
            lifeGoal: lifeGoal.trim() || undefined,
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

        <section className="form-section">
          <div className="section-heading"><h2>人生目标</h2></div>
          <input className="text-field" value={lifeGoal} onChange={(event) => setLifeGoal(event.target.value)} maxLength={120} placeholder="成为强者、守护家人、建立宗门……" />
        </section>

        <section className="form-section">
          <div className="section-heading">
            <h2>性格关键词</h2>
          </div>
          <input className="text-field" value={keywordText} onChange={(event) => setKeywordText(event.target.value)} placeholder="谨慎，重情，好学……" />
          <div className="keyword-preview">
            {keywords.map((keyword) => <span key={keyword}>{keyword}</span>)}
            <small>{keywords.length}/8</small>
          </div>
        </section>

        <section className="form-section">
          <div className="section-heading">
            <h2>情境题</h2>
          </div>
          <div className="question-list">
            {PERSONALITY_QUESTIONS.map((question, index) => (
              <fieldset key={question.id} className="question-card">
                <legend><span>{String(index + 1).padStart(2, "0")}</span>{question.prompt}</legend>
                <div className="question-options">
                  {question.options.map((option) => (
                    <label key={option.id} className={answers[question.id] === option.id ? "option active" : "option"}>
                      <input
                        type="radio"
                        name={question.id}
                        value={option.id}
                        checked={answers[question.id] === option.id}
                        onChange={() => setAnswers((current) => ({ ...current, [question.id]: option.id }))}
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>
        </section>

        <details className="seed-details">
          <summary>随机种子</summary>
          <input className="text-field" value={seed} onChange={(event) => setSeed(event.target.value)} placeholder="留空随机；同一种子可复现" />
        </details>

        <button type="submit" className="primary-button create-button" disabled={!ready || busy}>
          {busy ? "生成中…" : ready ? "生成角色" : `还需回答 ${PERSONALITY_QUESTIONS.length - Object.keys(answers).length} 题`}
        </button>
      </form>
    </main>
  );
}
