"use client";

import { useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  Copy,
  Check,
  Download,
  AlertTriangle,
  Loader2,
  Eye,
  Clock,
  Info,
  Link2,
  Coins,
} from "lucide-react";
import Link from "next/link";
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

type DepositState = "idle" | "connecting" | "depositing" | "success" | "error";

const FRIENDBOT_URL = "https://friendbot.stellar.org";

interface CompletedDeposit {
  result: DepositResult;
  tier: PoolTier;
}

export default function DepositPage() {
  const tokens = getActiveTokens();
  const [selectedToken, setSelectedToken] = useState<SupportedToken>(tokens[0]);
  const tiers = getPoolTiers(selectedToken.symbol);
  const [selectedTier, setSelectedTier] = useState<PoolTier>(tiers[0]);
  const [amountInput, setAmountInput] = useState("");
  const [state, setState] = useState<DepositState>("idle");
  const [noteString, setNoteString] = useState("");
  const [completedDeposits, setCompletedDeposits] = useState<CompletedDeposit[]>([]);
  const [viewingKey, setViewingKey] = useState("");
  const [txHash, setTxHash] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<"note" | "vk" | null>(null);
  const [timelockHours, setTimelockHours] = useState(24);
  const [enableViewingKey, setEnableViewingKey] = useState(true);
  const [fundingStatus, setFundingStatus] = useState<"idle" | "funding" | "funded" | "error">("idle");
  const [fundingError, setFundingError] = useState("");

  useEffect(() => {
    const nextTiers = getPoolTiers(selectedToken.symbol);
    if (nextTiers.length > 0) {
      setSelectedTier(nextTiers[0]);
      setAmountInput(formatTokenAmount(BigInt(nextTiers[0].amount), selectedToken.decimals, ""));
    }
  }, [selectedToken.symbol, selectedToken.decimals]);

  useEffect(() => {
    if (!amountInput && selectedTier) {
      setAmountInput(formatTokenAmount(BigInt(selectedTier.amount), selectedToken.decimals, ""));
    }
  }, [amountInput, selectedTier, selectedToken.decimals]);

  const amountRaw = useMemo(
    () => parseTokenAmount(amountInput, selectedToken.decimals),
    [amountInput, selectedToken.decimals]
  );
  const amountBreakdown: PoolAmountBreakdown | null = useMemo(
    () => (amountRaw && amountRaw > 0n ? decomposePoolAmount(amountRaw, tiers) : null),
    [amountRaw, tiers]
  );
  const canDeposit = !!amountBreakdown && amountBreakdown.remainderRaw === 0n && amountBreakdown.splits.length > 0;
  const totalDeposits = amountBreakdown?.splits.reduce((sum, split) => sum + split.count, 0) ?? 0;
  const breakdownText = amountBreakdown?.splits.map((split) => `${split.count}x ${split.tier.label}`).join(" + ");
  const totalCompletedRaw = completedDeposits.reduce((sum, deposit) => sum + BigInt(deposit.tier.amount), 0n);
  const completedAmountLabel = formatTokenAmount(totalCompletedRaw, selectedToken.decimals, selectedToken.symbol);
  const notesBundle = completedDeposits
    .map((deposit, index) => [
      `Note ${index + 1}: ${deposit.tier.label}`,
      `Pool: ${deposit.tier.poolId}`,
      `Tx: ${deposit.result.txHash}`,
      deposit.result.noteString,
    ].join("\n"))
    .join("\n\n");

  /** Connect Freighter, check it's installed, ensure testnet, return address. */
  async function connectFreighter(): Promise<string> {
    const { isConnected, requestAccess, getNetwork } = await import(
      "@stellar/freighter-api"
    );

    const connected = await isConnected();
    if (!connected) {
      throw new Error(
        "Freighter extension not detected. Please install Freighter from freighter.app and reload this page."
      );
    }

    // Check network — warn if not on correct network
    const network = await getNetwork();
    const expectedNetwork = process.env.NEXT_PUBLIC_STELLAR_NETWORK === "testnet" ? "TESTNET" : "PUBLIC";
    if (network && network !== expectedNetwork) {
      throw new Error(
        `Freighter is on "${network}". Please switch to ${expectedNetwork} in Freighter settings and try again.`
      );
    }

    const address = await requestAccess();
    if (!address) throw new Error("Wallet connection rejected — no address returned");

    return address;
  }

  async function handleGetTestXLM() {
    try {
      setFundingStatus("funding");
      const address = await connectFreighter();

      const res = await fetch(`${FRIENDBOT_URL}?addr=${address}`);
      if (!res.ok) {
        const text = await res.text();
        if (text.includes("createAccountAlreadyExist")) {
          // Account already exists — already funded
          setFundingStatus("funded");
          return;
        }
        throw new Error("Friendbot request failed — try again in a moment");
      }
      setFundingStatus("funded");
    } catch (err) {
      setFundingError(err instanceof Error ? err.message : "Failed to fund");
      setFundingStatus("error");
    }
  }

  async function handleDeposit() {
    try {
      setState("connecting");

      const address = await connectFreighter();

      setState("depositing");

      if (!canDeposit || !amountBreakdown) {
        throw new Error("Enter an amount that can be split across the available pool tiers.");
      }

      const deposits: CompletedDeposit[] = [];
      for (const split of amountBreakdown.splits) {
        for (let i = 0; i < split.count; i += 1) {
          const result = await executeDeposit(
            address,
            BigInt(split.tier.amount),
            split.tier.poolId
          );
          deposits.push({ result, tier: split.tier });
        }
      }

      setCompletedDeposits(deposits);
      setNoteString(deposits[0]?.result.noteString ?? "");
      setTxHash(deposits[0]?.result.txHash ?? "");

      // Generate viewing key if enabled (client-side only — not on-chain)
      if (enableViewingKey) {
        const vkBuf = new Uint8Array(16);
        crypto.getRandomValues(vkBuf);
        const vkHex = Array.from(vkBuf)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
        setViewingKey(`vk-${vkHex}`);
      }

      setState("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setState("error");
    }
  }

  function copyText(text: string, type: "note" | "vk") {
    navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  }

  function downloadNote() {
    const content = [
      `Veil Protocol — Secret Note`,
      `Generated: ${new Date().toISOString()}`,
      ``,
      completedDeposits.length > 1
        ? `SECRET NOTES (required to withdraw all funds):`
        : `SECRET NOTE (required to withdraw):`,
      completedDeposits.length > 1 ? notesBundle : noteString,
      ``,
      ...(viewingKey
        ? [
            `REVEAL KEY (for selective disclosure):`,
            viewingKey,
            `Timelock: ${timelockHours} hours`,
            ``,
            `The reveal key allows authorized reviewers to inspect disclosed`,
            `details after the timelock period expires. It CANNOT spend funds.`,
          ]
        : []),
      ``,
      `WARNING: Anyone with the secret note can withdraw your funds.`,
      `Store it securely.`,
    ].join("\n");

    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "veil-note.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Top nav breadcrumb */}
      <div className="border-b border-border/40">
        <div className="max-w-2xl mx-auto px-6 py-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/" className="hover:text-foreground transition-colors">
            Home
          </Link>
          <span>/</span>
          <span className="text-foreground font-medium">Deposit</span>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-12">
        <div className="mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border/60 bg-muted/50 text-xs text-muted-foreground mb-4">
            Step 1 — Deposit
          </div>
          <h1 className="text-3xl font-bold tracking-tight mb-3">
            Deposit into the shielded pool
          </h1>
          <p className="text-muted-foreground leading-relaxed">
            Deposit into the Veil shielded pool. You&apos;ll receive a secret
            note — the only way to withdraw these funds. Optionally generate a
            reveal key for selective disclosure.
          </p>
        </div>

        {/* ── Idle state ── */}
        {state === "idle" && (
          <div className="space-y-6">
            {/* Token selector */}
            {tokens.length > 1 && (
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-2">
                  Select Token
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {tokens.map((t) => (
                    <button
                      key={t.symbol}
                      onClick={() => setSelectedToken(t)}
                      className={`flex items-center gap-3 p-4 rounded-xl border transition-all ${
                        selectedToken.symbol === t.symbol
                          ? "border-primary bg-primary/5 shadow-sm"
                          : "border-border/50 hover:border-border"
                      }`}
                    >
                      <div className={`w-9 h-9 rounded-full ${t.bgColor} ${t.color} flex items-center justify-center font-bold text-sm`}>
                        {t.symbol === "XLM" ? "✦" : "$"}
                      </div>
                      <div className="text-left">
                        <div className="text-sm font-semibold">{t.symbol}</div>
                        <div className="text-xs text-muted-foreground">{t.name}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Denomination selector */}
            <div className="rounded-xl border border-border/50 p-5">
              <div className="text-xs text-muted-foreground mb-2">
                Deposit Amount
              </div>
              <div className="grid grid-cols-2 gap-2 mb-2">
                {tiers.map((t) => (
                  <button
                    key={t.amount}
                    onClick={() => {
                      setSelectedTier(t);
                      setAmountInput(formatTokenAmount(BigInt(t.amount), selectedToken.decimals, ""));
                    }}
                    className={`py-3 rounded-xl border text-sm font-semibold transition-colors ${
                      selectedTier.amount === t.amount
                        ? "border-primary bg-primary/5 shadow-sm"
                        : "border-border/50 hover:border-border text-muted-foreground"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <label className="block text-xs font-medium text-muted-foreground mb-2">
                Custom amount
              </label>
              <input
                inputMode="decimal"
                value={amountInput}
                onChange={(event) => setAmountInput(event.target.value)}
                placeholder={`Amount in ${selectedToken.symbol}`}
                className="w-full h-11 rounded-lg border border-input bg-background px-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <div className="text-sm text-muted-foreground mt-3 min-h-10">
                {amountInput && !amountRaw && "Enter a valid amount."}
                {amountBreakdown && amountBreakdown.remainderRaw > 0n && (
                  <span>
                    Available pools cover {formatTokenAmount(amountBreakdown.coveredRaw, selectedToken.decimals, selectedToken.symbol)}.
                    {" "}Uncovered: {formatTokenAmount(amountBreakdown.remainderRaw, selectedToken.decimals, selectedToken.symbol)}.
                  </span>
                )}
                {canDeposit && (
                  <span>
                    Split into {breakdownText}. {totalDeposits > 1 ? `${totalDeposits} deposits will be signed.` : "1 deposit will be signed."}
                  </span>
                )}
              </div>
            </div>

            {/* Reveal Key toggle */}
            <div className="rounded-xl border border-border/50 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center">
                    <Eye className="w-4.5 h-4.5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">
                      Generate Reveal Key
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Enables selective disclosure after timelock
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setEnableViewingKey(!enableViewingKey)}
                  className={`relative w-11 h-6 rounded-full transition-colors ${
                    enableViewingKey ? "bg-primary" : "bg-muted"
                  }`}
                >
                  <div
                    className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${
                      enableViewingKey ? "left-[22px]" : "left-0.5"
                    }`}
                  />
                </button>
              </div>

              {enableViewingKey && (
                <div className="pt-2 border-t border-border/30 space-y-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-2">
                      Timelock Duration
                    </label>
                    <div className="grid grid-cols-4 gap-2">
                      {[6, 12, 24, 72].map((h) => (
                        <button
                          key={h}
                          onClick={() => setTimelockHours(h)}
                          className={`py-2 rounded-lg text-sm font-medium transition-colors ${
                            timelockHours === h
                              ? "bg-primary text-primary-foreground"
                              : "border border-border/50 text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {h}h
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-start gap-2 text-xs text-muted-foreground">
                    <Clock className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <span>
                      Transaction details will be hidden for {timelockHours}{" "}
                      hours after deposit. After that, anyone with the viewing
                      key can see the amount, timestamp, and leaf index — but
                      cannot spend funds.
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Important info */}
            <div className="rounded-xl border border-amber-200/60 bg-amber-50/50 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                <div className="space-y-1 text-sm text-amber-800">
                  <p className="font-medium">Before you deposit</p>
                  <ul className="list-disc ml-4 space-y-0.5 text-amber-700 text-xs">
                    <li>
                      A Poseidon commitment is added to the on-chain Merkle tree
                    </li>
                    <li>
                      You&apos;ll receive a secret note — the{" "}
                      <strong>only way</strong> to withdraw
                    </li>
                    <li>If the note is lost, funds cannot be recovered</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Get Test XLM — only show on testnet */}
            {process.env.NEXT_PUBLIC_STELLAR_NETWORK === "testnet" && (
            <div className="rounded-xl border border-blue-200/60 bg-blue-50/30 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center">
                    <Coins className="w-4.5 h-4.5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">Need test tokens?</p>
                    <p className="text-xs text-muted-foreground">
                      Get free testnet XLM from Stellar Friendbot
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleGetTestXLM}
                  disabled={fundingStatus === "funding" || fundingStatus === "funded"}
                  className="gap-2 shrink-0"
                >
                  {fundingStatus === "funding" ? (
                    <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Funding...</>
                  ) : fundingStatus === "funded" ? (
                    <><Check className="w-3.5 h-3.5" /> Funded</>
                  ) : (
                    <><Coins className="w-3.5 h-3.5" /> Get Test XLM</>
                  )}
                </Button>
              </div>
              {fundingStatus === "error" && (
                <p className="text-xs text-red-600 mt-2">{fundingError}</p>
              )}
              {fundingStatus === "funded" && (
                <p className="text-xs text-emerald-600 mt-2">10,000 testnet XLM funded to your wallet!</p>
              )}
            </div>
            )}

            <Button onClick={handleDeposit} size="lg" className="w-full gap-2" disabled={!canDeposit}>
              Connect Wallet & Deposit
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        )}

        {/* ── Loading state ── */}
        {(state === "connecting" || state === "depositing") && (
          <div className="text-center py-20">
            <Loader2 className="w-10 h-10 text-primary animate-spin mx-auto mb-4" />
            <p className="text-lg font-semibold mb-1">
              {state === "connecting"
                ? "Connecting wallet"
                : "Processing deposit"}
            </p>
            <p className="text-sm text-muted-foreground">
              {state === "connecting"
                ? "Approve the connection in Freighter..."
                : totalDeposits > 1
                  ? `Generating commitments and submitting ${totalDeposits} deposits...`
                  : "Generating commitment and submitting transaction..."}
            </p>
          </div>
        )}

        {/* ── Success state ── */}
        {state === "success" && (
          <div className="space-y-6">
            {/* Success banner */}
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center">
                  <Check className="w-4 h-4 text-emerald-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-emerald-800">
                    Deposit successful
                  </p>
                  <p className="text-xs text-emerald-600 font-mono mt-0.5">
                    {completedDeposits.length > 1
                      ? `${completedDeposits.length} deposits for ${completedAmountLabel}`
                      : `${txHash.slice(0, 32)}...`}
                  </p>
                </div>
              </div>
            </div>

            {/* Secret Note */}
            <div className="rounded-xl border border-border/50 p-6">
              <h3 className="text-lg font-semibold mb-1">
                {completedDeposits.length > 1 ? "Your Secret Notes" : "Your Secret Note"}
              </h3>
              <p className="text-xs text-muted-foreground mb-5">
                Share {completedDeposits.length > 1 ? "these with your recipient" : "this with your recipient"}.
                Anyone with {completedDeposits.length > 1 ? "these notes can withdraw the funds." : "this note can withdraw the funds."}
              </p>

              {completedDeposits.length <= 1 ? (
                <div className="flex justify-center mb-5">
                  <div className="bg-white p-4 rounded-xl border border-border/30 shadow-sm">
                    <QRCodeSVG value={noteString} size={160} level="M" />
                  </div>
                </div>
              ) : null}

              <div className="bg-muted/50 rounded-lg p-3 font-mono text-xs text-muted-foreground break-all mb-4 border border-border/30">
                {completedDeposits.length > 1 ? notesBundle : noteString}
              </div>

              <div className="grid grid-cols-3 gap-3">
                <Button
                  variant="outline"
                  onClick={() => copyText(completedDeposits.length > 1 ? notesBundle : noteString, "note")}
                  className="gap-2"
                >
                  {copied === "note" ? (
                    <>
                      <Check className="w-4 h-4" /> Copied
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" /> Copy
                    </>
                  )}
                </Button>
                <Button variant="outline" onClick={downloadNote} className="gap-2">
                  <Download className="w-4 h-4" /> Save
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    const link = `${window.location.origin}/withdraw?note=${encodeURIComponent(noteString)}`;
                    copyText(link, "note");
                  }}
                  disabled={completedDeposits.length > 1}
                  className="gap-2"
                >
                  <Link2 className="w-4 h-4" /> Share Link
                </Button>
              </div>

              {/* Shareable withdraw link */}
              {completedDeposits.length <= 1 ? (
                <div className="mt-4 rounded-lg border border-blue-200/60 bg-blue-50/30 p-3">
                <div className="flex items-start gap-2 text-xs text-blue-700 mb-2">
                  <Link2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span className="font-medium">Shareable withdrawal link</span>
                </div>
                <div className="bg-white/60 rounded px-3 py-2 font-mono text-[11px] text-muted-foreground break-all border border-blue-200/40">
                  {typeof window !== "undefined"
                    ? `${window.location.origin}/withdraw?note=${encodeURIComponent(noteString)}`
                    : `/withdraw?note=${encodeURIComponent(noteString)}`}
                </div>
                <p className="text-[11px] text-blue-600 mt-2">
                  Send this link to your recipient — they just click it and withdraw. No copy-pasting needed.
                </p>
                </div>
              ) : (
                <div className="mt-4 rounded-lg border border-blue-200/60 bg-blue-50/30 p-3 text-[11px] text-blue-600">
                  Split deposits create multiple notes. Use Copy or Save and send the full bundle to the recipient.
                </div>
              )}
            </div>

            {/* Reveal Key (if enabled) */}
            {viewingKey && (
              <div className="rounded-xl border border-violet-200/60 bg-violet-50/30 p-6">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-violet-100 text-violet-600 flex items-center justify-center">
                    <Eye className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold">Reveal Key</h3>
                    <p className="text-xs text-muted-foreground">
                      Timelock: {timelockHours} hours — for selective disclosure
                    </p>
                  </div>
                </div>

                <div className="bg-white/60 rounded-lg p-3 font-mono text-xs text-muted-foreground break-all mb-3 border border-violet-200/40">
                  {viewingKey}
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyText(viewingKey, "vk")}
                  className="gap-2"
                >
                  {copied === "vk" ? (
                    <>
                      <Check className="w-3.5 h-3.5" /> Copied
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" /> Copy Reveal Key
                    </>
                  )}
                </Button>

                <div className="flex items-start gap-2 mt-3 text-xs text-violet-700">
                  <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>
                    Share the reveal key only with authorized reviewers. They can
                    use it on the{" "}
                    <Link
                      href="/compliance"
                      className="underline font-medium hover:text-violet-900"
                    >
                      Compliance page
                    </Link>{" "}
                    to inspect disclosed details after the timelock expires. The
                    reveal key <strong>cannot</strong> spend funds.
                  </span>
                </div>
              </div>
            )}

            {/* Next steps */}
            <div className="rounded-xl border border-border/50 p-5">
              <h3 className="text-sm font-semibold mb-3">What&apos;s next?</h3>
              <div className="space-y-3">
                <Link
                  href="/withdraw"
                  className="flex items-center justify-between p-3 rounded-lg border border-border/40 hover:bg-muted/30 transition-colors group"
                >
                  <div>
                    <div className="text-sm font-medium">
                      Withdraw funds
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Paste the secret note to generate a ZK proof and withdraw
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground" />
                </Link>
                <Link
                  href="/compliance"
                  className="flex items-center justify-between p-3 rounded-lg border border-border/40 hover:bg-muted/30 transition-colors group"
                >
                  <div>
                    <div className="text-sm font-medium">
                      Compliance dashboard
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Use the reveal key to inspect timelocked disclosures
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground" />
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* ── Error state ── */}
        {state === "error" && (
          <div className="space-y-4">
            <div className="rounded-xl border border-red-200 bg-red-50 p-4">
              <p className="text-sm font-medium text-red-800">Deposit failed</p>
              <p className="text-sm text-red-600 mt-1">{error}</p>
            </div>
            <Button
              variant="outline"
              onClick={() => setState("idle")}
              className="w-full"
            >
              Try Again
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
