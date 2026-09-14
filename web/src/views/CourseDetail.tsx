import { useState } from 'react';
import { apiDelete, apiPost, errorMessage, fileToPayload } from '../lib/api';
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
  SectionHeader,
  Skeleton,
  inputClass,
} from '../components/ui';
import {DAYS} from '../lib/constants';
import { deadlineLabel, formatBytes, relativeTime } from '../lib/format';
import type { CourseDetail, RosterStudent } from '../types';
import Logo from '../components/Logo';

export const CourseDetailView = ({ courseId, onBack }: { courseId: string; onBack: () => void }) => {
  const { user } = useAuth();
  const isStaff = user?.role !== 'student';
  const [tab, setTab] = useState<'topics' | 'materials' | 'assignments' | 'class'>('topics');
  const { data, loading, error, refetch } = useResource<CourseDetail>(`/api/courses/${courseId}`, [courseId]);
  const roster = useResource<{ students: RosterStudent[] }>(
    isStaff && tab === 'class' ? `/api/courses/${courseId}/students` : null,
    [courseId, tab],
  );

  const tabs: Array<'topics' | 'materials' | 'assignments' | 'class'> = isStaff
    ? ['topics', 'materials', 'assignments', 'class']
    : ['topics', 'materials', 'assignments'];

  const [topicTitle, setTopicTitle] = useState('');
  const [material, setMaterial] = useState({ title: '', description: '', fileName: '', fileSize: 0 });
  const [materialFile, setMaterialFile] = useState<File | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const toggleTopic = useAction(async (topicId: string, completed: boolean) => {
    await apiPost(`/api/courses/${courseId}/topics/${topicId}/complete`, { completed });
    refetch();
  });

  const addTopic = useAction(async () => {
    await apiPost(`/api/courses/${courseId}/topics`, { title: topicTitle.trim() });
    setTopicTitle('');
    refetch();
  });

  const removeTopic = useAction(async (topicId: string) => {
    await apiDelete(`/api/courses/${courseId}/topics/${topicId}`);
    refetch();
  });

  const uploadMaterial = useAction(async () => {
    if (!materialFile) {
      setActionError('Choose a file to upload.');
      return;
    }
    const payload = await fileToPayload(materialFile);
    await apiPost(`/api/courses/${courseId}/materials`, {
      title: material.title.trim(),
      description: material.description.trim(),
      file: payload,
    });
    setMessage(
      user?.role === 'lecturer'
        ? 'Material uploaded — it appears for students once an HOD approves it.'
        : 'Material published to students.',
    );
    setMaterial({ title: '', description: '', fileName: '', fileSize: 0 });
    setMaterialFile(null);
    refetch();
  });

  const removeMaterial = useAction(async (materialId: string) => {
    await apiDelete(`/api/courses/${courseId}/materials/${materialId}`);
    refetch();
  });

  if (loading) return <div className="p-4"><Skeleton rows={3} /></div>;
  if (error) return <ErrorState message={error} onRetry={refetch} />;
  if (!data) return null;

  const completedTopics = data.topics.filter((t) => t.completed).length;
  const progress = data.topics.length ? Math.round((completedTopics / data.topics.length) * 100) : 0;

  return (
    <div className="p-4 pb-20 space-y-4 animate-in fade-in">
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to courses
      </button>

      <Card>
        <div className="flex items-start gap-3">
          <Logo className="w-10 h-10 rounded-lg bg-gray-50 dark:bg-slate-900 p-1 object-contain" />
          <div className="flex-1">
            <span className="bg-blue-100 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded">{data.course.code}</span>
            <h2 className="font-bold text-gray-800 dark:text-white text-lg">{data.course.title}</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {data.course.department} • {data.course.level} • {data.course.creditUnits} credits
            </p>
          </div>
        </div>
        {data.course.description && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">{data.course.description}</p>
        )}
        <div className="flex flex-wrap gap-2 mt-3">
          <Badge tone="gray">{data.enrolledCount} enrolled</Badge>
          <Badge tone="blue">{data.topics.length} topics</Badge>
          <Badge tone="purple">{data.materials.length} materials</Badge>
          {data.myResult && (
            <Badge tone="green">
              Result: {data.myResult.score} ({data.myResult.grade})
            </Badge>
          )}
        </div>
        {!isStaff && data.topics.length > 0 && (
          <div className="mt-4">
            <div className="flex justify-between text-[10px] uppercase font-bold text-gray-400 mb-1">
              <span>Your progress</span>
              <span>{progress}%</span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-slate-700 rounded-full h-1.5">
              <div className="bg-ksitmb dark:bg-blue-500 h-1.5 rounded-full" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}
        {data.schedules.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {data.schedules.map((s) => (
              <span key={s.id} className="text-[11px] bg-gray-50 dark:bg-slate-900 rounded-lg px-2 py-1 text-gray-600 dark:text-gray-300">
                🗓 {DAYS[s.weekday]} {s.startTime}–{s.endTime}
                {s.room ? ` • ${s.room}` : ''}
              </span>
            ))}
          </div>
        )}
      </Card>

      <InlineSuccess message={message} />
      <InlineError message={actionError} />

      <div className="flex gap-2 border-b border-gray-200 dark:border-slate-800 pb-2 overflow-x-auto">
        {tabs.map((key) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-4 py-1.5 rounded-full text-sm whitespace-nowrap capitalize ${
                tab === key ? 'bg-ksitmb text-white' : 'text-gray-500'
              }`}
            >
              {key === 'class' ? 'Class list' : key}
            </button>
          ))}
      </div>

      {tab === 'topics' && (
        <div className="space-y-2">
          {data.topics.length === 0 && (
            <EmptyState icon="🗂" title="No topics yet" hint="Topics published by your lecturer will show up here." />
          )}
          {data.topics.map((topic) => (
            <Card key={topic.id} className="flex items-center gap-3">
              <input
                type="checkbox"
                disabled={!isStaff && toggleTopic.running}
                checked={topic.completed}
                onChange={(e) =>
                  isStaff
                    ? undefined
                    : void toggleTopic
                        .run(topic.id, e.target.checked)
                        .catch((err) => setActionError(errorMessage(err)))
                }
                className="w-5 h-5 accent-ksitmo"
              />
              <span
                className={`flex-1 text-sm ${
                  topic.completed ? 'line-through text-gray-400' : 'text-gray-800 dark:text-gray-200'
                }`}
              >
                {topic.title}
              </span>
              {isStaff && data.canManage && (
                <GhostButton
                  onClick={() =>
                    void removeTopic
                      .run(topic.id)
                      .catch((err) => setActionError(errorMessage(err)))
                  }
                >
                  Remove
                </GhostButton>
              )}
            </Card>
          ))}

          {isStaff && data.canManage && (
            <Card className="space-y-2">
              <input
                placeholder="Add a topic…"
                value={topicTitle}
                onChange={(e) => setTopicTitle(e.target.value)}
                className={inputClass}
              />
              <DarkButton
                onClick={() => void addTopic.run().catch((err) => setActionError(errorMessage(err)))}
                disabled={addTopic.running || !topicTitle.trim()}
              >
                {addTopic.running ? 'Adding…' : 'Add topic'}
              </DarkButton>
            </Card>
          )}
        </div>
      )}

      {tab === 'materials' && (
        <div className="space-y-3">
          {data.materials.length === 0 && (
            <EmptyState icon="📄" title="No materials yet" hint="Lecture notes, slides and past questions will appear here." />
          )}
          {data.materials.map((m) => (
            <Card key={m.id}>
              <div className="flex justify-between items-start gap-2">
                <div className="flex-1">
                  <h4 className="font-bold text-sm text-gray-800 dark:text-white">{m.title}</h4>
                  {m.description && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{m.description}</p>}
                  <p className="text-[10px] text-gray-400 mt-2">
                    {m.uploaderName} • {relativeTime(m.createdAt)}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  {m.status !== 'published' && <Badge tone="orange">{m.status}</Badge>}
                  {m.fileUrl ? (
                    <a
                      href={`${m.fileUrl}?download=1`}
                      className="text-xs font-bold text-ksitmo hover:underline"
                    >
                      Download
                    </a>
                  ) : m.url ? (
                    <a href={m.url} target="_blank" rel="noreferrer" className="text-xs font-bold text-ksitmo hover:underline">
                      Open link
                    </a>
                  ) : null}
                  {isStaff && data.canManage && (
                    <button
                      onClick={() => void removeMaterial.run(m.id).catch((err) => setActionError(errorMessage(err)))}
                      className="text-[10px] text-red-500 hover:underline"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            </Card>
          ))}

          {isStaff && data.canManage && (
            <Card className="space-y-3">
              <SectionHeader title="Upload material" />
              <input
                placeholder="Title"
                value={material.title}
                onChange={(e) => setMaterial({ ...material, title: e.target.value })}
                className={inputClass}
              />
              <textarea
                placeholder="Description (optional)"
                rows={2}
                value={material.description}
                onChange={(e) => setMaterial({ ...material, description: e.target.value })}
                className={inputClass}
              />
              <label className="block">
                <span className="text-[10px] uppercase font-bold text-gray-500">File (PDF, DOC, PPT…)</span>
                <input
                  type="file"
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    setMaterialFile(file);
                    setMaterial((prev) => ({
                      ...prev,
                      fileName: file?.name ?? '',
                      fileSize: file?.size ?? 0,
                    }));
                  }}
                  className="block w-full text-xs text-gray-500 mt-1"
                />
                {material.fileName && (
                  <span className="text-[10px] text-gray-400">
                    {material.fileName} • {formatBytes(material.fileSize)}
                  </span>
                )}
              </label>
              <DarkButton
                onClick={() => void uploadMaterial.run().catch((err) => setActionError(errorMessage(err)))}
                disabled={uploadMaterial.running || !material.title.trim() || !materialFile}
              >
                {uploadMaterial.running ? 'Uploading…' : 'Upload'}
              </DarkButton>
            </Card>
          )}
        </div>
      )}

      {tab === 'assignments' && (
        <div className="space-y-3">
          {data.assignments.length === 0 && (
            <EmptyState icon="📝" title="No assignments" hint="Assignments for this course will appear here." />
          )}
          {data.assignments.map((a) => (
            <Card key={a.id}>
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="font-bold text-sm text-gray-800 dark:text-white">{a.title}</h4>
                  <p className="text-[11px] text-gray-500 mt-1">{deadlineLabel(a.deadline)}</p>
                </div>
                {a.myStatus ? (
                  <Badge tone={a.myStatus === 'graded' ? 'green' : 'blue'}>
                    {a.myStatus === 'graded' ? `Graded ${a.myScore ?? ''}` : 'Submitted'}
                  </Badge>
                ) : (
                  <Badge tone={new Date(a.deadline).getTime() < Date.now() ? 'red' : 'orange'}>
                    {new Date(a.deadline).getTime() < Date.now() ? 'Missed' : 'Pending'}
                  </Badge>
                )}
              </div>
              <p className="text-[10px] text-gray-400 mt-2">{a.submissionCount} submission(s)</p>
            </Card>
          ))}
        </div>
      )}

      {tab === 'class' && isStaff && (
        <div className="space-y-3">
          <RecordResults courseId={courseId} />
          {roster.loading && <Skeleton rows={3} />}
          {roster.error && <ErrorState message={roster.error} onRetry={roster.refetch} />}
          {roster.data?.students.length === 0 && (
            <EmptyState icon="👥" title="No students enrolled" hint="Students in this cohort will appear automatically." />
          )}
          {roster.data?.students.map((s) => (
            <Card key={s.userId} className="flex items-center gap-3">
              <img src={s.avatarUrl} className="w-10 h-10 rounded-full bg-gray-200" alt="" />
              <div className="flex-1">
                <h4 className="font-bold text-sm text-gray-800 dark:text-white">{s.name}</h4>
                <p className="text-xs text-gray-500">
                  {s.matricNumber} • {s.progress}% complete
                </p>
              </div>
              {s.result ? (
                <Badge tone="green">
                  {s.result.score} ({s.result.grade})
                </Badge>
              ) : (
                <Badge tone="gray">No result</Badge>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

/** Lets a lecturer record a continuous-assessment score for any enrolled student. */
const RecordResults = ({ courseId }: { courseId: string }) => {
  const roster = useResource<{ students: RosterStudent[] }>(`/api/courses/${courseId}/students`, [courseId]);
  const [scores, setScores] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<string | null>(null);
  const save = useAction(async (studentId: string) => {
    const score = Number(scores[studentId]);
    await apiPost(`/api/courses/${courseId}/results`, { studentId, score });
    setSaved(`Result saved (${score}). CGPA updated for the student.`);
    roster.refetch();
  });

  return (
    <Card className="space-y-3">
      <SectionHeader title="Record results" />
      <p className="text-[11px] text-gray-500">
        Scores are converted to grades automatically (A ≥ 75, B ≥ 65, C ≥ 55, D ≥ 45, E ≥ 40).
      </p>
      <InlineSuccess message={saved} />
      <InlineError message={save.error} />
      {roster.loading && <Skeleton rows={2} />}
      {roster.data?.students.map((s) => (
        <div key={s.userId} className="flex items-center gap-2">
          <span className="flex-1 text-xs text-gray-700 dark:text-gray-300 truncate">
            {s.name} <span className="text-gray-400">({s.matricNumber})</span>
          </span>
          <input
            type="number"
            min={0}
            max={100}
            placeholder={s.result ? String(s.result.score) : '0-100'}
            value={scores[s.userId] ?? ''}
            onChange={(e) => setScores({ ...scores, [s.userId]: e.target.value })}
            className="w-24 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg p-2 text-xs dark:text-white"
          />
          <GhostButton
            onClick={() => void save.run(s.userId).catch(() => undefined)}
            disabled={save.running || !scores[s.userId]}
          >
            Save
          </GhostButton>
        </div>
      ))}
    </Card>
  );
};

export default CourseDetailView;
