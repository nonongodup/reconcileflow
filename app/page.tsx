"use client";

import { ChangeEvent, useEffect, useState } from "react";
import { useAuth, useClerk, useUser } from "@clerk/nextjs";
import {
  Dataset,
  Row,
  getXlsxWorksheetNames,
  parseCsvText,
  parseXlsxBuffer,
  validateFile,
} from "./file-parsers";
import { Difference, Mapping, Result } from "./reconciliation";
import { Calculator, DatabaseZap, FileCheck2, RefreshCw, ShieldCheck, UsersRound } from "lucide-react";
import "./pricing.css";
type View = "home" | "workspace" | "templates" | "history" | "help";
type RunSummary = { sourceRows: number; targetRows: number; matched: number; missing: number; extra: number; differenceRecords: number; fieldDifferences: number; duplicateKeys: number; invalidKeys: number; compared: number; topFields: [string, number][] };
const RESULT_DETAIL_TYPES: Record<string, string> = { "Field Differences": "differences", "Missing in Target": "missing", "Extra in Target": "extra", "Duplicate Keys": "duplicateKeys", "Invalid Keys": "invalidKeys" };

const sourceRows: Row[] = [
  {
    "Employee ID": "00101",
    "First Name": "Amelia",
    "Last Name": "Chen",
    "Annual Salary": "85000",
    "Start Date": "2023-01-15",
    "Employment Status": "Active",
    Department: "Finance",
  },
  {
    "Employee ID": "00102",
    "First Name": "Marcus",
    "Last Name": "Hill",
    "Annual Salary": "72000",
    "Start Date": "2024-02-20",
    "Employment Status": "Active",
    Department: "Operations",
  },
  {
    "Employee ID": "00103",
    "First Name": " Sofia ",
    "Last Name": "Patel",
    "Annual Salary": "91500",
    "Start Date": "2022-11-01",
    "Employment Status": "ACTIVE",
    Department: "Technology",
  },
  {
    "Employee ID": "00104",
    "First Name": "Noah",
    "Last Name": "Williams",
    "Annual Salary": "68000",
    "Start Date": "03/14/2024",
    "Employment Status": "Leave",
    Department: "People",
  },
  {
    "Employee ID": "00105",
    "First Name": "Mia",
    "Last Name": "Garcia",
    "Annual Salary": "77000",
    "Start Date": "2021-08-09",
    "Employment Status": "Active",
    Department: "Sales",
  },
  {
    "Employee ID": "00106",
    "First Name": "Ethan",
    "Last Name": "Brown",
    "Annual Salary": "64000",
    "Start Date": "2025-01-06",
    "Employment Status": "Active",
    Department: "Support",
  },
  {
    "Employee ID": "00107",
    "First Name": "Ava",
    "Last Name": "Davis",
    "Annual Salary": "105000",
    "Start Date": "2020-05-12",
    "Employment Status": "Active",
    Department: "Legal",
  },
  {
    "Employee ID": "00107",
    "First Name": "Ava",
    "Last Name": "Davis",
    "Annual Salary": "105000",
    "Start Date": "2020-05-12",
    "Employment Status": "Active",
    Department: "Legal",
  },
  {
    "Employee ID": "",
    "First Name": "Liam",
    "Last Name": "Wilson",
    "Annual Salary": "59000",
    "Start Date": "2025-04-01",
    "Employment Status": "Active",
    Department: "Support",
  },
];
const targetRows: Row[] = [
  {
    "Worker ID": "101",
    "Legal First Name": "Amelia",
    "Legal Last Name": "Chen",
    "Salary Amount": "$85,000.00",
    "Hire Date": "01/15/2023",
    "Worker Status": "active",
    "Department Name": "Finance",
  },
  {
    "Worker ID": "102",
    "Legal First Name": "Marcus",
    "Legal Last Name": "Hill",
    "Salary Amount": "72000",
    "Hire Date": "2024-02-20",
    "Worker Status": "Active",
    "Department Name": "Operations",
  },
  {
    "Worker ID": "103",
    "Legal First Name": "Sofia",
    "Legal Last Name": "Patel",
    "Salary Amount": "91500",
    "Hire Date": "11/01/2022",
    "Worker Status": "Active",
    "Department Name": "Technology",
  },
  {
    "Worker ID": "104",
    "Legal First Name": "Noah",
    "Legal Last Name": "Williams",
    "Salary Amount": "68000",
    "Hire Date": "2024-03-14",
    "Worker Status": "Leave",
    "Department Name": "People",
  },
  {
    "Worker ID": "105",
    "Legal First Name": "Mia",
    "Legal Last Name": "Garcia",
    "Salary Amount": "79000",
    "Hire Date": "08/09/2021",
    "Worker Status": "Active",
    "Department Name": "Sales",
  },
  {
    "Worker ID": "107",
    "Legal First Name": "Ava",
    "Legal Last Name": "Davis",
    "Salary Amount": "105000",
    "Hire Date": "05/12/2020",
    "Worker Status": "Active",
    "Department Name": "Legal",
  },
  {
    "Worker ID": "108",
    "Legal First Name": "Lucas",
    "Legal Last Name": "Martin",
    "Salary Amount": "61000",
    "Hire Date": "2025-05-01",
    "Worker Status": "Active",
    "Department Name": "Marketing",
  },
];
const defaultMappings: Mapping[] = [
  ["Employee ID", "Worker ID", "Text"],
  ["First Name", "Legal First Name", "Text"],
  ["Last Name", "Legal Last Name", "Text"],
  ["Annual Salary", "Salary Amount", "Number"],
  ["Start Date", "Hire Date", "Date"],
  ["Employment Status", "Worker Status", "Text"],
  ["Department", "Department Name", "Text"],
].map(([source, target, type]) => ({
  source,
  target,
  type: type as Mapping["type"],
  include: true,
}));

