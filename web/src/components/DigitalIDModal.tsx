import type { ApiUser } from '../types';
import Logo from '../components/Logo';

/**
 * Digital student identity card. The QR is rendered by the API
 * (`/api/auth/id-card.png`) so the payload is generated server-side from the
 * stored profile rather than being assembled in the browser.
 */
export const DigitalIDModal = ({ profile, onClose }: { profile: ApiUser; onClose: () => void }) => {
  const student = profile.student;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl relative">
        <div className="bg-ksitmb h-24 relative p-4 flex items-center gap-3">
          <Logo className="w-12 h-12 bg-white rounded-lg p-1 object-contain" />
          <div>
            <h2 className="text-white font-bold text-lg leading-tight">KSITM</h2>
            <p className="text-blue-200 text-xs uppercase tracking-wider">Student Identity Card</p>
          </div>
          <div className="absolute right-0 top-0 w-32 h-32 bg-gradient-to-br from-white/10 to-transparent transform rotate-45 translate-x-10 -translate-y-10" />
        </div>
        <div className="px-6 pb-6 pt-12 relative text-center">
          <div className="absolute -top-12 left-1/2 transform -translate-x-1/2 w-24 h-24 rounded-xl border-4 border-white dark:border-slate-800 bg-gray-200 overflow-hidden shadow-md">
            <img src={profile.avatarUrl} className="w-full h-full object-cover" alt="" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">
            {profile.firstName} {profile.lastName}
          </h2>
          <p className="text-ksitmo font-bold text-sm mb-4">{student?.matricNumber}</p>
          <div className="grid grid-cols-2 gap-4 text-left bg-gray-50 dark:bg-slate-800 p-4 rounded-xl mb-6">
            <div>
              <p className="text-[10px] text-gray-400 uppercase font-bold">Department</p>
              <p className="text-xs font-bold text-gray-800 dark:text-gray-200 line-clamp-2">{student?.department}</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-400 uppercase font-bold">Level</p>
              <p className="text-xs font-bold text-gray-800 dark:text-gray-200">{student?.level}</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-400 uppercase font-bold">Session</p>
              <p className="text-xs font-bold text-gray-800 dark:text-gray-200">{student?.sessionLabel}</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-400 uppercase font-bold">Username</p>
              <p className="text-xs font-bold text-gray-800 dark:text-gray-200">@{student?.username ?? '—'}</p>
            </div>
          </div>
          <div className="flex flex-col items-center gap-2">
            <img
              src="/api/auth/id-card.png"
              className="w-28 h-28 bg-white p-1 rounded border border-gray-100 dark:border-slate-700"
              alt="Verification QR code"
            />
            <p className="text-[10px] text-gray-400">Scan to verify student status</p>
          </div>
        </div>
        <button onClick={onClose} className="absolute top-2 right-2 text-white/50 hover:text-white" aria-label="Close">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default DigitalIDModal;
