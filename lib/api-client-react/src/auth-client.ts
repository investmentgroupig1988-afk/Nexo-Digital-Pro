import { customFetch } from "./custom-fetch";

export type AccessSummary = {
  hasAccess: boolean;
  plan: "FOUNDERS_LIFETIME" | "PARTNER" | "TESTER" | "COMPLIMENTARY" | "MONTHLY_PRO" | null;
  accessType: "ADMIN_MANUAL" | "PAYMENT" | "PROMOTION" | null;
  status: "pending" | "active" | "revoked" | "expired" | null;
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
  acceptTerms: true;
  adultConfirmed: true;
};

export type ConsumerRequestType = "WITHDRAWAL" | "SERVICE_CANCELLATION";
export type ConsumerRequestStatus = "PENDING" | "REVIEWING" | "APPROVED" | "REJECTED" | "COMPLETED";
export type ConsumerRequest = {
  id?: string;
  code: string;
  type: ConsumerRequestType;
  status: ConsumerRequestStatus;
  email?: string;
  paymentReference?: string | null;
  description?: string | null;
  adminNotes?: string | null;
  createdAt: string;
  updatedAt?: string;
};

export type SignalEngineHealth = {
  scheduler: { running: boolean; cycleRunning: boolean; startedAt: string | null; lastCycleStartedAt: string | null; lastCycleCompletedAt: string | null; nextRunAt: string | null; intervalMs: number };
  symbol: "BTCUSDT";
  provider: "binance";
  notifications: { lastDispatchAt: string | null; lastErrorAt: string | null };
  timeframes: Array<{ timeframe: "5m" | "15m" | "1h" | "4h"; provider: "binance"; symbol: "BTCUSDT"; lastScanAt: string | null; lastFetchAt: string | null; lastCandleAt: string | null; lastOutcome: "LONG" | "SHORT" | "NO_SIGNAL" | null; lastSignalCreatedAt: string | null; lastErrorAt: string | null; lastError: string | null }>;
};

export type AdminReadiness = {
  checkedAt: string;
  releaseReady: boolean;
  blockers: string[];
  database: { status: "OK" | "ERROR" };
  auth: { status: "OK" | "INCOMPLETE" };
  email: { configured: boolean };
  telegram: { configured: boolean; lastDispatchAt: string | null; lastErrorAt: string | null };
  signalScheduler: SignalEngineHealth["scheduler"] & { status: "OK" | "ERROR" | "STARTING" | "STALE" };
  marketProvider: { status: "OK" | "ERROR" | "STARTING"; provider: "binance"; symbol: "BTCUSDT"; lastFetchAt: string | null; lastCandleAt: string | null; lastScanAt: string | null };
  legal: { status: "OK" | "INCOMPLETE"; missing: string[] };
  featureGates: { argentinaPayments: "ENABLED" | "DISABLED"; xauusd: "DISABLED"; oneMinute: "DISABLED" };
  topology: { environment: "STAGING" | "PRODUCTION" | "LOCAL_OR_CUSTOM"; status: "OK" | "ERROR" | "INCOMPLETE"; isolated: boolean };
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
  actor: { username: string; email: string } | null;
  target: { username: string; email: string } | null;
};

export type PaymentRequestMethod = "MERCADO_PAGO_TRANSFER" | "USDT_TRC20";
export type PaymentRequestStatus = "PENDING" | "APPROVED" | "REJECTED" | "NEEDS_REVIEW";
export type PaymentProof = { fileName: string; mimeType: string; size: number; url: string };

