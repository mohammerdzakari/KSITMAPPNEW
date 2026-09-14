import { Router } from 'express';
import { z } from 'zod';
import { execute, query, queryOne } from '../db/index.js';
import { conflict, forbidden, notFound } from '../http/errors.js';
import { idParam, parse } from '../http/validate.js';
import { newId } from '../lib/id.js';
import { requireAuth } from '../auth/middleware.js';
import { canModerate } from '../auth/permissions.js';
import { avatarFor } from '../services/users.js';

export const communitiesRouter = Router();
communitiesRouter.use(requireAuth);

const communitySchema = z.object({
  name: z.string().trim().min(3).max(60),
  icon: z.string().trim().min(1).max(8).optional(),
  description: z.string().trim().max(200).optional(),
});

communitiesRouter.get('/', async (req, res) => {
  const userId = req.currentUser!.id;
  const rows = await query<{
    id: string;
    name: string;
    icon: string;
    description: string;
    memberCount: number;
    joined: boolean;
  }>(
    `SELECT c.id, c.name, c.icon, c.description,
            (SELECT COUNT(*)::int FROM community_members m WHERE m.community_id = c.id) AS "memberCount",
            EXISTS(SELECT 1 FROM community_members m WHERE m.community_id = c.id AND m.user_id = $1) AS joined
       FROM communities c
      ORDER BY "memberCount" DESC, c.name ASC`,
    [userId],
  );
  res.json({ communities: rows });
});

communitiesRouter.post('/', async (req, res) => {
  const user = req.currentUser!;
  const body = parse(communitySchema, req.body);
  const duplicate = await queryOne('SELECT id FROM communities WHERE lower(name) = lower($1)', [body.name]);
  if (duplicate) throw conflict('A community with that name already exists.');
  const id = newId();
  await execute('INSERT INTO communities (id, name, icon, description) VALUES ($1, $2, $3, $4)', [
    id,
    body.name,
    body.icon ?? '💬',
    body.description ?? '',
  ]);
  await execute('INSERT INTO community_members (community_id, user_id) VALUES ($1, $2)', [id, user.id]);
  res.status(201).json({ id });
});

communitiesRouter.post('/:id/join', async (req, res) => {
  const community = await queryOne('SELECT id FROM communities WHERE id = $1', [idParam(req)]);
  if (!community) throw notFound('That community does not exist.');
  await execute('INSERT INTO community_members (community_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [
    idParam(req),
    req.currentUser!.id,
  ]);
  const count = await queryOne<{ n: number }>(
    'SELECT COUNT(*)::int AS n FROM community_members WHERE community_id = $1',
    [idParam(req)],
  );
  res.json({ joined: true, memberCount: count?.n ?? 0 });
});

communitiesRouter.delete('/:id/join', async (req, res) => {
  await execute('DELETE FROM community_members WHERE community_id = $1 AND user_id = $2', [
    idParam(req),
    req.currentUser!.id,
  ]);
  const count = await queryOne<{ n: number }>(
    'SELECT COUNT(*)::int AS n FROM community_members WHERE community_id = $1',
    [idParam(req)],
  );
  res.json({ joined: false, memberCount: count?.n ?? 0 });
});

communitiesRouter.get('/:id/members', async (req, res) => {
  const community = await queryOne<{ name: string }>('SELECT name FROM communities WHERE id = $1', [
    idParam(req),
  ]);
  if (!community) throw notFound('That community does not exist.');
  const members = await query<{
    userId: string;
    firstName: string;
    lastName: string;
    avatarFileId: string | null;
    role: string;
    matricNumber: string | null;
  }>(
    `SELECT u.id AS "userId", u.first_name AS "firstName", u.last_name AS "lastName",
            u.avatar_file_id AS "avatarFileId", u.role, sp.matric_number AS "matricNumber"
       FROM community_members m
       JOIN users u ON u.id = m.user_id
       LEFT JOIN student_profiles sp ON sp.user_id = u.id
      WHERE m.community_id = $1
      ORDER BY m.joined_at DESC LIMIT 200`,
    [idParam(req)],
  );
  res.json({
    name: community.name,
    members: members.map((m) => ({
      userId: m.userId,
      name: `${m.firstName} ${m.lastName}`,
      role: m.role,
      identifier: m.matricNumber,
      avatarUrl: avatarFor(m.firstName, m.lastName, m.avatarFileId),
    })),
  });
});

communitiesRouter.delete('/:id', async (req, res) => {
  if (!canModerate(req.currentUser!.role)) throw forbidden('Only an HOD or admin can remove a community.');
  await execute('DELETE FROM communities WHERE id = $1', [idParam(req)]);
  res.json({ ok: true });
});
