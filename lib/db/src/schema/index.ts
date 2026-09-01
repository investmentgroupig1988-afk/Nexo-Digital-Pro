import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

const createdAt = timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

/** Better Auth core schema, extended with TRENORO access-control fields. */
export const users = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  username: varchar("username", { length: 32 }).notNull(),
  displayUsername: varchar("display_username", { length: 32 }).notNull(),
  role: varchar("role", { length: 64 }).notNull().default("user"),
  status: varchar("status", { length: 32 }).notNull().default("active"),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  termsVersion: varchar("terms_version", { length: 32 }),
  privacyVersion: varchar("privacy_version", { length: 32 }),
  legalAcceptedAt: timestamp("legal_accepted_at", { withTimezone: true }),
  adultConfirmedAt: timestamp("adult_confirmed_at", { withTimezone: true }),
  createdAt,
  updatedAt,
}, (table) => [
  uniqueIndex("user_email_lower_unique").on(sql`lower(${table.email})`),
  uniqueIndex("user_username_lower_unique").on(sql`lower(${table.username})`),
]);

export const sessions = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  token: text("token").notNull(),
  createdAt,
  updatedAt,
  ipAddress: varchar("ip_address", { length: 64 }),
  userAgent: text("user_agent"),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
}, (table) => [
  uniqueIndex("session_token_unique").on(table.token),
  index("session_user_id_index").on(table.userId),
]);

export const accounts = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  issuer: text("issuer").notNull(),
  providerId: varchar("provider_id", { length: 128 }).notNull(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  password: text("password"),
  createdAt,
  updatedAt,
}, (table) => [
  index("account_user_id_index").on(table.userId),
  uniqueIndex("account_issuer_account_unique").on(table.issuer, table.accountId),
]);

export const verifications = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt,
  updatedAt,
}, (table) => [index("verification_identifier_index").on(table.identifier)]);

/** The permission catalog permits future support/staff roles without changing user rows. */
export const roles = pgTable("roles", {
  code: varchar("code", { length: 64 }).primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  description: text("description"),
  createdAt,
  updatedAt,
});

export const permissions = pgTable("permissions", {
  code: varchar("code", { length: 64 }).primaryKey(),
  description: text("description").notNull(),
  createdAt,
});

export const rolePermissions = pgTable("role_permissions", {
  roleCode: varchar("role_code", { length: 64 }).notNull().references(() => roles.code, { onDelete: "cascade" }),
  permissionCode: varchar("permission_code", { length: 64 }).notNull().references(() => permissions.code, { onDelete: "cascade" }),
  createdAt,
}, (table) => [primaryKey({ columns: [table.roleCode, table.permissionCode] })]);

export const accessGrants = pgTable("access_grants", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  plan: varchar("plan", { length: 64 }).notNull(),
  accessType: varchar("access_type", { length: 64 }).notNull(),
  status: varchar("status", { length: 32 }).notNull().default("pending"),
  grantedAt: timestamp("granted_at", { withTimezone: true }),
  grantedBy: text("granted_by").references(() => users.id, { onDelete: "set null" }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  revokedBy: text("revoked_by").references(() => users.id, { onDelete: "set null" }),
  reason: text("reason"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt,
  updatedAt,
}, (table) => [
  index("access_grants_user_status_index").on(table.userId, table.status),
  index("access_grants_plan_index").on(table.plan),
]);

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  actorUserId: text("actor_user_id").references(() => users.id, { onDelete: "set null" }),
  targetUserId: text("target_user_id").references(() => users.id, { onDelete: "set null" }),
  action: varchar("action", { length: 64 }).notNull(),
  metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
  ip: varchar("ip", { length: 64 }),
  userAgent: text("user_agent"),
  createdAt,
}, (table) => [
  index("audit_logs_target_created_index").on(table.targetUserId, table.createdAt),
  index("audit_logs_actor_created_index").on(table.actorUserId, table.createdAt),
]);

/** Persistence only: payment providers are intentionally not integrated in this phase. */
export const payments = pgTable("payments", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  provider: varchar("provider", { length: 64 }).notNull(),
  providerPaymentId: varchar("provider_payment_id", { length: 255 }),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).notNull(),
  status: varchar("status", { length: 32 }).notNull(),
  paymentMethodType: varchar("payment_method_type", { length: 64 }),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  createdAt,
}, (table) => [
  uniqueIndex("payments_provider_payment_unique").on(table.provider, table.providerPaymentId),
  index("payments_user_created_index").on(table.userId, table.createdAt),
]);

