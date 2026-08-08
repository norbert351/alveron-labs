'use client';

import { useEffect, useState } from 'react';
import { Loader2, Save, KeyRound, Plus, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';

interface SettingsData {
  llm: { baseUrl: string; model: string; keySet: boolean };
  services: { name: string; description: string }[];
}

export default function SettingsPage() {
  const [data, setData] = useState<SettingsData | null>(null);
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [services, setServices] = useState<{ name: string; description: string }[]>([]);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    api
      .get<SettingsData>('/api/settings')
      .then((d) => {
        setData(d);
        setBaseUrl(d.llm.baseUrl);
        setModel(d.llm.model);
        setServices(d.services);
      })
      .catch((e) => setMsg({ kind: 'err', text: e.message }));
  }, []);

  async function saveLlm() {
    setBusy('llm');
    setMsg(null);
    try {
      await api.put('/api/settings/llm', { baseUrl, model, apiKey });
      setApiKey('');
      setMsg({ kind: 'ok', text: 'LLM provider saved' });
    } catch (e: any) {
      setMsg({ kind: 'err', text: e.message });
    } finally {
      setBusy('');
    }
  }

  async function saveServices() {
    setBusy('svc');
    setMsg(null);
    try {
      await api.put('/api/settings/services', { services });
      setMsg({ kind: 'ok', text: 'Service catalog saved' });
    } catch (e: any) {
      setMsg({ kind: 'err', text: e.message });
    } finally {
      setBusy('');
    }
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="card skeleton h-48" />
        <div className="card skeleton h-64" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl animate-fade-up">
      <div className="mb-8">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">Settings</h1>
        <p className="mt-1 text-sm text-ink-muted">LLM provider and service catalog for the intelligence pipeline</p>
      </div>

      {msg && (
        <div
          className={`mb-4 rounded-lg border p-3 text-sm ${
            msg.kind === 'ok' ? 'border-emerald-500/25 bg-emerald-500/5 text-emerald-300' : 'border-red-500/25 bg-red-500/5 text-red-300'
          }`}
        >
          {msg.text}
        </div>
      )}

      <div className="card p-6">
        <div className="mb-4 flex items-center gap-2">
          <KeyRound size={16} className="text-electric-bright" />
          <div className="section-title">LLM provider</div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label">Base URL</label>
            <input className="input font-mono" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.example.com/v1" />
          </div>
          <div>
            <label className="label">Model</label>
            <input className="input font-mono" value={model} onChange={(e) => setModel(e.target.value)} placeholder="gpt-5.6-terra" />
          </div>
          <div>
            <label className="label">
              API key {data.llm.keySet && <span className="ml-1 normal-case text-emerald-400">· key configured</span>}
            </label>
            <input
              className="input font-mono"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={data.llm.keySet ? '•••••••• (leave empty to keep)' : 'Enter API key'}
            />
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <button className="btn-primary" onClick={saveLlm} disabled={busy === 'llm'}>
            {busy === 'llm' ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save provider
          </button>
        </div>
      </div>

      <div className="card mt-6 p-6">
        <div className="mb-4 flex items-center gap-2">
          <Plus size={16} className="text-violet-bright" />
          <div className="section-title">Service catalog</div>
        </div>
        <p className="mb-4 text-xs leading-relaxed text-ink-muted">
          Opportunity detection recommends only services from this catalog. These names flow into proposals and outreach.
        </p>
        <div className="space-y-3">
          {services.map((s, i) => (
            <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_2fr_auto]">
              <input
                className="input"
                value={s.name}
                onChange={(e) => setServices(services.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
              />
              <input
                className="input"
                value={s.description}
                onChange={(e) => setServices(services.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))}
              />
              <button
                className="btn-danger justify-center sm:w-10"
                onClick={() => setServices(services.filter((_, j) => j !== i))}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between">
          <button className="btn-ghost" onClick={() => setServices([...services, { name: '', description: '' }])}>
            <Plus size={14} /> Add service
          </button>
          <button className="btn-primary" onClick={saveServices} disabled={busy === 'svc'}>
            {busy === 'svc' ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save catalog
          </button>
        </div>
      </div>
    </div>
  );
}
