import { useEffect, useMemo, useState } from "react";
import type { CandidatePublic, CharacterShapingView } from "../../shared/game";

interface CharacterShapingScreenProps {
  candidate: CandidatePublic;
  shaping: CharacterShapingView;
  busy: boolean;
  onReroll: (part: "goals" | "personality", lockedSlots?: number[]) => Promise<void>;
  onComplete: (input: { keywords: string[]; answers: Record<string, string>; lifeGoal: string }) => Promise<void>;
}

export function CharacterShapingScreen({ candidate, shaping, busy, onReroll, onComplete }: CharacterShapingScreenProps) {
  const [personalityId, setPersonalityId] = useState(shaping.personalityOptions[0]?.id ?? "");
  const [keywordText, setKeywordText] = useState(shaping.personalityOptions[0]?.keywords.join("，") ?? "");
  const [lifeGoal, setLifeGoal] = useState(shaping.lifeGoalOptions[0] ?? "");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [goalLocks, setGoalLocks] = useState<number[]>(shaping.goalLocks.map((locked, index) => locked ? index : -1).filter((index) => index >= 0));

  useEffect(() => {
    const first = shaping.personalityOptions[0];
    setPersonalityId(first?.id ?? "");
    setKeywordText(first?.keywords.join("，") ?? shaping.fixedTraits.join("，"));
    setAnswers({});
  }, [shaping.personalityRerollIndex]);

  useEffect(() => {
    setLifeGoal(shaping.lifeGoalOptions[0] ?? "");
  }, [shaping.goalRerollIndex]);

  const selectedPersonality = shaping.personalityOptions.find((option) => option.id === personalityId) ?? shaping.personalityOptions[0];
  const questions = selectedPersonality?.questions ?? [];
  const keywords = useMemo(() => keywordText.split(/[，,、\s]+/).map((item) => item.trim()).filter(Boolean), [keywordText]);
  const ready = lifeGoal.trim().length >= 6 && keywords.length >= 3 && keywords.length <= 8 && questions.every((question) => answers[question.id]);

  const choosePersonality = (id: string) => {
    const option = shaping.personalityOptions.find((item) => item.id === id);
    if (!option) return;
    setPersonalityId(id);
    setKeywordText(option.keywords.join("，"));
    setAnswers({});
  };

  return <main className="shaping-page">
    <header className="shaping-header">
      <p className="eyebrow">角色已选定</p>
      <h1>{candidate.name}</h1>
      <div className="shaping-identity"><strong>{candidate.originName}</strong><span>{candidate.selfKnowledge}</span><p>{candidate.knownBackground}</p></div>
    </header>

    <section className="shaping-section">
      <div className="shaping-title"><div><span>01</span><h2>人生目标</h2><p>三选一，可锁定栏位。每名角色有三次刷新机会。</p></div><button type="button" className="reroll-button" disabled={busy || shaping.goalRerollsUsed >= 3 || goalLocks.length === 3} onClick={() => void onReroll("goals", goalLocks)}>刷新未锁定目标 · {3 - shaping.goalRerollsUsed}/3</button></div>
      <div className="goal-draw-grid">{shaping.lifeGoalOptions.map((goal, index) => <article key={`${index}-${goal}`} className={goalLocks.includes(index) ? "goal-slot locked" : "goal-slot"}><button type="button" className={lifeGoal === goal ? "active" : ""} onClick={() => setLifeGoal(goal)}>{goal}</button><button type="button" className="goal-lock-button" onClick={() => setGoalLocks((current) => current.includes(index) ? current.filter((slot) => slot !== index) : [...current, index])}>{goalLocks.includes(index) ? "已锁定" : "锁定栏位"}</button></article>)}</div>
      <label className="custom-goal"><span>自定或修改</span><textarea value={lifeGoal} onChange={(event) => setLifeGoal(event.target.value)} maxLength={160} rows={3} /></label>
    </section>

    <section className="shaping-section">
      <div className="shaping-title"><div><span>02</span><h2>性格底色</h2><p>抽取结果可以包含善人、野心家或反派。身份烙印会保留，之后仍会被实际行动改变。</p></div><button type="button" className="reroll-button" disabled={busy} onClick={() => void onReroll("personality", [])}>重抽性格</button></div>
      {shaping.fixedTraits.length > 0 && <div className="locked-traits"><small>身份固定</small>{shaping.fixedTraits.map((trait) => <b key={trait}>{trait}</b>)}</div>}
      <div className="personality-draw-grid">{shaping.personalityOptions.map((option) => <button type="button" key={option.id} className={personalityId === option.id ? "active" : ""} onClick={() => choosePersonality(option.id)}><strong>{option.title}</strong><span>{option.keywords.join(" · ")}</span><p>{option.description}</p></button>)}</div>
      <label className="custom-goal"><span>性格关键词，可修改 3 至 8 个</span><input className="text-field" value={keywordText} onChange={(event) => setKeywordText(event.target.value)} /></label>
    </section>

    <section className="shaping-section">
      <div className="shaping-title"><div><span>03</span><h2>此人的选择</h2><p>题目取自当前身份和性格底色。换一个性格，面对的局面也会变。</p></div></div>
      <div className="question-list">{questions.map((question, index) => <fieldset key={question.id} className="question-card">
        <legend><span>{String(index + 1).padStart(2, "0")}</span>{question.prompt}</legend>
        <div className="question-options">{question.options.map((option) => <label key={option.id} className={answers[question.id] === option.id ? "option active" : "option"}><input type="radio" name={question.id} checked={answers[question.id] === option.id} onChange={() => setAnswers((current) => ({ ...current, [question.id]: option.id }))} />{option.label}</label>)}</div>
      </fieldset>)}</div>
    </section>

    <button type="button" className="primary-button shaping-submit" disabled={!ready || busy} onClick={() => void onComplete({ keywords, answers, lifeGoal: lifeGoal.trim() })}>
      {busy ? "写入角色…" : ready ? "确认性格，进入觉醒" : `还需完成 ${questions.filter((question) => !answers[question.id]).length} 道选择`}
    </button>
  </main>;
}
