"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  Shield,
  Copy,
  ExternalLink,
  Send,
  Download,
  AlertTriangle,
  QrCode,
  Share2,
  Wallet,
  Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import AppShell from "@/components/AppShell";
import { getCorridors, getCorridor, type Corridor } from "@/lib/corridors";
import rampProvider from "@/lib/ramp";
import { getPoolTiers, type PoolTier } from "@/lib/tokens";
import { executeDeposit, type DepositResult } from "@/lib/deposit";
import { executeWithdraw } from "@/lib/withdraw";
import { addNote, generateViewingKey } from "@/lib/noteStore";

/* ── Types ─────────────────────────────────────────────────── */

type Mode = "select" | "send" | "cashout";

type SendStep = "corridor" | "amount" | "onramp" | "shielding" | "share" | "success";
type CashOutStep = "claim" | "withdrawing" | "choice" | "offramp" | "success";

interface ClaimPayload {
  note: string;
  poolId: string;
}

/* ── Helpers ───────────────────────────────────────────────── */

function encodeClaimPayload(note: string, poolId: string): string {
  return btoa(JSON.stringify({ note, poolId }));
}

function decodeClaimPayload(encoded: string): ClaimPayload | null {
  try {
    const data = JSON.parse(atob(encoded));
    if (data.note && data.poolId) return data as ClaimPayload;
    return null;
  } catch {
    return null;
  }
}

function parseNoteAmount(noteString: string): string {
  // Note format: veil-<nullifier>-<secret>-<amount>-<leafIndex>
  const parts = noteString.split("-");
  if (parts.length !== 5 || parts[0] !== "veil") return "?";
  const raw = BigInt(parts[3]);
  const scale = 10n ** 7n;
  const whole = raw / scale;
  const frac = raw % scale;
  if (frac === 0n) return `${whole} USDC`;
  const fracStr = frac.toString().padStart(7, "0").replace(/0+$/, "");
  return `${whole}.${fracStr} USDC`;
}

function shortenAddress(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

/* ── Mode Selector ─────────────────────────────────────────── */

function ModeSelector({ onSelect }: { onSelect: (m: Mode) => void }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Send USDC privately across borders or cash out a received transfer.
      </p>

      <button
        onClick={() => onSelect("send")}
        className="w-full text-left rounded-xl border border-border/60 p-6 hover:border-foreground/30 transition-colors bg-card group"
      >
        <div className="flex items-center gap-3 mb-2">
          <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
            <Send className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <div className="font-semibold">Send Money Abroad</div>
            <div className="text-xs text-muted-foreground">
              Shield USDC and share a private withdrawal link
            </div>
          </div>
        </div>
      </button>

      <button
        onClick={() => onSelect("cashout")}
        className="w-full text-left rounded-xl border border-border/60 p-6 hover:border-foreground/30 transition-colors bg-card group"
      >
        <div className="flex items-center gap-3 mb-2">
          <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center">
            <Download className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <div className="font-semibold">Cash Out</div>
            <div className="text-xs text-muted-foreground">
              Claim a transfer and off-ramp to local currency
            </div>
          </div>
        </div>
      </button>
    </div>
  );
}

/* ── Send Flow ─────────────────────────────────────────────── */

