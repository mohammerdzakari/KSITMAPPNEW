import { Router } from 'express';
import { z } from 'zod';
import { execute, query, queryOne, transaction } from '../db/index.js';
import { badRequest, forbidden, notFound } from '../http/errors.js';
import { idParam, parse, parsePositiveInt } from '../http/validate.js';
import { newId } from '../lib/id.js';
import { requireAuth } from '../auth/middleware.js';
import { avatarFor } from '../services/users.js';
import { initialsAvatar } from '../lib/avatar.js';

/**
 * Mounted at `/api/conversations` and `/api/people` (see app.ts) so that no
 * router swallows every unmatched `/api/*` path before the 404 handler.
 */
export const conversationsRouter = Router();
conversationsRouter.use(requireAuth);

export const peopleRouter = Router();
peopleRouter.use(requireAuth);

/** Finds or creates the shared conversation that backs a study room. */
export async function ensureRoomConversation(roomId: string): Promise<string> {
  const existing = await queryOne<{ id: string }>(
    'SELECT id FROM conversations WHERE room_id = $1',
    [roomId],
  );
  if (existing) return existing.id;
  const id = newId();
  await execute(
    `INSERT INTO conversations (id, type, room_id) VALUES ($1, 'room', $2)`,
    [id, roomId],
  );
  const participants = await query<{ userId: string }>(
    'SELECT user_id AS "userId" FROM study_room_participants WHERE room_id = $1',
    [roomId],
  );
  for (const p of participants) {
    await execute(
      'INSERT INTO conversation_members (conversation_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [id, p.userId],
    );
  }
  return id;
}

function directKey(a: string, b: string): string {
  return [a, b].sort().join('|');
}

async function assertMember(conversationId: string, userId: string): Promise<void> {
  const row = await queryOne(
    'SELECT user_id FROM conversation_members WHERE conversation_id = $1 AND user_id = $2',
    [conversationId, userId],
  );
  if (!row) throw forbidden('You are not part of that conversation.');
}

/** GET /api/conversations — inbox with last message and unread counts. */
conversationsRouter.get('/', async (req, res) => {
  const userId = req.currentUser!.id;
  const rows = await query<{
    id: string;
    type: string;
    roomId: string | null;
    roomTitle: string | null;
    partnerId: string | null;
    partnerName: string | null;
    partnerFirst: string | null;
    partnerLast: string | null;
    partnerAvatar: string | null;
    lastMessage: string | null;
    lastMessageAt: Date | null;
    unread: number;
  }>(
    `SELECT c.id, c.type, c.room_id AS "roomId", r.title AS "roomTitle",
            (SELECT u2.id FROM conversation_members m2 JOIN users u2 ON u2.id = m2.user_id
              WHERE m2.conversation_id = c.id AND u2.id <> $1 LIMIT 1) AS "partnerId",
            (SELECT (u2.first_name || ' ' || u2.last_name) FROM conversation_members m2 JOIN users u2 ON u2.id = m2.user_id
              WHERE m2.conversation_id = c.id AND u2.id <> $1 LIMIT 1) AS "partnerName",
            (SELECT u2.first_name FROM conversation_members m2 JOIN users u2 ON u2.id = m2.user_id
              WHERE m2.conversation_id = c.id AND u2.id <> $1 LIMIT 1) AS "partnerFirst",
            (SELECT u2.last_name FROM conversation_members m2 JOIN users u2 ON u2.id = m2.user_id
              WHERE m2.conversation_id = c.id AND u2.id <> $1 LIMIT 1) AS "partnerLast",
            (SELECT u2.avatar_file_id FROM conversation_members m2 JOIN users u2 ON u2.id = m2.user_id
              WHERE m2.conversation_id = c.id AND u2.id <> $1 LIMIT 1) AS "partnerAvatar",
            (SELECT m.body FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS "lastMessage",
            (SELECT m.created_at FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS "lastMessageAt",
            (SELECT COUNT(*)::int FROM messages m
              WHERE m.conversation_id = c.id AND m.sender_id <> $1
                AND m.created_at > COALESCE(cm.last_read_at, 'epoch'::timestamptz)) AS unread
       FROM conversation_members cm
       JOIN conversations c ON c.id = cm.conversation_id
       LEFT JOIN study_rooms r ON r.id = c.room_id
      WHERE cm.user_id = $1
      ORDER BY "lastMessageAt" DESC NULLS LAST, c.created_at DESC
      LIMIT 50`,
    [userId],
  );

  res.json({
    conversations: rows.map((r) => ({
      id: r.id,
      type: r.type,
      isGroup: r.type === 'room',
      title: r.type === 'room' ? r.roomTitle : r.partnerName,
      partnerId: r.partnerId,
      avatarUrl:
        r.type === 'room'
          ? initialsAvatar(r.roomTitle ?? 'Study Room')
          : avatarFor(r.partnerFirst ?? '', r.partnerLast ?? '', r.partnerAvatar),
      lastMessage: r.lastMessage,
      lastMessageAt: r.lastMessageAt,
      unread: r.unread,
    })),
    totalUnread: rows.reduce((sum, r) => sum + (r.unread || 0), 0),
  });
});

