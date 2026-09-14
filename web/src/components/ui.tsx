import React from 'react';

/* ------------------------------------------------------------------ */
/* Shared building blocks — same visual language as the original app.  */
/* ------------------------------------------------------------------ */

export const SectionHeader = ({
  title,
  action,
  onAction,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
}) => (
  <div className="flex justify-between items-center mb-4">
    <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">{title}</h2>
    {action && (
      <button onClick={onAction} className="text-sm text-ksitmo font-medium hover:underline">
        {action}
      </button>
    )}
  </div>
);

interface CardProps {
  children?: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

export const Card: React.FC<CardProps> = ({ children, className = '', onClick }) => (
  <div
    onClick={onClick}
    className={`bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-slate-700 transition-colors ${
      onClick ? 'cursor-pointer' : ''
    } ${className}`}
  >
    {children}
  </div>
);

export const Spinner = ({ label = 'Loading…', className = '' }: { label?: string; className?: string }) => (
  <div className={`flex flex-col items-center justify-center py-10 gap-3 ${className}`}>
    <div className="w-7 h-7 border-[3px] border-gray-200 dark:border-slate-700 border-t-ksitmb dark:border-t-blue-400 rounded-full animate-spin" />
    <p className="text-xs text-gray-400">{label}</p>
  </div>
);

export const Skeleton = ({ rows = 3 }: { rows?: number }) => (
  <div className="space-y-3">
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-gray-100 dark:border-slate-700">
        <div className="h-3 bg-gray-100 dark:bg-slate-700 rounded w-1/3 mb-3 animate-pulse" />
        <div className="h-3 bg-gray-100 dark:bg-slate-700 rounded w-2/3 animate-pulse" />
      </div>
    ))}
  </div>
);

export const EmptyState = ({
  icon = '📭',
  title,
  hint,
  action,
}: {
  icon?: string;
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) => (
  <div className="flex flex-col items-center justify-center text-center py-10 px-6">
    <div className="text-3xl mb-2">{icon}</div>
    <p className="text-sm font-bold text-gray-700 dark:text-gray-200">{title}</p>
    {hint && <p className="text-xs text-gray-400 mt-1 max-w-[240px]">{hint}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);

export const ErrorState = ({ message, onRetry }: { message: string; onRetry?: () => void }) => (
  <div className="flex flex-col items-center justify-center text-center py-10 px-6">
    <div className="text-3xl mb-2">⚠️</div>
    <p className="text-sm font-bold text-red-600 dark:text-red-400">Something went wrong</p>
    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-[260px]">{message}</p>
    {onRetry && (
      <button
        onClick={onRetry}
        className="mt-4 text-xs font-bold bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-200 px-4 py-2 rounded-full hover:bg-gray-200 dark:hover:bg-slate-600"
      >
        Try again
      </button>
    )}
  </div>
);

export const InlineError = ({ message }: { message: string | null }) =>
  message ? (
    <p className="text-xs font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 rounded-lg px-3 py-2">
      {message}
    </p>
  ) : null;

export const InlineSuccess = ({ message }: { message: string | null }) =>
  message ? (
    <p className="text-xs font-semibold text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-900/30 rounded-lg px-3 py-2">
      {message}
    </p>
  ) : null;

export const Badge = ({
  children,
  tone = 'blue',
}: {
  children: React.ReactNode;
  tone?: 'blue' | 'orange' | 'green' | 'red' | 'purple' | 'gray';
}) => {
  const tones: Record<string, string> = {
    blue: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    orange: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
    green: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    red: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    purple: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
    gray: 'bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-gray-300',
  };
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${tones[tone]}`}>{children}</span>
  );
};

export const Modal = ({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) => (
  <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm">
    <div
      className={`bg-white dark:bg-slate-900 w-full ${
        wide ? 'sm:max-w-lg' : 'sm:max-w-sm'
      } max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl shadow-2xl`}
    >
      <div className="sticky top-0 bg-white dark:bg-slate-900 flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-slate-800">
        <h3 className="font-bold text-gray-800 dark:text-white">{title}</h3>
        <button
          onClick={onClose}
          className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-500 dark:text-gray-300"
          aria-label="Close"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="p-4">{children}</div>
    </div>
  </div>
);

export const Field = ({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) => (
  <label className="block">
    <span className="block text-xs font-bold text-blue-300 uppercase mb-1">{label}</span>
    {children}
    {hint && !error && <span className="block text-[10px] text-gray-400 mt-1">{hint}</span>}
    {error && <span className="block text-[10px] text-red-400 mt-1 font-semibold">{error}</span>}
  </label>
);

export const inputClass =
  'w-full bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg p-2.5 text-sm dark:text-white focus:border-ksitmo focus:ring-1 focus:ring-ksitmo outline-none';

export const darkInputClass =
  'w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:border-ksitmo outline-none';

export const PrimaryButton = ({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: React.ReactNode }) => (
  <button
    {...props}
    className={`w-full bg-ksitmo text-white font-bold py-3.5 rounded-lg shadow-lg hover:bg-orange-600 transition-all active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed ${
      props.className ?? ''
    }`}
  >
    {children}
  </button>
);

export const DarkButton = ({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: React.ReactNode }) => (
  <button
    {...props}
    className={`w-full bg-ksitmb dark:bg-blue-800 text-white font-bold py-3 rounded-xl shadow-lg hover:bg-blue-900 transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
      props.className ?? ''
    }`}
  >
    {children}
  </button>
);

export const GhostButton = ({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: React.ReactNode }) => (
  <button
    {...props}
    className={`bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 text-gray-700 dark:text-gray-200 text-xs font-bold px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-600 disabled:opacity-50 ${
      props.className ?? ''
    }`}
  >
    {children}
  </button>
);

/** Non-dismissable full-screen loader used while the session is restored. */
export const FullScreenLoader = ({ label }: { label: string }) => (
  <div className="flex flex-col items-center justify-center h-screen bg-ksitmb text-white gap-4">
    <div className="w-9 h-9 border-[3px] border-white/20 border-t-ksitmo rounded-full animate-spin" />
    <p className="text-xs text-blue-200 tracking-wide">{label}</p>
  </div>
);
