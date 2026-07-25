# ReconcileFlow

Standalone source for the ReconcileFlow limited pilot. It preserves the current React interface and deterministic CSV/XLSX reconciliation behavior while replacing ChatGPT Sites/Cloudflare runtime bindings with portable Node.js implementations.

> Pilot scope: use synthetic or explicitly approved non-sensitive data only. This project is not certified for payroll, medical, banking, or other regulated production data.

## Architecture

- **Web application:** Next.js 16 App Router, React 19, TypeScript, CSS, Lucide icons
- **Authentication:** Clerk hosted account flows and server-validated session tokens
- **Database:** Neon-compatible PostgreSQL via `@neondatabase/serverless`; append-only SQL migrations
- **Reconciliation:** deterministic indexed TypeScript engine; CSV/XLSX parsing with SheetJS
- **Object storage:** local private filesystem for development, or S3-compatible private object storage for deployments
- **API:** Next.js route handlers for reconciliation, templates, history, details, downloads, cleanup, migration, health, and security status

PostgreSQL stores users, owner-scoped templates and run metadata, summaries, audit events, rate limits, cleanup state, and object metadata. Complete uploaded datasets are not stored in PostgreSQL. Source uploads are removed after processing; details and reports are temporary objects.

## Requirements

- Node.js **22.13 or newer**
- npm 10+
- PostgreSQL (Neon is recommended)
- Clerk application
- For hosted deployments, a private S3-compatible bucket (AWS S3, Cloudflare R2 through its S3 API, or another compatible provider)

## Local installation

```bash
git clone <your-private-repository-url>
cd reconcileflow
npm ci
cp .env.example .env.local
```

Populate `.env.local`, create the database schema, and start development:

```bash
npm run db:migrate
npm run dev
```

Open `http://localhost:3000`. Local object files default to `.data/objects` and are gitignored.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Local Next.js development server |
| `npm run typecheck` | TypeScript compiler check |
| `npm run lint` | ESLint |
| `npm test` | Automated engine, parser, persistence, migration, and security tests |
| `npm run build` | Production build |
| `npm start` | Start the production build |
| `npm run db:migrate` | Apply non-destructive append-only migrations with a database lock |
| `npm run db:generate` | Generate Drizzle migration metadata when schema definitions change |

## Environment variables

Copy `.env.example`; never commit real values.

### Required

- `DATABASE_URL` — Neon/PostgreSQL connection string
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` — Clerk public browser key
- `CLERK_SECRET_KEY` — Clerk server secret
- `APP_URL` — exact public origin, e.g. `http://localhost:3000` or the production HTTPS URL
- `MIGRATION_TOKEN` — bearer token protecting the administrative migration endpoint
- `CLEANUP_TOKEN` — bearer token protecting the cleanup endpoint

### Storage

- `STORAGE_DRIVER` — `local` for development or `s3` for hosted deployments
- `LOCAL_STORAGE_PATH` — local private directory; defaults to `.data/objects`
- `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT`, `S3_FORCE_PATH_STYLE` — S3-compatible bucket settings
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` — server-only object-store credentials recognized by the AWS SDK

### Pilot controls

- `MAX_UPLOAD_BYTES`, `MAX_ROWS_PER_FILE`, `MAX_COLUMNS_PER_FILE`, `MAX_WORKSHEETS`
- `MAX_CSV_ROW_LENGTH`, `MAX_REPORT_BYTES`, `MAX_CONCURRENT_RUNS`, `PROCESSING_TIMEOUT_MS`
- `FILE_RETENTION_MINUTES`, `RESULT_RETENTION_HOURS`, `REPORT_RETENTION_HOURS`

Omitted pilot-control values use conservative defaults defined in `app/api/server.ts`.

## Clerk setup

1. Create a Clerk application and enable email/password, email verification, and password reset.
2. Optionally enable Google in Clerk's social connections.
3. Add `http://localhost:3000` and each deployment origin to Clerk's allowed origins/redirect URLs.
4. Set the publishable and secret keys in `.env.local` and in the hosting provider's environment settings.
5. Set `APP_URL` to the exact origin for each environment.

Passwords, password hashes, session tokens, OAuth tokens, and provider secrets are never persisted in ReconcileFlow's PostgreSQL tables. Local users are uniquely keyed by Clerk's stable provider user ID. Pre-Clerk records remain quarantined as `legacy_chatgpt` and are not assigned automatically.

