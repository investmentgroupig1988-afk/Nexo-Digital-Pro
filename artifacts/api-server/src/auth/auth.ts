import { betterAuth } from "better-auth/minimal";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { username } from "better-auth/plugins";
import {
  accounts,
  getDatabase,
  sessions,
  users,
  verifications,
} from "@workspace/db";
import { config } from "../config";

type AuthRuntimeConfig = Pick<
  typeof config,
  "databaseUrl" | "betterAuthSecret" | "betterAuthUrl" | "corsOrigins" | "nodeEnv" | "authCookieSameSite" | "authCookieDomain"
>;

export class AuthConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthConfigurationError";
  }
}

let authInstance: ReturnType<typeof createAuthForDatabase> | undefined;

function assertAuthConfiguration(authConfig: AuthRuntimeConfig): void {
  if (!authConfig.databaseUrl) {
    throw new AuthConfigurationError("Persistence is not configured.");
  }
  if (!authConfig.betterAuthUrl) {
    throw new AuthConfigurationError("BETTER_AUTH_URL is not configured.");
  }
  if (!authConfig.betterAuthSecret || authConfig.betterAuthSecret.length < 32) {
    throw new AuthConfigurationError("BETTER_AUTH_SECRET must contain at least 32 characters.");
  }
}

export function createAuthForDatabase(database: Parameters<typeof drizzleAdapter>[0], authConfig: AuthRuntimeConfig = config) {
  assertAuthConfiguration(authConfig);
  const trustedOrigins = [...new Set([authConfig.betterAuthUrl!, ...authConfig.corsOrigins])];

  return betterAuth({
    baseURL: authConfig.betterAuthUrl,
    secret: authConfig.betterAuthSecret,
    database: drizzleAdapter(database, {
      provider: "pg",
      // Email sign-up creates user, credential account, and session. PostgreSQL
      // supports transactions, so this must never fall back to sequential writes.
      transaction: true,
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
      useSecureCookies: authConfig.nodeEnv === "production",
      defaultCookieAttributes: {
        httpOnly: true,
        secure: authConfig.nodeEnv === "production",
        sameSite: authConfig.authCookieSameSite,
        ...(authConfig.authCookieDomain ? { domain: authConfig.authCookieDomain } : {}),
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
  });
}

export function getAuth() {
  if (!authInstance) authInstance = createAuthForDatabase(getDatabase());
  return authInstance;
}
