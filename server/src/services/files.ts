import { config } from '../config.js';
import { query, queryOne } from '../db/index.js';
import { newId } from '../lib/id.js';
import { badRequest, notFound, tooLarge } from '../http/errors.js';

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const DOCUMENT_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv',
  'application/zip',
]);

export type FileKind = 'image' | 'document' | 'any';

export interface StoredFile {
  id: string;
  name: string;
  mime: string;
  size: number;
}

export function fileUrl(id: string | null | undefined): string | null {
  return id ? `/api/files/${id}` : null;
}

function assertKind(mime: string, kind: FileKind): void {
  if (kind === 'any') return;
  if (kind === 'image' && IMAGE_TYPES.has(mime)) return;
  if (kind === 'document' && (DOCUMENT_TYPES.has(mime) || IMAGE_TYPES.has(mime))) return;
  throw badRequest(`Unsupported file type "${mime}".`);
}

export async function storeBuffer(options: {
  name: string;
  mime: string;
  data: Buffer;
  ownerId?: string | null;
  kind?: FileKind;
}): Promise<StoredFile> {
  const kind = options.kind ?? 'any';
  const mime = String(options.mime || '').toLowerCase();
  assertKind(mime, kind);
  if (!options.data || options.data.length === 0) {
    throw badRequest('The uploaded file is empty.');
  }
  if (options.data.length > config.maxUploadBytes) {
    throw tooLarge(
      `File is too large. The maximum size is ${Math.round(config.maxUploadBytes / (1024 * 1024))} MB.`,
    );
  }
  const id = newId();
  const name = String(options.name || 'upload').slice(0, 200);
  await query(
    `INSERT INTO files (id, owner_id, name, mime, size, data) VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, options.ownerId ?? null, name, mime, options.data.length, options.data],
  );
  return { id, name, mime, size: options.data.length };
}

/** Accepts either a data URL (camera/file input) or a raw base64 payload. */
export async function storeBase64(input: unknown, options: { ownerId?: string | null; kind?: FileKind; name?: string }): Promise<StoredFile | null> {
  if (!input) return null;
  if (typeof input === 'string') {
    // Legacy shape: a bare data URL string.
    return storeBase64({ data: input, name: options.name }, options);
  }
  const payload = input as { data?: string; name?: string; mimeType?: string };
  if (!payload.data) return null;

  let mime = payload.mimeType || '';
  let base64 = payload.data;
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(payload.data);
  if (match) {
    mime = match[1] || mime;
    base64 = match[3] || '';
  }
  const buffer = Buffer.from(base64, 'base64');
  return storeBuffer({
    name: payload.name || options.name || 'upload',
    mime,
    data: buffer,
    ownerId: options.ownerId,
    kind: options.kind,
  });
}

export interface StoredFileRow extends StoredFile {
  data: Buffer;
}

export async function getFile(id: string): Promise<StoredFileRow | null> {
  const row = await queryOne<{ id: string; name: string; mime: string; size: number; data: Buffer | Uint8Array }>(
    'SELECT id, name, mime, size, data FROM files WHERE id = $1',
    [id],
  );
  if (!row) return null;
  return { ...row, data: Buffer.isBuffer(row.data) ? row.data : Buffer.from(row.data) };
}

export async function assertFileExists(id: string): Promise<void> {
  const row = await queryOne<{ id: string }>('SELECT id FROM files WHERE id = $1', [id]);
  if (!row) throw notFound('That file no longer exists.');
}
