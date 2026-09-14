import { Router } from 'express';
import { z } from 'zod';
import { execute, query, queryOne } from '../db/index.js';
import { badRequest, forbidden, notFound } from '../http/errors.js';
import { idParam, parse } from '../http/validate.js';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { isStaff } from '../auth/permissions.js';
import { avatarFor, departmentIdForUser } from '../services/users.js';
import { destroyUserSessions } from '../auth/session.js';

export const adminRouter = Router();
adminRouter.use(requireAuth);

/**
 * Dashboard numbers for the staff portal. Lecturers see their own department's
 * teaching load, HODs additionally see their student body, admins see campus totals.
 */
adminRouter.get('/stats', requireRole('lecturer', 'hod', 'admin'), async (req, res) => {
  const user = req.currentUser!;
  const departmentId = await departmentIdForUser(user.id);
  const scopeAll = user.role === 'admin';

  const scoped = async <T>(sql: string, extra: unknown[] = []): Promise<T | null> => {
    const rows = await query<T>(
      scopeAll ? sql.replace('__SCOPE__', 'TRUE') : sql.replace('__SCOPE__', 'c.department_id = $1'),
      scopeAll ? extra : [departmentId, ...extra],
    );
    return rows[0] ?? null;
  };

  const [courses, students, submissions, assignments, pending, announcements] = await Promise.all([
    scoped<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM courses c WHERE c.is_archived = false AND __SCOPE__`,
    ),
    scopeAll
      ? queryOne<{ n: number }>('SELECT COUNT(*)::int AS n FROM student_profiles')
      : departmentId
        ? queryOne<{ n: number }>('SELECT COUNT(*)::int AS n FROM student_profiles WHERE department_id = $1', [
            departmentId,
          ])
        : Promise.resolve({ n: 0 }),
    scoped<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM submissions s
         JOIN assignments a ON a.id = s.assignment_id
         JOIN courses c ON c.id = a.course_id
        WHERE s.status = 'submitted' AND __SCOPE__`,
    ),
    scoped<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM assignments a JOIN courses c ON c.id = a.course_id WHERE __SCOPE__`,
    ),
    queryOne<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM moderation_items
        WHERE status = 'pending' AND ($1::uuid IS NULL OR department_id = $1 OR department_id IS NULL)`,
      [user.role === 'admin' ? null : departmentId],
    ),
    queryOne<{ n: number }>('SELECT COUNT(*)::int AS n FROM announcements', []),
  ]);

  const enrolled = scopeAll
    ? await queryOne<{ n: number }>('SELECT COUNT(DISTINCT student_id)::int AS n FROM course_enrollments')
    : await queryOne<{ n: number }>(
        `SELECT COUNT(DISTINCT e.student_id)::int AS n
           FROM course_enrollments e JOIN courses c ON c.id = e.course_id
          WHERE c.department_id = $1`,
        [departmentId],
      );

  res.json({
    stats: {
      students: students?.n ?? 0,
      courses: courses?.n ?? 0,
      enrolled: enrolled?.n ?? 0,
      assignments: assignments?.n ?? 0,
      submissionsToGrade: submissions?.n ?? 0,
      pendingModeration: user.role === 'lecturer' ? 0 : (pending?.n ?? 0),
      announcements: announcements?.n ?? 0,
      departmentId,
      scope: scopeAll ? 'campus' : 'department',
    },
  });
});

/** HOD / admin student directory. */
adminRouter.get('/students', requireRole('hod', 'admin'), async (req, res) => {
  const user = req.currentUser!;
  const ownDepartment = await departmentIdForUser(user.id);
  const departmentId =
    user.role === 'admin' && typeof req.query.departmentId === 'string'
      ? req.query.departmentId
      : ownDepartment;
  const term = String(req.query.q ?? '').trim().toLowerCase();

  const params: unknown[] = [];
  let where = 'TRUE';
  if (departmentId) {
    params.push(departmentId);
    where = `sp.department_id = $${params.length}`;
  }
  if (term) {
    params.push(`%${term}%`);
    where += ` AND (lower(u.first_name || ' ' || u.last_name) LIKE $${params.length}
                    OR lower(sp.matric_number) LIKE $${params.length}
                    OR lower(COALESCE(sp.username, '')) LIKE $${params.length})`;
  }

  const students = await query<{
    userId: string;
    firstName: string;
    lastName: string;
    avatarFileId: string | null;
    matricNumber: string;
    level: string;
    department: string;
    email: string;
    cgpa: number | null;
    resultsCount: number;
    enrolledCourses: number;
    isActive: boolean;
  }>(
    `SELECT u.id AS "userId", u.first_name AS "firstName", u.last_name AS "lastName",
            u.avatar_file_id AS "avatarFileId", u.email, u.is_active AS "isActive",
            sp.matric_number AS "matricNumber", sp.level, d.name AS department,
            (SELECT SUM(r.grade_points * cc.credit_units) / NULLIF(SUM(cc.credit_units), 0)
               FROM course_results r JOIN courses cc ON cc.id = r.course_id
              WHERE r.student_id = u.id) AS cgpa,
            (SELECT COUNT(*)::int FROM course_results r WHERE r.student_id = u.id) AS "resultsCount",
            (SELECT COUNT(*)::int FROM course_enrollments e WHERE e.student_id = u.id) AS "enrolledCourses"
       FROM student_profiles sp
       JOIN users u ON u.id = sp.user_id
       JOIN departments d ON d.id = sp.department_id
      WHERE ${where}
      ORDER BY sp.matric_number
      LIMIT 200`,
    params,
  );

  res.json({
    students: students.map((s) => ({
      userId: s.userId,
      name: `${s.firstName} ${s.lastName}`,
      matricNumber: s.matricNumber,
      level: s.level,
      department: s.department,
      email: s.email,
      isActive: s.isActive,
      cgpa: s.cgpa === null ? null : Number(Number(s.cgpa).toFixed(2)),
      resultsCount: s.resultsCount,
      enrolledCourses: s.enrolledCourses,
      avatarUrl: avatarFor(s.firstName, s.lastName, s.avatarFileId),
    })),
  });
});

