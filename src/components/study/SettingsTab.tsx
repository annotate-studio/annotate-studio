'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Sun, Moon, Palette, Cpu, Zap, Wifi, WifiOff, RefreshCw, Trash2, CheckCircle, Circle, Monitor, Image as ImageIcon, Music, Volume2 } from 'lucide-react';
import { useStore } from '@/lib/store';
import { addAIProvider, testAIProvider, getAIProviders, checkOllama, removeAIProvider, setDefaultAIProvider, exportData, importData, saveCardQualities, type AIResponse } from '@/lib/tauri-commands';
import { save, open } from '@tauri-apps/plugin-dialog';

type SettingsPane = 'appearance' | 'interface' | 'providers' | 'data';

const SIDEBAR_ITEMS: { id: SettingsPane; label: string; icon: React.ReactNode }[] = [
  { id: 'appearance', label: 'Appearance', icon: <Palette size={16} /> },
  { id: 'interface', label: 'Interface', icon: <Monitor size={16} /> },
  { id: 'providers', label: 'Providers', icon: <Cpu size={16} /> },
  { id: 'data', label: 'Data', icon: <RefreshCw size={16} /> },
];

const THEMES: { id: 'white' | 'black' | 'sepia' | 'gray' | 'forest'; icon: React.ReactNode; label: string; desc: string; bg: string; fg: string }[] = [
  { id: 'white', icon: <Sun size={20} />, label: 'White', desc: 'Clean light theme', bg: 'var(--bg-card)', fg: 'var(--text-primary)' },
  { id: 'black', icon: <Moon size={20} />, label: 'Black', desc: 'OLED dark theme', bg: '#18181B', fg: '#FAFAFA' },
  { id: 'sepia', icon: <Sun size={20} />, label: 'Sepia', desc: 'Warm paper tone', bg: '#FFF8F0', fg: '#2C1810' },
  { id: 'gray', icon: <Moon size={20} />, label: 'Gray', desc: 'Neutral gray', bg: '#FAFAFB', fg: '#1F2024' },
  { id: 'forest', icon: <Sun size={20} />, label: 'Forest', desc: 'Calm green', bg: '#F8FFF8', fg: '#1A2E1A' },
];

const SOUNDS = ['beep', 'bell', 'chime', 'digital'];

