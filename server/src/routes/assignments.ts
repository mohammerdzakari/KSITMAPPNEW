import { Router } from 'express';
import { z } from 'zod';
import { execute, query, queryOne } from '../db/index.js';
import { badRequest, conflict, forbidden, notFound } from '../http/errors.js';
import { idParam, parse } from '../http/validate.js';
import { newId } from '../lib/id.js';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { assertCanManageCourse, assertEnrolled, requireCourse } from '../services/access.js';
import { fileUrl, storeBase64 } from '../services/files.js';
import { notify, notifyCohort } from '../services/notifications.js';
import { avatarFor, departmentIdForUser } from '../services/users.js';

export const assignmentsRouter = Router();
assignmentsRouter.use(requireAuth);

const assignmentSchema = z.object({
  courseId: z.string().uuid(),
  title: z.string().trim().min(3).max(180),
  description: z.string().trim().max(4000).default(''),
  deadline: z.string().min(1),
  maxScore: z.number().int().min(1).max(200).optional(),
  attachment: z
    .object({
      data: z.string().max(12_000_000),
      name: z.string().max(200).optional(),
      mimeType: z.string().max(100).optional(),
    })
    .optional(),
});

function parseDeadline(value: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw badRequest('Enter a valid deadline.');
  return date;
}

/** GET /api/assignments — student or staff view. */
assignmentsRouter.get('/', async (req, res) => {
  const user = req.currentUser!;
  const view = String(req.query.view ?? (user.role === 'student' ? 'pending' : 'active'));

  if (user.role === 'student') {
    const rows = await query<Record<string, unknown>>(
      `SELECT a.id, a.title, a.description, a.deadline, a.max_score AS "maxScore",
              a.created_at AS "createdAt", c.id AS "courseId", c.code AS "courseCode",
              c.title AS "courseTitle", d.name AS department, c.level,
              (u.first_name || ' ' || u.last_name) AS "createdByName",
              s.id AS "submissionId", s.status AS "submissionStatus", s.is_late AS "isLate",
              s.score::float8 AS score, s.remark, s.submitted_at AS "submittedAt",
              s.file_id AS "submissionFileId",
              (SELECT COUNT(*)::int FROM submissions sub WHERE sub.assignment_id = a.id) AS "submissionCount"
         FROM assignments a
         JOIN courses c ON c.id = a.course_id
         JOIN departments d ON d.id = c.department_id
         JOIN users u ON u.id = a.created_by
         JOIN course_enrollments e ON e.course_id = c.id AND e.student_id = $1
         LEFT JOIN submissions s ON s.assignment_id = a.id AND s.student_id = $1
        WHERE c.is_archived = false
          AND ($2 = 'all' OR ($2 = 'pending' AND s.id IS NULL) OR ($2 = 'submitted' AND s.id IS NOT NULL))
        ORDER BY a.deadline ASC`,
      [user.id, view === 'submitted' ? 'submitted' : view === 'all' ? 'all' : 'pending'],
    );
    res.json({ assignments: rows.map((r) => shapeAssignment(r, true)) });
    return;
  }

  const departmentId = await departmentIdForUser(user.id);
  const rows = await query<Record<string, unknown>>(
    `SELECT a.id, a.title, a.description, a.deadline, a.max_score AS "maxScore",
            a.created_at AS "createdAt", a.updated_at AS "updatedAt",
            c.id AS "courseId", c.code AS "courseCode", c.title AS "courseTitle",
            d.name AS department, c.level, a.created_by AS "createdBy",
            (u.first_name || ' ' || u.last_name) AS "createdByName",
            (a.created_by = $2) AS mine,
            (SELECT COUNT(*)::int FROM course_enrollments e WHERE e.course_id = c.id) AS "enrolledCount",
            (SELECT COUNT(*)::int FROM submissions sub WHERE sub.assignment_id = a.id) AS "submissionCount",
            (SELECT COUNT(*)::int FROM submissions sub WHERE sub.assignment_id = a.id AND sub.status = 'graded') AS "gradedCount",
            a.attachment_file_id AS "attachmentFileId"
       FROM assignments a
       JOIN courses c ON c.id = a.course_id
       JOIN departments d ON d.id = c.department_id
       JOIN users u ON u.id = a.created_by
      WHERE c.is_archived = false
        AND ($1::uuid IS NULL OR c.department_id = $1)
      ORDER BY a.deadline DESC`,
    [departmentId, user.id],
  );
  res.json({ assignments: rows.map((r) => shapeAssignment(r, false)) });
});

