/**
 * End-to-end API test suite.
 *
 * Boots the real Express server against a throw-away database, then drives every
 * major user flow over HTTP exactly like the frontend does (cookies and all).
 *
 *   npm test
 */
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = path.resolve(HERE, '..');

// Randomised so a previous run can never be mistaken for this one.
const PORT = 4200 + Math.floor(Math.random() * 600);
const BASE = `http://127.0.0.1:${PORT}`;
const STUB_PORT = PORT + 1;
const PASSWORD = 'KsitmTest1234';

// ---------------------------------------------------------------------------
// Tiny assertion harness
// ---------------------------------------------------------------------------
let passed = 0;
const failures: string[] = [];
let currentGroup = '';

function group(name: string): void {
  currentGroup = name;
  console.log(`\n── ${name}`);
}

function check(label: string, condition: boolean, extra?: unknown): void {
  if (condition) {
    passed += 1;
    console.log(`   ✓ ${label}`);
  } else {
    failures.push(`${currentGroup} › ${label}${extra === undefined ? '' : ` (${JSON.stringify(extra)})`}`);
    console.log(`   ✗ ${label}${extra === undefined ? '' : ` → ${JSON.stringify(extra)}`}`);
  }
}

function eq<T>(label: string, actual: T, expected: T): void {
  check(label, actual === expected, { actual, expected });
}

/** Status assertion that prints the API error body when it fails. */
function expectStatus(label: string, res: { status: number; data: any }, expected: number): void {
  if (res.status === expected) {
    passed += 1;
    console.log(`   ✓ ${label}`);
  } else {
    failures.push(`${currentGroup} › ${label} (expected ${expected}, got ${res.status})`);
    console.log(`   ✗ ${label} → expected ${expected}, got ${res.status}: ${JSON.stringify(res.data)?.slice(0, 300)}`);
  }
}

// ---------------------------------------------------------------------------
// HTTP client with a cookie jar (mirrors browser session behaviour)
// ---------------------------------------------------------------------------
class Client {
  name: string;
  cookies = new Map<string, string>();
  lastStatus = 0;

  constructor(name: string) {
    this.name = name;
  }

