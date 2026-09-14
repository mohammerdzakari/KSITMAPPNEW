import type { Portal } from '../types';
import Logo from '../components/Logo';

/**
 * Portal selection. Choosing a portal only decides which registration/sign-in
 * form is shown — staff accounts are still scoped to an institutional email and
 * start as lecturers, with HOD rights granted only through moderation.
 */
export const RoleSelectionView = ({ onSelectRole }: { onSelectRole: (role: Portal) => void }) => {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-ksitmb text-white p-6 animate-in fade-in duration-500">
      <div className="mb-10 text-center">
        <Logo className="w-24 h-24 mx-auto mb-4 bg-white rounded-xl p-1 shadow-lg border-2 border-white/20" />
        <h1 className="text-2xl font-bold tracking-tight">Welcome to KSITM</h1>
        <p className="text-blue-200 mt-2">Select your portal to continue</p>
      </div>

      <div className="w-full max-w-xs space-y-4">
        <button
          onClick={() => onSelectRole('student')}
          className="w-full bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/20 p-4 rounded-2xl flex items-center gap-4 transition-all group"
        >
          <div className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center text-2xl shadow-lg group-hover:scale-110 transition-transform">
            👨‍🎓
          </div>
          <div className="text-left">
            <h3 className="font-bold text-lg">Student Portal</h3>
            <p className="text-xs text-blue-200">Access LMS, Results &amp; Community</p>
          </div>
        </button>

        <button
          onClick={() => onSelectRole('staff')}
          className="w-full bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/20 p-4 rounded-2xl flex items-center gap-4 transition-all group"
        >
          <div className="w-12 h-12 bg-ksitmo rounded-full flex items-center justify-center text-2xl shadow-lg group-hover:scale-110 transition-transform">
            👔
          </div>
          <div className="text-left">
            <h3 className="font-bold text-lg">Staff Portal</h3>
            <p className="text-xs text-blue-200">Manage Courses &amp; Assignments</p>
          </div>
        </button>
      </div>

      <p className="mt-12 text-xs text-blue-400/50">
        Version 2.5.0 • Katsina State Institute of Technology &amp; Management
      </p>
    </div>
  );
};

export default RoleSelectionView;
