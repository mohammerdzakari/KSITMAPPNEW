import { useCallback, useEffect, useMemo, useState } from 'react';
import { AuthProvider, useAuth } from './state/AuthContext';
import RoleSelectionView from './views/RoleSelection';
import AuthView from './views/Auth';
import StudentDashboard from './views/StudentDashboard';
import AdminDashboard from './views/AdminDashboard';
import LMSView from './views/LMS';
import CourseDetail from './views/CourseDetail';
import AssignmentsView from './views/Assignments';
import CommunityContainer from './views/Community';
import ProfileView from './views/Profile';
import AITutor from './views/AITutor';
import GlobalSearch from './components/GlobalSearch';
import MessagesOverlay from './components/MessagesOverlay';
import NotificationsPanel from './components/NotificationsPanel';
import StudyRoomView from './components/StudyRoomView';
import Logo from './components/Logo';
import { NAV_ITEMS, ROLE_LANDING } from './lib/constants';
import type { StudyRoom } from './types';

/* Theme preference lives in localStorage: it is a display setting, never app data. */
const THEME_KEY = 'ksitm.theme';

const readTheme = () => (typeof localStorage !== 'undefined' && localStorage.getItem(THEME_KEY) === 'dark') || false;

export const App = () => {
  const { status, user, refresh } = useAuth();
  const [portal, setPortal] = useState<'student' | 'staff' | null>(null);
  const [authStep, setAuthStep] = useState<'select' | 'form'>('select');
  const [route, setRoute] = useState(() => window.location.hash.replace('#', '') || '/home');

  const [isDarkMode, setIsDarkMode] = useState(readTheme);
  const [searchOpen, setSearchOpen] = useState(false);
  const [messagesOpen, setMessagesOpen] = useState(false);
  const [messagePartner, setMessagePartner] = useState<string | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [activeRoom, setActiveRoom] = useState<StudyRoom | null>(null);
  const [messageUnread, setMessageUnread] = useState(0);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
    try {
      localStorage.setItem(THEME_KEY, isDarkMode ? 'dark' : 'light');
    } catch {
      /* storage unavailable — theme simply resets next visit */
    }
  }, [isDarkMode]);

  useEffect(() => {
    const onHashChange = () => setRoute(window.location.hash.replace('#', '') || '/home');
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const landing = useMemo(() => ROLE_LANDING[user?.role ?? 'student'], [user?.role]);
  const navigate = useCallback(
    (path: string) => {
      window.location.hash = path;
      setRoute(path);
    },
    [],
  );

  // After a sign-out, send the user back to the portal chooser.
  useEffect(() => {
    if (status === 'unauthenticated') {
      setAuthStep('select');
      setSearchOpen(false);
      setMessagesOpen(false);
      setNotificationsOpen(false);
      setActiveRoom(null);
    }
  }, [status]);

  // Keep the URL in sync with the role landing page once we know who is signed in.
  useEffect(() => {
    if (!user) return;
    const path = window.location.hash.replace('#', '');
    if (!path || path === '/' || path === '/home') {
      window.location.hash = landing;
      setRoute(landing);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, landing]);

  const currentTab = route.startsWith('/course/') ? 'LMS' : `/${route.split('/')[1] || 'home'}`;

  const openChatWith = (userId: string) => {
    if (!userId) return;
    setMessagePartner(userId);
    setMessagesOpen(true);
  };

  if (status === 'loading') {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-gray-50 dark:bg-slate-900">
        <Logo className="w-20 h-20 animate-pulse" />
        <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">Restoring your session…</p>
      </div>
    );
  }

  if (!user) {
    return authStep === 'select' ? (
      <RoleSelectionView
        onSelectRole={(selection) => {
          setPortal(selection);
          setAuthStep('form');
        }}
      />
    ) : (
      <AuthView
        portal={portal ?? 'student'}
        onBack={() => setAuthStep('select')}
      />
    );
  }

  const navItems = NAV_ITEMS[user.role === 'student' ? 'student' : 'staff'];

  return (
    <div className="h-full w-full max-w-md mx-auto bg-white dark:bg-slate-900 shadow-2xl relative overflow-hidden flex flex-col md:my-0 my-0 md:h-[850px] md:mt-5 md:rounded-[2rem] md:border-[8px] md:border-gray-800">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 px-5 pt-6 pb-3 flex justify-between items-center sticky top-0 z-20 border-b border-gray-100 dark:border-slate-800 transition-colors">
        <div className="flex items-center gap-3">
          <Logo alt="KSITM Logo" className="w-10 h-10 rounded-full object-contain bg-white p-0.5 border border-gray-100 dark:border-slate-700" />
          <h1 className="text-lg font-bold text-gray-800 dark:text-white tracking-tight">
            KSITM <span className="text-ksitmb dark:text-blue-400">App</span>
          </h1>
        </div>
        <div className="flex gap-4">
          <button onClick={() => setSearchOpen(true)} className="text-gray-400 hover:text-ksitmb dark:hover:text-blue-400" aria-label="Search">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </button>
          <button onClick={() => setNotificationsOpen(true)} className="text-gray-400 hover:text-ksitmb dark:hover:text-blue-400 relative" aria-label="Notifications">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
              />
            </svg>
            {(user.unreadNotifications > 0 || messageUnread > 0) && (
              <span className="absolute top-0 right-0 block h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-slate-900" />
            )}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-slate-900 scrollbar-hide pb-20 transition-colors">
        {route.startsWith('/course/') && (
          <CourseDetail courseId={route.split('/')[2]} onBack={() => navigate(landing)} />
        )}

        {!route.startsWith('/course/') && (
          <>
            {currentTab === '/home' &&
              (user.role === 'student' ? (
                <StudentDashboard onNavigate={navigate} />
              ) : (
                <AdminDashboard onNavigate={navigate} />
              ))}
            {currentTab === '/lms' && (
              <LMSView onOpenCourse={(id) => navigate(`/course/${id}`)} />
            )}
            {currentTab === '/assignments' && (
              <AssignmentsView onOpenCourse={(id) => navigate(`/course/${id}`)} />
            )}
            {currentTab === '/community' && <CommunityContainer onJoinRoom={(room) => setActiveRoom(room)} />}
            {currentTab === '/ai' && <AITutor />}
            {currentTab === '/profile' && (
              <ProfileView
                isDarkMode={isDarkMode}
                toggleDarkMode={() => setIsDarkMode((prev) => !prev)}
                onOpenNotifications={() => setNotificationsOpen(true)}
              />
            )}
          </>
        )}
      </div>

      {/* Floating messages button */}
      <button
        onClick={() => setMessagesOpen(true)}
        className="absolute bottom-24 right-4 z-30 w-14 h-14 bg-ksitmb dark:bg-blue-600 rounded-full shadow-xl flex items-center justify-center text-white hover:scale-105 transition-transform"
        aria-label="Messages"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
          <path
            fillRule="evenodd"
            d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z"
            clipRule="evenodd"
          />
        </svg>
        {messageUnread > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold h-5 min-w-5 px-1 rounded-full flex items-center justify-center">
            {messageUnread}
          </span>
        )}
      </button>

      {/* Bottom nav */}
      <div className="bg-white dark:bg-slate-900 border-t border-gray-200 dark:border-slate-800 px-2 py-3 flex justify-around items-center absolute bottom-0 w-full z-20 transition-colors">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => navigate(`/${item.path}`)}
            className={`flex flex-col items-center gap-1 px-3 py-1 rounded-xl transition-colors ${
              currentTab === `/${item.path}` ? 'text-ksitmb dark:text-blue-400' : 'text-gray-400'
            }`}
          >
            <span className="text-xl">{item.icon}</span>
            <span className="text-[10px] font-bold">{item.label}</span>
            {currentTab === `/${item.path}` && <div className="absolute -bottom-3 w-1 h-1 bg-ksitmb dark:bg-blue-400 rounded-full" />}
          </button>
        ))}
      </div>

      {/* Overlays */}
      <GlobalSearch
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
        onNavigateToTutor={() => {
          setSearchOpen(false);
          navigate('/ai');
        }}
        onOpenCourse={(id) => navigate(`/course/${id}`)}
        onStartChat={openChatWith}
      />

      <MessagesOverlay
        isOpen={messagesOpen}
        startWith={messagePartner || null}
        onStartHandled={() => setMessagePartner(null)}
        onUnread={setMessageUnread}
        onClose={() => {
          setMessagesOpen(false);
          void refresh().catch(() => undefined);
        }}
      />

      <NotificationsPanel
        isOpen={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
        onRefreshed={() => void refresh().catch(() => undefined)}
      />

      {activeRoom && <StudyRoomView room={activeRoom} onClose={() => setActiveRoom(null)} />}
    </div>
  );
};

const Root = () => (
  <AuthProvider>
    <App />
  </AuthProvider>
);

export default Root;
