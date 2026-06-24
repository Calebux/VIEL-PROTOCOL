"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Eye,
  Lock,
  Unlock,
  Clock,
  Shield,
  ShieldCheck,
  Info,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";

interface TimelockEntry {
  id: string;
  locked: boolean;
  secondsRemaining: number;
  timelockUntil: number;
  data?: {
    amount: string;
    leafIndex: number;
    timestamp: number;
    type: "deposit" | "withdrawal";
  };
}

function deriveEntries(viewingKey: string): TimelockEntry[] {
  let hash = 0;
  for (let i = 0; i < viewingKey.length; i++) {
    hash = ((hash << 5) - hash + viewingKey.charCodeAt(i)) | 0;
  }
  const seed = Math.abs(hash);
  const now = Math.floor(Date.now() / 1000);
  const amounts = ["10 XLM", "100 XLM", "1,000 XLM"];
  const types: ("deposit" | "withdrawal")[] = ["deposit", "withdrawal"];

  const entries: TimelockEntry[] = [];
  const count = 2 + (seed % 3);

  for (let i = 0; i < count; i++) {
    const entrySeed = (seed * (i + 1) * 7919) >>> 0;
    const isLocked = i >= count - 1 - (seed % 2);
    const lockSeconds = isLocked ? 3600 + (entrySeed % 82800) : 0;

    entries.push({
      id: String(i + 1),
      locked: isLocked,
      secondsRemaining: lockSeconds,
      timelockUntil: isLocked ? now + lockSeconds : now - (entrySeed % 172800),
      ...(!isLocked
        ? {
            data: {
              amount: amounts[entrySeed % amounts.length],
              leafIndex: entrySeed % 10000,
              timestamp: now - 86400 - (entrySeed % 604800),
              type: types[entrySeed % types.length],
            },
          }
        : {}),
    });
  }

  return entries;
}

interface SubsetInfo {
  root: string;
  size: number;
  commitments: string[];
}

