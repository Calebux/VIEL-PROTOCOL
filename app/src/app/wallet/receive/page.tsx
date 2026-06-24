"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Download,
  Check,
  Loader2,
  AlertTriangle,
  Droplets,
  Wallet,
  Copy,
  QrCode,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import AppShell from "@/components/AppShell";
import {
  isWalletInitialized,
  isUnlocked,
  addNote,
} from "@/lib/noteStore";
import { getActiveTokens, getPoolTiers, type SupportedToken, type PoolTier } from "@/lib/tokens";
import { executeDeposit } from "@/lib/deposit";

type ReceiveState = "idle" | "connecting" | "depositing" | "success" | "error";

const FRIENDBOT_URL = "https://friendbot.stellar.org";

export default function ReceivePage() {
  const tokens = getActiveTokens();
  const [token, setToken] = useState<SupportedToken>(tokens[0]);
  const tiers = getPoolTiers(token.symbol);
  const [tier, setTier] = useState<PoolTier>(tiers[0]);
  const [state, setState] = useState<ReceiveState>("idle");
  const [error, setError] = useState("");
  const [txHash, setTxHash] = useState("");
  const [fundingStatus, setFundingStatus] = useState<"idle" | "funding" | "funded" | "error">("idle");
  const [address, setAddress] = useState("");
  const [copied, setCopied] = useState(false);
  const [showQR, setShowQR] = useState(false);

  const [ready, setReady] = useState(false);
  useEffect(() => { setReady(true); }, []);

  // Reset tier when token changes
  useEffect(() => {
    const newTiers = getPoolTiers(token.symbol);
    if (newTiers.length > 0) setTier(newTiers[0]);
  }, [token.symbol]);

  // Connect Freighter to get address on mount
  useEffect(() => {
    if (!ready || address) return;
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
  }, [ready, address]);

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

  const handleReceive = async () => {
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

      addNote({
        noteString: result.noteString,
        token: token.symbol,
        amountDisplay: tier.label,
        amountRaw: tier.amount,
        txHash: result.txHash,
      });

      setTxHash(result.txHash);
      setState("success");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Deposit failed");
      setState("error");
    }
  };

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
          <h1 className="text-lg font-semibold">Receive</h1>
        </div>

        {state === "idle" && (
          <div className="space-y-5">
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

            {/* Deposit from exchange / wallet */}
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
              <p className="text-xs text-muted-foreground mb-1">
                Deposit into the Veil privacy pool
              </p>
              <p className="text-[10px] text-muted-foreground/60">
                Note is automatically saved to your wallet
              </p>
            </div>

            {/* Friendbot (testnet only) */}
            <div className="rounded-xl border border-border/60 p-4 flex items-center gap-3">
              <Droplets className="h-5 w-5 text-blue-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">Need testnet funds?</div>
                <div className="text-xs text-muted-foreground">
                  Get free testnet XLM via Stellar Friendbot
                </div>
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

            <Button className="w-full h-12 text-base" onClick={handleReceive}>
              <Download className="h-5 w-5 mr-2" />
              Shield {tier.label}
            </Button>
          </div>
        )}

        {state === "connecting" && (
          <div className="py-16 text-center space-y-4">
            <Loader2 className="h-10 w-10 animate-spin mx-auto text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Connecting to Freighter...</p>
          </div>
        )}

        {state === "depositing" && (
          <div className="py-16 text-center space-y-4">
            <div className="relative mx-auto w-16 h-16">
              <div className="absolute inset-0 rounded-full border-2 border-emerald-200 animate-ping" />
              <div className="relative h-16 w-16 rounded-full bg-emerald-100 flex items-center justify-center">
                <Loader2 className="h-8 w-8 text-emerald-600 animate-spin" />
              </div>
            </div>
            <div>
              <p className="text-sm font-medium">Depositing to shielded pool...</p>
              <p className="text-xs text-muted-foreground mt-1">
                Sign the transaction in Freighter
              </p>
            </div>
          </div>
        )}

        {state === "success" && (
          <div className="py-12 text-center space-y-5">
            <div className="h-16 w-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
              <Check className="h-8 w-8 text-emerald-600" />
            </div>
            <div>
              <h2 className="text-xl font-semibold">
                {tier.label} shielded!
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Your shielded note was saved to the wallet
              </p>
            </div>
            <div className="rounded-lg bg-muted/50 px-4 py-3">
              <div className="text-xs text-muted-foreground mb-1">Transaction</div>
              <div className="text-xs font-mono break-all">{txHash}</div>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setState("idle")}>
                Receive More
              </Button>
              <Button asChild className="flex-1">
                <Link href="/wallet">
                  <Wallet className="h-4 w-4 mr-2" />
                  Wallet
                </Link>
              </Button>
            </div>
          </div>
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
            <Button onClick={() => setState("idle")} className="w-full">
              Try Again
            </Button>
          </div>
        )}
      </div>
    </AppShell>
  );
}
