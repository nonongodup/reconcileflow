import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

const failures: string[] = [];
const warnings: string[] = [];
const required = [
  "DATABASE_URL", "CLERK_SECRET_KEY", "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "APP_URL", "MIGRATION_TOKEN", "CLEANUP_TOKEN", "CRON_SECRET",
  "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET",
  "MALWARE_SCANNER_URL", "MALWARE_SCANNER_TOKEN",
  "SECURITY_ALERT_WEBHOOK_URL",
];

for (const name of required) if (!process.env[name]) failures.push(`${name} is not configured`);
if (process.env.STORAGE_DRIVER !== "s3") failures.push("STORAGE_DRIVER must be s3 for a serverless production deployment");
for (const name of ["S3_BUCKET", "S3_REGION", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"]) if (!process.env[name]) failures.push(`${name} is not configured`);
if (process.env.MALWARE_SCAN_MODE !== "required") failures.push("MALWARE_SCAN_MODE must be required in production");
if (!["AES256", "aws:kms"].includes(process.env.S3_SERVER_SIDE_ENCRYPTION || "")) failures.push("S3_SERVER_SIDE_ENCRYPTION must be AES256 or aws:kms");
if ((Number(process.env.RESULT_RETENTION_HOURS || 4)) > 24) warnings.push("RESULT_RETENTION_HOURS exceeds 24 hours");
if ((Number(process.env.REPORT_RETENTION_HOURS || 24)) > 72) warnings.push("REPORT_RETENTION_HOURS exceeds 72 hours");
if (!process.env.APP_URL?.startsWith("https://")) failures.push("APP_URL must use HTTPS in production");

for (const warning of warnings) console.warn(`WARNING: ${warning}`);
if (failures.length) {
  for (const failure of failures) console.error(`FAILED: ${failure}`);
  process.exitCode = 1;
} else {
  console.log("Production security configuration check passed.");
}