export default function CompliancePage() {
  const [viewingKey, setViewingKey] = useState("");
  const [entries, setEntries] = useState<TimelockEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [activeTab, setActiveTab] = useState<"viewing-keys" | "privacy-pools">("privacy-pools");
  const [subsetInfo, setSubsetInfo] = useState<SubsetInfo | null>(null);

  useEffect(() => {
    fetch("/api/subset")
      .then((r) => r.json())
      .then((data) => setSubsetInfo(data))
      .catch(() => {});
  }, []);

  function handleLoadKey() {
    if (!viewingKey.trim()) return;
    const derived = deriveEntries(viewingKey.trim());
    setEntries(derived);
    setLoaded(true);
  }

  function handleReset() {
    setViewingKey("");
    setEntries([]);
    setLoaded(false);
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border/40">
        <div className="max-w-2xl mx-auto px-6 py-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/" className="hover:text-foreground transition-colors">
            Home
          </Link>
          <span>/</span>
          <span className="text-foreground font-medium">Compliance</span>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-12">
        <div className="mb-10">
          <h1 className="text-3xl font-bold tracking-tight mb-3">
            Compliance
          </h1>
          <p className="text-muted-foreground leading-relaxed">
            Privacy with accountability. Veil supports timelocked reveal keys
            for selective disclosure and Privacy Pools-style subset proofs for
            showing funds belong to an approved set without revealing which
            deposit is yours.
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex gap-1 p-1 rounded-lg bg-muted/50 mb-8">
          <button
            onClick={() => setActiveTab("privacy-pools")}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === "privacy-pools"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            Privacy Pools
          </button>
          <button
            onClick={() => setActiveTab("viewing-keys")}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === "viewing-keys"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            Reveal Keys
          </button>
        </div>

        {/* ── Privacy Pools Tab ── */}
        {activeTab === "privacy-pools" && (
          <div className="space-y-6">
            {/* How subset proofs work */}
            <div className="rounded-xl border border-border/50 p-6">
              <h3 className="text-base font-semibold mb-4">How Privacy Pools Work</h3>
              <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
                <p>
                  Based on <a href="https://papers.ssrn.com/sol3/papers.cfm?abstract_id=4563364" target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2 hover:text-primary/80 inline-flex items-center gap-1">Vitalik Buterin&apos;s 2023 paper <ExternalLink className="w-3 h-3" /></a>,
                  Privacy Pools let users prove their deposit belongs to an approved
                  association set — <strong className="text-foreground">without revealing which deposit is theirs</strong>.
                </p>
                <p>
                  An <strong className="text-foreground">Association Set Provider (ASP)</strong> screens
                  deposits and publishes a curated subset of &quot;approved&quot; commitments. When withdrawing,
                  a second ZK proof shows your commitment exists in the approved subset tree.
                </p>
              </div>

              {/* Visual flow */}
              <div className="mt-6 rounded-lg bg-muted/30 p-4 overflow-x-auto">
                <pre className="font-mono text-xs text-muted-foreground leading-relaxed whitespace-pre">
{`  Deposit          ASP Screening         Withdraw
  ───────          ─────────────         ────────
     │                   │                   │
     │── commitment ───▶│                   │
     │                   │── screen ───▶    │
     │                   │── approve ───▶   │
     │                   │   (subset tree)   │
     │                   │                   │
     │                   │    ◀── subset proof ──│
     │                   │       (ZK: "I'm in   │
     │                   │        the clean set")│
     │                   │                   │
  privacy     compliance signal      approved set
  preserved   without full reveal     + private`}
                </pre>
              </div>
            </div>

            {/* ASP status */}
            <div className="rounded-xl border border-border/50 p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-semibold">ASP Status</h3>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-medium">
                  Demo Mode
                </span>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold tracking-tight">{subsetInfo?.size ?? 0}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">Approved</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold tracking-tight">10</div>
                  <div className="text-xs text-muted-foreground mt-0.5">Tree Depth</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold tracking-tight">1,024</div>
                  <div className="text-xs text-muted-foreground mt-0.5">Max Capacity</div>
                </div>
              </div>
              {subsetInfo?.root && subsetInfo.size > 0 && (
                <div className="mt-4 pt-4 border-t border-border/30">
                  <div className="text-xs text-muted-foreground mb-1">Current Subset Root</div>
                  <div className="font-mono text-xs break-all text-foreground/70">
                    {subsetInfo.root}
                  </div>
                </div>
              )}
            </div>

            {/* Approved commitments */}
            <div className="rounded-xl border border-border/50 p-5">
              <h3 className="text-base font-semibold mb-4">Approved Commitments</h3>
              {subsetInfo && subsetInfo.commitments.length > 0 ? (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {subsetInfo.commitments.map((c, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/30"
                    >
                      <div className="w-6 h-6 rounded-full bg-emerald-50 flex items-center justify-center shrink-0">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      </div>
                      <span className="font-mono text-xs text-muted-foreground truncate">
                        {c}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No commitments have been screened yet. Deposit into the pool to see
                  them auto-approved (demo mode).
                </p>
              )}
            </div>

            {/* Demo note */}
            <div className="flex items-start gap-2 text-xs text-muted-foreground">
              <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>
                In demo mode, the ASP auto-approves all commitments. A production
                ASP would integrate sanctions, stolen-fund, and risk-screening
                signals before adding deposits to an approved subset.
              </span>
            </div>
          </div>
        )}

        {/* ── Reveal Keys Tab ── */}
        {activeTab === "viewing-keys" && (
          <div>
            <div className="mb-8">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-violet-200/60 bg-violet-50/50 text-xs text-violet-700 mb-4">
                <Eye className="w-3 h-3" />
                Timelocked Reveal Keys
              </div>
              <p className="text-muted-foreground leading-relaxed text-sm">
                Enter a reveal key to decrypt selected transaction details. Entries become
                viewable only after their configured timelock period expires —
                supporting selective auditability without giving anyone spending authority.
              </p>
            </div>

        {/* Viewing key input */}
        <div className="mb-8">
          <label className="block text-sm font-medium mb-2">Reveal Key</label>
          <div className="flex gap-3">
            <input
              type="text"
              value={viewingKey}
              onChange={(e) => setViewingKey(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLoadKey()}
              placeholder="vk-... (from your deposit receipt)"
              className="flex-1 rounded-lg border border-border bg-background px-4 py-3 font-mono text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
              disabled={loaded}
            />
            {loaded ? (
              <Button variant="outline" onClick={handleReset}>
                Clear
              </Button>
            ) : (
              <Button onClick={handleLoadKey}>Decrypt</Button>
            )}
          </div>
        </div>

        {/* Explainer (before key entered) */}
        {!loaded && (
          <div className="space-y-6">
            {/* How it works */}
            <div className="rounded-xl border border-border/50 p-6">
              <h3 className="text-base font-semibold mb-4">
                How reveal keys work
              </h3>
              <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
                <p>
                  When you make a deposit with reveal keys enabled, Veil
                  generates a separate cryptographic key that can{" "}
                  <strong className="text-foreground">read</strong> transaction
                  details but{" "}
                  <strong className="text-foreground">
                    cannot spend funds
                  </strong>
                  . This reveal key is timelocked — the data it decrypts is
                  only accessible after a configurable delay (e.g. 6, 12, 24, or
                  72 hours).
                </p>
                <p>
                  After the timelock expires, authorized reviewers can verify
                  the disclosed transaction details using the reveal key. The key
                  cannot withdraw funds or control the wallet.
                </p>
              </div>
            </div>

            {/* Why it matters */}
            <div className="rounded-xl border border-border/50 p-6">
              <h3 className="text-base font-semibold mb-4">
                Why this matters
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  {
                    icon: <Shield className="w-4 h-4" />,
                    title: "Compliance-oriented",
                    desc: "Support audit workflows without publishing every payment detail by default.",
                  },
                  {
                    icon: <Clock className="w-4 h-4" />,
                    title: "Configurable timelocks",
                    desc: "Choose 6h, 12h, 24h, or 72h delay before selected details become viewable.",
                  },
                  {
                    icon: <Lock className="w-4 h-4" />,
                    title: "Cannot spend funds",
                    desc: "The reveal key only decrypts metadata (amount, timestamp, leaf index). It has zero spending authority.",
                  },
                  {
                    icon: <Eye className="w-4 h-4" />,
                    title: "Selective disclosure",
                    desc: "You choose who gets the reveal key. Share it with a reviewer, keep it private, or never generate one.",
                  },
                ].map((item) => (
                  <div
                    key={item.title}
                    className="flex items-start gap-3 p-3 rounded-lg bg-muted/30"
                  >
                    <div className="w-8 h-8 rounded-lg bg-background border border-border/40 flex items-center justify-center shrink-0 text-muted-foreground">
                      {item.icon}
                    </div>
                    <div>
                      <div className="text-sm font-medium">{item.title}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {item.desc}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* The flow */}
            <div className="rounded-xl border border-border/50 p-6">
              <h3 className="text-base font-semibold mb-4">The flow</h3>
              <div className="space-y-3">
                {[
                  "Deposit with reveal key enabled",
                  "Save both the secret note and the reveal key",
                  "Share the reveal key only with an authorized reviewer",
                  "After the timelock expires, they paste the key here to inspect disclosed details",
                ].map((step, i) => (
                  <div key={i} className="flex items-start gap-3 text-sm">
                    <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold shrink-0">
                      {i + 1}
                    </div>
                    <span className="text-muted-foreground pt-0.5">
                      {step}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Try it */}
            <div className="rounded-xl border border-violet-200/60 bg-violet-50/30 p-5 text-center">
              <p className="text-sm text-violet-700 mb-3">
                Don&apos;t have a reveal key yet? Deposit first and enable reveal
                keys.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                asChild
              >
                <Link href="/deposit">
                  Go to Deposit
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </Button>
            </div>

            {/* Demo hint */}
            <div className="flex items-start gap-2 text-xs text-muted-foreground">
              <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>
                For demo purposes, enter any text as a reveal key to see
                timelocked entries. The same key always produces the same
                deterministic results.
              </span>
            </div>
          </div>
        )}

        {/* Transaction history (after key entered) */}
        {loaded && (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-semibold">Transaction History</h2>
              <span className="text-xs text-muted-foreground">
                {entries.filter((e) => !e.locked).length}/{entries.length}{" "}
                unlocked
              </span>
            </div>

            {entries.map((entry) => (
              <div
                key={entry.id}
                className="rounded-xl border border-border/50 p-5"
              >
                {entry.locked ? (
                  <LockedEntry entry={entry} />
                ) : (
                  <UnlockedEntry entry={entry} />
                )}
              </div>
            ))}

            {/* Explanation */}
            <div className="rounded-xl border border-border/50 p-4 mt-6">
              <div className="flex items-start gap-2 text-xs text-muted-foreground">
                <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>
                  In production, reveal keys decrypt notes stored on-chain via
                  the pool contract. The SDK&apos;s{" "}
                  <code className="font-mono bg-muted px-1 py-0.5 rounded text-[11px]">
                    decryptWithViewingKey()
                  </code>{" "}
                  checks timelock expiry before revealing transaction data.
                  Locked entries show a live countdown until they become
                  viewable.
                </span>
              </div>
            </div>
          </div>
        )}
          </div>
        )}
      </div>
    </div>
  );
}

function UnlockedEntry({ entry }: { entry: TimelockEntry }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-emerald-50 flex items-center justify-center">
            <Unlock className="w-3.5 h-3.5 text-emerald-600" />
          </div>
          <span className="text-xs font-medium text-emerald-600 uppercase tracking-wider">
            Unlocked
          </span>
        </div>
        <span className="text-xs text-muted-foreground font-mono">
          {entry.data
            ? new Date(entry.data.timestamp * 1000).toLocaleDateString(
                "en-US",
                { month: "short", day: "numeric", year: "numeric" }
              )
            : ""}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <span className="text-xs text-muted-foreground uppercase tracking-wider">
            Type
          </span>
          <p className="text-sm font-medium capitalize mt-0.5">
            {entry.data?.type}
          </p>
        </div>
        <div>
          <span className="text-xs text-muted-foreground uppercase tracking-wider">
            Amount
          </span>
          <p className="text-sm font-medium mt-0.5">{entry.data?.amount}</p>
        </div>
        <div>
          <span className="text-xs text-muted-foreground uppercase tracking-wider">
            Leaf
          </span>
          <p className="text-sm font-mono mt-0.5">#{entry.data?.leafIndex}</p>
        </div>
      </div>
    </div>
  );
}

function LockedEntry({ entry }: { entry: TimelockEntry }) {
  const [remaining, setRemaining] = useState(entry.secondsRemaining);

  useEffect(() => {
    const interval = setInterval(() => {
      setRemaining((r) => Math.max(0, r - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const hours = Math.floor(remaining / 3600);
  const minutes = Math.floor((remaining % 3600) / 60);
  const seconds = remaining % 60;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-amber-50 flex items-center justify-center">
            <Lock className="w-3.5 h-3.5 text-amber-600" />
          </div>
          <span className="text-xs font-medium text-amber-600 uppercase tracking-wider">
            Timelocked
          </span>
        </div>
      </div>
      <div className="flex items-center justify-center py-3">
        <div className="flex items-baseline gap-1">
          <TimeUnit value={hours} label="h" />
          <span className="text-muted-foreground text-lg mx-1">:</span>
          <TimeUnit value={minutes} label="m" />
          <span className="text-muted-foreground text-lg mx-1">:</span>
          <TimeUnit value={seconds} label="s" />
        </div>
      </div>
      <p className="text-xs text-muted-foreground text-center">
        Transaction details will be decryptable after timelock expires
      </p>
    </div>
  );
}

function TimeUnit({ value, label }: { value: number; label: string }) {
  return (
    <div className="text-center">
      <span className="text-2xl font-mono font-bold text-amber-600 tabular-nums">
        {String(value).padStart(2, "0")}
      </span>
      <span className="text-xs text-muted-foreground ml-0.5">{label}</span>
    </div>
  );
}
