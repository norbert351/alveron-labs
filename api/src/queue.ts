import { runCompanyPipeline } from './modules/pipeline.ts';

const queue: number[] = [];
let processing = false;

export function enqueueJob(jobId: number) {
  queue.push(jobId);
  void pump();
}

async function pump() {
  if (processing) return;
  processing = true;
  try {
    while (queue.length > 0) {
      const jobId = queue.shift()!;
      try {
        await runCompanyPipeline(jobId);
      } catch (err: any) {
        console.error(`[queue] job ${jobId} failed:`, err?.message || err);
      }
    }
  } finally {
    processing = false;
  }
}
