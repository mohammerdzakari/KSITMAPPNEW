import { useEffect, useState } from 'react';
import { apiDelete, apiPatch, apiPost, errorMessage, fileToPayload } from '../lib/api';
import { useAction, useResource } from '../lib/hooks';
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
import { dateTime, deadlineLabel, formatBytes, relativeTime, toIso } from '../lib/format';
import type { Assignment, CourseSummary, Submission } from '../types';

export const AssignmentsView = ({ onOpenCourse }: { onOpenCourse: (courseId: string) => void }) => {
  const { user } = useAuth();
  const isStaff = user?.role !== 'student';
  const [tab, setTab] = useState<'pending' | 'submitted' | 'create'>(isStaff ? 'pending' : 'pending');

  const view = isStaff ? 'active' : tab === 'submitted' ? 'submitted' : 'pending';
  const { data, loading, error, refetch } = useResource<{ assignments: Assignment[] }>(`/api/assignments?view=${view}`, [
    view,
  ]);

  const [editing, setEditing] = useState<Assignment | null>(null);
  const [submissionsFor, setSubmissionsFor] = useState<Assignment | null>(null);
  const [submitFor, setSubmitFor] = useState<Assignment | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const remove = useAction(async (id: string) => {
    await apiDelete(`/api/assignments/${id}`);
    setMessage('Assignment deleted.');
    refetch();
  });

  return (
    <div className="p-4 space-y-4 animate-in fade-in">
      <SectionHeader title={isStaff ? 'Manage Assignments' : 'My Assignments'} />

      <div className="flex gap-2 border-b border-gray-200 dark:border-slate-800 pb-2 mb-4 overflow-x-auto">
        {isStaff ? (
          <>
            <button
              onClick={() => setTab('pending')}
              className={`px-4 py-1.5 rounded-full text-sm whitespace-nowrap ${tab === 'pending' ? 'bg-ksitmb text-white' : 'text-gray-500'}`}
            >
              Active Tasks
            </button>
            <button
              onClick={() => setTab('create')}
              className={`px-4 py-1.5 rounded-full text-sm whitespace-nowrap ${tab === 'create' ? 'bg-ksitmb text-white' : 'text-gray-500'}`}
            >
              Create New
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => setTab('pending')}
              className={`px-4 py-1.5 rounded-full text-sm whitespace-nowrap ${tab === 'pending' ? 'bg-ksitmb text-white' : 'text-gray-500'}`}
            >
              Pending
            </button>
            <button
              onClick={() => setTab('submitted')}
              className={`px-4 py-1.5 rounded-full text-sm whitespace-nowrap ${tab === 'submitted' ? 'bg-ksitmb text-white' : 'text-gray-500'}`}
            >
              Submitted
            </button>
          </>
        )}
      </div>

      <InlineSuccess message={message} />
      <InlineError message={actionError} />

      {tab === 'create' && isStaff && (
        <AssignmentForm
          editing={editing}
          onDone={(msg) => {
            setMessage(msg);
            setEditing(null);
            setTab('pending');
            refetch();
          }}
          onCancel={() => {
            setEditing(null);
            setTab('pending');
          }}
        />
      )}

      {tab !== 'create' && (
        <div className="space-y-3">
          {loading && <Skeleton rows={3} />}
          {error && <ErrorState message={error} onRetry={refetch} />}
          {!loading && !error && data && data.assignments.length === 0 && (
            <EmptyState
              icon="📝"
              title={isStaff ? 'No assignments yet' : tab === 'pending' ? 'Nothing pending' : 'No submissions yet'}
              hint={
                isStaff
                  ? 'Create an assignment and it will be pushed to everyone in the cohort.'
                  : tab === 'pending'
                    ? 'You are all caught up. New tasks from your lecturers show up here.'
                    : 'Work you submit will be listed here with grades and feedback.'
              }
              action={
                isStaff ? (
                  <DarkButton onClick={() => setTab('create')}>Create assignment</DarkButton>
                ) : undefined
              }
            />
          )}

          {data?.assignments.map((assign) => (
            <Card key={assign.id}>
              <div className="flex justify-between items-start mb-2">
                <button
                  onClick={() => onOpenCourse(assign.courseId)}
                  className="bg-blue-100 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded hover:underline"
                >
                  {assign.courseCode}
                </button>
                <span className={`text-[10px] font-bold ${assign.isOverdue ? 'text-red-500' : 'text-gray-500'}`}>
                  {deadlineLabel(assign.deadline)}
                </span>
              </div>
              <h3 className="font-bold text-gray-800 dark:text-white text-sm">{assign.title}</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-3">{assign.description}</p>
              <p className="text-[10px] text-gray-400 mt-2">
                {assign.createdByName} • max {assign.maxScore} marks
                {assign.attachmentUrl ? ' • brief attached' : ''}
              </p>

              {!isStaff && !assign.submission && (
                <button
                  onClick={() => setSubmitFor(assign)}
                  className="w-full mt-3 bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 text-gray-700 dark:text-gray-200 text-xs font-bold py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-600"
                >
                  {assign.isOverdue ? 'Submit (late)' : 'Upload Submission'}
                </button>
              )}

              {!isStaff && assign.submission && (
                <div className="mt-3 bg-gray-50 dark:bg-slate-900 rounded-lg p-3 space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge tone={assign.submission.status === 'graded' ? 'green' : 'blue'}>
                      {assign.submission.status === 'graded' ? 'Graded' : 'Submitted'}
                    </Badge>
                    {assign.submission.isLate && <Badge tone="red">Late</Badge>}
                  </div>
                  {assign.submission.status === 'graded' && (
                    <p className="text-xs text-gray-700 dark:text-gray-300 font-bold">
                      {assign.submission.score}/{assign.maxScore}
                      {assign.submission.remark ? ` — ${assign.submission.remark}` : ''}
                    </p>
                  )}
                  <p className="text-[10px] text-gray-400">
                    Submitted {relativeTime(assign.submission.submittedAt)}
                    {assign.submission.fileUrl ? ' • ' : ''}
                    {assign.submission.fileUrl && (
                      <a href={`${assign.submission.fileUrl}?download=1`} className="text-ksitmo font-bold hover:underline">
                        View your file
                      </a>
                    )}
                  </p>
                  {assign.submission.status !== 'graded' && (
                    <button
                      onClick={() => setSubmitFor(assign)}
                      className="text-[10px] font-bold text-ksitmo hover:underline"
                    >
                      Replace submission
                    </button>
                  )}
                </div>
              )}

              {isStaff && (
                <div className="flex flex-wrap items-center gap-2 mt-3">
                  <Badge tone="gray">{assign.stats?.submissionCount ?? 0} submitted</Badge>
                  <Badge tone="green">{assign.stats?.gradedCount ?? 0} graded</Badge>
                  <Badge tone="blue">{assign.stats?.enrolledCount ?? 0} in cohort</Badge>
                  <div className="flex-1" />
                  <GhostButton onClick={() => setSubmissionsFor(assign)}>Submissions</GhostButton>
                  <GhostButton
                    onClick={() => {
                      setEditing(assign);
                      setTab('create');
                    }}
                  >
                    Edit
                  </GhostButton>
                  <GhostButton onClick={() => void remove.run(assign.id).catch((err) => setActionError(errorMessage(err)))}>
                    Delete
                  </GhostButton>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {submitFor && (
        <SubmissionModal
          assignment={submitFor}
          onClose={() => setSubmitFor(null)}
          onDone={(msg) => {
            setSubmitFor(null);
            setMessage(msg);
            refetch();
          }}
        />
      )}

      {submissionsFor && (
        <SubmissionsModal
          assignment={submissionsFor}
          onClose={() => setSubmissionsFor(null)}
          onDone={() => {
            setSubmissionsFor(null);
            setMessage('Grade saved and the student was notified.');
            refetch();
          }}
        />
      )}
    </div>
  );
};

/* -------------------------------------------------------------------------- */

const AssignmentForm = ({
  editing,
  onDone,
  onCancel,
}: {
  editing: Assignment | null;
  onDone: (message: string) => void;
  onCancel: () => void;
}) => {
  const courses = useResource<{ courses: CourseSummary[] }>('/api/courses');
  const [form, setForm] = useState({
    courseId: editing?.courseId ?? '',
    title: editing?.title ?? '',
    description: editing?.description ?? '',
    deadlineDate: editing ? new Date(editing.deadline).toISOString().slice(0, 10) : '',
    deadlineTime: editing
      ? new Date(editing.deadline).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
      : '',
  });
  const [error, setError] = useState<string | null>(null);

  const save = useAction(async () => {
    setError(null);
    const deadline = toIso(form.deadlineDate, form.deadlineTime);
    if (!deadline) {
      setError('Choose a deadline date.');
      return;
    }
    if (editing) {
      await apiPatch(`/api/assignments/${editing.id}`, {
        title: form.title.trim(),
        description: form.description.trim(),
        deadline,
      });
      onDone('Assignment updated — students were notified of the new deadline.');
      return;
    }
    await apiPost('/api/assignments', {
      courseId: form.courseId,
      title: form.title.trim(),
      description: form.description.trim(),
      deadline,
    });
    onDone('Assignment published to the cohort.');
  });

  const ai = useAction(async () => {
    const course = courses.data?.courses.find((c) => c.id === form.courseId);
    const res = await apiPost<{ description: string }>('/api/ai/assignment-description', {
      courseCode: course?.code ?? '',
      title: form.title.trim(),
    });
    setForm((prev) => ({ ...prev, description: res.description }));
  });

  return (
    <Card className="space-y-4">
      <h3 className="font-bold text-gray-800 dark:text-white">{editing ? 'Edit Assignment' : 'Create Assignment'}</h3>

      {!editing && (
        <select
          className={inputClass}
          value={form.courseId}
          onChange={(e) => setForm({ ...form, courseId: e.target.value })}
        >
          <option value="">
            {courses.loading ? 'Loading courses…' : 'Select Course'}
          </option>
          {courses.data?.courses.map((course) => (
            <option key={course.id} value={course.id}>
              {course.code} — {course.title}
            </option>
          ))}
        </select>
      )}

      <input
        placeholder="Assignment Title"
        className={inputClass}
        value={form.title}
        onChange={(e) => setForm({ ...form, title: e.target.value })}
      />

      <div className="relative">
        <textarea
          placeholder="Description & Instructions"
          rows={5}
          className={`${inputClass} pb-10`}
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
        <button
          onClick={() => void ai.run().catch((err) => setError(errorMessage(err)))}
          disabled={ai.running || !form.title.trim()}
          className="absolute bottom-2 right-2 text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-md flex items-center gap-1 hover:bg-blue-200 disabled:opacity-50"
        >
          {ai.running ? 'Generating…' : '✨ AI Generate'}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <input
          type="date"
          className={inputClass}
          value={form.deadlineDate}
          onChange={(e) => setForm({ ...form, deadlineDate: e.target.value })}
        />
        <input
          type="time"
          className={inputClass}
          value={form.deadlineTime}
          onChange={(e) => setForm({ ...form, deadlineTime: e.target.value })}
        />
      </div>

      <InlineError message={error} />
      <InlineError message={save.error} />

      <div className="flex gap-2">
        <GhostButton onClick={onCancel} className="flex-1">
          Cancel
        </GhostButton>
        <DarkButton
          onClick={() => void save.run().catch(() => undefined)}
          disabled={save.running || !form.title.trim() || (!editing && !form.courseId) || !form.deadlineDate}
          className="flex-1"
        >
          {save.running ? 'Saving…' : editing ? 'Save changes' : 'Publish Assignment'}
        </DarkButton>
      </div>
    </Card>
  );
};

/* -------------------------------------------------------------------------- */

const SubmissionModal = ({
  assignment,
  onClose,
  onDone,
}: {
  assignment: Assignment;
  onClose: () => void;
  onDone: (message: string) => void;
}) => {
  const [note, setNote] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = useAction(async () => {
    setError(null);
    if (!file && !note.trim()) {
      setError('Attach your work or write a note.');
      return;
    }
    const res = await apiPost<{ isLate: boolean }>(`/api/assignments/${assignment.id}/submissions`, {
      note: note.trim(),
      file: file ? await fileToPayload(file) : undefined,
    });
    onDone(res.isLate ? 'Submitted (after the deadline).' : 'Submitted successfully.');
  });

  return (
    <Modal title={`Submit — ${assignment.title}`} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-xs text-gray-500">
          {assignment.courseCode} • {deadlineLabel(assignment.deadline)}
          {assignment.isOverdue && <span className="text-red-500 font-bold"> (this will be marked late)</span>}
        </p>
        <textarea
          rows={3}
          placeholder="Add a note for your lecturer (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className={inputClass}
        />
        <label className="block">
          <span className="text-[10px] uppercase font-bold text-gray-500">Your work (PDF, DOC, image…)</span>
          <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block w-full text-xs mt-1" />
          {file && <span className="text-[10px] text-gray-400">{file.name} • {formatBytes(file.size)}</span>}
        </label>
        <InlineError message={error} />
        <InlineError message={submit.error} />
        <DarkButton onClick={() => void submit.run().catch(() => undefined)} disabled={submit.running}>
          {submit.running ? 'Uploading…' : 'Submit work'}
        </DarkButton>
      </div>
    </Modal>
  );
};

/* -------------------------------------------------------------------------- */

const SubmissionsModal = ({
  assignment,
  onClose,
  onDone,
}: {
  assignment: Assignment;
  onClose: () => void;
  onDone: () => void;
}) => {
  const { data, loading, error, refetch } = useResource<{ submissions: Submission[]; maxScore: number }>(
    `/api/assignments/${assignment.id}/submissions`,
    [assignment.id],
  );
  const [grades, setGrades] = useState<Record<string, { score: string; remark: string }>>({});
  const [actionError, setActionError] = useState<string | null>(null);

  const grade = useAction(async (submissionId: string) => {
    const entry = grades[submissionId];
    await apiPost(`/api/assignments/${assignment.id}/submissions/${submissionId}/grade`, {
      score: Number(entry?.score ?? 0),
      remark: entry?.remark ?? '',
    });
    refetch();
    onDone();
  });

  useEffect(() => {
    if (data) {
      setGrades((prev) => {
        const next = { ...prev };
        for (const s of data.submissions) {
          if (!next[s.id]) next[s.id] = { score: s.score !== null ? String(s.score) : '', remark: s.remark ?? '' };
        }
        return next;
      });
    }
  }, [data]);

  return (
    <Modal title={`Submissions — ${assignment.title}`} onClose={onClose} wide>
      <div className="space-y-3">
        <p className="text-xs text-gray-500">
          {data?.submissions.length ?? 0} of {assignment.stats?.enrolledCount ?? 0} students submitted • max{' '}
          {data?.maxScore ?? assignment.maxScore} marks
        </p>
        {loading && <Skeleton rows={2} />}
        {error && <ErrorState message={error} onRetry={refetch} />}
        {data && data.submissions.length === 0 && (
          <EmptyState icon="📥" title="No submissions yet" hint="Students have not sent any work for this task." />
        )}
        {data?.submissions.map((s) => (
          <Card key={s.id}>
            <div className="flex items-center gap-3">
              <img src={s.avatarUrl} className="w-9 h-9 rounded-full bg-gray-200" alt="" />
              <div className="flex-1">
                <h4 className="font-bold text-sm text-gray-800 dark:text-white">{s.studentName}</h4>
                <p className="text-[11px] text-gray-500">
                  {s.studentMatric} • {relativeTime(s.submittedAt)}
                  {s.isLate && <span className="text-red-500 font-bold"> • late</span>}
                </p>
              </div>
              {s.status === 'graded' && <Badge tone="green">{s.score}</Badge>}
            </div>
            {s.note && <p className="text-xs text-gray-600 dark:text-gray-300 mt-2 italic">“{s.note}”</p>}
            {s.fileUrl && (
              <a href={`${s.fileUrl}?download=1`} className="inline-block mt-2 text-xs font-bold text-ksitmo hover:underline">
                Download submission
              </a>
            )}
            <div className="flex items-center gap-2 mt-3">
              <input
                type="number"
                min={0}
                max={data?.maxScore ?? 100}
                placeholder="Score"
                value={grades[s.id]?.score ?? ''}
                onChange={(e) => setGrades({ ...grades, [s.id]: { ...grades[s.id], score: e.target.value, remark: grades[s.id]?.remark ?? '' } })}
                className="w-20 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg p-2 text-xs dark:text-white"
              />
              <input
                placeholder="Feedback"
                value={grades[s.id]?.remark ?? ''}
                onChange={(e) => setGrades({ ...grades, [s.id]: { ...grades[s.id], remark: e.target.value, score: grades[s.id]?.score ?? '' } })}
                className="flex-1 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg p-2 text-xs dark:text-white"
              />
              <GhostButton
                onClick={() => void grade.run(s.id).catch((err) => setActionError(errorMessage(err)))}
                disabled={grade.running || !grades[s.id]?.score}
              >
                Save
              </GhostButton>
            </div>
            {s.gradedByName && (
              <p className="text-[10px] text-gray-400 mt-2">
                Last graded by {s.gradedByName} • {dateTime(s.submittedAt)}
              </p>
            )}
          </Card>
        ))}
        <InlineError message={actionError} />
        <InlineError message={grade.error} />
      </div>
    </Modal>
  );
};

export default AssignmentsView;
