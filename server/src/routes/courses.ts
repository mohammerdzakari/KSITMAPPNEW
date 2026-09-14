import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { execute, query, queryOne, transaction } from '../db/index.js';
import { badRequest, conflict, forbidden, notFound } from '../http/errors.js';
import { idParam, parse } from '../http/validate.js';
import { newId } from '../lib/id.js';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { isStaff } from '../auth/permissions.js';
import {
  assertCanManageCourse,
  assertCanViewCourse,
  requireCourse,
} from '../services/access.js';
import { fileUrl, storeBase64 } from '../services/files.js';
import { scoreToGrade } from '../services/grades.js';
import { notify, notifyCohort, notifyModerators } from '../services/notifications.js';
import {
  avatarFor,
  departmentIdForUser,
  enrollCohortInCourse,
  getDepartment,
} from '../services/users.js';
import { createModerationItem } from '../services/moderation.js';

export const coursesRouter = Router();
coursesRouter.use(requireAuth);

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatSlot(weekday: number, startTime: string, room?: string): string {
  const [h, m] = String(startTime || '00:00').split(':');
  const hour = Number.parseInt(h, 10) || 0;
  const minute = Number.parseInt(m, 10) || 0;
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${DAY_NAMES[weekday]} ${hour12}:${String(minute).padStart(2, '0')} ${suffix}${
    room ? ` • ${room}` : ''
  }`;
}

interface ScheduleRow {
  courseId: string;
  weekday: number;
  startTime: string;
  endTime: string;
  room: string;
}

/** Returns the soonest weekly slot label per course. */
function nextSlotByCourse(schedules: ScheduleRow[]): Record<string, string> {
  const now = new Date();
  const best: Record<string, { label: string; at: number }> = {};
  for (const s of schedules) {
    const [h, m] = s.startTime.split(':');
    for (let offset = 0; offset < 8; offset += 1) {
      const candidate = new Date(now);
      candidate.setDate(now.getDate() + offset);
      if (candidate.getDay() !== s.weekday) continue;
      candidate.setHours(Number.parseInt(h, 10) || 0, Number.parseInt(m, 10) || 0, 0, 0);
      if (candidate.getTime() <= now.getTime()) continue;
      const current = best[s.courseId];
      if (!current || candidate.getTime() < current.at) {
        best[s.courseId] = { label: formatSlot(s.weekday, s.startTime, s.room), at: candidate.getTime() };
      }
      break;
    }
  }
  return Object.fromEntries(Object.entries(best).map(([k, v]) => [k, v.label]));
}

/** GET /api/courses — enrolled courses for students, department courses for staff. */
coursesRouter.get('/', async (req, res) => {
  const user = req.currentUser!;

  if (user.role === 'student') {
    const courses = await query<{
      id: string;
      code: string;
      title: string;
      level: string;
      creditUnits: number;
      description: string;
      departmentId: string;
      department: string;
      topicCount: number;
      completedCount: number;
      assignmentCount: number;
    }>(
      `SELECT c.id, c.code, c.title, c.level, c.credit_units AS "creditUnits", c.description,
              c.department_id AS "departmentId", d.name AS department,
              (SELECT COUNT(*)::int FROM course_topics t WHERE t.course_id = c.id) AS "topicCount",
              (SELECT COUNT(*)::int FROM topic_progress p
                 JOIN course_topics t ON t.id = p.topic_id
                WHERE t.course_id = c.id AND p.student_id = $1) AS "completedCount",
              (SELECT COUNT(*)::int FROM assignments a WHERE a.course_id = c.id) AS "assignmentCount"
         FROM course_enrollments e
         JOIN courses c ON c.id = e.course_id
         JOIN departments d ON d.id = c.department_id
        WHERE e.student_id = $1 AND c.is_archived = false
        ORDER BY c.code`,
      [user.id],
    );
    const schedules = await query<ScheduleRow>(
      `SELECT cs.course_id AS "courseId", cs.weekday, cs.start_time AS "startTime",
              cs.end_time AS "endTime", cs.room
         FROM course_schedules cs
         JOIN course_enrollments e ON e.course_id = cs.course_id
        WHERE e.student_id = $1`,
      [user.id],
    );
    const slots = nextSlotByCourse(schedules);
    res.json({
      courses: courses.map((c) => ({
        ...c,
        progress: c.topicCount === 0 ? 0 : Math.round((c.completedCount / c.topicCount) * 100),
        nextClass: slots[c.id] ?? null,
      })),
    });
    return;
  }

  // Staff: everything their department offers (admins may scope with a query).
  const departmentId =
    user.role === 'admin' && typeof req.query.departmentId === 'string'
      ? req.query.departmentId
      : await departmentIdForUser(user.id);

  const params: unknown[] = [];
  let where = 'c.is_archived = false';
  if (departmentId && user.role !== 'admin') {
    params.push(departmentId);
    where += ` AND c.department_id = $${params.length}`;
  } else if (departmentId) {
    params.push(departmentId);
    where += ` AND c.department_id = $${params.length}`;
  }
  if (typeof req.query.level === 'string' && req.query.level) {
    params.push(req.query.level);
    where += ` AND c.level = $${params.length}`;
  }

  const courses = await query(
    `SELECT c.id, c.code, c.title, c.level, c.credit_units AS "creditUnits", c.description,
            c.department_id AS "departmentId", d.name AS department,
            (SELECT COUNT(*)::int FROM course_enrollments e WHERE e.course_id = c.id) AS "enrolledCount",
            (SELECT COUNT(*)::int FROM assignments a WHERE a.course_id = c.id) AS "assignmentCount",
            (SELECT COUNT(*)::int FROM course_materials m WHERE m.course_id = c.id) AS "materialCount"
       FROM courses c JOIN departments d ON d.id = c.department_id
      WHERE ${where}
      ORDER BY c.level, c.code`,
    params,
  );
  res.json({ courses });
});

/** GET /api/courses/:id — full course detail (topics, materials, timetable). */
coursesRouter.get('/:id', async (req, res) => {
  const user = req.currentUser!;
  const course = await requireCourse(idParam(req));
  await assertCanViewCourse(user, course);

  const topics = await query<{ id: string; title: string; position: number; completedAt: Date | null }>(
    `SELECT t.id, t.title, t.position,
            (SELECT p.completed_at FROM topic_progress p WHERE p.topic_id = t.id AND p.student_id = $2) AS "completedAt"
       FROM course_topics t WHERE t.course_id = $1 ORDER BY t.position, t.title`,
    [course.id, user.id],
  );

  const materials = await query<{
    id: string;
    title: string;
    description: string;
    fileId: string | null;
    url: string;
    status: string;
    createdAt: Date;
    uploadedBy: string;
    uploaderName: string;
  }>(
    `SELECT m.id, m.title, m.description, m.file_id AS "fileId", m.url, m.status,
            m.created_at AS "createdAt", m.uploaded_by AS "uploadedBy",
            (u.first_name || ' ' || u.last_name) AS "uploaderName"
       FROM course_materials m JOIN users u ON u.id = m.uploaded_by
      WHERE m.course_id = $1 ${user.role === 'student' ? "AND m.status = 'published'" : ''}
      ORDER BY m.created_at DESC`,
    [course.id],
  );

  const schedules = await query<{ id: string; weekday: number; startTime: string; endTime: string; room: string }>(
    `SELECT id, weekday, start_time AS "startTime", end_time AS "endTime", room
       FROM course_schedules WHERE course_id = $1 ORDER BY weekday, start_time`,
    [course.id],
  );

  const assignments = await query<{
    id: string;
    title: string;
    deadline: Date;
    submissionCount: number;
    mySubmissionId: string | null;
    myStatus: string | null;
    myScore: number | null;
  }>(
    `SELECT a.id, a.title, a.deadline,
            (SELECT COUNT(*)::int FROM submissions s WHERE s.assignment_id = a.id) AS "submissionCount",
            (SELECT s.id FROM submissions s WHERE s.assignment_id = a.id AND s.student_id = $2) AS "mySubmissionId",
            (SELECT s.status FROM submissions s WHERE s.assignment_id = a.id AND s.student_id = $2) AS "myStatus",
            (SELECT s.score::float8 FROM submissions s WHERE s.assignment_id = a.id AND s.student_id = $2) AS "myScore"
       FROM assignments a WHERE a.course_id = $1 ORDER BY a.deadline DESC`,
    [course.id, user.id],
  );

  const enrolledCount = await queryOne<{ n: number }>(
    'SELECT COUNT(*)::int AS n FROM course_enrollments WHERE course_id = $1',
    [course.id],
  );

  let myResult: { score: number; grade: string; points: number } | null = null;
  if (user.role === 'student') {
    const result = await queryOne<{ score: number; grade: string; points: number }>(
      `SELECT score::float8 AS score, grade, grade_points::float8 AS points
         FROM course_results WHERE student_id = $1 AND course_id = $2
        ORDER BY recorded_at DESC LIMIT 1`,
      [user.id, course.id],
    );
    myResult = result ?? null;
  }

  res.json({
    course,
    topics: topics.map((t) => ({ id: t.id, title: t.title, position: t.position, completed: !!t.completedAt })),
    materials: materials.map((m) => ({ ...m, fileUrl: fileUrl(m.fileId) })),
    schedules,
    assignments,
    enrolledCount: enrolledCount?.n ?? 0,
    myResult,
    canManage: isStaff(user.role) && (user.role === 'admin' || (await departmentIdForUser(user.id)) === course.departmentId),
  });
});

const scheduleSchema = z.object({
  weekday: z.number().int().min(0).max(6),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:MM (24h).'),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:MM (24h).'),
  room: z.string().trim().max(80).optional(),
});

const courseSchema = z.object({
  code: z.string().trim().min(2).max(20).toUpperCase(),
  title: z.string().trim().min(3).max(120),
  level: z.enum(['ND I', 'ND II', 'NID I', 'NID II']),
  creditUnits: z.number().int().min(1).max(12).optional(),
  description: z.string().trim().max(2000).optional(),
  departmentId: z.string().uuid().optional(),
  topics: z.array(z.string().trim().min(1).max(160)).max(60).optional(),
  schedules: z.array(scheduleSchema).max(14).optional(),
});

/** POST /api/courses — staff create a course for their cohort. */
coursesRouter.post('/', requireRole('lecturer', 'hod', 'admin'), async (req, res) => {
  const user = req.currentUser!;
  const body = parse(courseSchema, req.body);

  let departmentId = body.departmentId;
  if (!departmentId || user.role !== 'admin') {
    departmentId = (await departmentIdForUser(user.id)) ?? undefined;
  }
  if (!departmentId) {
    throw badRequest('Set your department first (Profile → Edit) before creating courses.');
  }
  const department = await getDepartment(departmentId);
  if (!department) throw badRequest('Unknown department.');

  const duplicate = await queryOne(
    'SELECT id FROM courses WHERE department_id = $1 AND code = $2',
    [departmentId, body.code],
  );
  if (duplicate) throw conflict(`${body.code} already exists in ${department.name}.`);

  const courseId = newId();
  await transaction(async (q) => {
    await q(
      `INSERT INTO courses (id, code, title, department_id, level, credit_units, description, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        courseId,
        body.code,
        body.title,
        departmentId,
        body.level,
        body.creditUnits ?? 3,
        body.description ?? '',
        user.id,
      ],
    );
    const topics = body.topics ?? [];
    for (let i = 0; i < topics.length; i += 1) {
      await q(`INSERT INTO course_topics (id, course_id, title, position) VALUES ($1, $2, $3, $4)`, [
        newId(),
        courseId,
        topics[i],
        i,
      ]);
    }
    for (const slot of body.schedules ?? []) {
      await q(
        `INSERT INTO course_schedules (id, course_id, weekday, start_time, end_time, room)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [newId(), courseId, slot.weekday, slot.startTime, slot.endTime, slot.room ?? ''],
      );
    }
  });

  const enrolled = await enrollCohortInCourse(courseId, departmentId, body.level);
  await notifyCohort(departmentId, body.level, {
    title: `New course: ${body.code}`,
    body: `${body.title} has been added to your ${body.level} timetable.`,
    kind: 'academic',
  });

  res.status(201).json({ ok: true, id: courseId, enrolledCount: enrolled });
});

coursesRouter.patch('/:id', requireRole('lecturer', 'hod', 'admin'), async (req, res) => {
  const course = await requireCourse(idParam(req));
  await assertCanManageCourse(req.currentUser!, course);
  const body = parse(courseSchema.partial(), req.body);

  const sets: string[] = ['updated_at = now()'];
  const params: unknown[] = [];
  for (const [column, value] of [
    ['code', body.code],
    ['title', body.title],
    ['level', body.level],
    ['credit_units', body.creditUnits],
    ['description', body.description],
  ] as const) {
    if (value !== undefined) {
      params.push(value);
      sets.push(`${column} = $${params.length}`);
    }
  }
  params.push(course.id);
  await execute(`UPDATE courses SET ${sets.join(', ')} WHERE id = $${params.length}`, params);

  if (body.topics) {
    await transaction(async (q) => {
      await q('DELETE FROM course_topics WHERE course_id = $1', [course.id]);
      for (let i = 0; i < body.topics!.length; i += 1) {
        await q(`INSERT INTO course_topics (id, course_id, title, position) VALUES ($1, $2, $3, $4)`, [
          newId(),
          course.id,
          body.topics![i],
          i,
        ]);
      }
    });
  }
  if (body.schedules) {
    await transaction(async (q) => {
      await q('DELETE FROM course_schedules WHERE course_id = $1', [course.id]);
      for (const slot of body.schedules!) {
        await q(
          `INSERT INTO course_schedules (id, course_id, weekday, start_time, end_time, room)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [newId(), course.id, slot.weekday, slot.startTime, slot.endTime, slot.room ?? ''],
        );
      }
    });
  }
  if (body.level && body.level !== course.level) {
    await enrollCohortInCourse(course.id, course.departmentId, body.level);
  }

  res.json({ ok: true });
});

