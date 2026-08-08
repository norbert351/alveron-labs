import { pool, logActivity } from '../db.ts';
import { getProvider } from './index.ts';
import { getAccount, ensureFreshToken } from './accounts.ts';
import type { EmailAccountRow, ReplyEvent } from './types.ts';

/** Classify a provider event and apply it to outreach records. Returns the matched outreach id if any. */
export async function applyReplyEvent(account: EmailAccountRow, event: ReplyEvent): Promise<number | null> {
  // find an outreach whose sent message went to this recipient, or shares the thread
  const byThread = event.threadId
    ? await pool.query(
        `SELECT outreach_id FROM outreach_messages WHERE provider_thread_id = $1 AND status = 'sent' ORDER BY id LIMIT 1`,
        [event.threadId]
      )
    : { rowCount: 0, rows: [] as any[] };

  const byRecipient =
    byThread.rowCount === 0
      ? await pool.query(
          `SELECT DISTINCT m.outreach_id FROM outreach_messages m
           JOIN outreach o ON o.id = m.outreach_id
           WHERE lower(m.recipient) = $1 AND m.status = 'sent' ORDER BY m.outreach_id LIMIT 1`,
          [event.from]
        )
      : { rowCount: 0, rows: [] as any[] };

  const row = (byThread.rowCount ?? 0) > 0 ? byThread : byRecipient;
  if ((row.rowCount ?? 0) === 0) return null; // not part of any outreach thread
  const outreachId = row.rows[0].outreach_id;

  await pool.query(`INSERT INTO outreach_events (outreach_id, event, detail, payload) VALUES ($1, $2, $3, $4)`, [
    outreachId,
    event.kind,
    JSON.stringify({ from: event.from, subject: event.subject, message_id: event.messageId, thread_id: event.threadId }),
    JSON.stringify(event),
  ]);

  if (event.kind === 'reply') {
    await pool.query(
      `UPDATE outreach SET status = 'replied', last_reply_at = $2, reply_excerpt = $3, updated_at = now() WHERE id = $1`,
      [outreachId, event.receivedAt, event.excerpt]
    );
    const company = await pool.query(`SELECT company_id FROM outreach WHERE id = $1`, [outreachId]);
    if ((company.rowCount ?? 0) > 0) {
      await pool.query(
        `UPDATE companies SET status = 'replied', stage = 'Replied', updated_at = now() WHERE id = $1`,
        [company.rows[0].company_id]
      );
    }
    await pool.query(
      `UPDATE follow_up_sequences SET status = 'cancelled', stop_reason = 'replied', updated_at = now() WHERE outreach_id = $1 AND status = 'running'`,
      [outreachId]
    );
    await logActivity({
      actor: 'email-provider',
      action: 'reply_detected',
      entityType: 'outreach',
      entityId: outreachId,
      detail: { from: event.from, thread_id: event.threadId },
    });
  } else if (event.kind === 'bounce') {
    await pool.query(
      `UPDATE outreach_messages SET status = 'bounced', error_code = 'bounce', error_message = $2, updated_at = now()
       WHERE outreach_id = $1 AND status IN ('sent', 'delivered')`,
      [outreachId, event.excerpt.slice(0, 300)]
    );
    await logActivity({ actor: 'email-provider', action: 'email_bounced', entityType: 'outreach', entityId: outreachId });
  }
  // out_of_office / auto_response: recorded as events only, do not cancel sequences
  return outreachId;
}

/** Poll a connected account for replies. Returns events applied. */
export async function pollAccountForReplies(accountId: number): Promise<{ scanned: number; applied: number; events: string[] }> {
  const account = await getAccount(accountId);
  if (!account) throw new Error('Account not found');
  if (account.provider === 'resend') {
    return { scanned: 0, applied: 0, events: ['Resend has no mailbox polling; reply detection is unsupported on Resend accounts'] };
  }
  const provider = getProvider(account.provider);
  const fresh = await ensureFreshToken(account);
  const since = new Date(Date.now() - 72 * 3600 * 1000);
  const events: ReplyEvent[] = await provider.pollReplies(fresh, since);
  let applied = 0;
  const kinds: string[] = [];
  for (const ev of events) {
    const matched = await applyReplyEvent(fresh, ev);
    if (matched) {
      applied += 1;
      kinds.push(ev.kind);
    }
  }
  await pool.query(`UPDATE email_accounts SET last_error = NULL, updated_at = now() WHERE id = $1`, [accountId]);
  return { scanned: events.length, applied, events: kinds };
}
