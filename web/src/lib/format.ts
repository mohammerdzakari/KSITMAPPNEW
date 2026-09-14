/** "2 hrs ago" style timestamps, matching the original feed design. */
export function relativeTime(value: string | Date | null | undefined): string {
  if (!value) return '';
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return '';
  const diff = Date.now() - then;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return 'Just now';
  if (diff < hour) return `${Math.floor(diff / minute)} min ago`;
  if (diff < day) return `${Math.floor(diff / hour)} hr${diff < 2 * hour ? '' : 's'} ago`;
  if (diff < 7 * day) return `${Math.floor(diff / day)} day${diff < 2 * day ? '' : 's'} ago`;
  return new Date(then).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function shortTime(value: string | Date | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function fullDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function dateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return `${date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} • ${date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

export function deadlineLabel(value: string | Date): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No deadline';
  const diff = date.getTime() - Date.now();
  const day = 86_400_000;
  if (diff < 0) return `Closed ${relativeTime(date)}`;
  if (diff < day) return `Due today ${shortTime(date)}`;
  if (diff < 2 * day) return `Due tomorrow ${shortTime(date)}`;
  return `Due ${date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;
}

/** Local datetime -> ISO string for the API. */
export function toIso(date: string, time: string): string {
  if (!date) return '';
  const value = new Date(`${date}T${time || '23:59'}:00`);
  return Number.isNaN(value.getTime()) ? '' : value.toISOString();
}

export function toDateInput(value: string | Date): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function toTimeInput(value: string | Date): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
