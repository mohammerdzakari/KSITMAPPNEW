import { Router } from 'express';
import { z } from 'zod';
import { execute, query, queryOne } from '../db/index.js';
import { forbidden, notFound } from '../http/errors.js';
import { idParam, parse } from '../http/validate.js';
import { newId } from '../lib/id.js';
import { requireAuth } from '../auth/middleware.js';
import { canModerate } from '../auth/permissions.js';
import { createModerationItem } from '../services/moderation.js';
import { notifyModerators } from '../services/notifications.js';
import { avatarFor, departmentIdForUser } from '../services/users.js';

export const projectsRouter = Router();
projectsRouter.use(requireAuth);

const projectSchema = z.object({
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().min(10).max(4000),
  category: z.string().trim().min(2).max(60),
});

projectsRouter.get('/', async (req, res) => {
  const user = req.currentUser!;
  const moderator = canModerate(user.role);
  const rows = await query<Record<string, unknown>>(
    `SELECT p.id, p.title, p.description, p.category, p.status, p.created_at AS "createdAt",
            p.author_id AS "authorId",
            (u.first_name || ' ' || u.last_name) AS "authorName",
            u.first_name AS "authorFirst", u.last_name AS "authorLast", u.avatar_file_id AS "authorAvatarFileId",
            (SELECT COUNT(*)::int FROM project_votes v WHERE v.project_id = p.id) AS "voteCount",
            EXISTS(SELECT 1 FROM project_votes v WHERE v.project_id = p.id AND v.user_id = $1) AS "votedByMe"
       FROM projects p
       JOIN users u ON u.id = p.author_id
      WHERE p.status = 'approved' OR p.author_id = $1 OR $2
      ORDER BY
        CASE WHEN p.status = 'approved' THEN 0 ELSE 1 END,
        (SELECT COUNT(*) FROM project_votes v WHERE v.project_id = p.id) DESC,
        p.created_at DESC
      LIMIT 100`,
    [user.id, moderator],
  );
  res.json({
    projects: rows.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      category: r.category,
      status: r.status,
      createdAt: r.createdAt,
      authorId: r.authorId,
      authorName: r.authorName,
      authorAvatar: avatarFor(
        String(r.authorFirst ?? ''),
        String(r.authorLast ?? ''),
        (r.authorAvatarFileId as string) ?? null,
      ),
      voteCount: r.voteCount,
      votedByMe: r.votedByMe,
      mine: r.authorId === user.id,
    })),
  });
});

/** Projects go live only after moderation approval. */
projectsRouter.post('/', async (req, res) => {
  const user = req.currentUser!;
  const body = parse(projectSchema, req.body);
  const id = newId();
  await execute(
    `INSERT INTO projects (id, title, description, category, author_id, status)
     VALUES ($1, $2, $3, $4, $5, 'pending')`,
    [id, body.title, body.description, body.category, user.id],
  );
  const departmentId = await departmentIdForUser(user.id);
  await createModerationItem({
    type: 'project',
    targetId: id,
    title: `Innovation Hub project: ${body.title}`,
    details: `${body.category} — ${body.description.slice(0, 300)}`,
    departmentId,
    submittedBy: user.id,
  });
  await notifyModerators(departmentId, {
    title: 'Project awaiting approval',
    body: `${body.title} was submitted to the Innovation Hub.`,
    kind: 'moderation',
  });
  res.status(201).json({ id, status: 'pending' });
});

projectsRouter.post('/:id/vote', async (req, res) => {
  const user = req.currentUser!;
  const project = await queryOne<{ status: string }>('SELECT status FROM projects WHERE id = $1', [
    idParam(req),
  ]);
  if (!project) throw notFound('That project does not exist.');

  const existing = await queryOne('SELECT user_id FROM project_votes WHERE project_id = $1 AND user_id = $2', [
    idParam(req),
    user.id,
  ]);
  if (existing) {
    await execute('DELETE FROM project_votes WHERE project_id = $1 AND user_id = $2', [idParam(req), user.id]);
  } else {
    await execute('INSERT INTO project_votes (project_id, user_id) VALUES ($1, $2)', [idParam(req), user.id]);
  }
  const count = await queryOne<{ n: number }>(
    'SELECT COUNT(*)::int AS n FROM project_votes WHERE project_id = $1',
    [idParam(req)],
  );
  res.json({ voted: !existing, voteCount: count?.n ?? 0 });
});

projectsRouter.delete('/:id', async (req, res) => {
  const user = req.currentUser!;
  const project = await queryOne<{ authorId: string }>('SELECT author_id AS "authorId" FROM projects WHERE id = $1', [
    idParam(req),
  ]);
  if (!project) throw notFound('That project does not exist.');
  if (project.authorId !== user.id && !canModerate(user.role)) {
    throw forbidden('You can only delete your own projects.');
  }
  await execute('DELETE FROM projects WHERE id = $1', [idParam(req)]);
  await execute("DELETE FROM moderation_items WHERE type = 'project' AND target_id = $1", [idParam(req)]);
  res.json({ ok: true });
});
