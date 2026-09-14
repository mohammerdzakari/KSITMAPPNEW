import { useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, apiGet, errorMessage } from '../lib/api';
import { useDebounced } from '../lib/hooks';
import {LEVELS} from '../lib/constants';
import { useAuth } from '../state/AuthContext';
import { CameraCapture } from '../components/CameraCapture';
import { InlineError } from '../components/ui';
import type { Department, Portal } from '../types';
import Logo from '../components/Logo';

interface Props {
  portal: Portal;
  staffCode?: string;
  onBack: () => void;
}

const initialForm = {
  email: '',
  password: '',
  firstName: '',
  lastName: '',
  matricNumber: '',
  departmentId: '',
  level: 'ND I',
  staffId: '',
  avatar: '',
  dateOfBirth: '',
  username: '',
  phone: '',
  isHOD: false,
};

export const AuthView = ({ portal, staffCode, onBack }: Props) => {
  const { login, register } = useAuth();
  const [step, setStep] = useState(1);
  const [isRegistering, setIsRegistering] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [showCamera, setShowCamera] = useState(false);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [departmentsError, setDepartmentsError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState(initialForm);

  useEffect(() => {
    let active = true;
    apiGet<{ departments: Department[] }>('/api/auth/departments')
      .then((res) => active && setDepartments(res.departments))
      .catch((err) => active && setDepartmentsError(errorMessage(err, 'Could not load departments.')));
    return () => {
      active = false;
    };
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, Department[]>();
    for (const dept of departments) {
      const list = map.get(dept.category) ?? [];
      list.push(dept);
      map.set(dept.category, list);
    }
    return [...map.entries()];
  }, [departments]);

  // --- Username availability (real database check, debounced) ---
  const debouncedUsername = useDebounced(form.username, 400);
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle');

  useEffect(() => {
    if (!isRegistering || portal !== 'student') return;
    if (debouncedUsername.length < 3) {
      setUsernameStatus('idle');
      return;
    }
    let active = true;
    setUsernameStatus('checking');
    apiGet<{ available: boolean; reason?: string }>(
      `/api/auth/username-available?username=${encodeURIComponent(debouncedUsername)}`,
    )
      .then((res) => {
        if (!active) return;
        setUsernameStatus(res.available ? 'available' : res.reason ? 'invalid' : 'taken');
      })
      .catch(() => active && setUsernameStatus('idle'));
    return () => {
      active = false;
    };
  }, [debouncedUsername, isRegistering, portal]);

  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => setForm((prev) => ({ ...prev, avatar: String(reader.result) }));
    reader.readAsDataURL(file);
  };

  const applyError = (err: unknown) => {
    setError(errorMessage(err));
    setFieldErrors(err instanceof ApiError ? err.fields : {});
  };

  const handleRegisterStep1 = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setStep(2);
  };

  const handleRegisterStep2 = async (e: React.FormEvent) => {
    e.preventDefault();
    if (portal === 'student' && usernameStatus === 'taken') return;
    setLoading(true);
    setError(null);
    try {
      await register({
        portal,
        email: form.email.trim(),
        password: form.password,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        phone: form.phone.trim() || undefined,
        avatar: form.avatar ? { data: form.avatar, name: 'avatar', mimeType: 'image/jpeg' } : undefined,
        matricNumber: portal === 'student' ? form.matricNumber.trim() : undefined,
        departmentId: portal === 'student' || form.isHOD ? form.departmentId : undefined,
        level: portal === 'student' ? form.level : undefined,
        username: portal === 'student' ? form.username : undefined,
        dateOfBirth: portal === 'student' ? form.dateOfBirth : undefined,
        staffId: portal === 'staff' ? form.staffId.trim() : undefined,
        accessCode: portal === 'staff' ? staffCode : undefined,
        isHOD: portal === 'staff' ? form.isHOD : undefined,
      });
    } catch (err) {
      applyError(err);
      setStep(1);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setFieldErrors({});
    try {
      await login(portal, form.email.trim(), form.password);
    } catch (err) {
      applyError(err);
    } finally {
      setLoading(false);
    }
  };

  if (showCamera) {
    return (
      <CameraCapture
        onCapture={(img) => {
          setForm((prev) => ({ ...prev, avatar: img }));
          setShowCamera(false);
        }}
        onClose={() => setShowCamera(false)}
        overlayText="Take Profile Photo"
      />
    );
  }

  // --- Step 2: complete the student profile ---
  if (isRegistering && step === 2) {
    return (
      <div className="min-h-screen bg-ksitmb text-white p-6 flex flex-col items-center justify-center">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl shadow-[0_0_20px_rgba(34,197,94,0.5)]">
              ✓
            </div>
            <h2 className="text-xl font-bold">Details Captured</h2>
            <p className="text-blue-200 text-sm mt-1">Please complete your profile.</p>
          </div>

          <form onSubmit={handleRegisterStep2} className="space-y-5">
            {portal === 'student' ? (
              <>
                <div>
                  <label className="block text-xs font-bold text-blue-300 uppercase mb-1">Date of Birth</label>
                  <input
                    type="date"
                    required
                    value={form.dateOfBirth}
                    onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-ksitmo focus:ring-1 focus:ring-ksitmo outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-blue-300 uppercase mb-1">Choose Username</label>
                  <div className="relative">
                    <input
                      type="text"
                      required
                      value={form.username}
                      onChange={handleUsernameChange}
                      placeholder="unique_username"
                      className={`w-full bg-white/5 border rounded-xl px-4 py-3 text-white outline-none ${
                        usernameStatus === 'taken'
                          ? 'border-red-500'
                          : usernameStatus === 'available'
                            ? 'border-green-500'
                            : 'border-white/10 focus:border-ksitmo'
                      }`}
                    />
                    <div className="absolute right-3 top-3.5">
                      {usernameStatus === 'checking' && (
                        <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                      )}
                      {usernameStatus === 'available' && <span className="text-green-500 text-xs font-bold">Available</span>}
                      {usernameStatus === 'taken' && <span className="text-red-500 text-xs font-bold">Not Available</span>}
                      {usernameStatus === 'invalid' && <span className="text-red-500 text-xs font-bold">Reserved</span>}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-center text-gray-300">Staff profile ready to be created.</p>
            )}

            <InlineError message={error} />

            <button
              type="submit"
              disabled={loading || (portal === 'student' && usernameStatus === 'taken')}
              className="w-full bg-ksitmo text-white font-bold py-4 rounded-xl shadow-lg hover:bg-orange-600 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Creating Profile…' : 'Complete Registration'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // --- Step 1 / Login ---
  return (
    <div className="min-h-screen bg-ksitmb text-white p-6 flex flex-col justify-center overflow-y-auto">
      <div className="w-full max-w-sm mx-auto">
        <div className="flex justify-center mb-6">
          <Logo className="w-20 h-20 bg-white rounded-xl p-1 shadow-lg" />
        </div>
        <h2 className="text-2xl font-bold text-center mb-2">
          {isRegistering ? `Create ${portal === 'student' ? 'Student' : 'Staff'} Account` : 'Welcome Back'}
        </h2>
        <p className="text-center text-blue-200 text-sm mb-8">
          {isRegistering ? 'Enter your details to get started' : 'Sign in to access your dashboard'}
        </p>

        {portal === 'staff' && staffCode && isRegistering && (
          <p className="text-center text-[11px] text-green-400 mb-4">✓ Staff access code verified</p>
        )}

        <form onSubmit={isRegistering ? handleRegisterStep1 : handleLogin} className="space-y-4">
          {isRegistering && (
            <>
              <div className="flex justify-center mb-4">
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  accept="image/*"
                  onChange={handleFileUpload}
                />
                <div className="relative group cursor-pointer">
                  <div
                    className="w-24 h-24 rounded-full bg-white/10 border-2 border-dashed border-white/30 flex items-center justify-center overflow-hidden hover:bg-white/20 transition-colors"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {form.avatar ? (
                      <img src={form.avatar} className="w-full h-full object-cover" alt="Avatar preview" />
                    ) : (
                      <span className="text-4xl opacity-50">🖼️</span>
                    )}
                  </div>
                  <div
                    className="absolute bottom-0 right-0 bg-ksitmo p-2 rounded-full shadow-md z-10 hover:scale-110 transition-transform"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowCamera(true);
                    }}
                    role="button"
                    aria-label="Take a photo"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                      />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                </div>
              </div>
              <p className="text-xs text-blue-200 -mt-2 mb-4 text-center">Tap icon to upload or button for camera</p>

              <div className="grid grid-cols-2 gap-3">
                <input
                  required
                  placeholder="First Name"
                  value={form.firstName}
                  onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                  className="bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:border-ksitmo outline-none"
                />
                <input
                  required
                  placeholder="Last Name"
                  value={form.lastName}
                  onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                  className="bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:border-ksitmo outline-none"
                />
              </div>

              {portal === 'student' && (
                <>
                  <input
                    required
                    placeholder="Matric Number"
                    value={form.matricNumber}
                    onChange={(e) => setForm({ ...form, matricNumber: e.target.value.toUpperCase() })}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:border-ksitmo outline-none"
                  />
                  {departmentsError ? (
                    <p className="text-xs text-red-400">{departmentsError}</p>
                  ) : (
                    <select
                      required
                      value={form.departmentId}
                      onChange={(e) => setForm({ ...form, departmentId: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-ksitmo outline-none appearance-none"
                    >
                      <option value="" className="text-gray-900">
                        {departments.length ? 'Select Department' : 'Loading departments…'}
                      </option>
                      {grouped.map(([category, list]) => (
                        <optgroup key={category} label={category} className="text-gray-900">
                          {list.map((dept) => (
                            <option key={dept.id} value={dept.id} className="text-gray-900">
                              {dept.name}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  )}
                  <select
                    required
                    value={form.level}
                    onChange={(e) => setForm({ ...form, level: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-ksitmo outline-none appearance-none"
                  >
                    {LEVELS.map((level) => (
                      <option key={level} value={level} className="text-gray-900">
                        {level}
                      </option>
                    ))}
                  </select>
                </>
              )}

              {portal === 'staff' && (
                <>
                  <input
                    required
                    placeholder="Staff ID Code"
                    value={form.staffId}
                    onChange={(e) => setForm({ ...form, staffId: e.target.value.toUpperCase() })}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:border-ksitmo outline-none"
                  />

                  <div className="flex items-center gap-3 bg-white/5 p-3 rounded-lg border border-white/10">
                    <input
                      type="checkbox"
                      id="isHOD"
                      checked={form.isHOD}
                      onChange={(e) => setForm({ ...form, isHOD: e.target.checked })}
                      className="w-5 h-5 accent-ksitmo"
                    />
                    <label htmlFor="isHOD" className="text-sm text-gray-200">
                      Are you a Head of Department (HOD)?
                    </label>
                  </div>
                  {form.isHOD && (
                    <p className="text-[11px] text-blue-300 -mt-2">
                      HOD access is granted after an administrator confirms your appointment.
                    </p>
                  )}

                  {form.isHOD && (
                    <select
                      required
                      value={form.departmentId}
                      onChange={(e) => setForm({ ...form, departmentId: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-ksitmo outline-none appearance-none"
                    >
                      <option value="" className="text-gray-900">
                        Select Department
                      </option>
                      {grouped.map(([category, list]) => (
                        <optgroup key={category} label={category} className="text-gray-900">
                          {list.map((dept) => (
                            <option key={dept.id} value={dept.id} className="text-gray-900">
                              {dept.name}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  )}
                </>
              )}
            </>
          )}

          <div>
            <input
              type="email"
              required
              placeholder={
                portal === 'student'
                  ? 'School Email (e.g. name@student.ksitm.edu.ng)'
                  : 'Work Email (e.g. name@ksitm.edu.ng)'
              }
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:border-ksitmo outline-none"
            />
            <p className="mt-1.5 text-[11px] leading-snug text-gray-400">
              Any <span className="text-gray-200">@ksitm.edu.ng</span> address is accepted, including
              subdomains such as <span className="text-gray-200">@student.ksitm.edu.ng</span>. Accounts
              are separated by portal rather than by address: students sign in through the Student
              portal, staff through the Staff portal.
            </p>
          </div>
          <input
            type="password"
            required
            minLength={isRegistering ? 8 : undefined}
            placeholder={isRegistering ? 'Password (min. 8 characters)' : 'Password'}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:border-ksitmo outline-none"
          />

          <InlineError message={error} />
          {Object.keys(fieldErrors).length > 0 && (
            <ul className="text-[11px] text-red-300 space-y-1">
              {Object.entries(fieldErrors).map(([key, msg]) => (
                <li key={key}>
                  <span className="font-bold capitalize">{key.replace(/^\w/, (c) => c.toUpperCase())}</span>: {msg}
                </li>
              ))}
            </ul>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-ksitmo text-white font-bold py-3.5 rounded-lg shadow-lg hover:bg-orange-600 transition-all active:scale-95 disabled:opacity-70 mt-4"
          >
            {loading ? (isRegistering ? 'Creating…' : 'Signing in…') : isRegistering ? 'Next' : 'Sign In'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            onClick={() => {
              setIsRegistering(!isRegistering);
              setStep(1);
              setError(null);
              setFieldErrors({});
            }}
            className="text-sm text-blue-200 hover:text-white underline"
          >
            {isRegistering ? 'Already have an account? Sign In' : 'New here? Create Account'}
          </button>
        </div>

        <button onClick={onBack} className="mt-8 text-xs text-white/30 hover:text-white/50 w-full text-center">
          Change Role
        </button>
      </div>
    </div>
  );
};

export default AuthView;