/** Manual payment evidence and its administrative review lifecycle. */
export const paymentRequests = pgTable("payment_requests", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  method: varchar("method", { length: 64 }).notNull(),
  amount: numeric("amount", { precision: 18, scale: 8 }).notNull(),
  currency: varchar("currency", { length: 8 }).notNull(),
  declaredPaidAt: timestamp("declared_paid_at", { withTimezone: true }).notNull(),
  referenceOrTxid: varchar("reference_or_txid", { length: 255 }).notNull(),
  referenceFingerprint: varchar("reference_fingerprint", { length: 64 }).notNull(),
  payerName: varchar("payer_name", { length: 160 }),
  senderWallet: varchar("sender_wallet", { length: 128 }),
  // Nullable for payment requests created before WhatsApp became mandatory.
  // New requests enforce a normalized international number in the service.
  whatsappNumber: varchar("whatsapp_number", { length: 32 }),
  proofFileName: varchar("proof_file_name", { length: 160 }),
  proofMimeType: varchar("proof_mime_type", { length: 64 }),
  proofSize: integer("proof_size"),
  // V1 keeps the bounded evidence in PostgreSQL so no private filesystem path
  // is exposed and ephemeral application disks cannot lose a receipt.
  proofDataBase64: text("proof_data_base64"),
  status: varchar("status", { length: 32 }).notNull().default("PENDING"),
  notes: text("notes"),
  reviewedBy: text("reviewed_by").references(() => users.id, { onDelete: "set null" }),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt,
  updatedAt,
}, (table) => [
  index("payment_requests_user_created_index").on(table.userId, table.createdAt),
  index("payment_requests_status_created_index").on(table.status, table.createdAt),
  index("payment_requests_reviewer_index").on(table.reviewedBy),
  uniqueIndex("payment_requests_approved_reference_unique")
    .on(table.method, table.referenceFingerprint)
    .where(sql`${table.status} = 'APPROVED'`),
  check("payment_requests_amount_positive", sql`${table.amount} > 0`),
  check("payment_requests_proof_size_valid", sql`${table.proofSize} IS NULL OR (${table.proofSize} > 0 AND ${table.proofSize} <= 5242880)`),
  check("payment_requests_method_valid", sql`${table.method} IN ('MERCADO_PAGO_TRANSFER', 'USDT_TRC20')`),
  check("payment_requests_status_valid", sql`${table.status} IN ('PENDING', 'APPROVED', 'REJECTED', 'NEEDS_REVIEW')`),
]);

export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  provider: varchar("provider", { length: 64 }).notNull(),
  providerSubscriptionId: varchar("provider_subscription_id", { length: 255 }),
  plan: varchar("plan", { length: 64 }).notNull(),
  status: varchar("status", { length: 32 }).notNull(),
  currentPeriodStart: timestamp("current_period_start", { withTimezone: true }),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  createdAt,
  updatedAt,
}, (table) => [
  uniqueIndex("subscriptions_provider_subscription_unique").on(table.provider, table.providerSubscriptionId),
  index("subscriptions_user_status_index").on(table.userId, table.status),
]);

/** Auditable lifecycle for signals produced by the server-side Signal Engine. */
export const signals = pgTable("signals", {
  id: uuid("id").defaultRandom().primaryKey(),
  symbol: varchar("symbol", { length: 32 }).notNull(),
  timeframe: varchar("timeframe", { length: 16 }).notNull(),
  direction: varchar("direction", { length: 16 }).notNull(),
  entryPrice: numeric("entry_price", { precision: 20, scale: 8 }),
  stopLoss: numeric("stop_loss", { precision: 20, scale: 8 }),
  takeProfit: numeric("take_profit", { precision: 20, scale: 8 }),
  riskRewardRatio: numeric("risk_reward_ratio", { precision: 12, scale: 4 }),
  status: varchar("status", { length: 16 }).notNull(),
  openedAt: timestamp("opened_at", { withTimezone: true }),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  returnPct: numeric("return_pct", { precision: 12, scale: 6 }),
  result: varchar("result", { length: 16 }),
  strategyVersion: varchar("strategy_version", { length: 64 }).notNull(),
  configurationFingerprint: varchar("configuration_fingerprint", { length: 64 }).notNull(),
  indicatorSnapshot: jsonb("indicator_snapshot").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt,
}, (table) => [
  index("signals_status_created_index").on(table.status, table.createdAt),
  index("signals_symbol_timeframe_index").on(table.symbol, table.timeframe),
  uniqueIndex("signals_open_strategy_unique")
    .on(table.symbol, table.timeframe, table.strategyVersion)
    .where(sql`${table.status} = 'OPEN'`),
  uniqueIndex("signals_configuration_unique")
    .on(table.configurationFingerprint),
  check("signals_direction_valid", sql`${table.direction} IN ('LONG', 'SHORT')`),
  check("signals_status_valid", sql`${table.status} IN ('OPEN', 'WIN', 'LOSS', 'EXPIRED', 'CANCELLED')`),
  check("signals_risk_reward_minimum", sql`${table.riskRewardRatio} >= 1.5`),
]);

