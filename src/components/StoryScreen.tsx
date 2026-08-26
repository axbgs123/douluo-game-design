import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { CheckpointSummary, GameSpeed, GameView, HuntingView, MapLevel } from "../../shared/game";
import { formatSoulCoins } from "../../shared/currency";
import { worldMapPoint } from "../../shared/world-map";
import { DouluoWorldMap } from "./DouluoWorldMap";

interface StoryScreenProps {
  game: GameView;
  busy: boolean;
  aiConnected: boolean;
  actionPhase: string;
  actionDraft: string;
  lastAction: string;
  lastExplanation: string;
  checkpoints: CheckpointSummary[];
  onAwaken: () => Promise<void>;
  onAction: (input: string) => Promise<void>;
  onCancelAction: () => void;
  onRetry: () => Promise<void> | void;
  onRewrite: () => Promise<void> | void;
  onCreateCheckpoint: () => Promise<void> | void;
  onRestoreCheckpoint: (checkpointId: number) => Promise<void> | void;
  onOpenSettings: () => void;
  onSpeed: (speed: GameSpeed) => Promise<void>;
  onEnd: (reason?: string) => Promise<void>;
  onContinueEra: () => Promise<void> | void;
  onMapPin: (input: { label: string; x: number; y: number }) => Promise<void>;
  onMapPinRemove: (pinId: string) => Promise<void>;
}

type Panel = "人物" | "武魂" | "遗物" | "时代" | "背包" | "地图" | "关系" | "任务" | "情报" | "手记" | "猎魂" | "世界";
const PANELS: Panel[] = ["人物", "武魂", "遗物", "时代", "背包", "地图", "关系", "任务", "情报", "手记", "猎魂", "世界"];

function panelBadge(game: GameView, panel: Panel): string | undefined {
  if (panel === "人物" && game.character?.injuries.length) return String(game.character.injuries.length);
  if (panel === "关系" && game.relations.length > 2) return String(game.relations.length);
  if (panel === "任务") return String(game.tasks.filter((task) => task.status === "进行中").length || "");
  if (panel === "情报") return String(Math.min(9, game.intelligence.filter((item) => item.freshness === "新鲜").length) || "");
  if (panel === "手记" && game.storyArchive.openThreads.length) return String(Math.min(9, game.storyArchive.openThreads.length));
  if (panel === "猎魂" && game.hunting && game.hunting.stage !== "完成") return "!";
  if (panel === "遗物" && game.activeHeirloom?.status === "等待触发") return "!";
  if (panel === "世界" && (game.activeEvents.length || game.news.length)) return game.activeEvents.length ? "!" : String(Math.min(9, game.news.length));
  return undefined;
}

export function StoryScreen({ game, busy, aiConnected, actionPhase, actionDraft, lastAction, lastExplanation, checkpoints, onAwaken, onAction, onCancelAction, onRetry, onRewrite, onCreateCheckpoint, onRestoreCheckpoint, onOpenSettings, onSpeed, onEnd, onContinueEra, onMapPin, onMapPinRemove }: StoryScreenProps) {
  const [input, setInput] = useState("");
  const [panel, setPanel] = useState<Panel>("人物");
  const [confirmEnd, setConfirmEnd] = useState(false);
  const narrativeEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    narrativeEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [game.narrative.length]);

  const submit = (value: string) => {
    const action = value.trim();
    if (!action || busy || game.status === "ended") return;
    setInput("");
    void onAction(action);
  };

  return (
    <main className={`game-shell game-era-${game.era}`}>
      <header className="game-topbar">
        <div><p className="eyebrow">{game.character ? `${game.character.name}的故事` : "武魂觉醒"}</p><h1>{game.location}</h1></div>
        <div className="topbar-tools">
          <div className="speed-switch" aria-label="游戏速度">
            {(["标准", "高速"] as GameSpeed[]).map((speed) => <button key={speed} type="button" disabled={busy || game.status === "ended"} className={game.speed === speed ? "active" : ""} onClick={() => void onSpeed(speed)}>{speed}</button>)}
          </div>
          <div className="world-clock"><span>{game.character ? `${game.character.age} 岁` : game.worldTime?.era}</span><strong>{game.worldTime ? `${game.worldTime.season} · ${game.worldTime.era} · 第 ${game.worldTime.day} 日 · ${game.worldTime.time}` : "觉醒日前"}</strong></div>
        </div>
      </header>

      <div className="story-layout">
        <section className="story-column">
          <div className="chapter-rule"><span>第 {game.chapter.number} 章</span><i /><span>{game.status === "ended" ? "此生已定" : game.chapter.title}</span></div>
          {game.status === "playing" && game.chapterObjective && <section className="chapter-objective"><div><span>当前章节目标</span><strong>{game.chapterObjective.title}</strong><p>{game.chapterObjective.stakes}</p></div><ol>{game.chapterObjective.steps.map((step) => <li key={step.id} className={`objective-${step.status}`}><i>{step.status === "完成" ? "✓" : step.status === "进行中" ? "→" : "·"}</i>{step.text}</li>)}</ol></section>}
          <div className="narrative-stream" aria-live="polite">
            {game.narrative.map((entry) => entry.kind === "player"
              ? <blockquote key={entry.id} className="player-entry">{entry.text}</blockquote>
              : entry.kind === "system"
                ? <p key={entry.id} className="system-entry">{entry.text}</p>
                : <article key={entry.id} className="prose-entry">{entry.text.split("\n\n").map((paragraph, index) => <p key={`${entry.id}-${index}`}>{paragraph}</p>)}</article>)}
            {busy && actionPhase && <>
              {actionDraft && <article className="prose-entry draft-prose">{actionDraft.split("\n\n").map((paragraph, index) => <p key={`draft-${index}`}>{paragraph}</p>)}</article>}
              <div className="writing-indicator"><i /><span>{actionDraft ? "故事仍在继续……" : "故事正在续写……"}</span><button type="button" onClick={onCancelAction}>停笔</button></div>
            </>}
            <div ref={narrativeEnd} />
          </div>

          {game.status === "awakening" ? <div className="awakening-action"><button className="primary-button" type="button" disabled={busy} onClick={() => void onAwaken()}>{busy ? "觉醒中…" : "觉醒武魂"}</button></div>
            : game.status === "ended" ? <EndingPanel game={game} busy={busy} onContinueEra={onContinueEra} />
              : !aiConnected ? <div className="ai-required-card"><strong>连接 AI 后开始正文</strong><p>当前仍可查看角色、地图、资料和模型设置，但正式行动不会在无 AI 时推进。</p><button type="button" onClick={onOpenSettings}>设置模型</button></div>
                : <div className="action-area">
                    <div className="suggestion-list">{game.suggestions.map((suggestion, index) => <button type="button" key={`${suggestion}-${index}`} disabled={busy} onClick={() => submit(suggestion)}><span>{index + 1}</span>{suggestion}</button>)}</div>
                    <form onSubmit={(event) => { event.preventDefault(); submit(input); }} className="action-form"><textarea value={input} onChange={(event) => setInput(event.target.value)} placeholder="输入行动或对话……" rows={3} disabled={busy} /><button className="send-button" type="submit" disabled={busy || !input.trim()}>{busy ? "推演中" : "行动"}</button></form>
                    <div className="action-bottom-row"><span className="action-tools">{lastAction && !busy && <button type="button" onClick={() => void onRetry()}>重试未提交行动</button>} {!busy && game.narrative.some((entry) => entry.kind === "player") && <button type="button" onClick={() => void onRewrite()}>只重写正文</button>}<button type="button" disabled={busy} onClick={() => void onCreateCheckpoint()}>手动存档</button>{(lastExplanation || game.lastActionReceipt) && <details><summary>查看判定</summary>{game.lastActionReceipt ? <div className="action-receipt"><strong>{game.lastActionReceipt.intent}</strong><p>{game.lastActionReceipt.summary}</p><small>行动 {game.lastActionReceipt.actionIndex} · 世界时间推进 {game.lastActionReceipt.elapsedMinutes} 分钟 · 审校规则 {game.lastActionReceipt.appliedRuleIds.length} 条</small></div> : <p>{lastExplanation}</p>}</details>}{checkpoints.length > 0 && <details className="checkpoint-menu"><summary>回溯关键节点</summary><div><small>只保留最近三个节点；回溯会扣本局表现分。</small>{checkpoints.map((checkpoint) => <button type="button" key={checkpoint.id} disabled={busy} onClick={() => { if (window.confirm(`回溯到“${checkpoint.label}”会扣除本局表现分，并减少局外点数。继续吗？`)) void onRestoreCheckpoint(checkpoint.id); }}><strong>{checkpoint.label}</strong><small>行动 {checkpoint.actionIndex} · {new Date(checkpoint.createdAt).toLocaleString("zh-CN")}</small></button>)}</div></details>}</span>{!confirmEnd ? <button type="button" disabled={busy} onClick={() => setConfirmEnd(true)}>申请结算</button> : <span className="end-confirm"><small>结局类型、目标是否完成与收益均由当前存档数据判断。</small><button type="button" onClick={() => void onEnd()}>交给程序判定</button><button type="button" onClick={() => setConfirmEnd(false)}>取消</button></span>}</div>
                  </div>}
        </section>

        <aside className="side-panel">
          <nav className="panel-tabs">{PANELS.map((item) => { const badge = panelBadge(game, item); return <button key={item} type="button" className={panel === item ? "active" : ""} onClick={() => setPanel(item)}><span>{item}</span>{badge && <b>{badge}</b>}</button>; })}</nav>
          <div className="panel-content">
            {panel === "人物" && <CharacterPanel game={game} submit={submit} busy={busy} />}
            {panel === "武魂" && <SoulPanel game={game} submit={submit} busy={busy} />}
            {panel === "遗物" && <HeirloomPanel game={game} submit={submit} busy={busy} />}
            {panel === "时代" && <EraPanel game={game} submit={submit} busy={busy} />}
            {panel === "背包" && <InventoryPanel game={game} submit={submit} busy={busy} />}
            {panel === "地图" && <MapPanel game={game} submit={submit} busy={busy} onMapPin={onMapPin} onMapPinRemove={onMapPinRemove} />}
            {panel === "关系" && <RelationPanel game={game} submit={submit} busy={busy} />}
            {panel === "任务" && <><GrowthApplicationPanel game={game} submit={submit} busy={busy} /><InstitutionReviewerPanel game={game} submit={submit} busy={busy} /><TaskPanel game={game} /></>}
            {panel === "情报" && <IntelligencePanel game={game} />}
            {panel === "手记" && <><KnownRecordSearch game={game} /><ArchivePanel game={game} /></>}
            {panel === "猎魂" && <HuntPanel game={game} submit={submit} busy={busy} />}
            {panel === "世界" && <><MediaAccountabilityPanel game={game} submit={submit} busy={busy} /><ChronologyPanel game={game} submit={submit} busy={busy} /><WorldPanel game={game} submit={submit} busy={busy} /></>}
          </div>
          <footer className="panel-footer"><span>{game.difficulty}</span><span>{game.speed}</span></footer>
        </aside>
      </div>
    </main>
  );
}

function HeirloomPanel({ game, submit, busy }: { game: GameView; submit: (value: string) => void; busy: boolean }) {
  const heirloom = game.activeHeirloom;
  if (!heirloom) return <LockedPanel text="本局没有携带遗物。可在局外成长的遗物库中选择下一局携带的遗物。" />;
  return <div className="detail-stack heirloom-slot-panel">
    <article className={`heirloom-slot rarity-${heirloom.rarity}`}>
      <header><span>{heirloom.rarity}遗物</span><strong>{heirloom.name}</strong></header>
      <p>{heirloom.description}</p>
      <dl><div><dt>实际效果</dt><dd>{heirloom.effect}</dd></div><div><dt>触发条件</dt><dd>{heirloom.trigger}</dd></div><div><dt>本局次数</dt><dd>{heirloom.remainingUses}/{heirloom.maxUses}</dd></div></dl>
      {heirloom.actionCommand && <button type="button" disabled={busy || heirloom.remainingUses < 1} onClick={() => submit(heirloom.actionCommand!)}>{heirloom.remainingUses < 1 ? "本局次数耗尽" : heirloom.actionCommand}</button>}
    </article>
    <p className="panel-note">被动遗物会在条件满足时自动结算，直到本局次数耗尽；每次发动都会写入系统消息与判定记录。</p>
  </div>;
}