function shapeAssignment(row: Record<string, unknown>, forStudent: boolean) {
  const deadline = row.deadline as Date;
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    deadline,
    maxScore: row.maxScore,
    courseId: row.courseId,
    courseCode: row.courseCode,
    courseTitle: row.courseTitle,
    department: row.department,
    level: row.level,
    createdByName: row.createdByName,
    createdAt: row.createdAt,
    isOverdue: deadline.getTime() < Date.now(),
    submission: forStudent && row.submissionId
      ? {
          id: row.submissionId,
          status: row.submissionStatus,
          isLate: row.isLate,
          score: row.score,
          remark: row.remark,
          submittedAt: row.submittedAt,
          fileUrl: fileUrl(row.submissionFileId as string | null),
        }
      : undefined,
    stats: forStudent
      ? undefined
      : {
          enrolledCount: row.enrolledCount,
          submissionCount: row.submissionCount,
          gradedCount: row.gradedCount,
        },
    mine: row.mine ?? false,
    attachmentFileId: row.attachmentFileId ?? null,
    attachmentUrl: fileUrl((row.attachmentFileId as string) ?? null),
  };
}

assignmentsRouter.post('/', requireRole('lecturer', 'hod', 'admin'), async (req, res) => {
  const user = req.currentUser!;
  const body = parse(assignmentSchema, req.body);
  const course = await requireCourse(body.courseId);
  await assertCanManageCourse(user, course);

  const deadline = parseDeadline(body.deadline);
  const attachment = body.attachment
    ? await storeBase64(body.attachment, { ownerId: user.id, kind: 'document' })
    : null;

  const id = newId();
  await execute(
    `INSERT INTO assignments (id, course_id, title, description, deadline, max_score, attachment_file_id, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      id,
      course.id,
      body.title,
      body.description,
      deadline,
      body.maxScore ?? 100,
      attachment?.id ?? null,
      user.id,
    ],
  );

  await notifyCohort(course.departmentId, course.level, {
    title: `New assignment in ${course.code}`,
    body: `${body.title} — due ${deadline.toLocaleString()}`,
    kind: 'academic',
  });

  res.status(201).json({ id });
});

assignmentsRouter.get('/:id', async (req, res) => {
  const user = req.currentUser!;
  const rows = await query<Record<string, unknown>>(
    `SELECT a.id, a.title, a.description, a.deadline, a.max_score AS "maxScore",
            a.created_at AS "createdAt", a.created_by AS "createdBy",
            a.attachment_file_id AS "attachmentFileId",
            c.id AS "courseId", c.code AS "courseCode", c.title AS "courseTitle", c.department_id AS "departmentId",
            d.name AS department, c.level,
            (u.first_name || ' ' || u.last_name) AS "createdByName",
            s.id AS "submissionId", s.status AS "submissionStatus", s.is_late AS "isLate",
            s.score::float8 AS score, s.remark, s.submitted_at AS "submittedAt", s.note,
            s.file_id AS "submissionFileId"
       FROM assignments a
       JOIN courses c ON c.id = a.course_id
       JOIN departments d ON d.id = c.department_id
       JOIN users u ON u.id = a.created_by
       LEFT JOIN submissions s ON s.assignment_id = a.id AND s.student_id = $2
      WHERE a.id = $1`,
    [idParam(req), user.id],
  );
  const row = rows[0];
  if (!row) throw notFound('That assignment does not exist.');

  if (user.role === 'student') {
    await assertEnrolled(user.id, row.courseId as string);
    res.json({ assignment: shapeAssignment(row, true) });
    return;
  }
  res.json({ assignment: shapeAssignment(row, false) });
});

assignmentsRouter.patch('/:id', requireRole('lecturer', 'hod', 'admin'), async (req, res) => {
  const user = req.currentUser!;
  const assignment = await queryOne<{ courseId: string; createdBy: string }>(
    'SELECT course_id AS "courseId", created_by AS "createdBy" FROM assignments WHERE id = $1',
    [idParam(req)],
  );
  if (!assignment) throw notFound('That assignment does not exist.');
  const course = await requireCourse(assignment.courseId);
  await assertCanManageCourse(user, course);

  const body = parse(assignmentSchema.partial(), req.body);
  const sets: string[] = ['updated_at = now()'];
  const params: unknown[] = [];
  if (body.title !== undefined) {
    params.push(body.title);
    sets.push(`title = $${params.length}`);
  }
  if (body.description !== undefined) {
    params.push(body.description);
    sets.push(`description = $${params.length}`);
  }
  if (body.deadline !== undefined) {
    params.push(parseDeadline(body.deadline));
    sets.push(`deadline = $${params.length}`);
  }
  if (body.maxScore !== undefined) {
    params.push(body.maxScore);
    sets.push(`max_score = $${params.length}`);
  }
  if (body.attachment) {
    const file = await storeBase64(body.attachment, { ownerId: user.id, kind: 'document' });
    if (file) {
      params.push(file.id);
      sets.push(`attachment_file_id = $${params.length}`);
    }
  }
  params.push(idParam(req));
  await execute(`UPDATE assignments SET ${sets.join(', ')} WHERE id = $${params.length}`, params);

  if (body.deadline) {
    await notifyCohort(course.departmentId, course.level, {
      title: `Deadline updated — ${course.code}`,
      body: `${body.title ?? 'Assignment'} is now due ${parseDeadline(body.deadline).toLocaleString()}`,
      kind: 'academic',
    });
  }
  res.json({ ok: true });
});

assignmentsRouter.delete('/:id', requireRole('lecturer', 'hod', 'admin'), async (req, res) => {
  const user = req.currentUser!;
  const assignment = await queryOne<{ courseId: string; createdBy: string }>(
    'SELECT course_id AS "courseId", created_by AS "createdBy" FROM assignments WHERE id = $1',
    [idParam(req)],
  );
  if (!assignment) throw notFound('That assignment does not exist.');
  if (assignment.createdBy !== user.id && user.role !== 'admin') {
    const course = await requireCourse(assignment.courseId);
    await assertCanManageCourse(user, course);
  }
  await execute('DELETE FROM assignments WHERE id = $1', [idParam(req)]);
  res.json({ ok: true });
});

const submissionSchema = z.object({
  note: z.string().trim().max(2000).optional(),
  file: z
    .object({
      data: z.string().max(12_000_000),
      name: z.string().max(200).optional(),
      mimeType: z.string().max(100).optional(),
    })
    .optional(),
});

/** Students upload (or replace) their submission. Lateness is computed server-side. */
assignmentsRouter.post('/:id/submissions', requireRole('student'), async (req, res) => {
  const user = req.currentUser!;
  const body = parse(submissionSchema, req.body);

  const assignment = await queryOne<{
    id: string;
    deadline: Date;
    courseId: string;
    title: string;
    maxScore: number;
  }>(
    'SELECT id, deadline, course_id AS "courseId", title, max_score AS "maxScore" FROM assignments WHERE id = $1',
    [idParam(req)],
  );
  if (!assignment) throw notFound('That assignment does not exist.');
  await assertEnrolled(user.id, assignment.courseId);

  const existing = await queryOne<{ id: string; status: string }>(
    'SELECT id, status FROM submissions WHERE assignment_id = $1 AND student_id = $2',
    [assignment.id, user.id],
  );
  if (existing?.status === 'graded') {
    throw conflict('This submission has already been graded and can no longer be replaced.');
  }
  if (!body.file && !body.note) throw badRequest('Attach your work or add a note before submitting.');

  const file = body.file ? await storeBase64(body.file, { ownerId: user.id, kind: 'document' }) : null;
  const isLate = assignment.deadline.getTime() < Date.now();

  if (existing) {
    await execute(
      `UPDATE submissions
          SET file_id = COALESCE($3, file_id), note = $4, is_late = $5, status = 'submitted',
              updated_at = now(), submitted_at = now()
        WHERE id = $1 AND student_id = $2`,
      [existing.id, user.id, file?.id ?? null, body.note ?? '', isLate],
    );
  } else {
    await execute(
      `INSERT INTO submissions (id, assignment_id, student_id, file_id, note, is_late)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [newId(), assignment.id, user.id, file?.id ?? null, body.note ?? '', isLate],
    );
  }

  const creator = await queryOne<{ id: string }>(
    'SELECT u.id FROM assignments a JOIN users u ON u.id = a.created_by WHERE a.id = $1',
    [assignment.id],
  );
  if (creator) {
    await notify([creator.id], {
      title: `New submission — ${assignment.title}`,
      body: `${user.firstName} ${user.lastName} submitted${isLate ? ' (late)' : ''}.`,
      kind: 'academic',
    });
  }

  res.status(existing ? 200 : 201).json({ ok: true, isLate });
});

