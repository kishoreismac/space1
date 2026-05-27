import { useAuth } from '../stores/auth';

export class ApiError extends Error {
  status: number;
  details?: unknown;
  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

interface ApiOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  auth?: boolean;
}

async function refreshAccessToken(): Promise<string | null> {
  const { refreshToken, setSession, clear } = useAuth.getState();
  if (!refreshToken) return null;
  const res = await fetch('/api/auth/refresh', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) {
    clear();
    return null;
  }
  const data = await res.json();
  setSession(data);
  return data.accessToken as string;
}

export async function api<T = unknown>(
  path: string,
  { method = 'GET', body, auth = true }: ApiOptions = {},
): Promise<T> {
  const doFetch = async (token: string | null): Promise<Response> => {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (auth && token) headers.authorization = `Bearer ${token}`;
    return fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  };

  let token = useAuth.getState().accessToken;
  let res = await doFetch(token);

  if (res.status === 401 && auth) {
    token = await refreshAccessToken();
    if (token) res = await doFetch(token);
  }

  if (res.status === 204) return undefined as T;

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, data.error ?? res.statusText, data.details);
  }
  return data as T;
}
