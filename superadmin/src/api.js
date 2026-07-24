// Relative by default so a production build works unmodified when served from the same
// origin as the API (see server's app.js static-serving in cloud mode). Override with
// VITE_API_BASE_URL only for local dev against a separately-running cloud server.
const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

let token = localStorage.getItem('superadmin_token') || null;
let onUnauthorized = null;

export function setToken(next) {
  token = next;
  if (next) localStorage.setItem('superadmin_token', next);
  else localStorage.removeItem('superadmin_token');
}

export function getToken() {
  return token;
}

export function setOnUnauthorized(fn) {
  onUnauthorized = fn;
}

async function request(method, path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    if (res.status === 401) onUnauthorized?.();
    throw new ApiError(data?.error || `Request failed (${res.status})`, res.status);
  }
  return data;
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  patch: (path, body) => request('PATCH', path, body),
};