/** Starts (or reuses) a direct conversation with another member of the school. */
conversationsRouter.post('/direct', async (req, res) => {
  const user = req.currentUser!;
  const { userId } = parse(z.object({ userId: z.string().uuid() }), req.body);
  if (userId === user.id) throw badRequest('You cannot message yourself.');

  const target = await queryOne<{ id: string; isActive: boolean }>(
    'SELECT id, is_active AS "isActive" FROM users WHERE id = $1',
    [userId],
  );
  if (!target || !target.isActive) throw notFound('That person is not available.');

  const key = directKey(user.id, userId);
  const existing = await queryOne<{ id: string }>('SELECT id FROM conversations WHERE direct_key = $1', [key]);
  if (existing) {
    await execute(
      'INSERT INTO conversation_members (conversation_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [existing.id, user.id],
    );
    res.json({ id: existing.id });
    return;
  }

  const id = await transaction(async (q) => {
    const conversationId = newId();
    await q(`INSERT INTO conversations (id, type, direct_key) VALUES ($1, 'direct', $2)`, [
      conversationId,
      key,
    ]);
    await q('INSERT INTO conversation_members (conversation_id, user_id) VALUES ($1, $2)', [
      conversationId,
      user.id,
    ]);
    await q('INSERT INTO conversation_members (conversation_id, user_id) VALUES ($1, $2)', [
      conversationId,
      userId,
    ]);
    return conversationId;
  });
  res.status(201).json({ id });
});

conversationsRouter.get('/:id/messages', async (req, res) => {
  const user = req.currentUser!;
  await assertMember(idParam(req), user.id);
  const limit = Math.min(parsePositiveInt(req.query.limit, 50), 200);
  const after = typeof req.query.after === 'string' ? new Date(req.query.after) : null;

  const rows = await query<{
    id: string;
    body: string;
    createdAt: Date;
    senderId: string;
    senderName: string;
    senderFirst: string;
    senderLast: string;
    avatarFileId: string | null;
  }>(
    `SELECT m.id, m.body, m.created_at AS "createdAt", m.sender_id AS "senderId",
            (u.first_name || ' ' || u.last_name) AS "senderName",
            u.first_name AS "senderFirst", u.last_name AS "senderLast", u.avatar_file_id AS "avatarFileId"
       FROM messages m JOIN users u ON u.id = m.sender_id
      WHERE m.conversation_id = $1 ${after ? 'AND m.created_at > $3' : ''}
      ORDER BY m.created_at ${after ? 'ASC' : 'DESC'}
      LIMIT $2`,
    after ? [idParam(req), limit, after] : [idParam(req), limit],
  );

  res.json({
    messages: rows
      .reverse()
      .map((m) => ({
        id: m.id,
        body: m.body,
        createdAt: m.createdAt,
        senderId: m.senderId,
        senderName: m.senderName,
        mine: m.senderId === user.id,
        avatarUrl: avatarFor(m.senderFirst, m.senderLast, m.avatarFileId),
      })),
  });
});

conversationsRouter.post('/:id/messages', async (req, res) => {
  const user = req.currentUser!;
  await assertMember(idParam(req), user.id);
  const { body } = parse(z.object({ body: z.string().trim().min(1).max(4000) }), req.body);

  const id = newId();
  const createdAt = new Date();
  await execute(
    'INSERT INTO messages (id, conversation_id, sender_id, body, created_at) VALUES ($1, $2, $3, $4, $5)',
    [id, idParam(req), user.id, body, createdAt],
  );
  res.status(201).json({
    id,
    body,
    createdAt,
    senderId: user.id,
    senderName: `${user.firstName} ${user.lastName}`,
    mine: true,
  });
});

conversationsRouter.post('/:id/read', async (req, res) => {
  const user = req.currentUser!;
  await assertMember(idParam(req), user.id);
  await execute(
    'UPDATE conversation_members SET last_read_at = now() WHERE conversation_id = $1 AND user_id = $2',
    [idParam(req), user.id],
  );
  res.json({ ok: true });
});

/** Directory search used to start a conversation. */
peopleRouter.get('/', async (req, res) => {
  const user = req.currentUser!;
  const term = String(req.query.q ?? '').trim();
  if (term.length < 2) {
    res.json({ people: [] });
    return;
  }
  const like = `%${term.toLowerCase()}%`;
  const rows = await query<{
    userId: string;
    firstName: string;
    lastName: string;
    role: string;
    avatarFileId: string | null;
    matricNumber: string | null;
    staffId: string | null;
    department: string | null;
  }>(
    `SELECT u.id AS "userId", u.first_name AS "firstName", u.last_name AS "lastName", u.role,
            u.avatar_file_id AS "avatarFileId", sp.matric_number AS "matricNumber",
            st.staff_id AS "staffId", d.name AS department
       FROM users u
       LEFT JOIN student_profiles sp ON sp.user_id = u.id
       LEFT JOIN staff_profiles st ON st.user_id = u.id
       LEFT JOIN departments d ON d.id = COALESCE(sp.department_id, st.department_id)
      WHERE u.is_active = true AND u.id <> $1
        AND (lower(u.first_name || ' ' || u.last_name) LIKE $2
             OR lower(u.email) LIKE $2
             OR lower(COALESCE(sp.matric_number, '')) LIKE $2
             OR lower(COALESCE(sp.username, '')) LIKE $2)
      ORDER BY u.first_name LIMIT 25`,
    [user.id, like],
  );
  res.json({
    people: rows.map((r) => ({
      userId: r.userId,
      name: `${r.firstName} ${r.lastName}`,
      role: r.role,
      identifier: r.matricNumber ?? r.staffId ?? null,
      department: r.department,
      avatarUrl: avatarFor(r.firstName, r.lastName, r.avatarFileId),
    })),
  });
});
