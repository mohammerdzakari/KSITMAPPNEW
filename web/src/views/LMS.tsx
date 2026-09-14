import { useState } from 'react';
import { apiDelete, apiPost, errorMessage } from '../lib/api';
import { useAction, useResource } from '../lib/hooks';
import { useAuth } from '../state/AuthContext';
import { Card, DarkButton, EmptyState, ErrorState, GhostButton, InlineError, InlineSuccess, Modal, SectionHeader, Skeleton, inputClass } from '../components/ui';
import { LEVELS } from '../lib/constants';
import type { CourseSummary } from '../types';

interface ScheduleForm {
  weekday: number;
  startTime: string;
  endTime: string;
  room: string;
}

const emptySchedule: ScheduleForm = { weekday: 1, startTime: '10:00', endTime: '12:00', room: '' };

/**
 * LMS. Students see the courses they are enrolled in; staff see every course in
 * their department and can create or archive them.
 */
export const LMSView = ({ onOpenCourse }: { onOpenCourse: (courseId: string) => void }) => {
  const { user } = useAuth();
  const isStaff = user?.role !== 'student';
  const { data, loading, error, refetch } = useResource<{ courses: CourseSummary[] }>('/api/courses');
  const [showCreate, setShowCreate] = useState(false);
  const [created, setCreated] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const [form, setForm] = useState({
    code: '',
    title: '',
    level: 'ND I',
    creditUnits: 3,
    description: '',
    topicsText: '',
  });
  const [schedule, setSchedule] = useState<ScheduleForm | null>(null);

  const create = useAction(async () => {
    setFormError(null);
    const topics = form.topicsText
      .split('\n')
      .map((t) => t.trim())
      .filter(Boolean);
    await apiPost('/api/courses', {
      code: form.code.trim().toUpperCase(),
      title: form.title.trim(),
      level: form.level,
      creditUnits: Number(form.creditUnits) || 3,
      description: form.description.trim(),
      topics,
      schedules: schedule ? [schedule] : [],
    });
    setCreated(`${form.code.toUpperCase()} created — the ${form.level} cohort was enrolled automatically.`);
    setForm({ code: '', title: '', level: 'ND I', creditUnits: 3, description: '', topicsText: '' });
    setSchedule(null);
    setShowCreate(false);
    refetch();
  });

  const archive = useAction(async (courseId: string) => {
    await apiDelete(`/api/courses/${courseId}`);
    refetch();
  });

  if (loading) return <div className="p-4"><Skeleton rows={3} /></div>;
  if (error) return <ErrorState message={error} onRetry={refetch} />;

  const courses = data?.courses ?? [];

  return (
    <div className="p-4 space-y-4 animate-in fade-in">
      <SectionHeader
        title={isStaff ? 'Department Courses' : 'My Courses'}
        action={isStaff ? '+ New Course' : undefined}
        onAction={isStaff ? () => setShowCreate(true) : undefined}
      />

      {created && <InlineSuccess message={created} />}
      <InlineError message={create.error} />

      {courses.length === 0 ? (
        <EmptyState
          icon="📚"
          title={isStaff ? 'No courses yet' : 'You are not enrolled in any course yet'}
          hint={
            isStaff
              ? 'Create a course to publish topics, materials and assignments to your cohort.'
              : 'Once your department publishes courses for your level, they will appear here.'
          }
          action={isStaff ? <DarkButton onClick={() => setShowCreate(true)}>Create your first course</DarkButton> : undefined}
        />
      ) : (
        <div className="grid gap-4">
          {courses.map((course) => (
            <Card key={course.id} onClick={() => onOpenCourse(course.id)}>
              <div className="flex justify-between items-start mb-3">
                <div>
                  <span className="bg-blue-100 text-blue-700 text-[10px] font-bold px-2 py-1 rounded">{course.code}</span>
                  <h3 className="font-bold text-gray-800 dark:text-white mt-2">{course.title}</h3>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    {course.level} • {course.creditUnits} credits
                    {course.department ? ` • ${course.department}` : ''}
                  </p>
                </div>
                {!isStaff && (
                  <div className="text-right">
                    <span className="text-xs text-gray-500 dark:text-gray-400">Progress</span>
                    <p className="font-bold text-ksitmb dark:text-blue-400">{course.progress ?? 0}%</p>
                  </div>
                )}
                {isStaff && (
                  <div className="text-right text-[10px] text-gray-500">
                    <p className="font-bold text-gray-700 dark:text-gray-200">{course.enrolledCount ?? 0} students</p>
                    <p>{course.assignmentCount ?? 0} assignments</p>
                    <p>{course.materialCount ?? 0} materials</p>
                  </div>
                )}
              </div>

              {!isStaff && (
                <>
                  <div className="w-full bg-gray-200 dark:bg-slate-700 rounded-full h-1.5 mb-4">
                    <div
                      className="bg-ksitmb dark:bg-blue-500 h-1.5 rounded-full"
                      style={{ width: `${course.progress ?? 0}%` }}
                    />
                  </div>
                  <div className="flex justify-between items-center text-xs text-gray-500 dark:text-gray-400">
                    <span>{course.nextClass ? `Next: ${course.nextClass}` : 'No class scheduled'}</span>
                    <span className="text-ksitmo font-bold">View Materials</span>
                  </div>
                </>
              )}

              {isStaff && user?.role !== 'lecturer' && (
                <div className="flex justify-end mt-2">
                  <GhostButton
                    onClick={(e) => {
                      e.stopPropagation();
                      void archive.run(course.id).catch((err) => setFormError(errorMessage(err)));
                    }}
                  >
                    {archive.running ? 'Archiving…' : 'Archive'}
                  </GhostButton>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {showCreate && (
        <Modal title="Create Course" onClose={() => setShowCreate(false)} wide>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <input
                placeholder="Code (COM 311)"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                className={inputClass}
              />
              <select
                value={form.level}
                onChange={(e) => setForm({ ...form, level: e.target.value })}
                className={inputClass}
              >
                {LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </select>
            </div>
            <input
              placeholder="Course title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className={inputClass}
            />
            <textarea
              placeholder="Short description"
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className={inputClass}
            />
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-[10px] uppercase font-bold text-gray-500">Credit units</span>
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={form.creditUnits}
                  onChange={(e) => setForm({ ...form, creditUnits: Number(e.target.value) })}
                  className={inputClass}
                />
              </label>
              <div className="flex items-end">
                <GhostButton
                  onClick={() => setSchedule(schedule ? null : { ...emptySchedule })}
                  className="w-full"
                >
                  {schedule ? 'Remove timetable slot' : '+ Add timetable slot'}
                </GhostButton>
              </div>
            </div>

            {schedule && (
              <div className="grid grid-cols-2 gap-3 bg-gray-50 dark:bg-slate-900 p-3 rounded-lg">
                <select
                  value={schedule.weekday}
                  onChange={(e) => setSchedule({ ...schedule, weekday: Number(e.target.value) })}
                  className={inputClass}
                >
                  {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((day, i) => (
                    <option key={day} value={i}>
                      {day}
                    </option>
                  ))}
                </select>
                <input
                  placeholder="Room"
                  value={schedule.room}
                  onChange={(e) => setSchedule({ ...schedule, room: e.target.value })}
                  className={inputClass}
                />
                <input
                  type="time"
                  value={schedule.startTime}
                  onChange={(e) => setSchedule({ ...schedule, startTime: e.target.value })}
                  className={inputClass}
                />
                <input
                  type="time"
                  value={schedule.endTime}
                  onChange={(e) => setSchedule({ ...schedule, endTime: e.target.value })}
                  className={inputClass}
                />
              </div>
            )}

            <div>
              <p className="text-[10px] uppercase font-bold text-gray-500 mb-1">Topics (one per line)</p>
              <textarea
                rows={4}
                placeholder={'Process Scheduling\nMemory Management'}
                value={form.topicsText}
                onChange={(e) => setForm({ ...form, topicsText: e.target.value })}
                className={inputClass}
              />
            </div>

            <InlineError message={formError} />
            <InlineError message={create.error} />

            <DarkButton onClick={() => void create.run()} disabled={create.running || !form.code || !form.title}>
              {create.running ? 'Creating…' : 'Create Course'}
            </DarkButton>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default LMSView;
