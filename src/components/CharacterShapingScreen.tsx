import { useEffect, useMemo, useState } from "react";
import type { CandidatePublic, CharacterShapingView } from "../../shared/game";

interface CharacterShapingScreenProps {
  candidate: CandidatePublic;
  shaping: CharacterShapingView;
  busy: boolean;
  onReroll: () => Promise<void>;
  onComplete: (input: { personalityId: string; keywords: string[]; answers: Record<string, string> }) => Promise<void>;
}

export function CharacterShapingScreen({ candidate, shaping, busy, onReroll, onComplete }: CharacterShapingScreenProps) {
  const [personalityId, setPersonalityId] = useState(shaping.personalityOptions[0]?.id ?? "");
  const [keywordText, setKeywordText] = useState(shaping.personalityOptions[0]?.keywords.join("，") ?? "");
  const [answers, setAnswers] = useState<Record<string, string>>({});

  useEffect(() => {
    const first = shaping.personalityOptions[0];
    setPersonalityId(first?.id ?? "");
    setKeywordText(first?.keywords.join("，") ?? shaping.fixedTraits.join("，"));
    setAnswers({});
  }, [shaping.personalityRerollIndex]);

  const selectedPersonality = shaping.personalityOptions.find((option) => option.id === personalityId) ?? shaping.personalityOptions[0];
  const questions = selectedPersonality?.questions ?? [];
  const keywords = useMemo(() => keywordText.split(/[，,、\s]+/).map((item) => item.trim()).filter(Boolean), [keywordText]);
  const ready = keywords.length >= 3 && keywords.length <= 8 && questions.every((question) => answers[question.id]);

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
      <div className="shaping-title"><div><span>01</span><h2>性格底色</h2><p>抽取结果可以包含善人、野心家或反派。身份形成的倾向会保留，之后仍会被实际行动修正。</p></div><button type="button" className="reroll-button" disabled={busy} onClick={() => void onReroll()}>重抽性格</button></div>
      {shaping.fixedTraitEffects.length > 0 && <div className="fixed-trait-effects"><small>身份固定倾向</small>{shaping.fixedTraitEffects.map(({ trait, effect }) => <article key={trait}><b>{trait}</b><p>{effect}</p></article>)}</div>}
      <div className="personality-draw-grid">{shaping.personalityOptions.map((option) => <button type="button" key={option.id} className={personalityId === option.id ? "active" : ""} onClick={() => choosePersonality(option.id)}><strong>{option.title}</strong><span>{option.keywords.join(" · ")}</span><p>{option.description}</p></button>)}</div>
      <label className="custom-goal"><span>性格关键词，可修改 3 至 8 个</span><input className="text-field" value={keywordText} onChange={(event) => setKeywordText(event.target.value)} /></label>
    </section>

    <section className="shaping-section">
      <div className="shaping-title"><div><span>02</span><h2>此人的选择</h2><p>题目取自当前身份和性格底色。换一个性格，面对的局面也会变。</p></div></div>
      <div className="question-list">{questions.map((question, index) => <fieldset key={question.id} className="question-card">
        <legend><span>{String(index + 1).padStart(2, "0")}</span>{question.prompt}</legend>
        <div className="question-options">{question.options.map((option) => <label key={option.id} className={answers[question.id] === option.id ? "option active" : "option"}><input type="radio" name={question.id} checked={answers[question.id] === option.id} onChange={() => setAnswers((current) => ({ ...current, [question.id]: option.id }))} />{option.label}</label>)}</div>
      </fieldset>)}</div>
    </section>

    <button type="button" className="primary-button shaping-submit" disabled={!ready || busy} onClick={() => void onComplete({ personalityId, keywords, answers })}>
      {busy ? "写入角色…" : ready ? "确认性格，进入觉醒" : `还需完成 ${questions.filter((question) => !answers[question.id]).length} 道选择`}
    </button>
  </main>;
}
