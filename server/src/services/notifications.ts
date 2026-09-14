import { execute, query, queryOne } from '../db/index.js';
import { newId } from '../lib/id.js';

export interface NotificationInput {
  title: string;
  body?: string;
  kind?: string;
}

/**
 * Notifications are intentionally simple: a row per recipient, created inside
 * the same transaction as the event that caused them.
 */
export async function notify(userIds: string[], input: NotificationInput): Promise<number> {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (unique.length === 0) return 0;
  let count = 0;
  for (const userId of unique) {
    count += await execute(
      `INSERT INTO notifications (id, user_id, title, body, kind) VALUES ($1, $2, $3, $4, $5)`,
      [newId(), userId, input.title, input.body ?? '', input.kind ?? 'general'],
    );
  }
  return count;
}

async function userIds(sql: string, params: unknown[] = []): Promise<string[]> {
  const rows = await query<{ id: string }>(sql, params);
  return rows.map((r) => r.id);
}

/** Notifies every student in a department + level cohort. */
export async function notifyCohort(
  departmentId: string,
  level: string,
  input: NotificationInput,
): Promise<number> {
  const ids = await userIds(
    `SELECT sp.user_id AS id
       FROM student_profiles sp
       JOIN users u ON u.id = sp.user_id
      WHERE sp.department_id = $1 AND sp.level = $2 AND u.is_active = true`,
    [departmentId, level],
  );
  return notify(ids, input);
}

export async function notifyAllUsers(input: NotificationInput): Promise<number> {
  const ids = await userIds('SELECT id FROM users WHERE is_active = true');
  return notify(ids, input);
}

/** Every admin, plus HODs responsible for the given department (if any). */
export async function notifyModerators(
  departmentId: string | null,
  input: NotificationInput,
): Promise<number> {
  const ids = await userIds(
    `SELECT u.id
       FROM users u
       LEFT JOIN staff_profiles sp ON sp.user_id = u.id
      WHERE u.is_active = true
        AND (u.role = 'admin' OR (u.role = 'hod' AND ($1::uuid IS NULL OR sp.department_id = $1)))`,
    [departmentId],
  );
  return notify(ids, input);
}

export async function unreadCount(userId: string): Promise<number> {
  const row = await queryOne<{ n: number }>(
    'SELECT COUNT(*)::int AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL',
    [userId],
  );
  return row?.n ?? 0;
}

export async function listNotifications(userId: string, limit = 30) {
  return query(
    `SELECT id, title, body, kind, read_at AS "readAt", created_at AS "createdAt"
       FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [userId, limit],
  );
}

export async function markRead(userId: string, notificationId?: string): Promise<void> {
  if (notificationId) {
    await execute('UPDATE notifications SET read_at = now() WHERE user_id = $1 AND id = $2', [
      userId,
      notificationId,
    ]);
    return;
  }
  await execute('UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL', [
    userId,
  ]);
}
