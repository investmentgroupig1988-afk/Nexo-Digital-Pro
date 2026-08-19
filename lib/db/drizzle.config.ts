import { defineConfig } from "drizzle-kit";
export default defineConfig({
  schema: "./src/schema",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    // Generation is deterministic and does not connect. Migration requires a
    // real DATABASE_URL and is guarded by the root db:migrate script.
    url: process.env.DATABASE_URL ?? "postgresql://unused:unused@localhost:5432/nexo_digital_pro",
  },
});