assignmentsRouter.get('/:id/submissions', requireRole('lecturer', 'hod', 'admin'), async (req, res) => {
  const user = req.currentUser!;
  const assignment = await queryOne<{ courseId: string; maxScore: number }>(
    'SELECT course_id AS "courseId", max_score AS "maxScore" FROM assignments WHERE id = $1',
    [idParam(req)],
  );
  if (!assignment) throw notFound('That assignment does not exist.');
  await assertCanManageCourse(user, await requireCourse(assignment.courseId));

  const rows = await query<{
    id: string;
    studentId: string;
    name: string;
    matricNumber: string;
    avatarFileId: string | null;
    firstName: string;
    lastName: string;
    fileId: string | null;
    note: string;
    isLate: boolean;
    status: string;
    score: number | null;
    remark: string;
    submittedAt: Date;
    gradedAt: Date | null;
    gradedByName: string | null;
  }>(
    `SELECT s.id, s.student_id AS "studentId",
            (u.first_name || ' ' || u.last_name) AS name,
            u.first_name AS "firstName", u.last_name AS "lastName", u.avatar_file_id AS "avatarFileId",
            sp.matric_number AS "matricNumber",
            s.file_id AS "fileId", s.note, s.is_late AS "isLate", s.status,
            s.score::float8 AS score, s.remark, s.submitted_at AS "submittedAt",
            s.graded_at AS "gradedAt",
            (g.first_name || ' ' || g.last_name) AS "gradedByName"
       FROM submissions s
       JOIN users u ON u.id = s.student_id
       JOIN student_profiles sp ON sp.user_id = u.id
       LEFT JOIN users g ON g.id = s.graded_by
      WHERE s.assignment_id = $1
      ORDER BY s.submitted_at ASC`,
    [idParam(req)],
  );

  res.json({
    maxScore: assignment.maxScore,
    submissions: rows.map((r) => ({
      id: r.id,
      studentId: r.studentId,
      studentName: r.name,
      studentMatric: r.matricNumber,
      avatarUrl: avatarFor(r.firstName, r.lastName, r.avatarFileId),
      fileUrl: fileUrl(r.fileId),
      note: r.note,
      isLate: r.isLate,
      status: r.status,
      score: r.score,
      remark: r.remark,
      submittedAt: r.submittedAt,
      gradedAt: r.gradedAt,
      gradedByName: r.gradedByName,
    })),
  });
});

