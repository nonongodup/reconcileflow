import { neon } from "@neondatabase/serverless";
import { migrations } from "./migrations";

type RuntimeEnv = { DATABASE_URL?: string };

export function getSql() {
  const databaseUrl = (process.env as RuntimeEnv).DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not configured.");
  return neon(databaseUrl);
}

export async function assertSchemaCompatible(requiredVersion = 4) {
  const sql = getSql();
  try {
    const rows = await sql`SELECT max(version) AS version FROM rf_schema_migrations`;
    if (Number(rows[0]?.version || 0) < requiredVersion) throw new Error("SCHEMA_OUTDATED");
  } catch (error) {
    if (error instanceof Error && error.message === "SCHEMA_OUTDATED") throw error;
    throw new Error("SCHEMA_UNAVAILABLE");
  }
}

export async function applyMigrations() {
  const sql = getSql();
  await sql`CREATE TABLE IF NOT EXISTS rf_migration_lock (singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton), acquired_at timestamptz NOT NULL)`;
  const lock = await sql`INSERT INTO rf_migration_lock (singleton,acquired_at) VALUES (true,now())
    ON CONFLICT (singleton) DO UPDATE SET acquired_at=EXCLUDED.acquired_at
    WHERE rf_migration_lock.acquired_at < now() - interval '10 minutes' RETURNING singleton`;
  if (!lock[0]) throw new Error("MIGRATION_ALREADY_RUNNING");
  try {
  await sql`CREATE TABLE IF NOT EXISTS rf_schema_migrations (
    version integer PRIMARY KEY,
    name text NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`;
  const appliedRows = await sql`SELECT version FROM rf_schema_migrations`;
  const applied = new Set(appliedRows.map((row) => Number(row.version)));

  for (const migration of migrations) {
    if (applied.has(migration.version)) continue;
    for (const statement of migration.statements) await sql.query(statement, []);
    await sql`INSERT INTO rf_schema_migrations (version, name)
      VALUES (${migration.version}, ${migration.name}) ON CONFLICT (version) DO NOTHING`;
  }
  } finally {
    await sql`DELETE FROM rf_migration_lock WHERE singleton=true`;
  }
}

export async function verifyDatabaseConnection() {
  const sql = getSql();
  const rows = await sql`SELECT current_database() AS database_name, now() AS checked_at`;
  return { connected: rows.length === 1, checkedAt: rows[0]?.checked_at };
}

export async function upsertUser(providerUserId: string, email: string, displayName: string | null, accountCreatedAt: Date, lastLoginAt: Date) {
  await assertSchemaCompatible();
  const sql = getSql();
  const id = crypto.randomUUID();
  const rows = await sql`INSERT INTO rf_users (id, auth_provider, provider_user_id, email, display_name, created_at, last_login_at)
    VALUES (${id}, 'clerk', ${providerUserId}, ${email}, ${displayName}, ${accountCreatedAt.toISOString()}, ${lastLoginAt.toISOString()})
    ON CONFLICT (auth_provider, provider_user_id) WHERE provider_user_id IS NOT NULL
    DO UPDATE SET email = EXCLUDED.email, display_name = EXCLUDED.display_name, last_login_at = EXCLUDED.last_login_at
    RETURNING id, email, display_name, provider_user_id`;
  return rows[0] as { id: string; email: string; display_name: string | null };
}
