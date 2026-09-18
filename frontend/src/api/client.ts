import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';

// ── In-memory access token store ─────────────────────────────────────────────
let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

// ── Authenticated API client ─────────────────────────────────────────────────
const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // Always send cookies (refresh token)
});

/** Public API client for endpoints that don't require auth (e.g. itemLookup, /clock).
 *  Sends cookies so the public clock's device cookie rides along. No interceptors. */
export const apiPublic = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

/** Fired on window when the staff refresh fails while the kiosk owns the screen. */
export const KIOSK_HOST_EXPIRED_EVENT = 'kiosk:host-expired';

/**
 * The hosted kiosk must never bounce to /login: a tablet on the wall shows an
 * overlay and waits for a manager instead. Everywhere else, a dead refresh
 * means sign in again.
 */
export function shouldRedirectToLogin(pathname: string): boolean {
  return !(pathname === '/kiosk' || pathname.startsWith('/kiosk/'));
}

// Request interceptor: add Bearer token from memory
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

// Response interceptor: handle 401 with token refresh via httpOnly cookie
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (err: unknown) => void;
}> = [];

function processQueue(error: unknown, token: string | null = null): void {
  failedQueue.forEach((prom) => {
    if (token) {
      prom.resolve(token);
    } else {
      prom.reject(error);
    }
  });
  failedQueue = [];
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        // Queue this request until refresh completes
        return new Promise((resolve, reject) => {
          failedQueue.push({
            resolve: (token: string) => {
              if (originalRequest.headers) {
                originalRequest.headers.Authorization = `Bearer ${token}`;
              }
              resolve(api(originalRequest));
            },
            reject,
          });
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        // Refresh uses cookie - no body needed
        const { data } = await axios.post<{ access: string }>(
          '/api/auth/refresh/',
          {},
          { withCredentials: true },
        );
        accessToken = data.access;
        processQueue(null, data.access);

        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${data.access}`;
        }
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        accessToken = null;
        if (shouldRedirectToLogin(window.location.pathname)) {
          window.location.href = '/login';
        } else {
          window.dispatchEvent(new CustomEvent(KIOSK_HOST_EXPIRED_EVENT));
        }
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default api;