  private cookieHeader(): string {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  private storeCookies(res: Response): void {
    const raw = res.headers.getSetCookie?.() ?? [];
    for (const cookie of raw) {
      const [pair] = cookie.split(';');
      const idx = pair.indexOf('=');
      const key = pair.slice(0, idx).trim();
      const value = pair.slice(idx + 1).trim();
      if (value === '' || /expires=Thu, 01 Jan 1970/i.test(cookie)) this.cookies.delete(key);
      else this.cookies.set(key, value);
    }
  }

  async request(method: string, url: string, body?: unknown): Promise<{ status: number; data: any; raw: Response }> {
    const res = await fetch(`${BASE}${url}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(this.cookies.size ? { Cookie: this.cookieHeader() } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    this.lastStatus = res.status;
    this.storeCookies(res);
    const text = await res.text();
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    return { status: res.status, data, raw: res };
  }

  get(url: string) {
    return this.request('GET', url);
  }
  post(url: string, body?: unknown) {
    return this.request('POST', url, body ?? {});
  }
  patch(url: string, body?: unknown) {
    return this.request('PATCH', url, body ?? {});
  }
  del(url: string) {
    return this.request('DELETE', url);
  }
}

const tinyPng =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const fakePdf = Buffer.from('%PDF-1.4 fake submission content for the e2e suite\n').toString('base64');

// ---------------------------------------------------------------------------
// Server lifecycle
// ---------------------------------------------------------------------------
async function waitForHealth(timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error('API did not become healthy in time');
}

async function main(): Promise<void> {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ksitm-e2e-'));

  // Stub Gemini endpoint so the AI routes are exercised for real.
  const stub = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: `stub-reply:${body.length > 0}` }] } }],
        }),
      );
    });
  });
  await new Promise<void>((r) => stub.listen(STUB_PORT, '127.0.0.1', r));

  const child: ChildProcess = spawn('npx', ['tsx', 'src/index.ts'], {
    cwd: SERVER_ROOT,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: String(PORT),
      PGDATA_DIR: dataDir,
      SESSION_SECRET: 'e2e-secret',
      STAFF_ACCESS_CODE: 'STF-KSITM-E2E',
      ADMIN_EMAIL: 'admin@ksitm.edu.ng',
      ADMIN_PASSWORD: 'KsitmAdmin123!',
      GEMINI_API_KEY: 'test-key',
      GEMINI_BASE_URL: `http://127.0.0.1:${STUB_PORT}`,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  let serverLog = '';
  child.stdout?.on('data', (d) => (serverLog += d.toString()));
  child.stderr?.on('data', (d) => (serverLog += d.toString()));

  try {
    await waitForHealth();
    // Guard against talking to a stale server left behind by an earlier run.
    const health = await (await fetch(`${BASE}/api/health`)).json();
    if (health.env !== 'test') throw new Error(`Port ${PORT} is served by another process.`);
    try {
      await runScenarios();
    } catch (err) {
      failures.push(`suite aborted early: ${(err as Error).message}`);
      console.log(`\n!! suite aborted: ${(err as Error).message}`);
    }
  } finally {
    // Kill the whole process group: `npx tsx` spawns a child that outlives npx.
    if (child.pid) {
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {
        child.kill('SIGKILL');
      }
    }
    stub.close();
    await new Promise((r) => setTimeout(r, 500));
    fs.rmSync(dataDir, { recursive: true, force: true });
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Passed: ${passed}   Failed: ${failures.length}`);
  if (failures.length) {
    console.log('\nFailures:');
    for (const f of failures) console.log(`  • ${f}`);
    console.log('\n--- server log ---\n' + serverLog.slice(-3000));
    process.exit(1);
  }
  console.log('All end-to-end flows passed.');
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------
async function runScenarios(): Promise<void> {
  const admin = new Client('admin');
  const hod = new Client('hod');
  const lecturer = new Client('lecturer');
  const otherDeptLecturer = new Client('other-lecturer');
  const student = new Client('student');
  const student2 = new Client('student2');
  const stranger = new Client('stranger');

  // --- departments -------------------------------------------------------
  group('Reference data');
  const deptRes = await admin.get('/api/auth/departments');
  expectStatus('departments endpoint returns 200', deptRes, 200);
  const csDept = deptRes.data.departments.find((d: any) => d.name === 'Computer Science');
  const eeDept = deptRes.data.departments.find(
    (d: any) => d.name === 'Electrical / Electronics Engineering Technology',
  );
  check('Computer Science department exists', Boolean(csDept));
  check('EEE department exists', Boolean(eeDept));

  // --- registration ------------------------------------------------------
  group('Registration & validation');
  const weak = await student.post('/api/auth/register', {
    portal: 'student',
    email: 'weak@ksitm.edu.ng',
    password: 'short',
    firstName: 'W',
    lastName: 'Eak',
  });
  expectStatus('weak password rejected', weak, 400);

  const badDomain = await student.post('/api/auth/register', {
    portal: 'student',
    email: 'user@gmail.com',
    password: PASSWORD,
    firstName: 'Out',
    lastName: 'Sider',
    matricNumber: 'X/1',
    departmentId: csDept.id,
    level: 'ND II',
    username: 'outsider',
    dateOfBirth: '2004-01-01',
  });
  expectStatus('non-institutional email rejected', badDomain, 400);

  const noCode = await lecturer.post('/api/auth/register', {
    portal: 'staff',
    email: 'lec@ksitm.edu.ng',
    password: PASSWORD,
    firstName: 'Ibrahim',
    lastName: 'Musa',
    staffId: 'KSITM/STAFF/100',
  });
  expectStatus('staff registration without access code rejected', noCode, 403);

  const wrongCode = await lecturer.post('/api/auth/register', {
    portal: 'staff',
    email: 'lec@ksitm.edu.ng',
    password: PASSWORD,
    firstName: 'Ibrahim',
    lastName: 'Musa',
    staffId: 'KSITM/STAFF/100',
    accessCode: 'WRONG',
  });
  expectStatus('staff registration with wrong code rejected', wrongCode, 403);

  const regLecturer = await lecturer.post('/api/auth/register', {
    portal: 'staff',
    email: 'i.musa@ksitm.edu.ng',
    password: PASSWORD,
    firstName: 'Ibrahim',
    lastName: 'Musa',
    staffId: 'KSITM/STAFF/100',
    departmentId: csDept.id,
    accessCode: 'STF-KSITM-E2E',
    avatar: `data:image/png;base64,${tinyPng}`,
  });
  expectStatus('lecturer registration succeeds', regLecturer, 201);
  eq('lecturer role is lecturer', regLecturer.data.user.role, 'lecturer');
  check('avatar was stored and served', String(regLecturer.data.user.avatarUrl).startsWith('/api/files/'));

  const regHod = await hod.post('/api/auth/register', {
    portal: 'staff',
    email: 'a.kano@ksitm.edu.ng',
    password: PASSWORD,
    firstName: 'Aminu',
    lastName: 'Kano',
    staffId: 'KSITM/STAFF/001',
    departmentId: csDept.id,
    accessCode: 'STF-KSITM-E2E',
    isHOD: true,
  });
  expectStatus('HOD registration succeeds', regHod, 201);
  eq('self-declared HOD is NOT privileged immediately', regHod.data.user.role, 'lecturer');

  const regStudent = await student.post('/api/auth/register', {
    portal: 'student',
    email: 'u.abdullahi@student.ksitm.edu.ng',
    password: PASSWORD,
    firstName: 'Usman',
    lastName: 'Abdullahi',
    matricNumber: 'KSITM/CS/23/045',
    departmentId: csDept.id,
    level: 'ND II',
    username: 'usman_codes',
    dateOfBirth: '2004-02-11',
  });
  expectStatus('student registration succeeds', regStudent, 201);
  eq('student role', regStudent.data.user.role, 'student');
  eq('matric number stored', regStudent.data.user.student.matricNumber, 'KSITM/CS/23/045');

  const dupEmail = await student2.post('/api/auth/register', {
    portal: 'student',
    email: 'u.abdullahi@student.ksitm.edu.ng',
    password: PASSWORD,
    firstName: 'Dup',
    lastName: 'Email',
    matricNumber: 'KSITM/CS/23/999',
    departmentId: csDept.id,
    level: 'ND I',
    username: 'dup_email',
    dateOfBirth: '2004-02-11',
  });
  expectStatus('duplicate email rejected', dupEmail, 409);

  const dupUsername = await student2.post('/api/auth/register', {
    portal: 'student',
    email: 'other@student.ksitm.edu.ng',
    password: PASSWORD,
    firstName: 'Zainab',
    lastName: 'Yusuf',
    matricNumber: 'KSITM/CS/24/050',
    departmentId: csDept.id,
    level: 'ND II',
    username: 'usman_codes',
    dateOfBirth: '2004-02-11',
  });
  expectStatus('duplicate username rejected', dupUsername, 409);

  const regStudent2 = await student2.post('/api/auth/register', {
    portal: 'student',
    email: 'z.yusuf@student.ksitm.edu.ng',
    password: PASSWORD,
    firstName: 'Zainab',
    lastName: 'Yusuf',
    matricNumber: 'KSITM/CS/24/050',
    departmentId: csDept.id,
    level: 'ND II',
    username: 'zainab_y',
    dateOfBirth: '2004-02-11',
  });
  expectStatus('second student registration succeeds', regStudent2, 201);

  const regOther = await otherDeptLecturer.post('/api/auth/register', {
    portal: 'staff',
    email: 'm.ibrahim@ksitm.edu.ng',
    password: PASSWORD,
    firstName: 'Musa',
    lastName: 'Ibrahim',
    staffId: 'KSITM/STAFF/200',
    departmentId: eeDept.id,
    accessCode: 'STF-KSITM-E2E',
  });
  expectStatus('other-department lecturer registration succeeds', regOther, 201);

  const usernameTaken = await stranger.get('/api/auth/username-available?username=usman_codes');
  eq('username availability: taken', usernameTaken.data.available, false);
  const usernameFree = await stranger.get('/api/auth/username-available?username=brand_new_name');
  eq('username availability: available', usernameFree.data.available, true);

  // --- authentication ----------------------------------------------------
  group('Authentication & sessions');
  const badLogin = await stranger.post('/api/auth/login', {
    portal: 'student',
    email: 'u.abdullahi@student.ksitm.edu.ng',
    password: 'wrong-password-1',
  });
  expectStatus('wrong password rejected', badLogin, 401);

  const wrongPortal = await stranger.post('/api/auth/login', {
    portal: 'staff',
    email: 'u.abdullahi@student.ksitm.edu.ng',
    password: PASSWORD,
  });
  expectStatus('student cannot use the staff portal', wrongPortal, 403);

  const anon = await stranger.get('/api/auth/me');
  expectStatus('anonymous /me is 401', anon, 401);

  const logoutFirst = await student.post('/api/auth/logout');
  expectStatus('logout succeeds', logoutFirst, 200);
  const afterLogout = await student.get('/api/auth/me');
  expectStatus('session invalid after logout', afterLogout, 401);

  const login = await student.post('/api/auth/login', {
    portal: 'student',
    email: 'u.abdullahi@student.ksitm.edu.ng',
    password: PASSWORD,
  });
  expectStatus('login succeeds', login, 200);
  const sessionMe = await student.get('/api/auth/me');
  eq('session cookie restores the user', sessionMe.data.user.email, 'u.abdullahi@student.ksitm.edu.ng');

  await admin.post('/api/auth/login', { portal: 'staff', email: 'admin@ksitm.edu.ng', password: 'KsitmAdmin123!' });
  eq('bootstrap admin can sign in', admin.lastStatus, 200);
  await hod.post('/api/auth/login', { portal: 'staff', email: 'a.kano@ksitm.edu.ng', password: PASSWORD });
  await lecturer.post('/api/auth/login', { portal: 'staff', email: 'i.musa@ksitm.edu.ng', password: PASSWORD });
  await otherDeptLecturer.post('/api/auth/login', {
    portal: 'staff',
    email: 'm.ibrahim@ksitm.edu.ng',
    password: PASSWORD,
  });
  await student2.post('/api/auth/login', {
    portal: 'student',
    email: 'z.yusuf@student.ksitm.edu.ng',
    password: PASSWORD,
  });

  const pwChange = await student.post('/api/auth/change-password', {
    currentPassword: 'not-my-password',
    newPassword: 'AnotherPass123',
  });
  expectStatus('password change with wrong current password rejected', pwChange, 401);

  // --- authorisation -----------------------------------------------------
  group('Authorisation');
  eq('student cannot read admin stats', (await student.get('/api/admin/stats')).status, 403);
  eq('student cannot create courses', (await student.post('/api/courses', { code: 'X', title: 'Nope', level: 'ND I' })).status, 403);
  eq('student cannot open moderation queue', (await student.get('/api/moderation')).status, 403);
  eq('lecturer cannot open moderation queue', (await lecturer.get('/api/moderation')).status, 403);
  eq('lecturer cannot list all users', (await lecturer.get('/api/admin/users')).status, 403);

  // --- HOD promotion via moderation --------------------------------------
  group('Moderation & role promotion');
  const adminQueue = await admin.get('/api/moderation');
  const hodRequest = (adminQueue.data?.items ?? []).find((i: any) => i.type === 'hod_request');
  check('HOD request landed in the approval queue', Boolean(hodRequest));
  const review = await admin.post(`/api/moderation/${hodRequest.id}/review`, {
    decision: 'approved',
    note: 'Confirmed with the registry.',
  });
  expectStatus('reviewing the HOD request succeeds', review, 200);
  await hod.post('/api/auth/login', { portal: 'staff', email: 'a.kano@ksitm.edu.ng', password: PASSWORD });
  const hodMe = await hod.get('/api/auth/me');
  eq('approved user is now an HOD', hodMe.data.user.role, 'hod');
  eq('isHOD flag exposed to the UI', hodMe.data.user.isHOD, true);

  // --- courses -----------------------------------------------------------
  group('Courses & LMS');
  const otherDeptCourse = await otherDeptLecturer.post('/api/courses', {
    code: 'EED 111',
    title: 'Engineering Drawing',
    level: 'ND I',
    topics: ['Lines', 'Projections'],
  });
  expectStatus('lecturer can create a course in their own department', otherDeptCourse, 201);

  const crossDept = await otherDeptLecturer.patch(`/api/courses/${otherDeptCourse.data.id}`, { title: 'Renamed' });
  expectStatus('lecturer can edit their own course', crossDept, 200);

  const created = await lecturer.post('/api/courses', {
    code: 'COM 311',
    title: 'Operating Systems II',
    level: 'ND II',
    description: 'Processes, memory and file systems.',
    topics: ['Process Scheduling', 'Memory Management', 'Deadlocks', 'File Systems'],
    schedules: [{ weekday: 1, startTime: '10:00', endTime: '12:00', room: 'Lab 2' }],
  });
  expectStatus('CS lecturer creates a course', created, 201);
  eq('cohort auto-enrolled', created.data.enrolledCount, 2);
  const courseId = created.data.id;

  const dupCourse = await lecturer.post('/api/courses', { code: 'COM 311', title: 'Duplicate', level: 'ND II' });
  expectStatus('duplicate course code rejected', dupCourse, 409);

  const foreignCourse = await lecturer.patch(`/api/courses/${otherDeptCourse.data.id}`, { title: 'Hijacked' });
  eq('lecturer cannot edit another department\'s course', foreignCourse.status, 403);

  const myCourses = await student.get('/api/courses');
  eq('student sees the enrolled course', myCourses.data.courses.length, 1);
  eq('course progress starts at 0', myCourses.data.courses[0].progress, 0);
  check('timetable slot computed', Boolean(myCourses.data.courses[0].nextClass));

  const detail = await student.get(`/api/courses/${courseId}`);
  expectStatus('course detail loads', detail, 200);
  eq('course has 4 topics', detail.data.topics.length, 4);

  const topicId = detail.data.topics[0].id;
  const complete = await student.post(`/api/courses/${courseId}/topics/${topicId}/complete`, { completed: true });
  expectStatus('marking a topic complete succeeds', complete, 200);
  eq('progress recalculated to 25%', complete.data.progress, 25);
  await student.post(`/api/courses/${courseId}/topics/${topicId}/complete`, { completed: false });
  const uncomplete = await student.get(`/api/courses/${courseId}`);
  eq('unmarking resets progress', uncomplete.data.topics.filter((t: any) => t.completed).length, 0);

  const notEnrolled = await student.get(`/api/courses/${otherDeptCourse.data.id}`);
  expectStatus('student cannot open a course they are not enrolled in', notEnrolled, 403);

  // --- course materials + moderation -------------------------------------
  group('Course materials & approval workflow');
  const material = await lecturer.post(`/api/courses/${courseId}/materials`, {
    title: 'Week 4 lecture notes',
    description: 'Slides covering deadlocks.',
    file: { data: `data:application/pdf;base64,${fakePdf}`, name: 'week4.pdf', mimeType: 'application/pdf' },
  });
  expectStatus('lecturer uploads material', material, 201);
  eq('material starts as pending', material.data.status, 'pending');

  const studentDetail = await student.get(`/api/courses/${courseId}`);
  eq('students do not see pending material', studentDetail.data.materials.length, 0);

  const hodQueue = await hod.get('/api/moderation');
  const materialItem = (hodQueue.data?.items ?? []).find((i: any) => i.type === 'material');
  check('material appears in the HOD queue', Boolean(materialItem));
  await hod.post(`/api/moderation/${materialItem.id}/review`, { decision: 'approved', note: 'Looks good' });

  const afterApproval = await student.get(`/api/courses/${courseId}`);
  eq('approved material is visible to students', afterApproval.data.materials.length, 1);
  const materialUrl = afterApproval.data.materials[0].fileUrl;
  const fileRes = await fetch(`${BASE}${materialUrl}`, {
    headers: { Cookie: [...student.cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ') },
  });
  expectStatus('material file downloads', fileRes, 200);
  eq('material served with the right content type', fileRes.headers.get('content-type'), 'application/pdf');
  const anonFile = await fetch(`${BASE}${materialUrl}`);
  expectStatus('files require authentication', anonFile, 401);

  // --- assignments -------------------------------------------------------
  group('Assignments, submissions & grading');
  const pastDeadline = new Date(Date.now() - 86400000).toISOString();
  const lateAssignment = await lecturer.post('/api/assignments', {
    courseId,
    title: 'ER Diagram for Hospital System',
    description: 'Design an ER diagram and submit a PDF.',
    deadline: pastDeadline,
  });
  expectStatus('lecturer creates an assignment', lateAssignment, 201);

  const invalidAssignment = await lecturer.post('/api/assignments', {
    courseId,
    title: 'No deadline',
    description: 'x',
    deadline: 'not-a-date',
  });
  expectStatus('invalid deadline rejected', invalidAssignment, 400);

  const foreignAssignment = await lecturer.post('/api/assignments', {
    courseId: otherDeptCourse.data.id,
    title: 'Foreign',
    description: 'x',
    deadline: new Date(Date.now() + 86400000).toISOString(),
  });
  eq('cannot create an assignment on another department\'s course', foreignAssignment.status, 403);

  const pending = await student.get('/api/assignments?view=pending');
  eq('student sees the pending assignment', pending.data.assignments.length, 1);
  eq('overdue flag computed server-side', pending.data.assignments[0].isOverdue, true);
  const assignmentId = pending.data.assignments[0].id;

  const submit = await student.post(`/api/assignments/${assignmentId}/submissions`, {
    note: 'Submitted with an ER diagram.',
    file: { data: `data:application/pdf;base64,${fakePdf}`, name: 'hospital.pdf', mimeType: 'application/pdf' },
  });
  expectStatus('student submits work', submit, 201);
  eq('late submission detected', submit.data.isLate, true);

  const submittedTab = await student.get('/api/assignments?view=submitted');
  eq('submission appears in the submitted tab', submittedTab.data.assignments.length, 1);
  const pendingAfter = await student.get('/api/assignments?view=pending');
  eq('submitted work leaves the pending tab', pendingAfter.data.assignments.length, 0);

  const otherStudentPending = await student2.get('/api/assignments?view=pending');
  eq('other student still sees it as pending', otherStudentPending.data.assignments.length, 1);

  const studentSeesSubmissions = await student.get(`/api/assignments/${assignmentId}/submissions`);
  expectStatus('students cannot list submissions', studentSeesSubmissions, 403);

  const submissions = await lecturer.get(`/api/assignments/${assignmentId}/submissions`);
  eq('lecturer lists submissions', submissions.data.submissions.length, 1);
  const submissionId = submissions.data.submissions[0].id;

  const badGrade = await lecturer.post(`/api/assignments/${assignmentId}/submissions/${submissionId}/grade`, {
    score: 500,
  });
  expectStatus('score above max rejected', badGrade, 400);

  const grade = await lecturer.post(`/api/assignments/${assignmentId}/submissions/${submissionId}/grade`, {
    score: 82,
    remark: 'Good work on the relationships.',
  });
  expectStatus('lecturer grades the submission', grade, 200);

  const graded = await student.get(`/api/assignments/${assignmentId}`);
  eq('student sees the grade', graded.data.assignment.submission.score, 82);
  eq('student sees the remark', graded.data.assignment.submission.remark, 'Good work on the relationships.');

  const replaceGraded = await student.post(`/api/assignments/${assignmentId}/submissions`, { note: 'try again' });
  expectStatus('graded submission cannot be replaced', replaceGraded, 409);

  // --- results & CGPA ----------------------------------------------------
  group('Results & CGPA');
  const roster = await lecturer.get(`/api/courses/${courseId}/students`);
  eq('lecturer sees the roster', roster.data.students.length, 2);
  const result = await lecturer.post(`/api/courses/${courseId}/results`, {
    studentId: regStudent.data.user.id,
    score: 78,
  });
  expectStatus('lecturer records a result', result, 200);
  eq('grade derived from the score', result.data.grade, 'A');
  const meAfterResult = await student.get('/api/auth/me');
  eq('CGPA computed from results', meAfterResult.data.user.student.cgpa, 4);

  // --- announcements -----------------------------------------------------
  group('Announcements');
  const emptyAnnouncement = await lecturer.post('/api/announcements', { title: 'x', content: 'y' });
  expectStatus('short announcement rejected', emptyAnnouncement, 400);

  const lecturerAnnouncement = await lecturer.post('/api/announcements', {
    title: 'COM 311 revision class',
    content: 'We will hold an extra revision class on Friday at 2pm in Lab 2.',
    type: 'academic',
  });
  expectStatus('lecturer announcement created', lecturerAnnouncement, 201);
  eq('lecturer announcement awaits approval', lecturerAnnouncement.data.status, 'pending');
  const feedBefore = await student.get('/api/announcements');
  eq('students do not see pending announcements', feedBefore.data.announcements.length, 0);

  const announcementItem = ((await hod.get('/api/moderation')).data?.items ?? []).find((i: any) => i.type === 'announcement');
  await hod.post(`/api/moderation/${announcementItem.id}/review`, { decision: 'approved' });
  const feedAfter = await student.get('/api/announcements');
  eq('approved announcement reaches students', feedAfter.data.announcements.length, 1);

  const hodAnnouncement = await hod.post('/api/announcements', {
    title: 'Semester exam timetable',
    content: 'The draft timetable has been released on the notice board.',
    type: 'urgent',
  });
  eq('HOD announcement publishes immediately', hodAnnouncement.data.status, 'published');
  const feedBoth = await student.get('/api/announcements');
  eq('both announcements visible', feedBoth.data.announcements.length, 2);

  const deleteOthers = await lecturer.del(`/api/announcements/${hodAnnouncement.data.id}`);
  eq('lecturer cannot delete another author\'s announcement', deleteOthers.status, 403);

  // --- community feed ----------------------------------------------------
  group('Community feed');
  const emptyPost = await student.post('/api/posts', { content: '' });
  expectStatus('empty post rejected', emptyPost, 400);

  const post = await student.post('/api/posts', {
    content: 'Finished the robotics prototype 🚀 #KSITM',
    image: { data: `data:image/png;base64,${tinyPng}`, mimeType: 'image/png' },
  });
  expectStatus('student publishes a post', post, 201);
  check('post image uploaded', Boolean(post.data.post.imageUrl));
  const postId = post.data.id;

  const feed = await student2.get('/api/posts');
  eq('post appears in another user\'s feed', feed.data.posts.length, 1);
  eq('post starts with zero likes', feed.data.posts[0].likeCount, 0);

  const like = await student2.post(`/api/posts/${postId}/like`);
  eq('like recorded', like.data.liked, true);
  eq('like count incremented', like.data.likeCount, 1);
  const unlike = await student2.post(`/api/posts/${postId}/like`);
  eq('unlike works', unlike.data.liked, false);
  await student2.post(`/api/posts/${postId}/like`);

  const comment = await student2.post(`/api/posts/${postId}/comments`, { content: 'Congrats! When is the demo?' });
  expectStatus('comment added', comment, 201);
  eq('comment count incremented', comment.data.commentCount, 1);
  const comments = await student.get(`/api/posts/${postId}/comments`);
  eq('comments are readable', comments.data.comments.length, 1);

  const foreignDelete = await student2.del(`/api/posts/${postId}`);
  eq('cannot delete someone else\'s post', foreignDelete.status, 403);
  const ownDelete = await student.del(`/api/posts/${postId}`);
  expectStatus('author can delete their own post', ownDelete, 200);
  const feedAfterDelete = await student2.get('/api/posts');
  eq('feed is empty after deletion', feedAfterDelete.data.posts.length, 0);

  // --- innovation hub ----------------------------------------------------
  group('Innovation Hub');
  const project = await student.post('/api/projects', {
    title: 'Solar Powered Attendance',
    description: 'RFID + solar attendance system for rural schools in Katsina.',
    category: 'IoT',
  });
  expectStatus('project submitted', project, 201);
  eq('project starts as pending', project.data.status, 'pending');
  const projectsHidden = await student2.get('/api/projects');
  eq('pending project hidden from other students', projectsHidden.data.projects.length, 0);
  const projectItem = ((await hod.get('/api/moderation')).data?.items ?? []).find((i: any) => i.type === 'project');
  await hod.post(`/api/moderation/${projectItem.id}/review`, { decision: 'approved' });
  const projectsVisible = await student2.get('/api/projects');
  eq('approved project visible campus-wide', projectsVisible.data.projects.length, 1);
  const vote = await student2.post(`/api/projects/${projectsVisible.data.projects[0].id}/vote`);
  eq('vote recorded', vote.data.voted, true);
  eq('vote count incremented', vote.data.voteCount, 1);

  // --- communities & study rooms -----------------------------------------
  group('Communities & study rooms');
  const community = await student.post('/api/communities', {
    name: 'Software Devs',
    icon: '💻',
    description: 'Coding, web and mobile.',
  });
  expectStatus('community created', community, 201);
  await student2.post(`/api/communities/${community.data.id}/join`);
  const communities = await student2.get('/api/communities');
  eq('member count is real', communities.data.communities[0].memberCount, 2);
  eq('membership recorded', communities.data.communities[0].joined, true);
  await student2.del(`/api/communities/${community.data.id}/join`);
  const afterLeave = await student2.get('/api/communities');
  eq('leaving updates the count', afterLeave.data.communities[0].memberCount, 1);

  const room = await student.post('/api/rooms', { title: 'Calculus Revision', topic: 'Math' });
  expectStatus('study room created', room, 201);
  const join = await student2.post(`/api/rooms/${room.data.id}/join`);
  eq('joining a room works', join.data.participantCount, 2);
  check('room conversation provisioned', Boolean(join.data.conversationId));
  const roomMessages = await student2.post(`/api/conversations/${join.data.conversationId}/messages`, {
    body: 'Starting in 5 minutes!',
  });
  expectStatus('room message posted', roomMessages, 201);
  const roomThread = await student.get(`/api/conversations/${join.data.conversationId}/messages`);
  eq('host sees the room message', roomThread.data.messages.length, 1);
  await student2.del(`/api/rooms/${room.data.id}/join`);
  const rooms = await student.get('/api/rooms');
  eq('participant count drops after leaving', rooms.data.rooms[0].participantCount, 1);
  await student.post(`/api/rooms/${room.data.id}/close`);
  const closedJoin = await student2.post(`/api/rooms/${room.data.id}/join`);
  expectStatus('closed room cannot be joined', closedJoin, 403);

  // --- direct messages ---------------------------------------------------
  group('Direct messages');
  const dm = await student.post('/api/conversations/direct', { userId: regStudent2.data.user.id });
  expectStatus('direct conversation created', dm, 201);
  await student.post(`/api/conversations/${dm.data.id}/messages`, { body: 'Did you submit the assignment?' });
  const inbox = await student2.get('/api/conversations');
  eq('recipient sees the conversation', inbox.data.conversations.length >= 1, true);
  eq('unread count computed', inbox.data.totalUnread >= 1, true);
  const thread = await student2.get(`/api/conversations/${dm.data.id}/messages`);
  eq('recipient reads the message', thread.data.messages.length, 1);
  await student2.post(`/api/conversations/${dm.data.id}/read`);
  const inboxAfter = await student2.get('/api/conversations');
  const dmRow = inboxAfter.data.conversations.find((c: any) => c.id === dm.data.id);
  eq('marking as read clears the badge', dmRow.unread, 0);
  const outsiderDm = await stranger.get(`/api/conversations/${dm.data.id}/messages`);
  eq('non-members cannot read a conversation', [401, 403].includes(outsiderDm.status), true);

  // --- attendance --------------------------------------------------------
  group('Attendance');
  const attendance = await lecturer.post('/api/attendance/sessions', { courseId, durationMinutes: 10 });
  expectStatus('lecturer opens an attendance window', attendance, 201);
  eq('attendance code generated', attendance.data.code.length, 6);
  const qrRes = await fetch(`${BASE}/api/attendance/sessions/${attendance.data.id}/qr.png`, {
    headers: { Cookie: [...lecturer.cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ') },
  });
  expectStatus('QR image renders', qrRes, 200);
  const qrBytes = Buffer.from(await qrRes.arrayBuffer());
  check('QR payload is a PNG', qrBytes.subarray(1, 4).toString() === 'PNG');

  const badCode = await student.post('/api/attendance/mark', { code: 'NOPE12' });
  expectStatus('invalid code rejected', badCode, 404);
  const mark = await student.post('/api/attendance/mark', { code: attendance.data.qrPayload });
  expectStatus('student marks attendance from the QR payload', mark, 201);
  const dupe = await student.post('/api/attendance/mark', { code: attendance.data.code });
  expectStatus('duplicate attendance rejected', dupe, 409);
  const streak = await student.get('/api/auth/me');
  eq('attendance streak updated', streak.data.user.student.streak, 1);
  const summary = await lecturer.get(`/api/attendance/summary?courseId=${courseId}`);
  eq('lecturer sees the attendance summary', summary.data.students[0].attended, 1);

  // --- notifications -----------------------------------------------------
  group('Notifications');
  const notes = await student.get('/api/notifications');
  check('student received notifications', notes.data.notifications.length > 0, notes.data.notifications.length);
  check('unread badge is non-zero', notes.data.unread > 0);
  const readAll = await student.post('/api/notifications/read', {});
  eq('marking all read clears the badge', readAll.data.unread, 0);

  // --- search ------------------------------------------------------------
  group('Search');
  const search = await student.get('/api/search?q=Operating');
  eq('search finds the course', search.data.courses.length, 1);
  const searchPerson = await student.get('/api/search?q=zainab');
  eq('search finds people', searchPerson.data.people.length >= 1, true);
  const searchEmpty = await student.get('/api/search?q=a');
  eq('short query returns nothing', searchEmpty.data.courses.length, 0);

  // --- admin / HOD dashboards --------------------------------------------
  group('Dashboards & admin');
  const hodStats = await hod.get('/api/admin/stats');
  eq('HOD sees the department student count', hodStats.data.stats.students, 2);
  check('HOD sees pending moderation count', hodStats.data.stats.pendingModeration >= 0);
  const hodStudents = await hod.get('/api/admin/students');
  eq('HOD student directory scoped to department', hodStudents.data.students.length, 2);
  const searched = await hod.get('/api/admin/students?q=KSITM/CS/23');
  eq('student directory search works', searched.data.students.length, 1);

  const users = await admin.get('/api/admin/users?q=ksitm');
  check('admin can list users', users.data.users.length >= 5, users.data.users.length);

  const deactivateSelf = await admin.patch(`/api/admin/users/${(await admin.get('/api/auth/me')).data.user.id}`, {
    isActive: false,
  });
  expectStatus('admin cannot deactivate themselves', deactivateSelf, 400);

  const deactivate = await admin.patch(`/api/admin/users/${regStudent2.data.user.id}`, { isActive: false });
  expectStatus('admin can deactivate a user', deactivate, 200);
  const locked = await student2.get('/api/auth/me');
  eq('deactivated user loses access immediately', [401, 403].includes(locked.status), true);
  const reactivate = await admin.patch(`/api/admin/users/${regStudent2.data.user.id}`, { isActive: true });
  expectStatus('admin can reactivate a user', reactivate, 200);

  // --- profile management ------------------------------------------------
  group('Profile');
  const patch = await student.patch('/api/auth/me', { phone: '+234 803 000 0000', firstName: 'Usman' });
  expectStatus('profile update succeeds', patch, 200);
  eq('phone persisted', patch.data.user.phone, '+234 803 000 0000');
  const takenUsername = await student.patch('/api/auth/me', { username: 'zainab_y' });
  expectStatus('taken username rejected on profile update', takenUsername, 409);

  // --- AI ----------------------------------------------------------------
  group('AI tutor (server-side key)');
  const status = await student.get('/api/ai/status');
  eq('AI status reports enabled', status.data.enabled, true);
  const tutor = await student.post('/api/ai/tutor/message', { message: 'Explain deadlocks simply.' });
  expectStatus('tutor replies', tutor, 200);
  eq('tutor reply came from the model endpoint', tutor.data.reply, 'stub-reply:true');
  const history = await student.get('/api/ai/tutor/history');
  eq('tutor history persisted', history.data.messages.length, 2);
  const aiDesc = await lecturer.post('/api/ai/assignment-description', {
    courseCode: 'COM 311',
    title: 'Deadlock analysis',
  });
  expectStatus('AI assignment description works', aiDesc, 200);
  const studentAi = await student.post('/api/ai/assignment-description', { courseCode: 'X', title: 'nope nope' });
  expectStatus('students cannot use the staff AI helper', studentAi, 400);

  // --- static / unknown routes -------------------------------------------
  group('Routing & errors');
  const unknownApi = await student.get('/api/does-not-exist');
  expectStatus('unknown API route returns 404 JSON', unknownApi, 404);
  const malformed = await student.request('POST', '/api/posts', '{not json');
  expectStatus('malformed JSON handled', malformed, 400);
}

main().catch((err) => {
  console.error('E2E suite crashed:', err);
  process.exit(1);
});
