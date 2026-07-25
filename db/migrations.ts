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
];