function EraActionButton({ busy, onClick, children }: { busy: boolean; onClick: () => void; children: ReactNode }) {
  return <button type="button" disabled={busy} onClick={onClick}>{children}</button>;
}

function EraPanel({ game, submit, busy }: { game: GameView; submit: (value: string) => void; busy: boolean }) {
  if (!game.character) return <LockedPanel text="觉醒后开放时代系统" />;
  const era = game.era ?? 1;
  const profession = game.professions.find((item) => item.name === "魂导器研究");
  const mechaDesignCareer = game.professions.find((item) => item.name === "机甲设计");
  const nextMechaLicense = ({ 无: "白级", 白级: "黄级", 黄级: "紫级", 紫级: "黑级", 黑级: "黑级" } as const)[game.mecha?.license ?? "无"];
  const nextStarshipLicense = ({ 无: "见习指挥", 见习指挥: "三级指挥", 三级指挥: "二级指挥", 二级指挥: "一级指挥", 一级指挥: "一级指挥" } as const)[game.starship?.license ?? "无"];
  const year = game.worldTime?.year ?? 0;
  const shrekAccess = game.affiliations.some((item) => /史莱克/.test(item.name));
  const soulSpiritStatus = year < 10_005 ? "前置理论期" : year < 10_012 && !shrekAccess ? "史莱克保密试验期" : year < 10_012 ? "史莱克内部试验资格" : "传灵塔试验开放期";
  const passengerDestination = game.map.find((location) => ["mother-ship-port", "tianluo-planet", "tiandou-planet", "senluo-planet", "elf-planet"].includes(location.id) && location.id !== game.locationId && location.travelMinutes > 0);

  return <div className="detail-stack era-system-panel" data-era={era}>
    <article className="era-system-intro"><small>第 {era} 部时代系统</small><strong>{era === 1 ? "魂师之路" : era === 2 ? "魂灵与魂导纪元" : era === 3 ? "斗铠与机甲纪元" : "星际探索纪元"}</strong><p>{era === 1 ? "从冥想、学院与猎魂建立自己的成长路线。" : era === 2 ? "技术进步有年份、机构、材料和认证门槛。" : era === 3 ? "斗铠必须与武魂适配，机甲驾驶必须逐级取得执照。" : "远航需要资格、可信船员、合规舰船和返航资源。"}</p></article>

    {era === 1 && <>
      <article className="special-system-card"><header><span>斗一核心</span><strong>修炼与猎魂</strong></header><p>当前魂力 {game.character.soulRank} 级；达到十级瓶颈后可开始完整猎魂流程。</p><div className="button-row"><EraActionButton busy={busy} onClick={() => submit("安静冥想修炼")}>冥想修炼</EraActionButton><EraActionButton busy={busy} onClick={() => submit("申请当地学院入学")}>申请入学</EraActionButton><EraActionButton busy={busy} onClick={() => submit("开始调查适合当前武魂的魂兽")}>调查魂兽</EraActionButton></div></article>
    </>}

    {era === 2 && <>
      <article className="special-system-card"><header><span>魂导器 · {profession?.level ?? "未入门"}</span><strong>核心阵法与实体制作</strong></header><p>熟练度 {profession?.progress ?? 0}% · 实验 {profession?.experiments ?? 0} · 失败 {profession?.failures ?? 0} · 方法 {profession?.knownMethods.length ?? 0}</p><div className="button-row"><EraActionButton busy={busy} onClick={() => submit("学习一级魂导器核心阵法")}>学习核心阵法</EraActionButton><EraActionButton busy={busy} onClick={() => submit("购买魂导器用稀有金属")}>购买稀有金属</EraActionButton><EraActionButton busy={busy} onClick={() => submit("购买魂导核心晶体")}>购买核心晶体</EraActionButton><EraActionButton busy={busy} onClick={() => submit("制作一级训练用魂导器")}>制作一级魂导器</EraActionButton></div></article>
      <article className="special-system-card"><header><span>魂灵 · {soulSpiritStatus}</span><strong>{game.soulSpiritContract ? `${game.soulSpiritContract.beastName}方案` : "尚未选定魂灵"}</strong></header><p>{game.soulSpiritContract ? `阶段 ${game.soulSpiritContract.stage} · 适配 ${game.soulSpiritContract.compatibility}% · 费用 ${formatSoulCoins(game.soulSpiritContract.cost)}` : year < 10_005 ? "只能研究残魂与契约假说，不能获得成熟魂灵。" : "申请仍受魂力瓶颈、机构资格、适配和费用约束。"}</p><div className="button-row"><EraActionButton busy={busy} onClick={() => submit(year < 10_005 ? "研究魂兽残魂与魂灵设想" : "申请一份适合当前魂环的正规魂灵")}>{year < 10_005 ? "研究魂灵假说" : "申请魂灵"}</EraActionButton>{game.soulSpiritContract && <><EraActionButton busy={busy} onClick={() => submit("评估魂灵适配")}>评估适配</EraActionButton><EraActionButton busy={busy} onClick={() => submit("签订魂灵契约")}>签订契约</EraActionButton></>}</div></article>
    </>}

    {era === 3 && <>
      <article className="special-system-card"><header><span>斗铠工程</span><strong>{game.battleArmorProject ? `${game.battleArmorProject.tier}字斗铠 · 下一件 ${game.battleArmorProject.nextPiece}` : "尚未建立斗铠工程"}</strong></header><p>{game.battleArmorProject ? `图纸 ${game.battleArmorProject.blueprintProgress}% · 适配 ${game.battleArmorProject.compatibility}% · 失败 ${game.battleArmorProject.failedPieces}` : `当前魂力 ${game.character.soulRank} 级；一字斗铠需要达到相应修为后逐件制作。`}</p><div className="button-row"><EraActionButton busy={busy} onClick={() => submit("继续设计一字斗铠并做武魂适配测试")}>设计一字斗铠</EraActionButton><EraActionButton busy={busy} onClick={() => submit("购买斗铠稀有金属")}>购买斗铠金属</EraActionButton>{game.battleArmorProject && <EraActionButton busy={busy} onClick={() => submit(`制作${game.battleArmorProject!.tier}字斗铠${game.battleArmorProject!.nextPiece}`)}>制作下一部件</EraActionButton>}</div></article>
      <article className="special-system-card"><header><span>机甲资质 · {game.mecha?.license ?? "无"}</span><strong>{game.mecha?.model ?? "尚无自有机甲"}</strong></header><p>模拟训练 {game.mecha?.simulatorProgress ?? 0}% · {game.mecha?.simulatorSessions ?? 0} 次 · 实操通过 {game.mecha?.practicalPasses ?? 0} 次</p>{game.mecha?.customDesign && <small>专属设计 · {game.mecha.customDesign.grade} · {game.mecha.customDesign.martialSoulName} · {game.mecha.customDesign.progress}% · {game.mecha.customDesign.specialistName}</small>}{game.mecha?.model && <small>{game.mecha.condition} · 能源 {game.mecha.energy}% · 所有者 {game.mecha.ownerName ?? "登记待核"}</small>}<div className="button-row"><EraActionButton busy={busy} onClick={() => submit("进行机甲模拟训练")}>机甲模拟</EraActionButton><EraActionButton busy={busy || game.mecha?.license === "黑级"} onClick={() => submit(`参加${nextMechaLicense}机甲驾驶考核`)}>资质考核</EraActionButton>{(game.mecha?.license === "紫级" || game.mecha?.license === "黑级") && !game.mecha?.model && <EraActionButton busy={busy} onClick={() => submit(`设计${game.mecha!.license}专属机甲`)}>专属设计</EraActionButton>}{game.mecha?.license !== "无" && !game.mecha?.model && <EraActionButton busy={busy} onClick={() => submit(`购买${game.mecha!.license}${game.mecha!.license === "紫级" || game.mecha!.license === "黑级" ? "专属" : "民用训练"}机甲`)}>购置机甲</EraActionButton>}{game.mecha?.model && <EraActionButton busy={busy} onClick={() => submit("驾驶机甲进行低速试驾")}>低速试驾</EraActionButton>}</div></article>
      <article className="special-system-card">
        <header><span>升灵台 · {game.spiritAscension?.status ?? "未预约"}</span><strong>{game.spiritAscension ? `${game.spiritAscension.mode ?? "常规"} · ${game.spiritAscension.tier} · ${game.spiritAscension.riskMode ?? "虚拟保护"} · 第 ${game.spiritAscension.totalEntries} 次` : "名额、费用与修为均需核验"}</strong></header>
        <p>遭遇 {game.spiritAscension?.encounters ?? 0} · 虚拟击败 {game.spiritAscension?.virtualDefeats ?? 0} · 灵力 {game.spiritAscension?.spiritualEnergy ?? 0} · 待吸收 {game.spiritAscension?.pendingSpiritualEnergy ?? 0} · 脑波冲击 {game.spiritAscension?.neuralShock ?? 0}%</p>
        {game.spiritAscensionMembership && <small>斗铠师登记 · {game.spiritAscensionMembership.registeredBattleArmorTier}字 · 已领福利年份 {game.spiritAscensionMembership.benefitYears.length} · 任务点 {game.spiritAscensionMembership.taskPoints ?? 0} · 授权证据 {game.spiritAscensionMembership.authorizationEvidence?.length ?? 0}</small>}
        {Boolean(game.spiritAscension?.companionNames?.length) && <small>同行 · {game.spiritAscension!.companionNames!.join("、")}</small>}
        {game.spiritAscension?.lastYearsGained !== undefined && <small>上次结算增加 {game.spiritAscension.lastYearsGained} 年 · 最佳 {game.spiritAscension.bestYearsGained} 年</small>}
        <div className="button-row">
          {(!game.spiritAscension || game.spiritAscension.status === "已结算") && <>
            <EraActionButton busy={busy} onClick={() => submit("申请初级升灵台名额")}>申请初级</EraActionButton>
            {game.inventory.includes("中级升灵台入门卡") && <EraActionButton busy={busy} onClick={() => submit("申请中级升灵台名额")}>申请中级</EraActionButton>}
            {game.spiritAscensionMembership && !game.inventory.includes("高级升灵台授权凭证") && <EraActionButton busy={busy} onClick={() => submit("申请高级升灵台授权凭证")}>申请高级授权</EraActionButton>}
            {game.inventory.includes("高级升灵台授权凭证") && <EraActionButton busy={busy} onClick={() => submit("申请高级升灵台名额并接受高级风险")}>申请高级</EraActionButton>}
            <EraActionButton busy={busy} onClick={() => submit("向传灵塔登记完整斗铠师并领取升灵台福利")}>登记斗铠师</EraActionButton>
          </>}
          {game.spiritAscension?.status === "已预约" && <EraActionButton busy={busy} onClick={() => submit(`进入${game.spiritAscension!.tier}升灵台`)}>进入升灵台</EraActionButton>}
          {game.spiritAscension?.status === "探索中" && <><EraActionButton busy={busy} onClick={() => submit("搜寻升灵台虚拟魂兽")}>搜寻魂兽</EraActionButton>{(game.spiritAscension.pendingSpiritualEnergy ?? 0) > 0 && <EraActionButton busy={busy} onClick={() => submit("守护队友百秒吸收升灵台灵力")}>百秒守护</EraActionButton>}<EraActionButton busy={busy} onClick={() => submit("按动求救信号主动退出升灵台")}>主动退出</EraActionButton></>}
          {game.spiritAscension?.status === "待结算" && <EraActionButton busy={busy} onClick={() => submit("结算升灵台灵力")}>结算灵力</EraActionButton>}
        </div>
      </article>
      <article className="special-system-card"><header><span>第二职业 · 机甲设计</span><strong>{mechaDesignCareer?.certifications?.at(-1) ?? mechaDesignCareer?.level ?? "未入门"}</strong></header><p>熟练度 {mechaDesignCareer?.progress ?? 0}% · 实训 {mechaDesignCareer?.experiments ?? 0} · 作品 {mechaDesignCareer?.portfolio?.length ?? 0} · 已验收委托 {mechaDesignCareer?.commissionsCompleted ?? 0}</p><div className="button-row"><EraActionButton busy={busy} onClick={() => submit("学习机甲设计师第二职业")}>设计实训</EraActionButton><EraActionButton busy={busy} onClick={() => submit("申请机甲设计师认证考核")}>职业认证</EraActionButton><EraActionButton busy={busy} onClick={() => submit("购买魂导器空白图纸")}>购买图纸</EraActionButton><EraActionButton busy={busy} onClick={() => submit("承接机甲设计师委托订单")}>承接委托</EraActionButton></div></article>
    </>}

    {era === 4 && <article className="special-system-card">
      <header><span>星舰资格 · {game.starship?.license ?? "无"}</span><strong>{game.starship?.shipName ?? "尚无登记星舰"}</strong></header>
      <p>指挥训练 {game.starship?.simulatorProgress ?? 0}% · 真实飞行 {game.starship?.loggedFlightHours ?? 0} 小时 · 船员 {game.starship?.crew.length ?? 0} · 舰桥协同 {game.starship?.crewCoordination ?? 0}% · 完成任务 {game.starship?.missionsCompleted ?? 0}</p>
      {game.starship?.fleetOnboarding && <small>入舰档案 · {game.starship.fleetOnboarding.status} · 培训 {game.starship.fleetOnboarding.trainingDays}/30 天{game.starship.fleetOnboarding.assignedDepartment ? ` · ${game.starship.fleetOnboarding.assignedDepartment} · ${game.starship.fleetOnboarding.assignedPost}` : ""}</small>}
      {game.starship?.shipName && <small>{game.starship.shipClass} · 舰体 {game.starship.hull}% · 燃料 {game.starship.fuel}% · 物资 {game.starship.supplies}%</small>}
      <div className="button-row">
        {passengerDestination && <EraActionButton busy={busy} onClick={() => submit(`购买船票并搭乘客运航班前往${passengerDestination.name}`)}>客运前往{passengerDestination.name}</EraActionButton>}
        <EraActionButton busy={busy} onClick={() => submit("向舰队参谋部述职")}>参谋部述职</EraActionButton>
        <EraActionButton busy={busy} onClick={() => submit("参加航线与指挥舰队培训")}>航线培训</EraActionButton>
        <EraActionButton busy={busy} onClick={() => submit("参加损管与动力培训")}>损管培训</EraActionButton>
        <EraActionButton busy={busy} onClick={() => submit("参加作战与登陆培训")}>作战培训</EraActionButton>
        <EraActionButton busy={busy} onClick={() => submit("参加军纪与保密培训")}>军纪培训</EraActionButton>
        <EraActionButton busy={busy} onClick={() => submit("申请参谋部岗位评估")}>参谋部分岗</EraActionButton>
        <EraActionButton busy={busy} onClick={() => submit("申请作战部岗位评估")}>作战部分岗</EraActionButton>
        <EraActionButton busy={busy} onClick={() => submit("进行星舰指挥模拟训练")}>舰桥模拟</EraActionButton>
        <EraActionButton busy={busy} onClick={() => submit("进行船员舰桥协同与损管演练")}>船员协同</EraActionButton>
        <EraActionButton busy={busy} onClick={() => submit("申请随舰训练航次")}>随舰航次</EraActionButton>
        <EraActionButton busy={busy || game.starship?.license === "一级指挥"} onClick={() => submit(`参加${nextStarshipLicense}考核`)}>指挥考核</EraActionButton>
        <EraActionButton busy={busy} onClick={() => submit("检查可信关系并招募驾驶员船员")}>招募驾驶员</EraActionButton>
        <EraActionButton busy={busy} onClick={() => submit("申请配发学院项目舰")}>申请项目舰</EraActionButton>
      </div>
    </article>}
  </div>;
}

