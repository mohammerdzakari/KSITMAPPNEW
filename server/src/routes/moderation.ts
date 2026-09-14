import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/index.js';
import { idParam, parse } from '../http/validate.js';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { canModerate } from '../auth/permissions.js';
import { listPending, reviewItem } from '../services/moderation.js';
import { forbidden } from '../http/errors.js';

export const moderationRouter = Router();
moderationRouter.use(requireAuth);

/** Approval queue (HOD / admin). */
moderationRouter.get('/', requireRole('hod', 'admin'), async (req, res) => {
  const status = req.query.status === 'reviewed' ? 'reviewed' : 'pending';
  const items = await listPending(req.currentUser!, status);
  res.json({ items });
});

moderationRouter.post('/:id/review', requireRole('hod', 'admin'), async (req, res) => {
  const body = parse(
    z.object({ decision: z.enum(['approved', 'rejected']), note: z.string().trim().max(500).optional() }),
    req.body,
  );
  await reviewItem(req.currentUser!, idParam(req), body.decision, body.note ?? '');
  res.json({ ok: true });
});

/** Everything the caller has submitted that is waiting on (or finished) review. */
moderationRouter.get('/mine', async (req, res) => {
  const user = req.currentUser!;
  if (user.role === 'student') {
    const projects = await query<{
      id: string;
      title: string;
      description: string;
      category: string;
      status: string;
      createdAt: Date;
    }>(
      `SELECT id, title, description, category, status, created_at AS "createdAt" FROM projects
        WHERE author_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [user.id],
    );
    res.json({
      items: projects.map((p) => ({
        id: p.id,
        type: 'project',
        targetId: p.id,
        title: `${p.title} (${p.category})`,
        details: p.description.slice(0, 160),
        departmentId: null,
        department: null,
        submittedBy: user.id,
        submittedByName: `${user.firstName} ${user.lastName}`,
        status: p.status,
        reviewNote: '',
        createdAt: p.createdAt,
      })),
    });
    return;
  }

  // Same shape as the review queue so the client can render either list.
  const rows = await query(
    `SELECT m.id, m.type, m.target_id AS "targetId", m.title, m.details,
            m.department_id AS "departmentId", d.name AS department,
            m.submitted_by AS "submittedBy",
            (u.first_name || ' ' || u.last_name) AS "submittedByName",
            m.status, m.review_note AS "reviewNote", m.created_at AS "createdAt"
       FROM moderation_items m
       JOIN users u ON u.id = m.submitted_by
       LEFT JOIN departments d ON d.id = m.department_id
      WHERE m.submitted_by = $1
      ORDER BY m.created_at DESC LIMIT 50`,
    [user.id],
  );
  res.json({ items: rows });
});
