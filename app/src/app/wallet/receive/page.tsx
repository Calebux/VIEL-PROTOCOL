"use client";

import { useState, useEffect, useMemo, Suspense } from "react";
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
  CreditCard,
  ExternalLink,
  Building2,
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
import {
  decomposePoolAmount,
  formatTokenAmount,
  getActiveTokens,
  getPoolTiers,
  parseTokenAmount,
  type PoolAmountBreakdown,
  type PoolTier,
  type SupportedToken,
} from "@/lib/tokens";
import { executeDeposit, type DepositResult } from "@/lib/deposit";
import { executeWithdraw } from "@/lib/withdraw";
import rampProvider from "@/lib/ramp";

/* ── Types ─────────────────────────────────────────────────── */

type Tab = "deposit" | "claim";
type DepositState = "idle" | "connecting" | "depositing" | "success";
type ClaimStep = "paste" | "withdrawing" | "choice" | "offramp" | "success";

interface ClaimPayload {
  note?: string;
  poolId?: string;
  notes?: { note: string; poolId: string }[];
}

interface BundledDeposit {
  result: DepositResult;
  tier: PoolTier;
}

/* ── Helpers ───────────────────────────────────────────────── */

function encodeClaimPayload(notes: { note: string; poolId: string }[]): string {
  if (notes.length === 1) {
    return btoa(JSON.stringify({ note: notes[0].note, poolId: notes[0].poolId }));
  }
  return btoa(JSON.stringify({ notes }));
}

function decodeClaimPayload(encoded: string): ClaimPayload | null {
  try {
    const data = JSON.parse(atob(encoded));
    if (data.note && data.poolId) return data as ClaimPayload;
    if (
      Array.isArray(data.notes) &&
      data.notes.every((item: { note?: unknown; poolId?: unknown }) => (
        typeof item.note === "string" && typeof item.poolId === "string"
      ))
    ) {
      return data as ClaimPayload;
    }
    return null;
  } catch {
    return null;
  }
}

function claimPayloadItems(payload?: ClaimPayload | null): { note: string; poolId: string }[] {
  if (!payload) return [];
  if (payload.notes?.length) return payload.notes;
  if (payload.note && payload.poolId) return [{ note: payload.note, poolId: payload.poolId }];
  return [];
}

function parseNoteAmount(noteString: string): string {
  const raw = parseNoteRaw(noteString);
  if (raw === null) return "?";
  return formatTokenAmount(raw, 7, "USDC");
}

function parseNoteRaw(noteString: string): bigint | null {
  const parts = noteString.split("-");
  if (parts.length !== 5 || parts[0] !== "veil") return null;
  try {
    return BigInt(parts[3]);
  } catch {
    return null;
  }
}

