# ReconcileFlow

ReconcileFlow is a file reconciliation application for comparing CSV and Excel files.

It helps users find:

* Missing records
* Extra records
* Duplicate keys
* Field-level differences
* Formatting issues
* Data transformation errors

The current version is intended for pilot testing with synthetic or approved non-sensitive data only.

Do not use it with payroll, medical, banking, or other regulated production data.

## Technology

ReconcileFlow uses:

* Next.js
* React
* TypeScript
* Clerk authentication
* PostgreSQL with Neon
* SheetJS for CSV and Excel parsing
* Local or S3-compatible private file storage

The reconciliation engine is deterministic. It compares records using configured keys, column mappings, and comparison rules.

## Requirements

Before running the project, install:

* Node.js 22.13 or newer
* npm 10 or newer
* PostgreSQL or a Neon database
* A Clerk application

For hosted deployments, you also need a private S3-compatible storage bucket.

## Run locally

Clone the repository:

```bash
git clone <your-private-repository-url>
cd reconcileflow
```

Install dependencies:

```bash
npm ci
```

Create your local environment file:

```bash
cp .env.example .env.local
```

Add the required environment variables to `.env.local`.

Run the database migrations:

```bash
npm run db:migrate
```

Start the application:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

Local uploaded files are stored in:

```text
.data/objects
```

This folder is excluded from Git.

## Available commands

| Command               | Purpose                            |
| --------------------- | ---------------------------------- |
| `npm run dev`         | Start the local development server |
| `npm run typecheck`   | Run TypeScript checks              |
| `npm run lint`        | Run ESLint                         |
| `npm test`            | Run automated tests                |
| `npm run build`       | Create a production build          |
| `npm start`           | Start the production build         |
| `npm run db:migrate`  | Apply database migrations          |
| `npm run db:generate` | Generate migration metadata        |

## Environment variables

Copy `.env.example` and add your own values.

Never commit real secrets to GitHub.

### Required

```text
DATABASE_URL
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
CLERK_SECRET_KEY
APP_URL
MIGRATION_TOKEN
CLEANUP_TOKEN
```

### File storage

```text
STORAGE_DRIVER
LOCAL_STORAGE_PATH
S3_BUCKET
S3_REGION
S3_ENDPOINT
S3_FORCE_PATH_STYLE
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
```

Use:

```text
STORAGE_DRIVER=local
```

for local development.

Use:

```text
STORAGE_DRIVER=s3
```

for hosted deployments such as Vercel.

### Pilot limits

The application supports configurable limits for:

* File size
* Row count
* Column count
* Worksheet count
* Report size
* Processing timeout
* File retention
* Result retention
* Report retention

Default values are defined in:

```text
app/api/server.ts
```

## Clerk setup

1. Create a Clerk application.
2. Enable email and password sign-in.
3. Enable email verification.
4. Enable password reset.
5. Optionally enable Google sign-in.
6. Add your local and production URLs to Clerk's allowed origins and redirect URLs.

For local development, add:

```text
http://localhost:3000
```

Set these values in `.env.local`:

```text
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
CLERK_SECRET_KEY
APP_URL=http://localhost:3000
```

ReconcileFlow does not store passwords, password hashes, session tokens, or Clerk secrets in PostgreSQL.

## Neon database setup

1. Create a Neon project.
2. Copy the pooled PostgreSQL connection string.
3. Add it to `.env.local` as:

```text
DATABASE_URL
```

4. Run:

```bash
npm run db:migrate
```

Database migrations are versioned and applied separately from normal application requests.

Back up production data before applying migrations.

## File storage and cleanup

ReconcileFlow temporarily stores:

* Uploaded source files
* Uploaded target files
* Reconciliation details
* Generated reports

Uploaded source files are deleted after processing.

Detailed results and reports are deleted after their configured retention period.

Failed deletions are retried and recorded for review.

Cleanup can be started using:

```bash
curl -X POST "$APP_URL/api/internal/cleanup" \
  -H "Authorization: Bearer $CLEANUP_TOKEN"
```

For hosted deployments, configure a scheduled job to call this endpoint.

Deletion happens during the cleanup window and may not occur at the exact expiration time.

## Deployment

### Vercel

1. Push the project to a private GitHub repository.
2. Import the repository into Vercel.
3. Add all required environment variables.
4. Set:

```text
STORAGE_DRIVER=s3
```

5. Set the install command:

```bash
npm ci
```

6. Set the build command:

```bash
npm run build
```

7. Run database migrations before deploying the new version:

```bash
npm run db:migrate
```

8. Deploy the application.
9. Test Clerk sign-in.
10. Verify the health endpoint.
11. Configure scheduled cleanup.

Do not use local file storage on Vercel because its filesystem is temporary.

### Other Node.js hosts

Run:

```bash
npm ci
npm run db:migrate
npm run build
npm start
```

A host with persistent private disk storage may use local storage.

For multiple application instances or temporary filesystems, use S3-compatible storage.

## Current limitations

This version is for limited pilot use only.

It does not currently include:

* Malware scanning
* Data loss prevention
* Enterprise SSO
* SOC 2 certification
* Regulatory certification
* Legal hold
* Independent penetration testing
* Formal compliance approval

Reports may temporarily contain complete missing or extra records.

Uploaded files are not antivirus-scanned.

Spreadsheet macros and formulas are not executed.

Corrupted, encrypted, or unsupported workbooks are rejected when detected.

Security, encryption, backup, retention, and regional settings for Neon, Clerk, and object storage must be configured by the project owner.

Use only synthetic or approved non-sensitive files until the application has completed a formal security review.

## Sample files

Synthetic CSV and Excel files are available in:

```text
examples/data
```

They contain intentional differences for testing and do not contain real personal data.
