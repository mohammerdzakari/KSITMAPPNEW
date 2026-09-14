import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api, errorMessage } from './api';

/**
 * Declarative data fetching with loading / error / empty states and manual
 * re-validation. Backs every list in the app.
 */
export function useResource<T>(
  path: string | null,
  deps: unknown[] = [],
): {
  data: T | null;
  loading: boolean;
  error: string | null;
  isUnauthorized: boolean;
  setData: (updater: T | ((prev: T | null) => T | null)) => void;
  refetch: () => void;
} {
  const [data, setDataState] = useState<T | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const [error, setError] = useState<string | null>(null);
  const [isUnauthorized, setIsUnauthorized] = useState(false);
  const [nonce, setNonce] = useState(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!path) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    api<T>(path, { signal: controller.signal })
      .then((result) => {
        if (!mounted.current) return;
        setDataState(result);
        setIsUnauthorized(false);
      })
      .catch((err: unknown) => {
        if (!mounted.current || (err as Error).name === 'AbortError') return;
        if (err instanceof ApiError && err.status === 401) setIsUnauthorized(true);
        setError(errorMessage(err));
      })
      .finally(() => {
        if (mounted.current) setLoading(false);
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, nonce, ...deps]);

  const setData = useCallback((updater: T | ((prev: T | null) => T | null)) => {
    setDataState((prev) => (typeof updater === 'function' ? (updater as (p: T | null) => T | null)(prev) : updater));
  }, []);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  return { data, loading, error, isUnauthorized, setData, refetch };
}

/** Mutation helper: run an async action, track pending state and surface errors. */
export function useAction<A extends unknown[], R>(
  action: (...args: A) => Promise<R>,
): { run: (...args: A) => Promise<R | undefined>; running: boolean; error: string | null; clearError: () => void } {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (...args: A) => {
      setRunning(true);
      setError(null);
      try {
        return await action(...args);
      } catch (err) {
        setError(errorMessage(err));
        throw err;
      } finally {
        setRunning(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [action],
  );

  return { run, running, error, clearError: () => setError(null) };
}

export function useDebounced<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/** Polls an endpoint on an interval (used for chat + notification badges). */
export function usePolling(callback: () => void, intervalMs: number, enabled = true): void {
  const saved = useRef(callback);
  useEffect(() => {
    saved.current = callback;
  }, [callback]);
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => saved.current(), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, enabled]);
}
