/**
 * Structured JSON logging. Every line carries a timestamp, operation name,
 * and the relevant entity ids so errors trace across API, PostgreSQL, n8n
 * and the email provider.
 */

export interface LogFields {
  op: string;
  request_id?: string;
  job_id?: number;
  company_id?: number;
  lead_id?: number;
  user_id?: number;
  workflow_id?: string;
  outreach_id?: number;
  message_id?: number;
  account_id?: number;
  status?: string;
  detail?: unknown;
}

export function log(fields: LogFields): void {
  const line: Record<string, unknown> = { ts: new Date().toISOString(), ...fields };
  if (fields.detail !== undefined && fields.detail !== null) {
    try {
      line.detail = JSON.stringify(fields.detail);
    } catch {
      line.detail = String(fields.detail);
    }
  }
  console.log(JSON.stringify(line));
}

export function logError(op: string, err: unknown, extra: Omit<LogFields, 'op' | 'detail'> = {}): void {
  log({
    op,
    ...extra,
    status: 'error',
    detail: { error: err instanceof Error ? err.message : String(err) },
  });
}
