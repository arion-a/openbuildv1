import { pool } from '../db/pool.js';

type EntityType = 'project' | 'idea';

export async function logEdit(entityType: EntityType, entityId: string, actorId: string, before: unknown, after: unknown) {
  await pool.query(
    `INSERT INTO content_audit_log (entity_type, entity_id, action, actor_id, before, after)
     VALUES ($1, $2, 'edit', $3, $4, $5)`,
    [entityType, entityId, actorId, JSON.stringify(before), JSON.stringify(after)]
  );
}

export async function logDelete(entityType: EntityType, entityId: string, actorId: string, before: unknown) {
  await pool.query(
    `INSERT INTO content_audit_log (entity_type, entity_id, action, actor_id, before, after)
     VALUES ($1, $2, 'delete', $3, $4, NULL)`,
    [entityType, entityId, actorId, JSON.stringify(before)]
  );
}

export async function getHistory(entityType: EntityType, entityId: string) {
  const res = await pool.query(
    `SELECT cal.id, cal.action, cal.before, cal.after, cal.created_at,
            COALESCE(NULLIF(TRIM(u.display_name), ''), u.username) AS actor_name, u.username AS actor_username
     FROM content_audit_log cal
     LEFT JOIN users u ON u.id = cal.actor_id
     WHERE cal.entity_type = $1 AND cal.entity_id = $2
     ORDER BY cal.created_at DESC`,
    [entityType, entityId]
  );
  return res.rows;
}