function CharacterPanel({ game, submit, busy }: { game: GameView; submit: (value: string) => void; busy: boolean }) {
  if (!game.character) return <LockedPanel text="觉醒后显示" />;
  const character = game.character;
  return <div className="detail-stack">
    <div className="identity-block"><small>{character.age} 岁 · {character.gender}</small><strong>{character.name}</strong><span>{character.originName}</span></div>
    <dl className="stat-list">
      <div><dt>魂力</dt><dd>{character.soulRank} 级 · {character.cultivationProgress}</dd></div><div><dt>状态</dt><dd>{character.condition} · {character.fatigue}</dd></div>
      <div><dt>体魄</dt><dd>{character.abilityDescriptors.physique}</dd></div><div><dt>精神</dt><dd>{character.abilityDescriptors.spirit}</dd></div><div><dt>感知</dt><dd>{character.abilityDescriptors.perception}</dd></div>
      <div><dt>魂币</dt><dd>{formatSoulCoins(character.coins)}</dd></div><div><dt>名望</dt><dd>{character.reputation}</dd></div>
    </dl>
    {character.injuries.length > 0 && <SimpleList title="伤势" values={character.injuries} empty="" />}
    {game.economy.business && <p className="panel-copy"><strong>当代经营主体</strong> · {game.economy.business}</p>}
    <p className="panel-label">人生目标</p><p className="panel-copy">{game.lifeGoal}</p><small className="goal-verification-note">结算时由魂力、任务、关系、探索与真实历史影响共同验收。</small>
    {game.affiliations.length > 0 && <><p className="panel-label">身份</p><div className="affiliation-list">{game.affiliations.map((item) => <article key={item.id}><strong>{item.name}</strong><span>{item.militaryRank ? `${item.militaryRank} · ` : ""}{item.role} · {item.reputation}</span><small>{item.militaryRank ? `军功 ${item.militaryMerit ?? 0} · 真实飞行 ${item.flightHours ?? 0} 小时 · ` : ""}贡献 {item.contribution ?? 0} · 已验收事务 {item.completedAssignments ?? 0}</small>{item.institutionFactions?.map((faction) => <small key={faction.name}>派系 · {faction.name} · 影响 {faction.influence} · 信任 {faction.playerTrust}</small>)}{item.institutionPoliticalHistory?.at(-1) && <em>政治记录 · {item.institutionPoliticalHistory.at(-1)}</em>}<div className="button-row"><button type="button" disabled={busy} onClick={() => submit(`向${item.name}领取机构事务`)}>领任务</button><button type="button" disabled={busy} onClick={() => submit(`向${item.name}推进机构事务`)}>推进阶段</button><button type="button" disabled={busy} onClick={() => submit(`向${item.name}交付机构事务`)}>交付</button><button type="button" disabled={busy} onClick={() => submit(`向${item.name}申请晋升`)}>晋升</button></div></article>)}</div></>}
    {game.reputations.length > 0 && <><p className="panel-label">分地区名声</p><div className="reputation-list">{game.reputations.map((item) => <article key={`${item.scope}-${item.publicName}`}><strong>{item.publicName}</strong><span>{item.scope} · {item.reputation}</span><small>追查热度 {item.heat} · {item.source}</small>{item.publicName === character.name && /负面|怀疑|质疑/.test(item.reputation) && <div className="button-row"><button type="button" disabled={busy} onClick={() => submit("申请核验负面传闻")}>登记核验</button><button type="button" disabled={busy} onClick={() => submit("提交调查证据公开澄清负面传闻")}>提交更正</button></div>}</article>)}</div></>}
    {game.professions.length > 0 && <><p className="panel-label">技艺与研究</p><div className="profession-list">{game.professions.map((item) => <article key={item.id}><header><strong>{item.name}</strong><span>{item.certifications?.at(-1) ?? item.level}</span></header><progress max={100} value={item.progress} /><small>实验 {item.experiments} · 失败 {item.failures} · 已掌握 {item.knownMethods.length}{item.portfolio ? ` · 作品 ${item.portfolio.length} · 委托 ${item.commissionsCompleted ?? 0}` : ""}</small></article>)}</div></>}
    <div className="trait-cloud">{character.personalityTraits.map((trait) => <span key={trait}>{trait}</span>)}</div>
  </div>;
}

function SoulPanel({ game, submit, busy }: { game: GameView; submit: (value: string) => void; busy: boolean }) {
  if (!game.character) return <LockedPanel text="尚未觉醒" />;
  const character = game.character;
  const souls = character.martialSouls?.length ? character.martialSouls : [character.martialSoul];
  const nextMechaLicense = ({ 无: "白级", 白级: "黄级", 黄级: "紫级", 紫级: "黑级", 黑级: "黑级" } as const)[game.mecha?.license ?? "无"];
  const nextStarshipLicense = ({ 无: "见习指挥", 见习指挥: "三级指挥", 三级指挥: "二级指挥", 二级指挥: "一级指挥", 一级指挥: "一级指挥" } as const)[game.starship?.license ?? "无"];
  return <div className="detail-stack">
    {souls.map((soul, index) => { const rings = character.soulRingSets?.[index] ?? (index === (character.activeMartialSoulIndex ?? 0) ? character.soulRings : []); const active = index === (character.activeMartialSoulIndex ?? 0); return <section key={`${soul.name}-${index}`} className="soul-entry"><div className={`identity-block ${soul.rarity ? `soul-panel-${soul.rarity}` : ""} ${soul.grade ? `soul-grade-${soul.grade}` : ""}`}><small>{active ? "当前主修" : `第 ${index + 1} 武魂`} · {rings.length} 枚魂环 · {soul.rarity ? `${soul.rarity} · ` : ""}{soul.grade ? `潜质 ${soul.grade} · ` : ""}{soul.category}</small><strong>{soul.name}</strong></div><p className="panel-copy">{soul.description}</p>{!active && <button type="button" disabled={busy || Boolean(game.combat)} onClick={() => submit(`切换主修武魂为${soul.name}`)}>切换主修</button>}</section>; })}
    <dl className="stat-list"><div><dt>先天魂力</dt><dd>{character.innateSoulPower} 级</dd></div><div><dt>当前魂环</dt><dd>{character.soulRings.length} 枚</dd></div></dl>
    {character.revealedGift && <article className="gift-card"><span>已发现</span><strong>{character.revealedGift}</strong></article>}
    {character.specialSystem && <article className="special-system-card"><header><span>金手指 / 独立体系</span><strong>{character.specialSystem.name}</strong></header><p>{character.specialSystem.stage} · {character.specialSystem.progress}</p><div className="trait-cloud">{character.specialSystem.abilities.map((ability) => <span key={ability}>{ability}</span>)}</div><small>{character.specialSystem.resourceHint}</small>{character.specialSystem.actions?.length ? <div className="button-row">{character.specialSystem.actions.map((systemAction) => <button key={systemAction.command} type="button" disabled={busy} onClick={() => submit(systemAction.command)}>{systemAction.label}</button>)}</div> : null}</article>}
    {character.soulSpirits?.map((spirit) => <article className="special-system-card" key={spirit.id}><header><span>{spirit.grade}魂灵 · 羁绊 {spirit.bond}</span><strong>{spirit.name}</strong></header><p>{spirit.status} · {spirit.source}</p><div className="trait-cloud">{spirit.abilities.map((ability) => <span key={ability}>{ability}</span>)}</div></article>)}
    {character.battleArmors?.map((armor) => <article className="special-system-card" key={armor.tier}><header><span>{armor.status} · 适配 {armor.compatibility}%</span><strong>{armor.title}</strong></header><p>完成度 {armor.completion}% · 制作者 {armor.maker}</p><div className="trait-cloud">{armor.pieces.map((piece) => <span key={piece}>{piece}</span>)}</div></article>)}
    {game.battleArmorProject && <article className="special-system-card"><header><span>斗铠工程 · {game.battleArmorProject.tier} 字</span><strong>下一件：{game.battleArmorProject.nextPiece}</strong></header><p>图纸 {game.battleArmorProject.blueprintProgress}% · 适配 {game.battleArmorProject.compatibility}% · 失败 {game.battleArmorProject.failedPieces}</p><div className="button-row"><button type="button" disabled={busy} onClick={() => submit(`继续设计${game.battleArmorProject!.tier}字斗铠`)}>设计</button><button type="button" disabled={busy} onClick={() => submit(`制作${game.battleArmorProject!.tier}字斗铠${game.battleArmorProject!.nextPiece}`)}>制作</button></div></article>}
    {game.mecha && <article className="special-system-card"><header><span>机甲资质 · {game.mecha.license}</span><strong>{game.mecha.model ?? "尚无自有机甲"}</strong></header><p>模拟训练 {game.mecha.simulatorProgress}% · {game.mecha.simulatorSessions} 次 · 实操通过 {game.mecha.practicalPasses} 次</p>{game.mecha.model && <small>{game.mecha.condition} · 能源 {game.mecha.energy}%</small>}<div className="button-row"><button type="button" disabled={busy} onClick={() => submit("进行机甲模拟训练")}>训练</button><button type="button" disabled={busy || game.mecha.license === "黑级"} onClick={() => submit(`参加${nextMechaLicense}机甲驾驶考核`)}>考核</button></div></article>}
    {game.starship && <article className="special-system-card"><header><span>星舰资格 · {game.starship.license}</span><strong>{game.starship.shipName ?? "尚无自有星舰"}</strong></header><p>指挥训练 {game.starship.simulatorProgress}% · 船员 {game.starship.crew.length} · 任务 {game.starship.missionsCompleted}</p>{game.starship.shipName && <small>舰体 {game.starship.hull}% · 燃料 {game.starship.fuel}% · 物资 {game.starship.supplies}%</small>}<div className="trait-cloud">{game.starship.crew.map((member) => <span key={member.relationId}>{member.role} · {member.name}</span>)}</div><div className="button-row"><button type="button" disabled={busy} onClick={() => submit("进行星舰指挥模拟训练")}>训练</button><button type="button" disabled={busy || game.starship.license === "一级指挥"} onClick={() => submit(`参加${nextStarshipLicense}考核`)}>考核</button></div></article>}
    {game.soulSpiritContract && <article className="special-system-card"><header><span>魂灵方案 · {game.soulSpiritContract.stage}</span><strong>{game.soulSpiritContract.beastName} · {game.soulSpiritContract.years} 年</strong></header><p>适配度 {game.soulSpiritContract.compatibility}% · 费用 {formatSoulCoins(game.soulSpiritContract.cost)}</p><small>{game.soulSpiritContract.warning}</small><div className="button-row"><button type="button" disabled={busy} onClick={() => submit("评估魂灵适配")}>评估</button><button type="button" disabled={busy} onClick={() => submit("签订魂灵契约")}>签约</button><button type="button" disabled={busy} onClick={() => submit("放弃这份魂灵")}>放弃</button></div></article>}
    <div className="ring-list">{character.soulRings.map((ring) => <article key={ring.index}><i className={`ring-dot ring-${ring.color}`} /><div><strong>第 {ring.index} 环 · {ring.beastName}</strong><span>{ring.years} 年 · {ring.skillName}</span><p>{ring.skillDescription}</p></div></article>)}</div>
    {!character.soulRings.length && <LockedPanel text="达到瓶颈后可猎取魂环" />}
  </div>;
}

