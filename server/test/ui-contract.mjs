/**
 * UI contract replay.
 *
 * Performs the exact HTTP sequence each React view issues — through the Vite
 * dev proxy by default, so the proxy configuration is exercised too — and
 * asserts that the JSON keys every component reads are present.
 *
 *   1. start the API and the web dev server (npm run dev)
 *   2. npm run db:seed:demo   (needs the demo accounts below)
 *   3. npm run test:ui        (or: BASE=http://host:port node server/test/ui-contract.mjs)
 *
 * Point BASE at a production bundle to verify a deployed instance instead.
 */
const BASE = process.env.BASE || 'http://127.0.0.1:5173';
let pass = 0;
const failures = [];

function ok(label, cond, detail = '') {
  if (cond) {
    pass += 1;
  } else {
    failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function client() {
  const jar = new Map();
  const call = async (method, path, body) => {
    const headers = { Origin: BASE };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (jar.size) headers.Cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    const res = await fetch(BASE + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const setCookie = res.headers.getSetCookie?.() ?? [];
    for (const c of setCookie) {
      const [pair] = c.split(';');
      const idx = pair.indexOf('=');
      jar.set(pair.slice(0, idx), pair.slice(idx + 1));
    }
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { status: res.status, body: json, raw: text, headers: res.headers };
  };
  return {
    get: (p) => call('GET', p),
    post: (p, b) => call('POST', p, b ?? {}),
    patch: (p, b) => call('PATCH', p, b ?? {}),
    del: (p) => call('DELETE', p),
    jar,
  };
};

const has = (obj, ...keys) => keys.every((k) => obj && obj[k] !== undefined);

const DEMO = 'KsitmDemo123!';

async function student() {
  const c = client();
  const login = await c.post('/api/auth/login', {
    portal: 'student',
    email: 'u.abdullahi@student.ksitm.edu.ng',
    password: DEMO,
  });
  ok('student login', login.status === 200, `status ${login.status} ${login.raw?.slice(0, 120)}`);
  const u = login.body?.user;
  ok('student user shape', has(u, 'id', 'email', 'role', 'avatarUrl', 'unreadNotifications'), JSON.stringify(u)?.slice(0, 160));
  ok('student profile block', has(u?.student, 'matricNumber', 'level', 'department', 'cgpa', 'streak', 'nextClass', 'enrolledCourses'), JSON.stringify(u?.student)?.slice(0, 200));

  // StudentDashboard
  const courses = await c.get('/api/courses?view=enrolled');
  ok('dashboard courses', courses.status === 200 && Array.isArray(courses.body?.courses), courses.raw?.slice(0, 120));
  ok('course card fields', !courses.body?.courses?.length || has(courses.body.courses[0], 'id', 'code', 'title', 'level', 'department', 'progress', 'nextClass', 'topicCount'), JSON.stringify(courses.body?.courses?.[0])?.slice(0, 240));

  const ann = await c.get('/api/announcements');
  ok('announcements list', ann.status === 200 && Array.isArray(ann.body?.announcements), ann.raw?.slice(0, 120));
  ok('announcement fields', !ann.body?.announcements?.length || has(ann.body.announcements[0], 'id', 'title', 'content', 'type', 'authorName', 'createdAt'));

  const rec = await c.get('/api/attendance/records');
  ok('attendance records', rec.status === 200 && Array.isArray(rec.body?.records), rec.raw?.slice(0, 120));

  // Community
  const posts = await c.get('/api/posts');
  ok('feed posts', posts.status === 200 && Array.isArray(posts.body?.posts), posts.raw?.slice(0, 120));
  ok('post fields', !posts.body?.posts?.length || has(posts.body.posts[0], 'id', 'content', 'authorName', 'authorAvatar', 'likeCount', 'commentCount', 'likedByMe'));
  const projects = await c.get('/api/projects');
  ok('projects', projects.status === 200 && Array.isArray(projects.body?.projects), projects.raw?.slice(0, 120));
  ok('project fields', !projects.body?.projects?.length || has(projects.body.projects[0], 'id', 'title', 'category', 'voteCount', 'votedByMe', 'status'));
  const comms = await c.get('/api/communities');
  ok('communities', comms.status === 200 && Array.isArray(comms.body?.communities), comms.raw?.slice(0, 120));
  const rooms = await c.get('/api/rooms');
  ok('study rooms', rooms.status === 200 && Array.isArray(rooms.body?.rooms), rooms.raw?.slice(0, 120));
  ok('room fields', !rooms.body?.rooms?.length || has(rooms.body.rooms[0], 'id', 'title', 'hostName', 'hostId', 'participantCount', 'joined'));

  // Assignments
  const asg = await c.get('/api/assignments?view=pending');
  ok('pending assignments', asg.status === 200 && Array.isArray(asg.body?.assignments), asg.raw?.slice(0, 120));
  const sub = await c.get('/api/assignments?view=submitted');
  ok('submitted assignments', sub.status === 200 && Array.isArray(sub.body?.assignments));

  // LMS + course detail
  if (courses.body?.courses?.length) {
    const id = courses.body.courses[0].id;
    const detail = await c.get(`/api/courses/${id}`);
    ok('course detail', detail.status === 200 && has(detail.body, 'course', 'topics', 'materials', 'schedules', 'assignments', 'canManage', 'myResult'), Object.keys(detail.body ?? {}).join(','));
    ok('course detail header fields', has(detail.body?.course, 'code', 'title', 'department', 'level', 'creditUnits'), JSON.stringify(detail.body?.course)?.slice(0, 200));
    if (detail.body?.topics?.length) {
      const t = detail.body.topics[0];
      const before = t.completedByMe;
      const toggle = await c.post(`/api/courses/${id}/topics/${t.id}/complete`, { completed: !before });
      ok('topic toggle', toggle.status === 200 && typeof toggle.body?.progress === 'number', JSON.stringify(toggle.body)?.slice(0, 160));
      const after = await c.get(`/api/courses/${id}`);
      ok('topic state persisted', after.body?.topics?.find((x) => x.id === t.id)?.completed === !before, JSON.stringify(after.body?.topics?.find((x) => x.id === t.id)));
      await c.post(`/api/courses/${id}/topics/${t.id}/complete`, { completed: before });
    }
  }

  // Search
  const search = await c.get('/api/search?q=comput');
  ok('search', search.status === 200 && has(search.body, 'courses', 'posts', 'people', 'projects', 'announcements'), Object.keys(search.body ?? {}).join(','));

  // Notifications / conversations / people
  const notif = await c.get('/api/notifications');
  ok('notifications', notif.status === 200 && Array.isArray(notif.body?.notifications) && notif.body?.unread !== undefined, notif.raw?.slice(0, 120));
  ok('notification fields', !notif.body?.notifications?.length || has(notif.body.notifications[0], 'id', 'title', 'body', 'kind', 'readAt', 'createdAt'));
  const convs = await c.get('/api/conversations');
  ok('conversations', convs.status === 200 && Array.isArray(convs.body?.conversations) && convs.body?.totalUnread !== undefined, convs.raw?.slice(0, 140));
  const people = await c.get('/api/people?q=a');
  ok('people search', people.status === 200 && Array.isArray(people.body?.people), people.raw?.slice(0, 140));

  // Digital ID + AI
  const idcard = await c.get('/api/auth/id-card.png');
  ok('id card png', idcard.status === 200 && idcard.headers.get('content-type') === 'image/png', `status ${idcard.status} type ${idcard.headers.get('content-type')}`);
  const aiStatus = await c.get('/api/ai/status');
  ok('ai status', aiStatus.status === 200 && typeof aiStatus.body?.enabled === 'boolean', aiStatus.raw?.slice(0, 120));
  const hist = await c.get('/api/ai/tutor/history');
  ok('ai history', hist.status === 200 && Array.isArray(hist.body?.messages), hist.raw?.slice(0, 120));

  // Attendance mark (student scans a code the lecturer shows)
  const markBad = await c.post('/api/attendance/mark', { code: 'NOPE12' });
  ok('bad attendance code rejected', markBad.status === 400 || markBad.status === 404, `status ${markBad.status} ${markBad.raw?.slice(0, 120)}`);

  // Profile
  const patch = await c.patch('/api/auth/me', { phone: '08030000001' });
  ok('profile update', patch.status === 200 && patch.body?.user?.phone === '08030000001', patch.raw?.slice(0, 160));
  return c;
}

async function lecturer() {
  const c = client();
  const login = await c.post('/api/auth/login', { portal: 'staff', email: 'i.musa@ksitm.edu.ng', password: DEMO });
  ok('lecturer login', login.status === 200, `status ${login.status}`);
  ok('lecturer staff block', has(login.body?.user?.staff, 'staffId', 'department', 'category'), JSON.stringify(login.body?.user?.staff)?.slice(0, 220));

  const stats = await c.get('/api/admin/stats');
  ok('staff stats', stats.status === 200 && has(stats.body?.stats, 'students', 'courses', 'enrolled', 'assignments', 'submissionsToGrade'), JSON.stringify(stats.body)?.slice(0, 200));
  const mine = await c.get('/api/moderation/mine');
  ok('my submissions', mine.status === 200 && Array.isArray(mine.body?.items), mine.raw?.slice(0, 120));
  ok('my submission fields', !mine.body?.items?.length || has(mine.body.items[0], 'id', 'type', 'title', 'details', 'submittedByName', 'status', 'createdAt'), JSON.stringify(mine.body?.items?.[0])?.slice(0, 220));
  const students = await c.get('/api/admin/students?q=a');
  ok('student directory forbidden for lecturer', students.status === 403, `status ${students.status}`);

  const courses = await c.get('/api/courses');
  ok('lecturer courses', courses.status === 200 && Array.isArray(courses.body?.courses));
  ok('staff course card fields', !courses.body?.courses?.length || has(courses.body.courses[0], 'id', 'code', 'title', 'department', 'enrolledCount'), JSON.stringify(courses.body?.courses?.[0])?.slice(0, 240));
  // Pick a course the demo student is enrolled in so the QR flow is realistic.
  const sc = client();
  await sc.post('/api/auth/login', { portal: 'student', email: 'u.abdullahi@student.ksitm.edu.ng', password: DEMO });
  const enrolled = await sc.get('/api/courses?view=enrolled');
  const enrolledId = enrolled.body?.courses?.[0]?.id;
  const target = enrolledId && courses.body?.courses?.some((x) => x.id === enrolledId)
    ? courses.body.courses.find((x) => x.id === enrolledId)
    : courses.body?.courses?.[0];
  if (target) {
    const id = target.id;
    const roster = await c.get(`/api/courses/${id}/students`);
    ok('roster', roster.status === 200 && Array.isArray(roster.body?.students), roster.raw?.slice(0, 120));
    ok('roster fields', !roster.body?.students?.length || has(roster.body.students[0], 'userId', 'name', 'matricNumber', 'avatarUrl', 'progress'), JSON.stringify(roster.body?.students?.[0])?.slice(0, 220));
    // Record a real result and confirm the grade comes back.
    if (roster.body?.students?.length) {
      const sid = roster.body.students[0].userId;
      const rec = await c.post(`/api/courses/${id}/results`, { studentId: sid, score: 72 });
      ok('record result', rec.status === 200 && rec.body?.grade === 'B' && rec.body?.points === 3.5, `${rec.status} ${rec.raw?.slice(0, 160)}`);
      const after = await c.get(`/api/courses/${id}/students`);
      ok('result visible in roster', after.body?.students?.find((x) => x.userId === sid)?.result?.score === 72, JSON.stringify(after.body?.students?.find((x) => x.userId === sid))?.slice(0, 200));
    }

    // Attendance: create session, read QR png, read records
    const session = await c.post('/api/attendance/sessions', { courseId: id, durationMinutes: 10 });
    ok('attendance session created', session.status === 201 || session.status === 200, `status ${session.status} ${session.raw?.slice(0, 160)}`);
    const sid = session.body?.id;
    if (sid) {
      const qr = await c.get(`/api/attendance/sessions/${sid}/qr.png`);
      ok('attendance qr png', qr.status === 200 && qr.headers.get('content-type') === 'image/png', `status ${qr.status}`);
      const records = await c.get(`/api/attendance/sessions/${sid}/records`);
      ok('attendance records', records.status === 200 && Array.isArray(records.body?.records), records.raw?.slice(0, 120));
      const code = session.body?.code;
      ok('session code present', typeof code === 'string' && code.length >= 4, code);
      // student marks with the real code
      const marked = await sc.post('/api/attendance/mark', { code });
      ok('student marks with real code', marked.status === 200 || marked.status === 201, `${marked.status} ${marked.raw?.slice(0, 200)}`);
      const dup = await sc.post('/api/attendance/mark', { code });
      ok('duplicate mark rejected', dup.status >= 400, `${dup.status} ${dup.raw?.slice(0, 140)}`);
      const after = await c.get(`/api/attendance/sessions/${sid}/records`);
      ok('lecturer sees the mark', (after.body?.records?.length ?? 0) >= 1, JSON.stringify(after.body)?.slice(0, 200));
    }
  }

  const asg = await c.get('/api/assignments?view=active');
  ok('staff assignments', asg.status === 200 && Array.isArray(asg.body?.assignments));
  if (asg.body?.assignments?.length) {
    const a = asg.body.assignments[0];
    const subs = await c.get(`/api/assignments/${a.id}/submissions`);
    ok('submissions list', subs.status === 200 && Array.isArray(subs.body?.submissions), subs.raw?.slice(0, 140));
    ok('submission fields', !subs.body?.submissions?.length || has(subs.body.submissions[0], 'id', 'studentName', 'submittedAt'));
  }
  const ann = await c.post('/api/announcements', { title: 'UI replay notice', content: 'Created by the contract replay.', type: 'general' });
  ok('announcement created', ann.status === 201 || ann.status === 200, `${ann.status} ${ann.raw?.slice(0, 160)}`);
}

async function admin() {
  const c = client();
  const login = await c.post('/api/auth/login', { portal: 'staff', email: 'admin@ksitm.edu.ng', password: 'KsitmAdmin123!' });
  ok('admin login', login.status === 200, `status ${login.status} ${login.raw?.slice(0, 120)}`);
  const users = await c.get('/api/admin/users');
  ok('admin user list', users.status === 200 && Array.isArray(users.body?.users), users.raw?.slice(0, 140));
  ok('admin user fields', !users.body?.users?.length || has(users.body.users[0], 'id', 'name', 'email', 'role', 'isActive'));
  const queue = await c.get('/api/moderation');
  ok('moderation queue', queue.status === 200 && Array.isArray(queue.body?.items), queue.raw?.slice(0, 140));
  const pending = queue.body?.items?.filter((i) => i.status === 'pending') ?? [];
  if (pending.length) {
    const review = await c.post(`/api/moderation/${pending[0].id}/review`, { decision: 'approved' });
    ok('approve item', review.status === 200, `${review.status} ${review.raw?.slice(0, 140)}`);
  } else {
    ok('approve item (nothing pending — skipped)', true);
  }
  const dir = await c.get('/api/admin/students?q=u');
  ok('admin directory search', dir.status === 200 && Array.isArray(dir.body?.students), dir.raw?.slice(0, 140));
}

await student();
await lecturer();
await admin();

console.log(`\nUI contract replay against ${BASE}`);
console.log(`passed: ${pass}   failed: ${failures.length}`);
for (const f of failures) console.log('  ✗ ' + f);
process.exit(failures.length ? 1 : 0);
