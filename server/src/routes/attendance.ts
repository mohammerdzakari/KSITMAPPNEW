import { Router } from 'express';
import QRCode from 'qrcode';
import { z } from 'zod';
import { execute, query, queryOne } from '../db/index.js';
import { badRequest, conflict, forbidden, notFound } from '../http/errors.js';
import { idParam, parse } from '../http/validate.js';
import { accessCode, newId } from '../lib/id.js';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { assertCanManageCourse, assertEnrolled, requireCourse } from '../services/access.js';
import { notify } from '../services/notifications.js';

export const attendanceRouter = Router();
attendanceRouter.use(requireAuth);

const PREFIX = 'KSITM-ATT:';

function normaliseCode(raw: string): string {
  const trimmed = String(raw ?? '').trim().toUpperCase();
  return trimmed.startsWith(PREFIX) ? trimmed.slice(PREFIX.length) : trimmed;
}

/** Staff opens an attendance window for one of their courses. */
attendanceRouter.post(
  '/sessions',
  requireRole('lecturer', 'hod', 'admin'),
  async (req, res) => {
    const user = req.currentUser!;
    const body = parse(
      z.object({
        courseId: z.string().uuid(),
        durationMinutes: z.number().int().min(1).max(180).optional(),
      }),
      req.body,
    );
    const course = await requireCourse(body.courseId);
    await assertCanManageCourse(user, course);

    const duration = body.durationMinutes ?? 15;
    const id = newId();
    const code = accessCode(6);
    const closesAt = new Date(Date.now() + duration * 60 * 1000);
    await execute(
      `INSERT INTO attendance_sessions (id, course_id, code, created_by, closes_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, course.id, code, user.id, closesAt],
    );
    res.status(201).json({
      id,
      code,
      closesAt,
      courseCode: course.code,
      qrPayload: `${PREFIX}${code}`,
      qrUrl: `/api/attendance/sessions/${id}/qr.png`,
    });
  },
);

attendanceRouter.get(
  '/sessions',
  requireRole('lecturer', 'hod', 'admin'),
  async (req, res) => {
    const courseId = typeof req.query.courseId === 'string' ? req.query.courseId : null;
    const rows = await query(
      `SELECT s.id, s.code, s.closes_at AS "closesAt", s.created_at AS "createdAt",
              c.id AS "courseId", c.code AS "courseCode", c.title AS "courseTitle",
              (SELECT COUNT(*)::int FROM attendance_records r WHERE r.session_id = s.id) AS "markedCount",
              (SELECT COUNT(*)::int FROM course_enrollments e WHERE e.course_id = c.id) AS "enrolledCount"
         FROM attendance_sessions s JOIN courses c ON c.id = s.course_id
        WHERE ($1::uuid IS NULL OR s.course_id = $1)
        ORDER BY s.created_at DESC LIMIT 20`,
      [courseId],
    );
    res.json({
      sessions: rows.map((r) => ({ ...r, isOpen: new Date(r.closesAt as unknown as string).getTime() > Date.now() })),
    });
  },
);

attendanceRouter.get(
  '/sessions/:id/qr.png',
  requireRole('lecturer', 'hod', 'admin'),
  async (req, res) => {
    const session = await queryOne<{ courseId: string; code: string; closesAt: Date }>(
      'SELECT course_id AS "courseId", code, closes_at AS "closesAt" FROM attendance_sessions WHERE id = $1',
      [idParam(req)],
    );
    if (!session) throw notFound('That attendance session does not exist.');
    await assertCanManageCourse(req.currentUser!, await requireCourse(session.courseId));

    const png = await QRCode.toBuffer(`${PREFIX}${session.code}`, {
      type: 'png',
      width: 480,
      margin: 2,
      color: { dark: '#020617', light: '#ffffff' },
    });
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-store');
    res.end(png);
  },
);

attendanceRouter.get(
  '/sessions/:id/records',
  requireRole('lecturer', 'hod', 'admin'),
  async (req, res) => {
    const session = await queryOne<{ courseId: string }>(
      'SELECT course_id AS "courseId" FROM attendance_sessions WHERE id = $1',
      [idParam(req)],
    );
    if (!session) throw notFound('That attendance session does not exist.');
    await assertCanManageCourse(req.currentUser!, await requireCourse(session.courseId));

    const records = await query(
      `SELECT r.id, r.marked_at AS "markedAt", u.id AS "studentId",
              (u.first_name || ' ' || u.last_name) AS "studentName", sp.matric_number AS "matricNumber"
         FROM attendance_records r
         JOIN users u ON u.id = r.student_id
         JOIN student_profiles sp ON sp.user_id = u.id
        WHERE r.session_id = $1 ORDER BY r.marked_at ASC`,
      [idParam(req)],
    );
    res.json({ records });
  },
);

/** Students scan (or type) the code shown by their lecturer. */
attendanceRouter.post('/mark', requireRole('student'), async (req, res) => {
  const user = req.currentUser!;
  const body = parse(z.object({ code: z.string().trim().min(3).max(40) }), req.body);
  const code = normaliseCode(body.code);

  const session = await queryOne<{
    id: string;
    courseId: string;
    courseCode: string;
    courseTitle: string;
    closesAt: Date;
  }>(
    `SELECT s.id, s.course_id AS "courseId", c.code AS "courseCode", c.title AS "courseTitle",
            s.closes_at AS "closesAt"
       FROM attendance_sessions s JOIN courses c ON c.id = s.course_id
      WHERE s.code = $1 ORDER BY s.created_at DESC LIMIT 1`,
    [code],
  );
  if (!session) throw notFound('That attendance code is not valid.');
  if (new Date(session.closesAt).getTime() < Date.now()) {
    throw badRequest('That attendance window has closed.');
  }
  await assertEnrolled(user.id, session.courseId);

  const inserted = await execute(
    `INSERT INTO attendance_records (id, session_id, student_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
    [newId(), session.id, user.id],
  );
  if (inserted === 0) throw conflict('You have already marked attendance for this class.');

  await notify([user.id], {
    title: 'Attendance marked ✅',
    body: `${session.courseCode} — ${session.courseTitle}`,
    kind: 'academic',
  });
  res.status(201).json({ ok: true, courseCode: session.courseCode, courseTitle: session.courseTitle });
});

/** Recent attendance for the signed-in student. */
attendanceRouter.get('/records', requireRole('student'), async (req, res) => {
  const records = await query(
    `SELECT r.id, r.marked_at AS "markedAt", c.code AS "courseCode", c.title AS "courseTitle"
       FROM attendance_records r
       JOIN attendance_sessions s ON s.id = r.session_id
       JOIN courses c ON c.id = s.course_id
      WHERE r.student_id = $1 ORDER BY r.marked_at DESC LIMIT 30`,
    [req.currentUser!.id],
  );
  res.json({ records });
});

/** Staff overview of attendance for a course. */
attendanceRouter.get(
  '/summary',
  requireRole('lecturer', 'hod', 'admin'),
  async (req, res) => {
    const courseId = typeof req.query.courseId === 'string' ? req.query.courseId : null;
    if (!courseId) throw badRequest('courseId is required.');
    await assertCanManageCourse(req.currentUser!, await requireCourse(courseId));
    const rows = await query(
      `SELECT u.id AS "studentId", (u.first_name || ' ' || u.last_name) AS "studentName",
              sp.matric_number AS "matricNumber", COUNT(r.id)::int AS attended
         FROM course_enrollments e
         JOIN users u ON u.id = e.student_id
         JOIN student_profiles sp ON sp.user_id = u.id
         LEFT JOIN attendance_records r ON r.student_id = u.id
           AND r.session_id IN (SELECT id FROM attendance_sessions WHERE course_id = $1)
        WHERE e.course_id = $1
        GROUP BY u.id, sp.matric_number
        ORDER BY attended DESC, sp.matric_number`,
      [courseId],
    );
    res.json({ students: rows });
  },
);
