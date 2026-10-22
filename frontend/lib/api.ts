const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export const getToken = () => { try { return localStorage.getItem('ml_token'); } catch { return null; } };
export const setToken = (t: string | null) => {
  try { t ? localStorage.setItem('ml_token', t) : localStorage.removeItem('ml_token'); } catch {}
};

async function raw(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  let res: Response;
  try {
    res = await fetch(BASE + path, { ...init, headers });
  } catch {
    throw new ApiError('Cannot reach the server. Check that the backend is running.', 0);
  }
  if (!res.ok) {
    const body: any = await res.json().catch(() => ({}));
    const msg = Array.isArray(body.message) ? body.message.join(', ') : body.message;
    if (res.status === 401 && token && !path.startsWith('/auth/')) {
      setToken(null);
      if (typeof window !== 'undefined') window.location.href = '/login';
    }
    throw new ApiError(msg || 'Request failed', res.status);
  }
  return res;
}

export async function api<T = any>(path: string, opts: { method?: string; body?: any; form?: FormData } = {}): Promise<T> {
  const init: RequestInit = { method: opts.method || (opts.body || opts.form ? 'POST' : 'GET') };
  if (opts.form) init.body = opts.form;
  else if (opts.body !== undefined) {
    init.body = JSON.stringify(opts.body);
    init.headers = { 'Content-Type': 'application/json' };
  }
  const res = await raw(path, init);
  return res.json();
}

/** Files need the login token, so we fetch them and open the result in a new tab. */
export async function openFile(path: string, download?: string) {
  const res = await raw(path);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  if (download) {
    const a = document.createElement('a');
    a.href = url; a.download = download; a.click();
  } else window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function fileUrl(path: string): Promise<string> {
  const res = await raw(path);
  return URL.createObjectURL(await res.blob());
}