function InventoryPanel({ game, submit, busy }: { game: GameView; submit: (value: string) => void; busy: boolean }) {
  const transactions = game.economy.transactions.slice(-8).reverse();
  const marketReports = game.economy.marketReports.filter((report) => report.locationId === game.locationId).slice(-5);
  return <div><div className={`inventory-load load-${game.inventoryLoad.state}`}><strong>{game.inventoryLoad.used} / {game.inventoryLoad.capacity}</strong><span>随身负重 · {game.inventoryLoad.state}</span></div><h3 className="panel-title">随身物品</h3>{game.inventory.length ? <div className="inventory-grid">{game.inventory.map((value, index) => <article key={`${value}-${index}`}><i>{String(index + 1).padStart(2, "0")}</i><strong>{value}</strong><button type="button" disabled={busy || game.status === "ended"} onClick={() => submit(`使用${value}`)}>使用</button><button type="button" disabled={busy || game.status === "ended"} onClick={() => submit(`把${value}存放在住处`)}>存放</button></article>)}</div> : <LockedPanel text="背包是空的" />}{game.inventoryLoad.storage.length > 0 && <><h3 className="panel-title">住处与仓库</h3><div className="inventory-grid">{game.inventoryLoad.storage.map((value, index) => <article key={`${value}-stored-${index}`}><i>藏</i><strong>{value}</strong><button type="button" disabled={busy} onClick={() => submit(`从住处取回${value}`)}>取回</button></article>)}</div></>}<h3 className="panel-title">钱袋与账目</h3><dl className="stat-list"><div><dt>现金</dt><dd>{formatSoulCoins(game.economy.cash)}</dd></div><div><dt>存款</dt><dd>{formatSoulCoins(game.economy.bankBalance)}</dd></div><div><dt>债务</dt><dd>{formatSoulCoins(game.economy.debt)}</dd></div><div><dt>最近工钱</dt><dd>{formatSoulCoins(game.economy.salary)}</dd></div></dl>{transactions.length ? <div className="economy-ledger">{transactions.map((transaction) => <article key={transaction.id}><header><strong>{transaction.kind} · {formatSoulCoins(transaction.amount)}</strong><span>余额 {formatSoulCoins(transaction.balance)}</span></header><p>{transaction.counterparty} · {transaction.note}</p><small>{transaction.date}</small></article>)}</div> : <LockedPanel text="还没有收支流水" />}<h3 className="panel-title">本地市场</h3><div className="button-row"><button type="button" disabled={busy} onClick={() => submit("调查本地市场行情和供需")}>更新行情</button><button type="button" disabled={busy} onClick={() => submit("承接日用品运输合同")}>承接货运</button></div>{marketReports.length ? <div className="market-report-grid">{marketReports.map((report) => <article key={`${report.locationId}-${report.category}`}><header><strong>{report.category}</strong><span>价格 {report.priceIndex}</span></header><p>供应 {report.supply} · 需求 {report.demand}</p><small>{report.reason} · {report.updatedAt}</small></article>)}</div> : <LockedPanel text="尚未调查本地行情" />}</div>;
}

function MapPanel({ game, submit, busy, onMapPin, onMapPinRemove }: { game: GameView; submit: (value: string) => void; busy: boolean; onMapPin: (input: { label: string; x: number; y: number }) => Promise<void>; onMapPinRemove: (pinId: string) => Promise<void> }) {
  const [zoom, setZoom] = useState(1);
  const [level, setLevel] = useState<MapLevel>("大陆");
  const [expanded, setExpanded] = useState(false);
  const [pinLabel, setPinLabel] = useState("");
  const [pendingPoint, setPendingPoint] = useState<{ x: number; y: number }>();
  const [selectedLocationId, setSelectedLocationId] = useState<string>();
  const [selectedNodeId, setSelectedNodeId] = useState<string>();
  const visible = game.map;
  if (!visible.length) return <LockedPanel text="还没有地图信息" />;
  const current = visible.find((item) => item.current) ?? visible[0];
  const routes = visible.filter((item) => item.id !== current.id && item.travelMinutes >= 0);
  const markers = [
    { id: `current-${current.id}`, label: game.character?.name ?? "主角", detail: "当前位置", x: current.x, y: current.y, tone: "current" as const },
    ...visible.filter((item) => item.objective).map((item) => ({ id: `objective-${item.id}`, label: item.name, detail: item.objective, x: item.x, y: item.y, tone: "objective" as const, onClick: item.travelMinutes >= 0 ? () => submit(`前往${item.name}`) : undefined })),
  ];
  const levelNodes = game.mapHierarchy.nodes.filter((node) => node.level === level);
  const selectedLocation = visible.find((item) => item.id === selectedLocationId) ?? current;
  const selectedNode = levelNodes.find((node) => node.id === selectedNodeId) ?? levelNodes.find((node) => node.current) ?? levelNodes[0];
  const content = <div className={`map-panel-visual ${expanded ? "map-expanded" : ""}`}>
    <header className="map-panel-heading"><div><strong>{level === "大陆" ? "大陆行旅图" : level === "聚居地" ? "聚居地详图" : "建筑内部图"}</strong><span>地图只显示角色已知信息；道路与边界为游戏化示意</span></div><button type="button" onClick={() => setExpanded((value) => !value)}>{expanded ? "收起地图" : "展开地图"}</button></header>
    <nav className="map-level-tabs">{(["大陆", "聚居地", "建筑"] as MapLevel[]).map((item) => <button type="button" key={item} className={level === item ? "active" : ""} onClick={() => { setLevel(item); setSelectedNodeId(undefined); }}>{item === "大陆" ? game.mapHierarchy.continentName : item === "聚居地" ? game.mapHierarchy.settlementName : game.mapHierarchy.buildingName}</button>)}</nav>
    {level !== "大陆" ? <div className={`local-map local-map-${level}`}><svg viewBox="0 0 100 100" role="img" aria-label={`${level}地图`}>
      <defs><pattern id={`local-grid-${level}`} width="5" height="5" patternUnits="userSpaceOnUse"><path d="M5 0H0V5" fill="none" stroke="#8b7140" strokeWidth=".18" opacity=".18" /></pattern></defs>
      <rect x="2" y="2" width="96" height="96" rx="3" className="local-ground" />
      <rect x="2" y="2" width="96" height="96" rx="3" fill={`url(#local-grid-${level})`} />
      {level === "聚居地" ? <><path d="M5 82 C25 74 31 60 48 55 S76 45 95 50 M12 92 C34 78 59 82 91 70 M48 6 C47 23 54 35 48 55" className="local-road main" /><path d="M6 18 C28 23 42 18 60 12" className="local-water" /><g className="local-blocks"><path d="M18 31h18v13H18zM58 18h22v15H58zM65 58h20v14H65zM20 63h16v12H20z" /></g></> : <><path d="M50 96 V74 M12 55 H88 M50 12 V88" className="local-road main" /><g className="local-rooms"><path d="M8 8H45V48H8ZM55 8H92V48H55ZM8 61H45V92H8ZM55 61H92V92H55Z" /></g></>}
      {levelNodes.map((node) => <g key={node.id} data-map-control transform={`translate(${node.x} ${node.y})`} onClick={() => setSelectedNodeId(node.id)} className={`${node.current ? "local-node current" : node.objective ? "local-node objective" : "local-node"} ${selectedNode?.id === node.id ? "selected" : ""}`}><circle r={node.current ? 4.8 : 3.5} /><text y="-6" textAnchor="middle">{node.name}</text><title>{node.description} · {node.source} · 可信度 {node.confidence}%</title></g>)}
    </svg>{selectedNode && <article className="local-selection"><header><strong>{selectedNode.name}</strong><span>{selectedNode.current ? "当前位置" : selectedNode.kind}</span></header><p>{selectedNode.description}</p><footer><small>{selectedNode.source} · 可信度 {selectedNode.confidence}%</small>{!selectedNode.current && <button type="button" disabled={busy || game.status === "ended"} onClick={() => submit(`前往${selectedNode.name}`)}>前往此处</button>}</footer></article>}<div className="local-map-list">{levelNodes.map((node) => <button type="button" key={node.id} className={selectedNode?.id === node.id ? "active" : ""} onClick={() => setSelectedNodeId(node.id)}><strong>{node.name}</strong><span>{node.current ? "当前位置" : node.kind}</span></button>)}</div></div> : <>
    <div className="map-tools"><div><button type="button" onClick={() => setZoom((value) => Math.max(1, value - .25))}>−</button><span>{Math.round(zoom * 100)}%</span><button type="button" onClick={() => setZoom((value) => Math.min(2.5, value + .25))}>＋</button></div><small>输入名称后点击地图即可标点</small></div>
    <DouluoWorldMap
      era={game.era}
      zoom={zoom}
      landmarks={visible.map((location) => ({ ...worldMapPoint(location.id), name: location.name, muted: !location.discovered && !location.current }))}
      markers={markers}
      pins={game.mapPins}
      onLandmarkClick={setSelectedLocationId}
      onCanvasClick={!busy ? (x, y) => setPendingPoint({ x, y }) : undefined}
      onPinRemove={busy ? undefined : (pinId) => void onMapPinRemove(pinId)}
    />
    <div className="map-pin-form"><input value={pinLabel} maxLength={24} onChange={(event) => setPinLabel(event.target.value)} placeholder="标点名称，如：可疑洞口" /><button type="button" disabled={busy || !pinLabel.trim()} onClick={() => { const point = pendingPoint ?? { x: current.x, y: current.y }; void onMapPin({ label: pinLabel.trim(), ...point }); setPinLabel(""); setPendingPoint(undefined); }}>保存标点</button><span>{pendingPoint ? `已选地图坐标 ${pendingPoint.x.toFixed(1)}, ${pendingPoint.y.toFixed(1)}` : game.mapPins.length ? "点地图选位置；点击已有标点可删除" : "点地图选位置；未选择时标在当前位置"}</span></div>
    {game.mapPins.length > 0 && <div className="saved-pin-list">{game.mapPins.map((pin) => <article key={pin.id}><span>⌖</span><strong>{pin.label}</strong><small>{pin.x.toFixed(1)}, {pin.y.toFixed(1)}</small><button type="button" disabled={busy} onClick={() => void onMapPinRemove(pin.id)}>删除</button></article>)}</div>}
    <article className="map-current-detail"><header><strong>{selectedLocation.name}</strong>{!selectedLocation.current && selectedLocation.travelMinutes >= 0 && <button type="button" disabled={busy || game.status === "ended"} onClick={() => submit(`前往${selectedLocation.name}`)}>前往</button>}</header><p>{selectedLocation.description}</p><span>{selectedLocation.source}地点 · {selectedLocation.region} · 危险 {selectedLocation.danger}{selectedLocation.current ? " · 当前所在地" : selectedLocation.travelMinutes >= 0 ? ` · 游戏估算约 ${Math.max(1, Math.ceil(selectedLocation.travelMinutes / 60))} 小时` : " · 尚无可靠直达路线"}</span></article>
    <div className="map-route-list"><h4>可直接前往</h4>{routes.length ? routes.map((location) => <button type="button" key={location.id} disabled={busy || game.status === "ended"} onClick={() => submit(`前往${location.name}`)}><strong>{location.name}</strong><span>游戏估算 {Math.max(1, Math.ceil(location.travelMinutes / 60))} 小时 · {location.danger}</span></button>) : <p>当前没有确认过的直达路线。</p>}</div>
    </>}
  </div>;
  return expanded ? createPortal(content, document.body) : content;
}

