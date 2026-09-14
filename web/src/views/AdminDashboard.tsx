import { useState } from 'react';
import { apiPatch, apiPost, errorMessage } from '../lib/api';
import { useAction, useDebounced, usePolling, useResource } from '../lib/hooks';
import { useAuth } from '../state/AuthContext';
import {
  Badge,
  Card,
  DarkButton,
  EmptyState,
  ErrorState,
  GhostButton,
  InlineError,
  InlineSuccess,
  Modal,
  SectionHeader,
  Skeleton,
  inputClass,
} from '../components/ui';
import { relativeTime } from '../lib/format';
import type { AdminStats, AdminStudent, AttendanceSession, CourseSummary, ModerationItem } from '../types';

export const AdminDashboard = ({ onNavigate }: { onNavigate: (path: string) => void }) => {
  const { user, refresh } = useAuth();
  const stats = useResource<{ stats: AdminStats }>('/api/admin/stats');
  const moderation = useResource<{ items: ModerationItem[] }>(
    user?.role === 'lecturer' ? '/api/moderation/mine' : '/api/moderation',
    [user?.role],
  );
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search, 400);
  const students = useResource<{ students: AdminStudent[] }>(
    user && user.role !== 'lecturer'
      ? `/api/admin/students${debouncedSearch ? `?q=${encodeURIComponent(debouncedSearch)}` : ''}`
      : null,
    [debouncedSearch, user?.role],
  );
  const users = useResource<{ users: AdminStudent[] & { role: string; identifier: string | null; email: string }[] }>(
    user?.role === 'admin' ? '/api/admin/users' : null,
    [user?.role],
  );

  const [showAnnounce, setShowAnnounce] = useState(false);
  const [showAttendance, setShowAttendance] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const review = useAction(async (id: string, decision: 'approved' | 'rejected', note = '') => {
    await apiPost(`/api/moderation/${id}/review`, { decision, note });
    setMessage(decision === 'approved' ? 'Approved — the submitter was notified.' : 'Marked as not approved.');
    moderation.refetch();
  });

  const setUserState = useAction(async (userId: string, patch: { isActive?: boolean; role?: string }) => {
    await apiPatch(`/api/admin/users/${userId}`, patch);
    users.refetch();
  });

  if (!user) return null;
  const isHod = user.isHOD;
  const isAdmin = user.role === 'admin';
  const s = stats.data?.stats;

  return (
    <div className="p-4 pb-20 space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="relative">
          <img src={user.avatarUrl} className="w-14 h-14 rounded-full border-2 border-white dark:border-slate-700 shadow-md" alt="" />
          {isHod && (
            <span className="absolute -bottom-1 -right-1 bg-ksitmo text-white text-[9px] font-bold px-2 py-0.5 rounded-full border border-white">
              HOD
            </span>
          )}
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-800 dark:text-white">
            {isAdmin ? 'Administrator Dashboard' : isHod ? 'HOD Dashboard' : 'Lecturer Dashboard'}
          </h1>
          <p className="text-sm text-gray-500">
            {user.firstName} {user.lastName}
          </p>
          {user.staff?.department && <p className="text-xs text-blue-500 font-bold">{user.staff.department}</p>}
          {user.role === 'lecturer' && user.staff?.hodRequestedAt && (
            <p className="text-[10px] text-orange-500">HOD access pending approval</p>
          )}
        </div>
      </div>

      <InlineSuccess message={message} />
      <InlineError message={actionError} />

      {stats.loading && <Skeleton rows={1} />}
      {stats.error && <ErrorState message={stats.error} onRetry={stats.refetch} />}
      {s && (
        <div className="grid grid-cols-2 gap-3">
          <Card className="bg-blue-50 dark:bg-slate-800">
            <h3 className="text-blue-600 dark:text-blue-400 font-bold text-2xl">
              {isHod || isAdmin ? s.students : s.courses}
            </h3>
            <p className="text-xs text-gray-500 font-bold uppercase">
              {isHod || isAdmin ? 'Dept. Students' : 'Active Courses'}
            </p>
          </Card>
          <Card className="bg-green-50 dark:bg-slate-800">
            <h3 className="text-green-600 dark:text-green-400 font-bold text-2xl">{s.enrolled}</h3>
            <p className="text-xs text-gray-500 font-bold uppercase">Total Enrolled</p>
          </Card>
          <Card className="bg-purple-50 dark:bg-slate-800">
            <h3 className="text-purple-600 dark:text-purple-400 font-bold text-2xl">{s.submissionsToGrade}</h3>
            <p className="text-xs text-gray-500 font-bold uppercase">To Grade</p>
          </Card>
          <Card className="bg-orange-50 dark:bg-slate-800">
            <h3 className="text-orange-600 dark:text-orange-400 font-bold text-2xl">
              {user.role === 'lecturer' ? moderation.data?.items.length ?? 0 : s.pendingModeration}
            </h3>
            <p className="text-xs text-gray-500 font-bold uppercase">
              {user.role === 'lecturer' ? 'My Submissions' : 'Pending Review'}
            </p>
          </Card>
        </div>
      )}

      {/* Review queue */}
      <div>
        <SectionHeader title={user.role === 'lecturer' ? 'My Submissions' : 'Pending Approvals'} />
        <div className="space-y-3">
          {moderation.loading && <Skeleton rows={2} />}
          {moderation.error && <ErrorState message={moderation.error} onRetry={moderation.refetch} />}
          {moderation.data && moderation.data.items.length === 0 && (
            <EmptyState
              icon="✅"
              title={user.role === 'lecturer' ? 'Nothing in review' : 'Queue is clear'}
              hint={
                user.role === 'lecturer'
                  ? 'Materials and announcements you submit will show their review status here.'
                  : 'Materials, announcements, projects and HOD requests land here for approval.'
              }
            />
          )}
          {moderation.data?.items.map((item) => (
            <Card key={item.id} className="flex gap-3">
              <div className="w-10 h-10 rounded-full bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center text-xl">
                {item.status === 'approved' ? '✅' : item.status === 'rejected' ? '❌' : '⏳'}
              </div>
              <div className="flex-1">
                <h4 className="font-bold text-sm text-gray-800 dark:text-white">{item.title}</h4>
                <p className="text-xs text-gray-500">
                  {item.type.replace('_', ' ')} • {item.submittedByName} • {relativeTime(item.createdAt)}
                </p>
                {item.details && <p className="text-[11px] text-gray-400 mt-1 line-clamp-2">{item.details}</p>}
                {item.status !== 'pending' && (
                  <p className="text-[10px] text-gray-400 mt-1 capitalize">Status: {item.status}</p>
                )}
              </div>
              {item.status === 'pending' && (user.role === 'hod' || user.role === 'admin') && (
                <div className="flex flex-col gap-2">
                  <GhostButton
                    onClick={() => void review.run(item.id, 'approved').catch((err) => setActionError(errorMessage(err)))}
                    disabled={review.running}
                  >
                    Approve
                  </GhostButton>
                  <GhostButton
                    onClick={() => void review.run(item.id, 'rejected', 'Does not meet requirements.').catch((err) => setActionError(errorMessage(err)))}
                    disabled={review.running}
                  >
                    Reject
                  </GhostButton>
                </div>
              )}
            </Card>
          ))}
        </div>
      </div>

      {/* Student directory */}
      {(isHod || isAdmin) && (
        <div>
          <SectionHeader
            title={isAdmin ? 'Students' : `Students in ${user.staff?.department ?? 'your department'}`}
          />
          <input
            placeholder="Search by name or matric number…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`${inputClass} mb-3`}
          />
          <div className="space-y-3">
            {students.loading && <Skeleton rows={2} />}
            {students.error && <ErrorState message={students.error} onRetry={students.refetch} />}
            {students.data && students.data.students.length === 0 && (
              <EmptyState icon="🎓" title="No students found" hint="No student matches that search in your scope." />
            )}
            {students.data?.students.map((student) => (
              <Card key={student.userId} className="flex items-center gap-3">
                <img src={student.avatarUrl} className="w-10 h-10 rounded-full bg-gray-200" alt="" />
                <div className="flex-1">
                  <h4 className="font-bold text-sm text-gray-800 dark:text-white">{student.name}</h4>
                  <p className="text-xs text-gray-500">
                    {student.matricNumber} • {student.level}
                  </p>
                </div>
                <div className="text-right">
                  <span className="block text-xs font-bold text-blue-600">
                    {student.cgpa !== null ? `${student.cgpa.toFixed(2)} CGPA` : 'No results'}
                  </span>
                  <span className="block text-[10px] text-gray-400">{student.enrolledCourses} courses</span>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* System administration */}
      {isAdmin && (
        <div>
          <SectionHeader title="User Management" />
          <div className="space-y-2">
            {users.loading && <Skeleton rows={2} />}
            {users.data?.users.map((u: any) => (
              <Card key={u.id} className="flex items-center gap-3">
                <img src={u.avatarUrl} className="w-9 h-9 rounded-full bg-gray-200" alt="" />
                <div className="flex-1 min-w-0">
                  <h4 className="font-bold text-xs text-gray-800 dark:text-white truncate">{u.name}</h4>
                  <p className="text-[10px] text-gray-500 truncate">
                    {u.email} • {u.identifier ?? '—'}
                  </p>
                </div>
                <Badge tone={u.role === 'admin' ? 'purple' : u.role === 'student' ? 'blue' : 'orange'}>{u.role}</Badge>
                <div className="flex flex-col gap-1">
                  <GhostButton
                    onClick={() =>
                      void setUserState
                        .run(u.id, { isActive: !u.isActive })
                        .catch((err) => setActionError(errorMessage(err)))
                    }
                  >
                    {u.isActive ? 'Disable' : 'Enable'}
                  </GhostButton>
                  {u.role === 'lecturer' && (
                    <GhostButton
                      onClick={() =>
                        void setUserState.run(u.id, { role: 'hod' }).catch((err) => setActionError(errorMessage(err)))
                      }
                    >
                      Make HOD
                    </GhostButton>
                  )}
                  {u.role === 'hod' && (
                    <GhostButton
                      onClick={() =>
                        void setUserState.run(u.id, { role: 'lecturer' }).catch((err) => setActionError(errorMessage(err)))
                      }
                    >
                      Demote
                    </GhostButton>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <button
          onClick={() => onNavigate('/assignments')}
          className="bg-ksitmb text-white p-4 rounded-xl shadow-lg flex flex-col items-center"
        >
          <span className="text-2xl mb-1">📝</span>
          <span className="text-xs font-bold">New Assignment</span>
        </button>
        <button
          onClick={() => setShowAnnounce(true)}
          className="bg-white dark:bg-slate-800 border dark:border-slate-700 p-4 rounded-xl shadow-sm flex flex-col items-center"
        >
          <span className="text-2xl mb-1">📢</span>
          <span className="text-xs font-bold text-gray-600 dark:text-gray-300">Announce</span>
        </button>
        <button
          onClick={() => onNavigate('/lms')}
          className="bg-white dark:bg-slate-800 border dark:border-slate-700 p-4 rounded-xl shadow-sm flex flex-col items-center"
        >
          <span className="text-2xl mb-1">📚</span>
          <span className="text-xs font-bold text-gray-600 dark:text-gray-300">Courses</span>
        </button>
        <button
          onClick={() => setShowAttendance(true)}
          className="bg-white dark:bg-slate-800 border dark:border-slate-700 p-4 rounded-xl shadow-sm flex flex-col items-center"
        >
          <span className="text-2xl mb-1">📷</span>
          <span className="text-xs font-bold text-gray-600 dark:text-gray-300">Attendance QR</span>
        </button>
      </div>

      {showAnnounce && (
        <AnnounceModal
          onClose={() => setShowAnnounce(false)}
          onDone={(msg) => {
            setShowAnnounce(false);
            setMessage(msg);
            refresh().catch(() => undefined);
          }}
        />
      )}
      {showAttendance && <AttendanceModal onClose={() => setShowAttendance(false)} />}
    </div>
  );
};

/* -------------------------------------------------------------------------- */

const AnnounceModal = ({ onClose, onDone }: { onClose: () => void; onDone: (message: string) => void }) => {
  const { user } = useAuth();
  const [form, setForm] = useState({ title: '', content: '', type: 'academic', departmentOnly: false });
  const create = useAction(async () => {
    const res = await apiPost<{ status: string }>('/api/announcements', {
      title: form.title.trim(),
      content: form.content.trim(),
      type: form.type,
      departmentOnly: form.departmentOnly,
    });
    onDone(
      res.status === 'published'
        ? 'Announcement published to students.'
        : 'Announcement submitted — it goes live once approved.',
    );
  });

  return (
    <Modal title="New Announcement" onClose={onClose} wide>
      <div className="space-y-3">
        <input
          placeholder="Title"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          className={inputClass}
        />
        <textarea
          rows={4}
          placeholder="Write the announcement…"
          value={form.content}
          onChange={(e) => setForm({ ...form, content: e.target.value })}
          className={inputClass}
        />
        <div className="grid grid-cols-2 gap-3">
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className={inputClass}>
            <option value="academic">Academic</option>
            <option value="general">General</option>
            <option value="urgent">Urgent</option>
          </select>
          <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
            <input
              type="checkbox"
              checked={form.departmentOnly}
              onChange={(e) => setForm({ ...form, departmentOnly: e.target.checked })}
              className="w-4 h-4 accent-ksitmo"
            />
            {user?.staff?.department ?? 'My department'} only
          </label>
        </div>
        <InlineError message={create.error} />
        <DarkButton
          onClick={() => void create.run().catch(() => undefined)}
          disabled={create.running || form.title.trim().length < 3 || form.content.trim().length < 3}
        >
          {create.running ? 'Publishing…' : 'Publish'}
        </DarkButton>
      </div>
    </Modal>
  );
};

/* -------------------------------------------------------------------------- */

const AttendanceModal = ({ onClose }: { onClose: () => void }) => {
  const courses = useResource<{ courses: CourseSummary[] }>('/api/courses');
  const [courseId, setCourseId] = useState('');
  const [duration, setDuration] = useState(15);
  const [session, setSession] = useState<AttendanceSession | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Enrolled headcount for the course we are taking attendance for.
  const roster = useResource<{ students: unknown[] }>(
    session ? `/api/courses/${courseId}/students` : null,
    [session, courseId],
  );

  const open = useAction(async () => {
    setError(null);
    const res = await apiPost<AttendanceSession>('/api/attendance/sessions', { courseId, durationMinutes: duration });
    setSession(res);
  });

  return (
    <Modal title="Class Attendance" onClose={onClose} wide>
      <div className="space-y-3">
        {session ? (
          <div className="text-center space-y-3">
            <p className="text-xs text-gray-500">
              Students scan this code to mark attendance for <b>{session.courseCode}</b>.
            </p>
            <img src={session.qrUrl} alt="Attendance QR code" className="w-56 h-56 mx-auto bg-white rounded-xl border" />
            <p className="text-2xl font-mono font-bold tracking-[0.4em] text-ksitmb dark:text-blue-300">{session.code}</p>
            <p className="text-[11px] text-gray-400">Closes {new Date(session.closesAt).toLocaleTimeString()}</p>

            <AttendanceRecords sessionId={session.id} enrolled={roster.data?.students.length ?? null} />

            <GhostButton onClick={() => setSession(null)} className="w-full">
              Create another
            </GhostButton>
          </div>
        ) : (
          <>
            <select value={courseId} onChange={(e) => setCourseId(e.target.value)} className={inputClass}>
              <option value="">{courses.loading ? 'Loading courses…' : 'Select course'}</option>
              {courses.data?.courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} — {c.title}
                </option>
              ))}
            </select>
            <label className="block">
              <span className="text-[10px] uppercase font-bold text-gray-500">Window (minutes)</span>
              <input
                type="number"
                min={1}
                max={180}
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className={inputClass}
              />
            </label>
            <InlineError message={error} />
            <InlineError message={open.error} />
            <DarkButton onClick={() => void open.run().catch((err) => setError(errorMessage(err)))} disabled={open.running || !courseId}>
              {open.running ? 'Generating…' : 'Generate QR code'}
            </DarkButton>
          </>
        )}
      </div>
    </Modal>
  );
};

const AttendanceRecords = ({ sessionId, enrolled }: { sessionId: string; enrolled: number | null }) => {
  const { data, loading, error, refetch } = useResource<{
    records: { id: string; studentId: string; studentName: string; matricNumber: string; markedAt: string }[];
  }>(`/api/attendance/sessions/${sessionId}/records`, [sessionId]);

  usePolling(() => refetch(), 5000, true);

  return (
    <div className="text-left border-t border-gray-100 dark:border-slate-700 pt-3">
      <div className="flex justify-between items-center mb-2">
        <h4 className="text-xs font-bold uppercase text-gray-500">Marked attendance</h4>
        <span className="text-xs font-bold text-ksitmb dark:text-blue-300">
          {data?.records.length ?? 0}
          {enrolled !== null ? ` / ${enrolled}` : ''}
        </span>
      </div>
      {loading && <Skeleton rows={2} />}
      {error && <ErrorState message={error} onRetry={refetch} />}
      {data && data.records.length === 0 && (
        <p className="text-[11px] text-gray-400">Waiting for students to scan…</p>
      )}
      <ul className="space-y-1 max-h-40 overflow-y-auto">
        {data?.records.map((record) => (
          <li key={record.id} className="flex justify-between text-[11px]">
            <span className="text-gray-700 dark:text-gray-200">{record.studentName}</span>
            <span className="text-gray-400">
              {record.matricNumber} • {new Date(record.markedAt).toLocaleTimeString()}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default AdminDashboard;
