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
  Wallet,
  Copy,
  QrCode,
  Shield,
  Share2,
  Eye,
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
  getStellarAddress,
} from "@/lib/noteStore";
import {
  formatTokenAmount,
} from "@/lib/tokens";
import { executeWithdraw } from "@/lib/withdraw";
import rampProvider from "@/lib/ramp";

/* ── Types ─────────────────────────────────────────────────── */

type Tab = "deposit" | "claim";
type ClaimStep = "paste" | "withdrawing" | "choice" | "offramp" | "success";

interface ClaimPayload {
  note?: string;
  poolId?: string;
  notes?: { note: string; poolId: string }[];
}

/* ── Helpers ───────────────────────────────────────────────── */

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

/* ── Deposit Tab ───────────────────────────────────────────── */

function DepositTab() {
  const [address, setAddress] = useState("");
  const [copied, setCopied] = useState(false);
  const [showQR, setShowQR] = useState(false);

  useEffect(() => {
    if (address) return;
    const addr = getStellarAddress();
    if (addr) setAddress(addr);
  }, [address]);

  const copyAddress = () => {
    if (!address) return;
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-5">
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
                Send XLM or USDC to your Stellar address
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
              onClick={() => {
                const addr = getStellarAddress();
                if (addr) setAddress(addr);
              }}
            >
              <Wallet className="h-3.5 w-3.5 mr-1.5" />
              Show Address
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
    setProgress("Preparing withdrawal...");

    try {
      const addr = getStellarAddress();
      if (!addr) throw new Error("Wallet not initialized");
      const address = addr;
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
            Withdraw{activeClaimItems.length > 1 ? ` ${activeClaimItems.length} Notes` : ""}
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

  // Check for ?claim= or ?tab=claim on mount
  useEffect(() => {
    const claimParam = searchParams.get("claim");
    if (claimParam) {
      const payload = decodeClaimPayload(claimParam);
      if (payload) {
        setClaimPayload(payload);
        setTab("claim");
        window.history.replaceState({}, "", "/wallet/receive");
      }
    } else if (searchParams.get("tab") === "claim") {
      setTab("claim");
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
