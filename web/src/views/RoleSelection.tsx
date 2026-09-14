import { useState } from 'react';
import { apiPost, errorMessage } from '../lib/api';
import type { Portal } from '../types';
import Logo from '../components/Logo';

/**
 * Portal selection. Staff access is gated by a server-held access code — the
 * secret no longer lives in the client bundle.
 */
export const RoleSelectionView = ({
  onSelectRole,
  staffCode,
}: {
  onSelectRole: (role: Portal, staffCode?: string) => void;
  staffCode?: string;
}) => {
  const [showVerification, setShowVerification] = useState(false);
  const [accessCode, setAccessCode] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [checking, setChecking] = useState(false);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setChecking(true);
    setErrorMsg('');
    try {
      await apiPost('/api/auth/verify-access-code', { code: accessCode });
      onSelectRole('staff', accessCode);
    } catch (err) {
      setErrorMsg(errorMessage(err, 'Access denied.'));
    } finally {
      setChecking(false);
    }
  };

  if (showVerification) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-ksitmb text-white p-6 animate-in fade-in">
        <div className="w-full max-w-sm">
          <div className="bg-white/10 backdrop-blur-md border border-white/20 p-6 rounded-2xl shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-20 h-20 bg-ksitmo/20 rounded-full blur-2xl -mr-10 -mt-10" />

            <div className="flex flex-col items-center mb-6">
              <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center text-3xl mb-3 border border-white/10">
                🔒
              </div>
              <h2 className="text-xl font-bold">Staff Verification</h2>
              <p className="text-sm text-blue-200 text-center mt-1">Enter your staff access code to continue.</p>
            </div>

            <form onSubmit={handleVerify} className="space-y-4">
              <div>
                <input
                  type="password"
                  autoFocus
                  value={accessCode}
                  onChange={(e) => {
                    setAccessCode(e.target.value);
                    setErrorMsg('');
                  }}
                  placeholder="Enter Code (STF-...)"
                  className={`w-full bg-black/40 border ${
                    errorMsg ? 'border-red-500' : 'border-white/10'
                  } rounded-xl px-4 py-3 text-white placeholder-gray-500 outline-none focus:border-ksitmo transition-all font-mono tracking-wider text-center uppercase`}
                />
                {errorMsg && <p className="text-xs text-red-500 mt-2 font-bold text-center">{errorMsg}</p>}
              </div>

              <button
                type="submit"
                disabled={checking || accessCode.trim().length < 3}
                className="w-full bg-ksitmo text-white font-bold py-3 rounded-xl shadow-lg hover:bg-orange-600 transition-all active:scale-95 disabled:opacity-60"
              >
                {checking ? 'Verifying…' : 'Verify Access'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowVerification(false);
                  setAccessCode('');
                  setErrorMsg('');
                }}
                className="w-full text-xs text-gray-400 hover:text-white py-2"
              >
                Cancel
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

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
          onClick={() => (staffCode ? onSelectRole('staff', staffCode) : setShowVerification(true))}
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
