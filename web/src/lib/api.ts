/**
 * Thin fetch wrapper around the KSITM API.
 * Every call is same-origin (`/api/...`) and uses the session cookie, so there
 * is nothing to store on the client between refreshes.
 */
export class ApiError extends Error {
  status: number;
  code: string;
  fields: Record<string, string>;

  constructor(status: number, message: string, code = 'error', details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    const fields =
      details && typeof details === 'object' && 'fields' in (details as Record<string, unknown>)
        ? ((details as { fields: Record<string, string> }).fields ?? {})
        : {};
    this.fields = fields;
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, signal } = options;
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
      signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new ApiError(0, 'Cannot reach the server. Check your connection and try again.', 'network');
  }

  const text = await response.text();
  let payload: any = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const message =
      payload?.error?.message ??
      (response.status === 401 ? 'You need to sign in again.' : `Request failed (${response.status}).`);
    throw new ApiError(response.status, message, payload?.error?.code ?? 'error', payload?.error?.details);
  }
  return payload as T;
}

export const apiGet = <T,>(path: string, signal?: AbortSignal) => api<T>(path, { signal });
export const apiPost = <T,>(path: string, body?: unknown) => api<T>(path, { method: 'POST', body: body ?? {} });
export const apiPatch = <T,>(path: string, body?: unknown) => api<T>(path, { method: 'PATCH', body: body ?? {} });
export const apiDelete = <T,>(path: string) => api<T>(path, { method: 'DELETE' });

/** Shape accepted by every upload field on the API. */
export interface FilePayload {
  data: string;
  name?: string;
  mimeType?: string;
}

export function fileToPayload(file: File): Promise<FilePayload> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve({ data: String(reader.result), name: file.name, mimeType: file.type || 'application/octet-stream' });
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.readAsDataURL(file);
  });
}

export function dataUrlToPayload(dataUrl: string, name = 'upload'): FilePayload {
  const mime = /^data:([^;,]+)/.exec(dataUrl)?.[1] ?? 'application/octet-stream';
  return { data: dataUrl, name, mimeType: mime };
}

export function errorMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