## Neon PostgreSQL setup

1. Create a Neon project/database and copy its pooled connection string to `DATABASE_URL`.
2. Run `npm run db:migrate` as an explicit release step before starting the new application version.
3. Migrations are append-only, versioned in `db/migrations.ts`, tracked in `rf_schema_migrations`, and protected by `rf_migration_lock`.

Normal requests only check schema compatibility; they do not modify the schema. Back up production data before migrations.

## Temporary storage and cleanup

Development uses a private local directory. Vercel and other serverless deployments must use `STORAGE_DRIVER=s3`; serverless filesystems are ephemeral and are not a durable report store.

Uploads are tracked in `rf_storage_objects` and deleted after processing. Result details and generated reports have configurable expiration times. Deletion failures are retried with bounded exponential backoff, recorded, and left for administrative review. Invoke the protected endpoint periodically:

```bash
curl -X POST "$APP_URL/api/internal/cleanup" -H "Authorization: Bearer $CLEANUP_TOKEN"
```

On Vercel, configure a Cron Job for this endpoint through a small trusted scheduler/proxy capable of setting the bearer header, or call it from an external scheduler. Retention means deletion within the cleanup window, not at an exact second.

## Deployment

### Vercel

1. Push this directory to a private GitHub repository and import it into Vercel as a Next.js project.
2. Configure every required environment variable. Use `STORAGE_DRIVER=s3`; do not use local storage.
3. Set the Build Command to `npm run build` and Install Command to `npm ci`.
4. Run `npm run db:migrate` from a controlled release job before promoting the deployment. Alternatively call `/api/admin/migrate` with `Authorization: Bearer $MIGRATION_TOKEN` as a separate protected release gate.
5. Deploy, verify `/api/health`, test Clerk sign-in, then schedule cleanup.

### Other Node hosts

Run `npm ci`, `npm run db:migrate`, `npm run build`, then `npm start`. A persistent private disk may use local storage; horizontally scaled or ephemeral hosts should use S3-compatible storage.

## Security and pilot limitations

- Intended only for synthetic or approved non-sensitive data.
- No malware scanning, DLP, penetration test, SOC 2, regulatory certification, enterprise SSO, legal hold, or formal compliance claim.
- Reports may contain complete missing/extra records and temporarily exist in private object storage.
- Detailed result pages return requested pages to browser memory; responses are `no-store`, but endpoint/browser/infrastructure behavior has not undergone independent security assessment.
- Cleanup requires an external periodic scheduler and provides window-based, not exact-second, deletion.
- Local filesystem storage is single-instance only and unsuitable for Vercel production.
- S3 permissions, encryption, lifecycle rules, backup, retention, and region controls remain the deployer's responsibility.
- Rate limiting is database-backed pilot protection, not a global edge WAF.
- Uploaded workbooks are not antivirus-scanned. Macros/formulas are not executed; unsupported encrypted/corrupt workbooks are rejected by application validation.
- Live two-account Clerk isolation, email delivery, password reset delivery, and natural session expiration should be re-tested in the owner's Clerk instance before inviting pilot users.
- Logs and infrastructure metadata outside this repository depend on the selected providers.

## Portability notes

Removed Sites-specific dependencies:

| Previous dependency | Portable replacement | Files |
|---|---|---|
| `cloudflare:workers` environment import | `process.env` | `app/layout.tsx`, `app/account/page.tsx`, `app/api/server.ts`, `db/index.ts` |
| Cloudflare R2 binding `UPLOADS` | local/S3-compatible object-store adapter | `app/api/object-store.ts`, `app/api/server.ts` |
| Vinext/Vite/Worker hosting entry | native Next.js scripts and build | `package.json`, `next.config.ts` |
| Sites hosting manifest and Vite plugin | removed from standalone archive | `.openai/hosting.json`, `vite.config.ts`, `worker/index.ts`, `build/sites-vite-plugin.ts` |
| Fixed Sites origin in Clerk validation | environment-controlled `APP_URL` | `app/api/server.ts`, `app/account/page.tsx` |

No current feature requires ChatGPT Sites at runtime. Operational items that cannot be automated in source are provider configuration: Clerk allowed origins, Neon credentials, private S3 bucket credentials/policy, migration release gating, and cleanup scheduling.

## Sample data

Synthetic CSV and XLSX files are in `examples/data`. They intentionally include a salary mismatch for demonstrating results and contain no real personal data.
