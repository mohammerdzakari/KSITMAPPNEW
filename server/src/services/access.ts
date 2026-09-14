import { queryOne } from '../db/index.js';
import { forbidden, notFound } from '../http/errors.js';
import type { SessionUser } from '../types.js';
import { isStaff } from '../auth/permissions.js';
import { departmentIdForUser } from './users.js';

export interface CourseRow {
  id: string;
  code: string;
  title: string;
  departmentId: string;
  department: string;
  level: string;
  creditUnits: number;
  description: string;
  createdBy: string | null;
  isArchived: boolean;
}

export async function getCourse(id: string): Promise<CourseRow | null> {
  return queryOne<CourseRow>(
    `SELECT c.id, c.code, c.title, c.department_id AS "departmentId", d.name AS department,
            c.level, c.credit_units AS "creditUnits", c.description, c.created_by AS "createdBy",
            c.is_archived AS "isArchived"
       FROM courses c JOIN departments d ON d.id = c.department_id
      WHERE c.id = $1`,
    [id],
  );
}

export async function requireCourse(id: string): Promise<CourseRow> {
  const course = await getCourse(id);
  if (!course) throw notFound('That course does not exist.');
  return course;
}

/** Staff may manage courses that belong to their own department; admins manage all. */
export async function assertCanManageCourse(user: SessionUser, course: CourseRow): Promise<void> {
  if (!isStaff(user.role)) throw forbidden('Only staff can manage courses.');
  if (user.role === 'admin') return;
  const departmentId = await departmentIdForUser(user.id);
  if (!departmentId || departmentId !== course.departmentId) {
    throw forbidden('You can only manage courses in your own department.');
  }
}

export async function assertCanViewCourse(user: SessionUser, course: CourseRow): Promise<void> {
  if (user.role === 'admin') return;
  if (isStaff(user.role)) {
    const departmentId = await departmentIdForUser(user.id);
    if (departmentId && departmentId === course.departmentId) return;
    throw forbidden('That course belongs to another department.');
  }
  const enrolled = await queryOne(
    'SELECT student_id FROM course_enrollments WHERE course_id = $1 AND student_id = $2',
    [course.id, user.id],
  );
  if (!enrolled) throw forbidden('You are not enrolled in that course.');
}

export async function assertEnrolled(studentId: string, courseId: string): Promise<void> {
  const row = await queryOne(
    'SELECT student_id FROM course_enrollments WHERE course_id = $1 AND student_id = $2',
    [courseId, studentId],
  );
  if (!row) throw forbidden('You are not enrolled in that course.');
}
