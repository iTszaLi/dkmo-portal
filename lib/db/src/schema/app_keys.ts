import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";

// Stores the DKMO document-signing key material (a self-signed RSA key + X.509
// certificate). Generated once, lazily, and reused for all certificate digital
// signatures. `purpose` is unique so there is exactly one active key per use.
export const appSigningKeysTable = pgTable("app_signing_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  purpose: text("purpose").notNull().unique(),
  privateKeyPem: text("private_key_pem").notNull(),
  certPem: text("cert_pem").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
