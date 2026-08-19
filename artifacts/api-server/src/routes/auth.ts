import { Router, type IRouter } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { z } from "zod";
import { eq, getDatabase, users } from "@workspace/db";
import { getAuth, AuthConfigurationError } from "../auth/auth";
import { getRequestUser } from "../auth/session";
import { trustedMutationOrigin } from "../middlewares/security";
import { logger } from "../lib/logger";
import { recordAuthEvent } from "../services/auth-events";

const router: IRouter = Router();

const registrationSchema = z.object({
  email: z.string().trim().email().max(320).transform((value) => value.toLowerCase()),
  username: z.string().trim().min(3).max(32).regex(/^[a-zA-Z0-9_]+$/),
  name: z.string().trim().min(1).max(120).optional(),
  password: z.string().min(12).max(128),
});

const loginSchema = z.object({
  email: z.string().trim().email().max(320).transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(128),
});

router.use(trustedMutationOrigin);

router.post("/register", async (req, res) => {
  try {
    const input = registrationSchema.parse(req.body);
    const normalizedUsername = input.username.toLowerCase();
    getAuth();
    const db = getDatabase();

    const [emailMatch] = await db.select({ id: users.id }).from(users).where(eq(users.email, input.email)).limit(1);
    if (emailMatch) {
      res.status(409).json({ error: "An account with this email already exists." });
      return;
    }

    const [usernameMatch] = await db.select({ id: users.id }).from(users).where(eq(users.username, normalizedUsername)).limit(1);
    if (usernameMatch) {
      res.status(409).json({ error: "This username is not available." });
      return;
    }

    const response = await getAuth().api.signUpEmail({
      body: {
        email: input.email,
        password: input.password,
        username: normalizedUsername,
        displayUsername: input.username,
        name: input.name ?? input.username,
      },
      headers: fromNodeHeaders(req.headers),
      asResponse: true,
    });
    await recordSuccessfulAuthEvent(response, "registration");
    await forwardAuthResponse(response, res);
  } catch (error) {
    sendAuthRouteError(error, "registration", res);
  }
});

router.post("/login", async (req, res) => {
  try {
    const input = loginSchema.parse(req.body);
    getAuth();
    const [user] = await getDatabase()
      .select({ status: users.status })
      .from(users)
      .where(eq(users.email, input.email))
      .limit(1);
    if (user?.status === "blocked") {
      res.status(403).json({ error: "This account is unavailable." });
      return;
    }

    const response = await getAuth().api.signInEmail({
      body: input,
      headers: fromNodeHeaders(req.headers),
      asResponse: true,
    });
    await recordSuccessfulAuthEvent(response, "login");
    await forwardAuthResponse(response, res);
  } catch (error) {
    sendAuthRouteError(error, "login", res);
  }
});

router.post("/logout", async (req, res) => {
  try {
    // Resolve the session first so the audit event never trusts a client id.
    const user = await getRequestUser(req);
    const response = await getAuth().api.signOut({
      headers: fromNodeHeaders(req.headers),
      asResponse: true,
    });
    if (response.ok) await recordAuthEvent(user.id, "logout");
    await forwardAuthResponse(response, res);
  } catch (error) {
    sendAuthRouteError(error, "logout", res);
  }
});

router.post("/request-password-reset", (_req, res) => {
  res.status(501).json({ error: "Password recovery is prepared but an email provider is not configured yet." });
});

router.post("/send-verification", (_req, res) => {
  res.status(501).json({ error: "Email verification is prepared but an email provider is not configured yet." });
});

async function forwardAuthResponse(response: globalThis.Response, res: import("express").Response): Promise<void> {
  const setCookies = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : [];
  for (const [name, value] of response.headers) {
    if (name.toLowerCase() !== "set-cookie") res.setHeader(name, value);
  }
  if (setCookies.length > 0) res.setHeader("Set-Cookie", setCookies);

  const body = await response.text();
  res.status(response.status).send(body);
}

async function recordSuccessfulAuthEvent(
  response: globalThis.Response,
  event: "registration" | "login",
): Promise<void> {
  if (!response.ok) {
    logger.warn(
      { authEvent: event, statusCode: response.status, errorCode: "AUTH_PROVIDER_REJECTED_REQUEST" },
      "Better Auth rejected an authentication request",
    );
    return;
  }

  const payload: unknown = await response.clone().json().catch(() => null);
  const userId = getResponseUserId(payload);
  if (!userId) {
    logger.error(
      { authEvent: event, errorCode: "AUTH_PROVIDER_RESPONSE_INVALID" },
      "Better Auth completed a request without a usable user identifier",
    );
    return;
  }
  await recordAuthEvent(userId, event);
}

function getResponseUserId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || !("user" in payload)) return null;
  const user = payload.user;
  if (!user || typeof user !== "object" || !("id" in user) || typeof user.id !== "string") return null;
  return user.id;
}

function sendAuthRouteError(
  error: unknown,
  stage: "registration" | "login" | "logout",
  res: import("express").Response,
): void {
  if (error instanceof z.ZodError) {
    res.status(400).json({ error: "Invalid registration or login input." });
    return;
  }
  if (error instanceof AuthConfigurationError) {
    res.status(503).json({ error: "Authentication is not configured." });
    return;
  }
  logger.error(
    { err: error, authStage: stage, errorCode: "AUTH_OPERATION_FAILED" },
    "Authentication operation failed",
  );
  res.status(500).json({ error: "Authentication could not be completed. Please try again." });
}

export default router;
