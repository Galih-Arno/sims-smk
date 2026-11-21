import type { ApiErrorBody, AuthUserDto, LoginResponse } from "@sims/shared";

const ACCESS_KEY = "sims.accessToken";
const SESSION_KEY = "sims.session";
const SESSION_EXPIRED = "sims:session-expired";

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
  }
}

export function hasSessionFlag(): boolean {
  return sessionStorage.getItem(SESSION_KEY) === "1";
}

function saveAccessToken(accessToken: string): void {
  sessionStorage.setItem(ACCESS_KEY, accessToken);
  sessionStorage.setItem(SESSION_KEY, "1");
}

export function clearSession(): void {
  sessionStorage.removeItem(ACCESS_KEY);
  sessionStorage.removeItem(SESSION_KEY);
}

function expireSession(): void {
  clearSession();
  window.dispatchEvent(new Event(SESSION_EXPIRED));
}

export function onSessionExpired(listener: () => void): () => void {
  window.addEventListener(SESSION_EXPIRED, listener);
  return () => window.removeEventListener(SESSION_EXPIRED, listener);
}

let refreshRequest: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  refreshRequest ??= requestRefresh().finally(() => {
    refreshRequest = null;
  });
  return refreshRequest;
}

async function requestRefresh(): Promise<boolean> {
  const response = await fetch("/api/v1/auth/refresh", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: "{}",
  });

  if (!response.ok) {
    expireSession();
    return false;
  }

  const data = (await response.json()) as LoginResponse;
  saveAccessToken(data.accessToken);
  return true;
}

function apiErrorMessage(payload: ApiErrorBody | null): string {
  const message = payload?.error.message ?? "Permintaan gagal diproses.";
  const details = payload?.error.details;
  if (!Array.isArray(details)) return message;
  const extra = details
    .map((item) => {
      if (typeof item === "object" && item && "message" in item && typeof item.message === "string") return item.message;
      return "";
    })
    .filter((item) => item.length > 0 && item !== message);
  return extra.length > 0 ? `${message} ${extra.join(" ")}` : message;
}

async function parseError(response: Response): Promise<ApiClientError> {
  const payload = (await response.json().catch(() => null)) as ApiErrorBody | null;
  return new ApiClientError(
    response.status,
    payload?.error.code ?? "REQUEST_FAILED",
    apiErrorMessage(payload),
  );
}

export async function api<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const accessToken = sessionStorage.getItem(ACCESS_KEY);
  if (accessToken) {
    headers.set("authorization", `Bearer ${accessToken}`);
  }

  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers,
      credentials: "include",
    });
  } catch {
    throw new ApiClientError(0, "NETWORK", "Tidak dapat terhubung ke server.");
  }

  if (response.status === 401 && retry) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      return api<T>(path, init, false);
    }
    throw new ApiClientError(401, "UNAUTHENTICATED", "Sesi berakhir. Silakan masuk kembali.");
  }

  if (response.status === 204) {
    return undefined as T;
  }

  if (!response.ok) {
    throw await parseError(response);
  }

  return (await response.json()) as T;
}

export async function apiBlob(path: string, retry = true): Promise<{ blob: Blob; filename: string }> {
  const headers = new Headers();
  const accessToken = sessionStorage.getItem(ACCESS_KEY);
  if (accessToken) headers.set("authorization", `Bearer ${accessToken}`);
  let response: Response;
  try {
    response = await fetch(path, { headers, credentials: "include" });
  } catch {
    throw new ApiClientError(0, "NETWORK", "Tidak dapat terhubung ke server.");
  }
  if (response.status === 401 && retry) {
    const refreshed = await refreshAccessToken();
    if (refreshed) return apiBlob(path, false);
    throw new ApiClientError(401, "UNAUTHENTICATED", "Sesi berakhir. Silakan masuk kembali.");
  }
  if (!response.ok) throw await parseError(response);
  const match = /filename="([^"]+)"/.exec(response.headers.get("content-disposition") ?? "");
  return { blob: await response.blob(), filename: match?.[1] ?? "rapor.pdf" };
}

export async function loginRequest(email: string, password: string): Promise<AuthUserDto> {
  let response: Response;
  try {
    response = await fetch("/api/v1/auth/login", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
  } catch {
    throw new ApiClientError(0, "NETWORK", "Tidak dapat terhubung ke server.");
  }

  if (!response.ok) {
    throw await parseError(response);
  }

  const data = (await response.json()) as LoginResponse;
  saveAccessToken(data.accessToken);
  return data.user;
}

export async function logoutRequest(): Promise<void> {
  try {
    await fetch("/api/v1/auth/logout", {
      method: "POST",
      credentials: "include",
    });
  } finally {
    clearSession();
  }
}

export async function restoreSession(): Promise<AuthUserDto | null> {
  if (!hasSessionFlag()) {
    return null;
  }

  try {
    const data = await api<{ user: AuthUserDto }>("/api/v1/auth/me");
    return data.user;
  } catch {
    return null;
  }
}
