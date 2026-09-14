import { Router } from 'express';
import { z } from 'zod';
import { execute } from '../db/index.js';
import { idParam, parse } from '../http/validate.js';
import { requireAuth } from '../auth/middleware.js';
import { listNotifications, markRead, unreadCount } from '../services/notifications.js';

export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);

notificationsRouter.get('/', async (req, res) => {
  const userId = req.currentUser!.id;
  const [items, unread] = await Promise.all([listNotifications(userId), unreadCount(userId)]);
  res.json({ notifications: items, unread });
});

notificationsRouter.get('/unread-count', async (req, res) => {
  res.json({ unread: await unreadCount(req.currentUser!.id) });
});

notificationsRouter.post('/read', async (req, res) => {
  const { id } = parse(z.object({ id: z.string().uuid().optional() }), req.body ?? {});
  await markRead(req.currentUser!.id, id);
  res.json({ unread: await unreadCount(req.currentUser!.id) });
});

notificationsRouter.delete('/:id', async (req, res) => {
  const removed = await execute('DELETE FROM notifications WHERE id = $1 AND user_id = $2', [
    idParam(req),
    req.currentUser!.id,
  ]);
  res.json({ ok: removed > 0 });
});
