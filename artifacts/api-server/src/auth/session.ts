import type { NextFunction, Request, Response } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { and, eq, getDatabase, rolePermissions, users } from "@workspace/db";
import { getAuth, AuthConfigurationError } from "./auth";
import { getEffectiveAccess } from "../services/access";

export type AuthenticatedUser = {
  id: string;
  email: string;
  username: string;
  displayUsername: string;
  name: string;
  role: string;
  status: string;
  emailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt: Date | null;
};

export class AuthenticationError extends Error {
  constructor() {
    super("Authentication is required.");
    this.name = "AuthenticationError";
  }
}

export class AuthorizationError extends Error {
  constructor(message = "You do not have permission to perform this action.") {
    super(message);
    this.name = "AuthorizationError";
  }
}

export async function getRequestUser(req: Request): Promise<AuthenticatedUser> {
  const session = await getAuth().api.getSession({ headers: fromNodeHeaders(req.headers) });
  if (!session?.user?.id) throw new AuthenticationError();

  const [user] = await getDatabase()
    .select({
      id: users.id,
      email: users.email,
      username: users.username,
      displayUsername: users.displayUsername,
      name: users.name,
      role: users.role,
      status: users.status,
      emailVerified: users.emailVerified,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
      lastLoginAt: users.lastLoginAt,
    })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  if (!user || user.status === "blocked") throw new AuthenticationError();
  return user;
}

export async function userHasPermission(user: AuthenticatedUser, permission: string): Promise<boolean> {
  // Admin is an explicit role with the complete permission catalog. Other roles
  // are evaluated against role_permissions, allowing future staff roles.
  if (user.role === "admin") return true;
  const [match] = await getDatabase()
    .select({ roleCode: rolePermissions.roleCode })
    .from(rolePermissions)
    .where(and(eq(rolePermissions.roleCode, user.role), eq(rolePermissions.permissionCode, permission)))
    .limit(1);
  return Boolean(match);
}

export function requirePermission(permission: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = await getRequestUser(req);
      if (!await userHasPermission(user, permission)) throw new AuthorizationError();
      res.locals.authUser = user;
      next();
    } catch (error) {
      sendAuthError(error, res, next);
    }
  };
}

export function requireAuthenticatedUser() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.locals.authUser = await getRequestUser(req);
      next();
    } catch (error) {
      sendAuthError(error, res, next);
    }
  };
}

export function requireProductAccess() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = await getRequestUser(req);
      const access = await getEffectiveAccess(user.id);
      if (!access.hasAccess) {
        res.status(403).json({ error: "An active product entitlement is required." });
        return;
      }
      res.locals.authUser = user;
      next();
    } catch (error) {
      sendAuthError(error, res, next);
    }
  };
}

export function currentAuthenticatedUser(res: Response): AuthenticatedUser {
  const user = res.locals.authUser as AuthenticatedUser | undefined;
  if (!user) throw new AuthenticationError();
  return user;
}

function sendAuthError(error: unknown, res: Response, next: NextFunction): void {
  if (error instanceof AuthConfigurationError) {
    res.status(503).json({ error: "Authentication is not configured." });
    return;
  }
  if (error instanceof AuthenticationError) {
    res.status(401).json({ error: "Authentication is required." });
    return;
  }
  if (error instanceof AuthorizationError) {
    res.status(403).json({ error: error.message });
    return;
  }
  next(error);
}
