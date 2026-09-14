import crypto from 'node:crypto';

export function newId(): string {
  return crypto.randomUUID();
}

/** Stable, random, URL-safe access code (used for attendance sessions). */
export function accessCode(length = 6): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}