function formatClaimItemsAmount(items: { note: string }[]): string {
  const totalRaw = items.reduce((sum, item) => sum + (parseNoteRaw(item.note) ?? 0n), 0n);
  return formatTokenAmount(totalRaw, 7, "USDC");
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
  const [amountInput, setAmountInput] = useState("");
  const [state, setState] = useState<DepositState>("idle");
  const [error, setError] = useState("");
  const [depositResults, setDepositResults] = useState<BundledDeposit[]>([]);
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
    if (newTiers.length > 0) {
      setTier(newTiers[0]);
      setAmountInput(formatTokenAmount(BigInt(newTiers[0].amount), token.decimals, "").trim());
    }
  }, [token.symbol]);

  useEffect(() => {
    if (!amountInput && tier) {
      setAmountInput(formatTokenAmount(BigInt(tier.amount), token.decimals, "").trim());
    }
  }, [amountInput, tier, token.decimals]);

  const amountRaw = useMemo(
    () => parseTokenAmount(amountInput, token.decimals),
    [amountInput, token.decimals]
  );
  const amountBreakdown: PoolAmountBreakdown | null = useMemo(
    () => (amountRaw && amountRaw > 0n ? decomposePoolAmount(amountRaw, tiers) : null),
    [amountRaw, tiers]
  );
  const canDeposit = !!amountBreakdown && amountBreakdown.remainderRaw === 0n && amountBreakdown.splits.length > 0;
  const totalDeposits = amountBreakdown?.splits.reduce((sum, split) => sum + split.count, 0) ?? 0;
  const breakdownText = amountBreakdown?.splits
    .map((split) => `${split.count}x ${split.tier.label}`)
    .join(" + ");

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
      const { isConnected, requestAccess } = await import("@stellar/freighter-api");
      const connected = await isConnected();
      if (!connected) throw new Error("Freighter not found. Install the Freighter wallet extension.");

      const addr = await requestAccess();
      setAddress(addr);

      setState("depositing");
      if (!canDeposit || !amountBreakdown) {
        throw new Error("Enter an amount that can be split across the available pool tiers.");
      }

      const bundledDeposits: BundledDeposit[] = [];
      let firstStoredId = "";

      for (const split of amountBreakdown.splits) {
        for (let i = 0; i < split.count; i += 1) {
          const result = await executeDeposit(addr, BigInt(split.tier.amount), split.tier.poolId);
          const stored = addNote({
            noteString: result.noteString,
            token: token.symbol,
            amountDisplay: split.tier.label,
            amountRaw: split.tier.amount,
            txHash: result.txHash,
          });
          if (!firstStoredId) firstStoredId = stored.id;
          bundledDeposits.push({ result, tier: split.tier });
        }
      }

      setDepositResults(bundledDeposits);

      // Generate share link
      const payload = encodeClaimPayload(
        bundledDeposits.map((deposit) => ({
          note: deposit.result.noteString,
          poolId: deposit.tier.poolId,
        }))
      );
      const link = `${window.location.origin}/wallet/receive?claim=${payload}`;
      setShareLink(link);

      // Generate viewing key
      if (firstStoredId) {
        const vk = generateViewingKey(firstStoredId, 24);
        setViewingKey(vk.viewingKey);
      }

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

  if (state === "success" && depositResults.length > 0) {
    const totalRaw = depositResults.reduce((sum, deposit) => sum + BigInt(deposit.tier.amount), 0n);
    const totalLabel = formatTokenAmount(totalRaw, token.decimals, token.symbol);
    const receiptRows = [
      ["Amount", totalLabel],
      ["Shielded notes", String(depositResults.length)],
      ["Network", "Stellar Mainnet"],
      ["Status", "Ready to claim"],
    ];
    return (
      <div className="py-8 space-y-5">
        <div className="text-center">
          <div className="h-16 w-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-3">
            <Check className="h-8 w-8 text-emerald-600" />
          </div>
          <h2 className="text-xl font-semibold">{totalLabel} shielded!</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {depositResults.length === 1
              ? "Your shielded note was saved to the wallet"
              : `${depositResults.length} shielded notes were saved to the wallet`}
          </p>
        </div>

        <div className="rounded-xl border border-border/60 bg-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold">Transfer receipt</h3>
              <p className="text-xs text-muted-foreground">Private payment is ready to share</p>
            </div>
            <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">
              Complete
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {receiptRows.map(([label, value]) => (
              <div key={label} className="rounded-lg bg-muted/45 px-3 py-2">
                <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
                <div className="mt-0.5 text-sm font-semibold">{value}</div>
              </div>
            ))}
          </div>
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground">Deposit transactions</div>
            {depositResults.map((deposit, index) => (
              <div key={`${deposit.result.txHash}-${index}`} className="flex items-center justify-between gap-3 rounded-lg bg-muted/35 px-3 py-2 text-xs">
                <span className="font-medium">{deposit.tier.label}</span>
                <span className="font-mono truncate text-muted-foreground">{deposit.result.txHash}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Share withdrawal link */}
        <div className="rounded-xl border border-border/60 p-5 space-y-3">
          <label className="text-xs font-medium text-muted-foreground">Claim link</label>
          <p className="text-xs text-muted-foreground">
            Send this link to your recipient so they can claim the full transfer.
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
            This claim link contains the secret needed to withdraw funds. Anyone with this link can
            claim the transfer. Share it through a secure channel.
          </span>
        </div>

        {/* Reveal key */}
        {viewingKey && (
          <div className="rounded-xl border border-border/60 p-5 space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Eye className="h-4 w-4" />
              Transfer Receipt (Reveal Key)
            </div>
            <p className="text-xs text-muted-foreground">
              This key lets authorized reviewers verify disclosed transfer details without spending the funds.
            </p>
            <div className="bg-muted rounded-lg p-3 text-xs font-mono break-all">{viewingKey}</div>
          </div>
        )}

        <div className="flex gap-3">
          <Button variant="outline" className="flex-1" onClick={() => { setState("idle"); setDepositResults([]); setShareLink(""); setViewingKey(""); }}>
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
              onClick={() => {
                setTier(t);
                setAmountInput(formatTokenAmount(BigInt(t.amount), token.decimals, "").trim());
              }}
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

      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Custom amount</label>
        <input
          inputMode="decimal"
          value={amountInput}
          onChange={(event) => setAmountInput(event.target.value)}
          placeholder={`Amount in ${token.symbol}`}
          className="w-full h-11 rounded-lg border border-input bg-background px-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <div className="mt-2 min-h-10 text-xs text-muted-foreground">
          {amountInput && !amountRaw && "Enter a valid amount."}
          {amountBreakdown && amountBreakdown.remainderRaw > 0n && (
            <span>
              Available pools cover {formatTokenAmount(amountBreakdown.coveredRaw, token.decimals, token.symbol)}.
              {" "}Uncovered: {formatTokenAmount(amountBreakdown.remainderRaw, token.decimals, token.symbol)}.
            </span>
          )}
          {canDeposit && (
            <span>
              Split into {breakdownText}. {totalDeposits > 1 ? `${totalDeposits} deposits will be signed.` : "1 deposit will be signed."}
            </span>
          )}
        </div>
      </div>

      {/* ── Fund your wallet ── */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground block">Fund your wallet</label>

        {/* Buy crypto (external exchange) */}
        <div className="rounded-xl border border-border/60 overflow-hidden">
          <div className="p-4 bg-gradient-to-br from-blue-50/50 to-card">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-9 w-9 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                <CreditCard className="h-4.5 w-4.5 text-blue-600" />
              </div>
              <div>
                <div className="text-sm font-semibold">Buy crypto with card or bank</div>
                <p className="text-xs text-muted-foreground">
                  No crypto? Buy {token.symbol} directly with fiat
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <a
                href={address ? rampProvider.getOnRampUrl({
                  amount: amountRaw ? Number(amountRaw) / 1e7 : Number(BigInt(tier.amount)) / 1e7,
                  currency: "USD",
                  walletAddress: address,
                }) : "#"}
                target="_blank"
                rel="noopener noreferrer"
                onClick={async (e) => {
                  if (address) return;
                  e.preventDefault();
                  const { isConnected, requestAccess } = await import("@stellar/freighter-api");
                  const connected = await isConnected();
                  if (!connected) return;
                  const addr = await requestAccess();
                  setAddress(addr);
                  const url = rampProvider.getOnRampUrl({
                    amount: amountRaw ? Number(amountRaw) / 1e7 : Number(BigInt(tier.amount)) / 1e7,
                    currency: "USD",
                    walletAddress: addr,
                  });
                  window.open(url, "_blank");
                }}
                className="flex items-center justify-center gap-2 py-3 rounded-xl border border-border/60 text-sm font-medium hover:border-foreground/30 transition-colors bg-background"
              >
                <span className="text-blue-600 font-semibold">Coinbase</span>
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
              </a>
              <a
                href="https://www.moonpay.com/buy"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 py-3 rounded-xl border border-border/60 text-sm font-medium hover:border-foreground/30 transition-colors bg-background"
              >
                <span className="text-purple-600 font-semibold">MoonPay</span>
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
              </a>
            </div>
          </div>
          <div className="px-4 py-2.5 bg-muted/20 border-t border-border/40">
            <p className="text-[11px] text-muted-foreground text-center">
              Buy with debit card, credit card, Apple Pay, or bank transfer
            </p>
          </div>
        </div>

        {/* Send from exchange or wallet */}
        <div className="rounded-xl border border-border/60 overflow-hidden">
          <div className="p-4 bg-card">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-9 w-9 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                <Building2 className="h-4.5 w-4.5 text-emerald-600" />
              </div>
              <div>
                <div className="text-sm font-semibold">Send from exchange or wallet</div>
                <p className="text-xs text-muted-foreground">
                  Already have {token.symbol}? Send it to your address
                </p>
              </div>
            </div>

            {address ? (
              <>
                {showQR && (
                  <div className="mb-3 flex justify-center">
                    <div className="bg-white p-3 rounded-xl inline-block">
                      <QRCodeSVG value={address} size={160} />
                    </div>
                  </div>
                )}
                <div className="bg-muted/50 rounded-lg px-3 py-2.5 mb-3">
                  <div className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wider">Your Stellar Address</div>
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
                className="w-full"
                variant="outline"
                onClick={async () => {
                  const { isConnected, requestAccess } = await import("@stellar/freighter-api");
                  const connected = await isConnected();
                  if (!connected) return;
                  const addr = await requestAccess();
                  setAddress(addr);
                }}
              >
                <Wallet className="h-3.5 w-3.5 mr-1.5" />
                Connect Wallet to Show Address
              </Button>
            )}
          </div>
          <div className="px-4 py-2.5 bg-muted/20 border-t border-border/40">
            <p className="text-[11px] text-muted-foreground text-center">
              Send from Binance, Coinbase, Yellow Card, Luno, or any Stellar wallet
            </p>
          </div>
        </div>
      </div>

      {/* Shield into pool */}
      <div className="rounded-xl border border-emerald-200/60 bg-emerald-50/30 p-5 text-center">
        <Download className="h-8 w-8 text-emerald-600 mx-auto mb-2" />
        <div className="text-sm font-semibold mb-1">
          Shield {amountRaw ? formatTokenAmount(amountRaw, token.decimals, token.symbol) : tier.label}
        </div>
        <p className="text-xs text-muted-foreground mb-1">Deposit into the Veil privacy pool</p>
        <p className="text-[10px] text-muted-foreground/60">Note is automatically saved to your wallet</p>
      </div>

      <Button className="w-full h-12 text-base" onClick={handleDeposit} disabled={!canDeposit}>
        <Download className="h-5 w-5 mr-2" />
        Shield {amountRaw ? formatTokenAmount(amountRaw, token.decimals, token.symbol) : tier.label}
      </Button>
    </div>
  );
}

/* ── Claim Tab ─────────────────────────────────────────────── */

function ClaimTab({ initialClaim }: { initialClaim?: ClaimPayload | null }) {
  const initialItems = claimPayloadItems(initialClaim);
  const [step, setStep] = useState<ClaimStep>("paste");
  const [claimItems, setClaimItems] = useState<{ note: string; poolId: string }[]>(initialItems);
  const [noteString, setNoteString] = useState(initialItems[0]?.note || "");
  const [poolId, setPoolId] = useState(initialItems[0]?.poolId || "");
  const [walletAddress, setWalletAddress] = useState("");
  const [txHashes, setTxHashes] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");
  const [viewingKey, setViewingKey] = useState("");

  // Off-ramp state
  const [recipientName, setRecipientName] = useState("");
  const [recipientAccount, setRecipientAccount] = useState("");
  const [recipientBank, setRecipientBank] = useState("");
  const [offRampResult, setOffRampResult] = useState<{ txId: string; message?: string } | null>(null);

  useEffect(() => {
    const items = claimPayloadItems(initialClaim);
    if (items.length > 0) {
      setClaimItems(items);
      setNoteString(items[0].note);
      setPoolId(items[0].poolId);
    }
  }, [initialClaim]);

  const activeClaimItems = claimItems.length > 0
    ? claimItems
    : noteString && noteString.startsWith("veil-")
      ? [{ note: noteString, poolId }]
      : [];

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

      if (activeClaimItems.length === 0) {
        throw new Error("Enter a valid secret note.");
      }

      const completedTxHashes: string[] = [];
      for (let i = 0; i < activeClaimItems.length; i += 1) {
        const item = activeClaimItems[i];
        const result = await executeWithdraw(
          item.note,
          address,
          (s) => setProgress(activeClaimItems.length > 1 ? `Note ${i + 1}/${activeClaimItems.length}: ${s}` : s),
          item.poolId || undefined
        );

        completedTxHashes.push(result.txHash);

        try {
          const stored = addNote({
            noteString: item.note,
            token: "USDC",
            amountDisplay: parseNoteAmount(item.note),
            amountRaw: item.note.split("-")[3] || "0",
            txHash: result.txHash,
          });
          if (i === 0) {
            const vk = generateViewingKey(stored.id, 24);
            setViewingKey(vk.viewingKey);
          }
        } catch {
          // Non-fatal
        }
      }

      setTxHashes(completedTxHashes);

      setStep("choice");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Withdrawal failed");
      setStep("paste");
    }
  };

  const handleOffRamp = async () => {
    setError("");
    setProgress("Processing cash-out...");

    try {
      const rawAmount = activeClaimItems.reduce((sum, item) => sum + (parseNoteRaw(item.note) ?? 0n), 0n);
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
        setError(result.message || "Cash-out failed");
        return;
      }

      setOffRampResult({ txId: result.txId, message: result.message });
      setStep("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cash-out failed");
    }
  };

  // Banks for off-ramp cash out (NGN)
  const banks = [
    { code: "044", name: "Access Bank" }, { code: "050", name: "Ecobank" },
    { code: "070", name: "Fidelity Bank" }, { code: "011", name: "First Bank" },
    { code: "058", name: "GTBank" }, { code: "082", name: "Keystone Bank" },
    { code: "526", name: "Kuda Bank" }, { code: "100004", name: "Opay" },
    { code: "100002", name: "Paga" }, { code: "999991", name: "PalmPay" },
    { code: "076", name: "Polaris Bank" }, { code: "039", name: "Stanbic IBTC" },
    { code: "232", name: "Sterling Bank" }, { code: "032", name: "Union Bank" },
    { code: "033", name: "UBA" }, { code: "035", name: "Wema Bank" },
    { code: "057", name: "Zenith Bank" },
  ];

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
              onChange={(e) => {
                const nextNote = e.target.value.trim();
                setNoteString(nextNote);
                setClaimItems([]);
              }}
              placeholder="veil-abc123...-def456...-1000000000-0"
              rows={3}
              className="w-full rounded-lg border border-input bg-background px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
            {claimItems.length <= 1 && noteString && noteString.startsWith("veil-") && (
              <div className="flex items-center gap-2 text-sm">
                <Shield className="h-4 w-4 text-emerald-600" />
                <span className="font-medium">{parseNoteAmount(noteString)}</span>
                <span className="text-muted-foreground">shielded</span>
              </div>
            )}
            {claimItems.length > 1 && (
              <div className="flex items-center gap-2 text-sm">
                <Shield className="h-4 w-4 text-emerald-600" />
                <span className="font-medium">{formatClaimItemsAmount(claimItems)}</span>
                <span className="text-muted-foreground">across {claimItems.length} notes</span>
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
            disabled={activeClaimItems.length === 0}
          >
            <Download className="h-4 w-4 mr-2" />
            Connect Wallet & Withdraw{activeClaimItems.length > 1 ? ` ${activeClaimItems.length} Notes` : ""}
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
              {formatClaimItemsAmount(activeClaimItems)} now in your wallet
              {walletAddress && ` (${shortenAddress(walletAddress)})`}
            </p>
          </div>

          <div className="rounded-xl border border-border/60 bg-card p-5 space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Claimed amount</span>
              <span className="font-semibold">{formatClaimItemsAmount(activeClaimItems)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Shielded notes</span>
              <span className="font-medium">{activeClaimItems.length}</span>
            </div>
            {txHashes.length > 0 && (
              <div className="space-y-1.5">
                <span className="text-muted-foreground">Withdrawal transactions</span>
                {txHashes.map((hash, index) => (
                  <div key={`${hash}-${index}`} className="rounded-lg bg-muted/45 px-3 py-2 font-mono text-xs truncate">
                    {hash}
                  </div>
                ))}
              </div>
            )}
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
            className="w-full text-left rounded-xl border border-border/80 p-5 hover:border-foreground/30 transition-colors bg-card shadow-2xs"
          >
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-emerald-50 border border-emerald-200/60 flex items-center justify-center">
                <Building2 className="h-5 w-5 text-emerald-700" />
              </div>
              <div>
                <div className="font-semibold text-sm text-foreground">Private Cash Out to Bank Account</div>
                <div className="text-xs text-muted-foreground">Direct local fiat settlement with zero link to your public wallet</div>
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
            Cash Out to Bank
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
              {offRampResult ? "Cash-Out Submitted" : "Withdrawal Complete"}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {offRampResult
                ? "Your funds are being delivered to your bank account"
                : `${formatClaimItemsAmount(activeClaimItems)} is now in your wallet`}
            </p>
          </div>

          <div className="rounded-xl border border-border/60 bg-card p-5 space-y-4 text-sm">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold">Claim receipt</h3>
                <p className="text-xs text-muted-foreground">Private withdrawal completed</p>
              </div>
              <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">
                Settled
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-muted/45 px-3 py-2">
                <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Amount</div>
                <div className="mt-0.5 text-sm font-semibold">{formatClaimItemsAmount(activeClaimItems)}</div>
              </div>
              <div className="rounded-lg bg-muted/45 px-3 py-2">
                <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Notes</div>
                <div className="mt-0.5 text-sm font-semibold">{activeClaimItems.length}</div>
              </div>
            </div>
            {txHashes.length > 0 && (
              <div className="space-y-1">
                <span className="text-muted-foreground">Withdrawal transactions</span>
                {txHashes.map((hash, index) => (
                  <div key={`${hash}-${index}`} className="rounded-lg bg-muted/45 px-3 py-2 font-mono text-xs truncate">
                    {hash}
                  </div>
                ))}
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
                Reveal Key
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