/** System administration: user list + activation / role changes. */
adminRouter.get('/users', requireRole('admin'), async (req, res) => {
  const term = String(req.query.q ?? '').trim().toLowerCase();
  const params: unknown[] = [];
  let where = 'TRUE';
  if (term) {
    params.push(`%${term}%`);
    where = `(lower(u.email) LIKE $1 OR lower(u.first_name || ' ' || u.last_name) LIKE $1
              OR lower(COALESCE(sp.matric_number, '')) LIKE $1 OR lower(COALESCE(st.staff_id, '')) LIKE $1)`;
  }
  const users = await query(
    `SELECT u.id, u.email, u.role, u.first_name AS "firstName", u.last_name AS "lastName",
            u.is_active AS "isActive", u.created_at AS "createdAt",
            u.avatar_file_id AS "avatarFileId",
            sp.matric_number AS "matricNumber", sp.level, st.staff_id AS "staffId",
            d.name AS department
       FROM users u
       LEFT JOIN student_profiles sp ON sp.user_id = u.id
       LEFT JOIN staff_profiles st ON st.user_id = u.id
       LEFT JOIN departments d ON d.id = COALESCE(sp.department_id, st.department_id)
      WHERE ${where}
      ORDER BY u.created_at DESC LIMIT 200`,
    params,
  );
  res.json({
    users: users.map((u) => ({
      id: u.id,
      email: u.email,
      role: u.role,
      name: `${u.firstName} ${u.lastName}`,
      isActive: u.isActive,
      createdAt: u.createdAt,
      identifier: u.matricNumber ?? u.staffId ?? null,
      level: u.level ?? null,
      department: u.department ?? null,
      avatarUrl: avatarFor(String(u.firstName), String(u.lastName), (u.avatarFileId as string) ?? null),
    })),
  });
});

const updateUserSchema = z.object({
  isActive: z.boolean().optional(),
  role: z.enum(['student', 'lecturer', 'hod', 'admin']).optional(),
});

adminRouter.patch('/users/:id', requireRole('admin'), async (req, res) => {
  const admin = req.currentUser!;
  const body = parse(updateUserSchema, req.body);
  const target = await queryOne<{ id: string; role: string }>('SELECT id, role FROM users WHERE id = $1', [
    idParam(req),
  ]);
  if (!target) throw notFound('That user does not exist.');
  if (target.id === admin.id && (body.isActive === false || (body.role && body.role !== 'admin'))) {
    throw badRequest('You cannot remove your own administrator access.');
  }
  if (body.role && body.role !== target.role && !isStaff(target.role as never) && body.role !== 'student') {
    throw badRequest('Invalid role transition.');
  }

  if (body.isActive !== undefined) {
    await execute('UPDATE users SET is_active = $2, updated_at = now() WHERE id = $1', [
      idParam(req),
      body.isActive,
    ]);
    if (!body.isActive) await destroyUserSessions(idParam(req));
  }
  if (body.role) {
    await execute('UPDATE users SET role = $2, updated_at = now() WHERE id = $1', [idParam(req), body.role]);
    if (body.role === 'hod') {
      await execute('UPDATE staff_profiles SET hod_requested_at = NULL WHERE user_id = $1', [idParam(req)]);
      await execute(
        "DELETE FROM moderation_items WHERE type = 'hod_request' AND target_id = $1 AND status = 'pending'",
        [idParam(req)],
      );
    }
  }
  res.json({ ok: true });
});

/** Campus counters used by the student-facing "Latest updates" and profile screens. */
adminRouter.get('/overview', async (req, res) => {
  const [students, staff, courses, departments] = await Promise.all([
    queryOne<{ n: number }>('SELECT COUNT(*)::int AS n FROM student_profiles'),
    queryOne<{ n: number }>("SELECT COUNT(*)::int AS n FROM users WHERE role <> 'student'"),
    queryOne<{ n: number }>('SELECT COUNT(*)::int AS n FROM courses WHERE is_archived = false'),
    queryOne<{ n: number }>('SELECT COUNT(*)::int AS n FROM departments'),
  ]);
  res.json({
    students: students?.n ?? 0,
    staff: staff?.n ?? 0,
    courses: courses?.n ?? 0,
    departments: departments?.n ?? 0,
  });
});
