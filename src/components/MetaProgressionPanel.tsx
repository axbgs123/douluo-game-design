import { useEffect, useState } from "react";
import { DIFFICULTIES, type MetaProgressionView, type WorldCatalogStatsView } from "../../shared/game";
import { drawMetaMartialSoul, equipMetaHeirloom, equipMetaMartialSoul, getMetaProgression, getWorldCatalogStats, purchaseMetaUpgrade, saveMetaPreferences, toggleMetaMartialSoul } from "../api";

interface MetaProgressionPanelProps { open: boolean; onClose: () => void }

function UnlockList({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return <article className="meta-unlock-card"><h3>{title}</h3>{items.length > 0 ? <div className="meta-tags">{items.map((item) => <span key={item}>{item}</span>)}</div> : <p>{empty}</p>}</article>;
}

const PREFERENCE_OPTIONS = {
  origin: ["均衡", "平民", "魂师家庭", "漂泊", "权贵", "天骄", "反派", "穿越", "特殊"],
  martialSoul: ["均衡", "器武魂", "兽武魂", "植物", "本体武魂"],
  gift: ["均衡", "朴素", "奇遇", "异界体系"],
};

export function MetaProgressionPanel({ open, onClose }: MetaProgressionPanelProps) {
  const [meta, setMeta] = useState<MetaProgressionView | null>(null);
  const [catalog, setCatalog] = useState<WorldCatalogStatsView | null>(null);
  const [preferences, setPreferences] = useState<MetaProgressionView["weightPreferences"]>({ origin: "均衡", martialSoul: "均衡", gift: "均衡" });
  const [message, setMessage] = useState("");
  const [lastDrawId, setLastDrawId] = useState<string>();

  useEffect(() => {
    if (!open) return;
    setMessage("");
    void Promise.all([getMetaProgression(), getWorldCatalogStats()]).then(([nextMeta, nextCatalog]) => {
      setMeta(nextMeta); setPreferences(nextMeta.weightPreferences); setCatalog(nextCatalog);
    }).catch((caught: Error) => setMessage(caught.message));
  }, [open]);

  const save = async () => {
    try { const next = await saveMetaPreferences(preferences); setMeta(next); setMessage("偏好已保存，只改变随机权重。"); }
    catch (caught) { setMessage(caught instanceof Error ? caught.message : "保存失败"); }
  };

  const purchase = async (name: "命运余量" | "稳固根基" | "旧世见闻") => {
    try { setMeta(await purchaseMetaUpgrade(name)); setMessage(`${name}已提升。`); }
    catch (caught) { setMessage(caught instanceof Error ? caught.message : "购买失败"); }
  };

  const equip = async (name?: string) => {
    try { setMeta(await equipMetaHeirloom(name)); setMessage(name ? `下一轮携带${name}。` : "已取消携带遗物。"); }
    catch (caught) { setMessage(caught instanceof Error ? caught.message : "装备失败"); }
  };

  const drawSoul = async () => {
    try {
      const result = await drawMetaMartialSoul();
      setMeta(result.meta); setLastDrawId(result.drawn.id);
      setMessage(`${result.drawn.rarity}武魂 · ${result.drawn.name}。获得 1 次使用机会${result.cost ? `，消耗 ${result.cost} 传承点` : "，本次使用召唤券"}。`);
    } catch (caught) { setMessage(caught instanceof Error ? caught.message : "召唤失败"); }
  };

  const equipSoul = async (id?: string) => {
    try { const next = await equipMetaMartialSoul(id); setMeta(next); setMessage(id ? "已设为下一名选定角色的武魂。" : "已取消指定武魂。"); }
    catch (caught) { setMessage(caught instanceof Error ? caught.message : "设置失败"); }
  };

  const toggleSoul = async (id: string, enabled: boolean) => {
    try { setMeta(await toggleMetaMartialSoul(id, enabled)); setMessage(enabled ? "已允许它在普通开局中极低概率出场。" : "已从普通开局池中关闭。"); }
    catch (caught) { setMessage(caught instanceof Error ? caught.message : "设置失败"); }
  };

  if (!open) return null;
  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="meta-modal" role="dialog" aria-modal="true" aria-label="局外成长" onMouseDown={(event) => event.stopPropagation()}>
      <button type="button" className="modal-close" onClick={onClose}>×</button>
      <header className="meta-header"><p className="eyebrow">跨存档</p><h2>局外成长</h2></header>
      {message && <p className="settings-message">{message}</p>}
      {!meta && !message && <p className="meta-loading">正在读取本地记录……</p>}
      {meta && <>
        <section className="meta-stats">
          <article><span>传承点</span><strong>{meta.legacyPoints}</strong></article><article><span>完成周目</span><strong>{meta.completedRuns}</strong></article><article><span>武魂图鉴</span><strong>{meta.discoveredMartialSouls}</strong></article><article><span>出身图鉴</span><strong>{meta.discoveredOrigins}</strong></article>
        </section>

        <section className="meta-section soul-draw-section">
          <div className="meta-section-heading"><div><h3>命运武魂召唤</h3><p>红色与七彩武魂只从这里首次获得。抽到后可使用一次；用它通关后会永久写入图鉴。</p></div><button type="button" className="soul-draw-button" onClick={() => void drawSoul()}>{meta.martialSoulDrawTickets > 0 ? `使用召唤券 · ${meta.martialSoulDrawTickets}` : "召唤一次 · 20 传承点"}</button></div>
          <div className="soul-draw-rules"><span>10 抽内至少金色</span><span>40 抽内至少红色</span><span>当前累计 {meta.martialSoulDrawPity} 抽</span><span>七彩为独立极低概率</span></div>
          {meta.equippedMartialSoulId && <div className="equipped-soul-line"><span>下局指定</span><strong>{meta.martialSoulCodex.find((item) => item.id === meta.equippedMartialSoulId)?.name}</strong><button type="button" onClick={() => void equipSoul()}>取消</button></div>}
          <div className="martial-soul-codex">
            {meta.martialSoulCodex.length ? meta.martialSoulCodex.map((entry) => <article key={entry.id} className={`codex-soul-card soul-rarity-${entry.rarity} ${lastDrawId === entry.id ? "new-draw" : ""}`}>
              <header><span>{entry.rarity}</span><strong>{entry.name}</strong><small>{entry.category}</small></header>
              <p>{entry.description}</p>
              <dl><div><dt>可用次数</dt><dd>{entry.completedRuns > 0 ? "已永久解锁" : entry.charges}</dd></div><div><dt>通关</dt><dd>{entry.completedRuns} 次</dd></div><div><dt>初始魂力记录</dt><dd>{entry.initialSoulPowers.length ? entry.initialSoulPowers.map((value) => `${value}级`).join("、") : "通关后记录"}</dd></div></dl>
              <div className="codex-routes">{entry.completedRuns > 0 ? entry.growthRoutes.slice(-3).map((route) => <span key={route}>{route}</span>) : <span>成长路线尚未写入</span>}</div>
              <footer><button type="button" disabled={entry.charges < 1 && entry.completedRuns < 1} className={meta.equippedMartialSoulId === entry.id ? "active" : ""} onClick={() => void equipSoul(meta.equippedMartialSoulId === entry.id ? undefined : entry.id)}>{meta.equippedMartialSoulId === entry.id ? "已指定下局" : entry.completedRuns > 0 ? "用它再开一局" : "使用一次"}</button><label><input type="checkbox" checked={entry.enabled} disabled={entry.completedRuns < 1} onChange={(event) => void toggleSoul(entry.id, event.target.checked)} />允许随机出场</label></footer>
            </article>) : <p className="meta-empty-copy">尚未召唤武魂。新档案自带一张免费召唤券。</p>}
          </div>
        </section>

        <section className="meta-section"><div className="meta-section-heading"><h3>下轮偏好</h3><p>只增加出现概率，不锁定结果。</p></div><div className="preference-grid">
          {(Object.keys(PREFERENCE_OPTIONS) as Array<keyof typeof PREFERENCE_OPTIONS>).map((key) => <label key={key}><span>{key === "origin" ? "出身" : key === "martialSoul" ? "武魂" : "奇遇"}</span><select value={preferences[key]} onChange={(event) => setPreferences({ ...preferences, [key]: event.target.value })}>{PREFERENCE_OPTIONS[key].map((item) => <option key={item}>{item}</option>)}</select></label>)}
          <button type="button" className="primary-button" onClick={() => void save()}>保存偏好</button>
        </div></section>

        <section className="meta-section"><div className="meta-section-heading"><h3>难度结算</h3></div><div className="budget-grid">{DIFFICULTIES.map((difficulty) => <article key={difficulty}><strong>{difficulty}</strong><span>{meta.difficultyBudgets[difficulty]} 预算</span><small>结算 ×{meta.difficultyMultipliers[difficulty].toFixed(2)}</small></article>)}</div></section>

        <section className="meta-section"><div className="meta-section-heading"><h3>传承强化</h3><p>消耗传承点，效果会带进之后的新存档。</p></div><div className="legacy-upgrade-grid">
          {([{"name":"命运余量","cost":30,"copy":"提高特殊开局与隐藏传承的权重"},{"name":"稳固根基","cost":40,"copy":"提高开局根基和濒死后的承载能力"},{"name":"旧世见闻","cost":50,"copy":"开局认出更多身边的重要人物"}] as const).map((upgrade) => { const level = meta.purchasedUpgrades[upgrade.name] ?? 0; const cost = upgrade.cost * (level + 1); return <article key={upgrade.name}><span>等级 {level}/3</span><strong>{upgrade.name}</strong><p>{upgrade.copy}</p><button type="button" disabled={level >= (upgrade.name === "旧世见闻" ? 2 : 3) || meta.legacyPoints < cost} onClick={() => void purchase(upgrade.name)}>{level >= (upgrade.name === "旧世见闻" ? 2 : 3) ? "已满" : `${cost} 点提升`}</button></article>; })}
        </div></section>

        <section className="meta-section"><div className="meta-section-heading"><h3>已解锁</h3></div><div className="meta-unlocks"><UnlockList title="出身" items={meta.unlockedOrigins} empty="暂无" /><UnlockList title="武魂" items={meta.unlockedMartialSouls} empty="暂无" /><UnlockList title="特质" items={meta.unlockedTraits} empty="暂无" /><article className="meta-unlock-card"><h3>遗物</h3>{meta.unlockedHeirlooms.length ? <div className="heirloom-list">{meta.unlockedHeirlooms.map((item) => <button type="button" className={meta.equippedHeirloom === item ? "active" : ""} key={item} onClick={() => void equip(meta.equippedHeirloom === item ? undefined : item)}>{item}{meta.equippedHeirloom === item ? " · 已携带" : ""}</button>)}</div> : <p>暂无</p>}</article><UnlockList title="魂兽图鉴" items={meta.codexEntries} empty="暂无" /></div></section>

        {catalog && <section className="meta-section"><div className="meta-section-heading"><h3>世界资料库</h3><p>人物随年份变化，叙事规则按当前行动自动启用。</p></div><div className="catalog-grid"><article><strong>{catalog.birthProfiles}</strong><span>具体出生档案</span></article><article><strong>{catalog.martialSouls}</strong><span>可觉醒武魂</span></article><article><strong>{catalog.characters}</strong><span>重要人物与凶兽</span></article><article><strong>{catalog.powerSnapshots}</strong><span>实力节点</span></article><article><strong>{catalog.factions}</strong><span>势力</span></article><article><strong>{catalog.locations}</strong><span>地点</span></article><article><strong>{catalog.events}</strong><span>历史事件</span></article><article><strong>{catalog.soulBeasts}</strong><span>魂兽</span></article><article><strong>{catalog.narrativeRules}</strong><span>叙事规则</span></article></div></section>}
      </>}
    </section>
  </div>;
}
