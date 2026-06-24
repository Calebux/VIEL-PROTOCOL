"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  Shield,
  Clock,
  Zap,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import AppShell from "@/components/AppShell";
import {
  getCorridors,
  getCorridor,
  calculateRemittance,
  type Corridor,
  type RemittanceBreakdown,
} from "@/lib/corridors";
import rampProvider from "@/lib/ramp";

type Step = "corridor" | "amount" | "recipient" | "pipeline" | "executing" | "success";

interface PipelineStage {
  id: string;
  label: string;
  detail: string;
  real: boolean; // true = on-chain, false = simulated
  status: "pending" | "active" | "complete";
}

function buildPipeline(corridor: Corridor): PipelineStage[] {
  return [
    {
      id: "onramp",
      label: "On-ramp",
      detail: `Convert ${corridor.from.currency} to USDC via ${corridor.anchorIn}`,
      real: false,
      status: "pending",
    },
    {
      id: "deposit",
      label: "Deposit to Shield",
      detail: "USDC enters the Veil privacy pool",
      real: true,
      status: "pending",
    },
    {
      id: "shielded",
      label: "Shielded Transfer",
      detail: "Funds in privacy pool — sender and recipient unlinkable",
      real: true,
      status: "pending",
    },
    {
      id: "unshield",
      label: "Unshield + Convert",
      detail: "ZK proof generation + currency conversion",
      real: true,
      status: "pending",
    },
    {
      id: "offramp",
      label: "Off-ramp",
      detail: `Convert to ${corridor.to.currency} and deliver via ${corridor.anchorOut}`,
      real: false,
      status: "pending",
    },
  ];
}

/* ── Corridor Card ───────────────────────────────────────── */

function CorridorCard({
  corridor,
  onClick,
}: {
  corridor: Corridor;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-xl border border-border/60 p-5 hover:border-foreground/30 transition-colors bg-card group"
    >
      <div className="flex items-center gap-3 mb-3">
        <span className="text-2xl">{corridor.from.flag}</span>
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
        <span className="text-2xl">{corridor.to.flag}</span>
      </div>
      <div className="text-sm font-semibold mb-1">
        {corridor.from.currency} → {corridor.to.currency}
      </div>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span>1 {corridor.from.currency} = {corridor.rate} {corridor.to.currency}</span>
        <span>·</span>
        <span>{corridor.feePct}% fee</span>
        <span>·</span>
        <span className="flex items-center gap-0.5">
          <Clock className="h-3 w-3" /> ~{corridor.estimatedMinutes}m
        </span>
      </div>
    </button>
  );
}

/* ── Pipeline Stage Row ──────────────────────────────────── */

