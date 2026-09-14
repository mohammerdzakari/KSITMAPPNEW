import { execute, query, queryOne } from '../db/index.js';
import { initialsAvatar } from '../lib/avatar.js';
import { fileUrl } from './files.js';
import { unreadCount } from './notifications.js';
import type { Role } from '../types.js';

export interface DepartmentInfo {
  id: string;
  name: string;
  category: string;
}

export interface StudentPayload {
  userId: string;
  username: string | null;
  matricNumber: string;
  departmentId: string;
  department: string;
  category: string;
  level: string;
  dateOfBirth: string | null;
  cgpa: number;
  resultsCount: number;
  streak: number;
  nextClass: string | null;
  enrolledCourses: number;
  sessionLabel: string;
}

export interface StaffPayload {
  userId: string;
  staffId: string;
  departmentId: string | null;
  department: string | null;
  category: string | null;
  hodRequestedAt: string | null;
}

export interface ApiUser {
  id: string;
  email: string;
  role: Role;
  firstName: string;
  lastName: string;
  avatarUrl: string;
  avatarFileId: string | null;
  phone: string | null;
  isActive: boolean;
  isHOD: boolean;
  createdAt: string;
  unreadNotifications: number;
  student?: StudentPayload;
  staff?: StaffPayload;
}

interface UserRow {
  id: string;
  email: string;
  role: Role;
  firstName: string;
  lastName: string;
  avatarFileId: string | null;
  phone: string | null;
  isActive: boolean;
  createdAt: Date;
}

/** Deterministic initials avatar so the UI never shows a broken image. */
export function fallbackAvatar(firstName: string, lastName: string): string {
  return initialsAvatar(`${firstName || 'K'} ${lastName || 'S'}`);
}

export function avatarFor(firstName: string, lastName: string, fileId: string | null): string {
  return fileUrl(fileId) ?? fallbackAvatar(firstName, lastName);
}

/**
 * `date` columns arrive as JS Date objects from both drivers; `String(date)`
 * would produce "Mon Mar 15", so build the ISO date from the local parts
 * (that is how the drivers construct them).
 */
export function toIsoDate(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) {
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${value.getFullYear()}-${month}-${day}`;
  }
  return String(value).slice(0, 10);
}

export async function listDepartments(): Promise<DepartmentInfo[]> {
  return query<DepartmentInfo>(
    `SELECT id, name, category FROM departments ORDER BY category, name`,
  );
}

export async function getDepartment(id: string): Promise<DepartmentInfo | null> {
  return queryOne<DepartmentInfo>('SELECT id, name, category FROM departments WHERE id = $1', [id]);
}

export async function getDepartmentByName(name: string): Promise<DepartmentInfo | null> {
  return queryOne<DepartmentInfo>('SELECT id, name, category FROM departments WHERE name = $1', [
    name,
  ]);
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatTime(hh: number, mm: number): string {
  const suffix = hh >= 12 ? 'PM' : 'AM';
  const hour12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${hour12}:${String(mm).padStart(2, '0')} ${suffix}`;
}

export async function computeNextClass(studentId: string): Promise<string | null> {
  const rows = await query<{
    weekday: number;
    startTime: string;
    endTime: string;
    room: string;
    code: string;
    title: string;
  }>(
    `SELECT cs.weekday, cs.start_time AS "startTime", cs.end_time AS "endTime", cs.room, c.code, c.title
       FROM course_schedules cs
       JOIN courses c ON c.id = cs.course_id
       JOIN course_enrollments e ON e.course_id = c.id AND e.student_id = $1
      WHERE c.is_archived = false`,
    [studentId],
  );
  if (rows.length === 0) return null;

  const now = new Date();
  let best: { label: string; at: Date } | null = null;

  for (const row of rows) {
    const [rawHour, rawMinute] = String(row.startTime || '00:00').split(':');
    const hour = Number.parseInt(rawHour, 10) || 0;
    const minute = Number.parseInt(rawMinute, 10) || 0;
    for (let offset = 0; offset < 8; offset += 1) {
      const candidate = new Date(now);
      candidate.setDate(now.getDate() + offset);
      if (candidate.getDay() !== row.weekday) continue;
      candidate.setHours(hour, minute, 0, 0);
      if (candidate.getTime() <= now.getTime()) continue;
      const label = `${DAY_NAMES[row.weekday]} ${formatTime(hour, minute)} • ${row.code}${
        row.room ? ` @ ${row.room}` : ''
      }`;
      if (!best || candidate < best.at) best = { label, at: candidate };
      break;
    }
  }
  return best?.label ?? null;
}

/** Consecutive days (ending today or yesterday) with at least one attendance mark. */
export async function computeAttendanceStreak(studentId: string): Promise<number> {
  const rows = await query<{ day: string }>(
    `SELECT DISTINCT (marked_at AT TIME ZONE 'UTC')::date::text AS day
       FROM attendance_records WHERE student_id = $1 ORDER BY day DESC`,
    [studentId],
  );
  if (rows.length === 0) return 0;

  const dayKey = (d: Date) => d.toISOString().slice(0, 10);
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86400000);
  const first = rows[0].day;
  if (first !== dayKey(today) && first !== dayKey(yesterday)) return 0;

  let streak = 1;
  let cursor = new Date(`${first}T00:00:00.000Z`);
  for (let i = 1; i < rows.length; i += 1) {
    cursor = new Date(cursor.getTime() - 86400000);
    if (rows[i].day !== cursor.toISOString().slice(0, 10)) break;
    streak += 1;
  }
  return streak;
}