/** Provider-neutral outbox. Signals remain authoritative; providers only announce availability. */
export const notificationDeliveries = pgTable("notification_deliveries", {
  id: uuid("id").defaultRandom().primaryKey(),
  signalId: uuid("signal_id").notNull().references(() => signals.id, { onDelete: "cascade" }),
  provider: varchar("provider", { length: 32 }).notNull(),
  status: varchar("status", { length: 16 }).notNull().default("PENDING"),
  attempts: integer("attempts").notNull().default(0),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
  claimedAt: timestamp("claimed_at", { withTimezone: true }),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  lastError: varchar("last_error", { length: 255 }),
  createdAt,
  updatedAt,
}, (table) => [
  uniqueIndex("notification_deliveries_signal_provider_unique").on(table.signalId, table.provider),
  index("notification_deliveries_pending_index").on(table.provider, table.status, table.nextAttemptAt),
  check("notification_deliveries_provider_valid", sql`${table.provider} IN ('telegram')`),
  check("notification_deliveries_status_valid", sql`${table.status} IN ('PENDING', 'SENDING', 'DELIVERED', 'FAILED')`),
]);

/**
 * Forward-only research ledger. It is deliberately independent from commercial
 * signals and notification deliveries so shadow observations cannot leak into
 * customer history, metrics, or provider outboxes.
 */
export const shadowResearchSignals = pgTable("shadow_research_signals", {
  id: uuid("id").defaultRandom().primaryKey(),
  strategyVersion: varchar("strategy_version", { length: 64 }).notNull(),
  strategyFingerprint: varchar("strategy_fingerprint", { length: 64 }).notNull(),
  symbol: varchar("symbol", { length: 16 }).notNull(),
  timeframe: varchar("timeframe", { length: 8 }).notNull(),
  detectedAt: timestamp("detected_at", { withTimezone: true }).notNull(),
  sourceCandleCloseAt: timestamp("source_candle_close_at", { withTimezone: true }).notNull(),
  hypotheticalEntry: numeric("hypothetical_entry", { precision: 20, scale: 8 }).notNull(),
  hypotheticalStop: numeric("hypothetical_stop", { precision: 20, scale: 8 }).notNull(),
  hypotheticalTarget: numeric("hypothetical_target", { precision: 20, scale: 8 }).notNull(),
  direction: varchar("direction", { length: 16 }).notNull(),
  costsModel: jsonb("costs_model").notNull(),
  status: varchar("status", { length: 16 }).notNull().default("OPEN"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  realizedR: numeric("realized_r", { precision: 16, scale: 8 }),
  technicalSnapshot: jsonb("technical_snapshot").notNull(),
  createdAt,
  updatedAt,
}, (table) => [
  uniqueIndex("shadow_research_signal_dedupe_unique").on(
    table.strategyVersion,
    table.symbol,
    table.timeframe,
    table.sourceCandleCloseAt,
    table.direction,
  ),
  uniqueIndex("shadow_research_signal_open_unique")
    .on(table.strategyVersion, table.symbol, table.timeframe)
    .where(sql`${table.status} = 'OPEN'`),
  index("shadow_research_signal_status_index").on(table.status, table.detectedAt),
  index("shadow_research_signal_symbol_index").on(table.symbol, table.detectedAt),
  check("shadow_research_signal_version_frozen", sql`${table.strategyVersion} = 'RSI_DIVERGENCE_STRUCTURAL_4H_V1'`),
  check("shadow_research_signal_fingerprint_frozen", sql`${table.strategyFingerprint} = '9bfe79d79c73d17b73a9c7e1eb62532af644cc6065aeecc8b3020783142e6089'`),
  check("shadow_research_signal_symbol_valid", sql`${table.symbol} IN ('BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT')`),
  check("shadow_research_signal_timeframe_frozen", sql`${table.timeframe} = '4h'`),
  check("shadow_research_signal_direction_valid", sql`${table.direction} IN ('LONG', 'SHORT')`),
  check("shadow_research_signal_status_valid", sql`${table.status} IN ('OPEN', 'WIN', 'LOSS', 'EXPIRED')`),
]);

/** Public consumer requests. Refunds and access cancellation always require human review. */
export const consumerRequests = pgTable("consumer_requests", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: varchar("code", { length: 32 }).notNull(),
  type: varchar("type", { length: 32 }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  paymentReference: varchar("payment_reference", { length: 255 }),
  description: text("description"),
  status: varchar("status", { length: 16 }).notNull().default("PENDING"),
  adminNotes: text("admin_notes"),
  reviewedBy: text("reviewed_by").references(() => users.id, { onDelete: "set null" }),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt,
  updatedAt,
}, (table) => [
  uniqueIndex("consumer_requests_code_unique").on(table.code),
  index("consumer_requests_status_created_index").on(table.status, table.createdAt),
  index("consumer_requests_email_created_index").on(table.email, table.createdAt),
  check("consumer_requests_type_valid", sql`${table.type} IN ('WITHDRAWAL', 'SERVICE_CANCELLATION')`),
  check("consumer_requests_status_valid", sql`${table.status} IN ('PENDING', 'REVIEWING', 'APPROVED', 'REJECTED', 'COMPLETED')`),
]);

export const consumerRequestEvents = pgTable("consumer_request_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  requestId: uuid("request_id").notNull().references(() => consumerRequests.id, { onDelete: "cascade" }),
  actorUserId: text("actor_user_id").references(() => users.id, { onDelete: "set null" }),
  status: varchar("status", { length: 16 }).notNull(),
  notes: text("notes"),
  createdAt,
}, (table) => [index("consumer_request_events_request_created_index").on(table.requestId, table.createdAt)]);

