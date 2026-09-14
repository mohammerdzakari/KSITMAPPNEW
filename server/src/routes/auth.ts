import { Router } from 'express';
import QRCode from 'qrcode';
import { z } from 'zod';
import { config } from '../config.js';
import { execute, query, queryOne, transaction } from '../db/index.js';
import { badRequest, conflict, forbidden, unauthorized } from '../http/errors.js';
import { rateLimit } from '../http/rateLimit.js';
import { parse } from '../http/validate.js';
import { newId } from '../lib/id.js';
import { assertPasswordStrength, hashPassword, verifyPassword } from '../auth/password.js';
import { requireAuth } from '../auth/middleware.js';
import {
  clearSessionCookie,
  createSession,
  destroySession,
  destroyUserSessions,
  setSessionCookie,
} from '../auth/session.js';
import { storeBase64 } from '../services/files.js';
import { notify, notifyModerators } from '../services/notifications.js';
import {
  enrollStudentInCohort,
  getDepartment,
  getDepartmentByName,
  loadApiUser,
} from '../services/users.js';
import type { Role } from '../types.js';

export const authRouter = Router();

const avatarSchema = z
  .union([
    z.string().max(12_000_000),
    z.object({
      data: z.string().max(12_000_000),
      name: z.string().max(200).optional(),
      mimeType: z.string().max(100).optional(),
    }),
  ])
  .optional();

const levelSchema = z.enum(['ND I', 'ND II', 'NID I', 'NID II']);

const registerSchema = z.object({
  portal: z.enum(['student', 'staff']),
  email: z.string().trim().min(3).max(160),
  password: z.string().min(8).max(200),
  firstName: z.string().trim().min(2).max(60),
  lastName: z.string().trim().min(2).max(60),
  phone: z.string().trim().max(30).optional(),
  avatar: avatarSchema,
  // Student only
  matricNumber: z.string().trim().max(40).optional(),
  departmentId: z.string().uuid().optional(),
  department: z.string().trim().max(120).optional(),
  level: levelSchema.optional(),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_]{3,20}$/, 'Username must be 3-20 characters (letters, numbers, underscore).')
    .optional(),
  dateOfBirth: z.string().optional(),
  // Staff only
  staffId: z.string().trim().max(40).optional(),
  accessCode: z.string().trim().max(60).optional(),
  isHOD: z.boolean().optional(),
});

const loginSchema = z.object({
  portal: z.enum(['student', 'staff']),
  email: z.string().trim().min(3).max(160),
  password: z.string().min(1).max(200),
});

function assertSchoolEmail(email: string): string {
  const normalized = email.toLowerCase();
  const domain = normalized.split('@')[1] ?? '';
  const allowed = config.allowedEmailDomains.some(
    (allowedDomain) => domain === allowedDomain || domain.endsWith(`.${allowedDomain}`),
  );
  if (config.allowedEmailDomains.length > 0 && !allowed) {
    throw badRequest(
      `Use your institutional email address (e.g. name@${config.allowedEmailDomains[0]}).`,
    );
  }
  return normalized;
}

async function resolveDepartment(departmentId?: string, departmentName?: string) {
  if (departmentId) {
    const dept = await getDepartment(departmentId);
    if (!dept) throw badRequest('Unknown department.');
    return dept;
  }
  if (departmentName) {
    const dept = await getDepartmentByName(departmentName);
    if (!dept) throw badRequest('Unknown department.');
    return dept;
  }
  throw badRequest('Select your department.');
}

async function mePayload(userId: string) {
  const user = await loadApiUser(userId, config.sessionLabel);
  if (!user) throw unauthorized('Your account is no longer available.');
  return { user };
}

