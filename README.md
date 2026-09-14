# KSITM Super App

Full-stack platform for **Katsina State Institute of Technology & Management**: student portal,
LMS, attendance, assignments & grading, community feed, Innovation Hub, study rooms, direct
messages, notifications, an AI tutor, and staff/administration dashboards.

The repository was originally a **frontend-only** Google AI Studio export in which every screen
was driven by hard-coded arrays. It is now a real client/server application: a React 19 + Vite
single-page app talking to an Express 5 + PostgreSQL API, with database-backed sessions,
role-based authorisation, and file/QR/AI features implemented server-side.

```
web/     React 19 + Vite + TypeScript SPA (Tailwind via CDN, original design preserved)
server/  Express 5 + TypeScript API, hand-written SQL, PostgreSQL (managed or embedded)
```

---

## 1. Architecture

### Backend & database — Express 5 + PostgreSQL, and why

| Decision | Rationale |
| --- | --- |
| **Node.js + Express 5 + TypeScript** | The team already writes TypeScript; one language across the repo, one deployable unit. Express is minimal and boring, which keeps the code reviewable. |
| **PostgreSQL behind a 6-function data layer** (`query`, `queryOne`, `execute`, `execMany`, `transaction`, `closeDatabase`) | The domain is deeply relational (courses ↔ enrolments ↔ topics ↔ progress ↔ results; conversations ↔ messages; moderation queues). Hand-written SQL in numbered migrations keeps the schema explicit and portable. |
| **Two interchangeable drivers** — managed PostgreSQL via `DATABASE_URL`, or **embedded PostgreSQL (PGlite)** via `PGDATA_DIR` | Real deployments get a managed database with zero code change. Local development, CI and this sandbox (no Postgres/Docker available) get a genuine PostgreSQL 18 engine writing to disk — **not** a mock and not localStorage. Same migrations, same SQL, both paths. |
| **Numbered SQL migrations** in `server/migrations`, tracked in `schema_migrations`, applied at boot | No ORM binary downloads (Prisma's engine CDN is unreachable in restricted networks), fully reproducible schema. |
| **One Node process serves `/api` *and* the built SPA** (`web/dist`) with a history fallback | One container, one origin: no CORS, no cookie/domain problems, trivial to deploy anywhere Node runs. |
| **Uploads stored as `bytea` and served from `/api/files/:id`** | No object-storage dependency or credentials to configure; authorisation is enforced on download. Swap in S3 later behind `services/files.ts`. |
| **QR codes generated server-side (`qrcode`), decoded on-device (`jsqr`)** | Attendance codes never live in client code; scanning works offline in the browser with a manual-entry fallback. |
| **Gemini called server-side only** | The API key is never shipped to the browser. Without a key the tutor reports "not configured" and the rest of the app is unaffected. |

### Authentication & sessions

- **Password hashing:** bcrypt (cost 12).
- **Sessions:** opaque 256-bit token, stored in the `sessions` table **as a SHA-256 hash**, delivered in an
  `HttpOnly`, `SameSite=Lax`, `Secure`-in-production cookie (`ksitm.sid`). 7-day sliding expiry,
  revoked on logout, expired rows swept hourly. A page refresh restores the session from the cookie.
- **Login portals:** `student` and `staff`. A student cannot sign in through the staff portal and vice-versa.
- **Roles:** `student | lecturer | hod | admin`, enforced per route (`requireRole`) and per record
  (department/ownership checks in `services/access.ts`). Staff self-register as `lecturer`; ticking
  "Head of Department" only *requests* the role, which an admin approves through the moderation queue —
  self-elevation is impossible.
- **Hardening:** rate limiting on auth endpoints, Origin/host check on every write (CSRF), JSON body
  limits tied to the upload limit, `X-Content-Type-Options`/`Referrer-Policy`/`X-Frame-Options`,
  and a single central error handler that never leaks stack traces.

### Project layout

```
server/
  migrations/0001_init.sql        canonical schema (32 tables)
  src/
    config.ts                     every setting from the environment
    db/                           drivers (pg + PGlite), migrations, bootstrap
    auth/                         passwords, sessions, middleware, permissions
    http/                         errors, zod validation, rate limits, origin guard
    services/                     files, notifications, grades, users, access, moderation
    routes/                       auth, courses, assignments, announcements, posts, projects,
                                  communities, rooms, messages, notifications, attendance,
                                  moderation, admin, search, files, ai
    scripts/                      migrate.ts, seedDemo.ts
  test/e2e.ts                     black-box suite (163 assertions) over real HTTP
web/
  src/lib/                        api client, hooks (useResource/useAction/usePolling), formatters
  src/state/AuthContext.tsx       session restore, login, register, logout
  src/components/                 ui kit, camera/QR capture, digital ID, search, messages,
                                  notifications, study room
  src/views/                      RoleSelection, Auth, StudentDashboard, AdminDashboard, LMS,
                                  CourseDetail, Assignments, Community, Profile, AITutor
  src/App.tsx                     hash router, role-based navigation, overlays, dark mode
```

---

## 2. Running it

### Prerequisites
Node.js 20+ (developed on Node 22). No database install required.

```bash
npm install
cp .env.example .env          # optional: everything has a development default
npm run dev                   # API on :4000 + Vite on :5173 (proxies /api)
```

Open the Vite URL. On first boot the server creates the schema, seeds the 18 real KSITM
departments, and creates a development admin (`admin@ksitm.edu.ng` / `KsitmAdmin123!`) — this
fallback exists **only** when `NODE_ENV` is not `production`.

Optional demo data (a department, courses, students, posts, projects, announcements):

```bash
npm run db:seed:demo
# HOD       a.kano@ksitm.edu.ng            / KsitmDemo123!
# Lecturer  i.musa@ksitm.edu.ng            / KsitmDemo123!
# Students  u.abdullahi@student.ksitm.edu.ng, z.yusuf@…, m.ibrahim@… / KsitmDemo123!
```

### Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | API (tsx watch) + Vite dev server |
| `npm run build` | Type-checks and builds `web/dist` and `server/dist` |
| `npm start` | Production: one Node process serving the API **and** the built SPA |
| `npm test` | End-to-end suite: boots the API on a random port and drives it over HTTP |
| `npm run test:ui` | UI contract replay: every screen's request sequence + response keys (needs `npm run dev` and the demo seed) |
| `npm run typecheck` | TypeScript for both workspaces |
| `npm run db:migrate` | Apply migrations only |
| `npm run db:seed:demo` | Insert demo rows |

---

## 3. Configuration

Every secret and setting comes from the environment — see [`.env.example`](.env.example) for the
annotated list. The important ones:

| Variable | Required | Purpose |
| --- | --- | --- |
| `SESSION_SECRET` | **production** | Signs/identifies sessions; the server refuses to boot without it in production |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | **production** | Bootstrap administrator |
| `STAFF_ACCESS_CODE` | **production** | Shared code that unlocks staff registration (verified server-side) |
| `DATABASE_URL` | recommended | Managed PostgreSQL; omit to use embedded PostgreSQL |
| `PGDATA_DIR` | no | Data directory for embedded PostgreSQL (default `server/.pgdata`) |
| `GEMINI_API_KEY` | no | Enables the AI tutor |
| `ALLOWED_EMAIL_DOMAINS` | no | Defaults to `ksitm.edu.ng` |
| `COOKIE_SECURE` / `COOKIE_DOMAIN` | no | HTTPS cookie flags |
| `ALLOWED_ORIGINS` | no | Only when the SPA is hosted on a different origin than the API |
| `MAX_UPLOAD_BYTES`, `SESSION_TTL_DAYS`, `SESSION_LABEL`, `PUBLIC_DIR`, `CLIENT_URL` | no | Tuning |

---

## 4. Deployment

### Any Node host (Render, Railway, Fly.io, a VPS…)

```bash
npm ci
npm run build
NODE_ENV=production SESSION_SECRET=… ADMIN_EMAIL=… ADMIN_PASSWORD=… \
STAFF_ACCESS_CODE=… DATABASE_URL=postgres://… npm start
```

The process serves `/api/*` and the SPA from one port — point your reverse proxy at it and
terminate TLS in front. Migrations run automatically at boot.

### Docker

```bash
docker build -t ksitm-app .
docker run -p 4000:4000 \
  -e NODE_ENV=production -e SESSION_SECRET=… -e ADMIN_EMAIL=… -e ADMIN_PASSWORD=… \
  -e STAFF_ACCESS_CODE=… -e DATABASE_URL=postgres://… ksitm-app
```

The image builds the SPA and the API, then runs `node server/dist/index.js` as a non-root user.

### Managed database

Set `DATABASE_URL` (Neon, Supabase, RDS…). PostgreSQL 12+ is required. Without it the app uses
embedded PostgreSQL in `PGDATA_DIR` — fine for a pilot, but attach a managed database (or a
mounted volume) before real use so data survives redeploys.

---

## 5. What users can do, by role

| Area | Student | Lecturer | HOD | Admin |
| --- | --- | --- | --- | --- |
| Dashboard, digital ID card, attendance scan | ✅ | — | — | — |
| Courses, topics, progress, materials | ✅ (own enrolments) | ✅ (own department) | ✅ | ✅ |
| Create/edit courses, topics, timetables | — | ✅ | ✅ | ✅ |
| Assignments: submit | ✅ | — | — | — |
| Assignments: create, grade, publish results | — | ✅ | ✅ | ✅ |
| Announcements | read | create (own dept.) | create + approve | create + approve |
| Materials / announcements / projects / HOD requests | submit projects | submit | **approve** | **approve** |
| Student directory | — | — | own department | all |
| User management (disable, promote) | — | — | — | ✅ |
| Community feed, groups, study rooms, DMs, Innovation Hub | ✅ | ✅ | ✅ | ✅ |
| AI tutor | ✅ | ✅ | ✅ | ✅ |

Cross-department and cross-user access is rejected server-side (e.g. a lecturer from another
department gets `404`/`403` on a course they do not manage).

---

## 6. From mocks to real behaviour

Everything below was hard-coded in the original export and is now backed by the database:

| Before | After |
| --- | --- |
| `MOCK_PROFILE`, `MOCK_ADMIN_PROFILE` | `users` + `student_profiles`/`staff_profiles`; `/api/auth/me` |
| `MOCK_ALL_STUDENTS` (fabricated CGPA) | Real enrolments; **CGPA computed** from `course_results` (Σ points×units ÷ Σ units) |
| Fabricated streak / next class | Streak from consecutive UTC days in `attendance_records`; next class from `course_schedules` |
| `MOCK_COURSES`, `MOCK_ANNOUNCEMENTS`, `MOCK_POSTS`, `MOCK_PROJECTS`, `MOCK_COMMUNITIES`, `MOCK_STUDY_ROOMS`, `MOCK_CHATS`, `MOCK_MESSAGES`, `MOCK_ASSIGNMENTS`, `MOCK_SUBMISSIONS`, `MOCK_PENDING_CONTENT` | Real tables with CRUD, pagination-free but scoped queries, live counters |
| `ADMIN_VERIFICATION_CODE = 'STF-KSITM-2025'` in client code | `STAFF_ACCESS_CODE` verified by `POST /api/auth/verify-access-code` |
| Fake auth (`setTimeout` e-mail "verification", login ignored the password, `isHOD = email.includes('hod')`) | bcrypt + DB sessions + role column + moderated HOD promotion |
| Attendance `alert('Attendance Marked!')` | QR generated per session, scanned with `jsqr`, `POST /api/attendance/mark` with duplicate/expiry checks |
| Static QR image + `api.qrserver.com` | Server-rendered PNG (`/api/auth/id-card.png`, `/api/attendance/sessions/:id/qr.png`) |
| Browser-side Gemini call with the key in the bundle | Server-side proxy; key never leaves the server |
| Client-side `GlobalSearch` over mock arrays | `GET /api/search` across courses, announcements, posts, projects and people |
| `Sign Out` = `window.location.reload()` | `POST /api/auth/logout` revokes the session row and clears the cookie |

The only value kept from the original file is the KSITM logo URL and the real department/level
reference data (ND, NID and Short Course programmes), which is seeded into the `departments` table.

---

## 7. Verification

Run yourself:

```bash
npm run typecheck   # web + server, strict, no errors
npm run build       # vite build + tsc emit
npm test            # 163 end-to-end assertions
```

Current results in this repository:

- `npm test` → **Passed: 163, Failed: 0** (registration/validation, sessions, authorisation,
  moderation & promotion, courses/LMS/progress, materials, announcements, assignments →
  submissions → grading → CGPA, feed, projects, communities, study rooms, DMs, attendance QR +
  streak + summary, notifications, search, dashboards, profile, AI tutor via a stub, routing).
- `npm run typecheck` → clean for both workspaces.
- `npm run build` → `web/dist` (≈492 kB JS, 149 kB gzipped) + `server/dist`.
- Production smoke test: one process on `:4321` served the SPA shell, deep links, hashed assets,
  `/api/health`, and 404 JSON for unknown API routes.
- `npm run test:ui` — the **UI contract replay** (`server/test/ui-contract.mjs`) drives the exact
  HTTP sequence of every screen (student, lecturer, admin) through the Vite proxy and asserts the
  JSON keys each component reads: **60/60 checks passed**, in both dev-proxy and
  production-bundle mode. It also covers registration with an avatar upload, session restore,
  logout invalidation, and the admin directory.

---

## 8. Known limitations / before launch

1. **Tailwind is loaded from the CDN** (`web/index.html`) to preserve the original design exactly.
   Move it to a PostCSS/Tailwind build step for offline installs and smaller payloads. The KSITM
   logo is likewise fetched from its existing host, but the `<Logo/>` component swaps in a local
   badge if that host is unreachable. Default avatars are generated server-side as inline SVG, so
   no external image service is required.
2. **Rate limits and the session sweep are in-process.** Behind more than one replica, move them to
   Redis (or the database).
3. **File storage is in-database `bytea`.** Fine for documents/avatars; move to object storage for
   large media.
4. **No automated browser tests.** The flows are covered over HTTP; adding Playwright smoke tests
   would catch styling/DOM regressions.
5. **E-mail verification is not sent.** Registration is immediate; an SMTP provider is needed if the
   institute wants verified addresses.
6. **Study-room whiteboards are per-device.** Boards are not broadcast over WebSockets; the room
   membership, chat and lifecycle are real.
7. **Production prerequisites:** `SESSION_SECRET`, `ADMIN_EMAIL`/`ADMIN_PASSWORD`,
   `STAFF_ACCESS_CODE`, a managed `DATABASE_URL`, HTTPS in front of the app, and a backup policy
   for the database.