function SendFlow({ onBack }: { onBack: () => void }) {
  const corridors = getCorridors();
  const usdcTiers = getPoolTiers("USDC");

  const [step, setStep] = useState<SendStep>("corridor");
  const [corridor, setCorridor] = useState<Corridor | null>(null);
  const [selectedTier, setSelectedTier] = useState<PoolTier | null>(null);
  const [walletAddress, setWalletAddress] = useState("");
  const [depositResult, setDepositResult] = useState<DepositResult | null>(null);
  const [shareLink, setShareLink] = useState("");
  const [viewingKey, setViewingKey] = useState("");
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");
  const [copied, setCopied] = useState(false);

  const connectWallet = useCallback(async () => {
    try {
      const { isConnected, requestAccess } = await import("@stellar/freighter-api");
      const connected = await isConnected();
      if (!connected) throw new Error("Freighter wallet not found. Please install the extension.");
      const address = await requestAccess();
      setWalletAddress(typeof address === "string" ? address : (address as { address: string }).address);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect wallet");
    }
  }, []);

  const handleDeposit = async () => {
    if (!selectedTier || !walletAddress) return;
    setStep("shielding");
    setError("");
    setProgress("Preparing deposit...");

    try {
      const result = await executeDeposit(
        walletAddress,
        BigInt(selectedTier.amount),
        selectedTier.poolId
      );
      setDepositResult(result);

      // Save note to local store
      const stored = addNote({
        noteString: result.noteString,
        token: "USDC",
        amountDisplay: selectedTier.label,
        amountRaw: selectedTier.amount,
        txHash: result.txHash,
      });

      // Generate share link
      const payload = encodeClaimPayload(result.noteString, selectedTier.poolId);
      const link = `${window.location.origin}/remit?claim=${payload}`;
      setShareLink(link);

      // Generate viewing key
      const vk = generateViewingKey(stored.id, 24);
      setViewingKey(vk.viewingKey);

      setStep("share");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deposit failed");
      setStep("onramp");
    }
  };

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const goBack = () => {
    if (step === "corridor") onBack();
    else if (step === "amount") setStep("corridor");
    else if (step === "onramp") setStep("amount");
    else if (step === "share") setStep("success"); // no going back from share, go to success
    else if (step === "success") onBack();
  };

  return (
    <>
      {/* Header with back */}
      <div className="flex items-center gap-3 mb-6">
        {step === "shielding" ? (
          <span className="text-muted-foreground/40"><ArrowLeft className="h-5 w-5" /></span>
        ) : (
          <button onClick={goBack} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}
        <div>
          <h1 className="text-lg font-semibold">Send Money Abroad</h1>
          <p className="text-xs text-muted-foreground">
            {step === "corridor" && "Choose destination"}
            {step === "amount" && "Select amount"}
            {step === "onramp" && "Fund your wallet"}
            {step === "shielding" && "Shielding funds..."}
            {step === "share" && "Share with recipient"}
            {step === "success" && "Transfer ready"}
          </p>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-red-50 text-red-700 text-sm mb-4">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Step 1: Corridor */}
      {step === "corridor" && (
        <div className="space-y-3">
          {corridors.map((c) => (
            <button
              key={c.id}
              onClick={() => { setCorridor(c); setStep("amount"); }}
              className="w-full text-left rounded-xl border border-border/60 p-5 hover:border-foreground/30 transition-colors bg-card"
            >
              <div className="flex items-center gap-3 mb-2">
                <span className="text-2xl">{c.from.flag}</span>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
                <span className="text-2xl">{c.to.flag}</span>
              </div>
              <div className="text-sm font-semibold">
                {c.from.currency} → {c.to.currency}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {c.from.country} to {c.to.country} · ~{c.estimatedMinutes}min
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Step 2: Amount (pool tier selection) */}
      {step === "amount" && corridor && (
        <div className="space-y-5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="text-lg">{corridor.from.flag}</span>
            {corridor.from.currency}
            <ArrowRight className="h-3.5 w-3.5" />
            <span className="text-lg">{corridor.to.flag}</span>
            {corridor.to.currency}
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-3 block">
              Select USDC pool tier
            </label>
            <div className="grid grid-cols-2 gap-3">
              {usdcTiers.map((tier) => (
                <button
                  key={tier.amount}
                  onClick={() => setSelectedTier(tier)}
                  className={`rounded-xl border p-4 text-center transition-colors ${
                    selectedTier?.amount === tier.amount
                      ? "border-foreground bg-foreground/5"
                      : "border-border/60 hover:border-foreground/30"
                  }`}
                >
                  <div className="text-lg font-bold">{tier.label.split(" ")[0]}</div>
                  <div className="text-xs text-muted-foreground">USDC</div>
                </button>
              ))}
            </div>
            {usdcTiers.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">
                No USDC pool tiers configured. Set NEXT_PUBLIC_USDC_POOL_* env vars.
              </p>
            )}
          </div>

          <Button
            className="w-full"
            onClick={() => setStep("onramp")}
            disabled={!selectedTier}
          >
            Continue
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      )}

      {/* Step 3: On-ramp */}
      {step === "onramp" && corridor && selectedTier && (
        <div className="space-y-5">
          {/* Wallet connection */}
          <div className="rounded-xl border border-border/60 p-5">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Wallet className="h-4 w-4" /> Your Stellar Wallet
            </h3>
            {walletAddress ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono bg-muted px-2 py-1 rounded flex-1 truncate">
                    {walletAddress}
                  </span>
                  <button
                    onClick={() => copyToClipboard(walletAddress)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <QrCode className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">
                    Send {selectedTier.label} to this address from any exchange
                  </span>
                </div>
              </div>
            ) : (
              <Button variant="outline" className="w-full" onClick={connectWallet}>
                <Wallet className="h-4 w-4 mr-2" />
                Connect Freighter Wallet
              </Button>
            )}
          </div>

          {/* On-ramp links */}
          <div className="rounded-xl border border-border/60 p-5">
            <h3 className="text-sm font-semibold mb-3">Buy USDC</h3>
            <p className="text-xs text-muted-foreground mb-3">
              Purchase {selectedTier.label} from any of these providers, then send to your Stellar address above.
            </p>
            <div className="space-y-2">
              {corridor.onRampLinks.map((link) => (
                <a
                  key={link.name}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between px-4 py-3 rounded-lg border border-border/40 hover:border-foreground/30 transition-colors text-sm"
                >
                  <span className="font-medium">{link.name}</span>
                  <ExternalLink className="h-4 w-4 text-muted-foreground" />
                </a>
              ))}
            </div>
          </div>

          <Button
            className="w-full"
            onClick={handleDeposit}
            disabled={!walletAddress}
          >
            <Shield className="h-4 w-4 mr-2" />
            I&apos;ve sent USDC — Shield Now
          </Button>
        </div>
      )}

      {/* Step 4: Shielding */}
      {step === "shielding" && (
        <div className="py-12 text-center space-y-4">
          <Loader2 className="h-10 w-10 animate-spin mx-auto text-foreground" />
          <div>
            <h3 className="text-sm font-semibold">Shielding Funds</h3>
            <p className="text-xs text-muted-foreground mt-1">{progress || "Preparing deposit..."}</p>
          </div>
          <div className="flex items-center justify-center gap-2 text-xs text-emerald-600">
            <Shield className="h-3 w-3" />
            <span>Entering privacy pool</span>
          </div>
        </div>
      )}

      {/* Step 5: Share */}
      {step === "share" && depositResult && (
        <div className="space-y-5">
          <div className="text-center py-4">
            <div className="h-12 w-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-3">
              <Shield className="h-6 w-6 text-emerald-600" />
            </div>
            <h3 className="font-semibold">Funds Shielded</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Share this link with your recipient to claim the transfer
            </p>
          </div>

          {/* Share link */}
          <div className="rounded-xl border border-border/60 p-5 space-y-3">
            <label className="text-xs font-medium text-muted-foreground">Withdrawal Link</label>
            <div className="bg-muted rounded-lg p-3 break-all text-xs font-mono">
              {shareLink}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => copyToClipboard(shareLink)}
              >
                {copied ? <Check className="h-4 w-4 mr-2 text-emerald-600" /> : <Copy className="h-4 w-4 mr-2" />}
                {copied ? "Copied!" : "Copy Link"}
              </Button>
              {typeof navigator !== "undefined" && navigator.share && (
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => navigator.share({ title: "Veil Transfer", url: shareLink })}
                >
                  <Share2 className="h-4 w-4 mr-2" />
                  Share
                </Button>
              )}
            </div>
          </div>

          {/* Warning */}
          <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-amber-50 text-amber-800 text-xs">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              This link contains the secret needed to withdraw funds. Anyone with this link can
              claim the transfer. Share it securely (e.g. encrypted message, in-person).
            </span>
          </div>

          <Button className="w-full" onClick={() => setStep("success")}>
            Done
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      )}

      {/* Step 6: Success */}
      {step === "success" && depositResult && (
        <div className="py-6 space-y-6">
          <div className="text-center">
            <div className="h-16 w-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
              <Check className="h-8 w-8 text-emerald-600" />
            </div>
            <h2 className="text-xl font-semibold">Transfer Ready</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Your recipient can claim the funds using the shared link
            </p>
          </div>

          <div className="rounded-xl border border-border/60 p-5 space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Amount</span>
              <span className="font-medium">{selectedTier?.label}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tx Hash</span>
              <span className="font-mono text-xs truncate ml-4">{depositResult.txHash}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Leaf Index</span>
              <span className="font-mono text-xs">{depositResult.leafIndex}</span>
            </div>
          </div>

          {/* Viewing key */}
          {viewingKey && (
            <div className="rounded-xl border border-border/60 p-5 space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Eye className="h-4 w-4" />
                Transfer Receipt (Viewing Key)
              </div>
              <p className="text-xs text-muted-foreground">
                This key lets auditors verify the transfer without spending the funds.
              </p>
              <div className="bg-muted rounded-lg p-3 text-xs font-mono break-all">
                {viewingKey}
              </div>
              <button
                onClick={() => copyToClipboard(viewingKey)}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                <Copy className="h-3 w-3" />
                Copy viewing key
              </button>
            </div>
          )}

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={onBack}>
              New Transfer
            </Button>
            <Button asChild className="flex-1">
              <Link href="/wallet">Back to Wallet</Link>
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

/* ── Cash Out Flow ─────────────────────────────────────────── */

function CashOutFlow({
  onBack,
  initialClaim,
}: {
  onBack: () => void;
  initialClaim?: ClaimPayload | null;
}) {
  const [step, setStep] = useState<CashOutStep>("claim");
  const [noteString, setNoteString] = useState(initialClaim?.note || "");
  const [poolId, setPoolId] = useState(initialClaim?.poolId || "");
  const [walletAddress, setWalletAddress] = useState("");
  const [txHash, setTxHash] = useState("");
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");
  const [viewingKey, setViewingKey] = useState("");

  // Off-ramp state
  const [recipientName, setRecipientName] = useState("");
  const [recipientAccount, setRecipientAccount] = useState("");
  const [recipientBank, setRecipientBank] = useState("");
  const [offRampResult, setOffRampResult] = useState<{ txId: string; message?: string } | null>(null);

  // Auto-populate and connect wallet on mount
  useEffect(() => {
    if (initialClaim?.note) {
      setNoteString(initialClaim.note);
      setPoolId(initialClaim.poolId);
    }
  }, [initialClaim]);

  const connectAndWithdraw = async () => {
    setError("");
    setStep("withdrawing");
    setProgress("Connecting wallet...");

    try {
      // Connect Freighter
      const { isConnected, requestAccess } = await import("@stellar/freighter-api");
      const connected = await isConnected();
      if (!connected) throw new Error("Freighter wallet not found");
      const addr = await requestAccess();
      const address = typeof addr === "string" ? addr : (addr as { address: string }).address;
      setWalletAddress(address);

      // Execute ZK withdrawal
      const result = await executeWithdraw(
        noteString,
        address,
        (s) => setProgress(s),
        poolId || undefined
      );

      setTxHash(result.txHash);

      // Save note as spent + generate viewing key
      try {
        const stored = addNote({
          noteString,
          token: "USDC",
          amountDisplay: parseNoteAmount(noteString),
          amountRaw: noteString.split("-")[3] || "0",
          txHash: result.txHash,
        });
        const vk = generateViewingKey(stored.id, 24);
        setViewingKey(vk.viewingKey);
      } catch {
        // Non-fatal: note store may already have this note
      }

      setStep("choice");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Withdrawal failed");
      setStep("claim");
    }
  };

  const handleOffRamp = async () => {
    setError("");
    setProgress("Submitting off-ramp...");

    try {
      // Parse amount from note
      const parts = noteString.split("-");
      const rawAmount = BigInt(parts[3] || "0");
      const displayAmount = Number(rawAmount) / 1e7;

      const result = await rampProvider.offRamp({
        amount: displayAmount,
        token: "USDC",
        targetCurrency: "NGN", // Default to NGN, could be derived from corridor
        recipient: recipientAccount,
        recipientName,
        bankCode: recipientBank,
      });

      if (!result.success) {
        setError(result.message || "Off-ramp failed");
        return;
      }

      setOffRampResult({ txId: result.txId, message: result.message });
      setStep("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Off-ramp failed");
    }
  };

  const goBack = () => {
    if (step === "claim") onBack();
    else if (step === "choice") { /* no going back from choice */ }
    else if (step === "offramp") setStep("choice");
    else if (step === "success") onBack();
  };

  // Nigerian banks for the off-ramp form
  const banks = [
    { code: "044", name: "Access Bank" },
    { code: "011", name: "First Bank" },
    { code: "058", name: "GTBank" },
    { code: "526", name: "Kuda Bank" },
    { code: "100004", name: "Opay" },
    { code: "999991", name: "PalmPay" },
    { code: "033", name: "UBA" },
    { code: "057", name: "Zenith Bank" },
  ];

  return (
    <>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        {step === "withdrawing" ? (
          <span className="text-muted-foreground/40"><ArrowLeft className="h-5 w-5" /></span>
        ) : (
          <button onClick={goBack} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}
        <div>
          <h1 className="text-lg font-semibold">Cash Out</h1>
          <p className="text-xs text-muted-foreground">
            {step === "claim" && "Paste your withdrawal note"}
            {step === "withdrawing" && "Processing withdrawal..."}
            {step === "choice" && "Choose what to do with your USDC"}
            {step === "offramp" && "Enter bank details"}
            {step === "success" && "Settlement complete"}
          </p>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-red-50 text-red-700 text-sm mb-4">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Step 1: Claim */}
      {step === "claim" && (
        <div className="space-y-5">
          <div className="rounded-xl border border-border/60 p-5 space-y-3">
            <label className="text-xs font-medium text-muted-foreground block">
              Secret Note
            </label>
            <textarea
              value={noteString}
              onChange={(e) => setNoteString(e.target.value.trim())}
              placeholder="veil-abc123...-def456...-1000000000-0"
              rows={3}
              className="w-full rounded-lg border border-input bg-background px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
            {noteString && noteString.startsWith("veil-") && (
              <div className="flex items-center gap-2 text-sm">
                <Shield className="h-4 w-4 text-emerald-600" />
                <span className="font-medium">{parseNoteAmount(noteString)}</span>
                <span className="text-muted-foreground">shielded</span>
              </div>
            )}
          </div>

          {poolId && (
            <div className="text-xs text-muted-foreground">
              Pool: <span className="font-mono">{shortenAddress(poolId)}</span>
            </div>
          )}

          <Button
            className="w-full"
            onClick={connectAndWithdraw}
            disabled={!noteString || !noteString.startsWith("veil-")}
          >
            <Download className="h-4 w-4 mr-2" />
            Connect Wallet & Withdraw
          </Button>
        </div>
      )}

      {/* Step 2: Withdrawing */}
      {step === "withdrawing" && (
        <div className="py-12 text-center space-y-4">
          <Loader2 className="h-10 w-10 animate-spin mx-auto text-foreground" />
          <div>
            <h3 className="text-sm font-semibold">Generating ZK Proof & Withdrawing</h3>
            <p className="text-xs text-muted-foreground mt-1">{progress || "Processing..."}</p>
          </div>
          <div className="flex items-center justify-center gap-2 text-xs text-emerald-600">
            <Shield className="h-3 w-3" />
            <span>Privacy proof in progress</span>
          </div>
        </div>
      )}

      {/* Step 3: Choice */}
      {step === "choice" && (
        <div className="space-y-5">
          <div className="text-center py-4">
            <div className="h-12 w-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-3">
              <Check className="h-6 w-6 text-emerald-600" />
            </div>
            <h3 className="font-semibold">Withdrawal Complete</h3>
            <p className="text-xs text-muted-foreground mt-1">
              {parseNoteAmount(noteString)} now in your wallet
              {walletAddress && ` (${shortenAddress(walletAddress)})`}
            </p>
          </div>

          <button
            onClick={() => { setStep("success"); }}
            className="w-full text-left rounded-xl border border-border/60 p-5 hover:border-foreground/30 transition-colors bg-card"
          >
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                <Wallet className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <div className="font-semibold text-sm">Hold as USDC</div>
                <div className="text-xs text-muted-foreground">
                  Keep funds in your Stellar wallet
                </div>
              </div>
            </div>
          </button>

          <button
            onClick={() => setStep("offramp")}
            className="w-full text-left rounded-xl border border-border/60 p-5 hover:border-foreground/30 transition-colors bg-card"
          >
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center">
                <Download className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <div className="font-semibold text-sm">Off-ramp to NGN</div>
                <div className="text-xs text-muted-foreground">
                  Convert to Naira and send to your bank
                </div>
              </div>
            </div>
          </button>
        </div>
      )}

      {/* Step 4: Off-ramp form */}
      {step === "offramp" && (
        <div className="space-y-5">
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Recipient Name
              </label>
              <input
                type="text"
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                placeholder="Full name on bank account"
                className="w-full h-11 rounded-lg border border-input bg-background px-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Account Number
              </label>
              <input
                type="text"
                value={recipientAccount}
                onChange={(e) => setRecipientAccount(e.target.value)}
                placeholder="10-digit bank account number"
                className="w-full h-11 rounded-lg border border-input bg-background px-4 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Bank
              </label>
              <select
                value={recipientBank}
                onChange={(e) => setRecipientBank(e.target.value)}
                className="w-full h-11 rounded-lg border border-input bg-background px-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Select bank...</option>
                {banks.map((b) => (
                  <option key={b.code} value={b.code}>{b.name}</option>
                ))}
              </select>
            </div>
          </div>

          <Button
            className="w-full"
            onClick={handleOffRamp}
            disabled={!recipientName || !recipientAccount || !recipientBank}
          >
            Submit Off-Ramp
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      )}

      {/* Step 5: Success */}
      {step === "success" && (
        <div className="py-6 space-y-6">
          <div className="text-center">
            <div className="h-16 w-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
              <Check className="h-8 w-8 text-emerald-600" />
            </div>
            <h2 className="text-xl font-semibold">
              {offRampResult ? "Settlement Submitted" : "Withdrawal Complete"}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {offRampResult
                ? "Your funds are being delivered to your bank account"
                : `${parseNoteAmount(noteString)} is now in your wallet`}
            </p>
          </div>

          <div className="rounded-xl border border-border/60 p-5 space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Amount</span>
              <span className="font-medium">{parseNoteAmount(noteString)}</span>
            </div>
            {txHash && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Withdraw Tx</span>
                <span className="font-mono text-xs truncate ml-4">{txHash}</span>
              </div>
            )}
            {offRampResult && (
              <>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Settlement Ref</span>
                  <span className="font-mono text-xs">{offRampResult.txId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Estimated Delivery</span>
                  <span>~5 minutes</span>
                </div>
              </>
            )}
          </div>

          {/* Viewing key */}
          {viewingKey && (
            <div className="rounded-xl border border-border/60 p-5 space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Eye className="h-4 w-4" />
                Viewing Key
              </div>
              <div className="bg-muted rounded-lg p-3 text-xs font-mono break-all">
                {viewingKey}
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={onBack}>
              Done
            </Button>
            <Button asChild className="flex-1">
              <Link href="/wallet">Back to Wallet</Link>
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

/* ── Main Page (inner, uses useSearchParams) ───────────────── */

function RemitPageInner() {
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<Mode>("select");
  const [claimPayload, setClaimPayload] = useState<ClaimPayload | null>(null);

  // Check for ?claim= param on mount
  useEffect(() => {
    const claimParam = searchParams.get("claim");
    if (claimParam) {
      const payload = decodeClaimPayload(claimParam);
      if (payload) {
        setClaimPayload(payload);
        setMode("cashout");
        // Clear the URL param for security
        window.history.replaceState({}, "", "/remit");
      }
    }
  }, [searchParams]);

  const resetMode = () => {
    setMode("select");
    setClaimPayload(null);
  };

  return (
    <div className="max-w-lg mx-auto px-4 lg:px-6 py-6 pb-24 lg:pb-6">
      {mode === "select" && (
        <>
          <div className="flex items-center gap-3 mb-6">
            <Link href="/wallet" className="text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div>
              <h1 className="text-lg font-semibold">Private Remittance</h1>
              <p className="text-xs text-muted-foreground">
                Cross-border transfers with ZK privacy
              </p>
            </div>
          </div>
          <ModeSelector onSelect={setMode} />
        </>
      )}

      {mode === "send" && <SendFlow onBack={resetMode} />}
      {mode === "cashout" && <CashOutFlow onBack={resetMode} initialClaim={claimPayload} />}
    </div>
  );
}

/* ── Default Export (Suspense boundary for useSearchParams) ── */

export default function RemitPage() {
  return (
    <AppShell>
      <Suspense fallback={
        <div className="max-w-lg mx-auto px-4 lg:px-6 py-12 text-center text-muted-foreground text-sm">
          Loading...
        </div>
      }>
        <RemitPageInner />
      </Suspense>
    </AppShell>
  );
}
