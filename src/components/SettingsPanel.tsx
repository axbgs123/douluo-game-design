import { useEffect, useState } from "react";
import type { DeepSeekSettingsView } from "../../shared/game";
import { getDeepSeekSettings, saveDeepSeekSettings } from "../api";

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

  useEffect(() => {
    if (!open) return;
    void getDeepSeekSettings().then((settings) => {
      setView(settings);
      setBaseUrl(settings.baseUrl);
      setModel(settings.model);
      setNovelEngineEnabled(settings.novelEngineEnabled);
    }).catch((error: Error) => setMessage(error.message));
  }, [open]);

  if (!open) return null;
  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="settings-modal" role="dialog" aria-modal="true" aria-label="DeepSeek 设置" onMouseDown={(event) => event.stopPropagation()}>
      <button type="button" className="modal-close" onClick={onClose}>×</button>
      <p className="eyebrow">本地模型</p>
      <h2>DeepSeek 设置</h2>
      <p className="settings-copy">API Key 仅保存在本机 <code>.data</code>。</p>
      <p className="settings-copy">复杂行动会先整理语义，再生成正文并更新长期记忆。</p>
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
