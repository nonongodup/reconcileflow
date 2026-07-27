"use client";
import { useEffect, useState } from "react";

type Billing = {
  plan: "free" | "professional" | "team";
  entitlements: { runsPerMonth: number; rowsPerFile: number; seats: number };
  usage: { reconciliations: number; members: number };
  subscription?: {
    status?: string;
    billing_interval?: string;
    current_period_end?: string;
    cancel_at_period_end?: boolean;
  };
};

export default function BillingPanel() {
  const [billing, setBilling] = useState<Billing | null>(null),
    [busy, setBusy] = useState(false),
    [email, setEmail] = useState(""),
    [invite, setInvite] = useState("");
  useEffect(() => {
    const load = () =>
      fetch("/api/billing/status", { cache: "no-store" })
        .then((r) => r.json())
        .then(setBilling);
    const token = new URLSearchParams(window.location.search).get("invite");
    if (token)
      fetch("/api/team/accept", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      }).finally(() => {
        window.history.replaceState({}, "", "/account");
        void load();
      });
    else void load();
  }, []);
  const post = async (url: string, body?: unknown) => {
    setBusy(true);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: body ? { "content-type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Request failed");
      if (data.url) window.location.assign(data.url);
      return data;
    } finally {
      setBusy(false);
    }
  };
  if (!billing)
    return (
      <section className="billing-panel">Loading billing information…</section>
    );
  return (
    <section className="billing-panel">
      <div>
        <p className="billing-label">Current plan</p>
        <h2>{billing.plan[0].toUpperCase() + billing.plan.slice(1)}</h2>
        <p>
          {billing.usage.reconciliations} of {billing.entitlements.runsPerMonth}{" "}
          reconciliations used this month
        </p>
        <div className="usage-track">
          <span
            style={{
              width: `${Math.min(
                100,
                (billing.usage.reconciliations /
                  billing.entitlements.runsPerMonth) *
                  100
              )}%`,
            }}
          />
        </div>
      </div>
      <div className="billing-actions">
        {billing.plan !== "free" && (
          <button disabled={busy} onClick={() => post("/api/billing/portal")}>
            Manage billing
          </button>
        )}
        {billing.plan === "free" && (
          <>
            <button
              disabled={busy}
              onClick={() =>
                post("/api/billing/checkout", {
                  plan: "professional",
                  interval: "month",
                })
              }
            >
              Upgrade to Professional
            </button>
            <button
              disabled={busy}
              onClick={() =>
                post("/api/billing/checkout", {
                  plan: "team",
                  interval: "month",
                })
              }
            >
              Upgrade to Team
            </button>
          </>
        )}
      </div>
      {billing.plan === "team" && (
        <div className="team-invite">
          <h3>Team members ({billing.usage.members}/10)</h3>
          <div>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="teammate@example.com"
            />
            <button
              disabled={busy || !email}
              onClick={async () => {
                const data = await post("/api/team/invitations", { email });
                setInvite(data.invitationUrl);
              }}
            >
              Create invitation
            </button>
          </div>
          {invite && (
            <p>
              Copy this private invitation link: <code>{invite}</code>
            </p>
          )}
        </div>
      )}
    </section>
  );
}