const gradeSchema = z.object({
  score: z.number().min(0).max(200),
  remark: z.string().trim().max(1000).optional(),
});

assignmentsRouter.post(
  '/:id/submissions/:submissionId/grade',
  requireRole('lecturer', 'hod', 'admin'),
  async (req, res) => {
    const user = req.currentUser!;
    const assignment = await queryOne<{ courseId: string; maxScore: number; title: string; courseCode: string }>(
      `SELECT a.course_id AS "courseId", a.max_score AS "maxScore", a.title, c.code AS "courseCode"
         FROM assignments a JOIN courses c ON c.id = a.course_id WHERE a.id = $1`,
      [idParam(req)],
    );
    if (!assignment) throw notFound('That assignment does not exist.');
    await assertCanManageCourse(user, await requireCourse(assignment.courseId));

    const body = parse(gradeSchema, req.body);
    if (body.score > assignment.maxScore) {
      throw badRequest(`Score cannot exceed ${assignment.maxScore}.`);
    }
    const submission = await queryOne<{ studentId: string }>(
      'SELECT student_id AS "studentId" FROM submissions WHERE id = $1 AND assignment_id = $2',
      [idParam(req, 'submissionId'), idParam(req)],
    );
    if (!submission) throw notFound('That submission does not exist.');

    await execute(
      `UPDATE submissions
          SET score = $2, remark = $3, status = 'graded', graded_by = $4, graded_at = now(), updated_at = now()
        WHERE id = $1`,
      [idParam(req, 'submissionId'), body.score, body.remark ?? '', user.id],
    );

    await notify([submission.studentId], {
      title: `Graded — ${assignment.courseCode}`,
      body: `${assignment.title}: ${body.score}/${assignment.maxScore}${body.remark ? ` — ${body.remark}` : ''}`,
      kind: 'academic',
    });

    res.json({ ok: true });
  },
);
