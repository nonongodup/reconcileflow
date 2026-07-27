# ReconcileFlow source handoff report

## Verification completed

- TypeScript: passed (`tsc --noEmit`)
- ESLint: passed
- Automated tests: 64 passed, 0 failed
- Production build: passed with Next.js 16.2.6
- Sites-only runtime import scan: passed for application, database, and configuration source
- Secret-pattern scan: passed; `.env.example` contains names and blank values only
- Production dependency audit: passed with 0 known vulnerabilities (`npm audit --omit=dev`)
- Package manifest and npm lockfile: present
- Synthetic CSV and XLSX examples: present
- Required startup variables and commands: documented in `README.md`

The production server command could not be smoke-started inside the export sandbox because Node's network-interface discovery is blocked there (`uv_interface_addresses`). The same source completed the native Next.js production build, including route compilation and static generation. Run `npm start` locally after setting the documented variables for the final environment-specific startup check.

## Portability status

There are no remaining ChatGPT Sites-only runtime imports or bindings. Native Next.js replaced Vinext/Worker hosting; `process.env` replaced Cloudflare environment imports; the R2 binding was replaced by a local/S3-compatible object-store adapter; and Clerk's authorized origin is now configured through `APP_URL`.

External configuration still required:

- Clerk application keys, allowed origins, and redirect URLs
- Neon/PostgreSQL connection and explicit migration execution
- Private S3-compatible storage for Vercel/serverless production
- A periodic authorized cleanup scheduler
- Hosting-provider environment variables and operational security settings
- Stripe products and four recurring Price IDs, a production webhook signing secret, and Customer Portal configuration
- End-to-end Stripe test-mode checkout, renewal, cancellation, failed-payment, and webhook-retry validation before accepting live payments
- An organization-approved malware scanner configured with `MALWARE_SCAN_MODE=required`
- A private security-alert receiver and monitored hourly cleanup job
- S3 public-access blocking, least-privilege IAM, encryption/lifecycle policies, and cloud audit logging

These are deployment responsibilities rather than unresolved source dependencies.

## Behavior note

The interface, content, reconciliation behavior, persistence model, authentication flows, ownership restrictions, cleanup/retry behavior, report downloads, and current pilot limits are preserved. A date parsing defect exposed by running the original XLSX cross-format tests under native Node was corrected so the existing intended behavior and all original tests remain valid.

The pricing cards now maintain a real selected-plan state. Professional is selected by default, and users can switch to Free or Team. Paid selections create server-authenticated Stripe Checkout sessions; subscription state is synchronized through signature-verified Stripe webhooks.

Plan limits are enforced on the server:

- Free: 3 reconciliations per calendar month, 2,000 rows per file, CSV, no saved templates or advanced rules
- Professional: 30 reconciliations per calendar month, 100,000 rows per file, CSV/XLSX, saved templates and advanced rules
- Team: 100 reconciliations per calendar month, 250,000 rows per file, shared templates/history/audit access, and at most 10 accepted or invited users

Monthly and annual subscriptions are supported. Annual prices are 15% below twelve monthly payments: Professional is $295.80/year and Team is $1,009.80/year.

## Billing limitations requiring operational completion

- No live Stripe credentials or card data are included in this archive.
- Stripe test-mode flows could not be exercised without the owner's Stripe account and configured Price IDs. The source should not be switched to live mode until the documented test checklist passes.
- Team invitations produce secure, expiring invitation links, but transactional email delivery is not bundled; the owner must deliver links through an approved channel or add a mail provider later.
- Tax collection, invoices, refunds, disputes, legal terms, and the advertised priority-support process require merchant configuration and operating procedures outside this source project.
- Usage is measured by calendar month. A reconciliation reserved for processing counts toward usage even if later file validation or processing fails.

## Security hardening added in version 3

- Raw uploads pass through a configurable malware scanner before object storage or parsing.
- Production `required` mode fails closed when the scanner is missing, unavailable, malformed, or reports a threat.
- Scanner rejections and availability failures emit sanitized security events without filenames, emails, rows, credentials, or raw exceptions.
- Object deletion is verified by confirming the object is absent; unverifiable deletion is tracked, audited, alerted, and retried.
- Vercel Cron is configured for hourly cleanup using a separate `CRON_SECRET`.
- S3 writes support `AES256` or KMS server-side encryption and preserve content type/retention metadata.
- Local development objects use private directory/file permissions.
- Security headers disable framing, MIME sniffing, unnecessary browser capabilities, and referrer leakage.
- `npm run security:check` blocks a production release when required scanner, monitoring, HTTPS, storage, encryption, or secret configuration is missing.
- Next.js was upgraded to 16.2.12, SheetJS was upgraded to the patched official 0.20.3 distribution, and vulnerable transitive production dependencies were overridden with patched versions.

These controls do not constitute a penetration test, SOC 2 report, regulatory certification, DPA, privacy/legal approval, or authorization to process highly sensitive production data. Those require review of the deployed infrastructure and independent qualified professionals.
