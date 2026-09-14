import { Router } from 'express';
import { z } from 'zod';
import { execute, query, queryOne } from '../db/index.js';
import { forbidden, notFound } from '../http/errors.js';
import { idParam, parse } from '../http/validate.js';
import { newId } from '../lib/id.js';
import { requireAuth } from '../auth/middleware.js';
import { canModerate } from '../auth/permissions.js';
import { avatarFor } from '../services/users.js';
import { ensureRoomConversation } from './messages.js';

export const roomsRouter = Router();
roomsRouter.use(requireAuth);

roomsRouter.get('/', async (req, res) => {
  const userId = req.currentUser!.id;
  const rooms = await query<{
    id: string;
    title: string;
    topic: string;
    hostId: string;
    hostName: string;
    participantCount: number;
    joined: boolean;
    createdAt: Date;
  }>(
    `SELECT r.id, r.title, r.topic, r.host_id AS "hostId",
            (h.first_name || ' ' || h.last_name) AS "hostName",
            (SELECT COUNT(*)::int FROM study_room_participants p WHERE p.room_id = r.id) AS "participantCount",
            EXISTS(SELECT 1 FROM study_room_participants p WHERE p.room_id = r.id AND p.user_id = $1) AS joined,
            r.created_at AS "createdAt"
       FROM study_rooms r
       JOIN users h ON h.id = r.host_id
      WHERE r.is_active = true
      ORDER BY r.created_at DESC LIMIT 50`,
    [userId],
  );
  res.json({ rooms });
});

roomsRouter.post('/', async (req, res) => {
  const user = req.currentUser!;
  const { title, topic } = parse(
    z.object({ title: z.string().trim().min(3).max(120), topic: z.string().trim().max(60).optional() }),
    req.body,
  );
  const id = newId();
  await execute('INSERT INTO study_rooms (id, title, topic, host_id) VALUES ($1, $2, $3, $4)', [
    id,
    title,
    topic ?? '',
    user.id,
  ]);
  await execute('INSERT INTO study_room_participants (room_id, user_id) VALUES ($1, $2)', [id, user.id]);
  await ensureRoomConversation(id);
  res.status(201).json({ id });
});

roomsRouter.post('/:id/join', async (req, res) => {
  const room = await queryOne<{ id: string; isActive: boolean }>(
    'SELECT id, is_active AS "isActive" FROM study_rooms WHERE id = $1',
    [idParam(req)],
  );
  if (!room) throw notFound('That study room does not exist.');
  if (!room.isActive) throw forbidden('That study room has ended.');

  await execute('INSERT INTO study_room_participants (room_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [
    room.id,
    req.currentUser!.id,
  ]);
  const conversationId = await ensureRoomConversation(room.id);
  await execute(
    'INSERT INTO conversation_members (conversation_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [conversationId, req.currentUser!.id],
  );
  const count = await queryOne<{ n: number }>(
    'SELECT COUNT(*)::int AS n FROM study_room_participants WHERE room_id = $1',
    [room.id],
  );
  res.json({ joined: true, participantCount: count?.n ?? 0, conversationId });
});

roomsRouter.delete('/:id/join', async (req, res) => {
  await execute('DELETE FROM study_room_participants WHERE room_id = $1 AND user_id = $2', [
    idParam(req),
    req.currentUser!.id,
  ]);
  const count = await queryOne<{ n: number }>(
    'SELECT COUNT(*)::int AS n FROM study_room_participants WHERE room_id = $1',
    [idParam(req)],
  );
  res.json({ joined: false, participantCount: count?.n ?? 0 });
});

roomsRouter.get('/:id/participants', async (req, res) => {
  const room = await queryOne('SELECT id FROM study_rooms WHERE id = $1', [idParam(req)]);
  if (!room) throw notFound('That study room does not exist.');
  const participants = await query<{
    userId: string;
    firstName: string;
    lastName: string;
    avatarFileId: string | null;
  }>(
    `SELECT u.id AS "userId", u.first_name AS "firstName", u.last_name AS "lastName", u.avatar_file_id AS "avatarFileId"
       FROM study_room_participants p JOIN users u ON u.id = p.user_id
      WHERE p.room_id = $1 ORDER BY p.joined_at ASC`,
    [idParam(req)],
  );
  res.json({
    participants: participants.map((p) => ({
      userId: p.userId,
      name: `${p.firstName} ${p.lastName}`,
      avatarUrl: avatarFor(p.firstName, p.lastName, p.avatarFileId),
    })),
  });
});

roomsRouter.post('/:id/close', async (req, res) => {
  const user = req.currentUser!;
  const room = await queryOne<{ hostId: string }>('SELECT host_id AS "hostId" FROM study_rooms WHERE id = $1', [
    idParam(req),
  ]);
  if (!room) throw notFound('That study room does not exist.');
  if (room.hostId !== user.id && !canModerate(user.role)) {
    throw forbidden('Only the host can end this study room.');
  }
  await execute('UPDATE study_rooms SET is_active = false, closed_at = now() WHERE id = $1', [idParam(req)]);
  res.json({ ok: true });
});
