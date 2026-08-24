import { useEffect, useState } from "react";
import { DIFFICULTIES, type MetaProgressionView, type WorldCatalogStatsView } from "../../shared/game";
import { GOLD_FINGERS } from "../../shared/gold-fingers";
import { heirloomByName } from "../../shared/heirlooms";
import { deleteMetaMartialSoul, deleteMetaOrigin, drawMetaMartialSoul, drawMetaOrigin, equipMetaHeirloom, equipMetaMartialSoul, equipMetaOrigin, favoriteMetaMartialSoul, favoriteMetaOrigin, getMetaProgression, getWorldCatalogStats, purchaseMetaUpgrade, saveMetaPreferences, toggleMetaMartialSoul } from "../api";

interface MetaProgressionPanelProps { open: boolean; onClose: () => void }

function UnlockList({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return <article className="meta-unlock-card"><h3>{title}</h3>{items.length > 0 ? <div className="meta-tags">{items.map((item) => <span key={item}>{item}</span>)}</div> : <p>{empty}</p>}</article>;
}

const PREFERENCE_OPTIONS = {
  origin: ["均衡", "平民", "魂师家庭", "宗门开局", "隐世宗门", "漂泊", "权贵", "天骄", "反派", "穿越", "特殊", "凶兽养成", "无羁绊"],
  martialSoul: ["均衡", "器武魂", "兽武魂", "植物", "本体武魂"],
  gift: ["均衡", "朴素", "奇遇", "异界体系", "系统流"],
};
const GOLD_FINGER_CATEGORIES = [...new Set(GOLD_FINGERS.map((item) => item.category))];

export function MetaProgressionPanel({ open, onClose }: MetaProgressionPanelProps) {
  const [meta, setMeta] = useState<MetaProgressionView | null>(null);
  const [catalog, setCatalog] = useState<WorldCatalogStatsView | null>(null);
  const [preferences, setPreferences] = useState<MetaProgressionView["weightPreferences"]>({ origin: "均衡", martialSoul: "均衡", gift: "均衡" });
  const [message, setMessage] = useState("");
  const [lastDrawId, setLastDrawId] = useState<string>();
  const [soulSearch, setSoulSearch] = useState("");
  const [originSearch, setOriginSearch] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [summonTab, setSummonTab] = useState<"history" | "souls" | "origins" | "heirlooms">("souls");
  const [soulWarehouseExpanded, setSoulWarehouseExpanded] = useState(true);
  const [originWarehouseExpanded, setOriginWarehouseExpanded] = useState(true);
  const [heirloomWarehouseExpanded, setHeirloomWarehouseExpanded] = useState(true);
  const [soulRarityFilter, setSoulRarityFilter] = useState<"全部" | "白色" | "蓝色" | "紫色" | "金色" | "红色" | "七彩">("全部");
  const [originRarityFilter, setOriginRarityFilter] = useState<"全部" | "紫色" | "金色" | "红色" | "七彩">("全部");
  const [heirloomRarityFilter, setHeirloomRarityFilter] = useState<"全部" | "紫色" | "金色" | "红色">("全部");

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
      setMeta(result.meta);
      if (result.kind === "martialSoul") {
        setSummonTab("souls");
        setLastDrawId(result.drawn.id);
        setMessage(`${result.drawn.rarity}武魂 · ${result.drawn.name}。已永久解锁，可无限次用于新开局${result.cost ? `；消耗 ${result.cost} 传承点` : "；本次使用召唤券"}。`);
      } else if (result.kind === "origin") {
        setSummonTab("origins");
        setLastDrawId(result.drawn.id);
        setMessage(`${result.drawn.rarity}身世 · ${result.drawn.name}。已永久加入身世仓库${result.drawn.duplicate ? "；重复获得，返还 1 张召唤券" : "，可指定对应时代的新开局"}。`);
      } else {
        setSummonTab("heirlooms");
        setLastDrawId(undefined);
        setMessage(`${result.drawn.rarity}遗物 · ${result.drawn.name}：${result.drawn.description}${result.drawn.duplicate ? " 已拥有，返还 1 张召唤券。" : " 已加入遗物库。"}`);
      }
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

  const favoriteSoul = async (id: string, favorite: boolean) => {
    try { setMeta(await favoriteMetaMartialSoul(id, favorite)); setMessage(favorite ? "已收藏这个武魂。" : "已取消收藏。"); }
    catch (caught) { setMessage(caught instanceof Error ? caught.message : "收藏失败"); }
  };

  const deleteSoul = async (id: string, name: string) => {
    if (!window.confirm(`从武魂仓库永久删除“${name}”？未使用次数、通关记录与成长路线都会一并删除。`)) return;
    try { setMeta(await deleteMetaMartialSoul(id)); setLastDrawId((current) => current === id ? undefined : current); setMessage(`已从仓库删除${name}。`); }
    catch (caught) { setMessage(caught instanceof Error ? caught.message : "删除失败"); }
  };

  const equipOrigin = async (id?: string) => {
    try { setMeta(await equipMetaOrigin(id)); setMessage(id ? "已指定下局身世。创建对应时代角色时会跳过身份三选一，直接进入角色塑造。" : "已取消指定身世。"); }
    catch (caught) { setMessage(caught instanceof Error ? caught.message : "设置失败"); }
  };

  const drawOrigin = async () => {
    try {
      const result = await drawMetaOrigin();
      setMeta(result.meta);
      setLastDrawId(result.drawn.id);
      setMessage(`${result.drawn.rarity}身世 · ${result.drawn.name}。${result.drawn.duplicate ? "重复获得，返还 1 张召唤券。" : "已永久加入身世仓库。"}`);
    } catch (caught) { setMessage(caught instanceof Error ? caught.message : "身世召唤失败"); }
  };

  const favoriteOrigin = async (id: string, favorite: boolean) => {
    try { setMeta(await favoriteMetaOrigin(id, favorite)); setMessage(favorite ? "已收藏这个身世。" : "已取消收藏。"); }
    catch (caught) { setMessage(caught instanceof Error ? caught.message : "收藏失败"); }
  };

  const deleteOrigin = async (id: string, name: string) => {
    if (!window.confirm(`从身世仓库永久删除“${name}”？`)) return;
    try { setMeta(await deleteMetaOrigin(id)); setLastDrawId((current) => current === id ? undefined : current); setMessage(`已从仓库删除${name}。`); }
    catch (caught) { setMessage(caught instanceof Error ? caught.message : "删除失败"); }
  };

  const temporaryUnlimitedLegacy = (meta?.legacyPoints ?? 0) >= 1_000_000_000_000_000;

  if (!open) return null;
  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="meta-modal" role="dialog" aria-modal="true" aria-label="局外成长" onMouseDown={(event) => event.stopPropagation()}>
      <button type="button" className="modal-close" onClick={onClose}>×</button>
      <header className="meta-header"><p className="eyebrow">跨存档</p><h2>局外成长</h2></header>
      {message && <p className="settings-message">{message}</p>}
      {!meta && !message && <p className="meta-loading">正在读取本地记录……</p>}
      {meta && <>
        <section className="meta-stats">
          <article><span>传承点</span><strong>{temporaryUnlimitedLegacy ? "∞" : meta.legacyPoints}</strong></article><article><span>完成周目</span><strong>{meta.completedRuns}</strong></article><article><span>武魂图鉴</span><strong>{meta.discoveredMartialSouls}</strong></article><article><span>出身图鉴</span><strong>{meta.discoveredOrigins}</strong></article>
        </section>

        <section className="meta-section soul-draw-section">
          <div className="meta-section-heading"><div><h3>召唤</h3><p>武魂与身世都只会出现紫色及以上品质；身世会完整生成家庭、住址、权限、资源和代价，不是只改一行简介。</p></div><button type="button" className="soul-draw-button" onClick={() => void drawSoul()}>{meta.martialSoulDrawTickets > 0 ? `使用召唤券 · ${meta.martialSoulDrawTickets}` : temporaryUnlimitedLegacy ? "召唤一次 · ∞传承点" : "召唤一次 · 20 传承点"}</button></div>
          <div className="soul-draw-rules"><span>武魂池 {meta.martialSoulSummonPoolSize} 种</span><span>身世池 {meta.originSummonPoolSize} 种</span><span>最低紫色</span><span>金色保底 {10 - meta.summonGoldPity} 抽</span><span>红色保底 {40 - meta.summonRedPity} 抽</span><span>七彩保底 {80 - meta.summonRainbowPity} 抽</span><span>身世概率 12%</span><span>遗物概率 8%</span></div>
          <nav className="summon-tabs" aria-label="召唤仓库"><button data-testid="summon-tab-history" type="button" className={summonTab === "history" ? "active" : ""} onClick={() => setSummonTab("history")}>召唤记录 · {meta.summonHistory.length}</button><button data-testid="summon-tab-souls" type="button" className={summonTab === "souls" ? "active" : ""} onClick={() => setSummonTab("souls")}>武魂仓库 · {meta.martialSoulCodex.length}</button><button data-testid="summon-tab-origins" type="button" className={summonTab === "origins" ? "active" : ""} onClick={() => setSummonTab("origins")}>身世仓库 · {meta.originCodex.length}</button><button data-testid="summon-tab-heirlooms" type="button" className={summonTab === "heirlooms" ? "active" : ""} onClick={() => setSummonTab("heirlooms")}>遗物仓库 · {meta.unlockedHeirlooms.length}</button></nav>
          {summonTab === "history" && <div className="summon-history"><h4>最近五次</h4>{meta.summonHistory.length ? meta.summonHistory.map((entry) => <article key={entry.id} className={`summon-history-card soul-rarity-${entry.rarity}`}><span>{entry.rarity} · {entry.kind === "martialSoul" ? "武魂" : entry.kind === "origin" ? "身世" : "遗物"}</span><strong>{entry.name}</strong><p>{entry.description}</p><small>{entry.duplicate ? "重复获得" : "首次获得"} · {new Date(entry.drawnAt).toLocaleString("zh-CN")}</small></article>) : <p className="meta-empty-copy">还没有召唤记录。</p>}</div>}
        </section>

        {summonTab === "souls" && <section className="meta-section soul-warehouse-section">
          <div className="meta-section-heading"><div><h3>武魂仓库</h3><p>召唤结果保存在这里。支持搜索、稀有度筛选、收藏、指定下局、随机出场与永久删除。</p></div><button type="button" onClick={() => setSoulWarehouseExpanded((value) => !value)}>{soulWarehouseExpanded ? "收起仓库" : "展开仓库"}</button></div>
          {meta.equippedMartialSoulId && <div className="equipped-soul-line"><span>下局指定</span><strong>{meta.martialSoulCodex.find((item) => item.id === meta.equippedMartialSoulId)?.name}</strong><button type="button" onClick={() => void equipSoul()}>取消</button></div>}
          {soulWarehouseExpanded && <><div className="warehouse-tools"><input value={soulSearch} onChange={(event) => setSoulSearch(event.target.value)} placeholder="搜索名称、类别、稀有度或描述" /><label><span>稀有度</span><select value={soulRarityFilter} onChange={(event) => setSoulRarityFilter(event.target.value as typeof soulRarityFilter)}>{["全部", "白色", "蓝色", "紫色", "金色", "红色", "七彩"].map((rarity) => <option key={rarity}>{rarity}</option>)}</select></label><label><input type="checkbox" checked={favoritesOnly} onChange={(event) => setFavoritesOnly(event.target.checked)} />只看收藏</label><span>{meta.martialSoulCodex.length} 种</span></div>
          <div className="martial-soul-codex">
            {meta.martialSoulCodex.filter((entry) => soulRarityFilter === "全部" || entry.rarity === soulRarityFilter).filter((entry) => !favoritesOnly || entry.favorite).filter((entry) => `${entry.name}${entry.category}${entry.rarity}${entry.description}${entry.growthRoutes.join("")}`.toLowerCase().includes(soulSearch.trim().toLowerCase())).sort((left, right) => Number(Boolean(right.favorite)) - Number(Boolean(left.favorite))).map((entry) => <article key={entry.id} className={`codex-soul-card soul-rarity-${entry.rarity} ${lastDrawId === entry.id ? "new-draw" : ""}`}>
              <header><span>{entry.rarity}</span><strong>{entry.name}</strong><small>{entry.category}</small></header>
              <p>{entry.description}</p>
              <dl><div><dt>开局使用</dt><dd>永久无限</dd></div><div><dt>通关</dt><dd>{entry.completedRuns} 次</dd></div><div><dt>初始魂力记录</dt><dd>{entry.initialSoulPowers.length ? entry.initialSoulPowers.map((value) => `${value}级`).join("、") : "通关后记录"}</dd></div></dl>
              <div className="codex-routes">{entry.completedRuns > 0 ? entry.growthRoutes.slice(-3).map((route) => <span key={route}>{route}</span>) : <span>成长路线尚未写入</span>}</div>
              <footer><button type="button" className={meta.equippedMartialSoulId === entry.id ? "active" : ""} onClick={() => void equipSoul(meta.equippedMartialSoulId === entry.id ? undefined : entry.id)}>{meta.equippedMartialSoulId === entry.id ? "已指定下局" : "设为下局武魂"}</button><button type="button" className={entry.favorite ? "active" : ""} onClick={() => void favoriteSoul(entry.id, !entry.favorite)}>{entry.favorite ? "★ 已收藏" : "☆ 收藏"}</button><label><input type="checkbox" checked={entry.enabled} onChange={(event) => void toggleSoul(entry.id, event.target.checked)} />允许随机出场</label><button type="button" className="danger-button" onClick={() => void deleteSoul(entry.id, entry.name)}>删除</button></footer>
            </article>)}
            {!meta.martialSoulCodex.length && <p className="meta-empty-copy">仓库为空。召唤获得的武魂会出现在这里。</p>}
          </div></>}
        </section>}

        {summonTab === "origins" && <section className="meta-section origin-warehouse-section">
          <div className="meta-section-heading"><div><h3>身世仓库</h3><p>专属召唤每抽必得紫色以上身世；金色10抽、红色30抽、七彩60抽独立保底。七彩档明显超模，同时必带监控、责任或追索条件。</p></div><div className="origin-heading-actions"><button type="button" className="soul-draw-button" onClick={() => void drawOrigin()}>{meta.martialSoulDrawTickets > 0 ? `身世召唤 · 券 ${meta.martialSoulDrawTickets}` : temporaryUnlimitedLegacy ? "身世召唤 · ∞点" : "身世召唤 · 20点"}</button><button type="button" onClick={() => setOriginWarehouseExpanded((value) => !value)}>{originWarehouseExpanded ? "收起身世仓库" : "展开身世仓库"}</button></div></div>
          <div className="soul-draw-rules origin-pity-rules"><span>最低紫色</span><span>金色保底 {10 - meta.originGoldPity} 抽</span><span>红色保底 {30 - meta.originRedPity} 抽</span><span>七彩保底 {60 - meta.originRainbowPity} 抽</span></div>
          {meta.equippedOriginId && <div className="equipped-soul-line"><span>下局指定</span><strong>{meta.originCodex.find((item) => item.id === meta.equippedOriginId)?.name}</strong><button type="button" onClick={() => void equipOrigin()}>取消</button></div>}
          {originWarehouseExpanded && <><div className="warehouse-tools"><input value={originSearch} onChange={(event) => setOriginSearch(event.target.value)} placeholder="搜索身世、优势、代价或时代" /><label><span>稀有度</span><select value={originRarityFilter} onChange={(event) => setOriginRarityFilter(event.target.value as typeof originRarityFilter)}>{["全部", "紫色", "金色", "红色", "七彩"].map((rarity) => <option key={rarity}>{rarity}</option>)}</select></label><span>{meta.originCodex.length} 种</span></div>
          <div className="martial-soul-codex origin-codex">
            {meta.originCodex.filter((entry) => originRarityFilter === "全部" || entry.rarity === originRarityFilter).filter((entry) => `${entry.name}${entry.summary}${entry.advantage}${entry.burden}${entry.era}`.toLowerCase().includes(originSearch.trim().toLowerCase())).sort((left, right) => Number(Boolean(right.favorite)) - Number(Boolean(left.favorite))).map((entry) => <article key={entry.id} className={`codex-soul-card soul-rarity-${entry.rarity} ${lastDrawId === entry.id ? "new-draw" : ""}`}>
              <header><span>{entry.rarity}</span><strong>{entry.name}</strong><small>斗罗{["", "一", "二", "三", "四"][entry.era]}时代</small></header>
              <p>{entry.summary}</p>
              <dl><div><dt>开局使用</dt><dd>永久无限</dd></div><div><dt>核心优势</dt><dd>{entry.advantage}</dd></div><div><dt>约束代价</dt><dd>{entry.burden}</dd></div></dl>
              <footer><button type="button" className={meta.equippedOriginId === entry.id ? "active" : ""} onClick={() => void equipOrigin(meta.equippedOriginId === entry.id ? undefined : entry.id)}>{meta.equippedOriginId === entry.id ? "已指定下局" : "设为下局身世"}</button><button type="button" className={entry.favorite ? "active" : ""} onClick={() => void favoriteOrigin(entry.id, !entry.favorite)}>{entry.favorite ? "★ 已收藏" : "☆ 收藏"}</button><button type="button" className="danger-button" onClick={() => void deleteOrigin(entry.id, entry.name)}>删除</button></footer>
            </article>)}
            {!meta.originCodex.length && <p className="meta-empty-copy">仓库为空。召唤获得的身世会出现在这里，最低为紫色。</p>}
          </div></>}
        </section>}

        {summonTab === "heirlooms" && <section className="meta-section heirloom-warehouse-section"><div className="meta-section-heading"><div><h3>遗物仓库</h3><p>遗物能力允许明显超出常规成长，但受严格触发条件和每局发动次数限制；每局只能携带一件。</p></div><button type="button" onClick={() => setHeirloomWarehouseExpanded((value) => !value)}>{heirloomWarehouseExpanded ? "收起仓库" : "展开仓库"}</button></div>{heirloomWarehouseExpanded && <>{meta.equippedHeirloom && <div className="equipped-soul-line"><span>下局携带</span><strong>{meta.equippedHeirloom}</strong><button type="button" onClick={() => void equip()}>卸下</button></div>}<div className="warehouse-tools"><label><span>稀有度</span><select value={heirloomRarityFilter} onChange={(event) => setHeirloomRarityFilter(event.target.value as typeof heirloomRarityFilter)}>{["全部", "紫色", "金色", "红色"].map((rarity) => <option key={rarity}>{rarity}</option>)}</select></label><span>{meta.unlockedHeirlooms.length} 件</span></div><div className="heirloom-list">{meta.unlockedHeirlooms.length ? meta.unlockedHeirlooms.filter((item) => heirloomRarityFilter === "全部" || heirloomByName(item)?.rarity === heirloomRarityFilter).map((item) => { const definition = heirloomByName(item); return <article key={item} className={meta.equippedHeirloom === item ? "active" : ""}><header><strong>{item}</strong><span>{definition?.rarity ?? "已解锁"} · 每局{definition?.maxUses ?? 1}次</span></header><p>{definition?.description ?? "一件来自旧周目的遗物。"}</p><small>{definition?.effect ?? "携带后会在符合条件时发挥作用。"}</small><em>触发：{definition?.trigger ?? "满足遗物条件"}</em><button type="button" onClick={() => void equip(meta.equippedHeirloom === item ? undefined : item)}>{meta.equippedHeirloom === item ? "已携带 · 点击卸下" : "下局携带"}</button></article>; }) : <p className="meta-empty-copy">遗物仓库为空。召唤出现遗物后会直接存入这里。</p>}</div></>}</section>}

        <section className="meta-section"><div className="meta-section-heading"><h3>下轮偏好</h3><p>只增加出现概率，不锁定结果。</p></div><div className="preference-grid">
          {(Object.keys(PREFERENCE_OPTIONS) as Array<keyof typeof PREFERENCE_OPTIONS>).map((key) => <label key={key}><span>{key === "origin" ? "出身" : key === "martialSoul" ? "武魂" : "奇遇"}</span><select value={preferences[key]} onChange={(event) => setPreferences({ ...preferences, [key]: event.target.value })}>{PREFERENCE_OPTIONS[key].map((item) => <option key={item}>{item}</option>)}{key === "gift" && GOLD_FINGER_CATEGORIES.map((category) => <optgroup key={category} label={`${category} · 10种`}>{GOLD_FINGERS.filter((item) => item.category === category).map((item) => <option key={item.id} value={item.preference}>{item.name}</option>)}</optgroup>)}</select></label>)}
          <button type="button" className="primary-button" onClick={() => void save()}>保存偏好</button>
        </div></section>

        <section className="meta-section"><div className="meta-section-heading"><h3>难度结算</h3></div><div className="budget-grid">{DIFFICULTIES.map((difficulty) => <article key={difficulty}><strong>{difficulty}</strong><span>{meta.difficultyBudgets[difficulty]} 预算</span><small>结算 ×{meta.difficultyMultipliers[difficulty].toFixed(2)}</small></article>)}</div></section>

        <section className="meta-section"><div className="meta-section-heading"><h3>传承强化</h3><p>消耗传承点，效果会带进之后的新存档。</p></div><div className="legacy-upgrade-grid">
          {([{"name":"命运余量","cost":30,"copy":"提高特殊开局与隐藏传承的权重"},{"name":"稳固根基","cost":40,"copy":"提高开局根基和濒死后的承载能力"},{"name":"旧世见闻","cost":50,"copy":"开局认出更多身边的重要人物"}] as const).map((upgrade) => { const level = meta.purchasedUpgrades[upgrade.name] ?? 0; const cost = upgrade.cost * (level + 1); return <article key={upgrade.name}><span>等级 {level}/3</span><strong>{upgrade.name}</strong><p>{upgrade.copy}</p><button type="button" disabled={level >= (upgrade.name === "旧世见闻" ? 2 : 3) || meta.legacyPoints < cost} onClick={() => void purchase(upgrade.name)}>{level >= (upgrade.name === "旧世见闻" ? 2 : 3) ? "已满" : `${cost} 点提升`}</button></article>; })}
        </div></section>

        <section className="meta-section"><div className="meta-section-heading"><h3>已解锁</h3></div><div className="meta-unlocks"><UnlockList title="出身" items={meta.unlockedOrigins} empty="暂无" /><UnlockList title="武魂" items={meta.unlockedMartialSouls} empty="暂无" /><UnlockList title="特质" items={meta.unlockedTraits} empty="暂无" /><UnlockList title="魂兽图鉴" items={meta.codexEntries} empty="暂无" /></div></section>

        {catalog && <section className="meta-section"><div className="meta-section-heading"><h3>世界资料库</h3><p>人物随年份变化，叙事规则按当前行动自动启用。</p></div><div className="catalog-grid"><article><strong>{catalog.birthProfiles}</strong><span>具体出生档案</span></article><article><strong>{catalog.martialSouls}</strong><span>可觉醒武魂</span></article><article><strong>{catalog.characters}</strong><span>重要人物与凶兽</span></article><article><strong>{catalog.powerSnapshots}</strong><span>实力节点</span></article><article><strong>{catalog.factions}</strong><span>势力</span></article><article><strong>{catalog.locations}</strong><span>地点</span></article><article><strong>{catalog.events}</strong><span>历史事件</span></article><article><strong>{catalog.soulBeasts}</strong><span>魂兽</span></article><article><strong>{catalog.narrativeRules}</strong><span>叙事规则</span></article></div><details className="catalog-help"><summary>这些数字分别代表什么</summary><dl><div><dt>出生档案</dt><dd>人工核心身份与家庭气氛、具体住处等参数组成的可复现档案数量；不会用职业和矛盾做千条换词式组合。</dd></div><div><dt>可觉醒武魂</dt><dd>四部原作收录、原创武魂和局外图鉴武魂的当前总数。</dd></div><div><dt>重要人物与凶兽</dt><dd>拥有独立位置、目标、状态和时间变化的可交互实体。</dd></div><div><dt>实力节点</dt><dd>人物在特定原作年份的等级或实力记录，年份之间由程序推算。</dd></div><div><dt>势力与地点</dt><dd>可用于身份、关系、旅行、地图和事件推演的结构化节点。</dd></div><div><dt>历史事件</dt><dd>带原作年份与参与者的关键节点；只有玩家真实影响相关因果后才可能改变。</dd></div><div><dt>魂兽</dt><dd>猎魂、调查和生态遭遇使用的魂兽种类模板；有名字的高智慧凶兽另计入人物。</dd></div><div><dt>叙事规则</dt><dd>四个时代各一千条写作检查项，按当前行动检索，不会一次全部塞给模型。</dd></div></dl></details></section>}
      </>}
    </section>
  </div>;
}
