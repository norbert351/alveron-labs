import { pool } from '../db.ts';
import type { JobRow, JobStep } from '../types.ts';
import { fetchSite } from './websiteFetcher.ts';
import { researchCompany } from './CompanyResearch.ts';
import { analyzeWebsite } from './WebsiteAnalysis.ts';
import { matchServices, getServiceCatalog } from './OpportunityDetection.ts';
import { recommendSolution } from './SolutionRecommendation.ts';
import { scoreOpportunity, priorityFromScore } from './LeadScoring.ts';

const STEP_DEFS: { key: string; label: string }[] = [
  { key: 'fetch', label: 'Website fetch' },
  { key: 'research', label: 'Company research' },
  { key: 'analyze', label: 'Opportunity analysis' },
  { key: 'match', label: 'Service matching' },
  { key: 'finalize', label: 'Finalize' },
];

export async function createJobForCompany(companyId: number): Promise<JobRow> {
  const steps: JobStep[] = STEP_DEFS.map((s) => ({ key: s.key, label: s.label, status: 'pending' }));
  const res = await pool.query(
    `INSERT INTO jobs (company_id, type, status, current_step, steps)
     VALUES ($1, 'company_analysis', 'pending', NULL, $2)
     RETURNING *`,
    [companyId, JSON.stringify(steps)]
  );
  return rowToJob(res.rows[0]);
}

/** Returns the active job for a company (pending or running), if any. */
export async function getActiveJob(companyId: number): Promise<JobRow | null> {
  const res = await pool.query(
    `SELECT * FROM jobs WHERE company_id = $1 AND status IN ('pending', 'running') ORDER BY id DESC LIMIT 1`,
    [companyId]
  );
  return res.rowCount ? rowToJob(res.rows[0]) : null;
}

async function updateJobStep(jobId: number, key: string, status: JobStep['status'], detail?: string) {
  const job = await getJob(jobId);
  if (!job) return;
  const steps = job.steps.map((s) =>
    s.key === key ? { ...s, status, detail: detail ?? s.detail } : s
  );
  let currentStep = job.current_step;
  if (status === 'running') {
    currentStep = key;
  } else if (status === 'completed' && currentStep === key) {
    const next = steps.find((s) => s.status === 'pending');
    currentStep = next ? next.key : null;
  }
  const allDone = steps.every((s) => s.status === 'completed' || s.status === 'failed');
  const jobStatus = status === 'failed' ? 'failed' : allDone ? 'completed' : 'running';
  await pool.query(
    `UPDATE jobs SET steps = $2, current_step = $3, status = $4, error = $5, updated_at = now()
     WHERE id = $1`,
    [jobId, JSON.stringify(steps), currentStep, jobStatus, detail ?? null]
  );
}

export async function getJob(jobId: number): Promise<JobRow | null> {
  const res = await pool.query(`SELECT * FROM jobs WHERE id = $1`, [jobId]);
  if (res.rowCount === 0) return null;
  return rowToJob(res.rows[0]);
}

