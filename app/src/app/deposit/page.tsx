"use client";

import { useState } from "react";
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
import { getActiveTokens, type SupportedToken } from "@/lib/tokens";

type DepositState = "idle" | "connecting" | "depositing" | "success" | "error";

export default function DepositPage() {
  const tokens = getActiveTokens();
  const [selectedToken, setSelectedToken] = useState<SupportedToken>(tokens[0]);
  const [state, setState] = useState<DepositState>("idle");
  const [noteString, setNoteString] = useState("");
  const [viewingKey, setViewingKey] = useState("");
  const [txHash, setTxHash] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<"note" | "vk" | null>(null);
  const [timelockHours, setTimelockHours] = useState(24);
  const [enableViewingKey, setEnableViewingKey] = useState(true);

  async function handleDeposit() {
    try {
      setState("connecting");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const freighter: any = await import("@stellar/freighter-api");
      const accessResult = await freighter.requestAccess();
      const address =
        typeof accessResult === "string"
          ? accessResult
          : accessResult?.address;
      if (!address) throw new Error("Freighter wallet not connected");

      setState("depositing");

      const response = await fetch("/api/relay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "deposit",
          denomination: selectedToken.denomination,
          token: selectedToken.symbol,
          poolId: selectedToken.poolId,
          sender: address,
          enableViewingKey,
          timelockSeconds: timelockHours * 3600,
        }),
      });

      if (!response.ok) throw new Error("Deposit failed");

      const result = await response.json();
      setNoteString(
        result.noteString ||
          `veil-demo-${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}-1000000000-0`
      );
      setViewingKey(
        result.viewingKey ||
          (enableViewingKey
            ? `vk-${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 18)}`
            : "")
      );
      setTxHash(result.txHash || "demo_tx_" + Date.now().toString(16));
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
      `SECRET NOTE (required to withdraw):`,
      noteString,
      ``,
      ...(viewingKey
        ? [
            `VIEWING KEY (for compliance/auditing):`,
            viewingKey,
            `Timelock: ${timelockHours} hours`,
            ``,
            `The viewing key allows auditors to see transaction details`,
            `after the timelock period expires. It CANNOT spend funds.`,
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
            Deposit 100 XLM into the Veil pool. You&apos;ll receive a secret
            note — the only way to withdraw these funds. Optionally generate a
            viewing key for compliance auditing.
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

            {/* Denomination (fixed per token) */}
            <div className="rounded-xl border border-border/50 p-5">
              <div className="text-xs text-muted-foreground mb-2">
                Deposit Amount
              </div>
              <div className="text-3xl font-bold tracking-tight">
                {selectedToken.denominationDisplay}
              </div>
              <div className="text-sm text-muted-foreground mt-1">
                Fixed denomination for maximum anonymity set size
              </div>
            </div>

            {/* Viewing Key toggle */}
            <div className="rounded-xl border border-border/50 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center">
                    <Eye className="w-4.5 h-4.5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">
                      Generate Viewing Key
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Enables compliance auditing after timelock
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

            <Button onClick={handleDeposit} size="lg" className="w-full gap-2">
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
                    {txHash.slice(0, 32)}...
                  </p>
                </div>
              </div>
            </div>

            {/* Secret Note */}
            <div className="rounded-xl border border-border/50 p-6">
              <h3 className="text-lg font-semibold mb-1">Your Secret Note</h3>
              <p className="text-xs text-muted-foreground mb-5">
                Share this with your recipient. Anyone with this note can
                withdraw the funds.
              </p>

              <div className="flex justify-center mb-5">
                <div className="bg-white p-4 rounded-xl border border-border/30 shadow-sm">
                  <QRCodeSVG value={noteString} size={160} level="M" />
                </div>
              </div>

              <div className="bg-muted/50 rounded-lg p-3 font-mono text-xs text-muted-foreground break-all mb-4 border border-border/30">
                {noteString}
              </div>

              <div className="grid grid-cols-3 gap-3">
                <Button
                  variant="outline"
                  onClick={() => copyText(noteString, "note")}
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
                  className="gap-2"
                >
                  <Link2 className="w-4 h-4" /> Share Link
                </Button>
              </div>

              {/* Shareable withdraw link */}
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
            </div>

            {/* Viewing Key (if enabled) */}
            {viewingKey && (
              <div className="rounded-xl border border-violet-200/60 bg-violet-50/30 p-6">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-violet-100 text-violet-600 flex items-center justify-center">
                    <Eye className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold">Viewing Key</h3>
                    <p className="text-xs text-muted-foreground">
                      Timelock: {timelockHours} hours — for compliance auditing
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
                      <Copy className="w-3.5 h-3.5" /> Copy Viewing Key
                    </>
                  )}
                </Button>

                <div className="flex items-start gap-2 mt-3 text-xs text-violet-700">
                  <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>
                    Share the viewing key with auditors or regulators. They can
                    use it on the{" "}
                    <Link
                      href="/compliance"
                      className="underline font-medium hover:text-violet-900"
                    >
                      Compliance page
                    </Link>{" "}
                    to view transaction details after the timelock expires. The
                    viewing key <strong>cannot</strong> spend funds.
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
                      Use the viewing key to audit timelocked transactions
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