/** Soft-delete: keeps results, submissions and history intact. */
coursesRouter.delete('/:id', requireRole('hod', 'admin'), async (req, res) => {
  const course = await requireCourse(idParam(req));
  await assertCanManageCourse(req.currentUser!, course);
  await execute('UPDATE courses SET is_archived = true, updated_at = now() WHERE id = $1', [course.id]);
  res.json({ ok: true });
});

coursesRouter.post('/:id/topics', requireRole('lecturer', 'hod', 'admin'), async (req, res) => {
  const course = await requireCourse(idParam(req));
  await assertCanManageCourse(req.currentUser!, course);
  const { title } = parse(z.object({ title: z.string().trim().min(1).max(160) }), req.body);
  const next = await queryOne<{ n: number }>(
    'SELECT COALESCE(MAX(position), -1) + 1 AS n FROM course_topics WHERE course_id = $1',
    [course.id],
  );
  const id = newId();
  await execute('INSERT INTO course_topics (id, course_id, title, position) VALUES ($1, $2, $3, $4)', [
    id,
    course.id,
    title,
    next?.n ?? 0,
  ]);
  res.status(201).json({ id });
});

coursesRouter.delete('/:id/topics/:topicId', requireRole('lecturer', 'hod', 'admin'), async (req, res) => {
  const course = await requireCourse(idParam(req));
  await assertCanManageCourse(req.currentUser!, course);
  await execute('DELETE FROM course_topics WHERE id = $1 AND course_id = $2', [
    idParam(req, 'topicId'),
    course.id,
  ]);
  res.json({ ok: true });
});

