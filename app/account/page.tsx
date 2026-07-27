import { createClerkClient } from "@clerk/backend";
import { UserProfile } from "@clerk/nextjs";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import BillingPanel from "./BillingPanel";
import "./account.css";

export default async function AccountPage() {
  const requestHeaders = await headers(),
    host = requestHeaders.get("host") || "localhost:3000",
    protocol =
      requestHeaders.get("x-forwarded-proto") ||
      (host.startsWith("localhost") ? "http" : "https");
  if (
    !process.env.CLERK_SECRET_KEY ||
    !process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
  )
    redirect("/sign-in?redirect_url=%2Faccount");
  const clerk = createClerkClient({
    secretKey: process.env.CLERK_SECRET_KEY,
    publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  });
  const state = await clerk.authenticateRequest(
    new Request(`${protocol}://${host}/account`, { headers: requestHeaders }),
    {
      acceptsToken: "session_token",
      authorizedParties: process.env.APP_URL
        ? [process.env.APP_URL]
        : undefined,
    }
  );
  if (!state.isAuthenticated) redirect("/sign-in?redirect_url=%2Faccount");
  return (
    <main className="account-page">
      <div className="account-header">
        <Link href="/" className="account-brand">
          <span>R</span>ReconcileFlow
        </Link>
        <Link href="/#/workspace" className="account-back">
          Back to workspace
        </Link>
      </div>
      <div className="account-layout">
        <BillingPanel />
        <UserProfile
          routing="hash"
          appearance={{
            elements: {
              rootBox: { width: "100%" },
              cardBox: { width: "100%", maxWidth: "1100px" },
              card: { width: "100%" },
            },
          }}
        />
      </div>
    </main>
  );
}
