import { config } from '../config.js';
import { execute, queryOne } from '../db/index.js';
import { newId } from '../lib/id.js';
import { hashPassword } from '../auth/password.js';

/**
 * Institutional reference data: the programme/department list published by
 * KSITM. This is configuration data, not demo content.
 */
export const KSITM_DEPARTMENTS: Record<string, string[]> = {
  'National Diploma (ND)': [
    'Accountancy',
    'Library and Information Science',
    'Electrical / Electronics Engineering Technology',
    'Computer Science',
    'Computer Engineering Technology',
  ],
  'National Innovation Diploma (NID)': [
    'Computer Software Engineering',
    'Networking and System Security',
    'Multimedia Technology',
    'Computer Hardware Engineering Technology',
    'Security Management and Technology',
    'Business Informatics',
    'Banking Operations',
    'Islamic Banking and Finance',
  ],
  'Short Courses / Certifications': [
    'CCNA / Networking Fundamentals',
    'Web Development',
    'Web Design',
    'Data Processing',
    'ICT Trainings',
  ],
};

export async function seedDepartments(): Promise<number> {
  let inserted = 0;
  for (const [category, names] of Object.entries(KSITM_DEPARTMENTS)) {
    for (const name of names) {
      const affected = await execute(
        'INSERT INTO departments (id, name, category) VALUES ($1, $2, $3) ON CONFLICT (name) DO NOTHING',
        [newId(), name, category],
      );
      inserted += affected;
    }
  }
  return inserted;
}

/**
 * Creates the first system administrator.
 * In production ADMIN_EMAIL/ADMIN_PASSWORD must be supplied via the environment;
 * in development a clearly-announced local account is created so the app is
 * usable immediately.
 */
export async function ensureAdmin(): Promise<{ created: boolean; email?: string }> {
  const existing = await queryOne<{ id: string }>("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
  if (existing) return { created: false };

  let email = config.adminEmail;
  let password = config.adminPassword;

  if (!email || !password) {
    if (config.isProduction) {
      console.error(
        '[bootstrap] No administrator exists. Set ADMIN_EMAIL and ADMIN_PASSWORD and restart.',
      );
      return { created: false };
    }
    email = 'admin@ksitm.edu.ng';
    password = 'KsitmAdmin123!';
    console.warn(
      `[bootstrap] Created the local development administrator ${email} with password "${password}". ` +
        'Set ADMIN_EMAIL/ADMIN_PASSWORD for any real deployment.',
    );
  }

  const id = newId();
  await execute(
    `INSERT INTO users (id, email, password_hash, role, first_name, last_name)
     VALUES ($1, $2, $3, 'admin', 'System', 'Administrator')
     ON CONFLICT (email) DO NOTHING`,
    [id, email.toLowerCase(), await hashPassword(password)],
  );
  const user = await queryOne<{ id: string }>('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
  if (user) {
    await execute("UPDATE users SET role = 'admin', is_active = true WHERE id = $1", [user.id]);
    await execute(
      `INSERT INTO staff_profiles (user_id, staff_id) VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING`,
      [user.id, 'KSITM/ADMIN/0001'],
    );
  }
  return { created: true, email: email.toLowerCase() };
}

export async function bootstrap(): Promise<void> {
  const added = await seedDepartments();
  if (added > 0) console.log(`[bootstrap] Seeded ${added} departments.`);
  await ensureAdmin();
}
