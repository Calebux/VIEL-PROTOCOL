"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowLeftRight,
  Send,
  Clipboard,
  Check,
  Loader2,
  ShieldCheck,
  AlertTriangle,
  Eye,
  Copy,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import AppShell from "@/components/AppShell";
import {
  isWalletInitialized,
  isUnlocked,
  getUnspentNotes,
  selectNoteForAmount,
  markSpent,
  generateViewingKey,
  type StoredNote,
} from "@/lib/noteStore";
import { getActiveTokens, getPoolTiers, getSwapPairs, SUPPORTED_TOKENS, type SupportedToken, type PoolTier } from "@/lib/tokens";
import { executeWithdraw, checkSubsetStatus } from "@/lib/withdraw";
import type { SubsetStatus } from "@/lib/withdraw";

type SendState = "form" | "review" | "processing" | "success" | "error";

const FRIENDLY_STEPS = [
  "Preparing your transaction...",
  "Securing your privacy...",
  "Verifying compliance...",
  "Building zero-knowledge proof...",
  "Generating Groth16 proof...",
  "Proof complete!",
  "Submitting to network...",
  "Sending...",
];

function SuccessScreen({ txHash, noteId }: { txHash: string; noteId: string }) {
  const [vk, setVk] = useState<{ viewingKey: string; timelockHours: number; expiresAt: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const [timelock, setTimelock] = useState(24);

  const handleGenerate = () => {
    try {
      const key = generateViewingKey(noteId, timelock);
      setVk(key);
    } catch {
      // note may already be gone
    }
  };

  const handleCopy = async () => {
    if (!vk) return;
    await navigator.clipboard.writeText(vk.viewingKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="py-10 space-y-5">
      <div className="text-center">
        <div className="h-16 w-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
          <Check className="h-8 w-8 text-emerald-600" />
        </div>
        <h2 className="text-xl font-semibold mt-4">Sent!</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Your private transfer is complete
        </p>
      </div>

      <div className="rounded-lg bg-muted/50 px-4 py-3">
        <div className="text-xs text-muted-foreground mb-1">Transaction</div>
        <div className="text-xs font-mono break-all">{txHash}</div>
      </div>

      {/* Reveal Key Section */}
      <div className="rounded-xl border border-border/60 p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Eye className="h-4 w-4 text-violet-600" />
          <span className="text-sm font-semibold">Reveal Key</span>
        </div>

        {!vk ? (
          <>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Generate a reveal key for this transaction. Share it only with an
              authorized reviewer so they can verify disclosed details after the
              timelock expires. The key cannot spend funds.
            </p>

            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Timelock period</label>
              <div className="flex gap-1.5">
                {[6, 12, 24, 72].map((h) => (
                  <button
                    key={h}
                    onClick={() => setTimelock(h)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      timelock === h
                        ? "bg-violet-100 text-violet-700 border border-violet-200"
                        : "bg-muted/50 text-muted-foreground border border-transparent hover:bg-muted"
                    }`}
                  >
                    {h}h
                  </button>
                ))}
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              className="w-full gap-2"
              onClick={handleGenerate}
            >
              <Eye className="h-3.5 w-3.5" />
              Generate Reveal Key
            </Button>
          </>
        ) : (
          <>
            <div className="rounded-lg bg-violet-50/80 border border-violet-200/60 p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-violet-600 font-medium">Key</span>
                <button onClick={handleCopy} className="text-violet-600 hover:text-violet-800">
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
              <div className="font-mono text-xs break-all text-violet-900">{vk.viewingKey}</div>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              Unlocks in {vk.timelockHours}h — auditor can verify after{" "}
              {new Date(vk.expiresAt).toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </div>
          </>
        )}
      </div>

      <Button asChild className="w-full">
        <Link href="/wallet">Back to Wallet</Link>
      </Button>
    </div>
  );
}

export default function SendPage() {
  const tokens = getActiveTokens();
  const [token, setToken] = useState<SupportedToken>(tokens[0]);
  const [recipient, setRecipient] = useState("");
  const [selectedNote, setSelectedNote] = useState<StoredNote | null>(null);
  const tiers = getPoolTiers(token.symbol);
  const [tier, setTier] = useState<PoolTier | null>(tiers[0] || null);
  const [compliance, setCompliance] = useState<SubsetStatus | null>(null);
  const [state, setState] = useState<SendState>("form");
  const [stepIndex, setStepIndex] = useState(0);
  const [txHash, setTxHash] = useState("");
  const [error, setError] = useState("");
  const [pasted, setPasted] = useState(false);
  const [enableSwap, setEnableSwap] = useState(false);
  const [swapTokenOut, setSwapTokenOut] = useState("");

  // Swap pairs for selected token
  const swapPairs = getSwapPairs(token.symbol);
  const availableSwapTokens = SUPPORTED_TOKENS.filter(
    (t) => t.symbol !== token.symbol && swapPairs.some((p) => p.tokenOut === t.symbol)
  );
  const selectedPair = swapPairs.find((p) => p.tokenOut === swapTokenOut);

  // Reset tier when token changes
  useEffect(() => {
    const newTiers = getPoolTiers(token.symbol);
    setTier(newTiers[0] || null);
  }, [token.symbol]);

  // Auto-select note when token/tier changes
  useEffect(() => {
    if (!tier) { setSelectedNote(null); return; }
    const note = selectNoteForAmount(token.symbol, tier.amount);
    setSelectedNote(note);
    setCompliance(null);
    if (note) {
      const parts = note.noteString.split("-");
      if (parts.length >= 3) {
        try {
          const commitmentBig = BigInt("0x" + parts[1]);
          checkSubsetStatus(commitmentBig)
            .then(setCompliance)
            .catch(() => {});
        } catch {
          // invalid hex, skip compliance check
        }
      }
    }
  }, [token, tier]);

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setRecipient(text.trim());
      setPasted(true);
      setTimeout(() => setPasted(false), 1500);
    } catch {
      // clipboard access denied
    }
  };

  const canReview = selectedNote && recipient.startsWith("G") && recipient.length >= 56;

  const handleSend = async () => {
    if (!selectedNote) return;
    setState("processing");
    setStepIndex(0);
    setError("");

    try {
      // Connect Freighter so it can sign the withdrawal tx
      const { requestAccess } = await import("@stellar/freighter-api");
      await requestAccess();

      let step = 0;
      const result = await executeWithdraw(
        selectedNote.noteString,
        recipient,
        (msg: string) => {
          if (step < FRIENDLY_STEPS.length - 1) step++;
          setStepIndex(step);
        },
        tier?.poolId
      );

      markSpent(selectedNote.id, result.txHash);
      setTxHash(result.txHash);
      setState("success");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Transaction failed");
      setState("error");
    }
  };

  // Redirect if wallet not set up
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(true);
  }, []);

  if (!ready) return <AppShell><div className="min-h-screen" /></AppShell>;
  if (!isWalletInitialized() || !isUnlocked()) {
    return (
      <AppShell>
        <div className="max-w-lg mx-auto px-4 py-20 text-center">
          <p className="text-muted-foreground mb-4">Open your wallet first</p>
          <Button asChild><Link href="/wallet">Go to Wallet</Link></Button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="max-w-lg mx-auto px-4 lg:px-6 py-6 pb-24 lg:pb-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Link href="/wallet" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-lg font-semibold">Send</h1>
        </div>

        {state === "form" && (
          <div className="space-y-5">
            {/* Token selector */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Token</label>
              <div className="flex gap-2">
                {tokens.map((t) => {
                  const count = getUnspentNotes(t.symbol).length;
                  return (
                    <button
                      key={t.symbol}
                      onClick={() => setToken(t)}
                      className={`flex-1 py-3 rounded-xl border text-sm font-medium transition-colors ${
                        token.symbol === t.symbol
                          ? "border-foreground bg-foreground text-background"
                          : "border-border/60 text-muted-foreground hover:border-foreground/30"
                      }`}
                    >
                      {t.symbol}
                      <span className="ml-1 opacity-60">({count})</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Amount selector */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Amount</label>
              <div className="grid grid-cols-2 gap-2">
                {tiers.map((t) => {
                  const hasNote = !!selectNoteForAmount(token.symbol, t.amount);
                  return (
                    <button
                      key={t.amount}
                      onClick={() => setTier(t)}
                      className={`py-3 rounded-xl border text-sm font-semibold transition-colors relative ${
                        tier?.amount === t.amount
                          ? "border-foreground bg-foreground text-background"
                          : hasNote
                          ? "border-border/60 text-foreground hover:border-foreground/30"
                          : "border-border/40 text-muted-foreground/50"
                      }`}
                    >
                      {t.label}
                      {!hasNote && (
                        <span className="block text-[10px] font-normal opacity-60">no notes</span>
                      )}
                    </button>
                  );
                })}
              </div>
              {tier && !selectedNote && (
                <div className="mt-3 text-sm text-amber-600 flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4" />
                  No unspent {tier.label} notes
                </div>
              )}
            </div>

            {/* Recipient */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Recipient Address
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  placeholder="G..."
                  className="w-full h-11 rounded-lg border border-input bg-background px-4 pr-11 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <button
                  onClick={handlePaste}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {pasted ? <Check className="h-4 w-4 text-emerald-500" /> : <Clipboard className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Swap toggle */}
            <div className="rounded-xl border border-border/60 p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <ArrowLeftRight className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-sm font-medium">Receive as different token</p>
                  <p className="text-xs text-muted-foreground">Extra unlinkability via swap</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setEnableSwap(!enableSwap);
                  if (!enableSwap && availableSwapTokens.length > 0) {
                    setSwapTokenOut(availableSwapTokens[0].symbol);
                  }
                }}
                className={`relative w-11 h-6 rounded-full transition-colors ${
                  enableSwap ? "bg-indigo-600" : "bg-muted"
                }`}
              >
                <div
                  className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${
                    enableSwap ? "left-[22px]" : "left-0.5"
                  }`}
                />
              </button>
            </div>

            {/* Swap token selector */}
            {enableSwap && availableSwapTokens.length > 0 && (
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground block">Recipient receives</label>
                <div className="flex gap-2">
                  {availableSwapTokens.map((t) => {
                    const pair = swapPairs.find((p) => p.tokenOut === t.symbol);
                    return (
                      <button
                        key={t.symbol}
                        onClick={() => setSwapTokenOut(t.symbol)}
                        className={`flex-1 rounded-xl border p-3 text-left transition-colors ${
                          swapTokenOut === t.symbol
                            ? "border-indigo-300 bg-indigo-50"
                            : "border-border/60 hover:border-border"
                        }`}
                      >
                        <div className="text-sm font-medium">{t.symbol}</div>
                        {pair && (
                          <div className="text-xs text-indigo-600 mt-0.5">
                            ~{(tier ? parseFloat(tier.amount) / Math.pow(10, token.decimals) * pair.rate * 0.95 : 0).toFixed(2)} {t.symbol}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Compliance status */}
            {compliance && (
              <div className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm ${
                compliance.status === "compliant"
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-amber-50 text-amber-700"
              }`}>
                <ShieldCheck className="h-4 w-4" />
                {compliance.status === "compliant"
                  ? "Note is compliance-verified"
                  : "Compliance status: " + compliance.status.replace("_", " ")}
              </div>
            )}

            <Button
              className="w-full"
              disabled={!canReview}
              onClick={() => setState("review")}
            >
              Review
            </Button>
          </div>
        )}

        {state === "review" && selectedNote && (
          <div className="space-y-5">
            <div className="rounded-xl border border-border/60 p-5 space-y-4">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Amount</span>
                <span className="font-semibold">{selectedNote.amountDisplay}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">To</span>
                <span className="font-mono text-xs">{recipient.slice(0, 8)}...{recipient.slice(-6)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Note ID</span>
                <span className="font-mono text-xs">{selectedNote.id}</span>
              </div>
              {enableSwap && selectedPair && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Swap</span>
                  <span className="flex items-center gap-1 text-indigo-600 font-medium">
                    <ArrowLeftRight className="h-3.5 w-3.5" />
                    {token.symbol} → {swapTokenOut}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Privacy</span>
                <span className="flex items-center gap-1 text-emerald-600">
                  <ShieldCheck className="h-3.5 w-3.5" /> ZK Proof{enableSwap ? " + Swap" : ""}
                </span>
              </div>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setState("form")}>
                Back
              </Button>
              <Button className="flex-1" onClick={handleSend}>
                <Send className="h-4 w-4 mr-2" />
                Send
              </Button>
            </div>
          </div>
        )}

        {state === "processing" && (
          <div className="py-12 space-y-6">
            <div className="flex justify-center">
              <div className="h-16 w-16 rounded-full bg-foreground/5 flex items-center justify-center">
                <Loader2 className="h-8 w-8 text-foreground animate-spin" />
              </div>
            </div>
            <div className="space-y-2">
              {FRIENDLY_STEPS.slice(0, stepIndex + 1).map((msg, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-2 text-sm ${
                    i === stepIndex
                      ? "text-foreground font-medium"
                      : "text-muted-foreground"
                  }`}
                >
                  {i < stepIndex ? (
                    <Check className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  {msg}
                </div>
              ))}
            </div>
          </div>
        )}

        {state === "success" && (
          <SuccessScreen txHash={txHash} noteId={selectedNote?.id ?? ""} />
        )}

        {state === "error" && (
          <div className="py-12 text-center space-y-5">
            <div className="h-16 w-16 rounded-full bg-red-100 flex items-center justify-center mx-auto">
              <AlertTriangle className="h-8 w-8 text-red-600" />
            </div>
            <div>
              <h2 className="text-xl font-semibold">Failed</h2>
              <p className="text-sm text-destructive mt-2">{error}</p>
            </div>
            <Button onClick={() => setState("form")} className="w-full">
              Try Again
            </Button>
          </div>
        )}
      </div>
    </AppShell>
  );
}
