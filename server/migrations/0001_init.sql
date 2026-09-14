-- 0001_init.sql
-- KSITM Super App — initial relational schema (PostgreSQL).
-- All identifiers are application-generated UUIDs so the schema works on any
-- PostgreSQL 12+ server (including managed hosts) without extra extensions.

-- ---------------------------------------------------------------------------
-- File storage (binary blobs live in the database so the app needs no
-- external object storage or writable volume to work correctly).
-- ---------------------------------------------------------------------------
CREATE TABLE files (
  id          uuid PRIMARY KEY,
  owner_id    uuid,
  name        text NOT NULL,
  mime        text NOT NULL,
  size        integer NOT NULL CHECK (size >= 0),
  data        bytea NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Identity
-- ---------------------------------------------------------------------------
CREATE TABLE users (
  id             uuid PRIMARY KEY,
  email          text NOT NULL UNIQUE,
  password_hash  text NOT NULL,
  role           text NOT NULL CHECK (role IN ('student', 'lecturer', 'hod', 'admin')),
  first_name     text NOT NULL,
  last_name      text NOT NULL,
  avatar_file_id uuid REFERENCES files(id) ON DELETE SET NULL,
  phone          text,
  is_active      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX users_role_idx ON users(role);

ALTER TABLE files
  ADD CONSTRAINT files_owner_fkey FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL;

-- Revocable server-side sessions (cookie stores only the opaque token).
CREATE TABLE sessions (
  id          text PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  timestamptz NOT NULL,
  user_agent  text,
  ip          text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_idx ON sessions(user_id);
CREATE INDEX sessions_expiry_idx ON sessions(expires_at);

-- ---------------------------------------------------------------------------
-- Academic structure
-- ---------------------------------------------------------------------------
CREATE TABLE departments (
  id          uuid PRIMARY KEY,
  name        text NOT NULL UNIQUE,
  category    text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE student_profiles (
  user_id       uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  username      text UNIQUE,
  matric_number text NOT NULL UNIQUE,
  department_id uuid NOT NULL REFERENCES departments(id),
  level         text NOT NULL,
  date_of_birth date,
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX student_profiles_dept_idx ON student_profiles(department_id, level);

CREATE TABLE staff_profiles (
  user_id          uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  staff_id         text NOT NULL UNIQUE,
  department_id    uuid REFERENCES departments(id),
  hod_requested_at timestamptz,
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE courses (
  id            uuid PRIMARY KEY,
  code          text NOT NULL,
  title         text NOT NULL,
  department_id uuid NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  level         text NOT NULL,
  credit_units  integer NOT NULL DEFAULT 3 CHECK (credit_units > 0),
  description   text NOT NULL DEFAULT '',
  created_by    uuid REFERENCES users(id) ON DELETE SET NULL,
  is_archived   boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (department_id, code)
);
CREATE INDEX courses_dept_level_idx ON courses(department_id, level);

CREATE TABLE course_schedules (
  id         uuid PRIMARY KEY,
  course_id  uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  weekday    smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6), -- 0 = Sunday
  start_time text NOT NULL,                                     -- 'HH:MM' 24h
  end_time   text NOT NULL,
  room       text NOT NULL DEFAULT ''
);
CREATE INDEX course_schedules_course_idx ON course_schedules(course_id);

CREATE TABLE course_topics (
  id        uuid PRIMARY KEY,
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title     text NOT NULL,
  position  integer NOT NULL DEFAULT 0
);
CREATE INDEX course_topics_course_idx ON course_topics(course_id, position);

CREATE TABLE course_enrollments (
  course_id   uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  student_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (course_id, student_id)
);
CREATE INDEX course_enrollments_student_idx ON course_enrollments(student_id);

CREATE TABLE topic_progress (
  student_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic_id     uuid NOT NULL REFERENCES course_topics(id) ON DELETE CASCADE,
  completed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, topic_id)
);

CREATE TABLE course_materials (
  id          uuid PRIMARY KEY,
  course_id   uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title       text NOT NULL,
  description text NOT NULL DEFAULT '',
  file_id     uuid REFERENCES files(id) ON DELETE SET NULL,
  url         text NOT NULL DEFAULT '',
  status      text NOT NULL DEFAULT 'published' CHECK (status IN ('pending', 'published', 'rejected')),
  uploaded_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX course_materials_course_idx ON course_materials(course_id, status);

CREATE TABLE course_results (
  id            uuid PRIMARY KEY,
  student_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id     uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  session_label text NOT NULL,
  score         numeric(5,2) NOT NULL CHECK (score >= 0 AND score <= 100),
  grade         text NOT NULL,
  grade_points  numeric(3,2) NOT NULL,
  recorded_by   uuid REFERENCES users(id) ON DELETE SET NULL,
  recorded_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, course_id, session_label)
);
CREATE INDEX course_results_student_idx ON course_results(student_id);

-- ---------------------------------------------------------------------------
-- Announcements / assignments / submissions
-- ---------------------------------------------------------------------------
CREATE TABLE announcements (
  id            uuid PRIMARY KEY,
  title         text NOT NULL,
  content       text NOT NULL,
  type          text NOT NULL DEFAULT 'general' CHECK (type IN ('academic', 'general', 'urgent')),
  department_id uuid REFERENCES departments(id) ON DELETE CASCADE, -- NULL = campus wide
  status        text NOT NULL DEFAULT 'published' CHECK (status IN ('pending', 'published', 'rejected')),
  author_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  published_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX announcements_status_idx ON announcements(status, published_at DESC);

CREATE TABLE assignments (
  id                 uuid PRIMARY KEY,
  course_id          uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title              text NOT NULL,
  description        text NOT NULL DEFAULT '',
  deadline           timestamptz NOT NULL,
  max_score          integer NOT NULL DEFAULT 100 CHECK (max_score > 0),
  attachment_file_id uuid REFERENCES files(id) ON DELETE SET NULL,
  created_by         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX assignments_course_idx ON assignments(course_id, deadline DESC);

CREATE TABLE submissions (
  id            uuid PRIMARY KEY,
  assignment_id uuid NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  student_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_id       uuid REFERENCES files(id) ON DELETE SET NULL,
  note          text NOT NULL DEFAULT '',
  is_late       boolean NOT NULL DEFAULT false,
  status        text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'graded')),
  score         numeric(5,2),
  remark        text NOT NULL DEFAULT '',
  graded_by     uuid REFERENCES users(id) ON DELETE SET NULL,
  graded_at     timestamptz,
  submitted_at  timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assignment_id, student_id)
);
CREATE INDEX submissions_student_idx ON submissions(student_id);
CREATE INDEX submissions_assignment_idx ON submissions(assignment_id, status);

-- ---------------------------------------------------------------------------
-- Community: feed, projects, groups, chat
-- ---------------------------------------------------------------------------
CREATE TABLE posts (
  id            uuid PRIMARY KEY,
  author_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content       text NOT NULL DEFAULT '',
  image_file_id uuid REFERENCES files(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX posts_created_idx ON posts(created_at DESC);

CREATE TABLE post_likes (
  post_id    uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

CREATE TABLE post_comments (
  id         uuid PRIMARY KEY,
  post_id    uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content    text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX post_comments_post_idx ON post_comments(post_id, created_at);

CREATE TABLE projects (
  id          uuid PRIMARY KEY,
  title       text NOT NULL,
  description text NOT NULL,
  category    text NOT NULL,
  author_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX projects_status_idx ON projects(status, created_at DESC);

CREATE TABLE project_votes (
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, user_id)
);

CREATE TABLE communities (
  id          uuid PRIMARY KEY,
  name        text NOT NULL UNIQUE,
  icon        text NOT NULL DEFAULT '💬',
  description text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE community_members (
  community_id uuid NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (community_id, user_id)
);

CREATE TABLE study_rooms (
  id         uuid PRIMARY KEY,
  title      text NOT NULL,
  topic      text NOT NULL DEFAULT '',
  host_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_at  timestamptz
);
CREATE INDEX study_rooms_active_idx ON study_rooms(is_active, created_at DESC);

CREATE TABLE study_room_participants (
  room_id   uuid NOT NULL REFERENCES study_rooms(id) ON DELETE CASCADE,
  user_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, user_id)
);

CREATE TABLE conversations (
  id         uuid PRIMARY KEY,
  type       text NOT NULL CHECK (type IN ('direct', 'room')),
  direct_key text UNIQUE,
  room_id    uuid REFERENCES study_rooms(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE conversation_members (
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_at    timestamptz,
  PRIMARY KEY (conversation_id, user_id)
);
CREATE INDEX conversation_members_user_idx ON conversation_members(user_id);

CREATE TABLE messages (
  id              uuid PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body            text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX messages_conversation_idx ON messages(conversation_id, created_at);

-- ---------------------------------------------------------------------------
-- Notifications, attendance, moderation
-- ---------------------------------------------------------------------------
CREATE TABLE notifications (
  id         uuid PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      text NOT NULL,
  body       text NOT NULL DEFAULT '',
  kind       text NOT NULL DEFAULT 'general',
  read_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON notifications(user_id, created_at DESC);

CREATE TABLE attendance_sessions (
  id         uuid PRIMARY KEY,
  course_id  uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  code       text NOT NULL UNIQUE,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  opens_at   timestamptz NOT NULL DEFAULT now(),
  closes_at  timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX attendance_sessions_course_idx ON attendance_sessions(course_id, created_at DESC);

CREATE TABLE attendance_records (
  id         uuid PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES attendance_sessions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  marked_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, student_id)
);
CREATE INDEX attendance_records_student_idx ON attendance_records(student_id, marked_at DESC);

CREATE TABLE moderation_items (
  id            uuid PRIMARY KEY,
  type          text NOT NULL CHECK (type IN ('material', 'announcement', 'project', 'hod_request')),
  target_id     uuid,
  title         text NOT NULL,
  details       text NOT NULL DEFAULT '',
  department_id uuid REFERENCES departments(id) ON DELETE CASCADE,
  submitted_by  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewer_id   uuid REFERENCES users(id) ON DELETE SET NULL,
  review_note   text NOT NULL DEFAULT '',
  reviewed_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX moderation_status_idx ON moderation_items(status, created_at DESC);

-- ---------------------------------------------------------------------------
-- AI tutor history
-- ---------------------------------------------------------------------------
CREATE TABLE tutor_messages (
  id         uuid PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       text NOT NULL CHECK (role IN ('user', 'model')),
  content    text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tutor_messages_user_idx ON tutor_messages(user_id, created_at);