export type PaymentRequest = {
  id: string;
  userId: string;
  method: PaymentRequestMethod;
  amount: string;
  currency: "ARS" | "USDT" | string;
  declaredPaidAt: string;
  referenceOrTxid: string;
  payerName: string | null;
  senderWallet: string | null;
  proof: PaymentProof | null;
  status: PaymentRequestStatus;
  notes: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminPaymentRequest = PaymentRequest & {
  user: { id: string; email: string; username: string } | null;
  reviewer: { id: string; email: string; username: string } | null;
};

export type CreatePaymentRequestInput = {
  method: PaymentRequestMethod;
  amount: string;
  declaredPaidAt: string;
  referenceOrTxid: string;
  payerName?: string;
  senderWallet?: string | null;
  proof?: { fileName: string; mimeType: string; dataBase64: string };
};

export type CommercialSignal = {
  id: string; symbol: string; timeframe: string; direction: "LONG" | "SHORT";
  entryPrice: string; stopLoss: string; takeProfit: string; riskRewardRatio: string;
  status: "OPEN" | "WIN" | "LOSS" | "EXPIRED" | "CANCELLED";
  openedAt: string; closedAt: string | null; returnPct: string | null; result: string;
  strategyVersion: string; createdAt: string;
};

export type SignalDashboardResponse = {
  activeSignal: CommercialSignal | null;
  evaluation: "LONG" | "SHORT" | "NO_SIGNAL";
  message: string | null;
  context: { trend: "bullish" | "bearish" | "sideways" | null; condition: "trending" | "mixed" | "insufficient_data"; strength: "high" | "medium" | "low" };
  multiTimeframe: { trends: Record<string, "bullish" | "bearish" | "sideways" | null>; alignedCount: number; total: number };
  metrics: { total: number; wins: number; losses: number; winRate: number | null; lossRate: number | null; accumulatedReturnPct: number | null };
  history: CommercialSignal[];
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

export function requestPasswordReset(email: string): Promise<{ message: string }> {
  return customFetch("/api/auth/request-password-reset", { ...jsonRequest, method: "POST", body: JSON.stringify({ email }) });
}

export function resetPassword(token: string, newPassword: string): Promise<unknown> {
  return customFetch("/api/auth/reset-password", { ...jsonRequest, method: "POST", body: JSON.stringify({ token, newPassword }) });
}

export function sendVerificationEmail(email: string): Promise<{ message: string }> {
  return customFetch("/api/auth/send-verification", { ...jsonRequest, method: "POST", body: JSON.stringify({ email }) });
}

export function verifyEmail(token: string): Promise<unknown> {
  return customFetch(`/api/auth/verify-email?token=${encodeURIComponent(token)}`, { responseType: "json" });
}

export function createConsumerRequest(input: { type: ConsumerRequestType; email: string; paymentReference?: string; description?: string }): Promise<{ request: ConsumerRequest; message: string }> {
  return customFetch("/api/consumer-requests", { ...jsonRequest, method: "POST", body: JSON.stringify(input) });
}

export function getAdminConsumerRequests(signal?: AbortSignal): Promise<{ requests: ConsumerRequest[] }> {
  return customFetch("/api/admin/consumer-requests", { responseType: "json", signal });
}

export function reviewConsumerRequest(id: string, status: Exclude<ConsumerRequestStatus, "PENDING">, notes?: string): Promise<{ request: ConsumerRequest }> {
  return customFetch(`/api/admin/consumer-requests/${encodeURIComponent(id)}/review`, { ...jsonRequest, method: "POST", body: JSON.stringify({ status, notes }) });
}

export function getAdminSignalEngineHealth(signal?: AbortSignal): Promise<SignalEngineHealth> {
  return customFetch("/api/admin/signal-engine", { responseType: "json", signal });
}

export function getAdminReadiness(signal?: AbortSignal): Promise<AdminReadiness> {
  return customFetch("/api/admin/readiness", { responseType: "json", signal });
}

export function getAccount(signal?: AbortSignal): Promise<AccountResponse> {
  return customFetch<AccountResponse>("/api/me", { responseType: "json", signal });
}

export function getMyAccess(signal?: AbortSignal): Promise<{ access: AccessSummary }> {
  return customFetch<{ access: AccessSummary }>("/api/access/me", { responseType: "json", signal });
}

export function getMyPaymentRequests(signal?: AbortSignal): Promise<{ requests: PaymentRequest[] }> {
  return customFetch<{ requests: PaymentRequest[] }>("/api/payment-requests/me", { responseType: "json", signal });
}

export function createPaymentRequest(input: CreatePaymentRequestInput): Promise<{ request: PaymentRequest; whatsappUrl: string | null }> {
  return customFetch("/api/payment-requests", { ...jsonRequest, method: "POST", body: JSON.stringify(input) });
}

export function getSignalDashboard(timeframe = "15m", historyTimeframe = timeframe, signal?: AbortSignal): Promise<SignalDashboardResponse> {
  return customFetch(`/api/signals/dashboard?symbol=BTCUSDT&timeframe=${encodeURIComponent(timeframe)}&historyTimeframe=${encodeURIComponent(historyTimeframe)}`, { responseType: "json", signal });
}

export function getAdminPaymentRequests(signal?: AbortSignal): Promise<{ requests: AdminPaymentRequest[] }> {
  return customFetch<{ requests: AdminPaymentRequest[] }>("/api/admin/payment-requests", { responseType: "json", signal });
}

export function reviewPaymentRequest(requestId: string, decision: Exclude<PaymentRequestStatus, "PENDING">, notes?: string): Promise<{ request: PaymentRequest; grantId: string | null }> {
  return customFetch(`/api/admin/payment-requests/${encodeURIComponent(requestId)}/review`, {
    ...jsonRequest,
    method: "POST",
    body: JSON.stringify({ decision, notes }),
  });
}

export function getPaymentProof(url: string): Promise<Blob> {
  return customFetch<Blob>(url, { responseType: "blob" });
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
  return grantManualAccess(userId, { plan: "FOUNDERS_LIFETIME", reason });
}

export function grantManualAccess(userId: string, input: { plan: "FOUNDERS_LIFETIME" | "PARTNER" | "TESTER" | "COMPLIMENTARY"; reason?: string; expiresAt?: string | null }): Promise<{ access: AccessSummary }> {
  return customFetch(`/api/admin/users/${encodeURIComponent(userId)}/grant-access`, {
    ...jsonRequest,
    method: "POST",
    body: JSON.stringify(input),
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
