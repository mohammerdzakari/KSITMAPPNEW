/** Converts a snake_case identifier to camelCase. */
export function camelCase(input: string): string {
  return input.replace(/_([a-z0-9])/g, (_, ch: string) => ch.toUpperCase());
}

/**
 * Maps a database row (snake_case columns) into the camelCase shape the API
 * returns. Only the top level is converted — JSON payloads keep their keys.
 */
export function camelize<T = Record<string, unknown>>(row: Record<string, unknown> | null): T | null {
  if (!row) return null;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    out[camelCase(key)] = value;
  }
  return out as T;
}

export function camelizeRows<T = Record<string, unknown>>(rows: Record<string, unknown>[]): T[] {
  return rows.map((row) => camelize<T>(row) as T);
}
