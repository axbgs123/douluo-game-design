import { useEffect, useState } from "react";
import type { DeepSeekSettingsView } from "../../shared/game";
import { getDeepSeekSettings, saveDeepSeekSettings } from "../api";

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
}

export function SettingsPanel({ open, onClose }: SettingsPanelProps) {
  const [view, setView] = useState<DeepSeekSettingsView | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("https://api.deepseek.com");
  const [model, setModel] = useState("deepseek-v4-flash");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!open) return;
    void getDeepSeekSettings().then((settings) => {
      setView(settings);
      setBaseUrl(settings.baseUrl);
      setModel(settings.model);
    }).catch((error: Error) => setMessage(error.message));
  }, [open]);

  if (!open) return null;
  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="settings-modal" role="dialog" aria-modal="true" aria-label="DeepSeek 设置" onMouseDown={(event) => event.stopPropagation()}>
      <button type="button" className="modal-close" onClick={onClose}>×</button>
      <p className="eyebrow">本地模型</p>
      <h2>DeepSeek 设置</h2>
      <p className="settings-copy">API Key 仅保存在本机 <code>.data</code>。</p>
      <form onSubmit={(event) => {
        event.preventDefault();
        if (!apiKey.trim()) return;
        void saveDeepSeekSettings({ apiKey, baseUrl, model })
          .then((settings) => { setView(settings); setApiKey(""); setMessage("已保存在本机。"); })
          .catch((error: Error) => setMessage(error.message));
      }}>
        <label>API Key<input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={view?.hasKey ? "已配置；输入新值可覆盖" : "sk-…"} /></label>
        <label>Base URL<input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} /></label>
        <label>模型<input value={model} onChange={(event) => setModel(event.target.value)} /></label>
        {message && <p className="settings-message">{message}</p>}
        <button type="submit" className="primary-button" disabled={!apiKey.trim()}>保存设置</button>
      </form>
    </section>
  </div>;
}