authRouter.post(
  '/register',
  rateLimit({ windowMs: 15 * 60 * 1000, max: 20, key: 'register' }),
  async (req, res) => {
    const body = parse(registerSchema, req.body);
    const email = assertSchoolEmail(body.email);
    assertPasswordStrength(body.password);

    const existing = await queryOne<{ id: string }>('SELECT id FROM users WHERE email = $1', [email]);
    if (existing) throw conflict('An account with that email already exists.');

    const avatarFile = await storeBase64(body.avatar, { kind: 'image', name: 'avatar' });
    const userId = newId();

    if (body.portal === 'student') {
      if (!body.matricNumber) throw badRequest('Matric number is required.');
      if (!body.level) throw badRequest('Select your level.');
      if (!body.username) throw badRequest('Choose a username.');
      if (!body.dateOfBirth) throw badRequest('Date of birth is required.');

      const matric = body.matricNumber.toUpperCase();
      const dob = new Date(body.dateOfBirth);
      if (Number.isNaN(dob.getTime())) throw badRequest('Enter a valid date of birth.');
      const age = (Date.now() - dob.getTime()) / (365.25 * 24 * 3600 * 1000);
      if (age < 12 || age > 80) throw badRequest('Enter a valid date of birth.');

      const department = await resolveDepartment(body.departmentId, body.department);

      const dupMatric = await queryOne('SELECT user_id FROM student_profiles WHERE matric_number = $1', [matric]);
      if (dupMatric) throw conflict('That matric number is already registered.');
      const dupUsername = await queryOne('SELECT user_id FROM student_profiles WHERE username = $1', [body.username]);
      if (dupUsername) throw conflict('That username is already taken.');

      await transaction(async (q) => {
        await q(
          `INSERT INTO users (id, email, password_hash, role, first_name, last_name, avatar_file_id, phone)
           VALUES ($1, $2, $3, 'student', $4, $5, $6, $7)`,
          [
            userId,
            email,
            await hashPassword(body.password),
            body.firstName,
            body.lastName,
            avatarFile?.id ?? null,
            body.phone ?? null,
          ],
        );
        await q(
          `INSERT INTO student_profiles (user_id, username, matric_number, department_id, level, date_of_birth)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [userId, body.username, matric, department.id, body.level, dob.toISOString().slice(0, 10)],
        );
        const courses = await q<{ id: string }>(
          `SELECT id FROM courses WHERE department_id = $1 AND level = $2 AND is_archived = false`,
          [department.id, body.level],
        );
        for (const course of courses) {
          await q(`INSERT INTO course_enrollments (course_id, student_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [
            course.id,
            userId,
          ]);
        }
        await q(`INSERT INTO notifications (id, user_id, title, body, kind) VALUES ($1, $2, $3, $4, $5)`, [
          newId(),
          userId,
          'Welcome to KSITM 👋',
          `Your student portal is ready, ${body.firstName}. ${courses.length} course(s) were added to your LMS.`,
          'general',
        ]);
      });
    } else {
      if (!body.staffId) throw badRequest('Staff ID is required.');
      if (!config.staffAccessCode) {
        throw forbidden('Staff registration is disabled on this server (STAFF_ACCESS_CODE is not set).');
      }
      if (body.accessCode !== config.staffAccessCode) {
        throw forbidden('Invalid staff access code.');
      }
      const department = body.departmentId || body.department
        ? await resolveDepartment(body.departmentId, body.department)
        : null;

      const staffId = body.staffId.toUpperCase();
      const dupStaff = await queryOne('SELECT user_id FROM staff_profiles WHERE staff_id = $1', [staffId]);
      if (dupStaff) throw conflict('That staff ID is already registered.');

      const wantsHod = body.isHOD === true;
      await transaction(async (q) => {
        await q(
          `INSERT INTO users (id, email, password_hash, role, first_name, last_name, avatar_file_id, phone)
           VALUES ($1, $2, $3, 'lecturer', $4, $5, $6, $7)`,
          [
            userId,
            email,
            await hashPassword(body.password),
            body.firstName,
            body.lastName,
            avatarFile?.id ?? null,
            body.phone ?? null,
          ],
        );
        await q(
          `INSERT INTO staff_profiles (user_id, staff_id, department_id, hod_requested_at)
           VALUES ($1, $2, $3, $4)`,
          [
            userId,
            staffId,
            department?.id ?? null,
            wantsHod ? new Date() : null,
          ],
        );
        if (wantsHod) {
          await q(
            `INSERT INTO moderation_items (id, type, target_id, title, details, department_id, submitted_by)
             VALUES ($1, 'hod_request', $2, $3, $4, $5, $6)`,
            [
              newId(),
              userId,
              `Head of Department request — ${body.firstName} ${body.lastName}`,
              `Requested management of ${department?.name ?? 'a department'} as part of staff registration.`,
              department?.id ?? null,
              userId,
            ],
          );
        }
      });

      if (wantsHod) {
        await notifyModerators(department?.id ?? null, {
          title: 'New HOD request',
          body: `${body.firstName} ${body.lastName} requested Head of Department access.`,
          kind: 'moderation',
        });
      }
    }

    const session = await createSession(userId, {
      userAgent: req.headers['user-agent'],
      ip: req.ip,
    });
    setSessionCookie(res, session.token, session.expiresAt);
    res.status(201).json(await mePayload(userId));
  },
);

