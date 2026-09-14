import { Router } from 'express';
import { z } from 'zod';
import { execute, query, queryOne } from '../db/index.js';
import { badRequest, forbidden, notFound } from '../http/errors.js';
import { idParam, parse, parsePositiveInt } from '../http/validate.js';
import { newId } from '../lib/id.js';
import { requireAuth } from '../auth/middleware.js';
import { canModerate } from '../auth/permissions.js';
import { fileUrl, storeBase64 } from '../services/files.js';
import { notify } from '../services/notifications.js';
import { avatarFor } from '../services/users.js';

export const postsRouter = Router();
postsRouter.use(requireAuth);

const PAGE_SIZE = 20;

async function loadPosts(userId: string, offset: number, moderator: boolean) {
  return query<Record<string, unknown>>(
    `SELECT p.id, p.content, p.image_file_id AS "imageFileId", p.created_at AS "createdAt",
            p.author_id AS "authorId",
            (u.first_name || ' ' || u.last_name) AS "authorName",
            u.first_name AS "authorFirst", u.last_name AS "authorLast",
            u.avatar_file_id AS "authorAvatarFileId", u.role AS "authorRole",
            sp.matric_number AS "authorMatric", st.staff_id AS "authorStaffId",
            (SELECT COUNT(*)::int FROM post_likes l WHERE l.post_id = p.id) AS "likeCount",
            (SELECT COUNT(*)::int FROM post_comments c WHERE c.post_id = p.id) AS "commentCount",
            EXISTS(SELECT 1 FROM post_likes l WHERE l.post_id = p.id AND l.user_id = $1) AS "likedByMe"
       FROM posts p
       JOIN users u ON u.id = p.author_id
       LEFT JOIN student_profiles sp ON sp.user_id = u.id
       LEFT JOIN staff_profiles st ON st.user_id = u.id
      ORDER BY p.created_at DESC
      LIMIT $2 OFFSET $3`,
    [userId, PAGE_SIZE, offset],
  );
}

export function shapePost(row: Record<string, unknown>) {
  return {
    id: row.id,
    content: row.content,
    imageUrl: fileUrl(row.imageFileId as string | null),
    createdAt: row.createdAt,
    authorId: row.authorId,
    authorName: row.authorName,
    authorRole: row.authorRole,
    authorIdentifier: row.authorMatric ?? row.authorStaffId ?? null,
    authorAvatar: avatarFor(
      String(row.authorFirst ?? ''),
      String(row.authorLast ?? ''),
      (row.authorAvatarFileId as string) ?? null,
    ),
    likeCount: row.likeCount,
    commentCount: row.commentCount,
    likedByMe: row.likedByMe,
  };
}

postsRouter.get('/', async (req, res) => {
  const user = req.currentUser!;
  const offset = (parsePositiveInt(req.query.page, 1) - 1) * PAGE_SIZE;
  const rows = await loadPosts(user.id, Math.max(0, offset), canModerate(user.role));
  res.json({ posts: rows.map(shapePost), pageSize: PAGE_SIZE });
});

const postSchema = z.object({
  content: z.string().trim().max(4000).optional(),
  image: z
    .object({
      data: z.string().max(12_000_000),
      name: z.string().max(200).optional(),
      mimeType: z.string().max(100).optional(),
    })
    .optional(),
});

postsRouter.post('/', async (req, res) => {
  const user = req.currentUser!;
  const body = parse(postSchema, req.body);
  if (!body.content && !body.image) throw badRequest('Write something or attach a photo.');

  const image = body.image ? await storeBase64(body.image, { ownerId: user.id, kind: 'image' }) : null;
  const id = newId();
  await execute(
    `INSERT INTO posts (id, author_id, content, image_file_id) VALUES ($1, $2, $3, $4)`,
    [id, user.id, body.content ?? '', image?.id ?? null],
  );
  const rows = await loadPosts(user.id, 0, canModerate(user.role));
  res.status(201).json({ id, post: rows.map(shapePost).find((p) => p.id === id) ?? null });
});

postsRouter.delete('/:id', async (req, res) => {
  const user = req.currentUser!;
  const post = await queryOne<{ authorId: string }>('SELECT author_id AS "authorId" FROM posts WHERE id = $1', [
    idParam(req),
  ]);
  if (!post) throw notFound('That post does not exist.');
  if (post.authorId !== user.id && !canModerate(user.role)) {
    throw forbidden('You can only delete your own posts.');
  }
  await execute('DELETE FROM posts WHERE id = $1', [idParam(req)]);
  res.json({ ok: true });
});

