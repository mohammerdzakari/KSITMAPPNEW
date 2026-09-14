import { Router } from 'express';
import { z } from 'zod';
import { execute, query, queryOne } from '../db/index.js';
import { badRequest, forbidden, notFound } from '../http/errors.js';
import { idParam, parse } from '../http/validate.js';
import { newId } from '../lib/id.js';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { canModerate } from '../auth/permissions.js';
import { createModerationItem } from '../services/moderation.js';
import { notifyCohort, notifyModerators } from '../services/notifications.js';
import { avatarFor, departmentIdForUser } from '../services/users.js';

export const announcementsRouter = Router();
announcementsRouter.use(requireAuth);

const announcementSchema = z.object({
  title: z.string().trim().min(3).max(160),
  content: z.string().trim().min(3).max(4000),
  type: z.enum(['academic', 'general', 'urgent']).default('general'),
  departmentOnly: z.boolean().optional(),
});

/** GET /api/announcements — published announcements the caller is allowed to see. */
announcementsRouter.get('/', async (req, res) => {
  const user = req.currentUser!;
  const scope = String(req.query.scope ?? 'feed');
  const departmentId = await departmentIdForUser(user.id);

  if (user.role === 'student') {
    const rows = await query(
      `SELECT a.id, a.title, a.content, a.type, a.department_id AS "departmentId",
              d.name AS department, a.published_at AS "publishedAt", a.created_at AS "createdAt",
              (u.first_name || ' ' || u.last_name) AS "authorName",
              u.avatar_file_id AS "authorAvatarFileId", u.first_name AS "authorFirst", u.last_name AS "authorLast"
         FROM announcements a
         JOIN users u ON u.id = a.author_id
         LEFT JOIN departments d ON d.id = a.department_id
        WHERE a.status = 'published'
          AND (a.department_id IS NULL OR a.department_id = $1)
        ORDER BY a.published_at DESC NULLS LAST, a.created_at DESC
        LIMIT 50`,
      [departmentId],
    );
    res.json({ announcements: shape(rows) });
    return;
  }

  // Staff feed: published items plus their own pending drafts.
  const rows = await query(
    `SELECT a.id, a.title, a.content, a.type, a.department_id AS "departmentId",
            d.name AS department, a.status, a.published_at AS "publishedAt", a.created_at AS "createdAt",
            (u.first_name || ' ' || u.last_name) AS "authorName",
            u.avatar_file_id AS "authorAvatarFileId", u.first_name AS "authorFirst", u.last_name AS "authorLast",
            (a.author_id = $2) AS mine
       FROM announcements a
       JOIN users u ON u.id = a.author_id
       LEFT JOIN departments d ON d.id = a.department_id
      WHERE a.status = 'published'
         OR (a.status = 'pending' AND a.author_id = $2)
         OR ($3 AND a.status = 'pending')
      ORDER BY a.created_at DESC
      LIMIT 50`,
    [departmentId, user.id, canModerate(user.role)],
  );
  res.json({ announcements: shape(rows), scope });
});

function shape(rows: Record<string, unknown>[]) {
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    content: r.content,
    type: r.type,
    status: r.status ?? 'published',
    department: r.department ?? null,
    departmentId: r.departmentId ?? null,
    publishedAt: r.publishedAt,
    createdAt: r.createdAt,
    authorName: r.authorName,
    authorAvatar: avatarFor(String(r.authorFirst ?? ''), String(r.authorLast ?? ''), (r.authorAvatarFileId as string) ?? null),
    mine: r.mine ?? false,
  }));
}

announcementsRouter.post('/', requireRole('lecturer', 'hod', 'admin'), async (req, res) => {
  const user = req.currentUser!;
  const body = parse(announcementSchema, req.body);
  const departmentId = body.departmentOnly ? await departmentIdForUser(user.id) : null;
  if (body.departmentOnly && !departmentId) {
    throw badRequest('Your account has no department, so you can only post campus-wide.');
  }

  const id = newId();
  const autoPublish = canModerate(user.role);
  await execute(
    `INSERT INTO announcements (id, title, content, type, department_id, status, author_id, published_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      id,
      body.title,
      body.content,
      body.type,
      departmentId,
      autoPublish ? 'published' : 'pending',
      user.id,
      autoPublish ? new Date() : null,
    ],
  );

  if (autoPublish) {
    if (departmentId) {
      const cohorts = await query<{ level: string }>(
        'SELECT DISTINCT level FROM student_profiles WHERE department_id = $1',
        [departmentId],
      );
      for (const cohort of cohorts) {
        await notifyCohort(departmentId, cohort.level, {
          title: body.title,
          body: body.content.slice(0, 120),
          kind: 'academic',
        });
      }
    }
  } else {
    await createModerationItem({
      type: 'announcement',
      targetId: id,
      title: `Announcement: ${body.title}`,
      details: body.content.slice(0, 300),
      departmentId,
      submittedBy: user.id,
    });
    await notifyModerators(departmentId, {
      title: 'Announcement awaiting approval',
      body: body.title,
      kind: 'moderation',
    });
  }

  res.status(201).json({ id, status: autoPublish ? 'published' : 'pending' });
});

announcementsRouter.patch('/:id', requireRole('lecturer', 'hod', 'admin'), async (req, res) => {
  const user = req.currentUser!;
  const existing = await queryOne<{ authorId: string; status: string }>(
    'SELECT author_id AS "authorId", status FROM announcements WHERE id = $1',
    [idParam(req)],
  );
  if (!existing) throw notFound('That announcement does not exist.');
  if (existing.authorId !== user.id && !canModerate(user.role)) {
    throw forbidden('You can only edit your own announcements.');
  }
  const body = parse(announcementSchema.partial(), req.body);
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const [column, value] of [
    ['title', body.title],
    ['content', body.content],
    ['type', body.type],
  ] as const) {
    if (value !== undefined) {
      params.push(value);
      sets.push(`${column} = $${params.length}`);
    }
  }
  if (sets.length === 0) throw badRequest('Nothing to update.');
  params.push(idParam(req));
  await execute(`UPDATE announcements SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
  res.json({ ok: true });
});

announcementsRouter.delete('/:id', requireRole('lecturer', 'hod', 'admin'), async (req, res) => {
  const user = req.currentUser!;
  const existing = await queryOne<{ authorId: string }>(
    'SELECT author_id AS "authorId" FROM announcements WHERE id = $1',
    [idParam(req)],
  );
  if (!existing) throw notFound('That announcement does not exist.');
  if (existing.authorId !== user.id && !canModerate(user.role)) {
    throw forbidden('You can only delete your own announcements.');
  }
  await execute('DELETE FROM announcements WHERE id = $1', [idParam(req)]);
  await execute("DELETE FROM moderation_items WHERE type = 'announcement' AND target_id = $1", [
    idParam(req),
  ]);
  res.json({ ok: true });
});