function RelationPanel({ game, submit, busy }: { game: GameView; submit: (value: string) => void; busy: boolean }) {
  if (!game.relations.length && !game.npcRelations.length && !game.family.partner && !game.family.children.length) return <LockedPanel text="暂无关系" />;
  const shown = game.relations.slice(0, 8);
  return <div className="relation-panel"><div className="relation-graph">
    <svg viewBox="0 0 320 310" aria-hidden="true">{shown.map((relation, index) => { const point = radialPoint(index, shown.length, 116); return <line key={relation.id ?? `${relation.name}-${index}`} className={`edge-${relation.category ?? "其他"}`} x1="160" y1="155" x2={point.x} y2={point.y} strokeWidth={Math.max(1.2, Math.min(4, (relation.strength ?? 12) / 22))} />; })}</svg>
    <div className="relation-center"><small>主角</small><strong>{game.character?.name}</strong></div>
    {shown.map((relation, index) => { const point = radialPoint(index, shown.length, 116); return <article key={relation.id ?? `${relation.name}-${index}`} className={`relation-node relation-${relation.category ?? "其他"}`} style={{ left: `${point.x / 3.2}%`, top: `${point.y / 3.1}%` }} title={relation.impression}><small>{relation.relation}</small><strong>{relation.name}</strong><span>{relation.faction ?? relation.impression}</span></article>; })}
  </div><div className="relation-legend"><span>亲属</span><span>师友</span><span>势力</span><span>敌对</span></div>{game.relations.length > shown.length && <p className="panel-copy">另有 {game.relations.length - shown.length} 段次要关系，关系增强后会进入主图。</p>}
  <h3 className="panel-title">关系明细</h3><div className="player-relation-ledger">{shown.map((relation) => <article key={`detail-${relation.id ?? relation.name}`}><header><strong>{relation.name}</strong><span>{relation.lifeStage ?? relation.relation}</span></header><p>{relation.impression}</p><small>亲近 {relation.dimensions?.closeness ?? relation.strength ?? 0} · 信任 {relation.dimensions?.trust ?? relation.strength ?? 0} · 敬重 {relation.dimensions?.respect ?? 0} · 戒备 {relation.dimensions?.vigilance ?? 0} · 仇恨 {relation.dimensions?.hostility ?? 0}</small>{relation.consentEvidence?.length ? <em>双方同意记录 {relation.consentEvidence.length} 条</em> : null}{relation.history?.at(-1) && <em>{relation.history.at(-1)!.date}：{relation.history.at(-1)!.reason}</em>} {!(["亲属", "敌对", "势力"] as Array<string | undefined>).includes(relation.category) && <div><button type="button" disabled={busy} onClick={() => submit(`确认与${relation.name}成为朋友`)}>确认友情</button>{!game.family.partner && <button type="button" disabled={busy} onClick={() => submit(`与${relation.name}讨论长期关系`)}>讨论关系</button>}{relation.partnerDiscussedAtOrdinal !== undefined && !game.family.partner && <button type="button" disabled={busy} onClick={() => submit(`询问${relation.name}是否愿意成为伴侣`)}>确认伴侣</button>}{game.family.partner?.name === relation.name && game.family.partner.status === "伴侣" && <><button type="button" disabled={busy} onClick={() => submit(`与${relation.name}讨论婚姻`)}>讨论婚姻</button>{relation.marriageDiscussedAtOrdinal !== undefined && <button type="button" disabled={busy} onClick={() => submit(`与${relation.name}登记结婚`)}>登记婚姻</button>}</>}</div>}</article>)}</div>
  {(game.family.partner || game.family.children.length > 0 || game.family.familyPlan) && <><h3 className="panel-title">家庭档案</h3><div className="player-relation-ledger">{game.family.partner && <article><header><strong>{game.family.partner.name}</strong><span>{game.family.partner.status}</span></header><p>{game.family.partner.establishedAt}</p><small>双方同意证据 {game.family.partner.consentEvidence.length} 条</small>{game.family.partner.status === "配偶" && !game.family.familyPlan && <button type="button" disabled={busy} onClick={() => submit(`与${game.family.partner!.name}讨论组建家庭`)}>讨论家庭计划</button>}</article>}{game.family.familyPlan && <article><header><strong>共同家庭计划</strong><span>{game.family.familyPlan.preparedAtOrdinal ? "准备完成" : "准备中"}</span></header><p>{game.family.familyPlan.agreedAt}</p><small>现实证据 {game.family.familyPlan.evidence.length} 条</small>{!game.family.familyPlan.preparedAtOrdinal && <button type="button" disabled={busy} onClick={() => submit("准备共同家庭住所")}>完成准备</button>}</article>}{game.family.children.map((child) => <article key={child.id}><header><strong>{child.name}</strong><span>{child.route}</span></header><p>{child.parentNames.join("、")}</p><small>{child.joinedAt} · 不附带战力继承</small></article>)}</div></>}
  {game.npcRelations.length > 0 && <><h3 className="panel-title">人物之间</h3><div className="npc-relation-ledger">{game.npcRelations.map((relation) => <article key={relation.id}><header><strong>{relation.leftName} — {relation.rightName}</strong><span>{relation.kind}</span></header><p>{relation.reason}</p><small>{relation.date} · 信任 {relation.dimensions.trust} · 戒备 {relation.dimensions.vigilance} · 利益 {relation.dimensions.sharedInterest}</small></article>)}</div></>}
  </div>;
}

function InstitutionReviewerPanel({ game, submit, busy }: { game: GameView; submit: (value: string) => void; busy: boolean }) {
  const assignments = game.tasks.filter((task) => task.status === "进行中" && task.institutionAssignment?.reviewer);
  if (!assignments.length) return null;
  return <div className="player-relation-ledger">{assignments.map((task) => {
    const chain = task.institutionAssignment!;
    const reviewers = [chain.reviewer!, ...(chain.counterReviewer ? [chain.counterReviewer] : [])];
    return <Fragment key={`${task.id}-reviewers`}>
      {reviewers.map((reviewer, index) => <article key={`${task.id}-reviewer-${reviewer.name}`}><header><strong>{reviewer.name}</strong><span>{index === 0 ? "主审" : "独立复核"} · {reviewer.role}</span></header><p>{reviewer.stance}</p>{reviewer.factionName && <small>派系 · {reviewer.factionName}</small>}<small>信任 {reviewer.trust} · 异议 {reviewer.objections} · 会谈 {reviewer.meetings}</small>{reviewer.evidence.at(-1) && <em>{reviewer.evidence.at(-1)}</em>}<button type="button" disabled={busy} onClick={() => submit(`询问${reviewer.name}当前验收异议`)}>询问异议</button></article>)}
      {chain.factions && <article key={`${task.id}-factions`}><header><strong>机构内部复核</strong><span>{chain.conflictStatus ?? "未触发"}</span></header>{chain.factions.map((faction) => <p key={faction.name}>{faction.name} · 影响 {faction.influence} · 玩家信任 {faction.playerTrust} · {faction.priority}</p>)}{chain.playerAlignment && <small>已采纳 · {chain.playerAlignment}</small>}{chain.resolutionEvidence?.at(-1) && <em>{chain.resolutionEvidence.at(-1)}</em>}{chain.conflictStatus === "待复核" && <div><button type="button" disabled={busy} onClick={() => submit("提交共同复核协调方案")}>共同协调</button>{chain.factions.map((faction) => <button key={faction.name} type="button" disabled={busy} onClick={() => submit(`支持${faction.name}处理机构复核冲突`)}>支持{faction.name}</button>)}</div>}</article>}
    </Fragment>;
  })}</div>;
}