const icons: Record<string, React.ReactNode> = {
  check: <span aria-hidden>✓</span>,
  alert: <span aria-hidden>!</span>,
  file: <span aria-hidden>▤</span>,
  arrow: <span aria-hidden>→</span>,
  download: <span aria-hidden>⇩</span>,
};
function csvDownload(name: string, rows: Record<string, unknown>[]) {
  const headers = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const esc = (x: unknown) => `"${String(x ?? "").replaceAll('"', '""')}"`;
  const blob = new Blob(
    [
      [
        headers.join(","),
        ...rows.map((r) => headers.map((h) => esc(r[h])).join(",")),
      ].join("\n"),
    ],
    { type: "text/csv" },
  );
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function Home() {
  const { isLoaded: authLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const clerk = useClerk();
  const [view, setView] = useState<View>("home"),
    [step, setStep] = useState(1),
    [source, setSource] = useState<Dataset | null>(null),
    [target, setTarget] = useState<Dataset | null>(null),
    [mappings, setMappings] = useState(defaultMappings),
    [preserveZeros, setPreserveZeros] = useState(false),
    [result, setResult] = useState<Result | null>(null),
    [runSummary, setRunSummary] = useState<RunSummary | null>(null),
    [tab, setTab] = useState("Summary"),
    [query, setQuery] = useState(""),
    [drawer, setDrawer] = useState<Difference | null>(null),
    [notice, setNotice] = useState(""),
    [processing, setProcessing] = useState(false),
    [currentRunId, setCurrentRunId] = useState<string | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<
    Partial<Record<"source" | "target", File>>
  >({});
  const [excelFiles, setExcelFiles] = useState<
    Partial<
      Record<
        "source" | "target",
        { buffer: ArrayBuffer; name: string; size: number }
      >
    >
  >({});
  const [sheetPicker, setSheetPicker] = useState<{
    side: "source" | "target";
    buffer: ArrayBuffer;
    name: string;
    size: number;
    names: string[];
  } | null>(null);
  const resultRecordDiffs = runSummary?.differenceRecords ?? 0;
  const sampleDataset = (name: string, rows: Row[]): Dataset => ({
    name,
    format: "CSV",
    size: "1.2 KB",
    sizeBytes: 1200,
    worksheetName: null,
    worksheetNames: [],
    headers: Object.keys(rows[0]),
    rows,
    records: rows.map((originalValues, i) => ({
      rowNumber: i + 2,
      originalValues,
      parsedValues: { ...originalValues },
    })),
    previewRows: rows.slice(0, 5),
    warnings: [],
  });
  const loadSample = () => {
    setSource(sampleDataset("workday_employee_source.csv", sourceRows));
    setTarget(sampleDataset("payroll_vendor_target.csv", targetRows));
    setMappings(defaultMappings);
    const toCsv = (rows: Row[]) => {
      const headers = Object.keys(rows[0]);
      return [headers.join(","), ...rows.map((row) => headers.map((header) => `"${String(row[header] ?? "").replaceAll('"', '""')}"`).join(","))].join("\n");
    };
    setUploadedFiles({
      source: new File([toCsv(sourceRows)], "workday_employee_source.csv", { type: "text/csv" }),
      target: new File([toCsv(targetRows)], "payroll_vendor_target.csv", { type: "text/csv" }),
    });
    setStep(1);
    setView("workspace");
  };
  const assignDataset = (side: "source" | "target", dataset: Dataset) => {
    if (side === "source") setSource(dataset);
    else setTarget(dataset);
    setNotice(dataset.warnings[0] || "");
  };
  const chooseSheet = (
    picker: NonNullable<typeof sheetPicker>,
    name: string,
  ) => {
    try {
      assignDataset(
        picker.side,
        parseXlsxBuffer(picker.buffer, picker.name, picker.size, name),
      );
      setSheetPicker(null);
    } catch (err) {
      setNotice(
        err instanceof Error ? err.message : "Could not read this worksheet.",
      );
    }
  };
  const changeSheet = (side: "source" | "target") => {
    const stored = excelFiles[side],
      dataset = side === "source" ? source : target;
    if (stored && dataset?.worksheetNames.length)
      setSheetPicker({ side, ...stored, names: dataset.worksheetNames });
  };
  const upload =
    (side: "source" | "target") => (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      setUploadedFiles((current) => ({ ...current, [side]: file }));
      (async () => {
        try {
          validateFile(file.name, file.size);
          if (file.name.toLowerCase().endsWith(".csv")) {
            assignDataset(
              side,
              parseCsvText(await file.text(), file.name, file.size),
            );
            setExcelFiles((current) => ({ ...current, [side]: undefined }));
            return;
          }
          const buffer = await file.arrayBuffer();
          const names = getXlsxWorksheetNames(buffer);
          setExcelFiles((current) => ({
            ...current,
            [side]: { buffer, name: file.name, size: file.size },
          }));
          if (names.length === 1)
            assignDataset(
              side,
              parseXlsxBuffer(buffer, file.name, file.size, names[0]),
            );
          else
            setSheetPicker({
              side,
              buffer,
              name: file.name,
              size: file.size,
              names,
            });
        } catch (err) {
          setNotice(
            err instanceof Error ? err.message : "Could not read this file.",
          );
        }
      })();
    };
  const run = async () => {
    if (!source || !target || !uploadedFiles.source || !uploadedFiles.target) return;
    setProcessing(true); setNotice("Processing securely on the server…");
    try {
      const form = new FormData();
      form.set("source", uploadedFiles.source); form.set("target", uploadedFiles.target);
      form.set("mappings", JSON.stringify(mappings)); form.set("rules", JSON.stringify({ preserveLeadingZeros: preserveZeros }));
      form.set("name", "Employee file validation");
      if (source.worksheetName) form.set("sourceSheet", source.worksheetName);
      if (target.worksheetName) form.set("targetSheet", target.worksheetName);
      const response = await fetch("/api/reconcile", { method: "POST", body: form });
      const payload = await response.json() as { result?: Result; summary?: RunSummary; run?: { id: string }; error?: string };
      if (response.status === 401) { window.location.assign(`/sign-in?redirect_url=${encodeURIComponent("/#/workspace")}`); return; }
      if (!response.ok || !payload.result || !payload.summary || !payload.run) throw new Error(payload.error || "Reconciliation failed.");
      setResult(payload.result); setRunSummary(payload.summary); setCurrentRunId(payload.run.id); setStep(5); setTab("Summary"); setNotice("");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Reconciliation failed."); }
    finally { setProcessing(false); }
  };
  useEffect(() => {
    const fromHash = (): View => {
      const value = window.location.hash.replace("#/", "") as View;
      return ["workspace", "templates", "history", "help"].includes(
        value,
      )
        ? value
        : "home";
    };
    // Read the initial hash after hydration so server and client markup agree.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setView(fromHash());
    const onPop = () => {
      setView(fromHash());
      window.scrollTo({ top: 0 });
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const navigate = (v: View) => {
    if (["workspace", "templates", "history"].includes(v) && authLoaded && !isSignedIn) {
      window.location.assign(`/sign-in?redirect_url=${encodeURIComponent(`/#/${v}`)}`);
      return;
    }
    const hash = v === "home" ? "#/" : "#/" + v;
    if (window.location.hash !== hash)
      window.history.pushState({ view: v }, "", hash);
    setView(v);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const goBack = () => {
    if (window.history.length > 1) window.history.back();
    else navigate("home");
  };
  useEffect(() => {
    if (authLoaded && !isSignedIn && ["workspace", "templates", "history"].includes(view)) window.location.assign(`/sign-in?redirect_url=${encodeURIComponent(`/#/${view}`)}`);
  }, [authLoaded, isSignedIn, view]);
  const signOut = async () => {
    setResult(null); setRunSummary(null); setSource(null); setTarget(null); setUploadedFiles({}); setExcelFiles({}); setCurrentRunId(null); setDrawer(null); setQuery("");
    await clerk.signOut({ redirectUrl: "/" });
  };
  return (
    <div className="app-shell">
      <header>
        <button className="brand" onClick={() => navigate("home")}>
          <span>R</span>ReconcileFlow
        </button>
        <nav>
          <button onClick={() => navigate("home")}>Product</button>
          <button
            onClick={() => {
              navigate("home");
              setTimeout(
                () =>
                  document
                    .getElementById("how")
                    ?.scrollIntoView({ behavior: "smooth" }),
                50,
              );
            }}
          >
            How It Works
          </button>
          {isSignedIn && <button onClick={() => navigate("templates")}>Templates</button>}
          <button
            onClick={() => {
              navigate("home");
              setTimeout(
                () =>
                  document
                    .getElementById("pricing")
                    ?.scrollIntoView({ behavior: "smooth" }),
                50,
              );
            }}
          >
            Pricing
          </button>
        </nav>
        <div className="header-actions">
          {!authLoaded ? <span className="text-btn">Loading…</span> : isSignedIn ? <>
            <button className="text-btn" onClick={() => navigate("workspace")}>Workspace</button>
            <button className="text-btn" onClick={() => navigate("history")}>History</button>
            <button className="text-btn" onClick={() => window.location.assign("/account")}>{user?.firstName || "Account"}</button>
            <button className="primary small" onClick={signOut}>Sign out</button>
          </> : <>
            <button className="text-btn sign-in-link" onClick={() => window.location.assign("/sign-in")}>Sign in</button>
            <button className="primary small" onClick={() => window.location.assign(`/sign-up?redirect_url=${encodeURIComponent("/#/workspace")}`)}>Start free {icons.arrow}</button>
          </>}
        </div>
      </header>
      {view === "home" && (
        <Landing navigate={navigate} loadSample={loadSample} isSignedIn={Boolean(isSignedIn)} />
      )}
      {view === "workspace" && authLoaded && isSignedIn && (
        <Workspace
          step={step}
          setStep={setStep}
          source={source}
          target={target}
          loadSample={loadSample}
          upload={upload}
          changeSheet={changeSheet}
          mappings={mappings}
          setMappings={setMappings}
          preserveZeros={preserveZeros}
          setPreserveZeros={setPreserveZeros}
          result={result}
          run={run}
          tab={tab}
          setTab={setTab}
          query={query}
          setQuery={setQuery}
          drawer={drawer}
          setDrawer={setDrawer}
          resultRecordDiffs={resultRecordDiffs}
          runSummary={runSummary}
          setRunSummary={setRunSummary}
          notice={notice}
          goBack={goBack}
          processing={processing}
          runId={currentRunId}
        />
      )}
      {view === "templates" && authLoaded && isSignedIn && (
        <Templates
          onApply={(templateMappings?: Mapping[]) => {
            loadSample();
            if (templateMappings?.length) setMappings(templateMappings);
            setStep(2);
          }}
        />
      )}
      {view === "history" && authLoaded && isSignedIn && <History />}
      {view === "help" && <Help />}
      {sheetPicker && (
        <SheetPicker
          picker={sheetPicker}
          choose={(name) => chooseSheet(sheetPicker, name)}
          close={() => setSheetPicker(null)}
        />
      )}
      <footer>
        <div>
          <button
            className="brand footer-brand"
            onClick={() => navigate("home")}
          >
            <span>R</span>ReconcileFlow
          </button>
          <p>Clear, repeatable file validation for modern data teams.</p>
        </div>
        <div>
          <b>Product</b>
          <button onClick={() => navigate("workspace")}>Reconcile files</button>
          <button onClick={() => navigate("templates")}>Templates</button>
          <button onClick={() => navigate("history")}>History</button>
        </div>
        <div>
          <b>Resources</b>
          <button onClick={() => navigate("help")}>Help center</button>
          <button onClick={() => navigate("home")}>Privacy</button>
        </div>
        <div className="privacy">
          <b>Backend-enabled pilot</b>
          <p>
            Files are processed securely and source uploads are deleted after each run.
          </p>
        </div>
      </footer>
    </div>
  );
}

function Landing({
  navigate,
  loadSample,
  isSignedIn,
}: {
  navigate: (v: View) => void;
  loadSample: () => void;
  isSignedIn: boolean;
}) {
  const startFree = () => isSignedIn ? navigate("workspace") : window.location.assign(`/sign-up?redirect_url=${encodeURIComponent("/#/workspace")}`);
  const [selectedPlan, setSelectedPlan] = useState("Professional");
  const [billingInterval, setBillingInterval] = useState<"month"|"year">("month");
  const choosePlan = async (plan: string) => {
    if (plan === "Free") return startFree();
    if (!isSignedIn) return window.location.assign(`/sign-up?redirect_url=${encodeURIComponent("/#/home")}`);
    const response = await fetch("/api/billing/checkout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ plan: plan.toLowerCase(), interval: billingInterval }) });
    const data = await response.json();
    if (response.ok && data.url) window.location.assign(data.url); else window.alert(data.error || "Billing could not be started.");
  };
  return (
    <main>
      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow">
            <i /> Deterministic file validation
          </div>
          <h1>
            Find every missing, extra or <em>changed</em> record.
          </h1>
          <p>
            Reconcile source and target files without complicated formulas or
            custom scripts. Map your columns, define matching rules and receive
            an audit-ready discrepancy report.
          </p>
          <div className="cta-row">
            <button className="primary" onClick={() => navigate("workspace")}>
              Start a reconciliation {icons.arrow}
            </button>
            <button className="secondary" onClick={loadSample}>
              View sample results
            </button>
          </div>
          <div className="trust-row">
            <span>{icons.check} Server-side processing</span>
            <span>{icons.check} No formulas</span>
            <span>{icons.check} Clear reports</span>
          </div>
        </div>
        <ResultPreview />
      </section>
      <section className="logo-strip">
        <p>Built for teams validating data across systems</p>
        <div>
          <span>HR &amp; PAYROLL</span>
          <span>BENEFITS</span>
          <span>FINANCE</span>
          <span>IMPLEMENTATION</span>
          <span>DATA &amp; QA</span>
        </div>
      </section>
      <section className="section problem">
        <div>
          <div className="eyebrow">
            <i /> The manual problem
          </div>
          <h2>Your spreadsheet was never meant to be a validation platform.</h2>
        </div>
        <div className="problem-list">
          {[
            "Compare thousands of rows manually in Excel",
            "Write fragile, one-time scripts for every file",
            "Miss formatting and transformation errors",
            "Repeat the same checks every pay cycle",
          ].map((x, i) => (
            <article key={x}>
              <span>0{i + 1}</span>
              <p>{x}</p>
            </article>
          ))}
        </div>
      </section>
      <section id="how" className="section soft">
        <div className="section-head">
          <div className="eyebrow">
            <i /> How it works
          </div>
          <h2>From two files to a clear answer.</h2>
          <p>
            A guided workflow that business analysts can use without writing
            code.
          </p>
        </div>
        <div className="steps">
          {[
            [
              "01",
              "Upload files",
              "Add your source and transformed target files.",
            ],
            ["02", "Match records", "Choose a unique ID or composite key."],
            ["03", "Map columns", "Review intelligent name-based suggestions."],
            ["04", "Set rules", "Normalize text, numbers, dates and blanks."],
            [
              "05",
              "Review results",
              "Filter discrepancies and export reports.",
            ],
          ].map(([n, t, d]) => (
            <article key={n}>
              <span>{n}</span>
              <div className="step-icon">{icons.file}</div>
              <h3>{t}</h3>
              <p>{d}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="section">
        <div className="section-head left">
          <div className="eyebrow">
            <i /> Common workflows
          </div>
          <h2>One workspace. Every file handoff.</h2>
        </div>
        <div className="use-grid">
          {[
            { title: "HR & Payroll Reconciliation", description: "Compare employee, compensation, deduction and payroll files to identify missing workers, incorrect values and unexpected changes before payroll is processed.", icon: UsersRound },
            { title: "Benefits Carrier Validation", description: "Confirm that employee enrollments, dependents, coverage levels and benefit elections were correctly included in files sent to insurance carriers.", icon: ShieldCheck },
            { title: "Data Migration Testing", description: "Compare legacy-system exports with newly loaded data to verify that records, values and relationships were transferred accurately.", icon: DatabaseZap },
            { title: "Vendor-File Validation", description: "Validate files exchanged with external vendors and detect missing records, unexpected additions, formatting problems and transformation errors.", icon: FileCheck2 },
            { title: "Financial-File Comparison", description: "Compare invoices, payments, account balances and transaction files to identify missing entries, duplicate records and amount differences.", icon: Calculator },
            { title: "Integration Regression Testing", description: "Compare current integration output with a previously approved file to detect unexpected changes introduced by new code or configuration updates.", icon: RefreshCw },
          ].map(({ title, description, icon: Icon }) => (
            <article key={title}>
              <span className="use-case-icon"><Icon size={20} strokeWidth={1.8} aria-hidden /></span>
              <h3>{title}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </section>
      <section id="pricing" className="section soft">
        <div className="section-head">
          <div className="eyebrow">
            <i /> Simple pricing
          </div>
          <h2>Start free. Scale when the files do.</h2>
          <div className="billing-toggle"><button className={billingInterval === "month" ? "active" : ""} onClick={()=>setBillingInterval("month")}>Monthly</button><button className={billingInterval === "year" ? "active" : ""} onClick={()=>setBillingInterval("year")}>Annual <span>Save 15%</span></button></div>
        </div>
        <div className="pricing-grid">
          {[
            {
              n: "Free",
              monthly: "$0", annual: "$0",
              f: [
                "3 reconciliations / month",
                "2,000 records per file",
                "CSV support",
                "Basic discrepancy report",
              ],
            },
            {
              n: "Professional",
              monthly: "$29", annual: "$24.65",
              tag: "Most popular",
              f: [
                "30 reconciliations / month",
                "100,000 records per file",
                "CSV and Excel",
                "Saved templates",
                "Advanced comparison rules",
              ],
            },
            {
              n: "Team",
              monthly: "$99", annual: "$84.15",
              f: [
                "100 reconciliations / month",
                "250,000 records per file",
                "Up to 10 users",
                "Unlimited team templates",
                "Shared history",
                "Team workspace",
                "Audit log",
                "Priority support",
              ],
            },
          ].map((x) => {
            const selected = selectedPlan === x.n;
            return (
            <article className={selected ? "featured" : ""} key={x.n} onClick={() => setSelectedPlan(x.n)}>
              {x.tag && <b className="plan-tag">{x.tag}</b>}
              <h3>{x.n}</h3>
              <p>
                <strong>{billingInterval === "month" ? x.monthly : x.annual}</strong> / month
              </p>
              {billingInterval === "year" && x.n !== "Free" && <small>Billed annually at {x.n === "Professional" ? "$295.80" : "$1,009.80"}</small>}
              <ul>
                {x.f.map((f) => (
                  <li key={f}>
                    {icons.check} {f}
                  </li>
                ))}
              </ul>
              <button
                className={selected ? "primary" : "secondary"}
                onClick={(event) => {
                  event.stopPropagation();
                  if (selected) void choosePlan(x.n);
                  else setSelectedPlan(x.n);
                }}
              >
                {selected ? (x.n === "Free" ? "Start free" : `Choose ${x.n}`) : `Select ${x.n}`}
              </button>
            </article>
          )})}
        </div>
        <p className="fine">
          Secure recurring billing is processed by Stripe. Cancel or change plans from your account.
        </p>
      </section>
      <section className="final-cta">
        <h2>Stop comparing integration files manually in Excel.</h2>
        <p>Upload two files and get a clear discrepancy report in minutes.</p>
        <button
          className="primary inverse"
          onClick={() => navigate("workspace")}
        >
          Start a reconciliation {icons.arrow}
        </button>
      </section>
    </main>
  );
}
function ResultPreview() {
  return (
    <div className="preview">
      <div className="preview-top">
        <div>
          <span className="mini-logo">R</span>
          <b>Employee file validation</b>
        </div>
        <span className="status success">✓ Complete</span>
      </div>
      <div className="match-block">
        <div>
          <span>Overall match</span>
          <strong>99.4%</strong>
        </div>
        <div className="donut">
          <b>99.4%</b>
          <span>match</span>
        </div>
      </div>
      <div className="stat-grid">
        {[
          ["Source records", "10,000", "neutral"],
          ["Target records", "9,992", "neutral"],
          ["Fully matched", "9,940", "green"],
          ["Missing in target", "8", "red"],
          ["Records with differences", "52", "amber"],
          ["Duplicate keys", "3", "amber"],
        ].map(([a, b, c]) => (
          <div className={c} key={a}>
            <span>{a}</span>
            <strong>{b}</strong>
          </div>
        ))}
      </div>
      <div className="preview-table">
        <div>
          <b>Recent discrepancies</b>
          <span>View all →</span>
        </div>
        <p>
          <i className="red-dot" /> 00428 <span>Missing in target</span>
        </p>
        <p>
          <i className="amber-dot" /> 00731 <span>Salary Amount differs</span>
        </p>
        <p>
          <i className="amber-dot" /> 00906 <span>Worker Status differs</span>
        </p>
      </div>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function Workspace(p: any) {
  const canNext = p.source && p.target;
  return (
    <main className="workspace">
      <div className="workspace-head">
        <div>
          <button
            className="back-link"
            onClick={() => (p.step > 1 ? p.setStep(p.step - 1) : p.goBack())}
          >
            ← Back
          </button>
          <h1>
            {p.step === 5 ? "Reconciliation results" : "New reconciliation"}
          </h1>
          <p>
            {p.step === 5
              ? "Review every discrepancy and export the evidence you need."
              : "Compare source and target files in five guided steps."}
          </p>
        </div>
        <span className="local-badge">◉ Temporary secure processing</span>
      </div>
      <div className="progress">
        {[
          "Upload Files",
          "Match Records",
          "Map Columns",
          "Configure Rules",
          "Results",
        ].map((x, i) => (
          <button
            className={
              p.step === i + 1 ? "active" : p.step > i + 1 ? "done" : ""
            }
            onClick={() => p.step > i + 1 && p.setStep(i + 1)}
            key={x}
          >
            <span>{p.step > i + 1 ? "✓" : i + 1}</span>
            <b>{x}</b>
          </button>
        ))}
      </div>
      {p.notice && (
        <div className="notice">
          {icons.alert} {p.notice}
        </div>
      )}
      {p.step === 1 && (
        <div className="panel">
          <div className="panel-title">
            <div>
              <h2>Upload your files</h2>
              <p>
                Add the original source and the transformed target you want to
                validate.
              </p>
            </div>
            <button className="sample-btn" onClick={p.loadSample}>
              ✦ Load employee sample
            </button>
          </div>
          <div className="supported-formats">
            <b>Supported formats:</b> CSV and XLSX{" "}
            <span>· Maximum 10 MB per file</span>
          </div>
          <div className="upload-grid">
            <UploadCard
              title="Source file"
              desc="The original file or system-of-record export."
              data={p.source}
              onChange={p.upload("source")}
              onChangeSheet={() => p.changeSheet("source")}
            />
            <UploadCard
              title="Target file"
              desc="The transformed, destination or vendor file."
              data={p.target}
              onChange={p.upload("target")}
              onChangeSheet={() => p.changeSheet("target")}
            />
          </div>
          <Privacy />
          <div className="panel-actions">
            <span />
            <button
              className="primary"
              disabled={!canNext}
              onClick={() => p.setStep(2)}
            >
              Continue to matching keys {icons.arrow}
            </button>
          </div>
        </div>
      )}
      {p.step === 2 && (
        <div className="panel narrow">
          <div className="panel-title">
            <div>
              <h2>Select matching keys</h2>
              <p>
                A key identifies the same record in both files. Employee ID is
                selected for this comparison.
              </p>
            </div>
          </div>
          <div className="key-card">
            <div>
              <label>
                Source column
                <select>
                  <option>{p.mappings[0].source}</option>
                </select>
              </label>
              <span>matches</span>
              <label>
                Target column
                <select>
                  <option>{p.mappings[0].target}</option>
                </select>
              </label>
            </div>
            <div className="option-grid">
              <label>
                <input type="checkbox" defaultChecked /> Trim whitespace
              </label>
              <label>
                <input type="checkbox" /> Case-sensitive matching
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={p.preserveZeros}
                  onChange={(e) => p.setPreserveZeros(e.target.checked)}
                />{" "}
                Preserve leading zeros
              </label>
              <label>
                <input type="checkbox" defaultChecked /> Treat blank keys as
                invalid
              </label>
            </div>
            <div className="warning">
              {icons.alert}
              <div>
                <b>Duplicate key detected in source</b>
                <p>
                  Employee ID “00107” appears twice. Both rows will be reported
                  as duplicates.
                </p>
              </div>
            </div>
          </div>
          <div className="panel-actions">
            <button className="secondary" onClick={() => p.setStep(1)}>
              Back
            </button>
            <button className="primary" onClick={() => p.setStep(3)}>
              Continue to column mapping {icons.arrow}
            </button>
          </div>
        </div>
      )}
      {p.step === 3 && (
        <div className="panel">
          <div className="panel-title">
            <div>
              <h2>Review column mappings</h2>
              <p>
                We suggested mappings based on similar column names. Confirm
                what should be compared.
              </p>
            </div>
            <span className="status info">7 suggestions</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Include</th>
                  <th>Source column</th>
                  <th></th>
                  <th>Target column</th>
                  <th>Data type</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {p.mappings.map((m: Mapping, i: number) => (
                  <tr key={m.source}>
                    <td>
                      <input
                        type="checkbox"
                        checked={m.include}
                        onChange={(e) =>
                          p.setMappings((xs: Mapping[]) =>
                            xs.map((x, j) =>
                              j === i ? { ...x, include: e.target.checked } : x,
                            ),
                          )
                        }
                      />
                    </td>
                    <td>
                      <b>{m.source}</b>
                    </td>
                    <td>→</td>
                    <td>
                      <select
                        value={m.target}
                        onChange={(e) =>
                          p.setMappings((xs: Mapping[]) =>
                            xs.map((x, j) =>
                              j === i ? { ...x, target: e.target.value } : x,
                            ),
                          )
                        }
                      >
                        {p.target?.headers.map((h: string) => (
                          <option key={h}>{h}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select
                        value={m.type}
                        onChange={(e) =>
                          p.setMappings((xs: Mapping[]) =>
                            xs.map((x, j) =>
                              j === i ? { ...x, type: e.target.value } : x,
                            ),
                          )
                        }
                      >
                        <option>Text</option>
                        <option>Number</option>
                        <option>Date</option>
                        <option>Boolean</option>
                      </select>
                    </td>
                    <td>
                      <span className="status success">✓ Suggested</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="panel-actions">
            <button className="secondary" onClick={() => p.setStep(2)}>
              Back
            </button>
            <button className="primary" onClick={() => p.setStep(4)}>
              Continue to rules {icons.arrow}
            </button>
          </div>
        </div>
      )}
      {p.step === 4 && (
        <div className="panel">
          <div className="panel-title">
            <div>
              <h2>Configure comparison rules</h2>
              <p>
                Normalization makes equivalent business values compare correctly
                without hiding real differences.
              </p>
            </div>
          </div>
          <div className="rules-list">
            {p.mappings
              .filter((m: Mapping) => m.include)
              .map((m: Mapping) => (
                <div key={m.source}>
                  <div>
                    <b>{m.source}</b>
                    <span>{m.type}</span>
                  </div>
                  <p>
                    {m.type === "Text"
                      ? "Trim whitespace · Ignore capitalization · Blank equals null"
                      : m.type === "Number"
                        ? "Ignore currency symbols · Ignore commas · Exact numeric value"
                        : m.type === "Date"
                          ? "Normalize supported formats · Compare date only"
                          : "Recognize true/false equivalents"}
                  </p>
                  <button>Adjust</button>
                </div>
              ))}
          </div>
          <div className="config-summary">
            <b>Ready to reconcile</b>
            <span>{p.source.rows.length} source rows</span>
            <span>{p.target.rows.length} target rows</span>
            <span>1 matching key</span>
            <span>
              {p.mappings.filter((m: Mapping) => m.include).length} mapped
              fields
            </span>
          </div>
          <div className="panel-actions">
            <button className="secondary" onClick={() => p.setStep(3)}>
              Back
            </button>
            <button className="primary run" onClick={p.run} disabled={p.processing}>
              {p.processing ? "Processing…" : "▶ Run reconciliation"}
            </button>
          </div>
        </div>
      )}
      {p.step === 5 && p.result && <Results {...p} />}{" "}
      {p.drawer && <Drawer d={p.drawer} close={() => p.setDrawer(null)} />}
      <div className="desktop-note">
        For complex mapping and rule configuration, ReconcileFlow works best on
        a desktop or tablet.
      </div>
    </main>
  );
}

function UploadCard({
  title,
  desc,
  data,
  onChange,
  onChangeSheet,
}: {
  title: string;
  desc: string;
  data: Dataset | null;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onChangeSheet: () => void;
}) {
  return (
    <article className="upload-card">
      <div className="upload-label">
        <span>{icons.file}</span>
        <div>
          <h3>{title}</h3>
          <p>{desc}</p>
        </div>
      </div>
      {!data ? (
        <label className="dropzone">
          <input type="file" accept=".csv,.xlsx" onChange={onChange} />
          <span>⇧</span>
          <b>
            Drop a file here or <u>browse</u>
          </b>
            <small>Supported formats: CSV and XLSX · up to 10 MB</small>
        </label>
      ) : (
        <>
          <div className="file-ready">
            <span className={data.format === "XLSX" ? "excel-badge" : ""}>
              {data.format}
            </span>
            <div>
              <b>{data.name}</b>
              {data.worksheetName && (
                <p className="sheet-name">
                  Worksheet: <strong>{data.worksheetName}</strong>
                  {data.worksheetNames.length > 1 && (
                    <button onClick={onChangeSheet}>Change</button>
                  )}
                </p>
              )}
              <p>
                {data.size} · {data.rows.length} rows · {data.headers.length}{" "}
                columns
              </p>
            </div>
            <label>
              <input type="file" accept=".csv,.xlsx" onChange={onChange} />
              Replace
            </label>
          </div>
          <div className="headers">
            <b>Detected headers</b>
            <div>
              {data.headers.slice(0, 5).map((h) => (
                <span key={h}>{h}</span>
              ))}
              {data.headers.length > 5 && (
                <span>+{data.headers.length - 5}</span>
              )}
            </div>
          </div>
          <div className="file-preview">
            <b>Preview</b>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    {data.headers.slice(0, 4).map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.previewRows.slice(0, 3).map((row, i) => (
                    <tr key={i}>
                      {data.headers.slice(0, 4).map((h) => (
                        <td key={h}>{row[h]}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </article>
  );
}
function SheetPicker({
  picker,
  choose,
  close,
}: {
  picker: { name: string; names: string[] };
  choose: (name: string) => void;
  close: () => void;
}) {
  return (
    <div className="drawer-bg sheet-picker-bg" onClick={close}>
      <section className="sheet-picker" onClick={(e) => e.stopPropagation()}>
        <button className="drawer-close" onClick={close}>
          ×
        </button>
        <span className="status info">Excel workbook</span>
        <h2>Select a worksheet</h2>
        <p>
          <b>{picker.name}</b> contains multiple worksheets. Choose the one to
          reconcile.
        </p>
        <div>
          {picker.names.map((name) => (
            <button
              className="sheet-option"
              key={name}
              onClick={() => choose(name)}
            >
              <span>▦</span>
              {name}
              <b>Use worksheet →</b>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
function Privacy() {
  return (
    <div className="privacy-note">
      <span>⌾</span>
      <div>
        <b>Secure production file handling</b>
        <p>
        Files are processed securely using deterministic reconciliation rules and are never sent to an AI model. Uploads are malware-scanned before processing, source files are securely deleted after each run, and temporary results and reports are automatically removed according to retention settings.
        </p>
      </div>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function Results(p: any) {
  const r = p.result as Result, summary = p.runSummary as RunSummary;
  const [details, setDetails] = useState<unknown[]>([]), [detailPage, setDetailPage] = useState(1), [totalPages, setTotalPages] = useState(1);
  const detailType = RESULT_DETAIL_TYPES;
  useEffect(() => {
    const type = detailType[p.tab];
    if (!type || !p.runId) return;
    const controller = new AbortController();
    fetch(`/api/runs/${p.runId}/details?type=${type}&page=${detailPage}&pageSize=25`, { cache: "no-store", signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error("Detailed results are no longer available.");
      const payload = await response.json() as { items: unknown[]; totalPages: number };
      setDetails(payload.items); setTotalPages(payload.totalPages);
    }).catch((error) => { if (error.name !== "AbortError") setDetails([]); });
    return () => { controller.abort(); setDetails([]); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.tab, p.runId, detailPage]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => { setDetails([]); p.setDrawer(null); }, []);
  const total = summary.sourceRows;
  const pct = Math.round((summary.matched / Math.max(summary.compared, 1)) * 100);
  const tabs = [
    "Summary",
    "Field Differences",
    "Missing in Target",
    "Extra in Target",
    "Duplicate Keys",
    "Invalid Keys",
  ];
  const filtered = (details as Difference[]).filter((d) =>
    Object.values(d).join(" ").toLowerCase().includes(p.query.toLowerCase()),
  );
  return (
    <div className="results">
      <div className="result-hero">
        <div>
          <span className="status success">✓ Reconciliation complete</span>
          <h2>Employee file validation</h2>
          <p>
            {p.source.name} <span>→</span> {p.target.name} · Just now
          </p>
        </div>
        <div className="score">
          <strong>{pct}%</strong>
          <span>matched</span>
        </div>
        <div className="export-menu">
          <button
            className="primary"
            disabled={!p.runId}
            onClick={() => p.runId && window.location.assign(`/api/reports/${p.runId}`)}
          >
            ⇩ Download report
          </button>
        </div>
      </div>
      <div className="metric-grid">
        {[
          ["Source records", total, "neutral"],
          ["Target records", summary.targetRows, "neutral"],
          ["Fully matched", summary.matched, "green"],
          ["Missing in target", summary.missing, "red"],
          ["Extra in target", summary.extra, "red"],
          ["Records with differences", summary.differenceRecords, "amber"],
          ["Field differences", summary.fieldDifferences, "amber"],
          ["Duplicate keys", summary.duplicateKeys, "amber"],
          ["Invalid keys", summary.invalidKeys, "red"],
        ].map(([a, b, c]) => (
          <article className={String(c)} key={String(a)}>
            <span>{a}</span>
            <strong>{b}</strong>
          </article>
        ))}
      </div>
      <div className="tabs">
        {tabs.map((t) => (
          <button
            className={p.tab === t ? "active" : ""}
            onClick={() => p.setTab(t)}
            key={t}
          >
            {t}
          </button>
        ))}
      </div>
      {p.tab === "Summary" && (
        <div className="summary-grid">
          <article>
            <h3>Record outcomes</h3>
            <div className="bar">
              <i style={{ width: `${pct}%` }} />
            </div>
            <div className="legend">
              <span>
                <i className="green-dot" /> Fully matched <b>{summary.matched}</b>
              </span>
              <span>
                <i className="amber-dot" /> With differences{" "}
                <b>{p.resultRecordDiffs}</b>
              </span>
              <span>
                <i className="red-dot" /> Missing / extra{" "}
                <b>{summary.missing + summary.extra}</b>
              </span>
            </div>
          </article>
          <article>
            <h3>Top fields with differences</h3>
            {[
              ...(summary.topFields || []),
            ]
              .map(([f, n]) => (
                <div className="field-rank" key={f}>
                  <span>{f}</span>
                  <b>{n}</b>
                </div>
              ))}
          </article>
          <article className="config">
            <h3>Configuration</h3>
            <p>
              <span>Matching key</span>
              <b>Employee ID → Worker ID</b>
            </p>
            <p>
              <span>Mapped fields</span>
              <b>7</b>
            </p>
            <p>
              <span>Whitespace</span>
              <b>Trimmed</b>
            </p>
            <p>
              <span>Capitalization</span>
              <b>Ignored</b>
            </p>
          </article>
        </div>
      )}
      {p.tab === "Field Differences" && (
        <div className="data-section">
          <div className="table-tools">
            <input
              aria-label="Search differences"
              placeholder="Search key, column or reason…"
              value={p.query}
              onChange={(e) => p.setQuery(e.target.value)}
            />
            <button
              className="secondary"
              onClick={() =>
                csvDownload("field-differences.csv", r.differences)
              }
            >
              ⇩ Export
            </button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Key</th>
                  <th>Field</th>
                  <th>Source value</th>
                  <th>Target value</th>
                  <th>Reason</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((d, i) => (
                  <tr key={i}>
                    <td>
                      <b>{d.key}</b>
                    </td>
                    <td>{d.sourceColumn}</td>
                    <td>{d.sourceValue}</td>
                    <td>{d.targetValue}</td>
                    <td>
                      <span className="status warning">{d.reason}</span>
                    </td>
                    <td>
                      <button
                        className="row-open"
                        onClick={() => p.setDrawer(d)}
                      >
                        View →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {p.tab === "Missing in Target" && (
        <RecordTable
          rows={details as Row[]}
          empty="No records are missing from the target."
          exportName="missing-records.csv"
        />
      )}
      {p.tab === "Extra in Target" && (
        <RecordTable
          rows={details as Row[]}
          empty="No extra records were found in the target."
          exportName="extra-records.csv"
        />
      )}
      {p.tab === "Duplicate Keys" && (
        <SimpleList
          rows={(details as Result["duplicateKeys"]).map((x) => ({
            Key: x.key,
            File: x.file,
            Occurrences: x.rows.length,
            "Affected rows": x.rows.join(", "),
          }))}
          empty="No duplicate matching keys were found."
        />
      )}
      {p.tab === "Invalid Keys" && (
        <SimpleList
          rows={(details as Result["invalidKeys"]).map((x) => ({
            File: x.file,
            "Row number": x.row,
            "Original value": x.value || "(blank)",
            Problem: "Required matching key is blank",
          }))}
          empty="No invalid keys were found."
        />
      )}
      {p.tab !== "Summary" && totalPages > 1 && <div className="panel-actions"><button className="secondary" disabled={detailPage <= 1} onClick={() => setDetailPage((page) => page - 1)}>Previous</button><span>Page {detailPage} of {totalPages}</span><button className="secondary" disabled={detailPage >= totalPages} onClick={() => setDetailPage((page) => page + 1)}>Next</button></div>}
      <div className="result-actions">
        <button
          className="secondary"
          onClick={() => {
            p.setStep(1);
            p.setResult(null);
            p.setRunSummary?.(null);
          }}
        >
          Start another reconciliation
        </button>
        <button
          className="secondary"
          onClick={async () => {
            const name = prompt("Template name", "Employee file validation");
            if (!name) return;
            const response = await fetch("/api/templates", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, description: "Saved reconciliation template", mappings: p.mappings, rules: { preserveLeadingZeros: p.preserveZeros } }) });
            const payload = await response.json() as { error?: string };
            if (!response.ok) alert(payload.error || "Could not save template."); else alert("Template saved.");
          }}
        >
          ☆ Save as template
        </button>
      </div>
    </div>
  );
}
function RecordTable({
  rows,
  empty,
  exportName,
}: {
  rows: Row[];
  empty: string;
  exportName: string;
}) {
  return (
    <div className="data-section">
      {rows.length ? (
        <>
          <div className="table-tools">
            <span>
              {rows.length} record{rows.length === 1 ? "" : "s"}
            </span>
            <button
              className="secondary"
              onClick={() => csvDownload(exportName, rows)}
            >
              ⇩ Export
            </button>
          </div>
          <SimpleList rows={rows} empty={empty} />
        </>
      ) : (
        <div className="empty">
          ✓<h3>{empty}</h3>
        </div>
      )}
    </div>
  );
}
function SimpleList({
  rows,
  empty,
}: {
  rows: Record<string, unknown>[];
  empty: string;
}) {
  if (!rows.length)
    return (
      <div className="empty">
        ✓<h3>{empty}</h3>
      </div>
    );
  const headers = Object.keys(rows[0]);
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {headers.map((h) => (
                <td key={h}>{String(r[h] ?? "")}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function Drawer({ d, close }: { d: Difference; close: () => void }) {
  return (
    <div className="drawer-bg" onClick={close}>
      <aside onClick={(e) => e.stopPropagation()}>
        <button className="drawer-close" onClick={close}>
          ×
        </button>
        <span className="status warning">Field difference</span>
        <h2>Record {d.key}</h2>
        <p>
          Source row {d.sourceRow} · Target row {d.targetRow}
        </p>
        <div className="diff-box">
          <div>
            <span>Source · {d.sourceColumn}</span>
            <b>{d.sourceValue}</b>
            <small>Normalized: {d.normalizedSource}</small>
          </div>
          <div>
            <span>Target · {d.targetColumn}</span>
            <b>{d.targetValue}</b>
            <small>Normalized: {d.normalizedTarget}</small>
          </div>
        </div>
        <h3>Why this was flagged</h3>
        <p className="explain">
          {d.reason}. After the configured normalization rules were applied,
          these values were still not equivalent.
        </p>
        <h3>Applied rule</h3>
        <div className="rule-chip">
          Trim whitespace · Ignore capitalization · Exact value
        </div>
      </aside>
    </div>
  );
}

const templateSeed = [
  {
    name: "Workday to Payroll Employee Export",
    desc: "Validate core employee demographics and compensation.",
    fields: 7,
  },
  {
    name: "Employee Benefits Carrier File",
    desc: "Compare enrollments and coverage elections.",
    fields: 12,
  },
  {
    name: "Customer Migration Validation",
    desc: "Confirm customer data after a system migration.",
    fields: 15,
  },
  {
    name: "Vendor Payment Reconciliation",
    desc: "Match invoices and payment outputs.",
    fields: 9,
  },
];
type TemplateItem = { id?: string; name: string; desc: string; fields: number; mappings?: Mapping[] };
function Templates({ onApply }: { onApply: (mappings?: Mapping[]) => void }) {
  const [templates, setTemplates] = useState<TemplateItem[]>(templateSeed);
  useEffect(() => {
    fetch("/api/templates").then(async response => {
      if (!response.ok) return;
      const payload = await response.json() as { templates: { id: string; name: string; description: string; mappings: Mapping[] }[] };
      if (payload.templates.length) setTemplates(payload.templates.map(item => ({ id: item.id, name: item.name, desc: item.description, fields: item.mappings.length, mappings: item.mappings })));
    }).catch(() => undefined);
  }, []);
  const createTemplate = async () => {
    const name = prompt("Template name"); if (!name) return;
    const response = await fetch("/api/templates", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, description: "Custom comparison template", mappings: defaultMappings, rules: {} }) });
    const payload = await response.json() as { template?: { id: string; name: string; description: string; mappings: Mapping[] }; error?: string };
    if (!response.ok || !payload.template) { alert(payload.error || "Could not create template."); return; }
    setTemplates(current => [...current, { id: payload.template!.id, name: payload.template!.name, desc: payload.template!.description, fields: payload.template!.mappings.length, mappings: payload.template!.mappings }]);
  };
  return (
    <main className="subpage">
      <div className="subpage-head">
        <div>
          <span className="eyebrow">
            <i /> Reusable workflows
          </span>
          <h1>Saved templates</h1>
          <p>
            Save mappings and rules once, then apply them to the next file pair.
          </p>
        </div>
        <button
          className="primary"
          onClick={createTemplate}
        >
          + Create template
        </button>
      </div>
      <div className="template-grid">
        {templates.map((t, i) => (
          <article key={t.name}>
            <div className="template-icon">▤</div>
            <span className="status info">{t.fields} mapped fields</span>
            <h3>{t.name}</h3>
            <p>{t.desc}</p>
            <div>
              <button className="primary small" onClick={() => onApply(t.mappings)}>
                Apply
              </button>
              <button
                className="text-btn"
                onClick={async () => {
                  const name = prompt("Rename template", t.name);
                  if (!name) return;
                  if (t.id) {
                    const response = await fetch("/api/templates", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: t.id, name }) });
                    if (!response.ok) { alert("Could not rename template."); return; }
                  }
                  setTemplates(templates.map((x, j) => (j === i ? { ...x, name } : x)));
                }}
              >
                Rename
              </button>
              <button
                className="text-btn danger"
                onClick={async () => {
                  if (t.id) { const response = await fetch(`/api/templates?id=${encodeURIComponent(t.id)}`, { method: "DELETE" }); if (!response.ok) { alert("Could not delete template."); return; } }
                  setTemplates(templates.filter((_, j) => j !== i));
                }}
              >
                Delete
              </button>
            </div>
          </article>
        ))}
      </div>
      <Privacy />
    </main>
  );
}
function History() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [items, setItems] = useState<any[]>([]);
  useEffect(() => {
    fetch("/api/history").then(async response => { if (!response.ok) return; const payload = await response.json() as { runs: unknown[] }; setItems(payload.runs); }).catch(() => undefined);
  }, []);
  return (
    <main className="subpage">
      <div className="subpage-head">
        <div>
          <span className="eyebrow">
            <i /> Reconciliation history
          </span>
          <h1>Reconciliation history</h1>
          <p>Recent server-processed runs saved to your account.</p>
        </div>
      </div>
      {items.length ? (
        <div className="panel">
          <SimpleList
            rows={items.map((x) => ({
              "Run name": x.name,
              "Run date": new Date(x.created_at).toLocaleString(),
              "Source rows": x.source_rows ?? "—",
              "Target rows": x.target_rows ?? "—",
              Missing: x.summary?.missing ?? "—",
              Differences: x.summary?.differenceRecords ?? "—",
              Status: x.status,
            }))}
            empty=""
          />
        </div>
      ) : (
        <div className="empty large">
          ↻<h2>No reconciliation history yet</h2>
          <p>Complete a reconciliation and its summary will appear here.</p>
        </div>
      )}
    </main>
  );
}
function Help() {
  const qs = [
    [
      "What is file reconciliation?",
      "It is the process of comparing two datasets to confirm records and field values arrived correctly.",
    ],
    [
      "What should I use as a matching key?",
      "Choose a stable value that uniquely identifies a record, such as Employee ID or Customer ID.",
    ],
    [
      "What is a composite key?",
      "A composite key combines two or more fields when one field alone is not unique.",
    ],
    [
      "How are blank values handled?",
      "You can treat blank and null as equivalent, while blank matching keys can be reported as invalid.",
    ],
    [
      "How are dates normalized?",
      "Supported date formats are converted to a consistent date before comparison. Ambiguous dates require an expected format.",
    ],
    [
      "How are numeric tolerances used?",
      "A tolerance lets small numeric differences pass, such as rounding variances below one cent.",
    ],
    [
      "Why was a record marked as duplicate?",
      "The selected key appears more than once in that file, so a single correct match cannot be determined.",
    ],
    [
      "Are my files stored?",
      "Source and target files are stored only temporarily for server processing and are deleted after each run. Reports expire separately according to the pilot retention policy.",
    ],
    [
      "What file formats are supported?",
      "ReconcileFlow supports CSV and XLSX files up to 10 MB in this backend-enabled pilot. Legacy XLS files are not supported.",
    ],
  ];
  return (
    <main className="subpage help">
      <div className="subpage-head">
        <div>
          <span className="eyebrow">
            <i /> Help center
          </span>
          <h1>Answers for a confident reconciliation.</h1>
          <p>Learn how keys, mappings and normalization rules work.</p>
        </div>
      </div>
      <div className="faq">
        {qs.map(([q, a]) => (
          <details key={q}>
            <summary>
              {q}
              <span>+</span>
            </summary>
            <p>{a}</p>
          </details>
        ))}
      </div>
      <Privacy />
    </main>
  );
}
