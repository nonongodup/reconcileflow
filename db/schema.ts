import { boolean, date, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

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
  workspaceId: uuid("workspace_id"),
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
  workspaceId: uuid("workspace_id"),
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

export const subscriptions = pgTable("rf_subscriptions", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  stripeCustomerId: text("stripe_customer_id"), stripeSubscriptionId: text("stripe_subscription_id"),
  plan: text("plan").notNull().default("free"), billingInterval: text("billing_interval"), status: text("status").notNull().default("free"),
  currentPeriodStart: timestamp("current_period_start", { withTimezone: true }), currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("rf_subscriptions_customer_idx").on(table.stripeCustomerId), uniqueIndex("rf_subscriptions_subscription_idx").on(table.stripeSubscriptionId)]);

export const workspaces = pgTable("rf_workspaces", { id: uuid("id").primaryKey(), ownerUserId: uuid("owner_user_id").notNull().references(() => users.id,{onDelete:"cascade"}), name:text("name").notNull(), createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow() });
export const workspaceMembers = pgTable("rf_workspace_members", { workspaceId:uuid("workspace_id").notNull().references(()=>workspaces.id,{onDelete:"cascade"}), userId:uuid("user_id").notNull().references(()=>users.id,{onDelete:"cascade"}), role:text("role").notNull(), joinedAt:timestamp("joined_at",{withTimezone:true}).notNull().defaultNow() }, table=>[primaryKey({columns:[table.workspaceId,table.userId]})]);
export const workspaceInvitations = pgTable("rf_workspace_invitations", { id:uuid("id").primaryKey(), workspaceId:uuid("workspace_id").notNull().references(()=>workspaces.id,{onDelete:"cascade"}), email:text("email").notNull(), tokenHash:text("token_hash").notNull(), role:text("role").notNull().default("member"), expiresAt:timestamp("expires_at",{withTimezone:true}).notNull(), acceptedAt:timestamp("accepted_at",{withTimezone:true}), createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow() });
export const planUsage = pgTable("rf_plan_usage", { scopeId:uuid("scope_id").notNull(), periodStart:date("period_start").notNull(), reconciliationCount:integer("reconciliation_count").notNull().default(0), updatedAt:timestamp("updated_at",{withTimezone:true}).notNull().defaultNow() }, table=>[primaryKey({columns:[table.scopeId,table.periodStart]})]);
