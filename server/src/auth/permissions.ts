import type { Role } from '../types.js';

/** Lecturer, HOD or system administrator. */
export function isStaff(role: Role): boolean {
  return role === 'lecturer' || role === 'hod' || role === 'admin';
}

/** Can approve/reject pending content and promote staff. */
export function canModerate(role: Role): boolean {
  return role === 'hod' || role === 'admin';
}

/** Full system administration (user management, all departments). */
export function isSystemAdmin(role: Role): boolean {
  return role === 'admin';
}