/** Toggles a like; returns the new state so the UI can update optimistically. */
postsRouter.post('/:id/like', async (req, res) => {
  const user = req.currentUser!;
  const post = await queryOne<{ authorId: string; content: string }>(
    'SELECT author_id AS "authorId", content FROM posts WHERE id = $1',
    [idParam(req)],
  );
  if (!post) throw notFound('That post does not exist.');

  const existing = await queryOne(
    'SELECT user_id FROM post_likes WHERE post_id = $1 AND user_id = $2',
    [idParam(req), user.id],
  );
  if (existing) {
    await execute('DELETE FROM post_likes WHERE post_id = $1 AND user_id = $2', [idParam(req), user.id]);
  } else {
    await execute('INSERT INTO post_likes (post_id, user_id) VALUES ($1, $2)', [idParam(req), user.id]);
    if (post.authorId !== user.id) {
      await notify([post.authorId], {
        title: `${user.firstName} liked your post`,
        body: post.content.slice(0, 80) || 'Your photo',
        kind: 'social',
      });
    }
  }
  const count = await queryOne<{ n: number }>('SELECT COUNT(*)::int AS n FROM post_likes WHERE post_id = $1', [
    idParam(req),
  ]);
  res.json({ liked: !existing, likeCount: count?.n ?? 0 });
});

postsRouter.get('/:id/comments', async (req, res) => {
  const post = await queryOne('SELECT id FROM posts WHERE id = $1', [idParam(req)]);
  if (!post) throw notFound('That post does not exist.');
  const comments = await query<{
    id: string;
    content: string;
    createdAt: Date;
    authorId: string;
    authorName: string;
    authorFirst: string;
    authorLast: string;
    avatarFileId: string | null;
  }>(
    `SELECT c.id, c.content, c.created_at AS "createdAt", c.author_id AS "authorId",
            (u.first_name || ' ' || u.last_name) AS "authorName",
            u.first_name AS "authorFirst", u.last_name AS "authorLast", u.avatar_file_id AS "avatarFileId"
       FROM post_comments c JOIN users u ON u.id = c.author_id
      WHERE c.post_id = $1 ORDER BY c.created_at ASC LIMIT 200`,
    [idParam(req)],
  );
  res.json({
    comments: comments.map((c) => ({
      id: c.id,
      content: c.content,
      createdAt: c.createdAt,
      authorId: c.authorId,
      authorName: c.authorName,
      avatarUrl: avatarFor(c.authorFirst, c.authorLast, c.avatarFileId),
    })),
  });
});

postsRouter.post('/:id/comments', async (req, res) => {
  const user = req.currentUser!;
  const { content } = parse(z.object({ content: z.string().trim().min(1).max(2000) }), req.body);
  const post = await queryOne<{ authorId: string; content: string }>(
    'SELECT author_id AS "authorId", content FROM posts WHERE id = $1',
    [idParam(req)],
  );
  if (!post) throw notFound('That post does not exist.');

  const id = newId();
  await execute('INSERT INTO post_comments (id, post_id, author_id, content) VALUES ($1, $2, $3, $4)', [
    id,
    idParam(req),
    user.id,
    content,
  ]);
  if (post.authorId !== user.id) {
    await notify([post.authorId], {
      title: `${user.firstName} commented on your post`,
      body: content.slice(0, 100),
      kind: 'social',
    });
  }
  const count = await queryOne<{ n: number }>(
    'SELECT COUNT(*)::int AS n FROM post_comments WHERE post_id = $1',
    [idParam(req)],
  );
  res.status(201).json({ id, commentCount: count?.n ?? 0 });
});

postsRouter.delete('/:id/comments/:commentId', async (req, res) => {
  const user = req.currentUser!;
  const comment = await queryOne<{ authorId: string; postId: string }>(
    'SELECT author_id AS "authorId", post_id AS "postId" FROM post_comments WHERE id = $1 AND post_id = $2',
    [idParam(req, 'commentId'), idParam(req)],
  );
  if (!comment) throw notFound('That comment does not exist.');
  if (comment.authorId !== user.id && !canModerate(user.role)) {
    throw forbidden('You can only delete your own comments.');
  }
  await execute('DELETE FROM post_comments WHERE id = $1', [idParam(req, 'commentId')]);
  const count = await queryOne<{ n: number }>(
    'SELECT COUNT(*)::int AS n FROM post_comments WHERE post_id = $1',
    [idParam(req)],
  );
  res.json({ ok: true, commentCount: count?.n ?? 0 });
});