function GrowthApplicationPanel({ game, submit, busy }: { game: GameView; submit: (value: string) => void; busy: boolean }) {
  const academy = game.academyApplication;
  const life = game.academyLife;
  const mentor = game.mentorPursuit;
  if (!academy && !life && !mentor) return null;
  return <section className="player-relation-ledger growth-application-panel">
    {academy && <article><header><strong>{academy.academyName}</strong><span>入学选择 · {academy.stage}</span></header><p>{academy.route} · {academy.fundingType} · 费用 {formatSoulCoins(academy.fee)}{academy.assessmentRequired ? ` · ${academy.admissionAssessmentName}要求 ${academy.passScore}分${academy.examScore !== undefined ? ` · 当前 ${academy.examScore}` : ""}` : ` · ${academy.admissionAssessmentName}`}</p><small>谁来承担费用 · {academy.fundingSource}</small><small>需要做到 · {academy.obligations.join("；")}</small><small>{academy.requirements.join("；")}</small>{academy.evidence.at(-1) && <em>{academy.evidence.at(-1)}</em>}<div className="button-row">{academy.stage === "材料准备" && <>{academy.availableFundingOptions.filter((item) => item !== academy.fundingType).map((item) => <button type="button" key={item} disabled={busy} onClick={() => submit(`改走${item}路线`)}>改走{item}</button>)}<button type="button" disabled={busy} onClick={() => submit(`准备${academy.academyName}需要的证明`)}>交上证明</button></>}{academy.stage === "入学考核" && <button type="button" disabled={busy} onClick={() => submit(`参加${academy.academyName}${academy.admissionAssessmentName}`)}>{academy.admissionAssessmentName}</button>}{academy.stage === "待报到" && <button type="button" disabled={busy} onClick={() => submit(`接受${academy.academyName}入学安排`)}>进入学院</button>}</div></article>}
    {life && <article><header><strong>{life.className}</strong><span>{life.periodLabel} · {life.stage}</span></header><p>{life.teacherRole} · {life.teacherName} · {life.dormitory}</p><small>课程 {life.courseProgress} · 同辈互动 {life.peerInteractions} · 实践 {life.practicalProgress} · 费用约定 {life.fundingDutyProgress}{life.assessmentScore !== undefined && game.era !== 1 ? ` · ${life.assessmentName} ${life.assessmentScore}` : ""}</small>{life.evidence.at(-1) && <em>{life.evidence.at(-1)}</em>}<div className="button-row">{life.stage === "入学安顿" && <button type="button" disabled={busy} onClick={() => submit(life.arrivalAction)}>安顿下来</button>}{["共同学习", "同辈磨合"].includes(life.stage) && <button type="button" disabled={busy} onClick={() => submit("参加下一堂魂师基础课程")}>参加课程</button>}{life.stage === "阶段考核" && <button type="button" disabled={busy} onClick={() => submit(`参加${life.assessmentName}`)}>{life.assessmentName}</button>}{academy && academy.fundingType === "工读抵扣" && life.fundingDutyProgress < 1 && <button type="button" disabled={busy} onClick={() => submit("完成一次适龄工读劳动")}>完成工读</button>}{academy && academy.fundingType === "学院奖助" && life.fundingDutyProgress < 1 && <button type="button" disabled={busy} onClick={() => submit("说明近期成绩与训练情况")}>说明近况</button>}{academy && academy.fundingType === "宗门委培" && life.fundingDutyProgress < 1 && <button type="button" disabled={busy} onClick={() => submit("向宗门说明近期培养情况")}>告知宗门</button>}</div><div className="academy-peer-list">{life.peers.map((peer) => <section key={peer.id}><strong>{peer.name} · {peer.role}</strong><span>态度 {peer.attitude} · 竞争 {peer.competition} · 互动 {peer.interactions}</span><p>{peer.background}；{peer.motive}</p><small>{peer.lastAction}</small><button type="button" disabled={busy} onClick={() => submit(`与${peer.name}完成一次小组练习`)}>共同练习</button></section>)}</div></article>}
    {mentor && <article><header><strong>{mentor.mentorName}</strong><span>导师候选 · {mentor.stage}</span></header><p>{mentor.qualification}</p><small>专长 · {mentor.specialty}</small><small>教学 · {mentor.teachingStyle}</small><small>禁忌 · {mentor.taboo}</small><small>资源 · {mentor.resourceOffer}</small><small>学生责任 · {mentor.reciprocalDuty}</small><small>{mentor.motive}</small><small>{mentor.requirements.join("；")}</small>{mentor.evidence.at(-1) && <em>{mentor.evidence.at(-1)}</em>}<div className="button-row">{mentor.stage === "候选接触" && <button type="button" disabled={busy} onClick={() => submit(`请${mentor.mentorName}评估公开武魂与现有基础`)}>接受评估</button>}{["能力评估", "试学考察"].includes(mentor.stage) && <button type="button" disabled={busy} onClick={() => submit(`完成${mentor.mentorName}试学训练`)}>完成试学</button>}{mentor.stage === "待决定" && <button type="button" disabled={busy} onClick={() => submit(`与${mentor.mentorName}谈清责任后正式拜师`)}>正式拜师</button>}{mentor.stage === "已拜师" && <><button type="button" disabled={busy} onClick={() => submit(`完成${mentor.mentorName}下一节正式课程`)}>导师课程</button><button type="button" disabled={busy} onClick={() => submit(`请${mentor.mentorName}评估第一魂环路线`)}>评估魂环</button></>}</div></article>}
  </section>;
}

function TaskPanel({ game }: { game: GameView }) {
  if (!game.tasks.length) return <LockedPanel text="暂无记录" />;
  return <div className="task-timeline">{game.tasks.map((task, index) => { const destination = task.destinationId ? game.map.find((location) => location.id === task.destinationId)?.name : undefined; return <article key={task.id ?? `${task.title}-${index}`} className={`task-${task.status ?? "进行中"}`}><i>{task.status === "完成" ? "✓" : task.status === "失败" ? "×" : index + 1}</i><div><span>{task.kind} · {task.status ?? "进行中"}</span><strong>{task.title}</strong><p>{task.detail}</p>{task.institutionAssignment && <small>阶段 · {task.institutionAssignment.stageIndex}/{task.institutionAssignment.stages.length} · {task.institutionAssignment.route}{task.institutionAssignment.specialization ? ` · ${task.institutionAssignment.specialization}分支` : ""}</small>}{task.institutionAssignment?.conflictStatus && <small>双复核 · {task.institutionAssignment.conflictStatus}{task.institutionAssignment.playerAlignment ? ` · 采纳${task.institutionAssignment.playerAlignment}` : ""}</small>}{task.institutionAssignment?.risk && <small>失败代价 · {task.institutionAssignment.risk}</small>}{destination && <small>目的地 · {destination}</small>}{task.deadline && <small>{task.deadline}</small>}{task.progressEvidence?.length ? <small>履约依据 · {task.progressEvidence.at(-1)}</small> : null}</div></article>; })}</div>;
}

function IntelligencePanel({ game }: { game: GameView }) {
  if (!game.intelligence.length) return <LockedPanel text="还没有通过亲历、调查或可靠消息获得情报" />;
  return <div className="intel-panel"><div className="intel-legend"><span>确定</span><span>推测</span><span>传闻</span><span>矛盾</span></div>{game.intelligence.map((intel) => <article key={intel.id} className={`intel-${intel.status}`}><header><small>{intel.subjectType} · {intel.status}</small><strong>{intel.title}</strong><b>{intel.confidence}%</b></header><p>{intel.detail}</p><footer><span>{intel.source}</span><span>{intel.acquiredAt} · {intel.freshness}</span></footer></article>)}</div>;
}

function KnownRecordSearch({ game }: { game: GameView }) {
  const [query, setQuery] = useState("");
  const records = [
    ...game.intelligence.map((item) => ({ kind: `情报 · ${item.status}`, title: item.title, detail: `${item.detail} · 来源：${item.source}` })),
    ...game.news.map((item) => ({ kind: "世界消息", title: item.title, detail: `${item.detail} · ${item.date}` })),
    ...game.tasks.map((item) => ({ kind: `任务 · ${item.status ?? "进行中"}`, title: item.title, detail: item.detail })),
    ...game.relations.map((item) => ({ kind: `关系 · ${item.relation}`, title: item.name, detail: `${item.impression} · ${item.history?.at(-1)?.reason ?? "暂无后续记录"}` })),
    ...game.storyArchive.openThreads.map((item) => ({ kind: "未解线索", title: item, detail: "来自故事手记" })),
    ...game.storyArchive.keyChoices.map((item) => ({ kind: "关键选择", title: item, detail: "来自故事手记" })),
  ];
  const normalized = query.trim().toLocaleLowerCase("zh-CN");
  const matches = normalized ? records.filter((item) => `${item.kind}${item.title}${item.detail}`.toLocaleLowerCase("zh-CN").includes(normalized)).slice(0, 30) : [];
  return <section className="detail-stack known-record-search"><h3 className="panel-title">已知档案检索</h3><input aria-label="搜索已知档案" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索已知档案……" />{normalized && <div className="player-relation-ledger">{matches.length ? matches.map((item, index) => <article key={`${item.kind}-${item.title}-${index}`}><header><strong>{item.title}</strong><span>{item.kind}</span></header><p>{item.detail}</p></article>) : <p className="panel-copy">当前角色已知档案中没有匹配记录；搜索不会泄露隐藏人物或未来事件。</p>}</div>}</section>;
}

function ArchivePanel({ game }: { game: GameView }) {
  const archive = game.storyArchive;
  const arcStages = ["立局", "主动推进", "阻力显形", "局势扩大", "阶段兑现", "不可逆转折"];
  return <div className="archive-panel">
    <article className="chapter-card"><small>第 {game.chapter.number} 章</small><strong>{game.chapter.title}</strong><p>{archive.summary}</p></article>
    {game.storyArc && <section className="story-arc-card">
      <header><div><small>第 {game.storyArc.arcNumber} 卷 · {game.storyArc.arcType}主线</small><h3>{game.storyArc.title}</h3></div><strong>{game.storyArc.stage}</strong></header>
      <div className="story-arc-stages">{arcStages.map((stage, index) => <span key={stage} className={index < game.storyArc!.stageIndex ? "done" : index === game.storyArc!.stageIndex ? "active" : ""}>{index + 1}. {stage}</span>)}</div>
      {game.storyArc.earlyGrowthPhase && <article className="story-gate-card"><small>早期成长卷 · 当前生活阶段</small><strong>{game.storyArc.earlyGrowthPhase}</strong><p>{game.storyArc.centralGoal}</p>{game.storyArc.earlyGrowthEvidence?.at(-1) && <em>{game.storyArc.earlyGrowthEvidence.at(-1)}</em>}</article>}
      <div className="story-arc-pressure"><label><span>剧情压力</span><b>{game.storyArc.pressure}/100</b></label><i style={{ width: `${game.storyArc.pressure}%` }} /></div>
      <dl><div><dt>本卷目标</dt><dd>{game.storyArc.centralGoal}</dd></div><div><dt>核心冲突</dt><dd>{game.storyArc.centralConflict}</dd></div><div><dt>对抗压力</dt><dd>{game.storyArc.opposingForce}</dd></div><div><dt>下一项兑现</dt><dd>{game.storyArc.promisedPayoff}</dd></div><div><dt>不可逆转折</dt><dd>{game.storyArc.irreversibleTurn}</dd></div><div><dt>失败代价</dt><dd>{game.storyArc.stakes}</dd></div></dl>
      {game.storyArc.stageGates[game.storyArc.stageIndex + 1] && <article className="story-gate-card"><small>进入下一阶段还缺什么</small><strong>{game.storyArc.stageGates[game.storyArc.stageIndex + 1].stage}</strong><p>{game.storyArc.stageGates[game.storyArc.stageIndex + 1].requirement}</p></article>}
      <div className="story-payoff-list">{game.storyArc.payoffLedger.map((item) => <article key={item.id} className={`payoff-${item.status}`}><span>{item.status}</span><strong>{item.label}</strong>{item.evidence.at(-1) && <small>{item.evidence.at(-1)}</small>}</article>)}</div>
      {game.storyArc.npcScenes.find((scene) => scene.status === "等待回应") && (() => { const scene = game.storyArc!.npcScenes.find((item) => item.status === "等待回应")!; return <article className="npc-initiative-card"><small>{scene.role} · 主动找来</small><strong>{scene.npcName}</strong><p>{scene.motive}</p><em>{scene.action}</em></article>; })()}
      {game.storyArc.sideThreads.length > 0 && <details><summary>自主支线 · {game.storyArc.sideThreads.length}</summary><ul>{game.storyArc.sideThreads.slice(0, 8).map((item) => <li key={item.taskId}>{item.title} · {item.status}</li>)}</ul></details>}
      {game.storyArc.evidence.length > 0 && <details><summary>主线剧情证据 · {game.storyArc.evidence.length}</summary><ul>{game.storyArc.evidence.slice(-6).map((item) => <li key={item}>{item}</li>)}</ul></details>}
    </section>}
    {archive.localConsequences.length > 0 && <section className="local-consequence-list"><h3 className="panel-title">正在改变当地生活</h3>{archive.localConsequences.map((item) => <article key={item.id}><header><strong>{item.kind}</strong><span>影响 {item.magnitude}/5 · 约剩 {item.remainingDays} 日</span></header><p>{item.summary}</p></article>)}</section>}
    <h3 className="panel-title">连续性</h3><div className="continuity-grid">{archive.continuity.map((item) => <article key={item.label} className={`continuity-${item.status}`}><span>{item.label}</span><strong>{item.status}</strong><p>{item.detail}</p></article>)}</div>
    <h3 className="panel-title">还没解决</h3>{archive.openThreads.length ? <ul className="thread-list">{archive.openThreads.map((thread) => <li key={thread}>{thread}</li>)}</ul> : <p className="panel-copy">眼前没有挂着的线索。</p>}
    {archive.keyChoices.length > 0 && <><h3 className="panel-title">关键选择</h3><ol className="choice-ledger">{archive.keyChoices.map((choice, index) => <li key={`${choice}-${index}`}>{choice}</li>)}</ol></>}
    <h3 className="panel-title">最近留下的后果</h3>{archive.recentConsequences.length ? <div className="consequence-list">{archive.recentConsequences.map((item) => <article key={item.id} className={`consequence-${item.tone}`}><header><span>{item.date}</span><strong>{item.action}</strong></header><p>{item.result}</p></article>)}</div> : <p className="panel-copy">故事刚开始，还没有需要回头核对的后果。</p>}
  </div>;
}

