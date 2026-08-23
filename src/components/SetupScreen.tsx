import { useMemo, useState } from "react";
import { DIFFICULTIES, type Difficulty, type Gender, type PersonalitySetup } from "../../shared/game";
import { PERSONALITY_QUESTIONS } from "../../shared/personality";

interface SetupScreenProps {
  busy: boolean;
  onCreate: (input: {
    gender: Gender;
    difficulty: Difficulty;
    personality: PersonalitySetup;
    seed?: string;
  }) => Promise<void>;
}

const DIFFICULTY_COPY: Record<Difficulty, string> = {
  爽: "信息清晰，失败更宽容",
  简单: "风险存在，准备更有效",
  标准: "接近原著式世界压力",
  困难: "情报更少，代价更重",
  地狱: "没有安全兜底",
};

export function SetupScreen({ busy, onCreate }: SetupScreenProps) {
  const [gender, setGender] = useState<Gender>("男");
  const [difficulty, setDifficulty] = useState<Difficulty>("标准");
  const [keywordText, setKeywordText] = useState("谨慎，重情，好学，坚韧，自由");
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
        <p className="eyebrow">第一部 · 武魂觉醒</p>
        <h1>你的故事，不在原著目录里</h1>
        <p className="intro-copy">
          选择的不是职业，而是一段尚未揭晓的命运。世界会记住行动，人物会在视线之外生活，
          而武魂要等你亲手走进觉醒阵后才会显现。
        </p>
        <div className="principle-strip">
          <span>第一人称小说</span>
          <span>自由输入</span>
          <span>因果结算</span>
          <span>本地存档</span>
        </div>
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
            seed: seed.trim() || undefined,
          });
        }}
      >
        <section className="form-section compact-section">
          <div className="section-heading">
            <span className="section-number">壹</span>
            <div><h2>留下最少的确定</h2><p>首版种族固定为人类，其他一切交给世界生成。</p></div>
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
            <span className="section-number">贰</span>
            <div><h2>选择世界的锋利程度</h2><p>难度不改变因果，只改变信息、资源与失败曲线。</p></div>
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
          <div className="section-heading">
            <span className="section-number">叁</span>
            <div><h2>写下性格的初稿</h2><p>填写 3–8 个关键词。它们会被实际行为持续修正。</p></div>
          </div>
          <input className="text-field" value={keywordText} onChange={(event) => setKeywordText(event.target.value)} placeholder="例如：谨慎，重情，好学，坚韧，自由" />
          <div className="keyword-preview">
            {keywords.map((keyword) => <span key={keyword}>{keyword}</span>)}
            <small>{keywords.length}/8</small>
          </div>
        </section>

        <section className="form-section">
          <div className="section-heading">
            <span className="section-number">肆</span>
            <div><h2>八个尚未发生的瞬间</h2><p>没有标准答案，只用于形成初始内心倾向。</p></div>
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
          <summary>固定命运种子（可选）</summary>
          <input className="text-field" value={seed} onChange={(event) => setSeed(event.target.value)} placeholder="留空则自动生成；相同种子可复现随机结果" />
        </details>

        <button type="submit" className="primary-button create-button" disabled={!ready || busy}>
          {busy ? "命运正在落笔…" : ready ? "生成三段人生" : `还需回答 ${PERSONALITY_QUESTIONS.length - Object.keys(answers).length} 道情境题`}
        </button>
      </form>
    </main>
  );
}
