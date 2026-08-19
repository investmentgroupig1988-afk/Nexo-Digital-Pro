import { Router, type IRouter, type Request, type Response } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { z } from "zod";
import { eq, getDatabase, users } from "@workspace/db";
import { getAuth, AuthConfigurationError } from "../auth/auth";
import { getRequestUser } from "../auth/session";
import { trustedMutationOrigin } from "../middlewares/security";

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

router.post("/register", async (req, res, next) => {
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
    await forwardAuthResponse(response, res);
  } catch (error) {
    sendAuthRouteError(error, res, next);
  }
});

router.post("/login", async (req, res, next) => {
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
    await forwardAuthResponse(response, res);
  } catch (error) {
    sendAuthRouteError(error, res, next);
  }
});

router.post("/logout", async (req, res, next) => {
  try {
    // Resolve the session first so the Better Auth lifecycle hook can create a
    // logout audit event without trusting a client-provided user id.
    await getRequestUser(req);
    const response = await getAuth().api.signOut({
      headers: fromNodeHeaders(req.headers),
      asResponse: true,
    });
    await forwardAuthResponse(response, res);
  } catch (error) {
    sendAuthRouteError(error, res, next);
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

function sendAuthRouteError(error: unknown, res: import("express").Response, next: import("express").NextFunction): void {
  if (error instanceof z.ZodError) {
    res.status(400).json({ error: "Invalid registration or login input." });
    return;
  }
  if (error instanceof AuthConfigurationError) {
    res.status(503).json({ error: "Authentication is not configured." });
    return;
  }
  next(error);
}

export default router;
