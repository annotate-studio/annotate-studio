'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Circle,
  Copy,
  Cpu,
  Database,
  Download,
  Keyboard,
  Loader2,
  Monitor,
  Palette,
  PlugZap,
  Trash2,
  Upload,
  Wifi,
  WifiOff,
} from 'lucide-react';
import {
  addAIProvider,
  checkOllama,
  exportData,
  getDataDir,
  importData,
  isTauri,
  removeAIProvider,
  reserveCommands,
  setDefaultAIProvider,
  testAIProvider,
  type ProviderInfo,
} from '@/lib/tauri-commands';
import { flushAll } from '@/lib/persist';
import { copyText, cn } from '@/lib/utils';
import { THEME_IDS, useSettings, type ThemeMode } from '@/store/settings';
import { PROVIDER_LABELS, useProviders } from '@/store/providers';
import { confirmDialog } from '@/store/dialogs';
import { toast } from '@/store/toast';

type Pane = 'appearance' | 'interface' | 'providers' | 'data' | 'shortcuts';

const PANES: { id: Pane; label: string; icon: React.ReactNode }[] = [
  { id: 'appearance', label: 'Appearance', icon: <Palette size={16} /> },
  { id: 'interface', label: 'Interface', icon: <Monitor size={16} /> },
  { id: 'providers', label: 'AI providers', icon: <Cpu size={16} /> },
  { id: 'data', label: 'Data & backup', icon: <Database size={16} /> },
  { id: 'shortcuts', label: 'Shortcuts', icon: <Keyboard size={16} /> },
];

const THEME_PREVIEW: Record<ThemeMode, { label: string; bg: string; card: string; text: string }> = {
  white: { label: 'Light', bg: '#F6F7F9', card: '#FFFFFF', text: '#0F172A' },
  black: { label: 'Dark', bg: '#0B0B0E', card: '#18181B', text: '#FAFAFA' },
  sepia: { label: 'Sepia', bg: '#F4ECDD', card: '#FFF8EE', text: '#2C1810' },
  gray: { label: 'Gray', bg: '#E9EAEE', card: '#FAFAFB', text: '#1F2024' },
  forest: { label: 'Forest', bg: '#E8F1E8', card: '#F8FFF8', text: '#1A2E1A' },
  ocean: { label: 'Ocean', bg: '#E4F0F6', card: '#F4FAFD', text: '#0C2D48' },
  lavender: { label: 'Lavender', bg: '#EEE7F6', card: '#FAF7FD', text: '#1E0A3C' },
  rose: { label: 'Rose', bg: '#FBEAEA', card: '#FFFAFA', text: '#3C1010' },
};

const ACCENTS = ['#2563EB', '#7C3AED', '#DB2777', '#DC2626', '#EA580C', '#16A34A', '#0D9488', '#0891B2'];

const PROVIDER_ORDER = ['openai', 'anthropic', 'google-gemini', 'ollama', 'openrouter', 'groq', 'deepseek', 'mistral', 'together', 'xai', 'perplexity', 'cohere'];

const MODEL_HINTS: Record<string, string> = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-sonnet-5-5',
  'google-gemini': 'gemini-2.0-flash',
  ollama: 'llama3.1',
  openrouter: 'openrouter/auto',
  groq: 'llama-3.3-70b-versatile',
  deepseek: 'deepseek-chat',
  mistral: 'mistral-large-latest',
  together: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
  xai: 'grok-2-latest',
  perplexity: 'sonar-pro',
  cohere: 'command-r-plus',
};

const SHORTCUTS: { keys: string; action: string }[] = [
  { keys: 'Ctrl + 1…6 / Ctrl + ,', action: 'Go to canvas, library, flashcards, exams, pomodoro, motivation / settings' },
  { keys: 'Ctrl + J', action: 'Show or hide the assistant' },
  { keys: 'Drag background / Space + drag / middle mouse', action: 'Pan the canvas' },
  { keys: 'Ctrl + scroll, pinch', action: 'Zoom the canvas around the pointer' },
  { keys: 'Ctrl + = / Ctrl + - / Ctrl + 0', action: 'Zoom in, out, reset (PDF zoom when a PDF window is active)' },
  { keys: 'Shift + 1 / Shift + 2', action: 'Fit all windows / zoom to the selected window' },
  { keys: 'Ctrl + Z / Ctrl + Shift + Z', action: 'Undo / redo (layout, or annotations in the active PDF)' },
  { keys: 'Double-click canvas', action: 'Create a note at that spot' },
  { keys: 'Double-click title bar', action: 'Maximize or restore a window' },
  { keys: 'Shift while dragging', action: 'Snap windows to a 20px grid' },
  { keys: 'Esc', action: 'Restore a maximized window / deselect' },
  { keys: 'Ctrl + Alt + N', action: 'New note' },
  { keys: 'V H P M T R O A E', action: 'PDF tools: select, highlight, pen, marker, text, rectangle, ellipse, arrow, eraser' },
  { keys: 'Delete', action: 'Delete selected PDF annotations' },
  { keys: 'Ctrl + B / I / E / K', action: 'Bold, italic, code, link in notes' },
  { keys: 'Space, 1–4', action: 'Flip card and rate it while reviewing flashcards' },
];