function StageRow({
  stage,
  isLast,
  showBoundary,
}: {
  stage: PipelineStage;
  isLast: boolean;
  showBoundary: "before" | "after" | null;
}) {
  return (
    <>
      {showBoundary === "before" && <PrivacyBoundary />}
      <div className="flex gap-3">
        {/* Timeline dot + line */}
        <div className="flex flex-col items-center">
          <div
            className={`h-7 w-7 rounded-full flex items-center justify-center shrink-0 ${
              stage.status === "complete"
                ? "bg-emerald-100 text-emerald-600"
                : stage.status === "active"
                ? "bg-foreground text-background"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {stage.status === "complete" ? (
              <Check className="h-3.5 w-3.5" />
            ) : stage.status === "active" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <div className="h-2 w-2 rounded-full bg-current opacity-40" />
            )}
          </div>
          {!isLast && (
            <div className="w-px flex-1 bg-border/60 my-1" />
          )}
        </div>

        {/* Content */}
        <div className="pb-5 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`text-sm font-medium ${
                stage.status === "pending" ? "text-muted-foreground" : "text-foreground"
              }`}
            >
              {stage.label}
            </span>
            {stage.real ? (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-medium">
                on-chain
              </span>
            ) : (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">
                simulated
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{stage.detail}</p>
        </div>
      </div>
      {showBoundary === "after" && <PrivacyBoundary />}
    </>
  );
}

function PrivacyBoundary() {
  return (
    <div className="flex items-center gap-2 py-2 pl-3">
      <div className="flex-1 border-t border-dashed border-emerald-400/50" />
      <span className="text-[10px] text-emerald-600 font-medium flex items-center gap-1 shrink-0">
        <Shield className="h-3 w-3" /> privacy boundary
      </span>
      <div className="flex-1 border-t border-dashed border-emerald-400/50" />
    </div>
  );
}

/* ── Main Page ───────────────────────────────────────────── */

export default function RemitPage() {
  const corridors = getCorridors();
  const [step, setStep] = useState<Step>("corridor");
  const [selectedCorridor, setSelectedCorridor] = useState<Corridor | null>(null);
  const [amount, setAmount] = useState("100");
  const [breakdown, setBreakdown] = useState<RemittanceBreakdown | null>(null);
  const [pipeline, setPipeline] = useState<PipelineStage[]>([]);
  const [txHash, setTxHash] = useState("");
  const [error, setError] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [recipientName, setRecipientName] = useState("");
  const [recipientAccount, setRecipientAccount] = useState("");
  const [recipientBank, setRecipientBank] = useState("");

  const selectCorridor = (c: Corridor) => {
    setSelectedCorridor(c);
    setBreakdown(calculateRemittance(c.id, parseFloat(amount) || 100));
    setStep("amount");
  };

  const updateAmount = (val: string) => {
    setAmount(val);
    if (selectedCorridor) {
      setBreakdown(calculateRemittance(selectedCorridor.id, parseFloat(val) || 0));
    }
  };

  const goToRecipient = () => {
    if (!selectedCorridor) return;
    setStep("recipient");
  };

  const goToPipeline = () => {
    if (!selectedCorridor) return;
    setPipeline(buildPipeline(selectedCorridor));
    setStep("pipeline");
  };

  const execute = async () => {
    if (!selectedCorridor || !breakdown) return;
    setStep("executing");
    setError("");
    const start = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);

    const stages = buildPipeline(selectedCorridor);

    try {
      for (let i = 0; i < stages.length; i++) {
        stages[i].status = "active";
        setPipeline([...stages]);

        if (stages[i].real) {
          // Simulate real on-chain step (in production, call actual deposit/proof)
          await new Promise((r) => setTimeout(r, 2000 + Math.random() * 1000));
        } else {
          // Simulated ramp step
          if (stages[i].id === "onramp") {
            await rampProvider.onRamp({
              amount: breakdown.senderAmount,
              currency: selectedCorridor.from.currency,
              targetToken: "USDC",
            });
          } else if (stages[i].id === "offramp") {
            await rampProvider.offRamp({
              amount: breakdown.receiveAmount,
              token: "USDC",
              targetCurrency: selectedCorridor.to.currency,
              recipient: recipientAccount || "demo-recipient",
              recipientName: recipientName || undefined,
              bankCode: recipientBank || undefined,
            });
          }
        }

        stages[i].status = "complete";
        setPipeline([...stages]);
      }

      clearInterval(timer);
      setElapsed(Math.floor((Date.now() - start) / 1000));
      setTxHash(`sim_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`);
      setStep("success");
    } catch (err: unknown) {
      clearInterval(timer);
      setError(err instanceof Error ? err.message : "Transfer failed");
      setStep("pipeline");
    }
  };

  return (
    <AppShell>
      <div className="max-w-lg mx-auto px-4 lg:px-6 py-6 pb-24 lg:pb-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          {step === "executing" ? (
            <span className="text-muted-foreground/40 cursor-not-allowed">
              <ArrowLeft className="h-5 w-5" />
            </span>
          ) : (
            <Link
              href={step === "corridor" ? "/wallet" : "#"}
              onClick={(e) => {
                if (step === "amount") { e.preventDefault(); setStep("corridor"); }
                else if (step === "recipient") { e.preventDefault(); setStep("amount"); }
                else if (step === "pipeline") { e.preventDefault(); setStep("recipient"); }
                else if (step === "success") { e.preventDefault(); setStep("corridor"); setSelectedCorridor(null); setBreakdown(null); setAmount("100"); setElapsed(0); setRecipientName(""); setRecipientAccount(""); setRecipientBank(""); }
              }}
              className="text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
          )}
          <div>
            <h1 className="text-lg font-semibold">Private Remittance</h1>
            <p className="text-xs text-muted-foreground">
              Cross-border transfers with ZK privacy
            </p>
          </div>
        </div>

        {/* Step 1: Corridor Selection */}
        {step === "corridor" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground mb-4">
              Select a corridor to send money privately across borders.
            </p>
            {corridors.map((c) => (
              <CorridorCard key={c.id} corridor={c} onClick={() => selectCorridor(c)} />
            ))}
          </div>
        )}

        {/* Step 2: Amount Entry */}
        {step === "amount" && selectedCorridor && (
          <div className="space-y-5">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="text-lg">{selectedCorridor.from.flag}</span>
              {selectedCorridor.from.currency}
              <ArrowRight className="h-3.5 w-3.5" />
              <span className="text-lg">{selectedCorridor.to.flag}</span>
              {selectedCorridor.to.currency}
            </div>

            {/* Amount input */}
            <div className="rounded-xl border border-border/60 p-5">
              <label className="text-xs font-medium text-muted-foreground block mb-2">
                You send ({selectedCorridor.from.currency})
              </label>
              <input
                type="number"
                value={amount}
                onChange={(e) => updateAmount(e.target.value)}
                className="w-full text-3xl font-bold bg-transparent focus:outline-none"
                min="1"
              />
            </div>

            {/* Breakdown */}
            {breakdown && (
              <div className="rounded-xl border border-border/60 p-5 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Exchange rate</span>
                  <span>1 {selectedCorridor.from.currency} = {breakdown.exchangeRate} {breakdown.receiveCurrency}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Fee ({selectedCorridor.feePct}%)</span>
                  <span>-{breakdown.fee} {selectedCorridor.from.currency}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Network fee</span>
                  <span>-{breakdown.networkFee} {selectedCorridor.from.currency}</span>
                </div>
                <div className="border-t border-border/40 pt-3 flex justify-between">
                  <span className="text-sm font-medium">Recipient receives</span>
                  <span className="text-lg font-bold">
                    {breakdown.receiveAmount.toLocaleString()} {breakdown.receiveCurrency}
                  </span>
                </div>

                {/* Path visualization */}
                <div className="mt-3 pt-3 border-t border-border/40">
                  <div className="text-xs text-muted-foreground mb-2">Transfer path</div>
                  <div className="flex items-center gap-1.5 text-xs font-mono flex-wrap">
                    <span className="px-2 py-1 rounded bg-muted">{breakdown.senderAmount} {selectedCorridor.from.currency}</span>
                    <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                    <span className="px-2 py-1 rounded bg-blue-50 text-blue-700">{breakdown.netAmount} USDC</span>
                    <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                    <span className="px-2 py-1 rounded bg-emerald-50 text-emerald-700 flex items-center gap-1">
                      <Shield className="h-3 w-3" /> shield
                    </span>
                    <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                    <span className="px-2 py-1 rounded bg-emerald-50 text-emerald-700">unshield</span>
                    <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                    <span className="px-2 py-1 rounded bg-muted">{breakdown.receiveAmount.toLocaleString()} {breakdown.receiveCurrency}</span>
                  </div>
                </div>
              </div>
            )}

            <Button className="w-full" onClick={goToRecipient} disabled={!breakdown || breakdown.senderAmount <= 0}>
              Continue
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        )}

        {/* Step 3: Recipient Details */}
        {step === "recipient" && selectedCorridor && breakdown && (
          <div className="space-y-5">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="text-lg">{selectedCorridor.to.flag}</span>
              Recipient receives {breakdown.receiveAmount.toLocaleString()} {breakdown.receiveCurrency}
            </div>

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
                  placeholder="Bank account or mobile money number"
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
                  {selectedCorridor.to.currency === "NGN" && (
                    <>
                      <option value="044">Access Bank</option>
                      <option value="063">Diamond (Access)</option>
                      <option value="050">Ecobank</option>
                      <option value="070">Fidelity Bank</option>
                      <option value="011">First Bank</option>
                      <option value="058">GTBank</option>
                      <option value="030">Heritage Bank</option>
                      <option value="301">Jaiz Bank</option>
                      <option value="082">Keystone Bank</option>
                      <option value="526">Kuda Bank</option>
                      <option value="100004">Opay</option>
                      <option value="100002">Paga</option>
                      <option value="999991">PalmPay</option>
                      <option value="076">Polaris Bank</option>
                      <option value="101">Providus Bank</option>
                      <option value="125">Rubies Bank</option>
                      <option value="039">Stanbic IBTC</option>
                      <option value="232">Sterling Bank</option>
                      <option value="032">Union Bank</option>
                      <option value="033">UBA</option>
                      <option value="215">Unity Bank</option>
                      <option value="035">Wema Bank</option>
                      <option value="057">Zenith Bank</option>
                    </>
                  )}
                  {selectedCorridor.to.currency === "MXN" && (
                    <>
                      <option value="BBVA">BBVA Mexico</option>
                      <option value="BANAMEX">Banamex</option>
                      <option value="SANTANDER">Santander Mexico</option>
                      <option value="BANORTE">Banorte</option>
                    </>
                  )}
                  {selectedCorridor.to.currency === "PHP" && (
                    <>
                      <option value="BDO">BDO Unibank</option>
                      <option value="BPI">BPI</option>
                      <option value="GCASH">GCash</option>
                      <option value="MAYA">Maya</option>
                    </>
                  )}
                  {selectedCorridor.to.currency === "KES" && (
                    <>
                      <option value="MPESA">M-Pesa</option>
                      <option value="EQUITY">Equity Bank</option>
                      <option value="KCB">KCB</option>
                    </>
                  )}
                </select>
              </div>
            </div>

            {/* Summary */}
            <div className="rounded-lg bg-muted/40 p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Sending</span>
                <span className="font-medium">{breakdown.senderAmount} {selectedCorridor.from.currency}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">They receive</span>
                <span className="font-semibold">{breakdown.receiveAmount.toLocaleString()} {breakdown.receiveCurrency}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Fee</span>
                <span>{breakdown.fee} {selectedCorridor.from.currency}</span>
              </div>
            </div>

            <Button
              className="w-full"
              onClick={goToPipeline}
              disabled={!recipientName || !recipientAccount || !recipientBank}
            >
              Review Transfer
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        )}

        {/* Step 4: Pipeline Preview */}
        {step === "pipeline" && selectedCorridor && (
          <div className="space-y-5">
            <div className="rounded-xl border border-border/60 p-5">
              <h3 className="text-sm font-semibold mb-4">Privacy Pipeline</h3>
              {pipeline.map((stage, i) => (
                <StageRow
                  key={stage.id}
                  stage={stage}
                  isLast={i === pipeline.length - 1}
                  showBoundary={
                    stage.id === "deposit" ? "before" :
                    stage.id === "offramp" ? "before" :
                    null
                  }
                />
              ))}
            </div>

            {error && (
              <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-red-50 text-red-700 text-sm">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            <Button className="w-full" onClick={execute}>
              <Zap className="h-4 w-4 mr-2" />
              Start Transfer
            </Button>
          </div>
        )}

        {/* Step 4: Executing */}
        {step === "executing" && selectedCorridor && (
          <div className="space-y-5">
            <div className="text-center mb-4">
              <div className="text-sm text-muted-foreground">
                Transfer in progress... <span className="font-mono">{elapsed}s</span>
              </div>
            </div>
            <div className="rounded-xl border border-border/60 p-5">
              {pipeline.map((stage, i) => (
                <StageRow
                  key={stage.id}
                  stage={stage}
                  isLast={i === pipeline.length - 1}
                  showBoundary={
                    stage.id === "deposit" ? "before" :
                    stage.id === "offramp" ? "before" :
                    null
                  }
                />
              ))}
            </div>
          </div>
        )}

        {/* Step 5: Success */}
        {step === "success" && selectedCorridor && breakdown && (
          <div className="py-8 space-y-6">
            <div className="text-center">
              <div className="h-16 w-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
                <Check className="h-8 w-8 text-emerald-600" />
              </div>
              <h2 className="text-xl font-semibold">Transfer Complete</h2>
              <p className="text-sm text-muted-foreground mt-1">
                {breakdown.receiveAmount.toLocaleString()} {breakdown.receiveCurrency} delivered privately
              </p>
            </div>

            {/* Completed pipeline */}
            <div className="rounded-xl border border-border/60 p-5">
              {pipeline.map((stage, i) => (
                <StageRow
                  key={stage.id}
                  stage={{ ...stage, status: "complete" }}
                  isLast={i === pipeline.length - 1}
                  showBoundary={
                    stage.id === "deposit" ? "before" :
                    stage.id === "offramp" ? "before" :
                    null
                  }
                />
              ))}
            </div>

            {/* Summary */}
            <div className="rounded-xl border border-border/60 p-5 space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Sent</span>
                <span className="font-medium">{breakdown.senderAmount} {selectedCorridor.from.currency}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Received</span>
                <span className="font-semibold">{breakdown.receiveAmount.toLocaleString()} {breakdown.receiveCurrency}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Rate</span>
                <span>1:{breakdown.exchangeRate}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Time</span>
                <span>{elapsed}s</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tx</span>
                <span className="font-mono text-xs">{txHash}</span>
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setStep("corridor");
                  setSelectedCorridor(null);
                  setBreakdown(null);
                  setAmount("100");
                  setElapsed(0);
                }}
              >
                New Transfer
              </Button>
              <Button asChild className="flex-1">
                <Link href="/wallet">Back to Wallet</Link>
              </Button>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
