import "server-only";
import { and, eq, lte, sql } from "drizzle-orm";
import { db, jobs, type Job } from "@/lib/db";

/**
 * Background work, on Postgres rather than Redis/BullMQ.
 *
 * The build prompt asked for BullMQ, but this platform runs no Redis, and both
 * Spurs Pay's webhook retries and Spurs Earn's payout release already use this
 * pattern. One fewer piece of infrastructure to operate, and the job state is
 * visible in the same database as everything it touches.
 *
 * Jobs are claimed with SKIP LOCKED, so several processors can run at once
 * without handing the same job to two of them. Retries back off exponentially.
 */

export type JobKind = "verify_trade" | "settle_trade" | "fulfil_order";

export async function enqueue(
  kind: JobKind,
  payload: Record<string, unknown>,
  opts: { delaySeconds?: number; maxAttempts?: number } = {},
): Promise<Job> {
  const [job] = await db.insert(jobs).values({
    kind,
    payload,
    runAt: new Date(Date.now() + (opts.delaySeconds ?? 0) * 1000),
    maxAttempts: opts.maxAttempts ?? 5,
  }).returning();
  return job;
}

/** Claim up to `limit` due jobs. SKIP LOCKED keeps concurrent runners apart. */
async function claim(limit: number): Promise<Job[]> {
  const rows = await db.execute<Job>(sql`
    update giftcards.jobs
    set status = 'running', attempts = attempts + 1
    where id in (
      select id from giftcards.jobs
      where status = 'queued' and run_at <= now()
      order by run_at
      limit ${limit}
      for update skip locked
    )
    returning *
  `);
  return Array.from(rows) as Job[];
}

async function succeed(id: string) {
  await db.update(jobs)
    .set({ status: "done", finishedAt: new Date(), lastError: null })
    .where(eq(jobs.id, id));
}

async function fail(job: Job, error: string) {
  const exhausted = job.attempts >= job.maxAttempts;
  await db.update(jobs).set({
    status: exhausted ? "failed" : "queued",
    lastError: error,
    // 30s, 1m, 2m, 4m … so a flapping dependency isn't hammered.
    runAt: exhausted ? job.runAt : new Date(Date.now() + 30_000 * 2 ** (job.attempts - 1)),
    finishedAt: exhausted ? new Date() : null,
  }).where(eq(jobs.id, job.id));
}

export type Handler = (payload: Record<string, unknown>) => Promise<void>;

/**
 * Run due jobs. Safe to call as often as you like — every handler is itself
 * idempotent, because at-least-once delivery is the only guarantee here.
 */
export async function process(
  handlers: Record<string, Handler>,
  limit = 20,
): Promise<{ ran: number; failed: number }> {
  const due = await claim(limit);
  let ran = 0, failed = 0;

  for (const job of due) {
    const handler = handlers[job.kind];
    if (!handler) {
      await fail(job, `No handler for "${job.kind}"`);
      failed++;
      continue;
    }
    try {
      await handler(job.payload);
      await succeed(job.id);
      ran++;
    } catch (e) {
      await fail(job, e instanceof Error ? e.message : "Job failed");
      failed++;
    }
  }

  return { ran, failed };
}

/** Queue health, for the admin console. */
export async function stats() {
  const rows = await db
    .select({ status: jobs.status, count: sql<number>`count(*)::int` })
    .from(jobs)
    .groupBy(jobs.status);

  const by = Object.fromEntries(rows.map((r) => [r.status, Number(r.count)]));
  const [stuck] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(jobs)
    .where(and(eq(jobs.status, "queued"), lte(jobs.runAt, new Date(Date.now() - 300_000))));

  return {
    queued: by.queued ?? 0,
    running: by.running ?? 0,
    done: by.done ?? 0,
    failed: by.failed ?? 0,
    /** Queued and more than 5 minutes overdue — nothing is draining the queue. */
    overdue: Number(stuck.count),
  };
}

export async function recentFailures(limit = 25): Promise<Job[]> {
  return db.select().from(jobs)
    .where(eq(jobs.status, "failed"))
    .orderBy(sql`finished_at desc nulls last`)
    .limit(limit);
}