/** Student marks a topic complete / incomplete — this drives course progress. */
coursesRouter.post('/:id/topics/:topicId/complete', requireRole('student'), async (req, res) => {
  const course = await requireCourse(idParam(req));
  await assertCanViewCourse(req.currentUser!, course);
  const { completed } = parse(z.object({ completed: z.boolean() }), req.body);

  const topic = await queryOne('SELECT id FROM course_topics WHERE id = $1 AND course_id = $2', [
    idParam(req, 'topicId'),
    course.id,
  ]);
  if (!topic) throw notFound('That topic is not part of this course.');

  if (completed) {
    await execute(
      `INSERT INTO topic_progress (student_id, topic_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [req.currentUser!.id, idParam(req, 'topicId')],
    );
  } else {
    await execute('DELETE FROM topic_progress WHERE student_id = $1 AND topic_id = $2', [
      req.currentUser!.id,
      idParam(req, 'topicId'),
    ]);
  }

  const stats = await queryOne<{ total: number; done: number }>(
    `SELECT (SELECT COUNT(*)::int FROM course_topics WHERE course_id = $1) AS total,
            (SELECT COUNT(*)::int FROM topic_progress p JOIN course_topics t ON t.id = p.topic_id
              WHERE t.course_id = $1 AND p.student_id = $2) AS done`,
    [course.id, req.currentUser!.id],
  );
  res.json({ progress: stats && stats.total ? Math.round((stats.done / stats.total) * 100) : 0 });
});

const materialSchema = z.object({
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().max(1000).optional(),
  url: z.string().trim().max(500).optional(),
  file: z
    .object({
      data: z.string().max(12_000_000),
      name: z.string().max(200).optional(),
      mimeType: z.string().max(100).optional(),
    })
    .optional(),
});

/** Lecturers upload materials for approval; HOD/admin publish immediately. */
coursesRouter.post('/:id/materials', requireRole('lecturer', 'hod', 'admin'), async (req, res) => {
  const user = req.currentUser!;
  const course = await requireCourse(idParam(req));
  await assertCanManageCourse(user, course);
  const body = parse(materialSchema, req.body);
  if (!body.file && !body.url) throw badRequest('Attach a file or provide a link.');

  const file = body.file ? await storeBase64(body.file, { ownerId: user.id, kind: 'document' }) : null;
  const status = user.role === 'lecturer' ? 'pending' : 'published';
  const id = newId();
  await execute(
    `INSERT INTO course_materials (id, course_id, title, description, file_id, url, status, uploaded_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [id, course.id, body.title, body.description ?? '', file?.id ?? null, body.url ?? '', status, user.id],
  );

  if (status === 'pending') {
    await createModerationItem({
      type: 'material',
      targetId: id,
      title: `Course material: ${body.title}`,
      details: `${course.code} — ${course.title}. ${body.description ?? ''}`.trim(),
      departmentId: course.departmentId,
      submittedBy: user.id,
    });
    await notifyModerators(course.departmentId, {
      title: 'Material awaiting approval',
      body: `${body.title} (${course.code}) was submitted for review.`,
      kind: 'moderation',
    });
  } else {
    await notifyCohort(course.departmentId, course.level, {
      title: `New material in ${course.code}`,
      body: body.title,
      kind: 'academic',
    });
  }

  res.status(201).json({ id, status });
});

coursesRouter.delete(
  '/:id/materials/:materialId',
  requireRole('lecturer', 'hod', 'admin'),
  async (req, res) => {
    const user = req.currentUser!;
    const course = await requireCourse(idParam(req));
    const material = await queryOne<{ uploadedBy: string }>(
      'SELECT uploaded_by AS "uploadedBy" FROM course_materials WHERE id = $1 AND course_id = $2',
      [idParam(req, 'materialId'), course.id],
    );
    if (!material) throw notFound('That material does not exist.');
    const canManage = await departmentIdForUser(user.id);
    if (user.role !== 'admin' && material.uploadedBy !== user.id && canManage !== course.departmentId) {
      throw forbidden('You can only remove your own materials.');
    }
    await execute('DELETE FROM course_materials WHERE id = $1', [idParam(req, 'materialId')]);
    await execute("DELETE FROM moderation_items WHERE type = 'material' AND target_id = $1", [
      idParam(req, 'materialId'),
    ]);
    res.json({ ok: true });
  },
);

/** Staff roster with progress and recorded results. */
coursesRouter.get('/:id/students', requireRole('lecturer', 'hod', 'admin'), async (req, res) => {
  const course = await requireCourse(idParam(req));
  await assertCanManageCourse(req.currentUser!, course);

  const students = await query<{
    userId: string;
    firstName: string;
    lastName: string;
    matricNumber: string;
    avatarFileId: string | null;
    topicCount: number;
    completedCount: number;
    score: number | null;
    grade: string | null;
    points: number | null;
  }>(
    `SELECT u.id AS "userId", u.first_name AS "firstName", u.last_name AS "lastName",
            u.avatar_file_id AS "avatarFileId", sp.matric_number AS "matricNumber",
            (SELECT COUNT(*)::int FROM course_topics t WHERE t.course_id = $1) AS "topicCount",
            (SELECT COUNT(*)::int FROM topic_progress p JOIN course_topics t ON t.id = p.topic_id
              WHERE t.course_id = $1 AND p.student_id = u.id) AS "completedCount",
            (SELECT r.score::float8 FROM course_results r WHERE r.student_id = u.id AND r.course_id = $1
              ORDER BY r.recorded_at DESC LIMIT 1) AS score,
            (SELECT r.grade FROM course_results r WHERE r.student_id = u.id AND r.course_id = $1
              ORDER BY r.recorded_at DESC LIMIT 1) AS grade,
            (SELECT r.grade_points::float8 FROM course_results r WHERE r.student_id = u.id AND r.course_id = $1
              ORDER BY r.recorded_at DESC LIMIT 1) AS points
       FROM course_enrollments e
       JOIN users u ON u.id = e.student_id
       JOIN student_profiles sp ON sp.user_id = u.id
      WHERE e.course_id = $1
      ORDER BY sp.matric_number`,
    [course.id],
  );

  res.json({
    students: students.map((s) => ({
      userId: s.userId,
      name: `${s.firstName} ${s.lastName}`,
      matricNumber: s.matricNumber,
      avatarUrl: avatarFor(s.firstName, s.lastName, s.avatarFileId),
      progress: s.topicCount === 0 ? 0 : Math.round((s.completedCount / s.topicCount) * 100),
      result: s.score === null ? null : { score: s.score, grade: s.grade, points: s.points },
    })),
  });
});

const resultSchema = z.object({
  studentId: z.string().uuid(),
  score: z.number().min(0).max(100),
  sessionLabel: z.string().trim().max(20).optional(),
});

/** Records (or updates) a student result; grade, points and CGPA follow. */
coursesRouter.post('/:id/results', requireRole('lecturer', 'hod', 'admin'), async (req, res) => {
  const user = req.currentUser!;
  const course = await requireCourse(idParam(req));
  await assertCanManageCourse(user, course);
  const body = parse(resultSchema, req.body);

  const enrolled = await queryOne(
    'SELECT student_id FROM course_enrollments WHERE course_id = $1 AND student_id = $2',
    [course.id, body.studentId],
  );
  if (!enrolled) throw badRequest('That student is not enrolled in this course.');

  const { grade, points } = scoreToGrade(body.score);
  const sessionLabel = body.sessionLabel ?? config.sessionLabel;
  await execute(
    `INSERT INTO course_results (id, student_id, course_id, session_label, score, grade, grade_points, recorded_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (student_id, course_id, session_label)
     DO UPDATE SET score = EXCLUDED.score, grade = EXCLUDED.grade, grade_points = EXCLUDED.grade_points,
                   recorded_by = EXCLUDED.recorded_by, recorded_at = now()`,
    [newId(), body.studentId, course.id, sessionLabel, body.score, grade, points, user.id],
  );

  await notify([body.studentId], {
    title: `Result published — ${course.code}`,
    body: `You scored ${body.score} (${grade}) in ${course.title}.`,
    kind: 'academic',
  });

  res.json({ ok: true, grade, points });
});