function radialPoint(index: number, total: number, radius: number): { x: number; y: number } {
  const angle = -Math.PI / 2 + (Math.PI * 2 * index) / Math.max(1, total);
  return { x: 160 + Math.cos(angle) * radius, y: 155 + Math.sin(angle) * radius };
}

function HuntPanel({ game, submit, busy }: { game: GameView; submit: (value: string) => void; busy: boolean }) {
  const hunting: HuntingView | undefined = game.hunting;
  const rank = game.character?.soulRank ?? 0;
  const combatSceneAlt = ({ 1: "古老魂兽森林中的石质战斗场", 2: "魂导技术初兴时代的学院训练场", 3: "魂导都市与机甲远景下的战斗平台", 4: "星际舰队训练甲板与行星远景" } as const)[game.era];
  const canHunt = rank > 0 && (game.character?.soulRings.length ?? 0) < Math.floor(rank / 10);
  if (!hunting) return <div className="hunt-start"><p>{canHunt ? "魂力已经到达瓶颈，可以开始调查目标。" : `当前 ${rank} 级，达到下一个十级瓶颈后才能吸收魂环。`}</p><button type="button" disabled={busy || !canHunt} onClick={() => submit("开始调查适合当前武魂的魂兽")}>调查魂兽</button></div>;
  return <div className="hunt-panel">
    {game.combat && (game.combat.allies?.length ?? 0) >= 4 && <div className="button-row">
      {(game.combat.allies?.length ?? 0) >= 7 ? <button type="button" disabled={busy} onClick={() => submit("让七名互补岗位同伴准备七星全域战阵")}>准备七人战阵</button>
        : (game.combat.allies?.length ?? 0) >= 6 ? <button type="button" disabled={busy} onClick={() => submit("让六名互补岗位同伴准备六芒轮转阵")}>准备六人战阵</button>
          : (game.combat.allies?.length ?? 0) >= 5 ? <button type="button" disabled={busy} onClick={() => submit("让五名互补岗位同伴准备五环协战阵")}>准备五人战阵</button>
            : <button type="button" disabled={busy} onClick={() => submit("让四名互补岗位同伴准备四人阵型")}>准备四人编队</button>}
    </div>}
    {game.comboTrainings.length > 0 && <div className="player-relation-ledger">{game.comboTrainings.map((training) => <article key={training.id}><header><strong>{training.name}</strong><span>{training.mastery}%{training.branch ? ` · ${training.branch}` : ""}</span></header><p>{training.companionNames.join(" / ")} · {training.roles.join(" + ")}</p><small>训练 {training.sessions} 次 · 失败复盘 {training.failures} 次 · 证据 {training.evidence.length} 条</small></article>)}</div>}
    <div className="hunt-stage"><span>第 {hunting.ringIndex} 魂环</span><strong>{hunting.stage}</strong><small>{hunting.trailProgress}</small></div>
    {!hunting.support && hunting.stage === "需求" && <article className="hunt-target"><span>先确定谁承担首环责任</span><strong>费用、情报、许可与未成年安全不会自动归给同一个人</strong><div className="button-row">{game.relations.some((item) => item.category === "亲属") && <button type="button" disabled={busy} onClick={() => submit("选择家庭筹备第一魂环")}>家庭筹备</button>}{game.affiliations.some((item) => /学院/.test(item.name)) && <button type="button" disabled={busy} onClick={() => submit("申请学院承担首环带队责任")}>学院带队</button>}{game.affiliations.some((item) => !/学院/.test(item.name)) && <button type="button" disabled={busy} onClick={() => submit("申请宗门承担首环护送责任")}>宗门护送</button>}{game.mentorPursuit?.stage === "已拜师" && <button type="button" disabled={busy} onClick={() => submit("请求导师指导第一魂环")}>导师指导</button>}{(game.character?.age ?? 0) >= 12 && <button type="button" disabled={busy} onClick={() => submit("选择独行筹备第一魂环")}>独行筹备</button>}</div></article>}
    {hunting.support && <article className="hunt-target hunt-support-card"><span>{hunting.support.route} · {hunting.support.status}</span><strong>{hunting.support.responsibleParty}</strong><p>费用：{hunting.support.fundingSource} · 补助 {hunting.support.sponsorSpent}/{hunting.support.sponsorBudget}</p><small>{hunting.support.authorization}</small><small>{hunting.support.obligations.join("；")}</small>{hunting.support.evidence.at(-1) && <em>{hunting.support.evidence.at(-1)}</em>}{hunting.stage === "需求" && <button type="button" disabled={busy} onClick={() => submit("开始调查适合当前武魂的魂兽")}>开始调查</button>}</article>}
    {hunting.targetName && <article className="hunt-target"><span>目标</span><strong>{hunting.targetName}</strong>{hunting.targetYears && <small>约 {hunting.targetYears} 年</small>}</article>}
    {game.combat && <figure className={`combat-scene combat-scene-era-${game.era}`}><img src={`/assets/combat-era-${game.era}.webp`} alt={combatSceneAlt} loading="lazy" /><figcaption><span>原创战斗环境 · 斗{game.era}</span><strong>{game.combat.enemyName} · {game.combat.distance}</strong></figcaption></figure>}
    {game.combat && <article className="hunt-target"><span>第 {game.combat.round} 回合 · {game.combat.distance}</span><strong>{game.combat.enemyName} · {game.combat.enemyCondition}</strong><small>自身 {game.combat.playerCondition} · 观察 {game.combat.insight ?? 0}/3 · 防守 {game.combat.guard ?? 0}/3 · 控制抗性 {game.combat.controlResistance ?? 0}%</small>{game.combat.allies?.length ? <small>同行 · {game.combat.allies.map((ally) => `${ally.name}（${ally.role ?? "协同"}·协同${ally.readiness}·${ally.condition}）`).join("、")}</small> : null}{game.combat.comboPreparation && <small>连携准备 · {game.combat.comboPreparation.name} · {game.combat.comboPreparation.allyNames.join(" / ")}{game.combat.comboPreparation.mastery ? ` · 熟练度 ${game.combat.comboPreparation.mastery}%${game.combat.comboPreparation.branch ? ` · ${game.combat.comboPreparation.branch}` : ""}` : ""} · 最迟第 {game.combat.comboPreparation.expiresAfterRound} 回合发动</small>}{game.combat.comboCooldownUntilRound && game.combat.comboCooldownUntilRound > game.combat.round && <small>连携冷却至第 {game.combat.comboCooldownUntilRound} 回合</small>}{game.combat.controlStatus && <small>{game.combat.controlStatus}</small>}{game.combat.lastExchange && <p>{game.combat.lastExchange}</p>}<div><button type="button" disabled={busy} onClick={() => submit("观察敌人的发力与弱点")}>观察</button><button type="button" disabled={busy} onClick={() => submit("让同伴掩护并协同夹击")}>协同</button><button type="button" disabled={busy} onClick={() => submit("让两名互补岗位同伴准备多人连携")}>准备连携</button><button type="button" disabled={busy || !game.combat.comboPreparation} onClick={() => submit("发动已准备的多人连携")}>发动连携</button><button type="button" disabled={busy} onClick={() => submit("使用控制魂技束缚目标")}>控制</button><button type="button" disabled={busy} onClick={() => submit("防御并拉开距离")}>防守</button><button type="button" disabled={busy} onClick={() => submit("集中攻击已确认的弱点")}>攻击</button><button type="button" disabled={busy} onClick={() => submit("从远距离撤离战斗")}>撤退</button></div></article>}
    {hunting.recommendations.map((item) => <article className="recommendation-card" key={item.beastId}><strong>{item.name}</strong><span>{item.estimatedYears} · {item.risk}</span><p>{item.fit}</p><small>{item.source}</small><button type="button" disabled={busy} onClick={() => submit(`选择${item.name}作为魂环目标`)}>选择</button></article>)}
    {hunting.preparation.length > 0 && <SimpleList title="准备" values={hunting.preparation} empty="" />}{hunting.absorptionRisk && <p className="risk-line">吸收风险：{hunting.absorptionRisk}</p>}{hunting.result && <p className="result-line">{hunting.result}</p>}
  </div>;
}

