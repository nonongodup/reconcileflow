import { createClerkClient } from "@clerk/backend";
import { UserProfile } from "@clerk/nextjs";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

type RuntimeEnv = { CLERK_SECRET_KEY?: string; NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?: string; APP_URL?: string };

export default async function AccountPage() {
  const runtime = process.env as RuntimeEnv;
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") || "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  if (!runtime.CLERK_SECRET_KEY || !runtime.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) redirect("/sign-in?redirect_url=%2Faccount");
  const clerk = createClerkClient({ secretKey: runtime.CLERK_SECRET_KEY, publishableKey: runtime.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY });
  const state = await clerk.authenticateRequest(new Request(`${protocol}://${host}/account`, { headers: requestHeaders }), {
    acceptsToken: "session_token",
    authorizedParties: runtime.APP_URL ? [runtime.APP_URL] : undefined,
  });
  if (!state.isAuthenticated) redirect("/sign-in?redirect_url=%2Faccount");
  return <main className="auth-page"><section className="auth-card clerk-card"><UserProfile /></section></main>;
}
