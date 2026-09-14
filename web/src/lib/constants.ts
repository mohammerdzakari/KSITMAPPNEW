export const LOGO_URL = 'https://i.postimg.cc/HnsGKBX5/KSITM-LOGO.jpg';
/** Inline badge used when the hosted logo cannot be reached — keeps the app self-contained. */
export const LOGO_FALLBACK =
  'data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22128%22%20height%3D%22128%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2224%22%20fill%3D%22%23002147%22%2F%3E%3Ctext%20x%3D%2264%22%20y%3D%2272%22%20fill%3D%22%23ffffff%22%20font-family%3D%22Inter%2CArial%2Csans-serif%22%20font-size%3D%2228%22%20font-weight%3D%22700%22%20text-anchor%3D%22middle%22%3EKSITM%3C%2Ftext%3E%3C%2Fsvg%3E';

export const LEVELS = ['ND I', 'ND II', 'NID I', 'NID II'] as const;

export const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];


export const NAV_ITEMS = {
  student: [
    { id: 'home', icon: '🏠', label: 'Home', path: 'home' },
    { id: 'lms', icon: '📚', label: 'LMS', path: 'lms' },
    { id: 'ai', icon: '🤖', label: 'AI Tutor', path: 'ai' },
    { id: 'community', icon: '👥', label: 'Community', path: 'community' },
    { id: 'profile', icon: '👤', label: 'Profile', path: 'profile' },
  ],
  staff: [
    { id: 'home', icon: '🏠', label: 'Dashboard', path: 'home' },
    { id: 'lms', icon: '📚', label: 'LMS', path: 'lms' },
    { id: 'assignments', icon: '📝', label: 'Tasks', path: 'assignments' },
    { id: 'community', icon: '👥', label: 'Community', path: 'community' },
    { id: 'profile', icon: '👤', label: 'Profile', path: 'profile' },
  ],
} as const;

export const ROLE_LANDING: Record<string, string> = {
  student: '/home',
  lecturer: '/home',
  hod: '/home',
  admin: '/home',
};
