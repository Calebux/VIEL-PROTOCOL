"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Download,
  Check,
  Loader2,
  AlertTriangle,
  Droplets,
  Wallet,
  Copy,
  QrCode,
  Shield,
  Share2,
  Eye,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import AppShell from "@/components/AppShell";
import {
  isWalletInitialized,
  isUnlocked,
  addNote,
  generateViewingKey,
} from "@/lib/noteStore";
import { getActiveTokens, getPoolTiers, type SupportedToken, type PoolTier } from "@/lib/tokens";
import { executeDeposit, type DepositResult } from "@/lib/deposit";
import { executeWithdraw } from "@/lib/withdraw";
import { getCorridor } from "@/lib/corridors";
import rampProvider from "@/lib/ramp";

/* ── Types ─────────────────────────────────────────────────── */

type Tab = "deposit" | "claim";
type DepositState = "idle" | "connecting" | "depositing" | "success";
type ClaimStep = "paste" | "withdrawing" | "choice" | "offramp" | "success";

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

const FRIENDBOT_URL = "https://friendbot.stellar.org";

/* ── Deposit Tab ───────────────────────────────────────────── */

function DepositTab() {
  const tokens = getActiveTokens();
  const [token, setToken] = useState<SupportedToken>(tokens[0]);
  const tiers = getPoolTiers(token.symbol);
  const [tier, setTier] = useState<PoolTier>(tiers[0]);
  const [state, setState] = useState<DepositState>("idle");
  const [error, setError] = useState("");
  const [depositResult, setDepositResult] = useState<DepositResult | null>(null);
  const [fundingStatus, setFundingStatus] = useState<"idle" | "funding" | "funded" | "error">("idle");
  const [address, setAddress] = useState("");
  const [copied, setCopied] = useState(false);
  const [showQR, setShowQR] = useState(false);

  // Share link state (shown after deposit success)
  const [shareLink, setShareLink] = useState("");
  const [viewingKey, setViewingKey] = useState("");
  const [shareCopied, setShareCopied] = useState(false);

  useEffect(() => {
    const newTiers = getPoolTiers(token.symbol);
    if (newTiers.length > 0) setTier(newTiers[0]);
  }, [token.symbol]);

  // Connect Freighter on mount
  useEffect(() => {
    if (address) return;
    (async () => {
      try {
        const { isConnected, requestAccess } = await import("@stellar/freighter-api");
        const connected = await isConnected();
        if (connected) {
          const addr = await requestAccess();
          setAddress(addr);
        }
      } catch {
        // Freighter not available
      }
    })();
  }, [address]);

  const copyAddress = () => {
    if (!address) return;
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const fundTestnet = async () => {
    setFundingStatus("funding");
    try {
      let addr = address;
      if (!addr) {
        const { isConnected, requestAccess } = await import("@stellar/freighter-api");
        const connected = await isConnected();
        if (!connected) throw new Error("Freighter not found");
        addr = await requestAccess();
        setAddress(addr);
      }
      const res = await fetch(`${FRIENDBOT_URL}?addr=${addr}`);
      if (!res.ok) throw new Error("Friendbot request failed");
      setFundingStatus("funded");
    } catch {
      setFundingStatus("error");
    }
  };

  const handleDeposit = async () => {
    setState("connecting");
    setError("");

    try {
      const { isConnected, requestAccess, getNetwork } = await import("@stellar/freighter-api");
      const connected = await isConnected();
      if (!connected) throw new Error("Freighter not found. Install the Freighter wallet extension.");

      const network = await getNetwork();
      if (network && network !== "TESTNET") {
        throw new Error("Switch Freighter to Testnet");
      }

      const addr = await requestAccess();
      setAddress(addr);

      setState("depositing");
      const result = await executeDeposit(addr, BigInt(tier.amount), tier.poolId);

      const stored = addNote({
        noteString: result.noteString,
        token: token.symbol,
        amountDisplay: tier.label,
        amountRaw: tier.amount,
        txHash: result.txHash,
      });

      setDepositResult(result);

      // Generate share link
      const payload = encodeClaimPayload(result.noteString, tier.poolId);
      const link = `${window.location.origin}/wallet/receive?claim=${payload}`;
      setShareLink(link);

      // Generate viewing key
      const vk = generateViewingKey(stored.id, 24);
      setViewingKey(vk.viewingKey);

      setState("success");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Deposit failed");
      setState("idle");
    }
  };

  const copyShareLink = () => {
    navigator.clipboard.writeText(shareLink);
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 2000);
  };

  if (state === "connecting") {
    return (
      <div className="py-16 text-center space-y-4">
        <Loader2 className="h-10 w-10 animate-spin mx-auto text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Connecting to Freighter...</p>
      </div>
    );
  }

  if (state === "depositing") {
    return (
      <div className="py-16 text-center space-y-4">
        <div className="relative mx-auto w-16 h-16">
          <div className="absolute inset-0 rounded-full border-2 border-emerald-200 animate-ping" />
          <div className="relative h-16 w-16 rounded-full bg-emerald-100 flex items-center justify-center">
            <Loader2 className="h-8 w-8 text-emerald-600 animate-spin" />
          </div>
        </div>
        <div>
          <p className="text-sm font-medium">Depositing to shielded pool...</p>
          <p className="text-xs text-muted-foreground mt-1">Sign the transaction in Freighter</p>
        </div>
      </div>
    );
  }

  if (state === "success" && depositResult) {
    return (
      <div className="py-8 space-y-5">
        <div className="text-center">
          <div className="h-16 w-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-3">
            <Check className="h-8 w-8 text-emerald-600" />
          </div>
          <h2 className="text-xl font-semibold">{tier.label} shielded!</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Your shielded note was saved to the wallet
          </p>
        </div>

        <div className="rounded-lg bg-muted/50 px-4 py-3">
          <div className="text-xs text-muted-foreground mb-1">Transaction</div>
          <div className="text-xs font-mono break-all">{depositResult.txHash}</div>
        </div>

        {/* Share withdrawal link */}
        <div className="rounded-xl border border-border/60 p-5 space-y-3">
          <label className="text-xs font-medium text-muted-foreground">Share withdrawal link</label>
          <p className="text-xs text-muted-foreground">
            Send this link to your recipient so they can claim the funds
          </p>
          <div className="bg-muted rounded-lg p-3 break-all text-xs font-mono">{shareLink}</div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={copyShareLink}>
              {shareCopied ? (
                <><Check className="h-4 w-4 mr-2 text-emerald-600" /> Copied!</>
              ) : (
                <><Copy className="h-4 w-4 mr-2" /> Copy Link</>
              )}
            </Button>
            {typeof navigator !== "undefined" && navigator.share && (
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => navigator.share({ title: "Veil Transfer", url: shareLink })}
              >
                <Share2 className="h-4 w-4 mr-2" /> Share
              </Button>
            )}
          </div>
        </div>

        {/* Security warning */}
        <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-amber-50 text-amber-800 text-xs">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            This link contains the secret needed to withdraw funds. Anyone with this link can
            claim the transfer. Share it securely (e.g. encrypted message, in-person).
          </span>
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
            <div className="bg-muted rounded-lg p-3 text-xs font-mono break-all">{viewingKey}</div>
          </div>
        )}

        <div className="flex gap-3">
          <Button variant="outline" className="flex-1" onClick={() => { setState("idle"); setDepositResult(null); setShareLink(""); setViewingKey(""); }}>
            Receive More
          </Button>
          <Button asChild className="flex-1">
            <Link href="/wallet">
              <Wallet className="h-4 w-4 mr-2" /> Wallet
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  // Idle state — deposit form
  return (
    <div className="space-y-5">
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-red-50 text-red-700 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
          <button className="ml-auto text-xs underline" onClick={() => setError("")}>Dismiss</button>
        </div>
      )}

      {/* Token selector */}
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Token</label>
        <div className="flex gap-2">
          {tokens.map((t) => (
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
            </button>
          ))}
        </div>
      </div>

      {/* Amount selector */}
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Amount</label>
        <div className="grid grid-cols-2 gap-2">
          {tiers.map((t) => (
            <button
              key={t.amount}
              onClick={() => setTier(t)}
              className={`py-3 rounded-xl border text-sm font-semibold transition-colors ${
                tier.amount === t.amount
                  ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                  : "border-border/60 text-muted-foreground hover:border-foreground/30"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Deposit from exchange */}
      <div className="rounded-xl border border-border/60 overflow-hidden">
        <div className="p-5 text-center bg-gradient-to-br from-blue-50/50 to-card">
          <QrCode className="h-8 w-8 text-blue-600 mx-auto mb-2" />
          <div className="text-sm font-semibold mb-1">Deposit from exchange or wallet</div>
          <p className="text-xs text-muted-foreground mb-4">
            Send {token.symbol} to your Stellar address below
          </p>

          {address ? (
            <>
              {showQR && (
                <div className="mb-4 flex justify-center">
                  <div className="bg-white p-3 rounded-xl inline-block">
                    <QRCodeSVG value={address} size={160} />
                  </div>
                </div>
              )}
              <div className="bg-muted/50 rounded-lg px-3 py-2.5 mb-3">
                <div className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wider">Stellar Address</div>
                <div className="text-xs font-mono break-all leading-relaxed">{address}</div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="flex-1" onClick={copyAddress}>
                  {copied ? (
                    <><Check className="h-3.5 w-3.5 mr-1.5 text-emerald-500" /> Copied</>
                  ) : (
                    <><Copy className="h-3.5 w-3.5 mr-1.5" /> Copy Address</>
                  )}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setShowQR(!showQR)}>
                  <QrCode className="h-3.5 w-3.5 mr-1.5" />
                  {showQR ? "Hide" : "Show"} QR
                </Button>
              </div>
            </>
          ) : (
            <Button
              size="sm"
              onClick={async () => {
                const { isConnected, requestAccess } = await import("@stellar/freighter-api");
                const connected = await isConnected();
                if (!connected) return;
                const addr = await requestAccess();
                setAddress(addr);
              }}
            >
              Connect Wallet to Show Address
            </Button>
          )}
        </div>
        <div className="px-4 py-3 bg-muted/20 border-t border-border/40">
          <p className="text-[11px] text-muted-foreground text-center">
            Send from Binance, Yellow Card, Luno, or any Stellar wallet
          </p>
        </div>
      </div>

      {/* Shield into pool */}
      <div className="rounded-xl border border-emerald-200/60 bg-emerald-50/30 p-5 text-center">
        <Download className="h-8 w-8 text-emerald-600 mx-auto mb-2" />
        <div className="text-sm font-semibold mb-1">Shield {tier.label}</div>
        <p className="text-xs text-muted-foreground mb-1">Deposit into the Veil privacy pool</p>
        <p className="text-[10px] text-muted-foreground/60">Note is automatically saved to your wallet</p>
      </div>

      {/* Friendbot */}
      <div className="rounded-xl border border-border/60 p-4 flex items-center gap-3">
        <Droplets className="h-5 w-5 text-blue-500 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">Need testnet funds?</div>
          <div className="text-xs text-muted-foreground">Get free testnet XLM via Stellar Friendbot</div>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={fundingStatus === "funding" || fundingStatus === "funded"}
          onClick={fundTestnet}
        >
          {fundingStatus === "funding" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : fundingStatus === "funded" ? (
            <Check className="h-3.5 w-3.5 text-emerald-500" />
          ) : (
            "Fund"
          )}
        </Button>
      </div>

      <Button className="w-full h-12 text-base" onClick={handleDeposit}>
        <Download className="h-5 w-5 mr-2" />
        Shield {tier.label}
      </Button>
    </div>
  );
}

/* ── Claim Tab ─────────────────────────────────────────────── */

function ClaimTab({ initialClaim }: { initialClaim?: ClaimPayload | null }) {
  const [step, setStep] = useState<ClaimStep>("paste");
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
      const { isConnected, requestAccess } = await import("@stellar/freighter-api");
      const connected = await isConnected();
      if (!connected) throw new Error("Freighter wallet not found");
      const addr = await requestAccess();
      const address = typeof addr === "string" ? addr : (addr as { address: string }).address;
      setWalletAddress(address);

      const result = await executeWithdraw(
        noteString,
        address,
        (s) => setProgress(s),
        poolId || undefined
      );

      setTxHash(result.txHash);

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
        // Non-fatal
      }

      setStep("choice");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Withdrawal failed");
      setStep("paste");
    }
  };

  const handleOffRamp = async () => {
    setError("");
    setProgress("Submitting off-ramp...");

    try {
      const parts = noteString.split("-");
      const rawAmount = BigInt(parts[3] || "0");
      const displayAmount = Number(rawAmount) / 1e7;

      const result = await rampProvider.offRamp({
        amount: displayAmount,
        token: "USDC",
        targetCurrency: "NGN",
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

  // Banks from corridors
  const corridor = getCorridor("usd-ngn");
  const banks = corridor?.banks ?? [];

  return (
    <div className="space-y-5">
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-red-50 text-red-700 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Step: Paste note */}
      {step === "paste" && (
        <>
          <div className="rounded-xl border border-border/60 p-5 space-y-3">
            <label className="text-xs font-medium text-muted-foreground block">Secret Note</label>
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
        </>
      )}

      {/* Step: Withdrawing */}
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

      {/* Step: Choice — Hold or Off-ramp */}
      {step === "choice" && (
        <>
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
            onClick={() => setStep("success")}
            className="w-full text-left rounded-xl border border-border/60 p-5 hover:border-foreground/30 transition-colors bg-card"
          >
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                <Wallet className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <div className="font-semibold text-sm">Hold as USDC</div>
                <div className="text-xs text-muted-foreground">Keep funds in your Stellar wallet</div>
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
                <div className="text-xs text-muted-foreground">Convert to Naira and send to your bank</div>
              </div>
            </div>
          </button>
        </>
      )}

      {/* Step: Off-ramp form */}
      {step === "offramp" && (
        <>
          <button onClick={() => setStep("choice")} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
            <ArrowLeft className="h-3 w-3" /> Back
          </button>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Recipient Name</label>
              <input
                type="text"
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                placeholder="Full name on bank account"
                className="w-full h-11 rounded-lg border border-input bg-background px-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Account Number</label>
              <input
                type="text"
                value={recipientAccount}
                onChange={(e) => setRecipientAccount(e.target.value)}
                placeholder="10-digit bank account number"
                className="w-full h-11 rounded-lg border border-input bg-background px-4 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Bank</label>
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
        </>
      )}

      {/* Step: Success */}
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

          {viewingKey && (
            <div className="rounded-xl border border-border/60 p-5 space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Eye className="h-4 w-4" />
                Viewing Key
              </div>
              <div className="bg-muted rounded-lg p-3 text-xs font-mono break-all">{viewingKey}</div>
            </div>
          )}

          <Button asChild className="w-full">
            <Link href="/wallet">Back to Wallet</Link>
          </Button>
        </div>
      )}
    </div>
  );
}

/* ── Inner Page (uses useSearchParams) ─────────────────────── */

function ReceivePageInner() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>("deposit");
  const [claimPayload, setClaimPayload] = useState<ClaimPayload | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => { setReady(true); }, []);

  // Check for ?claim= on mount
  useEffect(() => {
    const claimParam = searchParams.get("claim");
    if (claimParam) {
      const payload = decodeClaimPayload(claimParam);
      if (payload) {
        setClaimPayload(payload);
        setTab("claim");
        window.history.replaceState({}, "", "/wallet/receive");
      }
    }
  }, [searchParams]);

  if (!ready) return <div className="min-h-screen" />;
  if (!isWalletInitialized() || !isUnlocked()) {
    return (
      <div className="max-w-lg mx-auto px-4 py-20 text-center">
        <p className="text-muted-foreground mb-4">Open your wallet first</p>
        <Button asChild><Link href="/wallet">Go to Wallet</Link></Button>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 lg:px-6 py-6 pb-24 lg:pb-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/wallet" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-lg font-semibold">Receive</h1>
      </div>

      {/* Tab toggle */}
      <div className="flex gap-1 p-1 rounded-xl bg-muted/50 mb-6">
        <button
          onClick={() => setTab("deposit")}
          className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            tab === "deposit"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Deposit
        </button>
        <button
          onClick={() => setTab("claim")}
          className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            tab === "claim"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Claim
        </button>
      </div>

      {tab === "deposit" && <DepositTab />}
      {tab === "claim" && <ClaimTab initialClaim={claimPayload} />}
    </div>
  );
}

/* ── Default Export (Suspense for useSearchParams) ─────────── */

export default function ReceivePage() {
  return (
    <AppShell>
      <Suspense fallback={
        <div className="max-w-lg mx-auto px-4 lg:px-6 py-12 text-center text-muted-foreground text-sm">
          Loading...
        </div>
      }>
        <ReceivePageInner />
      </Suspense>
    </AppShell>
  );
}
