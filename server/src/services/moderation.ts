import { execute, query, queryOne, transaction } from '../db/index.js';
import { badRequest, notFound } from '../http/errors.js';
import { newId } from '../lib/id.js';
import { notify, notifyCohort } from './notifications.js';
import type { SessionUser } from '../types.js';
import { departmentIdForUser } from './users.js';

export type ModerationType = 'material' | 'announcement' | 'project' | 'hod_request';

export interface ModerationItemRow {
  id: string;
  type: ModerationType;
  targetId: string | null;
  title: string;
  details: string;
  departmentId: string | null;
  department: string | null;
  submittedBy: string;
  submittedByName: string;
  status: string;
  reviewNote: string;
  createdAt: Date;
}

export async function createModerationItem(input: {
  type: ModerationType;
  targetId: string | null;
  title: string;
  details?: string;
  departmentId?: string | null;
  submittedBy: string;
}): Promise<string> {
  const id = newId();
  await execute(
    `INSERT INTO moderation_items (id, type, target_id, title, details, department_id, submitted_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      id,
      input.type,
      input.targetId,
      input.title,
      input.details ?? '',
      input.departmentId ?? null,
      input.submittedBy,
    ],
  );
  return id;
}

/** HODs see their own department queue, admins see everything. */
export async function listPending(reviewer: SessionUser, status: 'pending' | 'reviewed' = 'pending') {
  const departmentId = await departmentIdForUser(reviewer.id);
  const params: unknown[] = [];
  let scope = '';
  if (reviewer.role !== 'admin' && departmentId) {
    params.push(departmentId);
    scope = `AND (m.department_id = $${params.length} OR m.department_id IS NULL)`;
  }
  // `status` is interpolated from a closed enum, never from user input.
  const statusFilter =
    status === 'pending' ? "m.status = 'pending'" : "m.status <> 'pending'";

  return query<ModerationItemRow>(
    `SELECT m.id, m.type, m.target_id AS "targetId", m.title, m.details,
            m.department_id AS "departmentId", d.name AS department,
            m.submitted_by AS "submittedBy",
            (su.first_name || ' ' || su.last_name) AS "submittedByName",
            m.status, m.review_note AS "reviewNote", m.created_at AS "createdAt"
       FROM moderation_items m
       JOIN users su ON su.id = m.submitted_by
       LEFT JOIN departments d ON d.id = m.department_id
      WHERE ${statusFilter} ${scope}
      ORDER BY m.created_at DESC
      LIMIT 100`,
    params,
  );
}

export async function reviewItem(
  reviewer: SessionUser,
  itemId: string,
  decision: 'approved' | 'rejected',
  note: string,
): Promise<void> {
  const item = await queryOne<ModerationItemRow>(
    `SELECT m.id, m.type, m.target_id AS "targetId", m.title, m.details,
            m.department_id AS "departmentId", NULL AS department,
            m.submitted_by AS "submittedBy", '' AS "submittedByName",
            m.status, m.review_note AS "reviewNote", m.created_at AS "createdAt"
       FROM moderation_items m WHERE m.id = $1`,
    [itemId],
  );
  if (!item) throw notFound('That review item no longer exists.');
  if (item.status !== 'pending') throw badRequest('That item has already been reviewed.');

  const approved = decision === 'approved';

  await transaction(async (q) => {
    if (item.type === 'material' && item.targetId) {
      const material = await q<{ courseId: string; title: string }>(
        'SELECT course_id AS "courseId", title FROM course_materials WHERE id = $1',
        [item.targetId],
      );
      await q('UPDATE course_materials SET status = $2 WHERE id = $1', [
        item.targetId,
        approved ? 'published' : 'rejected',
      ]);
      if (material[0]) {
        const course = await q<{ departmentId: string; level: string; code: string }>(
          'SELECT department_id AS "departmentId", level, code FROM courses WHERE id = $1',
          [material[0].courseId],
        );
        if (approved && course[0]) {
          await notifyCohort(course[0].departmentId, course[0].level, {
            title: `New material in ${course[0].code}`,
            body: material[0].title,
            kind: 'academic',
          });
        }
      }
    }

    if (item.type === 'announcement' && item.targetId) {
      await q(
        `UPDATE announcements SET status = $2, published_at = CASE WHEN $3 THEN now() ELSE published_at END
          WHERE id = $1`,
        [item.targetId, approved ? 'published' : 'rejected', approved],
      );
      if (approved) {
        const row = await q<{ departmentId: string | null; level: string | null; title: string }>(
          `SELECT a.department_id AS "departmentId", NULL::text AS level, a.title
             FROM announcements a WHERE a.id = $1`,
          [item.targetId],
        );
        if (row[0]?.departmentId) {
          const cohorts = await q<{ level: string }>(
            `SELECT DISTINCT level FROM student_profiles WHERE department_id = $1`,
            [row[0].departmentId],
          );
          for (const cohort of cohorts) {
            await notifyCohort(row[0].departmentId, cohort.level, {
              title: row[0].title,
              body: 'A new announcement was published.',
              kind: 'academic',
            });
          }
        }
      }
    }

    if (item.type === 'project' && item.targetId) {
      await q('UPDATE projects SET status = $2 WHERE id = $1', [
        item.targetId,
        approved ? 'approved' : 'rejected',
      ]);
    }

    if (item.type === 'hod_request' && item.targetId) {
      if (approved) {
        await q(`UPDATE users SET role = 'hod', updated_at = now() WHERE id = $1`, [item.targetId]);
        await q('UPDATE staff_profiles SET hod_requested_at = NULL WHERE user_id = $1', [item.targetId]);
      }
    }

    await q(
      `UPDATE moderation_items
          SET status = $2, reviewer_id = $3, review_note = $4, reviewed_at = now()
        WHERE id = $1`,
      [itemId, decision, reviewer.id, note],
    );
  });

  await notify([item.submittedBy], {
    title: approved ? 'Approved ✅' : 'Not approved',
    body: `${item.title} — ${approved ? 'your submission was approved.' : `reviewer note: ${note || 'none'}`}`,
    kind: 'moderation',
  });
}
