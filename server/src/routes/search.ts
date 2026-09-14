import { Router } from 'express';
import { query } from '../db/index.js';
import { requireAuth } from '../auth/middleware.js';
import { avatarFor, departmentIdForUser } from '../services/users.js';

export const searchRouter = Router();
searchRouter.use(requireAuth);

const LIMIT = 8;

/**
 * GET /api/search?q=...
 * Searches courses, announcements, posts, projects and people — every result set
 * is scoped to what the caller is allowed to see.
 */
searchRouter.get('/', async (req, res) => {
  const user = req.currentUser!;
  const term = String(req.query.q ?? '').trim();
  if (term.length < 2) {
    res.json({ query: term, courses: [], announcements: [], posts: [], projects: [], people: [] });
    return;
  }
  const like = `%${term.toLowerCase()}%`;
  const departmentId = await departmentIdForUser(user.id);

  const [courses, announcements, posts, projects, people] = await Promise.all([
    user.role === 'student'
      ? query(
          `SELECT c.id, c.code, c.title, d.name AS department, c.level
             FROM courses c
             JOIN departments d ON d.id = c.department_id
             JOIN course_enrollments e ON e.course_id = c.id AND e.student_id = $1
            WHERE c.is_archived = false AND (lower(c.title) LIKE $2 OR lower(c.code) LIKE $2)
            ORDER BY c.code LIMIT ${LIMIT}`,
          [user.id, like],
        )
      : query(
          `SELECT c.id, c.code, c.title, d.name AS department, c.level
             FROM courses c
             JOIN departments d ON d.id = c.department_id
            WHERE c.is_archived = false
              AND ($2::uuid IS NULL OR c.department_id = $2::uuid)
              AND (lower(c.title) LIKE $1 OR lower(c.code) LIKE $1)
            ORDER BY c.code LIMIT ${LIMIT}`,
          [like, departmentId],
        ),
    query(
      `SELECT a.id, a.title, a.content, a.type, a.published_at AS "publishedAt"
         FROM announcements a
        WHERE a.status = 'published'
          AND (a.department_id IS NULL OR a.department_id = $2::uuid)
          AND (lower(a.title) LIKE $1 OR lower(a.content) LIKE $1)
        ORDER BY a.published_at DESC NULLS LAST LIMIT ${LIMIT}`,
      [like, departmentId],
    ),
    query(
      `SELECT p.id, p.content, p.created_at AS "createdAt",
              (u.first_name || ' ' || u.last_name) AS "authorName",
              u.first_name AS "authorFirst", u.last_name AS "authorLast",
              u.avatar_file_id AS "avatarFileId"
         FROM posts p JOIN users u ON u.id = p.author_id
        WHERE lower(p.content) LIKE $1 OR lower(u.first_name || ' ' || u.last_name) LIKE $1
        ORDER BY p.created_at DESC LIMIT ${LIMIT}`,
      [like],
    ),
    query(
      `SELECT p.id, p.title, p.category, p.description
         FROM projects p
        WHERE (p.status = 'approved' OR p.author_id = $2)
          AND (lower(p.title) LIKE $1 OR lower(p.description) LIKE $1 OR lower(p.category) LIKE $1)
        ORDER BY p.created_at DESC LIMIT ${LIMIT}`,
      [like, user.id],
    ),
    query(
      `SELECT u.id, u.first_name AS "firstName", u.last_name AS "lastName", u.role,
              u.avatar_file_id AS "avatarFileId", sp.matric_number AS "matricNumber",
              d.name AS department
         FROM users u
         LEFT JOIN student_profiles sp ON sp.user_id = u.id
         LEFT JOIN staff_profiles st ON st.user_id = u.id
         LEFT JOIN departments d ON d.id = COALESCE(sp.department_id, st.department_id)
        WHERE u.is_active = true AND u.id <> $2
          AND (lower(u.first_name || ' ' || u.last_name) LIKE $1
               OR lower(COALESCE(sp.matric_number, '')) LIKE $1
               OR lower(COALESCE(sp.username, '')) LIKE $1)
        ORDER BY u.first_name LIMIT ${LIMIT}`,
      [like, user.id],
    ),
  ]);

  res.json({
    query: term,
    courses,
    announcements,
    posts: posts.map((p) => ({
      id: p.id,
      content: p.content,
      createdAt: p.createdAt,
      authorName: p.authorName,
      avatarUrl: avatarFor(
        String(p.authorFirst ?? ''),
        String(p.authorLast ?? ''),
        (p.avatarFileId as string) ?? null,
      ),
    })),
    projects,
    people: people.map((p) => ({
      id: p.id,
      name: `${p.firstName} ${p.lastName}`,
      role: p.role,
      identifier: p.matricNumber ?? null,
      department: p.department ?? null,
      avatarUrl: avatarFor(
        String(p.firstName ?? ''),
        String(p.lastName ?? ''),
        (p.avatarFileId as string) ?? null,
      ),
    })),
  });
});
