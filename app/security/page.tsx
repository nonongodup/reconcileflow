"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

export default function SecurityStatus() {
  const [status, setStatus] = useState<Record<string, unknown> | null>(null);
  useEffect(() => { fetch("/api/security/status", { cache: "no-store" }).then(async (response) => { if (response.status === 401) { location.assign(`/sign-in?redirect_url=${encodeURIComponent("/security")}`); return; } setStatus(await response.json()); }); }, []);
  if (!status) return <main style={{ padding: 40, fontFamily: "system-ui" }}>Loading security status…</main>;
  return <main style={{ maxWidth: 850, margin: "40px auto", padding: 24, fontFamily: "system-ui" }}><Link href="/">← ReconcileFlow</Link><h1>Pilot security status</h1><p>This page contains no secrets. ReconcileFlow is limited to synthetic or approved non-sensitive pilot data.</p><dl>{Object.entries(status).filter(([key]) => key !== "limitations").map(([key, value]) => <div key={key} style={{ display: "grid", gridTemplateColumns: "260px 1fr", padding: "12px 0", borderBottom: "1px solid #ddd" }}><dt>{key}</dt><dd>{String(value ?? "Not yet run")}</dd></div>)}</dl><h2>Known limitations</h2><ul>{(status.limitations as string[]).map((item) => <li key={item}>{item}</li>)}</ul></main>;
}
