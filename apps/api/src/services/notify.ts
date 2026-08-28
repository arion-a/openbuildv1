import { pool } from '../db/pool.js';

export type NotifyType =
  | 'star_build'
  | 'review_build'
  | 'comment_build'
  | 'star_idea'
  | 'comment_idea'
  | 'message'
  | 'follow';

// Fire-and-forget: a failed notification must never break the action that
// triggered it. Self-actions (acting on your own thing) are skipped.
export async function notify(opts: {
  userId: string;
  actorId?: string | null;
  type: NotifyType;
  refKind?: 'build' | 'idea' | 'maker' | null;
  refId?: string | null;
}): Promise<void> {
  if (!opts.userId || (opts.actorId && opts.actorId === opts.userId)) return;
  try {
    await pool.query(
      `INSERT INTO notifications (user_id, actor_id, type, ref_kind, ref_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [opts.userId, opts.actorId || null, opts.type, opts.refKind || null, opts.refId || null]
    );
  } catch (err) {
    console.warn('[notify] insert failed:', (err as Error).message);
  }
}
