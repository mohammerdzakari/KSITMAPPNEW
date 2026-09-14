import { useRef, useState } from 'react';
import { apiPatch, apiPost, dataUrlToPayload, errorMessage, fileToPayload } from '../lib/api';
import { useAction } from '../lib/hooks';
import { useAuth } from '../state/AuthContext';
import { CameraCapture } from '../components/CameraCapture';
import {
  Badge,
  Card,
  DarkButton,
  InlineError,
  InlineSuccess,
  Modal,
  inputClass,
} from '../components/ui';
import { fullDate } from '../lib/format';
import Logo from '../components/Logo';

export const ProfileView = ({
  isDarkMode,
  toggleDarkMode,
  onOpenNotifications,
}: {
  isDarkMode: boolean;
  toggleDarkMode: () => void;
  onOpenNotifications: () => void;
}) => {
  const { user, logout, refresh } = useAuth();
  const [editOpen, setEditOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  if (!user) return null;
  const isStudent = user.role === 'student';

  const handleLogout = async () => {
    setSigningOut(true);
    await logout();
  };

  if (showCamera) {
    return (
      <CameraCapture
        onCapture={async (img) => {
          setShowCamera(false);
          try {
            await apiPatch('/api/auth/me', { avatar: dataUrlToPayload(img, 'avatar.jpg') });
            await refresh();
            setMessage('Profile photo updated.');
          } catch (err) {
            setMessage(errorMessage(err));
          }
        }}
        onClose={() => setShowCamera(false)}
        overlayText="Take Profile Photo"
      />
    );
  }

  return (
    <div className="p-4 space-y-4 pb-20 animate-in fade-in">
      <div className="text-center py-6">
        <div className="relative inline-block">
          <img
            src={user.avatarUrl}
            className="w-24 h-24 rounded-full border-4 border-white dark:border-slate-700 shadow-lg mx-auto bg-gray-200 object-cover"
            alt=""
          />
          <button
            onClick={() => setShowCamera(true)}
            className="absolute bottom-0 right-0 bg-ksitmo text-white rounded-full p-1.5 shadow-md"
            aria-label="Change photo"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
              />
            </svg>
          </button>
        </div>
        <h2 className="text-xl font-bold mt-3 text-gray-800 dark:text-white">
          {user.firstName} {user.lastName}
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {isStudent ? user.student?.matricNumber : user.staff?.staffId}
        </p>
        {isStudent ? (
          <p className="text-xs text-blue-500 mt-1">
            {user.student?.department} • {user.student?.level}
            {user.student?.username ? ` • @${user.student.username}` : ''}
          </p>
        ) : (
          <p className="text-xs text-blue-500 mt-1">
            {user.staff?.department ?? 'No department set'} • {user.role.toUpperCase()}
          </p>
        )}
      </div>

      <InlineSuccess message={message} />

      <div className="grid grid-cols-3 gap-3">
        <Card className="text-center">
          <p className="text-lg font-bold text-ksitmb dark:text-blue-400">
            {isStudent ? (user.student?.resultsCount ? user.student?.cgpa.toFixed(2) : '—') : '—'}
          </p>
          <p className="text-[10px] uppercase font-bold text-gray-400">CGPA</p>
        </Card>
        <Card className="text-center">
          <p className="text-lg font-bold text-ksitmb dark:text-blue-400">{isStudent ? user.student?.enrolledCourses ?? 0 : '—'}</p>
          <p className="text-[10px] uppercase font-bold text-gray-400">Courses</p>
        </Card>
        <Card className="text-center">
          <p className="text-lg font-bold text-ksitmb dark:text-blue-400">{isStudent ? user.student?.streak ?? 0 : '—'}</p>
          <p className="text-[10px] uppercase font-bold text-gray-400">Day streak</p>
        </Card>
      </div>

      <Card className="space-y-1 divide-y divide-gray-100 dark:divide-slate-700">
        <div className="flex justify-between items-center py-3">
          <span className="text-sm font-medium text-gray-600 dark:text-gray-300">Dark Mode</span>
          <button
            onClick={toggleDarkMode}
            className={`w-12 h-6 rounded-full p-1 transition-colors ${isDarkMode ? 'bg-ksitmb' : 'bg-gray-300'}`}
            aria-label="Toggle dark mode"
          >
            <div
              className={`w-4 h-4 rounded-full bg-white shadow-sm transform transition-transform ${
                isDarkMode ? 'translate-x-6' : ''
              }`}
            />
          </button>
        </div>
        <button onClick={onOpenNotifications} className="flex justify-between items-center py-3 w-full cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700/50">
          <span className="text-sm font-medium text-gray-600 dark:text-gray-300">Notifications</span>
          {user.unreadNotifications > 0 ? (
            <span className="bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
              {user.unreadNotifications}
            </span>
          ) : (
            <span className="text-[10px] text-gray-400">All caught up</span>
          )}
        </button>
        <button
          onClick={() => setEditOpen(true)}
          className="flex justify-between items-center py-3 w-full cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700/50"
        >
          <span className="text-sm font-medium text-gray-600 dark:text-gray-300">Edit Profile</span>
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
              clipRule="evenodd"
            />
          </svg>
        </button>
        <button
          onClick={() => setPasswordOpen(true)}
          className="flex justify-between items-center py-3 w-full cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700/50"
        >
          <span className="text-sm font-medium text-gray-600 dark:text-gray-300">Change Password</span>
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </Card>

      <Card className="space-y-2 text-xs text-gray-500 dark:text-gray-400">
        <div className="flex justify-between">
          <span>Email</span>
          <span className="font-medium text-gray-700 dark:text-gray-200">{user.email}</span>
        </div>
        <div className="flex justify-between">
          <span>Phone</span>
          <span className="font-medium text-gray-700 dark:text-gray-200">{user.phone || 'Not set'}</span>
        </div>
        <div className="flex justify-between">
          <span>Account</span>
          <Badge tone={user.role === 'admin' ? 'purple' : user.role === 'student' ? 'blue' : 'orange'}>{user.role}</Badge>
        </div>
        <div className="flex justify-between">
          <span>Member since</span>
          <span className="font-medium text-gray-700 dark:text-gray-200">{fullDate(user.createdAt)}</span>
        </div>
      </Card>

      <button
        onClick={handleLogout}
        disabled={signingOut}
        className="w-full bg-red-50 text-red-600 font-bold py-3 rounded-xl hover:bg-red-100 transition-colors disabled:opacity-60"
      >
        {signingOut ? 'Signing out…' : 'Sign Out'}
      </button>

      <div className="text-center mt-8">
        <Logo className="w-8 h-8 mx-auto opacity-50 grayscale" />
        <p className="text-[10px] text-gray-400 mt-2">KSITM Super App v2.5.0</p>
      </div>

      {editOpen && (
        <EditProfileModal
          onClose={() => setEditOpen(false)}
          onDone={(msg) => {
            setEditOpen(false);
            setMessage(msg);
          }}
        />
      )}
      {passwordOpen && (
        <PasswordModal
          onClose={() => setPasswordOpen(false)}
          onDone={() => {
            setPasswordOpen(false);
            setMessage('Password changed. Other devices were signed out.');
          }}
        />
      )}
    </div>
  );
};

/* -------------------------------------------------------------------------- */

const EditProfileModal = ({ onClose, onDone }: { onClose: () => void; onDone: (message: string) => void }) => {
  const { user, refresh } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    firstName: user?.firstName ?? '',
    lastName: user?.lastName ?? '',
    phone: user?.phone ?? '',
    username: user?.student?.username ?? '',
    dateOfBirth: user?.student?.dateOfBirth ?? '',
  });
  const [avatar, setAvatar] = useState<string | null>(null);
  const save = useAction(async () => {
    await apiPatch('/api/auth/me', {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      phone: form.phone.trim() || null,
      username: user?.role === 'student' && form.username ? form.username : undefined,
      dateOfBirth: user?.role === 'student' && form.dateOfBirth ? form.dateOfBirth : undefined,
      avatar: avatar ? dataUrlToPayload(avatar, 'avatar.jpg') : undefined,
    });
    await refresh();
    onDone('Profile updated.');
  });

  return (
    <Modal title="Edit Profile" onClose={onClose}>
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <img
            src={avatar ?? user?.avatarUrl}
            className="w-16 h-16 rounded-full object-cover bg-gray-200"
            alt=""
          />
          <input
            type="file"
            accept="image/*"
            ref={fileRef}
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const payload = await fileToPayload(file);
              setAvatar(payload.data);
            }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            className="text-xs font-bold text-ksitmo hover:underline"
          >
            Upload new photo
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <input
            value={form.firstName}
            onChange={(e) => setForm({ ...form, firstName: e.target.value })}
            placeholder="First name"
            className={inputClass}
          />
          <input
            value={form.lastName}
            onChange={(e) => setForm({ ...form, lastName: e.target.value })}
            placeholder="Last name"
            className={inputClass}
          />
        </div>
        <input
          value={form.phone ?? ''}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
          placeholder="Phone number"
          className={inputClass}
        />
        {user?.role === 'student' && (
          <>
            <input
              value={form.username ?? ''}
              onChange={(e) =>
                setForm({ ...form, username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })
              }
              placeholder="Username"
              className={inputClass}
            />
            <input
              type="date"
              value={form.dateOfBirth ?? ''}
              onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })}
              className={inputClass}
            />
          </>
        )}
        <InlineError message={save.error} />
        <DarkButton onClick={() => void save.run().catch(() => undefined)} disabled={save.running}>
          {save.running ? 'Saving…' : 'Save changes'}
        </DarkButton>
      </div>
    </Modal>
  );
};

const PasswordModal = ({ onClose, onDone }: { onClose: () => void; onDone: () => void }) => {
  const [form, setForm] = useState({ currentPassword: '', newPassword: '' });
  const save = useAction(async () => {
    await apiPost('/api/auth/change-password', form);
    onDone();
  });
  return (
    <Modal title="Change Password" onClose={onClose}>
      <div className="space-y-3">
        <input
          type="password"
          placeholder="Current password"
          value={form.currentPassword}
          onChange={(e) => setForm({ ...form, currentPassword: e.target.value })}
          className={inputClass}
        />
        <input
          type="password"
          placeholder="New password (min. 8 characters)"
          value={form.newPassword}
          onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
          className={inputClass}
        />
        <InlineError message={save.error} />
        <DarkButton
          onClick={() => void save.run().catch(() => undefined)}
          disabled={save.running || !form.currentPassword || form.newPassword.length < 8}
        >
          {save.running ? 'Updating…' : 'Update password'}
        </DarkButton>
      </div>
    </Modal>
  );
};

export default ProfileView;
