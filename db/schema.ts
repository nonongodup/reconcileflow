import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const users = pgTable("rf_users", {
  id: uuid("id").primaryKey(),
  authProvider: text("auth_provider").notNull().default("legacy_chatgpt"),
  providerUserId: text("provider_user_id"),
  email: text("email").notNull(),
  displayName: text("display_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }).notNull().defaultNow(),
});

export const templates = pgTable("rf_templates", {
  id: uuid("id").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  mappings: jsonb("mappings").notNull(),
  rules: jsonb("rules").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("rf_templates_user_idx").on(table.userId, table.updatedAt)]);

export const runs = pgTable("rf_runs", {
  id: uuid("id").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  status: text("status").notNull(),
  sourceName: text("source_name").notNull(),
  targetName: text("target_name").notNull(),
  sourceFormat: text("source_format").notNull(),
  targetFormat: text("target_format").notNull(),
  sourceRows: integer("source_rows"),
  targetRows: integer("target_rows"),
  mappings: jsonb("mappings").notNull(),
  rules: jsonb("rules").notNull().default({}),
  summary: jsonb("summary"),
  reportKey: text("report_key"),
  reportExpiresAt: timestamp("report_expires_at", { withTimezone: true }),
  reportDeletedAt: timestamp("report_deleted_at", { withTimezone: true }),
  failureMessage: text("failure_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (table) => [index("rf_runs_user_idx").on(table.userId, table.createdAt)]);
