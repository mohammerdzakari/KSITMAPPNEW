/**
 * OPTIONAL local demo data.
 *
 * Nothing in the application depends on this — the database starts empty and the
 * UI shows proper empty states. Run it only when you want a populated instance
 * to click through:
 *
 *   npm run db:seed:demo
 *
 * Every account it creates uses the password KsitmDemo123!
 */
import { closeDatabase, execute, queryOne } from '../db/index.js';
import { runMigrations } from '../db/migrate.js';
import { bootstrap } from '../db/bootstrap.js';
import { hashPassword } from '../auth/password.js';
import { newId } from '../lib/id.js';

const PASSWORD = 'KsitmDemo123!';

async function createUser(input: {
  email: string;
  role: 'student' | 'lecturer' | 'hod';
  firstName: string;
  lastName: string;
}): Promise<string> {
  const id = newId();
  await execute(
    `INSERT INTO users (id, email, password_hash, role, first_name, last_name)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, input.email, await hashPassword(PASSWORD), input.role, input.firstName, input.lastName],
  );
  return id;
}

async function main(): Promise<void> {
  await runMigrations();
  await bootstrap();

  const cs = await queryOne<{ id: string }>("SELECT id FROM departments WHERE name = 'Computer Science'");
  const ee = await queryOne<{ id: string }>(
    "SELECT id FROM departments WHERE name = 'Electrical / Electronics Engineering Technology'",
  );
  if (!cs || !ee) throw new Error('Departments missing — run the server once first.');

  const hod = await createUser({
    email: 'a.kano@ksitm.edu.ng',
    role: 'hod',
    firstName: 'Aminu',
    lastName: 'Kano',
  });
  await execute('INSERT INTO staff_profiles (user_id, staff_id, department_id) VALUES ($1, $2, $3)', [
    hod,
    'KSITM/STAFF/0001',
    cs.id,
  ]);

  const lecturer = await createUser({
    email: 'i.musa@ksitm.edu.ng',
    role: 'lecturer',
    firstName: 'Ibrahim',
    lastName: 'Musa',
  });
  await execute('INSERT INTO staff_profiles (user_id, staff_id, department_id) VALUES ($1, $2, $3)', [
    lecturer,
    'KSITM/STAFF/0002',
    cs.id,
  ]);

  const students: { id: string; matric: string; level: string; first: string; last: string; username: string }[] = [];
  const studentSeed = [
    { email: 'u.abdullahi@student.ksitm.edu.ng', first: 'Usman', last: 'Abdullahi', matric: 'KSITM/CS/23/045', level: 'ND II', username: 'usman_codes' },
    { email: 'z.yusuf@student.ksitm.edu.ng', first: 'Zainab', last: 'Yusuf', matric: 'KSITM/CS/24/050', level: 'ND I', username: 'zainab_y' },
    { email: 'm.ibrahim@student.ksitm.edu.ng', first: 'Musa', last: 'Ibrahim', matric: 'KSITM/EE/23/012', level: 'ND II', username: 'musa_eng' },
  ];
  for (const seed of studentSeed) {
    const id = await createUser({ email: seed.email, role: 'student', firstName: seed.first, lastName: seed.last });
    const departmentId = seed.matric.includes('/EE/') ? ee.id : cs.id;
    await execute(
      `INSERT INTO student_profiles (user_id, username, matric_number, department_id, level, date_of_birth)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, seed.username, seed.matric, departmentId, seed.level, '2004-03-15'],
    );
    students.push({ id, matric: seed.matric, level: seed.level, first: seed.first, last: seed.last, username: seed.username });
  }

  const courses = [
    { code: 'COM 311', title: 'Operating Systems II', level: 'ND II', topics: ['Process Scheduling', 'Memory Management', 'Deadlocks', 'File Systems'], day: 1, start: '10:00', end: '12:00', room: 'Lab 2' },
    { code: 'COM 312', title: 'Database Design I', level: 'ND II', topics: ['Normalization', 'SQL Basics', 'ER Diagrams', 'Indexing'], day: 2, start: '14:00', end: '16:00', room: 'Lab 1' },
    { code: 'GNS 301', title: 'Use of English III', level: 'ND II', topics: ['Report Writing', 'Communication Skills', 'Speech Writing'], day: 3, start: '08:00', end: '10:00', room: 'Hall B' },
    { code: 'COM 211', title: 'Introduction to Programming', level: 'ND I', topics: ['Variables', 'Control Flow', 'Functions'], day: 1, start: '09:00', end: '11:00', room: 'Lab 3' },
  ];

  for (const course of courses) {
    const id = newId();
    await execute(
      `INSERT INTO courses (id, code, title, department_id, level, credit_units, description, created_by)
       VALUES ($1, $2, $3, $4, $5, 3, $6, $7)`,
      [id, course.code, course.title, cs.id, course.level, `Core ${course.level} module.`, lecturer],
    );
    for (let i = 0; i < course.topics.length; i += 1) {
      await execute('INSERT INTO course_topics (id, course_id, title, position) VALUES ($1, $2, $3, $4)', [
        newId(),
        id,
        course.topics[i],
        i,
      ]);
    }
    await execute(
      'INSERT INTO course_schedules (id, course_id, weekday, start_time, end_time, room) VALUES ($1, $2, $3, $4, $5, $6)',
      [newId(), id, course.day, course.start, course.end, course.room],
    );
    for (const student of students) {
      if (student.level === course.level && student.matric.includes('/CS/')) {
        await execute('INSERT INTO course_enrollments (course_id, student_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [
          id,
          student.id,
        ]);
      }
    }
    if (course.code === 'COM 311') {
      await execute(
        `INSERT INTO assignments (id, course_id, title, description, deadline, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          newId(),
          id,
          'Process Scheduling Algorithm Analysis',
          'Write a detailed report comparing Round Robin and FCFS scheduling algorithms. Include diagrams and a short conclusion.',
          new Date(Date.now() + 2 * 86400000),
          lecturer,
        ],
      );
    }
  }

  await execute(
    `INSERT INTO announcements (id, title, content, type, status, author_id, published_at)
     VALUES ($1, $2, $3, 'academic', 'published', $4, now())`,
    [
      newId(),
      'Semester Examination Timetable',
      `The draft timetable for the ${new Date().getFullYear()} examinations has been released. Check your departmental notice board for the full schedule.`,
      hod,
    ],
  );

  const communityId = newId();
  await execute('INSERT INTO communities (id, name, icon, description) VALUES ($1, $2, $3, $4)', [
    communityId,
    'Software Devs',
    '💻',
    'Coding, web and mobile development at KSITM.',
  ]);
  for (const student of students) {
    await execute('INSERT INTO community_members (community_id, user_id) VALUES ($1, $2)', [communityId, student.id]);
  }
  await execute('INSERT INTO community_members (community_id, user_id) VALUES ($1, $2)', [communityId, lecturer]);

  const postId = newId();
  await execute('INSERT INTO posts (id, author_id, content) VALUES ($1, $2, $3)', [
    postId,
    students[0].id,
    'Just finished the robotics project prototype. The Hub demo is next week! 🚀',
  ]);
  await execute('INSERT INTO post_likes (post_id, user_id) VALUES ($1, $2)', [postId, students[1].id]);

  console.log('\nDemo data created. Sign in with:');
  console.log(`  HOD       a.kano@ksitm.edu.ng      / ${PASSWORD}`);
  console.log(`  Lecturer  i.musa@ksitm.edu.ng      / ${PASSWORD}`);
  console.log(`  Student   u.abdullahi@student.ksitm.edu.ng / ${PASSWORD}`);
  console.log('');
}

main()
  .then(async () => {
    await closeDatabase();
  })
  .catch(async (err) => {
    console.error(err);
    await closeDatabase().catch(() => undefined);
    process.exit(1);
  });
