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
  ArrowUpRight,
  ArrowDownLeft,
  Clock,
  Shield,
  Copy,
  Check,
  X,
  ChevronRight,
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
}: {
  icon: React.ElementType;
  label: string;
  href: string;
  color?: string;
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
    <div className="py-3 border-b border-[#1e2329]/60 last:border-0">
      <div className="flex items-center gap-3">
        <div
          className={`h-8 w-8 rounded-full flex items-center justify-center ${
            isSpent
              ? "bg-[#f7a600]/15 text-[#f7a600]"
              : "bg-[#0ecb81]/15 text-[#0ecb81]"
          }`}
        >
          {isSpent ? (
            <ArrowUpRight className="h-4 w-4" />
          ) : (
            <ArrowDownLeft className="h-4 w-4" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-[#eaecef]">
            {isSpent ? "Sent" : "Received"}
          </div>
          <div className="text-xs text-[#848e9c] truncate font-mono">
            {note.txHash.slice(0, 12)}...
          </div>
        </div>
        <button
          onClick={handleViewingKey}
          className={`h-7 w-7 rounded-full flex items-center justify-center transition-colors ${
            showVk
              ? "bg-violet-500/20 text-violet-400"
              : "text-[#848e9c]/40 hover:text-violet-400 hover:bg-violet-500/10"
          }`}
          title="Viewing key"
        >
          <Eye className="h-3.5 w-3.5" />
        </button>
        <div className="text-right">
          <div className={`text-sm font-semibold font-mono ${isSpent ? "text-[#f7a600]" : "text-[#0ecb81]"}`}>
            {isSpent ? "-" : "+"}{note.amountDisplay}
          </div>
          <div className="text-xs text-[#848e9c]">{time}</div>
        </div>
      </div>

      {/* Inline viewing key */}
      {showVk && vk && (
        <div className="mt-2 ml-11 rounded-lg bg-violet-500/10 border border-violet-500/20 p-2.5 flex items-center gap-2">
          <Eye className="h-3 w-3 text-violet-400 shrink-0" />
          <span className="text-[11px] font-mono text-violet-300 truncate flex-1">{vk}</span>
          <button onClick={handleCopy} className="text-violet-400 hover:text-violet-300 shrink-0">
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          </button>
          <button onClick={() => setShowVk(false)} className="text-violet-500 hover:text-violet-300 shrink-0">
            <X className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Format Stellar address in spaced groups ─────────────── */

function formatAddress(addr: string): string {
  // Show as 4-char groups: GABC DEFG ... WXYZ
  return addr.match(/.{1,4}/g)?.join(" ") ?? addr;
}

/* ── Dashboard ───────────────────────────────────────────── */

function Dashboard() {
  const [balanceVisible, setBalanceVisible] = useState(true);
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
      {/* ── Premium Balance Card ─────────────────────────── */}
      <div
        className="relative rounded-2xl overflow-hidden shadow-lg border border-[#1e2329]"
        style={{
          background: `
            repeating-linear-gradient(
              45deg,
              rgba(247, 166, 0, 0.04) 0px,
              rgba(247, 166, 0, 0.04) 8px,
              transparent 8px,
              transparent 16px
            ),
            linear-gradient(135deg, #1a1e26 0%, #131722 100%)
          `,
        }}
      >
        {/* Amber accent bar */}
        <div className="absolute top-0 left-0 right-0 h-[3px] bg-[#f7a600]" />

        <div className="p-6 pt-7">
          {/* Top row: SHIELDED badge + visibility toggle */}
          <div className="flex items-center justify-between mb-5">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-widest text-[#f7a600] bg-[#f7a600]/10 border border-[#f7a600]/25 px-2.5 py-1 rounded">
              <Shield className="h-3 w-3" />
              Shielded
            </span>
            <button
              onClick={() => setBalanceVisible((v) => !v)}
              className="text-[#848e9c] hover:text-[#eaecef] transition-colors p-1"
            >
              {balanceVisible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            </button>
          </div>

          {/* Hero balance */}
          <div className="text-4xl sm:text-5xl font-mono font-black tracking-tight text-[#eaecef] mb-4">
            {balanceVisible ? (balance.display || "$0.00") : "••••••••"}
          </div>

          {/* Token sub-balances as inline pills */}
          <div className="flex items-center gap-2 mb-5">
            <span className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-[#eaecef] bg-[#181c25] border border-[#1e2329] rounded-full px-3 py-1">
              {balanceVisible ? xlmBalance.display : "••• XLM"}
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-[#eaecef] bg-[#181c25] border border-[#1e2329] rounded-full px-3 py-1">
              {balanceVisible ? usdcBalance.display : "••• USDC"}
            </span>
          </div>

          {/* Stellar address — card-number style */}
          {stellarAddress && (
            <button
              onClick={() => {
                navigator.clipboard.writeText(stellarAddress);
                setAddrCopied(true);
                setTimeout(() => setAddrCopied(false), 1500);
              }}
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-[#0b0e11]/50 border border-[#1e2329] hover:border-[#f7a600]/40 transition-colors group w-full"
            >
              <span className="text-[11px] font-mono tracking-[0.15em] text-[#848e9c] truncate flex-1 text-left">
                {formatAddress(stellarAddress).slice(0, 39)}
              </span>
              {addrCopied ? (
                <Check className="h-3.5 w-3.5 text-[#0ecb81] shrink-0" />
              ) : (
                <Copy className="h-3.5 w-3.5 text-[#848e9c] group-hover:text-[#eaecef] shrink-0" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* ── Quick Actions ────────────────────────────────── */}
      <div className="flex justify-between gap-3 py-2">
        <QuickAction icon={Send} label="Send" href="/wallet/send" />
        <QuickAction icon={Download} label="Receive" href="/wallet/receive" />
        <QuickAction icon={ArrowLeftRight} label="Swap" href="/wallet/send" />
        <QuickAction icon={ArrowUpRight} label="Cash Out" href="/wallet/receive?tab=claim" />
      </div>

      {/* ── Recent Activity ──────────────────────────────── */}
      <div className="rounded-xl border border-[#1e2329] bg-[#131722] shadow-sm">
        <div className="px-5 py-4 border-b border-[#1e2329] flex items-center justify-between">
          <h3 className="text-xs font-mono font-bold text-[#eaecef] uppercase tracking-wider">Recent Activity</h3>
          <Clock className="h-4 w-4 text-[#848e9c]" />
        </div>
        <div className="px-5">
          {activity.length === 0 ? (
            <div className="py-10 text-center">
              <Wallet className="h-8 w-8 text-[#848e9c]/40 mx-auto mb-2" />
              <p className="text-sm font-mono text-[#848e9c]">No shielded activity yet</p>
              <p className="text-xs font-mono text-[#848e9c]/60 mt-1">
                Deposit funds or receive notes to start
              </p>
            </div>
          ) : (
            activity.slice(0, 5).map((note) => (
              <ActivityRow key={note.id} note={note} />
            ))
          )}
        </div>
        {unspent.length > 0 && (
          <Link
            href="/wallet/notes"
            className="flex items-center justify-center gap-1.5 py-3 border-t border-[#1e2329] text-xs font-mono font-bold text-[#f7a600] hover:text-[#f7a600]/80 transition-colors"
          >
            View All Notes
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        )}
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
