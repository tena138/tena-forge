import axios from "axios";
import Cookies from "js-cookie";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
export const AUTH_CHANGED_EVENT = "tena-auth-changed";
const PROFILE_STORAGE_KEY = "tena-auth-profile";
const ACCESS_TOKEN_STORAGE_KEY = "tena-access-token";

function readStoredAccessToken() {
  if (typeof window === "undefined") return null;
  try {
    const sessionToken = window.sessionStorage.getItem(ACCESS_TOKEN_STORAGE_KEY);
    if (sessionToken) return sessionToken;
  } catch {
    // Session storage is optional; fall back to local storage below.
  }
  try {
    return window.localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

let accessToken: string | null = readStoredAccessToken();
let refreshPromise: Promise<string | null> | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
  if (typeof window !== "undefined") {
    try {
      if (token) window.sessionStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, token);
      else window.sessionStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
    } catch {
      // Session storage is optional; in-memory auth still works for this tab.
    }
    try {
      if (token) window.localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, token);
      else window.localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
    } catch {
      // Local storage is optional; refresh cookies can still recover the session.
    }
  }
  if (token) Cookies.set("tf_logged_in", "1", { sameSite: "lax", expires: 30 });
  else Cookies.remove("tf_logged_in");
}

export function getAccessToken() {
  if (!accessToken) accessToken = readStoredAccessToken();
  return accessToken;
}

export async function refreshAccessToken() {
  if (!refreshPromise) {
    refreshPromise = axios
      .post(`${API_URL}/api/auth/refresh`, {}, { withCredentials: true })
      .then((response) => {
        const token = response.data?.access_token || null;
        setAccessToken(token);
        return token;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

export async function ensureAccessToken() {
  const storedToken = getAccessToken();
  if (storedToken) return storedToken;
  try {
    return await refreshAccessToken();
  } catch {
    return null;
  }
}

export function clearAuthState() {
  accessToken = null;
  Cookies.remove("tf_logged_in");
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
    } catch {
      // Ignore unavailable session storage.
    }
    try {
      window.localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
    } catch {
      // Ignore unavailable local storage.
    }
    localStorage.removeItem(PROFILE_STORAGE_KEY);
    window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
  }
}

export function storeAuthProfile(profile: unknown) {
  if (typeof window === "undefined") return;
  localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
  window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
}

export function readStoredAuthProfile<T>() {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    localStorage.removeItem(PROFILE_STORAGE_KEY);
    return null;
  }
}

export const authHttp = axios.create({
  baseURL: API_URL,
  withCredentials: true,
});

authHttp.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  config.headers["X-Requested-With"] = "XMLHttpRequest";
  return config;
});

authHttp.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config || {};
    const code = error.response?.data?.detail?.code;
    const path = String(original.url || "");
    const isPublicAuthRoute = [
      "/api/auth/login",
      "/api/auth/register",
      "/api/auth/register/code",
      "/api/auth/refresh",
      "/api/auth/forgot-password",
      "/api/auth/reset-password",
      "/api/auth/resend-verification",
      "/api/auth/verify-email",
      "/api/auth/2fa/backup-code",
    ].some((route) => path.startsWith(route));
    if (error.response?.status === 401 && !original._retry && !isPublicAuthRoute) {
      original._retry = true;
      try {
        const token = await refreshAccessToken();
        if (!token) throw new Error("Refresh did not return an access token");
        original.headers = { ...(original.headers || {}), Authorization: `Bearer ${token}` };
        return authHttp(original);
      } catch {
        clearAuthState();
      }
    }
    if (error.response?.status === 401 && code !== "TOKEN_EXPIRED" && typeof window !== "undefined" && !isPublicAuthRoute) {
      clearAuthState();
    }
    const detail = error.response?.data?.detail;
    const isSuspended = typeof detail === "string" && detail.includes("정지");
    if (error.response?.status === 403 && isSuspended && typeof window !== "undefined") {
      clearAuthState();
      window.location.href = "/login?message=suspended";
    }
    return Promise.reject(error);
  }
);
