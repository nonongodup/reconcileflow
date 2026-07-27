import { getSql } from "../../db/index.ts";
import { SafeError } from "./logging.ts";

export type PlanKey = "free" | "professional" | "team";
export type BillingInterval = "month" | "year";
export const PLAN_ENTITLEMENTS = {
  free: { runsPerMonth: 3, rowsPerFile: 2_000, formats: ["csv"] as const, savedTemplates: false, advancedRules: false, seats: 1 },
  professional: { runsPerMonth: 30, rowsPerFile: 100_000, formats: ["csv", "xlsx"] as const, savedTemplates: true, advancedRules: true, seats: 1 },
  team: { runsPerMonth: 100, rowsPerFile: 250_000, formats: ["csv", "xlsx"] as const, savedTemplates: true, advancedRules: true, seats: 10 },
} as const;

const ACTIVE = new Set(["active", "trialing"]);
export async function getPlanAccess(userId: string) {
  const sql = getSql();
  await sql`INSERT INTO rf_subscriptions (user_id,plan,status) VALUES (${userId},'free','free') ON CONFLICT (user_id) DO NOTHING`;
  const memberships = await sql`SELECT w.id,w.owner_user_id,m.role,s.plan,s.status,s.billing_interval,s.current_period_end
    FROM rf_workspace_members m JOIN rf_workspaces w ON w.id=m.workspace_id
    JOIN rf_subscriptions s ON s.user_id=w.owner_user_id
    WHERE m.user_id=${userId} AND s.plan='team' AND s.status IN ('active','trialing') LIMIT 1`;
  if (memberships[0]) return { plan: "team" as PlanKey, entitlements: PLAN_ENTITLEMENTS.team, scopeId: String(memberships[0].id), workspaceId: String(memberships[0].id), role: String(memberships[0].role), subscription: memberships[0] };
  const rows = await sql`SELECT plan,status,billing_interval,current_period_end,cancel_at_period_end FROM rf_subscriptions WHERE user_id=${userId}`;
  const subscription = rows[0] as Record<string, unknown>;
  const paid = ACTIVE.has(String(subscription?.status));
  const plan = paid && (subscription?.plan === "professional" || subscription?.plan === "team") ? subscription.plan as PlanKey : "free";
  let workspaceId: string | null = null;
  if (plan === "team") {
    const workspace = await sql`INSERT INTO rf_workspaces (id,owner_user_id,name) VALUES (${crypto.randomUUID()},${userId},'My Team') ON CONFLICT (owner_user_id) DO UPDATE SET name=rf_workspaces.name RETURNING id`;
    workspaceId = String(workspace[0].id);
    await sql`INSERT INTO rf_workspace_members (workspace_id,user_id,role) VALUES (${workspaceId},${userId},'owner') ON CONFLICT DO NOTHING`;
  }
  return { plan, entitlements: PLAN_ENTITLEMENTS[plan], scopeId: workspaceId || userId, workspaceId, role: plan === "team" ? "owner" : "owner", subscription };
}

export async function reserveReconciliation(scopeId: string, monthlyLimit: number) {
  const sql = getSql();
  const rows = await sql`INSERT INTO rf_plan_usage (scope_id,period_start,reconciliation_count) VALUES (${scopeId},date_trunc('month',now())::date,1)
    ON CONFLICT (scope_id,period_start) DO UPDATE SET reconciliation_count=rf_plan_usage.reconciliation_count+1,updated_at=now()
    WHERE rf_plan_usage.reconciliation_count < ${monthlyLimit} RETURNING reconciliation_count`;
  if (!rows[0]) throw new SafeError("PLAN_LIMIT", 402);
  return Number(rows[0].reconciliation_count);
}

export function assertFormat(plan: PlanKey, names: string[]) {
  const allowed = new Set(PLAN_ENTITLEMENTS[plan].formats);
  if (names.some((name) => !allowed.has(name.toLowerCase().endsWith(".xlsx") ? "xlsx" : "csv"))) throw new SafeError("PLAN_FORMAT", 403);
}

export function hasAdvancedRules(rules: Record<string, unknown>) {
  return Boolean(rules.preserveLeadingZeros || rules.blankEqualsNull === false || rules.numericTolerance || rules.caseInsensitiveText === false || rules.trimWhitespace === false);
}
