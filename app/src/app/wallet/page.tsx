"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Wallet,
  Send,
  Download,
  ArrowLeftRight,

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
  getStellarAddress,
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
    <Link
      href={href}
      className="flex flex-col items-center gap-2.5 group p-3.5 rounded-xl border border-[#1e2329] bg-[#131722] hover:border-[#f7a600] transition-all hover:-translate-y-0.5 flex-1 text-center shadow-sm"
    >
      <div className="h-10 w-10 rounded-lg bg-[#181c25] border border-[#1e2329] flex items-center justify-center group-hover:bg-[#f7a600] group-hover:text-[#0b0e11] transition-colors text-[#eaecef]">
        <Icon className="h-4 w-4" />
      </div>
      <span className="text-xs font-mono font-medium text-[#848e9c] group-hover:text-[#eaecef] transition-colors">
        {label}
      </span>
    </Link>
  );
}

function PilotStatusStrip() {
  const items = [
    ["Network", "Stellar Soroban"],
    ["ASP Status", "Active Clean Pool"],
    ["Relayer", "Online (Decorrelated)"],
    ["Tiers", "$100 — $5,000 Notes"],
  ];

  return (
    <div className="rounded-xl border border-[#1e2329] bg-[#131722] p-4 shadow-sm">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {items.map(([label, value]) => (
          <div key={label} className="border-l-2 border-[#f7a600]/40 pl-3.5 py-0.5">
            <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#848e9c]">
              {label}
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-xs font-mono font-semibold text-[#eaecef]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#0ecb81] shrink-0 animate-pulse" />
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
    <div className="rounded-xl border border-[#1e2329] bg-[#131722] p-4">
      <div className="text-[11px] font-mono font-medium text-[#848e9c] uppercase tracking-wider">{label}</div>
      <div className="mt-1.5 text-xl sm:text-2xl font-mono font-bold tracking-tight text-[#eaecef]">{value}</div>
      <div className="mt-1 text-[11px] font-mono text-[#0ecb81] flex items-center gap-1">
        <span className="h-1 w-1 rounded-full bg-[#0ecb81]" /> {detail}
      </div>
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
  const [addrCopied, setAddrCopied] = useState(false);
  const stellarAddress = getStellarAddress();

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
      <div className="rounded-xl border border-[#1e2329] bg-[#131722] p-6 shadow-md relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-[#f7a600]/5 rounded-full blur-2xl pointer-events-none" />
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-mono uppercase tracking-widest text-[#848e9c] flex items-center gap-2 font-bold">
            <Shield className="h-4 w-4 text-[#f7a600]" /> TOTAL SHIELDED DESK LIQUIDITY
          </span>
          <button
            onClick={() => setBalanceVisible((v) => !v)}
            className="text-[#848e9c] hover:text-[#eaecef] transition-colors p-1"
          >
            {balanceVisible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          </button>
        </div>
        <div className="text-4xl sm:text-5xl font-mono font-black tracking-tight mb-4 text-[#eaecef]">
          {balanceVisible ? (balance.display || "$0.00") : "••••••••"}
        </div>
        {stellarAddress && (
          <button
            onClick={() => {
              navigator.clipboard.writeText(stellarAddress);
              setAddrCopied(true);
              setTimeout(() => setAddrCopied(false), 1500);
            }}
            className="flex items-center gap-2 mb-4 px-3 py-1.5 rounded-lg bg-[#181c25] border border-[#1e2329] hover:border-[#f7a600]/40 transition-colors group"
          >
            <span className="text-[10px] font-mono text-[#848e9c]">
              {stellarAddress.slice(0, 6)}...{stellarAddress.slice(-6)}
            </span>
            {addrCopied ? (
              <Check className="h-3 w-3 text-[#0ecb81]" />
            ) : (
              <Copy className="h-3 w-3 text-[#848e9c] group-hover:text-[#eaecef]" />
            )}
          </button>
        )}
        <div className="grid grid-cols-2 gap-4 text-xs font-mono pt-4 border-t border-[#1e2329]">
          <div className="bg-[#181c25] border border-[#1e2329] rounded-lg p-2.5">
            <span className="text-[10px] text-[#848e9c] uppercase tracking-wider block mb-0.5">Stellar Soroban XLM</span>
            <span className="font-bold text-[#eaecef] text-sm">{balanceVisible ? xlmBalance.display : "••• XLM"}</span>
          </div>
          <div className="bg-[#181c25] border border-[#1e2329] rounded-lg p-2.5">
            <span className="text-[10px] text-[#848e9c] uppercase tracking-wider block mb-0.5">Circle Native USDC</span>
            <span className="font-bold text-[#eaecef] text-sm">{balanceVisible ? usdcBalance.display : "••• USDC"}</span>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex justify-between gap-3 py-2">
        <QuickAction icon={Send} label="Send" href="/wallet/send" color="" />
        <QuickAction icon={Download} label="Receive" href="/wallet/receive" color="" />
        <QuickAction icon={ArrowLeftRight} label="Swap" href="/wallet/send" color="" />
        <QuickAction icon={ArrowUpRight} label="Cash Out" href="/wallet/receive?tab=claim" color="" />
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
      <div className="rounded-xl border border-[#1e2329] bg-[#131722] shadow-sm">
        <div className="px-5 py-4 border-b border-[#1e2329] flex items-center justify-between">
          <h3 className="text-xs font-mono font-bold text-[#eaecef] uppercase tracking-wider">Recent Desk Activity</h3>
          <Clock className="h-4 w-4 text-[#848e9c]" />
        </div>
        <div className="px-5">
          {activity.length === 0 ? (
            <div className="py-10 text-center">
              <Wallet className="h-8 w-8 text-[#848e9c]/40 mx-auto mb-2" />
              <p className="text-sm font-mono text-[#848e9c]">No shielded activity yet</p>
              <p className="text-xs font-mono text-[#848e9c]/60 mt-1">
                Deposit funds or receive institutional notes to start
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
      <div className="rounded-xl border border-[#1e2329] bg-[#131722] shadow-sm">
        <button
          onClick={() => setNotesExpanded((v) => !v)}
          className="w-full px-5 py-4 flex items-center justify-between hover:bg-[#181c25] transition-colors rounded-xl"
        >
          <h3 className="text-xs font-mono font-bold text-[#eaecef] uppercase tracking-wider">
            Unspent Shielded Commitments ({unspent.length})
          </h3>
          {notesExpanded ? (
            <ChevronUp className="h-4 w-4 text-[#848e9c]" />
          ) : (
            <ChevronDown className="h-4 w-4 text-[#848e9c]" />
          )}
        </button>
        {notesExpanded && (
          <div className="px-5 pb-4 space-y-2 pt-2 border-t border-[#1e2329]">
            {unspent.length === 0 ? (
              <p className="text-xs font-mono text-[#848e9c] text-center py-4">
                No active commitments in local storage
              </p>
            ) : (
              unspent.map((note) => (
                <div
                  key={note.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-[#181c25] border border-[#1e2329]"
                >
                  <div>
                    <span className="text-sm font-mono font-bold text-[#eaecef]">{note.amountDisplay}</span>
                    <span className="ml-2 text-[10px] font-mono px-2 py-0.5 rounded bg-[#0ecb81]/15 text-[#0ecb81] border border-[#0ecb81]/30 font-bold">
                      CLEAN NOTE
                    </span>
                  </div>
                  <span className="text-xs font-mono text-[#848e9c]">
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
