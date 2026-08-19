import { betterAuth } from "better-auth/minimal";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { username } from "better-auth/plugins";
import {
  accounts,
  auditActions,
  auditLogs,
  eq,
  getDatabase,
  sessions,
  users,
  verifications,
} from "@workspace/db";
import { config } from "../config";

export class AuthConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthConfigurationError";
  }
}

let authInstance: ReturnType<typeof createAuth> | undefined;

function assertAuthConfiguration(): void {
  if (!config.databaseUrl) {
    throw new AuthConfigurationError("Persistence is not configured.");
  }
  if (!config.betterAuthUrl) {
    throw new AuthConfigurationError("BETTER_AUTH_URL is not configured.");
  }
  if (!config.betterAuthSecret || config.betterAuthSecret.length < 32) {
    throw new AuthConfigurationError("BETTER_AUTH_SECRET must contain at least 32 characters.");
  }
}

function createAuth() {
  assertAuthConfiguration();
  const db = getDatabase();
  const trustedOrigins = [...new Set([config.betterAuthUrl!, ...config.corsOrigins])];

  return betterAuth({
    baseURL: config.betterAuthUrl,
    secret: config.betterAuthSecret,
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        user: users,
        session: sessions,
        account: accounts,
        verification: verifications,
      },
    }),
    trustedOrigins,
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
    },
    emailVerification: {
      sendOnSignUp: false,
    },
    advanced: {
      cookiePrefix: "nexo-digital-pro",
      useSecureCookies: config.nodeEnv === "production",
      defaultCookieAttributes: {
        httpOnly: true,
        secure: config.nodeEnv === "production",
        sameSite: config.authCookieSameSite,
        ...(config.authCookieDomain ? { domain: config.authCookieDomain } : {}),
      },
    },
    user: {
      additionalFields: {
        role: { type: "string", input: false, defaultValue: "user" },
        status: { type: "string", input: false, defaultValue: "active" },
        lastLoginAt: { type: "date", input: false, required: false },
      },
    },
    plugins: [
      username({
        minUsernameLength: 3,
        maxUsernameLength: 32,
        immutableUsername: true,
        usernameValidator: (value) => /^[a-zA-Z0-9_]{3,32}$/.test(value),
      }),
    ],
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            if (typeof user.username !== "string" || !/^[a-zA-Z0-9_]{3,32}$/.test(user.username)) {
              return false;
            }
            return undefined;
          },
          after: async (user) => {
            await db.insert(auditLogs).values({
              actorUserId: user.id,
              targetUserId: user.id,
              action: auditActions.userRegistered,
              metadata: { source: "email_password" },
            });
          },
        },
      },
      session: {
        create: {
          before: async (session) => {
            const [user] = await db
              .select({ status: users.status })
              .from(users)
              .where(eq(users.id, session.userId))
              .limit(1);
            return user?.status !== "blocked";
          },
          after: async (session) => {
            await Promise.all([
              db.update(users).set({ lastLoginAt: new Date(), updatedAt: new Date() }).where(eq(users.id, session.userId)),
              db.insert(auditLogs).values({
                actorUserId: session.userId,
                targetUserId: session.userId,
                action: auditActions.userLogin,
                metadata: { source: "email_password" },
              }),
            ]);
          },
        },
        delete: {
          after: async (session) => {
            await db.insert(auditLogs).values({
              actorUserId: session.userId,
              targetUserId: session.userId,
              action: auditActions.userLogout,
              metadata: { source: "session" },
            });
          },
        },
      },
    },
  });
}

export function getAuth() {
  if (!authInstance) authInstance = createAuth();
  return authInstance;
}
