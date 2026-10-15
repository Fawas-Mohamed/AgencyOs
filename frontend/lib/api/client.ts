'use client';
import { useCallback, useEffect, useState } from 'react';
export class ApiFailure extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details: Record<string, unknown>,
    public readonly status: number,
  ) {
    super(message);
  }
}
const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? '/api';
export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  const multipart = options.body instanceof FormData;
  let response: Response;
  try {
    response = await fetch(base + path, {
      method: options.method ?? 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      signal: options.signal,
      headers: options.body && !multipart ? { 'Content-Type': 'application/json' } : undefined,
      body: options.body
        ? multipart
          ? (options.body as FormData)
          : JSON.stringify(options.body)
        : undefined,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiFailure('Unable to reach the server. Please retry.', 'NETWORK_ERROR', {}, 0);
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success)
    throw new ApiFailure(
      payload?.message ?? 'Request could not be completed',
      payload?.code ?? 'REQUEST_ERROR',
      payload?.details ?? {},
      response.status,
    );
  return payload.data as T;
}
export function useResource<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    if (!path) {
      setLoading(false);
      return () => controller.abort();
    }
    setLoading(true);
    setError(null);
    api<T>(path, { signal: controller.signal })
      .then(setData)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [path, version]);
  return { data, loading, error, reload };
}
