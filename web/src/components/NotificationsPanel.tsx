import { apiDelete, apiPost } from '../lib/api';
import { useAction, useResource } from '../lib/hooks';
import { EmptyState, ErrorState, GhostButton, InlineError, Skeleton } from './ui';
import { relativeTime } from '../lib/format';
import type { AppNotification } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onRefreshed: () => void;
}

const ICONS: Record<string, string> = {
  assignment: '📝',
  grade: '🎓',
  result: '🎓',
  announcement: '📢',
  material: '📁',
  message: '💬',
  moderation: '🛡️',
  attendance: '✅',
  community: '👥',
  system: '🔔',
};

export const NotificationsPanel = ({ isOpen, onClose, onRefreshed }: Props) => {
  const { data, loading, error, refetch } = useResource<{ notifications: AppNotification[]; unread: number }>(
    isOpen ? '/api/notifications' : null,
    [isOpen],
  );

  const markAll = useAction(async () => {
    await apiPost('/api/notifications/read', {});
    refetch();
    onRefreshed();
  });

  const markOne = useAction(async (id: string) => {
    await apiPost('/api/notifications/read', { id });
    refetch();
    onRefreshed();
  });

  const remove = useAction(async (id: string) => {
    await apiDelete(`/api/notifications/${id}`);
    refetch();
    onRefreshed();
  });

  if (!isOpen) return null;

  return (
    <div className="absolute inset-0 z-50 bg-white dark:bg-slate-900 flex flex-col animate-in slide-in-from-right duration-200">
      <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="p-2 -ml-2 rounded-full hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-600 dark:text-gray-300"
            aria-label="Close notifications"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h2 className="font-bold text-lg text-gray-800 dark:text-white">Notifications</h2>
        </div>
        <GhostButton onClick={() => void markAll.run().catch(() => undefined)} disabled={markAll.running}>
          Mark all read
        </GhostButton>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        <InlineError message={markAll.error ?? markOne.error} />
        {loading && <Skeleton rows={3} />}
        {error && <ErrorState message={error} onRetry={refetch} />}
        {!loading && !error && data && data.notifications.length === 0 && (
          <EmptyState icon="🔔" title="Nothing new" hint="Grades, announcements and messages will show up here." />
        )}
        {data?.notifications.map((notification) => {
          const unread = notification.readAt === null;
          return (
            <div
              key={notification.id}
              className={`flex gap-3 p-3 rounded-xl border ${
                unread
                  ? 'bg-orange-50 dark:bg-slate-800 border-orange-100 dark:border-orange-900/30'
                  : 'bg-white dark:bg-slate-800 border-gray-100 dark:border-slate-700'
              }`}
            >
              <span className="text-xl">{ICONS[notification.kind] ?? '🔔'}</span>
              <div className="flex-1">
                <p className="text-sm font-bold text-gray-800 dark:text-white">{notification.title}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{notification.body}</p>
                <p className="text-[10px] text-gray-400 mt-1">{relativeTime(notification.createdAt)}</p>
              </div>
              <div className="flex flex-col items-end gap-2">
                {unread ? (
                  <button
                    onClick={() => void markOne.run(notification.id).catch(() => undefined)}
                    className="w-2.5 h-2.5 bg-red-500 rounded-full"
                    aria-label="Mark as read"
                  />
                ) : (
                  <button
                    onClick={() => void remove.run(notification.id).catch(() => undefined)}
                    className="text-[10px] text-gray-400 hover:text-red-500"
                  >
                    Dismiss
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default NotificationsPanel;