function ProvidersPane() {
  const providers = useProviders((state) => state.providers);
  const setProviders = useProviders((state) => state.set);
  const refresh = useProviders((state) => state.refresh);
  const [type, setType] = useState('openai');
  const [apiKey, setApiKey] = useState('');
  const [endpoint, setEndpoint] = useState('');
  const [model, setModel] = useState('');
  const [makeDefault, setMakeDefault] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [ollama, setOllama] = useState<boolean | null>(null);

  useEffect(() => {
    void refresh();
    checkOllama().then(setOllama).catch(() => setOllama(false));
  }, [refresh]);

  const needsKey = type !== 'ollama';
  const hasEndpoint = type === 'ollama' || type === 'openrouter';

  const test = async (id: string) => {
    setTesting(id);
    try {
      const response = await testAIProvider(id);
      toast.success(`${response.model} is working`, response.content.slice(0, 120));
    } catch (error) {
      toast.error('Connection test failed', error);
    } finally {
      setTesting(null);
    }
  };

  const save = async (andTest: boolean) => {
    if (needsKey && !apiKey.trim()) {
      toast.warning('Enter an API key first');
      return;
    }
    setSaving(true);
    try {
      const next = await addAIProvider(type, apiKey.trim() || undefined, endpoint.trim() || undefined, model.trim() || undefined, makeDefault || providers.length === 0);
      setProviders(next);
      const added = next.find((p) => p.type === type && (!model.trim() || p.model === model.trim())) ?? next[next.length - 1];
      toast.success('Provider saved', added ? `${PROVIDER_LABELS[added.type] ?? added.type} · ${added.model}` : undefined);
      setApiKey('');
      setModel('');
      if (andTest && added) await test(added.id);
    } catch (error) {
      toast.error('Could not save the provider', error);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (provider: ProviderInfo) => {
    const ok = await confirmDialog({ title: `Remove ${provider.model}?`, message: 'Its API key will be deleted from this computer.', confirmLabel: 'Remove', danger: true });
    if (!ok) return;
    try {
      setProviders(await removeAIProvider(provider.type, provider.model));
    } catch (error) {
      toast.error('Could not remove the provider', error);
    }
  };

  return (
    <div className="settings-section">
      <h2>AI providers</h2>
      <p className="muted">AI features are optional. Your keys are stored only on this computer and requests go directly to the provider you choose.</p>

      <div className={cn('status-row', ollama ? 'status-ok' : 'status-off')}>
        {ollama === null ? <Loader2 size={14} className="spin" /> : ollama ? <Wifi size={14} /> : <WifiOff size={14} />}
        {ollama === null ? 'Looking for Ollama…' : ollama ? 'Ollama is running on this computer' : 'Ollama was not found on localhost:11434'}
      </div>

      <div className="settings-card">
        <h3>Your models</h3>
        {providers.length === 0 ? (
          <p className="muted">No providers yet — add one below.</p>
        ) : (
          <div className="provider-list">
            {providers.map((provider) => (
              <div key={provider.id} className={cn('provider-row', provider.active && 'provider-row-active')}>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={async () => setProviders(await setDefaultAIProvider(provider.type, provider.model))}
                  title={provider.active ? 'Default model' : 'Make default'}
                >
                  {provider.active ? <CheckCircle2 size={17} /> : <Circle size={17} />}
                </button>
                <div className="provider-info">
                  <strong>{provider.model}</strong>
                  <span>
                    {PROVIDER_LABELS[provider.type] ?? provider.type}
                    {provider.endpoint ? ` · ${provider.endpoint}` : ''}
                    {provider.active ? ' · default' : ''}
                  </span>
                </div>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => void test(provider.id)} disabled={testing !== null}>
                  {testing === provider.id ? <Loader2 size={13} className="spin" /> : <PlugZap size={13} />} Test
                </button>
                <button type="button" className="icon-btn icon-btn-danger" onClick={() => void remove(provider)} title="Remove">
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="settings-card">
        <h3>Add a model</h3>
        <div className="chip-row">
          {PROVIDER_ORDER.map((id) => (
            <button
              key={id}
              type="button"
              className={cn('chip', type === id && 'chip-active')}
              onClick={() => {
                setType(id);
                setEndpoint('');
                setModel('');
              }}
            >
              {PROVIDER_LABELS[id] ?? id}
            </button>
          ))}
        </div>
        <div className="form-grid form-grid-2">
          {needsKey && (
            <label className="field field-wide">
              <span className="field-label">API key</span>
              <input className="input mono" type="password" value={apiKey} autoComplete="off" onChange={(event) => setApiKey(event.target.value)} placeholder={`${PROVIDER_LABELS[type] ?? type} API key`} />
            </label>
          )}
          {hasEndpoint && (
            <label className="field field-wide">
              <span className="field-label">Endpoint</span>
              <input
                className="input mono"
                value={endpoint}
                onChange={(event) => setEndpoint(event.target.value)}
                placeholder={type === 'ollama' ? 'http://localhost:11434' : 'https://openrouter.ai/api/v1'}
              />
            </label>
          )}
          <label className="field field-wide">
            <span className="field-label">Model</span>
            <input className="input mono" value={model} onChange={(event) => setModel(event.target.value)} placeholder={MODEL_HINTS[type] ?? 'model name'} />
          </label>
          <label className="checkbox-row field-wide">
            <input type="checkbox" checked={makeDefault} onChange={(event) => setMakeDefault(event.target.checked)} />
            Use as the default model
          </label>
        </div>
        <div className="button-row">
          <button type="button" className="btn btn-primary" onClick={() => void save(false)} disabled={saving}>
            {saving ? <Loader2 size={15} className="spin" /> : <Check size={15} />} Save
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => void save(true)} disabled={saving}>
            <PlugZap size={15} /> Save and test
          </button>
        </div>
      </div>
    </div>
  );
}

function DataPane() {
  const [dataDir, setDataDir] = useState('');
  const [busy, setBusy] = useState<'export' | 'import' | null>(null);

  useEffect(() => {
    getDataDir().then(setDataDir).catch(() => setDataDir(''));
  }, []);

  const doExport = async () => {
    if (!isTauri()) return;
    const { save } = await import('@tauri-apps/plugin-dialog');
    const path = await save({
      defaultPath: `annotate-studio-${new Date().toISOString().slice(0, 10)}.anos`,
      filters: [{ name: 'Annotate Studio backup', extensions: ['anos'] }],
    });
    if (!path) return;
    setBusy('export');
    try {
      await flushAll();
      const count = await exportData(path);
      toast.success('Backup saved', `${count} files · ${path}`);
    } catch (error) {
      toast.error('Backup failed', error);
    } finally {
      setBusy(null);
    }
  };

  const doImport = async () => {
    if (!isTauri()) return;
    const { open } = await import('@tauri-apps/plugin-dialog');
    const selection = await open({ multiple: false, filters: [{ name: 'Annotate Studio backup', extensions: ['anos', 'zip'] }] });
    if (!selection || Array.isArray(selection)) return;
    const ok = await confirmDialog({
      title: 'Restore this backup?',
      message: 'Files in the backup replace your current data. A safety copy of your current data is saved in the backups folder first.',
      confirmLabel: 'Restore',
      danger: true,
    });
    if (!ok) return;
    setBusy('import');
    try {
      await flushAll();
      reserveCommands('import_data');
      const count = await importData(selection);
      toast.success('Backup restored', `${count} files — reloading…`);
      setTimeout(() => window.location.reload(), 900);
    } catch (error) {
      reserveCommands(null);
      toast.error('Restore failed', error);
      setBusy(null);
    }
  };

  return (
    <div className="settings-section">
      <h2>Data & backup</h2>
      <div className="settings-card">
        <h3>Where your data lives</h3>
        <p className="muted">Everything is stored locally in this folder: documents, notes, canvas layouts, flashcards, exams and settings.</p>
        <div className="path-row">
          <code>{dataDir || '…'}</code>
          <button type="button" className="icon-btn" onClick={() => void copyText(dataDir).then((ok) => ok && toast.success('Path copied'))} title="Copy path">
            <Copy size={14} />
          </button>
        </div>
      </div>
      <div className="settings-card">
        <h3>Back up everything</h3>
        <p className="muted">Save all your study data into a single .anos file you can restore later or on another computer.</p>
        <button type="button" className="btn btn-primary" onClick={() => void doExport()} disabled={busy !== null}>
          {busy === 'export' ? <Loader2 size={15} className="spin" /> : <Download size={15} />} Create backup
        </button>
      </div>
      <div className="settings-card">
        <h3>Restore from a backup</h3>
        <p className="muted">Replaces current data with the contents of a backup file.</p>
        <button type="button" className="btn btn-secondary" onClick={() => void doImport()} disabled={busy !== null}>
          {busy === 'import' ? <Loader2 size={15} className="spin" /> : <Upload size={15} />} Restore backup…
        </button>
      </div>
    </div>
  );
}

export default function SettingsTab() {
  const [pane, setPane] = useState<Pane>('appearance');
  const theme = useSettings((state) => state.theme);
  const primaryColor = useSettings((state) => state.primaryColor);
  const appScale = useSettings((state) => state.appScale);
  const notificationsEnabled = useSettings((state) => state.notificationsEnabled);
  const update = useSettings((state) => state.update);
  const scales = useMemo(() => [90, 100, 110, 125, 150], []);

  return (
    <div className="split-page">
      <aside className="side-panel">
        <div className="side-panel-header">
          <span>Settings</span>
        </div>
        <div className="side-panel-list">
          {PANES.map((entry) => (
            <div key={entry.id} className={cn('side-item', pane === entry.id && 'side-item-active')}>
              <button type="button" className="side-item-main" onClick={() => setPane(entry.id)}>
                {entry.icon}
                <span className="side-item-label">{entry.label}</span>
              </button>
            </div>
          ))}
        </div>
      </aside>
      <section className="page page-narrow">
        {pane === 'appearance' && (
          <div className="settings-section">
            <h2>Appearance</h2>
            <div className="settings-card">
              <h3>Theme</h3>
              <div className="theme-grid">
                {THEME_IDS.map((id) => {
                  const preview = THEME_PREVIEW[id];
                  return (
                    <button key={id} type="button" className={cn('theme-tile', theme === id && 'theme-tile-active')} onClick={() => update({ theme: id })}>
                      <span className="theme-swatch" style={{ background: preview.bg }}>
                        <span style={{ background: preview.card, color: preview.text }}>Aa</span>
                      </span>
                      <span>{preview.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="settings-card">
              <h3>Accent color</h3>
              <div className="accent-row">
                {ACCENTS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={cn('accent-dot', primaryColor.toLowerCase() === color.toLowerCase() && 'accent-dot-active')}
                    style={{ background: color }}
                    onClick={() => update({ primaryColor: color })}
                    aria-label={`Accent ${color}`}
                  />
                ))}
                <label className="accent-custom" title="Custom color">
                  <input type="color" value={primaryColor} onChange={(event) => update({ primaryColor: event.target.value.toUpperCase() })} />
                  <span className="mono">{primaryColor}</span>
                </label>
              </div>
            </div>
          </div>
        )}

        {pane === 'interface' && (
          <div className="settings-section">
            <h2>Interface</h2>
            <div className="settings-card">
              <h3>Interface size</h3>
              <input
                type="range"
                min={80}
                max={200}
                step={5}
                value={appScale}
                onChange={(event) => update({ appScale: Number(event.target.value) })}
                className="range"
              />
              <div className="chip-row">
                {scales.map((value) => (
                  <button key={value} type="button" className={cn('chip', appScale === value && 'chip-active')} onClick={() => update({ appScale: value })}>
                    {value}%
                  </button>
                ))}
                <span className="muted">Current: {appScale}%</span>
              </div>
            </div>
            <div className="settings-card">
              <h3>Notifications</h3>
              <label className="checkbox-row">
                <input type="checkbox" checked={notificationsEnabled} onChange={(event) => update({ notificationsEnabled: event.target.checked })} />
                Notify me when a Pomodoro phase ends and when flashcards are due
              </label>
            </div>
          </div>
        )}

        {pane === 'providers' && <ProvidersPane />}
        {pane === 'data' && <DataPane />}

        {pane === 'shortcuts' && (
          <div className="settings-section">
            <h2>Keyboard shortcuts</h2>
            <div className="settings-card">
              <table className="shortcut-table">
                <tbody>
                  {SHORTCUTS.map((shortcut) => (
                    <tr key={shortcut.keys}>
                      <td>
                        <kbd>{shortcut.keys}</kbd>
                      </td>
                      <td>{shortcut.action}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