function MediaAccountabilityPanel({ game, submit, busy }: { game: GameView; submit: (value: string) => void; busy: boolean }) {
  if (game.era === 1 || !game.mediaOutlets.length) return null;
  return <section className="detail-stack media-accountability-panel">
    <h3 className="panel-title">媒体责任档案</h3>
    {game.mediaAlliances?.length > 0 && <><p className="panel-label">跨地区核验联盟</p><div className="player-relation-ledger">{game.mediaAlliances.map((alliance) => <article key={alliance.id}>
      <header><strong>{alliance.name}</strong><span>{alliance.status}</span></header>
      <p>{alliance.outlets.join(" ↔ ")} · 共享核验资源 {alliance.sharedVerificationPool}</p>
      <small>正式成员 {alliance.outlets.length} 家 · {alliance.delayedAgendaIds.length ? `${alliance.delayedAgendaIds.length} 个议题因资源有限延后` : "尚无延后议题"} · 已审计补充 {alliance.resourceRefillCount ?? 0} 次 · 共享查证不等于共享结论</small>
      {alliance.recoveryEvidence?.length ? <small>修复证据 {alliance.recoveryEvidence.length} 条 · 观察期剩余 {alliance.probationVerificationsRemaining ?? 0} 次</small> : null}
      {(alliance.membershipApplications ?? []).map((application) => <small key={application.outlet}>准入档案：{application.outlet} · {application.editorName} · {application.status} · 证据 {application.evidence.length} 条</small>)}
      {(alliance.departures ?? []).map((departure) => <small key={`${departure.outlet}-${departure.requestedAtActionIndex}`}>退出档案：{departure.outlet} · {departure.editorName} · {departure.status} · 责任证据 {departure.evidence.length} 条</small>)}
      <div>{alliance.status === "提议中" && <button type="button" disabled={busy} onClick={() => submit("与两家责任编辑协商启动共享核验资源")}>启动试运行</button>}{alliance.outlets.length === 2 && ["试运行", "资源冲突"].includes(alliance.status) && !(alliance.membershipApplications ?? []).length && <button type="button" disabled={busy} onClick={() => submit("登记第三家媒体候选")}>登记第三家候选</button>}{(alliance.membershipApplications ?? []).some((item) => item.status === "候选核验") && <button type="button" disabled={busy} onClick={() => submit("批准第三家媒体加入联盟")}>批准第三家加入</button>}{alliance.outlets.length >= 3 && ["试运行", "资源冲突"].includes(alliance.status) && !(alliance.departures ?? []).some((item) => item.status === "待退出复核") && alliance.outlets.map((outlet) => <button type="button" key={`exit-${outlet}`} disabled={busy} onClick={() => submit(`登记${outlet}退出联盟申请`)}>申请{outlet}退出</button>)}{(alliance.departures ?? []).filter((item) => item.status === "待退出复核").map((departure) => <button type="button" key={`approve-exit-${departure.outlet}`} disabled={busy} onClick={() => submit(`批准${departure.outlet}退出联盟`)}>批准{departure.outlet}退出</button>)}{alliance.status === "成员不足" && !(alliance.membershipApplications ?? []).some((item) => item.status === "替补核验") && <button type="button" disabled={busy} onClick={() => submit("登记替补媒体候选")}>登记替补候选</button>}{(alliance.membershipApplications ?? []).some((item) => item.status === "替补核验") && <button type="button" disabled={busy} onClick={() => submit("批准替补媒体加入联盟")}>批准替补加入</button>}{alliance.status === "暂停合作" && <button type="button" disabled={busy} onClick={() => submit("登记媒体联盟修复计划")}>登记修复计划</button>}{alliance.status === "修复审核" && <button type="button" disabled={busy} onClick={() => submit("提交媒体联盟恢复复核")}>提交恢复复核</button>}{["试运行", "资源冲突"].includes(alliance.status) && alliance.sharedVerificationPool === 0 && <button type="button" disabled={busy} onClick={() => submit("申请补充媒体联盟核验资源")}>申请补充资源</button>}<button type="button" disabled={busy || ["提议中", "暂停合作", "修复审核", "成员不足"].includes(alliance.status) || !alliance.priorityAgendaId || alliance.sharedVerificationPool < 1} onClick={() => submit("让媒体联盟共同核验优先议题")}>{alliance.status === "受限恢复" ? "观察期核验" : "共同核验"}</button></div>
      {alliance.agendas.map((agenda) => <section key={agenda.id} className="alliance-agenda"><strong>{agenda.title}</strong><span>{agenda.status}</span><small>{alliance.outlets.map((name) => `${name} 优先 ${agenda.priorityScores[name] ?? 0}`).join(" · ")}</small><button type="button" disabled={busy || ["提议中", "暂停合作", "修复审核", "成员不足"].includes(alliance.status) || agenda.status === "共同核验"} onClick={() => submit(`把${agenda.title}设为联盟优先议题`)}>设为优先</button></section>)}
    </article>)}</div></>}
    {game.mediaCompetitions?.length > 0 && <><p className="panel-label">跨媒体竞争</p><div className="player-relation-ledger">{game.mediaCompetitions.map((competition) => <article key={competition.id}>
      <header><strong>{competition.outlets.join(" ↔ ")}</strong><span>{competition.status}</span></header>
      <p>{competition.outlets.map((name) => `${name} ${competition.scores[name] ?? 0}分`).join(" · ")}</p>
      <small>共同议题 {competition.sharedTopics} 次 · {competition.leader ? `${competition.leader}领先` : "暂时并列"}{competition.playerChoice ? ` · 最近独家线索交给${competition.playerChoice}` : ""}</small>
      <div><button type="button" disabled={busy} onClick={() => submit("对比两家媒体的报道与核验记录")}>对比核验链</button><button type="button" disabled={busy || competition.topics.length < 2 || game.mediaAlliances.some((item) => item.competitionId === competition.id)} onClick={() => submit(`提议${competition.outlets.join("与")}建立跨地区核验联盟`)}>提议核验联盟</button></div>
    </article>)}</div></>}
    <div className="player-relation-ledger">{game.mediaOutlets.map((outlet) => <article key={outlet.name}>
      <header><strong>{outlet.name}</strong><span>{outlet.status} · {outlet.trustScore}</span></header>
      <p>{outlet.stance}</p>
      {outlet.responsibleEditor ? <><small>{outlet.responsibleEditor.role} · {outlet.responsibleEditor.name} · 来源信任 {outlet.responsibleEditor.sourceTrust} · 对主角信任 {outlet.responsibleEditor.playerTrust ?? 0}</small><em>处理 {outlet.responsibleEditor.handledReports} 篇 · 互动 {outlet.responsibleEditor.interactions ?? 0} 次 · {outlet.responsibleEditor.responsibility}</em><div><button type="button" disabled={busy} onClick={() => submit(`联系${outlet.responsibleEditor!.name}责任编辑询问选稿依据`)}>采访编辑</button><button type="button" disabled={busy || outlet.responsibleEditor.requestedEvidenceAtActionIndex === undefined} onClick={() => submit(`向${outlet.responsibleEditor!.name}责任编辑提交补充证据`)}>补交材料</button>{game.mediaCompetitions?.some((item) => item.outlets.includes(outlet.name)) && <button type="button" disabled={busy || outlet.responsibleEditor.requestedEvidenceAtActionIndex === undefined} onClick={() => submit(`向${outlet.responsibleEditor!.name}责任编辑提交独家补充证据`)}>独家交线索</button>}</div></> : <small>旧档案尚无可核验责任编辑</small>}
    </article>)}</div>
  </section>;
}

function ChronologyPanel({ game, submit, busy }: { game: GameView; submit: (value: string) => void; busy: boolean }) {
  const chronology = game.worldInheritance?.chronology ?? [];
  if (!chronology.length) return null;
  return <section className="detail-stack chronology-panel">
    <h3 className="panel-title">时代间可审查年表</h3>
    <div className="lineage-list">{chronology.map((event) => <article key={event.id}>
      <header><strong>原作 {event.year} 年 · {event.title}</strong><span>{event.verification} · 可信 {event.confidence}%</span></header>
      <p>{event.kind} · {event.detail}</p>
      <small>来源：{event.source}</small>
      <button type="button" disabled={busy || event.verification === "已核验"} onClick={() => submit(`调查年表节点${event.title}`)}>核验节点</button>
    </article>)}</div>
  </section>;
}

function WorldPanel({ game, submit, busy }: { game: GameView; submit: (value: string) => void; busy: boolean }) {
  const inheritance = game.worldInheritance;
  return <div className="world-panel">{inheritance && <><h3 className="panel-title">连续世代谱系</h3><div className="lineage-list">{inheritance.lineage.map((ancestor) => <article key={`${ancestor.generation}-${ancestor.name}`}><header><strong>第 {ancestor.generation} 代 · {ancestor.name}</strong><span>{ancestor.verification}</span></header><p>斗{ancestor.era} · {ancestor.ending} · 最高魂力 {ancestor.highestSoulRank} · 历史影响 {ancestor.historicalImpact}</p><small>{ancestor.evidence.length} 条证据</small><button type="button" disabled={busy || ancestor.verification === "已核验"} onClick={() => submit(`继续核验祖先${ancestor.name}的旧世档案`)}>核验</button></article>)}</div>{inheritance.branches?.length > 0 && <><h3 className="panel-title">家庭旁支档案</h3><div className="lineage-list">{inheritance.branches.map((branch) => <article key={branch.id}><header><strong>{branch.name}</strong><span>{branch.verification}</span></header><p>第 {branch.sourceGeneration} 代 · 斗{branch.sourceEra} · {branch.route} · {branch.parentNames.join(" / ")}</p><small>只证明家庭记录，不证明武魂、能力、产权或当前亲缘主张</small><button type="button" disabled={busy || branch.verification === "已核验"} onClick={() => submit(`继续核验旁支${branch.name}的家谱`)}>核验旁支</button></article>)}</div></>}{inheritance.institutions.length > 0 && <><h3 className="panel-title">旧世机构与产业</h3><div className="lineage-list">{inheritance.institutions.map((institution) => <article key={institution.id}><header><strong>{institution.name}</strong><span>{institution.state} · {institution.verification}</span></header><p>斗{institution.sourceEra} · {institution.formerRole} · 主张：{institution.claimStatus ?? "未主张"}</p><small>{institution.recognizedRight ?? "只保留历史权益线索，不代表当前产权"} · 当代证据 {institution.currentEvidence?.length ?? 0}/2</small><div className="button-row"><button type="button" disabled={busy || institution.verification === "已核验"} onClick={() => submit(`调查核验旧世机构${institution.name}`)}>核验</button><button type="button" disabled={busy || institution.verification !== "已核验" || (institution.currentEvidence?.length ?? 0) >= 2} onClick={() => submit(`调查${institution.name}当前产权登记`)}>查当代权属</button><button type="button" disabled={busy || institution.verification !== "已核验" || (institution.currentEvidence?.length ?? 0) < 2 || (institution.claimStatus ?? "未主张") !== "未主张"} onClick={() => submit(`提交${institution.name}历史权益主张`)}>提交主张</button>{institution.claimStatus === "待审理" && <button type="button" disabled={busy} onClick={() => submit(`参加${institution.name}历史权益听证`)}>参加听证</button>}{institution.claimStatus === "有限承认" && !institution.reestablishedBusiness && <button type="button" disabled={busy} onClick={() => submit(`以${institution.name}旧址线索重新投资经营`)}>投资新主体</button>}</div></article>)}</div></>}</>}<h3 className="panel-title">原作因果</h3>{game.canonInfluences.length ? <div className="causal-chain">{game.canonInfluences.map((cause, index) => <article key={cause.id}><i>{index + 1}</i><div><strong>{cause.action}</strong><span>{cause.affects} · {cause.strength}</span><small>{cause.date}</small></div></article>)}</div> : <article className="canon-stable"><strong>原作轨迹稳定</strong><p>主角还没有接触关键人物、势力或事件，原作节点不会自行改变。</p></article>}{game.managedFactions.length > 0 && <><h3 className="panel-title">掌管势力</h3><div className="managed-faction-list">{game.managedFactions.map((faction) => <article key={faction.id}><header><strong>{faction.name}</strong><span>{faction.role}</span></header><p>{faction.members} 人 · 资源 {faction.resources} · {faction.territory.join("、")}</p><small>{faction.departments.join("、")}；待处理：{faction.internalIssues.join("、") || "暂无"}</small></article>)}</div></>}{game.activeEvents.length > 0 && <><h3 className="panel-title">眼前事件</h3><div className="world-event-list">{game.activeEvents.map((event) => <article key={event.id}><header><span>{event.kind} · {event.remaining}</span><strong>{event.title}</strong></header><p>{event.detail}</p><small>{event.location}</small><div><button type="button" disabled={busy} onClick={() => submit(`调查${event.title}`)}>调查</button><button type="button" disabled={busy} onClick={() => submit(`帮助处理${event.title}`)}>介入</button><button type="button" disabled={busy} onClick={() => submit(`拒绝${event.title}`)}>拒绝</button></div></article>)}</div></>}<h3 className="panel-title">近日消息</h3>{game.news.length ? <div className="news-list">{game.news.map((item) => <article key={item.id}><span>{item.date}</span><strong>{item.title}</strong><p>{item.detail}</p></article>)}</div> : <p className="panel-copy">暂时没有传到角色耳中的大事。</p>}<h3 className="panel-title">已知人物</h3>{game.knownFigures.length ? <div className="figure-list">{game.knownFigures.map((figure) => <article key={figure.id}><header><strong>{figure.name}</strong><span>{figure.knownPower}</span></header><p>{figure.title ?? figure.faction ?? "身份不详"}</p><small>{figure.location} · {figure.status} · {figure.source} {figure.confidence}%</small></article>)}</div> : <p className="panel-copy">角色还没有接触到重要人物。</p>}</div>;
}

function EndingPanel({ game, busy, onContinueEra }: { game: GameView; busy: boolean; onContinueEra: () => Promise<void> | void }) {
  const settlement = game.runProgress.settlement;
  const canContinue = Boolean(settlement?.qualified && game.era < 4);
  return <section className="ending-panel"><p className="eyebrow">程序结算</p><h2>{settlement?.ending ?? game.runProgress.ending ?? "故事结束"}</h2>{settlement ? <><div className={`ending-score ${settlement.qualified ? "" : "unqualified"}`}><strong>{settlement.legacyPoints}</strong><span>{settlement.qualified ? "传承点" : "中止收益"}</span><small>{settlement.baseScore} × {settlement.multiplier.toFixed(2)}</small></div><ul>{settlement.highlights.map((item) => <li key={item}>{item}</li>)}</ul>{canContinue && <button type="button" className="primary-button" disabled={busy} onClick={() => void onContinueEra()}>在同一存档开启斗{game.era + 1}继承人</button>}{game.era >= 4 && settlement.qualified && <p>四个时代的连续世界线已经完成。</p>}</> : <p>这一生已经结束，记录已写入存档。</p>}</section>;
}

function SimpleList({ title, values, empty }: { title: string; values: string[]; empty: string }) {
  return <div><h3 className="panel-title">{title}</h3>{values.length ? <ul className="simple-list">{values.map((value, index) => <li key={`${value}-${index}`}>{value}</li>)}</ul> : <LockedPanel text={empty} />}</div>;
}

function LockedPanel({ text }: { text: string }) {
  return <div className="locked-panel"><span>未显现</span><p>{text}</p></div>;
}
