'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Modal } from './ui';

export function AnalyzeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [website, setWebsite] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    setError('');
    if (!name.trim() || !website.trim()) {
      setError('Company name and website are required.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.post<{ company: { id: number } }>('/api/companies', {
        name: name.trim(),
        website: website.trim(),
        notes: notes.trim(),
      });
      onClose();
      setName('');
      setWebsite('');
      setNotes('');
      router.push(`/companies/${res.company.id}`);
    } catch (e: any) {
      setError(e.message || 'Something went wrong');
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Analyze a company">
      <div className="space-y-4">
        <div>
          <label className="label">Company name</label>
          <input
            className="input"
            placeholder="e.g. Northwind Traders"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>
        <div>
          <label className="label">Website URL</label>
          <input
            className="input"
            placeholder="e.g. northwindtraders.com"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Notes (optional)</label>
          <textarea
            className="input min-h-24 resize-y"
            placeholder="Anything we should know about this company, the contact, or the context"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        {error && <div className="rounded-lg border border-red-500/25 bg-red-500/5 p-3 text-xs text-red-300">{error}</div>}

        <div className="rounded-lg border border-obsidian-border bg-obsidian-raised/60 p-3 text-xs leading-relaxed text-ink-muted">
          The system fetches the site, researches the company, detects evidence-backed opportunities, and matches them to
          Alveron services. You review every proposal and email before anything is sent.
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={submit} disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 size={15} className="animate-spin" /> Starting analysis
              </>
            ) : (
              'Start analysis'
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}
