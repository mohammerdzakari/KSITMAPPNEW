export type Role = 'student' | 'lecturer' | 'hod' | 'admin';

export const STAFF_ROLES: Role[] = ['lecturer', 'hod', 'admin'];
export const ALL_ROLES: Role[] = ['student', 'lecturer', 'hod', 'admin'];

export interface DbUser {
  id: string;
  email: string;
  passwordHash: string;
  role: Role;
  firstName: string;
  lastName: string;
  avatarFileId: string | null;
  phone: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface SessionUser {
  id: string;
  email: string;
  role: Role;
  firstName: string;
  lastName: string;
  avatarFileId: string | null;
  isActive: boolean;
}

export interface DepartmentRef {
  id: string;
  name: string;
  category: string;
}
