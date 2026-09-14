import bcrypt from 'bcryptjs';
import { badRequest } from '../http/errors.js';

const ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}

/**
 * Enforces the password policy for the whole app.
 * Kept conservative but real: 8+ chars with letters and a digit.
 */
export function assertPasswordStrength(password: string): void {
  if (typeof password !== 'string' || password.length < 8) {
    throw badRequest('Password must be at least 8 characters long.');
  }
  if (password.length > 200) {
    throw badRequest('Password is too long.');
  }
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    throw badRequest('Password must contain at least one letter and one number.');
  }
}
