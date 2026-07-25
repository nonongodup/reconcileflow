import { createClerkClient } from "@clerk/backend";
import { UserProfile } from "@clerk/nextjs";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";

type RuntimeEnv = {
  CLERK_SECRET_KEY?: string;
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?: string;
  APP_URL?: string;
};

export default async function AccountPage() {
  const runtime = process.env as RuntimeEnv;
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") || "localhost:3000";
  const protocol =
    requestHeaders.get("x-forwarded-proto") ||
    (host.startsWith("localhost") ? "http" : "https");

  if (
    !runtime.CLERK_SECRET_KEY ||
    !runtime.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
  ) {
    redirect("/sign-in?redirect_url=%2Faccount");
  }

  const clerk = createClerkClient({
    secretKey: runtime.CLERK_SECRET_KEY,
    publishableKey: runtime.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  });

  const state = await clerk.authenticateRequest(
    new Request(`${protocol}://${host}/account`, {
      headers: requestHeaders,
    }),
    {
      acceptsToken: "session_token",
      authorizedParties: runtime.APP_URL
        ? [runtime.APP_URL]
        : undefined,
    },
  );

  if (!state.isAuthenticated) {
    redirect("/sign-in?redirect_url=%2Faccount");
  }

  return (
    <main className="account-page">
     <div
  style={{
    minHeight: "74px",
    padding: "0 28px",
    background: "rgba(255, 255, 255, 0.96)",
    borderBottom: "1px solid #e3e9f0",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "20px",
  }}
>
  <Link
    href="/"
    style={{
      display: "flex",
      alignItems: "center",
      gap: "10px",
      color: "#13223a",
      fontSize: "19px",
      fontWeight: 800,
      textDecoration: "none",
      whiteSpace: "nowrap",
    }}
  >
    <span
      style={{
        width: "32px",
        height: "32px",
        borderRadius: "9px",
        display: "grid",
        placeItems: "center",
        color: "#ffffff",
        background: "#1463ff",
        flexShrink: 0,
      }}
    >
      R
    </span>

    ReconcileFlow
  </Link>

  <Link
    href="/#/workspace"
    style={{
      color: "#1463ff",
      fontSize: "14px",
      fontWeight: 700,
      textDecoration: "none",
      whiteSpace: "nowrap",
      padding: "10px 14px",
      border: "1px solid #b9cff3",
      borderRadius: "8px",
      background: "#f2f7ff",
    }}
  >
    Back to workspace
  </Link>
</div>

      <div className="account-content">
        <UserProfile
          routing="hash"
          appearance={{
            elements: {
              rootBox: {
                width: "100%",
              },
              cardBox: {
                width: "100%",
                maxWidth: "1100px",
                boxShadow: "0 15px 40px rgba(16, 35, 60, 0.10)",
              },
              card: {
                width: "100%",
              },
            },
          }}
        />
      </div>
    </main>
  );
}