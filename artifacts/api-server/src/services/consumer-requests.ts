import { randomBytes } from "node:crypto";
import {
  auditActions,
  auditLogs,
  consumerRequestEvents,
  consumerRequests,
  desc,
  eq,
  getDatabase,
  type ConsumerRequestStatus,
  type ConsumerRequestType,
} from "@workspace/db";
import type { AuditContext } from "./audit";

type Database = ReturnType<typeof getDatabase>;

export class ConsumerRequestError extends Error {
  constructor(message: string, readonly statusCode = 400) {
    super(message);
    this.name = "ConsumerRequestError";
  }
}

export async function createConsumerRequest(input: {
  type: ConsumerRequestType;
  email: string;
  paymentReference?: string;
  description?: string;
  context?: AuditContext;
}, database: Database = getDatabase()) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const code = `TR-${randomBytes(8).toString("hex").toUpperCase()}`;
    try {
      return await database.transaction(async (transaction) => {
        const [created] = await transaction.insert(consumerRequests).values({
          code,
          type: input.type,
          email: input.email,
          paymentReference: input.paymentReference || null,
          description: input.description || null,
          status: "PENDING",
        }).returning();
        await transaction.insert(consumerRequestEvents).values({ requestId: created.id, status: "PENDING" });
        await transaction.insert(auditLogs).values({
          action: auditActions.consumerRequestCreated,
          metadata: { consumerRequestId: created.id, type: created.type, code: created.code },
          ip: input.context?.ip,
          userAgent: input.context?.userAgent,
        });
        return publicConsumerRequest(created);
      });
    } catch (error) {
      if (attempt === 2 || !isUniqueViolation(error)) throw error;
    }
  }
  throw new Error("Unable to allocate consumer request code.");
}

export async function listConsumerRequests(database: Database = getDatabase()) {
  return database.select().from(consumerRequests).orderBy(desc(consumerRequests.createdAt)).limit(200);
}

export async function updateConsumerRequest(input: {
  id: string;
  actorUserId: string;
  status: ConsumerRequestStatus;
  notes?: string;
  context?: AuditContext;
}, database: Database = getDatabase()) {
  return database.transaction(async (transaction) => {
    const [current] = await transaction.select().from(consumerRequests).where(eq(consumerRequests.id, input.id)).limit(1).for("update");
    if (!current) throw new ConsumerRequestError("Solicitud no encontrada.", 404);
    if (!canTransition(current.status as ConsumerRequestStatus, input.status)) {
      throw new ConsumerRequestError("La transición de estado no es válida.", 409);
    }
    const now = new Date();
    const [updated] = await transaction.update(consumerRequests).set({
      status: input.status,
      adminNotes: input.notes ?? current.adminNotes,
      reviewedBy: input.actorUserId,
      reviewedAt: now,
      completedAt: input.status === "COMPLETED" ? now : current.completedAt,
      updatedAt: now,
    }).where(eq(consumerRequests.id, input.id)).returning();
    await transaction.insert(consumerRequestEvents).values({ requestId: input.id, actorUserId: input.actorUserId, status: input.status, notes: input.notes });
    await transaction.insert(auditLogs).values({
      actorUserId: input.actorUserId,
      action: auditActions.consumerRequestUpdated,
      metadata: { consumerRequestId: input.id, from: current.status, to: input.status },
      ip: input.context?.ip,
      userAgent: input.context?.userAgent,
    });
    return updated;
  });
}

function publicConsumerRequest(row: typeof consumerRequests.$inferSelect) {
  return { code: row.code, type: row.type, status: row.status, createdAt: row.createdAt };
}

function canTransition(from: ConsumerRequestStatus, to: ConsumerRequestStatus): boolean {
  if (from === to) return true;
  const allowed: Record<ConsumerRequestStatus, ConsumerRequestStatus[]> = {
    PENDING: ["REVIEWING", "APPROVED", "REJECTED"],
    REVIEWING: ["APPROVED", "REJECTED"],
    APPROVED: ["REVIEWING", "COMPLETED"],
    REJECTED: ["REVIEWING"],
    COMPLETED: [],
  };
  return allowed[from].includes(to);
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && (error as { code?: string }).code === "23505");
}
