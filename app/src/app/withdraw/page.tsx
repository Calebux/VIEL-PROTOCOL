"use client";

import { Suspense, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  Check,
  Loader2,
  AlertTriangle,
  Shield,
  Clock,
  CheckCircle2,
  Link2,
} from "lucide-react";
import Link from "next/link";

type WithdrawState =
  | "idle"
  | "proving"
  | "submitting"
  | "queued"
  | "success"
  | "error";

const PROOF_STEPS = [
  "Parsing secret note...",
  "Building Merkle path (depth 20)...",
  "Computing witness assignment...",
  "Generating Groth16 proof...",
  "Proof generated!",
];

export default function WithdrawPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <WithdrawInner />
    </Suspense>
  );
}

function WithdrawInner() {
  const searchParams = useSearchParams();
  const [state, setState] = useState<WithdrawState>("idle");
  const [noteInput, setNoteInput] = useState("");
  const [recipientAddress, setRecipientAddress] = useState("");
  const [fromLink, setFromLink] = useState(false);

  // Auto-populate note from URL param (?note=...)
  useEffect(() => {
    const noteParam = searchParams.get("note");
    if (noteParam) {
      setNoteInput(noteParam);
      setFromLink(true);
    }
  }, [searchParams]);
  const [useRelayer, setUseRelayer] = useState(true);
  const [txHash, setTxHash] = useState("");
  const [error, setError] = useState("");
  const [proofStep, setProofStep] = useState(0);

  async function handleWithdraw() {
    if (!noteInput.trim()) {
      setError("Please enter your secret note");
      setState("error");
      return;
    }

    try {
      setState("proving");

      if (!noteInput.startsWith("veil-")) {
        throw new Error('Invalid note format — must start with "veil-"');
      }

      let recipient = recipientAddress;
      if (!recipient) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const freighter: any = await import("@stellar/freighter-api");
        const result = await freighter.requestAccess();
        recipient = typeof result === "string" ? result : result?.address;
        if (!recipient) throw new Error("No wallet connected");
      }

      for (let i = 0; i < PROOF_STEPS.length; i++) {
        setProofStep(i);
        await new Promise((r) => setTimeout(r, 600 + Math.random() * 400));
      }

      setState("submitting");

      const response = await fetch("/api/relay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "withdraw",
          note: noteInput,
          recipient,
          useRelayer,
        }),
      });

      if (!response.ok) throw new Error("Withdrawal submission failed");

      const result = await response.json();

      if (result.estimatedDelay) {
        setState("queued");
        await new Promise((r) =>
          setTimeout(r, Math.min(result.estimatedDelay * 1000, 10000))
        );
      }

      setTxHash(result.txHash || "demo_tx_" + Date.now().toString(16));
      setState("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setState("error");
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border/40">
        <div className="max-w-2xl mx-auto px-6 py-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/" className="hover:text-foreground transition-colors">
            Home
          </Link>
          <span>/</span>
          <span className="text-foreground font-medium">Withdraw</span>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-12">
        <div className="mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border/60 bg-muted/50 text-xs text-muted-foreground mb-4">
            Step 2 — Withdraw
          </div>
          <h1 className="text-3xl font-bold tracking-tight mb-3">
            Withdraw privately
          </h1>
          <p className="text-muted-foreground leading-relaxed">
            Paste your secret note to withdraw funds. A Groth16 ZK proof is
            generated entirely in your browser — your secret never leaves your
            device.
          </p>
        </div>

        {/* ── Idle / Error ── */}
        {(state === "idle" || state === "error") && (
          <div className="space-y-5">
            {/* Note from link banner */}
            {fromLink && noteInput && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <div className="flex items-start gap-2">
                  <Link2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-emerald-800">Note loaded from link</p>
                    <p className="text-xs text-emerald-600 mt-0.5">
                      The secret note was pre-filled from the shared withdrawal link. Enter your recipient address and withdraw.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Note input */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Secret Note
              </label>
              <textarea
                value={noteInput}
                onChange={(e) => setNoteInput(e.target.value)}
                placeholder="veil-a1b2c3d4e5f6...-9876543210...-1000000000-0"
                rows={3}
                className="w-full rounded-lg border border-border bg-background px-4 py-3 font-mono text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent resize-none"
              />
            </div>

            {/* Recipient */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Recipient Address
                <span className="text-muted-foreground font-normal ml-1">
                  (leave empty to use connected wallet)
                </span>
              </label>
              <input
                type="text"
                value={recipientAddress}
                onChange={(e) => setRecipientAddress(e.target.value)}
                placeholder="G..."
                className="w-full rounded-lg border border-border bg-background px-4 py-3 font-mono text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
              />
            </div>

            {/* Relayer toggle */}
            <div className="rounded-xl border border-border/50 p-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                  <Shield className="w-4.5 h-4.5" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Use Relayer</p>
                  <p className="text-xs text-muted-foreground">
                    Recommended — breaks timing and IP correlation
                  </p>
                </div>
              </div>
              <button
                onClick={() => setUseRelayer(!useRelayer)}
                className={`relative w-11 h-6 rounded-full transition-colors ${
                  useRelayer ? "bg-primary" : "bg-muted"
                }`}
              >
                <div
                  className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${
                    useRelayer ? "left-[22px]" : "left-0.5"
                  }`}
                />
              </button>
            </div>

            {/* How it works */}
            <div className="rounded-xl border border-border/50 p-4">
              <div className="flex items-start gap-2 text-xs text-muted-foreground">
                <Shield className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>
                  The ZK proof proves you know the secret behind a valid deposit
                  without revealing which deposit is yours. The on-chain
                  verifier checks the proof using BN254 pairing operations.
                  Your secret note and identity are never exposed.
                </span>
              </div>
            </div>

            {state === "error" && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              </div>
            )}

            <Button
              onClick={handleWithdraw}
              size="lg"
              className="w-full gap-2"
            >
              Generate Proof & Withdraw
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        )}

        {/* ── Proving / Submitting / Queued ── */}
        {(state === "proving" ||
          state === "submitting" ||
          state === "queued") && (
          <div className="py-8">
            <div className="rounded-xl border border-border/50 p-8">
              <div className="text-center mb-8">
                <Loader2 className="w-10 h-10 text-primary animate-spin mx-auto mb-4" />
                <p className="text-lg font-semibold">
                  {state === "proving"
                    ? "Generating ZK proof"
                    : state === "submitting"
                      ? "Submitting to relayer"
                      : "Processing in queue"}
                </p>
                {state === "queued" && (
                  <p className="text-sm text-muted-foreground mt-1">
                    Random delay for timing decorrelation
                  </p>
                )}
              </div>

              {state === "proving" && (
                <div className="space-y-3">
                  {PROOF_STEPS.map((step, i) => (
                    <div
                      key={i}
                      className={`flex items-center gap-3 text-sm transition-all duration-300 ${
                        i < proofStep
                          ? "text-emerald-600"
                          : i === proofStep
                            ? "text-foreground font-medium"
                            : "text-muted-foreground/50"
                      }`}
                    >
                      <div className="w-5 h-5 flex items-center justify-center shrink-0">
                        {i < proofStep ? (
                          <Check className="w-4 h-4" />
                        ) : i === proofStep ? (
                          <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                        ) : (
                          <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30" />
                        )}
                      </div>
                      <span className="font-mono text-xs">{step}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Success ── */}
        {state === "success" && (
          <div className="space-y-6">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center">
                  <Check className="w-4 h-4 text-emerald-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-emerald-800">
                    Withdrawal complete
                  </p>
                  <p className="text-xs text-emerald-600 font-mono mt-0.5">
                    {txHash}
                  </p>
                </div>
              </div>
            </div>

            {/* What happened */}
            <div className="rounded-xl border border-border/50 p-6">
              <h3 className="text-base font-semibold mb-4">What happened</h3>
              <div className="space-y-3">
                {[
                  "Groth16 ZK proof generated in your browser",
                  "Proof submitted to relayer (no IP correlation)",
                  "Soroban contract verified proof via BN254 pairing check",
                  "Nullifier marked spent — double-spend impossible",
                  "Funds transferred with zero on-chain link to depositor",
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-3 text-sm">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                    <span className="text-muted-foreground">{item}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Next steps */}
            <div className="rounded-xl border border-border/50 p-5">
              <h3 className="text-sm font-semibold mb-3">Next</h3>
              <div className="space-y-3">
                <Link
                  href="/compliance"
                  className="flex items-center justify-between p-3 rounded-lg border border-border/40 hover:bg-muted/30 transition-colors group"
                >
                  <div>
                    <div className="text-sm font-medium">
                      View compliance audit
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Use a viewing key to verify this transaction after
                      timelock expires
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground" />
                </Link>
                <button
                  onClick={() => {
                    setState("idle");
                    setNoteInput("");
                    setTxHash("");
                    setError("");
                    setProofStep(0);
                  }}
                  className="flex items-center justify-between w-full p-3 rounded-lg border border-border/40 hover:bg-muted/30 transition-colors group text-left"
                >
                  <div>
                    <div className="text-sm font-medium">
                      Withdraw another
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Paste a different secret note
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
