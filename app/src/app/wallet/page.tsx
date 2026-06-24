"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Wallet,
  Send,
  Download,
  ArrowLeftRight,
  Globe,
  Lock,
  Plus,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronUp,
  ArrowUpRight,
  ArrowDownLeft,
  Clock,
  Shield,
  Settings,
  Copy,
  Check,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import AppShell from "@/components/AppShell";
import {
  isWalletInitialized,
  initWallet,
  unlockWallet,
  isUnlocked,
  getBalance,
  getUnspentNotes,
  getAllActivity,
  generateViewingKey,
  type StoredNote,
} from "@/lib/noteStore";

/* ── Setup / Unlock Gate ──────────────────────────────────── */

function SetupCard({ onDone }: { onDone: () => void }) {
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [mode] = useState<"create" | "unlock">(
    isWalletInitialized() ? "unlock" : "create"
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (mode === "create") {
      if (pin.length < 4) {
        setError("PIN must be at least 4 characters");
        return;
      }
      if (pin !== confirm) {
        setError("PINs don't match");
        return;
      }
      initWallet(pin);
      onDone();
    } else {
      if (!unlockWallet(pin)) {
        setError("Wrong PIN");
        return;
      }
      onDone();
    }
  };

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm border border-border/60 rounded-2xl p-8 bg-card space-y-5"
      >
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-foreground flex items-center justify-center">
            {mode === "create" ? (
              <Plus className="h-5 w-5 text-background" />
            ) : (
              <Lock className="h-5 w-5 text-background" />
            )}
          </div>
          <div>
            <h2 className="text-lg font-semibold">
              {mode === "create" ? "Create Wallet" : "Unlock Wallet"}
            </h2>
            <p className="text-xs text-muted-foreground">
              {mode === "create"
                ? "Set a PIN to secure your shielded notes"
                : "Enter your PIN to continue"}
            </p>
          </div>
        </div>

        <input
          type="password"
          placeholder="Enter PIN"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          className="w-full h-11 rounded-lg border border-input bg-background px-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          autoFocus
        />
        {mode === "create" && (
          <input
            type="password"
            placeholder="Confirm PIN"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="w-full h-11 rounded-lg border border-input bg-background px-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full">
          {mode === "create" ? "Create Wallet" : "Unlock"}
        </Button>
      </form>
    </div>
  );
}

/* ── Quick Action Button ─────────────────────────────────── */

function QuickAction({
  icon: Icon,
  label,
  href,
  color,
}: {
  icon: React.ElementType;
  label: string;
  href: string;
  color: string;
}) {
  return (
    <Link href={href} className="flex flex-col items-center gap-1.5 group">
      <div
        className={`h-12 w-12 rounded-full ${color} flex items-center justify-center transition-transform group-hover:scale-105`}
      >
        <Icon className="h-5 w-5" />
      </div>
      <span className="text-xs font-medium text-muted-foreground group-hover:text-foreground transition-colors">
        {label}
      </span>
    </Link>
  );
}

function PilotStatusStrip() {
  const items = [
    ["Network", "Mainnet Pilot"],
    ["Pools", "Active"],
    ["Relayer", "Online"],
    ["Limit", "Small amounts"],
  ];

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {items.map(([label, value]) => (
          <div key={label} className="rounded-xl bg-muted/45 px-3 py-2">
            <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              {label}
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 text-sm font-semibold">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              {value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg sm:text-2xl font-bold tracking-tight">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
    </div>
  );
}

/* ── Activity Row ────────────────────────────────────────── */

function ActivityRow({ note }: { note: StoredNote }) {
  const [showVk, setShowVk] = useState(false);
  const [vk, setVk] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const isSpent = note.status === "spent";
  const time = new Date(note.createdAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const handleViewingKey = () => {
    if (showVk) {
      setShowVk(false);
      return;
    }
    try {
      const key = generateViewingKey(note.id, 24);
      setVk(key.viewingKey);
      setShowVk(true);
    } catch {
      // note not found
    }
  };

  const handleCopy = async () => {
    if (!vk) return;
    await navigator.clipboard.writeText(vk);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="py-3 border-b border-border/30 last:border-0">
      <div className="flex items-center gap-3">
        <div
          className={`h-8 w-8 rounded-full flex items-center justify-center ${
            isSpent
              ? "bg-orange-100 text-orange-600"
              : "bg-emerald-100 text-emerald-600"
          }`}
        >
          {isSpent ? (
            <ArrowUpRight className="h-4 w-4" />
          ) : (
            <ArrowDownLeft className="h-4 w-4" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">
            {isSpent ? "Sent" : "Received"}
          </div>
          <div className="text-xs text-muted-foreground truncate font-mono">
            {note.txHash.slice(0, 12)}...
          </div>
        </div>
        <button
          onClick={handleViewingKey}
          className={`h-7 w-7 rounded-full flex items-center justify-center transition-colors ${
            showVk
              ? "bg-violet-100 text-violet-600"
              : "text-muted-foreground/40 hover:text-violet-600 hover:bg-violet-50"
          }`}
          title="Viewing key"
        >
          <Eye className="h-3.5 w-3.5" />
        </button>
        <div className="text-right">
          <div className={`text-sm font-semibold ${isSpent ? "text-orange-600" : "text-emerald-600"}`}>
            {isSpent ? "-" : "+"}{note.amountDisplay}
          </div>
          <div className="text-xs text-muted-foreground">{time}</div>
        </div>
      </div>

      {/* Inline viewing key */}
      {showVk && vk && (
        <div className="mt-2 ml-11 rounded-lg bg-violet-50/80 border border-violet-200/40 p-2.5 flex items-center gap-2">
          <Eye className="h-3 w-3 text-violet-500 shrink-0" />
          <span className="text-[11px] font-mono text-violet-800 truncate flex-1">{vk}</span>
          <button onClick={handleCopy} className="text-violet-500 hover:text-violet-700 shrink-0">
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          </button>
          <button onClick={() => setShowVk(false)} className="text-violet-400 hover:text-violet-600 shrink-0">
            <X className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Dashboard ───────────────────────────────────────────── */

function Dashboard() {
  const [balanceVisible, setBalanceVisible] = useState(true);
  const [notesExpanded, setNotesExpanded] = useState(false);
  const [balance, setBalance] = useState({ total: 0n, display: "0" });
  const [xlmBalance, setXlmBalance] = useState({ total: 0n, display: "0 XLM" });
  const [usdcBalance, setUsdcBalance] = useState({ total: 0n, display: "0 USDC" });
  const [activity, setActivity] = useState<StoredNote[]>([]);
  const [unspent, setUnspent] = useState<StoredNote[]>([]);

  const refresh = useCallback(() => {
    setBalance(getBalance());
    setXlmBalance(getBalance("XLM"));
    setUsdcBalance(getBalance("USDC"));
    setActivity(getAllActivity());
    setUnspent(getUnspentNotes());
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 3000);
    return () => clearInterval(id);
  }, [refresh]);

  return (
    <div className="max-w-2xl mx-auto px-4 lg:px-6 py-6 space-y-6 pb-24 lg:pb-6">
      <PilotStatusStrip />

      {/* Balance Card */}
      <div className="rounded-2xl border border-border/60 bg-gradient-to-br from-card to-muted/30 p-6">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm text-muted-foreground font-medium flex items-center gap-1.5">
            <Shield className="h-3.5 w-3.5" /> Shielded Balance
          </span>
          <button
            onClick={() => setBalanceVisible((v) => !v)}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            {balanceVisible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          </button>
        </div>
        <div className="text-3xl font-bold tracking-tight mb-4">
          {balanceVisible ? (balance.display || "0") : "••••••"}
        </div>
        <div className="flex gap-4 text-sm text-muted-foreground">
          <span>{balanceVisible ? xlmBalance.display : "••• XLM"}</span>
          <span>{balanceVisible ? usdcBalance.display : "••• USDC"}</span>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex justify-around py-2">
        <QuickAction icon={Send} label="Send" href="/wallet/send" color="bg-blue-100 text-blue-600" />
        <QuickAction icon={Download} label="Receive" href="/wallet/receive" color="bg-emerald-100 text-emerald-600" />
        <QuickAction icon={ArrowLeftRight} label="Swap" href="/wallet/send" color="bg-purple-100 text-purple-600" />
        <QuickAction icon={Globe} label="Claim" href="/wallet/receive?tab=claim" color="bg-amber-100 text-amber-600" />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatCard
          label="Available notes"
          value={String(unspent.length)}
          detail="Ready to send"
        />
        <StatCard
          label="Activity"
          value={String(activity.length)}
          detail="Local wallet"
        />
        <StatCard
          label="Reveal keys"
          value="On demand"
          detail="User controlled"
        />
      </div>

      {/* Recent Activity */}
      <div className="rounded-2xl border border-border/60 bg-card">
        <div className="px-5 py-4 border-b border-border/30 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Recent Activity</h3>
          <Clock className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="px-5">
          {activity.length === 0 ? (
            <div className="py-10 text-center">
              <Wallet className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No activity yet</p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Receive funds to get started
              </p>
            </div>
          ) : (
            activity.slice(0, 5).map((note) => (
              <ActivityRow key={note.id} note={note} />
            ))
          )}
        </div>
      </div>

      {/* Notes Section */}
      <div className="rounded-2xl border border-border/60 bg-card">
        <button
          onClick={() => setNotesExpanded((v) => !v)}
          className="w-full px-5 py-4 flex items-center justify-between"
        >
          <h3 className="text-sm font-semibold">
            Shielded Notes ({unspent.length})
          </h3>
          {notesExpanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </button>
        {notesExpanded && (
          <div className="px-5 pb-4 space-y-2">
            {unspent.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No unspent notes
              </p>
            ) : (
              unspent.map((note) => (
                <div
                  key={note.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                >
                  <div>
                    <span className="text-sm font-semibold">{note.amountDisplay}</span>
                    <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-medium">
                      unspent
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground font-mono">
                    {note.id}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Reveal Keys Hint */}
      <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
        <Eye className="h-3 w-3 text-violet-400" />
        <span>Tap the <Eye className="h-3 w-3 inline text-violet-500" /> on any transaction to generate a reveal key for authorized reviewers</span>
      </div>
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────── */

export default function WalletPage() {
  const [ready, setReady] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    setReady(true);
    if (isWalletInitialized() && isUnlocked()) {
      setAuthenticated(true);
    }
  }, []);

  if (!ready) return <AppShell><div className="min-h-screen" /></AppShell>;

  return (
    <AppShell>
      {authenticated ? (
        <Dashboard />
      ) : (
        <SetupCard onDone={() => setAuthenticated(true)} />
      )}
    </AppShell>
  );
}