export const signalDirections = { long: "LONG", short: "SHORT" } as const;
export const signalStatuses = { open: "OPEN", win: "WIN", loss: "LOSS", expired: "EXPIRED", cancelled: "CANCELLED" } as const;

export const accessPlans = {
  foundersLifetime: "FOUNDERS_LIFETIME",
  partner: "PARTNER",
  tester: "TESTER",
  complimentary: "COMPLIMENTARY",
  monthlyPro: "MONTHLY_PRO",
} as const;

export const accessGrantStatuses = {
  pending: "pending",
  active: "active",
  revoked: "revoked",
  expired: "expired",
} as const;

export const accessTypes = {
  adminManual: "ADMIN_MANUAL",
  payment: "PAYMENT",
  promotion: "PROMOTION",
} as const;

export const auditActions = {
  userRegistered: "USER_REGISTERED",
  userLogin: "USER_LOGIN",
  userLogout: "USER_LOGOUT",
  userBlocked: "USER_BLOCKED",
  userUnblocked: "USER_UNBLOCKED",
  accessGranted: "ACCESS_GRANTED",
  accessRevoked: "ACCESS_REVOKED",
  accessRestored: "ACCESS_RESTORED",
  paymentRequested: "PAYMENT_REQUESTED",
  paymentApproved: "PAYMENT_APPROVED",
  paymentRejected: "PAYMENT_REJECTED",
  paymentNeedsReview: "PAYMENT_NEEDS_REVIEW",
  roleChanged: "ROLE_CHANGED",
  consumerRequestCreated: "CONSUMER_REQUEST_CREATED",
  consumerRequestUpdated: "CONSUMER_REQUEST_UPDATED",
} as const;

export const paymentRequestMethods = {
  mercadoPagoTransfer: "MERCADO_PAGO_TRANSFER",
  usdtTrc20: "USDT_TRC20",
} as const;

export const paymentRequestStatuses = {
  pending: "PENDING",
  approved: "APPROVED",
  rejected: "REJECTED",
  needsReview: "NEEDS_REVIEW",
} as const;

export const consumerRequestTypes = {
  withdrawal: "WITHDRAWAL",
  serviceCancellation: "SERVICE_CANCELLATION",
} as const;

export const consumerRequestStatuses = {
  pending: "PENDING",
  reviewing: "REVIEWING",
  approved: "APPROVED",
  rejected: "REJECTED",
  completed: "COMPLETED",
} as const;

export type AccessPlan = (typeof accessPlans)[keyof typeof accessPlans];
export type AccessGrantStatus = (typeof accessGrantStatuses)[keyof typeof accessGrantStatuses];
export type AccessType = (typeof accessTypes)[keyof typeof accessTypes];
export type AuditAction = (typeof auditActions)[keyof typeof auditActions];
export type PaymentRequestMethod = (typeof paymentRequestMethods)[keyof typeof paymentRequestMethods];
export type PaymentRequestStatus = (typeof paymentRequestStatuses)[keyof typeof paymentRequestStatuses];
export type ConsumerRequestType = (typeof consumerRequestTypes)[keyof typeof consumerRequestTypes];
export type ConsumerRequestStatus = (typeof consumerRequestStatuses)[keyof typeof consumerRequestStatuses];
