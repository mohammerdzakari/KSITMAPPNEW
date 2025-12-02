




import React, { useState, useEffect } from 'react';
import { AppTab, StudentProfile, AdminProfile, UserRole, StudyRoom } from './types';
import AITutor from './AITutor';
import { CommunityContainer, LMSView, StudentDashboard, AdminDashboard, ProfileView, RoleSelectionView, AuthView, GlobalSearch, ChatOverlay, StudyRoomView, AssignmentsView } from './Views';
import { LOGO_URL, MOCK_PROFILE, MOCK_ADMIN_PROFILE } from './constants';

type AuthStep = 'SPLASH' | 'ROLE_SELECT' | 'LOGIN' | 'APP';

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>(AppTab.HOME);
  const [authStep, setAuthStep] = useState<AuthStep>('SPLASH');
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [userProfile, setUserProfile] = useState<StudentProfile | AdminProfile | null>(null);
  
  // New States
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [activeStudyRoom, setActiveStudyRoom] = useState<StudyRoom | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setAuthStep('ROLE_SELECT');
    }, 2500);
    
    // Load Dark Mode Preference
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
      setIsDarkMode(true);
    }

    return () => clearTimeout(timer);
  }, []);

  const toggleDarkMode = () => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    localStorage.setItem('theme', newMode ? 'dark' : 'light');
  };

  const handleRoleSelect = (role: UserRole) => {
    setUserRole(role);
    setAuthStep('LOGIN');
  };

  const handleAuthComplete = (data: any) => {
    if (userRole === 'admin') {
      const adminProfile: AdminProfile = {
        ...MOCK_ADMIN_PROFILE,
        firstName: data.firstName || MOCK_ADMIN_PROFILE.firstName,
        lastName: data.lastName || MOCK_ADMIN_PROFILE.lastName,
        email: data.email,
        department: data.department || MOCK_ADMIN_PROFILE.department,
        staffId: data.staffId || MOCK_ADMIN_PROFILE.staffId,
        avatar: data.avatar || MOCK_ADMIN_PROFILE.avatar,
        isHOD: data.isHOD || false
      };
      setUserProfile(adminProfile);
      setActiveTab(AppTab.ADMIN_DASHBOARD);
    } else {
      const studentProfile: StudentProfile = {
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        department: data.department,
        matricNumber: data.matricNumber,
        level: data.level,
        // Use uploaded avatar if available, otherwise generate one
        avatar: data.avatar || ('https://api.dicebear.com/7.x/avataaars/svg?seed=' + data.firstName),
        role: 'student',
        phone: '', 
        gpa: 3.50, 
        streak: 0,
        timetable: 'Mon 9AM - COM 111', 
        notifications: 1,
        results: 'Pending',
        username: data.username,
        dateOfBirth: data.dateOfBirth
      };
      setUserProfile(studentProfile);
      setActiveTab(AppTab.HOME);
    }
    setAuthStep('APP');
  };

  const renderContent = () => {
    if (!userProfile) return null;

    if (userProfile.role === 'student') {
      switch (activeTab) {
        case AppTab.HOME: return <StudentDashboard profile={userProfile as StudentProfile} onNavigate={setActiveTab} />;
        case AppTab.LMS: return <LMSView onNavigate={setActiveTab} />;
        case AppTab.ASSIGNMENTS: return <AssignmentsView userRole="student" profile={userProfile} onNavigate={setActiveTab} />;
        case AppTab.AI_TUTOR: return <AITutor />;
        case AppTab.COMMUNITY: return <CommunityContainer profile={userProfile} onJoinRoom={setActiveStudyRoom} />;
        case AppTab.PROFILE: return <ProfileView profile={userProfile} isDarkMode={isDarkMode} toggleDarkMode={toggleDarkMode} />;
        default: return <StudentDashboard profile={userProfile as StudentProfile} onNavigate={setActiveTab} />;
      }
    } else {
      switch (activeTab) {
        case AppTab.ADMIN_DASHBOARD: return <AdminDashboard profile={userProfile as AdminProfile} onNavigate={setActiveTab} />;
        case AppTab.ASSIGNMENTS: return <AssignmentsView userRole="admin" profile={userProfile} onNavigate={setActiveTab} />;
        case AppTab.COMMUNITY: return <CommunityContainer profile={userProfile} onJoinRoom={setActiveStudyRoom} />;
        case AppTab.PROFILE: return <ProfileView profile={userProfile} isDarkMode={isDarkMode} toggleDarkMode={toggleDarkMode} />;
        default: return <AdminDashboard profile={userProfile as AdminProfile} onNavigate={setActiveTab} />;
      }
    }
  };

  // --- Auth Flow Rendering ---
  if (authStep === 'SPLASH') {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-ksitmb text-white relative overflow-hidden">
        <div className="absolute -top-20 -right-20 w-64 h-64 bg-white opacity-5 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-20 -left-20 w-80 h-80 bg-ksitmo opacity-10 rounded-full blur-3xl"></div>
        <div className="animate-bounce mb-6">
          <img 
            src={LOGO_URL} 
            alt="KSITM Logo" 
            onError={(e) => e.currentTarget.src = "https://ui-avatars.com/api/?name=KSITM&background=002147&color=fff&size=128&bold=true"}
            className="w-32 h-32 object-contain rounded-xl shadow-lg border-2 border-white/20 bg-white" 
          />
        </div>
        <h1 className="text-lg font-bold text-center px-6 tracking-wide animate-pulse">Katsina State Institute of Technology & Management</h1>
      </div>
    );
  }

  if (authStep === 'ROLE_SELECT') {
    return <RoleSelectionView onSelectRole={handleRoleSelect} />;
  }

  if (authStep === 'LOGIN' && userRole) {
    return <AuthView role={userRole} onAuthComplete={handleAuthComplete} />;
  }

  // --- Main App ---
  return (
    <div className={`${isDarkMode ? 'dark' : ''} flex flex-col h-screen max-w-md mx-auto`}>
      <div className="flex flex-col h-full bg-gray-50 dark:bg-slate-900 border-x border-gray-200 dark:border-slate-800 overflow-hidden relative shadow-2xl transition-colors duration-300">
        
        {/* Global Search Overlay */}
        <GlobalSearch 
          isOpen={isSearchOpen} 
          onClose={() => setIsSearchOpen(false)} 
          onNavigateToTutor={() => {
            setIsSearchOpen(false);
            setActiveTab(AppTab.AI_TUTOR);
          }}
        />

        {/* Chat Overlay */}
        <ChatOverlay 
          isOpen={isChatOpen} 
          onClose={() => setIsChatOpen(false)} 
        />

        {/* Active Study Room */}
        {activeStudyRoom && (
          <StudyRoomView 
            room={activeStudyRoom} 
            onClose={() => setActiveStudyRoom(null)} 
          />
        )}

        {/* Top Bar (Only for specific tabs) */}
        {(activeTab === AppTab.HOME || activeTab === AppTab.LMS || activeTab === AppTab.COMMUNITY || activeTab === AppTab.ADMIN_DASHBOARD || activeTab === AppTab.ASSIGNMENTS) && (
          <div className="bg-ksitmb dark:bg-slate-950 text-white p-3 shadow-md sticky top-0 z-20">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <img 
                  src={LOGO_URL} 
                  alt="Logo" 
                  onError={(e) => e.currentTarget.src = "https://ui-avatars.com/api/?name=KSITM&background=002147&color=fff&size=64&bold=true"}
                  className="w-8 h-8 rounded bg-white p-0.5 object-contain" 
                />
                <div>
                  <h1 className="text-base font-bold tracking-wide leading-none">KSITM</h1>
                  <p className="text-[9px] text-gray-300 tracking-wider">SUPER APP</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={() => setIsChatOpen(true)}
                  className="p-2 text-blue-200 hover:text-white transition hover:bg-white/10 rounded-full relative"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  <div className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border border-ksitmb"></div>
                </button>
                <button 
                  onClick={() => setIsSearchOpen(true)}
                  className="p-2 text-blue-200 hover:text-white transition hover:bg-white/10 rounded-full"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </button>
                <button className="p-2 text-blue-200 hover:text-white transition hover:bg-white/10 rounded-full">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto scrollbar-hide bg-gray-50 dark:bg-slate-900 relative">
          {renderContent()}
        </main>

        {/* Bottom Navigation */}
        <nav className="bg-white dark:bg-slate-950 border-t border-gray-200 dark:border-slate-800 shadow-[0_-2px_10px_rgba(0,0,0,0.05)] sticky bottom-0 z-30 pb-safe">
          <div className="flex justify-around items-center h-16">
            {userRole === 'student' ? (
               <>
                  <NavItem tab={AppTab.HOME} activeTab={activeTab} setActiveTab={setActiveTab} label="Home" icon={<HomeIcon />} />
                  <NavItem tab={AppTab.LMS} activeTab={activeTab} setActiveTab={setActiveTab} label="LMS" icon={<LMSIcon />} />
                  <NavItem tab={AppTab.AI_TUTOR} activeTab={activeTab} setActiveTab={setActiveTab} label="Tutor" icon={<TutorIcon />} />
                  <NavItem tab={AppTab.COMMUNITY} activeTab={activeTab} setActiveTab={setActiveTab} label="Community" icon={<CommunityIcon />} />
                  <NavItem tab={AppTab.PROFILE} activeTab={activeTab} setActiveTab={setActiveTab} label="Profile" icon={<ProfileIcon />} />
               </>
            ) : (
               <>
                  <NavItem tab={AppTab.ADMIN_DASHBOARD} activeTab={activeTab} setActiveTab={setActiveTab} label="Dashboard" icon={<HomeIcon />} />
                  <NavItem tab={AppTab.ASSIGNMENTS} activeTab={activeTab} setActiveTab={setActiveTab} label="Assignments" icon={<LMSIcon />} />
                  <NavItem tab={AppTab.COMMUNITY} activeTab={activeTab} setActiveTab={setActiveTab} label="Community" icon={<CommunityIcon />} />
                  <NavItem tab={AppTab.PROFILE} activeTab={activeTab} setActiveTab={setActiveTab} label="Profile" icon={<ProfileIcon />} />
               </>
            )}
          </div>
        </nav>
      </div>
    </div>
  );
}

// Helper Components for Navigation
const NavItem = ({ tab, label, icon, activeTab, setActiveTab }: { tab: AppTab, label: string, icon: React.ReactNode, activeTab: AppTab, setActiveTab: (t: AppTab) => void }) => {
  const isActive = activeTab === tab;
  return (
    <button
      onClick={() => setActiveTab(tab)}
      className={`flex flex-col items-center justify-center w-full py-2 transition-colors duration-200 ${
        isActive ? 'text-ksitmb dark:text-blue-400' : 'text-gray-400 dark:text-gray-500 hover:text-ksitmb dark:hover:text-blue-300'
      }`}
    >
      <div className={`mb-1 ${isActive ? 'scale-110' : 'scale-100'} transition-transform duration-200`}>
        {icon}
      </div>
      <span className={`text-[10px] font-medium ${isActive ? 'font-bold' : ''}`}>{label}</span>
    </button>
  );
};

// Icons
const HomeIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>;
const LMSIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>;
const TutorIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>;
const CommunityIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>;
const ProfileIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>;