export async function computeCgpa(studentId: string): Promise<{ cgpa: number; count: number }> {
  const row = await queryOne<{ cgpa: number | null; n: number }>(
    `SELECT SUM(r.grade_points * c.credit_units) / NULLIF(SUM(c.credit_units), 0) AS cgpa,
            COUNT(*)::int AS n
       FROM course_results r
       JOIN courses c ON c.id = r.course_id
      WHERE r.student_id = $1`,
    [studentId],
  );
  return { cgpa: row?.cgpa ? Number(row.cgpa) : 0, count: row?.n ?? 0 };
}

export async function loadApiUser(userId: string, sessionLabel: string): Promise<ApiUser | null> {
  const user = await queryOne<UserRow>(
    `SELECT id, email, role, first_name AS "firstName", last_name AS "lastName",
            avatar_file_id AS "avatarFileId", phone, is_active AS "isActive", created_at AS "createdAt"
       FROM users WHERE id = $1`,
    [userId],
  );
  if (!user) return null;

  const payload: ApiUser = {
    id: user.id,
    email: user.email,
    role: user.role,
    firstName: user.firstName,
    lastName: user.lastName,
    avatarUrl: avatarFor(user.firstName, user.lastName, user.avatarFileId),
    avatarFileId: user.avatarFileId,
    phone: user.phone,
    isActive: user.isActive,
    isHOD: user.role === 'hod',
    createdAt: user.createdAt.toISOString(),
    unreadNotifications: await unreadCount(userId),
  };

  if (user.role === 'student') {
    const profile = await queryOne<{
      username: string | null;
      matricNumber: string;
      departmentId: string;
      department: string;
      category: string;
      level: string;
      dateOfBirth: Date | string | null;
    }>(
      `SELECT sp.username, sp.matric_number AS "matricNumber", sp.department_id AS "departmentId",
              d.name AS department, d.category, sp.level, sp.date_of_birth AS "dateOfBirth"
         FROM student_profiles sp
         JOIN departments d ON d.id = sp.department_id
        WHERE sp.user_id = $1`,
      [userId],
    );
    if (profile) {
      const [{ cgpa, count }, streak, nextClass, enrolled] = await Promise.all([
        computeCgpa(userId),
        computeAttendanceStreak(userId),
        computeNextClass(userId),
        queryOne<{ n: number }>(
          `SELECT COUNT(*)::int AS n FROM course_enrollments e
             JOIN courses c ON c.id = e.course_id
            WHERE e.student_id = $1 AND c.is_archived = false`,
          [userId],
        ),
      ]);
      payload.student = {
        userId,
        username: profile.username,
        matricNumber: profile.matricNumber,
        departmentId: profile.departmentId,
        department: profile.department,
        category: profile.category,
        level: profile.level,
        dateOfBirth: toIsoDate(profile.dateOfBirth),
        cgpa: Number(cgpa.toFixed(2)),
        resultsCount: count,
        streak,
        nextClass,
        enrolledCourses: enrolled?.n ?? 0,
        sessionLabel,
      };
    }
  } else {
    const profile = await queryOne<{
      staffId: string;
      departmentId: string | null;
      department: string | null;
      category: string | null;
      hodRequestedAt: Date | null;
    }>(
      `SELECT sp.staff_id AS "staffId", sp.department_id AS "departmentId", d.name AS department,
              d.category, sp.hod_requested_at AS "hodRequestedAt"
         FROM staff_profiles sp
         LEFT JOIN departments d ON d.id = sp.department_id
        WHERE sp.user_id = $1`,
      [userId],
    );
    payload.staff = {
      userId,
      staffId: profile?.staffId ?? '—',
      departmentId: profile?.departmentId ?? null,
      department: profile?.department ?? null,
      category: profile?.category ?? null,
      hodRequestedAt: profile?.hodRequestedAt ? profile.hodRequestedAt.toISOString() : null,
    };
  }

  return payload;
}

export async function departmentIdForUser(userId: string): Promise<string | null> {
  const row = await queryOne<{ departmentId: string | null }>(
    `SELECT COALESCE(sp.department_id, st.department_id) AS "departmentId"
       FROM users u
       LEFT JOIN student_profiles sp ON sp.user_id = u.id
       LEFT JOIN staff_profiles st ON st.user_id = u.id
      WHERE u.id = $1`,
    [userId],
  );
  return row?.departmentId ?? null;
}

/** Enrolls a student in every active course offered to their cohort. */
export async function enrollStudentInCohort(
  studentId: string,
  departmentId: string,
  level: string,
): Promise<number> {
  const rows = await query<{ id: string }>(
    `SELECT id FROM courses WHERE department_id = $1 AND level = $2 AND is_archived = false`,
    [departmentId, level],
  );
  for (const course of rows) {
    await execute(
      `INSERT INTO course_enrollments (course_id, student_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [course.id, studentId],
    );
  }
  return rows.length;
}

/** Enrolls an entire cohort into a newly created course. */
export async function enrollCohortInCourse(
  courseId: string,
  departmentId: string,
  level: string,
): Promise<number> {
  const students = await query<{ userId: string }>(
    `SELECT user_id AS "userId" FROM student_profiles WHERE department_id = $1 AND level = $2`,
    [departmentId, level],
  );
  for (const student of students) {
    await execute(
      `INSERT INTO course_enrollments (course_id, student_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [courseId, student.userId],
    );
  }
  return students.length;
}