const PRESET_COLORS = ['#2563EB', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899'];

export default function SettingsTab() {
  const {
    theme, setTheme, primaryColor, setPrimaryColor,
    appScale, setAppScale, backgroundImage, setBackgroundImage,
    pomodoroSound, setPomodoroSound, saveSettingsToDisk,
  } = useStore();
  const [pane, setPane] = useState<SettingsPane>('appearance');

  const [ollamaAvailable, setOllamaAvailable] = useState<boolean | null>(null);
  const [providers, setProviders] = useState<{ type: string; model_name: string; model: string; configured: boolean; active: boolean; endpoint?: string }[]>([]);
  const [providerType, setProviderType] = useState('openai');
  const [apiKey, setApiKey] = useState('');
  const [endpoint, setEndpoint] = useState('http://localhost:11434');
  const [model, setModel] = useState('');
  const [testResult, setTestResult] = useState<AIResponse | null>(null);
  const [testing, setTesting] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { saveSettingsToDisk(); }, [theme, primaryColor, appScale, backgroundImage, pomodoroSound]);

  const refreshProviders = useCallback(async () => {
    try { setProviders(await getAIProviders()); } catch {}
  }, []);

  const refreshOllama = useCallback(async () => {
    try { setOllamaAvailable((await checkOllama()).available); } catch { setOllamaAvailable(false); }
  }, []);

  useEffect(() => { refreshProviders(); refreshOllama(); }, [refreshProviders, refreshOllama]);

  const handleSave = async () => {
    try {
      await addAIProvider(providerType, apiKey || undefined, providerType === 'ollama' ? endpoint : undefined, model || undefined);
      setSaved(true);
      await refreshProviders();
      setTimeout(() => setSaved(false), 2000);
    } catch {}
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      await handleSave();
      setTestResult(await testAIProvider());
    } catch (err) {
      setTestResult({ content: `Error: ${err}`, provider: 'error', model: '' });
    }
    setTesting(false);
  };

  return (
    <div style={{ height: '100%', display: 'flex', overflow: 'hidden' }}>
      <div style={{
        width: 180, borderRight: '1px solid var(--border)', padding: '16px 0',
        display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0,
      }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', padding: '0 16px 12px', borderBottom: '1px solid var(--border)', marginBottom: 8 }}>
          Settings
        </div>
        {SIDEBAR_ITEMS.map((item) => (
          <button key={item.id} onClick={() => setPane(item.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px', fontSize: 13,
              color: pane === item.id ? 'var(--primary)' : 'var(--text-secondary)',
              background: pane === item.id ? 'var(--primary-light)' : 'transparent',
              border: 'none', cursor: 'pointer', textAlign: 'left', width: '100%',
            }}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
        {pane === 'appearance' && (
          <div style={{ maxWidth: 600, display: 'flex', flexDirection: 'column', gap: 20 }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)' }}>Appearance</h2>

            <div className="card" style={{ padding: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 12 }}>Theme</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 8 }}>
                {THEMES.map((t) => (
                  <button key={t.id} onClick={() => setTheme(t.id)}
                    style={{
                      padding: '12px 8px', textAlign: 'center', cursor: 'pointer', borderRadius: 'var(--radius-lg)',
                      border: theme === t.id ? '2px solid var(--primary)' : '1px solid var(--border)',
                      background: t.bg, color: t.fg,
                    }}
                  >
                    {t.icon}
                    <div style={{ fontSize: 12, fontWeight: 500, marginTop: 4 }}>{t.label}</div>
                    <div style={{ fontSize: 10, opacity: 0.6 }}>{t.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="card" style={{ padding: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 12 }}>Primary Color</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
                <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)}
                  style={{ width: 36, height: 36, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', cursor: 'pointer', background: 'none', padding: 2 }}
                />
                <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: "'JetBrains Mono', monospace" }}>{primaryColor}</span>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {PRESET_COLORS.map((c) => (
                  <button key={c} onClick={() => setPrimaryColor(c)}
                    style={{
                      width: 28, height: 28, borderRadius: '50%', border: primaryColor === c ? '2px solid var(--text-primary)' : '2px solid transparent',
                      background: c, cursor: 'pointer',
                    }}
                  />
                ))}
              </div>
            </div>

            <div className="card" style={{ padding: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 12 }}>
                <ImageIcon size={14} style={{ marginRight: 6 }} /> Custom Background
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input className="input" value={backgroundImage} onChange={(e) => setBackgroundImage(e.target.value)}
                  placeholder="Paste image URL or leave empty" style={{ fontSize: 12 }} />
                {backgroundImage && (
                  <button className="btn btn-ghost no-hover" onClick={() => setBackgroundImage('')}
                    style={{ fontSize: 12, flexShrink: 0 }}>
                    Clear
                  </button>
                )}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                Set a background image URL for the app. Cleared by default.
              </div>
            </div>
          </div>
        )}

        {pane === 'interface' && (
          <div style={{ maxWidth: 500, display: 'flex', flexDirection: 'column', gap: 20 }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)' }}>Interface</h2>

            <div className="card" style={{ padding: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 8 }}>Interface Scaling</div>
              <input type="range" min={100} max={200} step={10} value={appScale}
                onChange={(e) => setAppScale(Number(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--primary)' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                <span>100%</span>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{appScale}%</span>
                <span>200%</span>
              </div>
            </div>

            <div className="card" style={{ padding: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 8 }}>
                <Volume2 size={14} style={{ marginRight: 6 }} /> Pomodoro Sound
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {SOUNDS.map((s) => (
                  <button key={s} onClick={() => setPomodoroSound(s)}
                    className="btn btn-ghost no-hover"
                    style={{
                      textTransform: 'capitalize', fontSize: 12,
                      border: pomodoroSound === s ? '1px solid var(--primary)' : '1px solid var(--border)',
                    }}
                  >
                    <Music size={12} /> {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {pane === 'providers' && (
          <div style={{ maxWidth: 500, display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)' }}>Providers</h2>
              <button className="btn btn-ghost no-hover" onClick={() => { refreshProviders(); refreshOllama(); }}
                style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                <RefreshCw size={12} /> Refresh
              </button>
            </div>

            <div className="card" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
              {ollamaAvailable === null ? (
                <><RefreshCw size={14} className="animate-spin" /><span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Checking Ollama...</span></>
              ) : ollamaAvailable ? (
                <><Wifi size={14} style={{ color: 'var(--success)' }} /><span style={{ fontSize: 13, color: 'var(--text-primary)' }}>Ollama is running</span></>
              ) : (
                <><WifiOff size={14} style={{ color: 'var(--danger)' }} /><span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Ollama not detected</span></>
              )}
            </div>

            <div className="card" style={{ padding: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 12 }}>
                Registered Providers
              </div>
              {providers.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No providers configured yet.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {providers.map((p, i) => (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 12px', borderRadius: 'var(--radius-md)',
                      background: p.active ? 'var(--primary-light)' : 'var(--bg-app)',
                      border: p.active ? '1px solid var(--primary)' : '1px solid transparent',
                      cursor: 'pointer', fontSize: 13,
                    }}
                      onClick={async () => { try { await setDefaultAIProvider(p.type); refreshProviders(); } catch {} }}
                    >
                      {p.active
                        ? <CheckCircle size={16} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                        : <Circle size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                      }
                      <Zap size={14} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 500, textTransform: 'capitalize', color: 'var(--text-primary)' }}>
                          {p.type}
                          {p.active && <span style={{ fontSize: 10, color: 'var(--primary)', marginLeft: 6 }}>default</span>}
                        </div>
                        <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>{p.model}{p.endpoint ? ` · ${p.endpoint}` : ''}</div>
                      </div>
                      <button
                        onClick={async (e) => { e.stopPropagation(); try { await removeAIProvider(p.type, p.model_name ?? p.model); refreshProviders(); } catch {} }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, borderRadius: 4, flexShrink: 0 }}
                        title={`Remove ${p.type}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="card" style={{ padding: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 12 }}>Add Provider</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.05em', marginBottom: 6 }}>POPULAR</div>
              <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                {['openai', 'anthropic', 'google-gemini', 'mistral', 'groq'].map((p) => (
                  <button key={p} onClick={() => { setProviderType(p); setModel(''); setApiKey(''); setEndpoint('http://localhost:11434'); }}
                    className={`btn ${providerType === p ? 'btn-primary' : 'btn-ghost'}`}
                    style={{ fontSize: 12, textTransform: 'capitalize' }}
                  >
                    {p === 'google-gemini' ? 'Gemini' : p}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.05em', marginBottom: 6, marginTop: 8 }}>MORE</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {['deepseek', 'openrouter', 'together', 'xai', 'perplexity', 'cohere', 'ollama'].map((p) => (
                  <button key={p} onClick={() => { setProviderType(p); setModel(''); setApiKey(''); setEndpoint('http://localhost:11434'); }}
                    className={`btn ${providerType === p ? 'btn-primary' : 'btn-ghost'}`}
                    style={{ fontSize: 12, textTransform: 'capitalize' }}
                  >
                    {p === 'xai' ? 'xAI' : p === 'together' ? 'Together' : p}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {providerType !== 'ollama' && (
                  <div>
                    <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>API Key</label>
                    <input type="password" className="input" value={apiKey} onChange={(e) => setApiKey(e.target.value)}
                      placeholder={`Enter your ${providerType} API key`} />
                  </div>
                )}
                {(providerType === 'ollama' || providerType === 'openrouter') && (
                  <div>
                    <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Endpoint</label>
                    <input className="input" value={endpoint} onChange={(e) => setEndpoint(e.target.value)}
                      placeholder={providerType === 'ollama' ? 'http://localhost:11434' : 'https://openrouter.ai/api/v1'} />
                  </div>
                )}
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Model</label>
                  <input className="input" value={model} onChange={(e) => setModel(e.target.value)}
                    placeholder={{
                      openai: 'gpt-4o', anthropic: 'claude-sonnet-4-20250514', deepseek: 'deepseek-chat',
                      openrouter: 'openrouter/auto', groq: 'llama-3.3-70b-versatile', ollama: 'llama3',
                      'google-gemini': 'gemini-2.0-flash', mistral: 'mistral-large-latest',
                      together: 'mistralai/Mixtral-8x22B-Instruct-v0.1', xai: 'grok-2-latest',
                      perplexity: 'sonar-pro', cohere: 'command-r-plus',
                    }[providerType] || 'model-name'} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <button className="btn btn-primary" onClick={handleSave} style={{ fontSize: 13 }}>
                  {saved ? <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>Saved</span> : 'Save'}
                </button>
                <button className="btn btn-ghost no-hover" onClick={handleTest} disabled={testing} style={{ fontSize: 13 }}>
                  {testing ? 'Testing...' : 'Test Connection'}
                </button>
              </div>
              {testResult && (
                <div style={{
                  marginTop: 12, padding: '10px 14px', borderRadius: 'var(--radius-md)',
                  background: testResult.provider === 'error' ? 'var(--danger-light)' : 'var(--success-light)',
                  border: `1px solid ${testResult.provider === 'error' ? 'var(--danger)' : 'var(--success)'}`,
                  fontSize: 13, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  {testResult.provider === 'error' ? <WifiOff size={14} /> : <Wifi size={14} />}
                  <span><strong>{testResult.provider}:</strong> {testResult.content}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {pane === 'data' && (
          <div style={{ maxWidth: 500, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)' }}>Data</h2>

            <div className="card" style={{ padding: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
                Export All Data
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14, lineHeight: 1.5 }}>
                Save all your data — flashcards, collections, documents, notes, canvas, exams,
                providers, chat sessions, and study analytics — as a single <code>.anos</code> archive.
              </div>
              <button className="btn btn-primary" onClick={async () => {
                try {
                  const path = await save({
                    filters: [{ name: 'Annotate Studio Archive', extensions: ['anos'] }],
                    defaultPath: `backup-${new Date().toISOString().slice(0, 10)}.anos`,
                  });
                  if (!path) return;
                  await exportData(path);
                  alert('Data exported successfully.');
                } catch (e) { alert('Export failed: ' + e); }
              }} style={{ fontSize: 13 }}>
                Export Data
              </button>
            </div>

            <div className="card" style={{ padding: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
                Import Data
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14, lineHeight: 1.5 }}>
                Restore data from a <code>.anos</code> archive. This will overwrite all current data
                including flashcards, documents, canvas, and settings.
              </div>
              <button className="btn" onClick={async () => {
                try {
                  const path = await open({
                    filters: [{ name: 'Annotate Studio Archive', extensions: ['anos'] }],
                    multiple: false,
                  });
                  if (!path) return;
                  if (!confirm('Importing will overwrite all existing data. Are you sure?')) return;
                  const cq = await importData(path as string);
                  if (cq) await saveCardQualities(cq);
                  alert('Data imported successfully. Reload the app to see changes.');
                } catch (e) { alert('Import failed: ' + e); }
              }} style={{
                fontSize: 13,
                background: 'var(--warning)', color: 'var(--primary-text)', border: 'none',
                borderRadius: 'var(--radius-md)', cursor: 'pointer', fontWeight: 600,
                padding: '8px 16px',
              }}>
                Import Data
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
