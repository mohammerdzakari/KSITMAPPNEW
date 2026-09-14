import { useState } from 'react';
import { useDebounced, useResource } from '../lib/hooks';
import { EmptyState, ErrorState, Skeleton } from './ui';
import type { SearchResults } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onNavigateToTutor: () => void;
  onOpenCourse: (courseId: string) => void;
  onStartChat: (userId: string) => void;
}

export const GlobalSearch = ({ isOpen, onClose, onNavigateToTutor, onOpenCourse, onStartChat }: Props) => {
  const [query, setQuery] = useState('');
  const debounced = useDebounced(query, 350);
  const { data, loading, error, refetch } = useResource<SearchResults>(
    isOpen && debounced.trim().length >= 2 ? `/api/search?q=${encodeURIComponent(debounced.trim())}` : null,
    [debounced],
  );

  if (!isOpen) return null;

  const isEmpty = debounced.trim().length >= 2 && data && Object.keys(data).length > 0 && !loading;
  const nothingFound =
    isEmpty &&
    !data!.courses.length &&
    !data!.announcements.length &&
    !data!.posts.length &&
    !data!.projects.length &&
    !data!.people.length;

  return (
    <div className="absolute inset-0 z-50 bg-white dark:bg-slate-900 flex flex-col animate-in fade-in duration-200">
      <div className="flex items-center gap-3 p-4 border-b border-gray-100 dark:border-slate-800">
        <button
          onClick={onClose}
          className="p-2 -ml-2 rounded-full hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-600 dark:text-gray-300"
          aria-label="Close search"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex-1 relative">
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search courses, posts, people…"
            className="w-full bg-gray-100 dark:bg-slate-800 text-gray-900 dark:text-white rounded-lg pl-10 pr-4 py-2.5 outline-none focus:ring-2 focus:ring-ksitmb dark:focus:ring-blue-500"
          />
          <div className="absolute left-3 top-3 text-gray-400">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {debounced.trim().length < 2 && (
          <div className="text-center py-12">
            <p className="text-sm text-gray-500 dark:text-gray-400">Type at least two characters to search.</p>
            <button onClick={onNavigateToTutor} className="mt-4 text-sm text-ksitmo font-bold hover:underline">
              Ask the AI Tutor instead →
            </button>
          </div>
        )}

        {loading && <Skeleton rows={3} />}
        {error && <ErrorState message={error} onRetry={refetch} />}
        {nothingFound && (
          <EmptyState icon="🔍" title="No results" hint="Try a course code, a name or a keyword." />
        )}

        {data && data.courses.length > 0 && (
          <div>
            <h3 className="text-sm font-bold text-gray-500 mb-3">Courses</h3>
            {data.courses.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  onOpenCourse(c.id);
                  onClose();
                }}
                className="w-full text-left bg-white dark:bg-slate-800 p-3 rounded-lg border dark:border-slate-700 mb-2"
              >
                <span className="font-bold text-sm text-gray-800 dark:text-white">{c.title}</span>
                <p className="text-[11px] text-gray-500">
                  {c.code} • {c.department} • {c.level}
                </p>
              </button>
            ))}
          </div>
        )}

        {data && data.announcements.length > 0 && (
          <div>
            <h3 className="text-sm font-bold text-gray-500 mb-3">Announcements</h3>
            {data.announcements.map((a) => (
              <div key={a.id} className="bg-white dark:bg-slate-800 p-3 rounded-lg border dark:border-slate-700 mb-2">
                <span className="font-bold text-sm text-gray-800 dark:text-white">{a.title}</span>
                <p className="text-[11px] text-gray-500 line-clamp-2">{a.content}</p>
              </div>
            ))}
          </div>
        )}

        {data && data.projects.length > 0 && (
          <div>
            <h3 className="text-sm font-bold text-gray-500 mb-3">Innovation Hub</h3>
            {data.projects.map((p) => (
              <div key={p.id} className="bg-white dark:bg-slate-800 p-3 rounded-lg border dark:border-slate-700 mb-2">
                <span className="font-bold text-sm text-gray-800 dark:text-white">{p.title}</span>
                <p className="text-[11px] text-gray-500">
                  {p.category} • {p.description.slice(0, 80)}
                </p>
              </div>
            ))}
          </div>
        )}

        {data && data.posts.length > 0 && (
          <div>
            <h3 className="text-sm font-bold text-gray-500 mb-3">Community posts</h3>
            {data.posts.map((p) => (
              <div key={p.id} className="flex gap-2 bg-white dark:bg-slate-800 p-3 rounded-lg border dark:border-slate-700 mb-2">
                <img src={p.avatarUrl} className="w-8 h-8 rounded-full bg-gray-200" alt="" />
                <div>
                  <p className="text-xs font-bold text-gray-800 dark:text-white">{p.authorName}</p>
                  <p className="text-[11px] text-gray-500 line-clamp-2">{p.content}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {data && data.people.length > 0 && (
          <div>
            <h3 className="text-sm font-bold text-gray-500 mb-3">People</h3>
            {data.people.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  onStartChat(p.id);
                  onClose();
                }}
                className="w-full text-left flex items-center gap-3 bg-white dark:bg-slate-800 p-3 rounded-lg border dark:border-slate-700 mb-2"
              >
                <img src={p.avatarUrl} className="w-9 h-9 rounded-full bg-gray-200" alt="" />
                <div className="flex-1">
                  <p className="text-xs font-bold text-gray-800 dark:text-white">{p.name}</p>
                  <p className="text-[10px] text-gray-500">
                    {p.identifier ?? p.role} {p.department ? `• ${p.department}` : ''}
                  </p>
                </div>
                <span className="text-[10px] font-bold text-ksitmo">Message</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default GlobalSearch;
