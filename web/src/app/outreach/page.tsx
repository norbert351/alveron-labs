'use client';

import { useCallback, useEffect, useState } from 'react';
import { Pencil, CheckCircle2, XCircle, AlertTriangle, Loader2 } from 'lucide-react';
import { api, type OutreachItem } from '@/lib/api';
import { StatusPill, ServiceBadge, Modal, EmptyState, timeAgo } from '@/components/ui';

export default function OutreachPage() {
  const [items, setItems] = useState<OutreachItem[] | null>(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<OutreachItem | null>(null);
  const [approving, setApproving] = useState<OutreachItem | null>(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(() => {
    api
      .get<{ outreach: OutreachItem[] }>('/api/outreach')
      .then((d) => setItems(d.outreach))
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openEdit(o: OutreachItem) {
    setEditing(o);
    setSubject(o.subject);
    setBody(o.body);
  }

  async function saveEdit() {
    if (!editing) return;
    setBusy('save');
    try {
      await api.patch(`/api/outreach/${editing.id}`, { subject, body });
      setEditing(null);
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  }

  async function approve(o: OutreachItem) {
    setBusy('approve');
    try {
      await api.post(`/api/outreach/${o.id}/approve`, { confirm: true });
      setApproving(null);
      load();
    } catch (e: any) {
      setError(e.message);
      setApproving(null);
    } finally {
      setBusy('');
    }
  }

  async function reject(o: OutreachItem) {
    setBusy('reject');
    try {
      await api.post(`/api/outreach/${o.id}/reject`);
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="mx-auto max-w-5xl animate-fade-up">
      <div className="mb-8">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">Outreach</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Drafted emails require explicit human approval before they are marked as sent
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/25 bg-red-500/5 p-4 text-sm text-red-300">{error}</div>
      )}

      {!items ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card skeleton h-40" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState title="No outreach emails yet" hint="Generate an outreach email from a proposal" />
      ) : (
        <div className="space-y-4">
          {items.map((o) => (
            <div key={o.id} className="card card-hover p-5 animate-fade-in">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-ink">{o.subject}</span>
                <ServiceBadge service={o.recommended_service} />
                <span className="ml-auto flex items-center gap-2">
                  <StatusPill status={o.status} />
                  <span className="text-xs text-ink-muted">{timeAgo(o.created_at)}</span>
                </span>
              </div>

              <div className="mt-2 text-xs text-ink-muted">
                To: {o.target_company} · Proposal #{o.proposal_id}
              </div>

              <pre className="mt-3 whitespace-pre-wrap rounded-lg bg-obsidian-raised/60 p-4 font-body text-sm leading-relaxed text-ink-soft">
                {o.body}
              </pre>

              {o.reason && (
                <div className="mt-3 rounded-lg border border-violet/20 bg-violet/5 p-3 text-xs leading-relaxed text-ink-soft">
                  <span className="text-violet-bright">Internal reason: </span>
                  {o.reason}
                </div>
              )}

              {o.status === 'draft' && (
                <div className="mt-4 flex flex-wrap gap-2 border-t border-obsidian-border pt-4">
                  <button className="btn-ghost" onClick={() => openEdit(o)}>
                    <Pencil size={13} /> Edit
                  </button>
                  <button className="btn-success" onClick={() => setApproving(o)}>
                    <CheckCircle2 size={14} /> Approve & Send
                  </button>
                  <button className="btn-danger" disabled={busy === 'reject'} onClick={() => reject(o)}>
                    {busy === 'reject' ? <Loader2 size={13} className="animate-spin" /> : <XCircle size={14} />}
                    Reject
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal open={!!editing} onClose={() => setEditing(null)} title="Edit outreach email" wide>
        {editing && (
          <div className="space-y-4">
            <div>
              <label className="label">Subject</label>
              <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
            <div>
              <label className="label">Email body</label>
              <textarea className="input min-h-64 resize-y font-body leading-relaxed" value={body} onChange={(e) => setBody(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button className="btn-primary" onClick={saveEdit} disabled={busy === 'save'}>
                {busy === 'save' && <Loader2 size={14} className="animate-spin" />} Save changes
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!approving} onClose={() => setApproving(null)} title="Confirm approval">
        {approving && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-lg border border-amber-500/25 bg-amber-500/5 p-4">
              <AlertTriangle size={17} className="mt-0.5 shrink-0 text-amber-400" />
              <div className="text-sm leading-relaxed text-ink-soft">
                This will mark the email to <span className="text-ink">{approving.target_company}</span> as approved and
                sent. This is a real business communication on behalf of Alveron Labs. The MVP does not transmit real
                email yet, but the status is final.
              </div>
            </div>
            <div className="rounded-lg border border-obsidian-border bg-obsidian-raised/60 p-3">
              <div className="text-xs font-medium text-ink">{approving.subject}</div>
              <div className="mt-1 line-clamp-3 text-xs text-ink-muted">{approving.body}</div>
            </div>
            <div className="flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setApproving(null)}>
                Cancel
              </button>
              <button className="btn-success" onClick={() => approve(approving)} disabled={busy === 'approve'}>
                {busy === 'approve' ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                Confirm & approve
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