authRouter.post(
  '/login',
  rateLimit({ windowMs: 10 * 60 * 1000, max: 25, key: 'login' }),
  async (req, res) => {
    const body = parse(loginSchema, req.body);
    const email = body.email.toLowerCase();

    const user = await queryOne<{
      id: string;
      passwordHash: string;
      role: Role;
      isActive: boolean;
      firstName: string;
    }>(
      `SELECT id, password_hash AS "passwordHash", role, is_active AS "isActive", first_name AS "firstName"
         FROM users WHERE email = $1`,
      [email],
    );

    // Same message for unknown email / wrong password to avoid user enumeration.
    if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
      throw unauthorized('Incorrect email or password.');
    }
    if (!user.isActive) {
      throw forbidden('This account has been deactivated. Contact the administrator.');
    }

    const isStaffAccount = user.role !== 'student';
    if (body.portal === 'staff' && !isStaffAccount) {
      throw forbidden('That account is a student account. Use the Student Portal.');
    }
    if (body.portal === 'student' && isStaffAccount) {
      throw forbidden('That account is a staff account. Use the Staff Portal.');
    }

    const session = await createSession(user.id, {
      userAgent: req.headers['user-agent'],
      ip: req.ip,
    });
    setSessionCookie(res, session.token, session.expiresAt);
    res.json(await mePayload(user.id));
  },
);

authRouter.post('/logout', async (req, res) => {
  await destroySession(req.sessionToken);
  clearSessionCookie(res);
  res.json({ ok: true });
});

authRouter.get('/me', requireAuth, async (req, res) => {
  res.json(await mePayload(req.currentUser!.id));
});

authRouter.post(
  '/verify-access-code',
  rateLimit({ windowMs: 10 * 60 * 1000, max: 15, key: 'access-code' }),
  async (req, res) => {
    const { code } = parse(z.object({ code: z.string().trim().min(3).max(60) }), req.body);
    if (!config.staffAccessCode) throw forbidden('Staff registration is disabled on this server.');
    if (code !== config.staffAccessCode) throw forbidden('Access Denied. That staff code is not valid.');
    res.json({ ok: true });
  },
);

/** Real username availability check (replaces the hardcoded list). */
authRouter.get('/username-available', async (req, res) => {
  const username = String(req.query.username ?? '').trim().toLowerCase();
  if (!/^[a-z0-9_]{3,20}$/.test(username)) {
    res.json({ available: false, reason: 'invalid' });
    return;
  }
  const reserved = ['admin', 'root', 'ksitm', 'hod', 'lecturer', 'student', 'support'];
  if (reserved.includes(username)) {
    res.json({ available: false, reason: 'reserved' });
    return;
  }
  const existing = await queryOne('SELECT user_id FROM student_profiles WHERE username = $1', [username]);
  res.json({ available: !existing });
});

const updateProfileSchema = z.object({
  firstName: z.string().trim().min(2).max(60).optional(),
  lastName: z.string().trim().min(2).max(60).optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  avatar: avatarSchema,
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_]{3,20}$/)
    .optional(),
  dateOfBirth: z.string().optional(),
});