function rowToJob(row: any): JobRow {
  return {
    id: row.id,
    company_id: row.company_id,
    type: row.type,
    status: row.status,
    current_step: row.current_step,
    steps: Array.isArray(row.steps) ? row.steps : typeof row.steps === 'string' ? JSON.parse(row.steps) : [],
    error: row.error,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function runCompanyPipeline(jobId: number): Promise<void> {
  const job = await getJob(jobId);
  if (!job) return;
  const companyId = job.company_id;

  await pool.query(`UPDATE companies SET stage = 'Researching', updated_at = now() WHERE id = $1`, [companyId]);
  await pool.query(
    `INSERT INTO activity_logs (actor, action, entity_type, entity_id, detail)
     VALUES ('system', 'stage_changed', 'company', $1, $2)`,
    [companyId, JSON.stringify({ from: 'Discovered', to: 'Researching' })]
  ).catch(() => {});

  const scan = await pool.query(
    `INSERT INTO website_scans (company_id, url, status)
     SELECT id, website, 'pending' FROM companies WHERE id = $1
     ON CONFLICT DO NOTHING
     RETURNING *`,
    [companyId]
  ).catch(() => null);

  const scanRes = scan?.rowCount
    ? scan
    : await pool.query(`SELECT * FROM website_scans WHERE company_id = $1 ORDER BY id DESC LIMIT 1`, [companyId]);
  const scanId = scanRes.rows[0].id;

  const reportRes = await pool.query(
    `INSERT INTO research_reports (company_id, scan_id, status)
     VALUES ($1, $2, 'pending') RETURNING id`,
    [companyId, scanId]
  );
  const reportId = reportRes.rows[0].id;

  await pool.query(`UPDATE website_scans SET status = 'running', started_at = now() WHERE id = $1`, [scanId]);

  try {
    // Step 1: fetch
    await updateJobStep(jobId, 'fetch', 'running');
    const snapshot = await fetchSite((await pool.query(`SELECT website FROM companies WHERE id = $1`, [companyId])).rows[0].website);
    await updateJobStep(jobId, 'fetch', 'completed', `${snapshot.pageCount} pages`);
    await pool.query(
      `UPDATE website_scans SET page_count = $2, pages_analyzed = $3 WHERE id = $1`,
      [scanId, snapshot.pageCount, snapshot.pageCount]
    );

    // Step 2: research
    await updateJobStep(jobId, 'research', 'running');
    const research = await researchCompany(snapshot);
    await pool.query(
      `UPDATE research_reports
       SET status = 'completed', summary = $2, details = $3, sources = $4, completed_at = now()
       WHERE id = $1`,
      [reportId, research.summary, JSON.stringify(research), JSON.stringify([snapshot.url])]
    );
    await pool.query(
      `UPDATE companies
       SET industry = $2, products_services = $3, target_customers = $4,
           main_offering = $5, technologies = $6, status = 'researched', updated_at = now()
       WHERE id = $1`,
      [
        companyId,
        research.industry || null,
        research.products_services || null,
        research.target_customers || null,
        research.main_offering || null,
        JSON.stringify(research.technologies),
      ]
    );
    await updateJobStep(jobId, 'research', 'completed');

    // Step 3: analyze
    await updateJobStep(jobId, 'analyze', 'running');
    const findings = await analyzeWebsite(snapshot);
    await pool.query(
      `UPDATE website_scans SET findings = $2, status = 'completed', completed_at = now() WHERE id = $1`,
      [scanId, JSON.stringify(findings)]
    );
    await updateJobStep(jobId, 'analyze', 'completed', `${findings.length} findings`);

    // Step 4: match services + recommend solutions + score
    await updateJobStep(jobId, 'match', 'running');
    const services = await getServiceCatalog();
    const matches = await matchServices(findings, services);
    const matchesByIndex = new Map(matches.map((m) => [m.findingIndex, m]));

    for (let i = 0; i < findings.length; i++) {
      const f = findings[i];
      const match = matchesByIndex.get(i);
      if (!match) continue;
      let solution = f.recommended_solution;
      let benefit = match.expected_benefit;
      try {
        const detail = await recommendSolution({
          companyName: (await pool.query(`SELECT name FROM companies WHERE id = $1`, [companyId])).rows[0].name,
          industry: research.industry,
          problem: f.problem,
          evidence: f.evidence,
          business_impact: f.business_impact,
          service: match.matched_service,
        });
        solution = detail.recommended_solution || solution;
        benefit = detail.expected_benefit || benefit;
      } catch {
        /* keep analysis-level solution on recommendation failure */
      }
      const oppRes = await pool.query(
        `INSERT INTO opportunities
           (company_id, scan_id, problem, evidence, confidence, business_impact,
            recommended_solution, matched_service, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'open')
         RETURNING id`,
        [
          companyId,
          scanId,
          f.problem,
          f.evidence,
          f.confidence,
          f.business_impact,
          solution,
          match.matched_service,
        ]
      );
      const opportunityId = oppRes.rows[0].id;
      try {
        const score = await scoreOpportunity({
          companyName: (await pool.query(`SELECT name FROM companies WHERE id = $1`, [companyId])).rows[0].name,
          industry: research.industry,
          service: match.matched_service,
          problem: f.problem,
          evidence: f.evidence,
          business_impact: f.business_impact,
          solution,
        });
        await pool.query(
          `UPDATE opportunities SET
             score = $2, score_evidence_quality = $3, score_problem_severity = $4,
             score_alveron_fit = $5, score_operational_value = $6, score_feasibility = $7,
             score_complexity = $8, score_rationale = $9, priority = $10
           WHERE id = $1`,
          [
            opportunityId,
            score.score,
            score.evidence_quality,
            score.problem_severity,
            score.alveron_fit,
            score.operational_value,
            score.feasibility,
            score.complexity,
            score.rationale,
            priorityFromScore(score.score),
          ]
        );
        await pool.query(
          `INSERT INTO lead_scores
             (opportunity_id, score, evidence_quality, problem_severity, alveron_fit,
              confidence, operational_value, feasibility, complexity, rationale)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            opportunityId,
            score.score,
            score.evidence_quality,
            score.problem_severity,
            score.alveron_fit,
            score.confidence,
            score.operational_value,
            score.feasibility,
            score.complexity,
            score.rationale,
          ]
        );
      } catch {
        /* scoring is best-effort, opportunity still stands without it */
      }
    }
    await updateJobStep(jobId, 'match', 'completed', `${findings.length} opportunities`);

    // Step 5: finalize
    await updateJobStep(jobId, 'finalize', 'running');
    await pool.query(
      `UPDATE companies SET status = 'analyzed', stage = 'Qualified', updated_at = now() WHERE id = $1`,
      [companyId]
    );
    await pool.query(
      `INSERT INTO activity_logs (actor, action, entity_type, entity_id, detail)
       VALUES ('system', 'stage_changed', 'company', $1, $2)`,
      [companyId, JSON.stringify({ from: 'Researching', to: 'Qualified', note: 'Analysis completed' })]
    ).catch(() => {});
    await updateJobStep(jobId, 'finalize', 'completed');
  } catch (err: any) {
    const msg = err?.message || String(err);
    const freshJob = await getJob(jobId).catch(() => null);
    const failedStep = freshJob?.current_step || job.current_step || 'fetch';
    await pool.query(
      `UPDATE website_scans SET status = 'failed', error = $2 WHERE id = $1 AND status IN ('pending','running')`,
      [scanId, msg]
    );
    await pool.query(
      `UPDATE research_reports SET status = 'failed', error = $2 WHERE id = $1 AND status IN ('pending','running')`,
      [reportId, msg]
    );
    await updateJobStep(jobId, failedStep, 'failed', msg);
    await pool.query(`UPDATE jobs SET status = 'failed', error = $2, updated_at = now() WHERE id = $1`, [jobId, msg]);
    throw err;
  }
}
