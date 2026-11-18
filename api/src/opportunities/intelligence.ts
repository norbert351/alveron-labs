export type QualityCheck = { key: string; label: string; passed: boolean; detail: string };
export type OpportunityQuality = {
  score: number;
  band: 'incomplete' | 'needs_review' | 'promising';
  checks: QualityCheck[];
  blockers: string[];
  assessed_at: string;
};

function validHttpUrl(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function asDate(value: unknown): Date | null {
  if (typeof value !== 'string' && !(value instanceof Date)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function assessOpportunityQuality(opportunity: Record<string, unknown>, now = new Date()): OpportunityQuality {
  const evidence = Array.isArray(opportunity.evidence) ? opportunity.evidence : [];
  const usableEvidence = evidence.filter((item) => {
    if (!item || typeof item !== 'object') return false;
    const record = item as Record<string, unknown>;
    return validHttpUrl(record.url) && typeof record.text === 'string' && record.text.trim().length >= 20;
  });
  const discoveredAt = asDate(opportunity.discovered_at) || asDate(opportunity.created_at);
  const deadline = asDate(opportunity.deadline_at);
  const ageDays = discoveredAt ? Math.max(0, (now.getTime() - discoveredAt.getTime()) / 86400000) : null;
  const expired = Boolean(deadline && deadline.getTime() < now.getTime());
  const checks: QualityCheck[] = [
    { key: 'identity', label: 'Listing identity', passed: Boolean(String(opportunity.title || '').trim() && String(opportunity.organization_name || '').trim()), detail: opportunity.organization_name ? 'Title and organization are present.' : 'Organization name is missing.' },
    { key: 'source', label: 'Source URL', passed: validHttpUrl(opportunity.source_url), detail: validHttpUrl(opportunity.source_url) ? 'A valid HTTP(S) source URL is present.' : 'A valid HTTP(S) source URL is required.' },
    { key: 'evidence', label: 'Supporting evidence', passed: usableEvidence.length > 0, detail: usableEvidence.length ? usableEvidence.length + ' usable evidence item(s) found.' : 'No usable evidence with a source URL and meaningful text was found.' },
    { key: 'description', label: 'Opportunity details', passed: typeof opportunity.description === 'string' && opportunity.description.trim().length >= 80, detail: typeof opportunity.description === 'string' && opportunity.description.trim().length >= 80 ? 'Description contains useful detail.' : 'Description is missing or too short to assess.' },
    { key: 'compensation', label: 'Compensation clarity', passed: opportunity.compensation_min != null || opportunity.compensation_max != null, detail: opportunity.compensation_min != null || opportunity.compensation_max != null ? 'At least one compensation value is provided.' : 'Compensation is not stated.' },
    { key: 'deadline', label: 'Deadline status', passed: Boolean(deadline && !expired), detail: expired ? 'The recorded deadline has passed.' : deadline ? 'The recorded deadline is still in the future.' : 'No deadline is recorded. Confirm the closing date at the source.' },
    { key: 'freshness', label: 'Listing freshness', passed: ageDays !== null && ageDays <= 14, detail: ageDays === null ? 'Discovery date is unavailable.' : ageDays <= 14 ? 'Listing was discovered within the last 14 days.' : 'Listing is older than 14 days and needs a fresh source check.' },
  ];
  const weights: Record<string, number> = { identity: 20, source: 20, evidence: 20, description: 10, compensation: 10, deadline: 10, freshness: 10 };
  const score = checks.reduce((total, check) => total + (check.passed ? weights[check.key] : 0), 0);
  const blockers = checks.filter((check) => !check.passed).map((check) => check.detail);
  return {
    score,
    band: score >= 80 ? 'promising' : score >= 50 ? 'needs_review' : 'incomplete',
    checks,
    blockers,
    assessed_at: now.toISOString(),
  };
}

export function calculateOpportunityPriority(input: {
  fitScore?: number | null;
  qualityScore: number;
  deadlineAt?: string | Date | null;
  discoveredAt?: string | Date | null;
  outcomeAdjustment?: number;
}, now = new Date()): number {
  const fit = Math.min(100, Math.max(0, Number(input.fitScore) || 0));
  const quality = Math.min(100, Math.max(0, input.qualityScore));
  const deadline = asDate(input.deadlineAt);
  const discovered = asDate(input.discoveredAt);
  let urgency = 0;
  if (deadline) {
    const days = (deadline.getTime() - now.getTime()) / 86400000;
    if (days < 0) urgency = -100;
    else if (days <= 3) urgency = 10;
    else if (days <= 7) urgency = 6;
  }
  let freshness = 0;
  if (discovered) {
    const age = (now.getTime() - discovered.getTime()) / 86400000;
    freshness = age <= 3 ? 5 : age <= 14 ? 2 : age <= 30 ? -4 : -10;
  } else {
    freshness = -5;
  }
  const feedback = Math.max(-8, Math.min(8, Number(input.outcomeAdjustment) || 0));
  return Math.round(Math.min(100, Math.max(0, fit * 0.55 + quality * 0.4 + urgency + freshness + feedback)));
}

export function buildApplicationDraft(
  opportunity: Record<string, unknown>,
  profile: Record<string, unknown>,
): { subject: string; body: string; matched_skills: string[]; missing_skills: string[]; disclaimer: string } {
  const skills = Array.isArray(profile.skills) ? profile.skills.filter((item): item is string => typeof item === 'string') : [];
  const required = Array.isArray(opportunity.required_skills) ? opportunity.required_skills.filter((item): item is string => typeof item === 'string') : [];
  const normalized = new Set(skills.map((skill) => skill.toLowerCase()));
  const matched = required.filter((skill) => normalized.has(skill.toLowerCase()));
  const missing = required.filter((skill) => !normalized.has(skill.toLowerCase()));
  const title = String(opportunity.title || 'the opportunity');
  const organization = String(opportunity.organization_name || 'your team');
  const displayName = String(profile.display_name || 'Your name');
  const summary = typeof (profile.experience as Record<string, unknown> | undefined)?.summary === 'string'
    ? String((profile.experience as Record<string, unknown>).summary)
    : '';
  const description = String(opportunity.description || '').slice(0, 900);
  const body = [
    'Hello ' + organization + ' team,',
    '',
    'I am interested in the ' + title + ' opportunity. ' + (summary ? summary : 'My background includes ' + (matched.length ? matched.join(', ') : skills.slice(0, 5).join(', ') || '[add relevant experience]') + '.'),
    '',
    description ? 'I reviewed the opportunity details and understand the role involves: ' + description : 'I would appreciate the chance to learn more about the responsibilities and expectations for this opportunity.',
    '',
    matched.length ? 'Relevant skills I can bring include: ' + matched.join(', ') + '.' : 'I would be happy to share relevant examples of my work and experience.',
    '',
    'I can provide my portfolio and any additional information needed. Thank you for considering my application.',
    '',
    'Regards,',
    displayName,
  ].join('\n');
  return {
    subject: 'Application: ' + title,
    body,
    matched_skills: matched,
    missing_skills: missing,
    disclaimer: 'Draft only. Review every claim, add portfolio evidence, and submit manually. Alveron Labs has not contacted the organization.',
  };
}

export function calculateOutcomeAdjustment(events: string[]): { adjustment: number; sample_size: number; confidence: 'insufficient' | 'early' | 'useful' } {
  const recognized = events.filter((event) => ['response_received', 'interview', 'offer', 'won', 'rejected', 'no_response', 'lost'].includes(event));
  if (recognized.length < 3) return { adjustment: 0, sample_size: recognized.length, confidence: 'insufficient' };
  const positive = recognized.filter((event) => ['response_received', 'interview', 'offer', 'won'].includes(event)).length;
  const negative = recognized.filter((event) => ['rejected', 'no_response', 'lost'].includes(event)).length;
  const rate = (positive - negative) / recognized.length;
  const adjustment = Math.round(Math.max(-8, Math.min(8, rate * 10)));
  return { adjustment, sample_size: recognized.length, confidence: recognized.length >= 10 ? 'useful' : 'early' };
}
