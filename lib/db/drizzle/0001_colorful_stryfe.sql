ALTER TABLE "account" ADD COLUMN "issuer" text;--> statement-breakpoint
-- Preserve any pre-existing rows while aligning credential accounts with the
-- Better Auth 1.7 issuer namespace. Other legacy providers remain distinct
-- and are not treated as credential identities.
UPDATE "account"
SET "issuer" = CASE
  WHEN "provider_id" = 'credential' THEN 'local:credential'
  ELSE 'legacy:' || "provider_id"
END
WHERE "issuer" IS NULL;--> statement-breakpoint
ALTER TABLE "account" ALTER COLUMN "issuer" SET NOT NULL;--> statement-breakpoint
DROP INDEX "account_provider_account_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "account_issuer_account_unique" ON "account" USING btree ("issuer","account_id");