authRouter.patch('/me', requireAuth, async (req, res) => {
  const body = parse(updateProfileSchema, req.body);
  const userId = req.currentUser!.id;
  const sets: string[] = ['updated_at = now()'];
  const params: unknown[] = [];

  if (body.firstName) {
    params.push(body.firstName);
    sets.push(`first_name = $${params.length}`);
  }
  if (body.lastName) {
    params.push(body.lastName);
    sets.push(`last_name = $${params.length}`);
  }
  if (body.phone !== undefined) {
    params.push(body.phone);
    sets.push(`phone = $${params.length}`);
  }
  if (body.avatar) {
    const file = await storeBase64(body.avatar, { ownerId: userId, kind: 'image', name: 'avatar' });
    if (file) {
      params.push(file.id);
      sets.push(`avatar_file_id = $${params.length}`);
    }
  }

  params.push(userId);
  await execute(`UPDATE users SET ${sets.join(', ')} WHERE id = $${params.length}`, params);

  if (body.username || body.dateOfBirth) {
    const profileSets: string[] = ['updated_at = now()'];
    const profileParams: unknown[] = [];
    if (body.username) {
      const taken = await queryOne(
        'SELECT user_id FROM student_profiles WHERE username = $1 AND user_id <> $2',
        [body.username, userId],
      );
      if (taken) throw conflict('That username is already taken.');
      profileParams.push(body.username);
      profileSets.push(`username = $${profileParams.length}`);
    }
    if (body.dateOfBirth) {
      const dob = new Date(body.dateOfBirth);
      if (Number.isNaN(dob.getTime())) throw badRequest('Enter a valid date of birth.');
      profileParams.push(dob.toISOString().slice(0, 10));
      profileSets.push(`date_of_birth = $${profileParams.length}`);
    }
    profileParams.push(userId);
    await execute(
      `UPDATE student_profiles SET ${profileSets.join(', ')} WHERE user_id = $${profileParams.length}`,
      profileParams,
    );
  }

  res.json(await mePayload(userId));
});

const passwordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(8).max(200),
});

authRouter.post('/change-password', requireAuth, async (req, res) => {
  const body = parse(passwordSchema, req.body);
  assertPasswordStrength(body.newPassword);
  const userId = req.currentUser!.id;

  const row = await queryOne<{ passwordHash: string }>(
    'SELECT password_hash AS "passwordHash" FROM users WHERE id = $1',
    [userId],
  );
  if (!row || !(await verifyPassword(body.currentPassword, row.passwordHash))) {
    throw unauthorized('Your current password is incorrect.');
  }
  await execute('UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1', [
    userId,
    await hashPassword(body.newPassword),
  ]);
  // Keep this device signed in, sign out everywhere else.
  await destroyUserSessions(userId, req.sessionToken);
  res.json({ ok: true });
});

/** Lists every department so the registration forms are data-driven. */
authRouter.get('/departments', async (_req, res) => {
  const rows = await query<{ id: string; name: string; category: string }>(
    'SELECT id, name, category FROM departments ORDER BY category, name',
  );
  res.json({ departments: rows });
});

/**
 * QR code for the digital student ID. Generated server-side from the stored
 * profile so the payload cannot be tampered with in the browser.
 */
authRouter.get('/id-card.png', requireAuth, async (req, res) => {
  const user = req.currentUser!;
  const profile = await queryOne<{ matricNumber: string; department: string; level: string }>(
    `SELECT sp.matric_number AS "matricNumber", d.name AS department, sp.level
       FROM student_profiles sp JOIN departments d ON d.id = sp.department_id
      WHERE sp.user_id = $1`,
    [user.id],
  );
  if (!profile) throw forbidden('Digital ID cards are issued to students only.');

  const payload = JSON.stringify({
    v: 1,
    id: user.id,
    matric: profile.matricNumber,
    name: `${user.firstName} ${user.lastName}`,
    department: profile.department,
    level: profile.level,
    session: config.sessionLabel,
  });
  const png = await QRCode.toBuffer(payload, {
    type: 'png',
    width: 320,
    margin: 1,
    color: { dark: '#020617', light: '#ffffff' },
  });
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.end(png);
});
