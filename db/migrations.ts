export type Migration = {
  version: number;
  name: string;
  statements: string[];
};

// Append-only migrations. Never edit a migration after it has shipped.
export const migrations: Migration[] = [
  {
    version: 1,
    name: "initial_pilot_schema",
    statements: [
      `CREATE TABLE IF NOT EXISTS rf_users (
        id uuid PRIMARY KEY,
        email text NOT NULL UNIQUE,
        display_name text,
        created_at timestamptz NOT NULL DEFAULT now(),
        last_seen_at timestamptz NOT NULL DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS rf_templates (
        id uuid PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES rf_users(id) ON DELETE CASCADE,
        name text NOT NULL,
        description text NOT NULL DEFAULT '',
        mappings jsonb NOT NULL,
        rules jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )`,
      `CREATE INDEX IF NOT EXISTS rf_templates_user_idx ON rf_templates(user_id, updated_at DESC)`,
      `CREATE TABLE IF NOT EXISTS rf_runs (
        id uuid PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES rf_users(id) ON DELETE CASCADE,
        name text NOT NULL,
        status text NOT NULL CHECK (status IN ('processing','completed','failed')),
        source_name text NOT NULL,
        target_name text NOT NULL,
        source_format text NOT NULL,
        target_format text NOT NULL,
        source_rows integer,
        target_rows integer,
        mappings jsonb NOT NULL,
        rules jsonb NOT NULL DEFAULT '{}'::jsonb,
        summary jsonb,
        report_key text,
        report_expires_at timestamptz,
        report_deleted_at timestamptz,
        failure_message text,
        created_at timestamptz NOT NULL DEFAULT now(),
        completed_at timestamptz
      )`,
      `CREATE INDEX IF NOT EXISTS rf_runs_user_idx ON rf_runs(user_id, created_at DESC)`,
    ],
  },
  {
    version: 2,
    name: "pilot_security_hardening",
    statements: [
      `CREATE TABLE IF NOT EXISTS rf_storage_objects (
        id uuid PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES rf_users(id) ON DELETE CASCADE,
        run_id uuid REFERENCES rf_runs(id) ON DELETE CASCADE,
        kind text NOT NULL CHECK (kind IN ('source','target','result','report')),
        object_key text NOT NULL UNIQUE,
        status text NOT NULL CHECK (status IN ('active','deleting','deleted','cleanup_failed')) DEFAULT 'active',
        expires_at timestamptz NOT NULL,
        retry_count integer NOT NULL DEFAULT 0,
        last_error_code text,
        last_attempt_at timestamptz,
        deleted_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      )`,
      `CREATE INDEX IF NOT EXISTS rf_storage_cleanup_idx ON rf_storage_objects(status, expires_at)`,
      `CREATE INDEX IF NOT EXISTS rf_storage_owner_idx ON rf_storage_objects(user_id, run_id)`,
      `CREATE TABLE IF NOT EXISTS rf_audit_log (
        id uuid PRIMARY KEY,
        user_id uuid REFERENCES rf_users(id) ON DELETE SET NULL,
        run_id uuid REFERENCES rf_runs(id) ON DELETE SET NULL,
        request_id text NOT NULL,
        event_type text NOT NULL,
        stage text NOT NULL,
        safe_code text,
        created_at timestamptz NOT NULL DEFAULT now()
      )`,
      `CREATE INDEX IF NOT EXISTS rf_audit_user_idx ON rf_audit_log(user_id, created_at DESC)`,
      `CREATE TABLE IF NOT EXISTS rf_cleanup_state (
        singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
        last_started_at timestamptz,
        last_completed_at timestamptz,
        last_status text,
        processed_count integer NOT NULL DEFAULT 0,
        failed_count integer NOT NULL DEFAULT 0
      )`,
      `INSERT INTO rf_cleanup_state (singleton, last_status) VALUES (true, 'never_run') ON CONFLICT (singleton) DO NOTHING`,
      `CREATE TABLE IF NOT EXISTS rf_rate_limits (
        user_id uuid NOT NULL REFERENCES rf_users(id) ON DELETE CASCADE,
        bucket text NOT NULL,
        window_started_at timestamptz NOT NULL,
        request_count integer NOT NULL DEFAULT 0,
        failure_count integer NOT NULL DEFAULT 0,
        PRIMARY KEY (user_id, bucket)
      )`,
    ],
  },
  {
    version: 3,
    name: "clerk_application_identity",
    statements: [
      `ALTER TABLE rf_users ADD COLUMN IF NOT EXISTS auth_provider text NOT NULL DEFAULT 'legacy_chatgpt'`,
      `ALTER TABLE rf_users ADD COLUMN IF NOT EXISTS provider_user_id text`,
      `ALTER TABLE rf_users DROP CONSTRAINT IF EXISTS rf_users_email_key`,
      `CREATE UNIQUE INDEX IF NOT EXISTS rf_users_provider_identity_idx ON rf_users(auth_provider, provider_user_id) WHERE provider_user_id IS NOT NULL`,
      `CREATE INDEX IF NOT EXISTS rf_users_email_idx ON rf_users(email)`,
    ],
  },
  {
    version: 4,
    name: "clerk_identity_timestamps",
    statements: [
      `ALTER TABLE rf_users RENAME COLUMN last_seen_at TO last_login_at`,
    ],
  },
  {
    version: 5,
    name: "stripe_billing_and_team_entitlements",
    statements: [
      `CREATE TABLE IF NOT EXISTS rf_subscriptions (
        user_id uuid PRIMARY KEY REFERENCES rf_users(id) ON DELETE CASCADE,
        stripe_customer_id text UNIQUE,
        stripe_subscription_id text UNIQUE,
        plan text NOT NULL CHECK (plan IN ('free','professional','team')) DEFAULT 'free',
        billing_interval text CHECK (billing_interval IN ('month','year')),
        status text NOT NULL DEFAULT 'free',
        current_period_start timestamptz,
        current_period_end timestamptz,
        cancel_at_period_end boolean NOT NULL DEFAULT false,
        updated_at timestamptz NOT NULL DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS rf_workspaces (
        id uuid PRIMARY KEY,
        owner_user_id uuid NOT NULL REFERENCES rf_users(id) ON DELETE CASCADE,
        name text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS rf_workspaces_owner_idx ON rf_workspaces(owner_user_id)`,
      `CREATE TABLE IF NOT EXISTS rf_workspace_members (
        workspace_id uuid NOT NULL REFERENCES rf_workspaces(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES rf_users(id) ON DELETE CASCADE,
        role text NOT NULL CHECK (role IN ('owner','admin','member')),
        joined_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (workspace_id,user_id)
      )`,
      `CREATE TABLE IF NOT EXISTS rf_workspace_invitations (
        id uuid PRIMARY KEY,
        workspace_id uuid NOT NULL REFERENCES rf_workspaces(id) ON DELETE CASCADE,
        email text NOT NULL,
        token_hash text NOT NULL UNIQUE,
        role text NOT NULL CHECK (role IN ('admin','member')) DEFAULT 'member',
        expires_at timestamptz NOT NULL,
        accepted_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS rf_workspace_open_invite_idx ON rf_workspace_invitations(workspace_id,lower(email)) WHERE accepted_at IS NULL`,
      `CREATE TABLE IF NOT EXISTS rf_plan_usage (
        scope_id uuid NOT NULL,
        period_start date NOT NULL,
        reconciliation_count integer NOT NULL DEFAULT 0,
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (scope_id,period_start)
      )`,
      `ALTER TABLE rf_templates ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES rf_workspaces(id) ON DELETE CASCADE`,
      `ALTER TABLE rf_runs ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES rf_workspaces(id) ON DELETE CASCADE`,
      `CREATE INDEX IF NOT EXISTS rf_templates_workspace_idx ON rf_templates(workspace_id,updated_at DESC)`,
      `CREATE INDEX IF NOT EXISTS rf_runs_workspace_idx ON rf_runs(workspace_id,created_at DESC)`,
      `INSERT INTO rf_subscriptions (user_id,plan,status) SELECT id,'free','free' FROM rf_users ON CONFLICT (user_id) DO NOTHING`,
    ],
  },
];
