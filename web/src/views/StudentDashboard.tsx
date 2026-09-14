import { useState } from 'react';
import { apiPost, errorMessage } from '../lib/api';
import { useResource } from '../lib/hooks';
import { relativeTime } from '../lib/format';
import { useAuth } from '../state/AuthContext';
import { CameraCapture } from '../components/CameraCapture';
import { DigitalIDModal } from '../components/DigitalIDModal';
import { Card, EmptyState, ErrorState, SectionHeader, Skeleton } from '../components/ui';
import type { Announcement } from '../types';

export const StudentDashboard = ({ onNavigate }: { onNavigate: (path: string) => void }) => {
  const { user } = useAuth();
  const [showID, setShowID] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [attendanceMessage, setAttendanceMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const { data, loading, error, refetch } = useResource<{ announcements: Announcement[] }>('/api/announcements');

  if (!user?.student) return null;
  const student = user.student;

  const handleScan = async (code: string) => {
    setShowScanner(false);
    try {
      const res = await apiPost<{ courseCode: string; courseTitle: string }>('/api/attendance/mark', { code });
      setAttendanceMessage({ ok: true, text: `Attendance marked for ${res.courseCode} — ${res.courseTitle}` });
    } catch (err) {
      setAttendanceMessage({ ok: false, text: errorMessage(err, 'Could not mark attendance.') });
    }
  };

  return (
    <div className="p-4 pb-20 space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-3">
          <div className="relative">
            <img
              src={user.avatarUrl}
              alt="Profile"
              className="w-14 h-14 rounded-full border-2 border-white dark:border-slate-700 shadow-md object-cover"
            />
            <div className="absolute bottom-0 right-0 w-4 h-4 bg-green-500 border-2 border-white dark:border-slate-900 rounded-full" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Hi, {user.firstName}</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {student.department} • {student.matricNumber}
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowID(true)}
          className="bg-white dark:bg-slate-800 p-2 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 active:scale-95 transition-transform"
          aria-label="Show digital ID"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-ksitmb dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2"
            />
          </svg>
        </button>
      </div>

      {showID && <DigitalIDModal profile={user} onClose={() => setShowID(false)} />}

      {showScanner && (
        <CameraCapture
          scanQr
          onCapture={() => undefined}
          onQrScan={handleScan}
          onClose={() => setShowScanner(false)}
          overlayText="Scan Class QR"
        />
      )}

      {attendanceMessage && (
        <div
          className={`text-xs font-bold px-4 py-3 rounded-xl border ${
            attendanceMessage.ok
              ? 'bg-green-50 text-green-700 border-green-100 dark:bg-green-900/20 dark:text-green-300 dark:border-green-900/30'
              : 'bg-red-50 text-red-700 border-red-100 dark:bg-red-900/20 dark:text-red-300 dark:border-red-900/30'
          }`}
        >
          {attendanceMessage.text}
          <button onClick={() => setAttendanceMessage(null)} className="ml-2 underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="bg-blue-50 dark:bg-slate-800/50 border-blue-100 dark:border-slate-700">
          <div className="text-blue-600 dark:text-blue-400 font-bold text-lg">
            {student.resultsCount > 0 ? student.cgpa.toFixed(2) : '—'}
          </div>
          <div className="text-[10px] text-gray-500 dark:text-gray-400 uppercase font-bold">CGPA</div>
        </Card>
        <Card className="bg-orange-50 dark:bg-orange-900/10 border-orange-100 dark:border-orange-900/20">
          <div className="text-orange-600 dark:text-orange-400 font-bold text-lg">{student.streak} 🔥</div>
          <div className="text-[10px] text-gray-500 dark:text-gray-400 uppercase font-bold">Streak</div>
        </Card>
        <Card className="bg-purple-50 dark:bg-purple-900/10 border-purple-100 dark:border-purple-900/20 col-span-1">
          <div className="text-purple-600 dark:text-purple-400 font-bold text-xs line-clamp-2">
            {student.nextClass ?? 'No class scheduled'}
          </div>
          <div className="text-[10px] text-gray-500 dark:text-gray-400 uppercase font-bold mt-1">Next Class</div>
        </Card>
      </div>

      {/* Quick Actions */}
      <div>
        <SectionHeader title="Quick Actions" />
        <div className="grid grid-cols-4 gap-4">
          <button onClick={() => setShowScanner(true)} className="flex flex-col items-center gap-2 group">
            <div className="w-14 h-14 bg-white dark:bg-slate-800 rounded-2xl flex items-center justify-center shadow-sm border border-gray-100 dark:border-slate-700 group-active:scale-95 transition-all text-2xl">
              📷
            </div>
            <span className="text-[10px] font-medium text-gray-600 dark:text-gray-400">Attendance</span>
          </button>
          <button onClick={() => onNavigate('/lms')} className="flex flex-col items-center gap-2 group">
            <div className="w-14 h-14 bg-white dark:bg-slate-800 rounded-2xl flex items-center justify-center shadow-sm border border-gray-100 dark:border-slate-700 group-active:scale-95 transition-all text-2xl">
              📚
            </div>
            <span className="text-[10px] font-medium text-gray-600 dark:text-gray-400">Courses</span>
          </button>
          <button onClick={() => onNavigate('/assignments')} className="flex flex-col items-center gap-2 group">
            <div className="w-14 h-14 bg-white dark:bg-slate-800 rounded-2xl flex items-center justify-center shadow-sm border border-gray-100 dark:border-slate-700 group-active:scale-95 transition-all text-2xl">
              📝
            </div>
            <span className="text-[10px] font-medium text-gray-600 dark:text-gray-400">Tasks</span>
          </button>
          <button onClick={() => onNavigate('/ai')} className="flex flex-col items-center gap-2 group">
            <div className="w-14 h-14 bg-gradient-to-br from-ksitmb to-blue-900 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-900/20 group-active:scale-95 transition-all text-2xl">
              🤖
            </div>
            <span className="text-[10px] font-bold text-ksitmb dark:text-blue-400">AI Tutor</span>
          </button>
        </div>
      </div>

      {/* Latest updates */}
      <SectionHeader title="Latest Updates" />
      <div className="space-y-3">
        {loading && <Skeleton rows={2} />}
        {error && <ErrorState message={error} onRetry={refetch} />}
        {!loading && !error && data && data.announcements.length === 0 && (
          <EmptyState
            icon="📢"
            title="No announcements yet"
            hint="Announcements from your department and the school will appear here."
          />
        )}
        {data?.announcements.map((announcement) => (
          <Card key={announcement.id}>
            <div className="flex gap-3">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                  announcement.type === 'academic'
                    ? 'bg-blue-100 text-blue-600'
                    : announcement.type === 'urgent'
                      ? 'bg-red-100 text-red-600'
                      : 'bg-orange-100 text-orange-600'
                }`}
              >
                {announcement.type === 'academic' ? '🎓' : announcement.type === 'urgent' ? '🚨' : '📢'}
              </div>
              <div>
                <h3 className="font-bold text-gray-800 dark:text-gray-200 text-sm">{announcement.title}</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">{announcement.content}</p>
                <p className="text-[10px] text-gray-400 mt-2">
                  {relativeTime(announcement.publishedAt ?? announcement.createdAt)}
                  {announcement.department ? ` • ${announcement.department}` : ' • Campus wide'}
                </p>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default StudentDashboard;
