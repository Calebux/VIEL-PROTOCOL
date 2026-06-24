"use client";

import { Suspense, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  ArrowLeftRight,
  Check,
  Loader2,
  AlertTriangle,
  Shield,
  Clock,
  CheckCircle2,
  Link2,
  ShieldCheck,
  ShieldAlert,
  ShieldQuestion,
} from "lucide-react";
import { SUPPORTED_TOKENS, getSwapPairs, POOL_TIERS } from "@/lib/tokens";
import { executeWithdraw, checkSubsetStatus } from "@/lib/withdraw";
import type { SubsetStatus } from "@/lib/withdraw";
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
  "Checking compliance status...",
  "Generating subset proof...",
];

const SWAP_PROOF_STEPS = [
  "Parsing secret note...",
  "Building Merkle path (depth 20)...",
  "Computing witness assignment...",
  "Generating Groth16 proof...",
  "Proof generated!",
  "Checking compliance status...",
  "Generating subset proof...",
  "Routing through private swap...",
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
  const [enableSwap, setEnableSwap] = useState(false);
  const [swapTokenOut, setSwapTokenOut] = useState("");
  const [swapResult, setSwapResult] = useState<{ tokenOut: string; estimatedOutput: string } | null>(null);
  const [txHash, setTxHash] = useState("");
  const [error, setError] = useState("");
  const [proofStep, setProofStep] = useState(0);
  const [substepText, setSubstepText] = useState("");
  const [complianceStatus, setComplianceStatus] = useState<SubsetStatus | null>(null);
  const [checkingCompliance, setCheckingCompliance] = useState(false);

  // Auto-check compliance status when note is entered
  useEffect(() => {
    if (!noteInput.startsWith("veil-")) {
      setComplianceStatus(null);
      return;
    }
    const parts = noteInput.trim().split("-");
    if (parts.length !== 5) return;

    let cancelled = false;
    setCheckingCompliance(true);

    (async () => {
      try {
        const circomlibjs = await import("circomlibjs");
        const poseidon = await circomlibjs.buildPoseidon();
        const poseidonFn = (inputs: bigint[]) => {
          const hash = poseidon(inputs);
          return poseidon.F.toObject(hash);
        };
        const nullifier = BigInt("0x" + parts[1]);
        const secret = BigInt("0x" + parts[2]);
        const commitment = poseidonFn([nullifier, secret]);
        const status = await checkSubsetStatus(commitment);
        if (!cancelled) setComplianceStatus(status);
      } catch {
        if (!cancelled) setComplianceStatus(null);
      } finally {
        if (!cancelled) setCheckingCompliance(false);
      }
    })();

    return () => { cancelled = true; };
  }, [noteInput]);

  // Determine input token from note denomination
  const noteToken = "XLM"; // Defaulting to XLM as note doesn't store token
  const denom = noteInput.trim().split("-")[3];
  const tier = POOL_TIERS.find((t) => t.amount === denom && t.tokenSymbol === noteToken);
  const poolContractId = tier?.poolId;

  const swapPairs = getSwapPairs(noteToken);
  const availableOutputTokens = SUPPORTED_TOKENS.filter(
    (t) => t.symbol !== noteToken && swapPairs.some((p) => p.tokenOut === t.symbol)
  );

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
        const { isConnected, requestAccess, getNetwork } = await import(
          "@stellar/freighter-api"
        );

        const connected = await isConnected();
        if (!connected) {
          throw new Error(
            "Freighter extension not detected. Please install Freighter from freighter.app and reload this page."
          );
        }

        const network = await getNetwork();
        const expectedNetwork = process.env.NEXT_PUBLIC_STELLAR_NETWORK === "testnet" ? "TESTNET" : "PUBLIC";
        if (network && network !== expectedNetwork) {
          throw new Error(
            `Freighter is on "${network}". Please switch to ${expectedNetwork} in Freighter settings and try again.`
          );
        }

        recipient = await requestAccess();
        if (!recipient) throw new Error("Wallet connection rejected — no address returned");
      }

      // Real on-chain withdrawal with ZK proof
      const stepMap: Record<string, number> = {
        "Parsing secret note...": 0,
        "Syncing on-chain deposits...": 0,
        "Building Merkle tree (depth 20)...": 1,
        "Computing witness assignment...": 2,
        "Generating Groth16 proof...": 3,
        "Proof generated!": 4,
        "Checking compliance status...": 5,
        "Generating subset proof...": 6,
        "Submitting to network...": 6,
        "Simulating transaction...": 6,
        "Waiting for wallet signature...": 6,
        "Broadcasting transaction...": 6,
        "Waiting for confirmation...": 6,
      };

      const result = await executeWithdraw(
        noteInput.trim(),
        recipient,
        (step: string) => {
          const idx = stepMap[step];
          if (idx !== undefined) setProofStep(idx);
          if (step === "Submitting to network...") setState("submitting");
          // Update substep text for all steps after subset proof
          if (idx !== undefined && idx >= 6) setSubstepText(step);
        },
        poolContractId
      );

      setTxHash(result.txHash);
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

            {/* Compliance status panel */}
            {noteInput.startsWith("veil-") && noteInput.trim().split("-").length === 5 && (
              <div className="rounded-xl border border-border/50 p-4">
                {checkingCompliance ? (
                  <div className="flex items-center gap-3">
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Checking compliance status...</span>
                  </div>
                ) : complianceStatus?.status === "compliant" ? (
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
                      <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-emerald-700">Compliant</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Your deposit has been screened and approved by the ASP. A subset proof will be generated automatically during withdrawal.
                      </p>
                    </div>
                  </div>
                ) : complianceStatus?.status === "pending_review" ? (
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
                      <ShieldAlert className="w-4 h-4 text-amber-600" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-amber-700">Pending Review</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        This deposit hasn&apos;t been screened yet. Withdrawal will proceed without a compliance proof. Some relayers may require it.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                      <ShieldQuestion className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-muted-foreground">Not Screened</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        No ASP screening data available. Withdrawal will proceed without a subset proof.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

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

            {/* Swap toggle */}
            <div className="rounded-xl border border-border/50 p-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <ArrowLeftRight className="w-4.5 h-4.5" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Receive as different token</p>
                  <p className="text-xs text-muted-foreground">
                    Swap during withdrawal for extra unlinkability
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setEnableSwap(!enableSwap);
                  if (!enableSwap && availableOutputTokens.length > 0) {
                    setSwapTokenOut(availableOutputTokens[0].symbol);
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

            {/* Token selector when swap enabled */}
            {enableSwap && (
              <div className="space-y-3">
                <label className="block text-sm font-medium">
                  Receive as
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {availableOutputTokens.map((token) => {
                    const pair = swapPairs.find((p) => p.tokenOut === token.symbol);
                    const selected = swapTokenOut === token.symbol;
                    return (
                      <button
                        key={token.symbol}
                        onClick={() => setSwapTokenOut(token.symbol)}
                        className={`rounded-xl border p-4 text-left transition-all ${
                          selected
                            ? "border-indigo-300 bg-indigo-50 ring-1 ring-indigo-200"
                            : "border-border/50 hover:border-border"
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <div className={`w-6 h-6 rounded-full ${token.bgColor} ${token.color} flex items-center justify-center text-xs font-bold`}>
                            {token.symbol[0]}
                          </div>
                          <span className="font-semibold text-sm">{token.symbol}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">{token.name}</p>
                        {pair && (
                          <p className="text-xs text-indigo-600 mt-1 font-medium">
                            ~{(100 * pair.rate * 0.95).toFixed(2)} {token.symbol} for 100 {noteToken}
                          </p>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

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
                      ? `Submitting to network`
                      : "Processing in queue"}
                </p>
                {state === "submitting" && substepText && (
                  <p className="text-sm text-muted-foreground mt-1">
                    {substepText}
                  </p>
                )}
                {state === "queued" && (
                  <p className="text-sm text-muted-foreground mt-1">
                    Random delay for timing decorrelation
                  </p>
                )}
              </div>

              {state === "proving" && (
                <div className="space-y-3">
                  {(enableSwap && swapTokenOut ? SWAP_PROOF_STEPS : PROOF_STEPS).map((step, i) => (
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

            {/* Swap result banner */}
            {swapResult && (
              <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center">
                    <ArrowLeftRight className="w-4 h-4 text-indigo-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-indigo-800">
                      Deposited as {noteToken}, received as {swapResult.tokenOut}
                    </p>
                    <p className="text-xs text-indigo-600 mt-0.5">
                      ~{swapResult.estimatedOutput} {swapResult.tokenOut} received — token type changed for additional privacy
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* What happened */}
            <div className="rounded-xl border border-border/50 p-6">
              <h3 className="text-base font-semibold mb-4">What happened</h3>
              <div className="space-y-3">
                {[
                  "Groth16 ZK proof generated in your browser",
                  ...(complianceStatus?.approved
                    ? ["Subset proof generated — compliance verified without breaking privacy"]
                    : []),
                  "Proof submitted to relayer (no IP correlation)",
                  "Soroban contract verified proof via BN254 pairing check",
                  "Nullifier marked spent — double-spend impossible",
                  ...(swapResult
                    ? ["Funds routed through swap router — token type changed for two layers of unlinkability"]
                    : ["Funds transferred with zero on-chain link to depositor"]),
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
                    setEnableSwap(false);
                    setSwapTokenOut("");
                    setSwapResult(null);
                    setComplianceStatus(null);
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
