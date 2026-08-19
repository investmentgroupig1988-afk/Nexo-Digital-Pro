import { customFetch } from "./custom-fetch";

export type AccessSummary = {
  hasAccess: boolean;
  plan: "FOUNDERS_LIFETIME" | "MONTHLY_PRO" | null;
  accessType: "ADMIN_MANUAL" | "PAYMENT" | "PROMOTION" | null;
  status: "PENDING" | "ACTIVE" | "REVOKED" | "EXPIRED" | null;
  grantedAt: string | null;
  expiresAt: string | null;
};

export type AccountUser = {
  id: string;
  email: string;
  username: string;
  name: string;
  role: "user" | "admin" | string;
  status: "active" | "blocked" | string;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
};

export type AccountResponse = {
  user: AccountUser;
  access: AccessSummary;
};

export type AuthenticationInput = {
  email: string;
  password: string;
};

export type RegistrationInput = AuthenticationInput & {
  username: string;
  name?: string;
};

export type AdminUser = Pick<AccountUser, "id" | "email" | "username" | "role" | "status" | "createdAt" | "lastLoginAt"> & {
  access: AccessSummary;
};

export type AdminAuditEntry = {
  id: string;
  actorUserId: string | null;
  targetUserId: string | null;
  action: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

const jsonRequest = {
  responseType: "json" as const,
  headers: { "content-type": "application/json" },
};

export function register(input: RegistrationInput, signal?: AbortSignal): Promise<unknown> {
  return customFetch("/api/auth/register", {
    ...jsonRequest,
    method: "POST",
    body: JSON.stringify(input),
    signal,
  });
}

export function login(input: AuthenticationInput, signal?: AbortSignal): Promise<unknown> {
  return customFetch("/api/auth/login", {
    ...jsonRequest,
    method: "POST",
    body: JSON.stringify(input),
    signal,
  });
}

export function logout(signal?: AbortSignal): Promise<unknown> {
  return customFetch("/api/auth/logout", { ...jsonRequest, method: "POST", signal });
}

export function getAccount(signal?: AbortSignal): Promise<AccountResponse> {
  return customFetch<AccountResponse>("/api/me", { responseType: "json", signal });
}

export function getMyAccess(signal?: AbortSignal): Promise<{ access: AccessSummary }> {
  return customFetch<{ access: AccessSummary }>("/api/access/me", { responseType: "json", signal });
}

export function getAdminUsers(query = "", signal?: AbortSignal): Promise<{ users: AdminUser[] }> {
  const params = new URLSearchParams({ limit: "100" });
  if (query.trim()) params.set("q", query.trim());
  return customFetch<{ users: AdminUser[] }>(`/api/admin/users?${params.toString()}`, { responseType: "json", signal });
}

export function getAdminAudit(signal?: AbortSignal): Promise<{ audit: AdminAuditEntry[] }> {
  return customFetch<{ audit: AdminAuditEntry[] }>("/api/admin/audit?limit=100", { responseType: "json", signal });
}

export function grantLifetimeAccess(userId: string, reason?: string): Promise<{ access: AccessSummary }> {
  return customFetch(`/api/admin/users/${encodeURIComponent(userId)}/grant-access`, {
    ...jsonRequest,
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export function revokeAccess(userId: string, reason?: string): Promise<{ access: AccessSummary }> {
  return customFetch(`/api/admin/users/${encodeURIComponent(userId)}/revoke-access`, {
    ...jsonRequest,
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export function restoreAccess(userId: string, reason?: string): Promise<{ access: AccessSummary }> {
  return customFetch(`/api/admin/users/${encodeURIComponent(userId)}/restore-access`, {
    ...jsonRequest,
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export function setUserBlocked(userId: string, blocked: boolean, reason?: string): Promise<{ user: Pick<AccountUser, "id" | "status"> }> {
  return customFetch(`/api/admin/users/${encodeURIComponent(userId)}/${blocked ? "block" : "unblock"}`, {
    ...jsonRequest,
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}
