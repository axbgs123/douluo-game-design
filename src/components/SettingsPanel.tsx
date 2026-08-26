import { useEffect, useState } from "react";
import type { DeepSeekSettingsView, ModelUsageView } from "../../shared/game";
import { getDeepSeekSettings, getModelUsage, saveDeepSeekSettings } from "../api";

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
  onSaved?: (view: DeepSeekSettingsView) => void;
}

export function SettingsPanel({ open, onClose, onSaved }: SettingsPanelProps) {
  const [view, setView] = useState<DeepSeekSettingsView | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("https://api.deepseek.com");
  const [model, setModel] = useState("deepseek-v4-flash");
  const [novelEngineEnabled, setNovelEngineEnabled] = useState(true);
  const [message, setMessage] = useState("");
  const [usage, setUsage] = useState<ModelUsageView | null>(null);

  useEffect(() => {
    if (!open) return;
    void getDeepSeekSettings().then((settings) => {
      setView(settings);
      setBaseUrl(settings.baseUrl);
      setModel(settings.model);
      setNovelEngineEnabled(settings.novelEngineEnabled);
    }).catch((error: Error) => setMessage(error.message));
    void getModelUsage().then(setUsage).catch(() => undefined);
  }, [open]);

  if (!open) return null;
  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="settings-modal" role="dialog" aria-modal="true" aria-label="DeepSeek 设置" onMouseDown={(event) => event.stopPropagation()}>
      <button type="button" className="modal-close" onClick={onClose}>×</button>
      <p className="eyebrow">本地模型</p>
      <h2>DeepSeek 设置</h2>
      <p className="settings-copy">API Key 仅保存在本机 <code>.data</code>。</p>
      <p className="settings-copy">复杂行动会先整理语义，再生成正文并更新长期记忆。</p>
      {usage && <p className="settings-copy">本机调用统计：{usage.calls} 次 · 失败 {usage.failures} 次 · {usage.totalTokens || "未返回"} tokens · 累计 {(usage.totalLatencyMs / 1000).toFixed(1)} 秒。只记录计数、延迟与状态，不保存提示词或正文。</p>}
      {usage && <p className="settings-copy">本地向量记忆：{usage.vectorMemories} 条场景 · {usage.memoryChapters} 个章节索引 · {usage.vectorDimensions} 维。每回合先选最多 {usage.chapterRetrievalLimit} 个相关章节，再从其中召回最多 {usage.vectorRetrievalLimit} 条旧事。</p>}
      {usage && <p className="settings-copy">斗罗世界知识：{usage.canonKnowledgeVectors} 条 · 每回合最多召回 {usage.canonRetrievalLimit} 条人物阶段、关键关系、势力、地点、事件与魂兽生态。</p>}
      {usage && <p className="settings-copy">世界基本逻辑：{usage.worldLogicVectors} 条 · 每回合最多召回 {usage.worldLogicRetrievalLimit} 条异常反应、培养争夺、资源倾斜、秘密暴露和敌对风险链。</p>}
      {usage && <p className="settings-copy">生成前检索审计：累计 {usage.contextRetrievals} 次；最近一次正文实际注入存档记忆 {usage.lastRetrievedMemoryCount} 条、原著知识 {usage.lastRetrievedCanonCount} 条、基本逻辑 {usage.lastRetrievedLogicCount} 条{usage.lastContextRetrievalAt ? ` · ${new Date(usage.lastContextRetrievalAt).toLocaleString("zh-CN")}` : ""}。</p>}
      {usage && <p className={`settings-copy ${usage.contextRetrievalReady ? "retrieval-ready" : "retrieval-warning"}`}>正文检索验收：{usage.contextRetrievalStatus} · 已记录正文检索 {usage.narratorContextRetrievals} 次。存档记忆为0条可以是新存档的正常结果，但原著知识或基本逻辑为0条时不能视为通过。</p>}
      {usage && (usage.lastRetrievedMemoryLabels.length > 0 || usage.lastRetrievedCanonLabels.length > 0 || usage.lastRetrievedLogicLabels.length > 0) && <details className="settings-copy"><summary>查看最近一次实际注入内容</summary><p>剧情记忆（来自 {usage.lastRetrievedChapterCount} 个章节）：{usage.lastRetrievedMemoryLabels.join("；") || "无"}</p><p>原著知识：{usage.lastRetrievedCanonLabels.join("；") || "无"}</p><p>世界逻辑：{usage.lastRetrievedLogicLabels.join("；") || "无"}</p></details>}
      <form onSubmit={(event) => {
        event.preventDefault();
        if (!apiKey.trim() && !view?.hasKey) return;
        void saveDeepSeekSettings({ apiKey: apiKey.trim() || undefined, baseUrl, model, novelEngineEnabled })
          .then((settings) => { setView(settings); setApiKey(""); setMessage("已保存在本机，可以开始正式推演。"); onSaved?.(settings); })
          .catch((error: Error) => setMessage(error.message));
      }}>
        <label>API Key<input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={view?.hasKey ? "已配置；输入新值可覆盖" : "sk-…"} /></label>
        <label>Base URL<input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} /></label>
        <label>模型<input value={model} onChange={(event) => setModel(event.target.value)} /></label>
        <label className="engine-toggle"><input type="checkbox" checked={novelEngineEnabled} onChange={(event) => setNovelEngineEnabled(event.target.checked)} /><span><b>增强小说引擎</b><small>按情境启用连续性、世界规则、人物声音与第三人称正文审校。</small></span></label>
        {message && <p className="settings-message">{message}</p>}
        <button type="submit" className="primary-button" disabled={!apiKey.trim() && !view?.hasKey}>保存设置</button>
        {view?.hasKey && <button type="button" className="ghost-button" onClick={() => {
          void saveDeepSeekSettings({ clearApiKey: true, baseUrl, model, novelEngineEnabled })
            .then((settings) => { setView(settings); setApiKey(""); setMessage("已删除本机保存的 API Key。"); onSaved?.(settings); })
            .catch((error: Error) => setMessage(error.message));
        }}>断开并删除 API Key</button>}
      </form>
    </section>
  </div>;
}
