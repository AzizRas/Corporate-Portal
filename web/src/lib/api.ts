export class ApiError extends Error {
  constructor(public status: number, public code: string, public body: any) { super(code); }
}

async function call<T = any>(method: string, url: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method, credentials: 'same-origin', headers: {} };
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) { (init.headers as any)['content-type'] = 'application/json'; init.body = JSON.stringify(body); }
  const r = await fetch(url, init);
  const ct = r.headers.get('content-type') || '';
  const data = ct.includes('json') ? await r.json().catch(() => ({})) : await r.text();
  if (!r.ok) {
    if (r.status === 401 && !url.endsWith('/api/login')) window.dispatchEvent(new Event('session-expired'));
    throw new ApiError(r.status, (data && data.error) || 'error', data);
  }
  return data as T;
}

export const api = {
  get: <T = any>(u: string) => call<T>('GET', u),
  post: <T = any>(u: string, b?: unknown) => call<T>('POST', u, b ?? {}),
  put: <T = any>(u: string, b?: unknown) => call<T>('PUT', u, b ?? {}),
  patch: <T = any>(u: string, b?: unknown) => call<T>('PATCH', u, b ?? {}),
  del: <T = any>(u: string) => call<T>('DELETE', u),
  upload: <T = any>(u: string, form: FormData) => call<T>('POST', u, form),
};

export function download(url: string) {
  const a = document.createElement('a');
  a.href = url; a.download = ''; document.body.appendChild(a); a.click(); a.remove();
}
