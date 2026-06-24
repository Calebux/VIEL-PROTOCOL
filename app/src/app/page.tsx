"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  ArrowLeftRight,
  Sparkles,
  TrendingUp,
  ArrowUpRight,
  ArrowDownLeft,
  MoreHorizontal,
  Search,
  Bell,
  Shield,
  ShieldCheck,
  Eye,
  Zap,
  Lock,
  Users,
  CheckCircle2,
  ChevronRight,
  Activity,
  Globe,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

/* ── Navbar ─────────────────────────────────────────────────────────── */
function Navbar() {
  return (
    <nav className="w-full border-b border-border/40 bg-background/80 backdrop-blur-md z-50">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-sm">V</span>
            </div>
            <span className="text-lg font-semibold tracking-tight">Veil</span>
          </Link>
          <div className="hidden md:flex items-center gap-1">
            <NavLink href="#how-it-works">How It Works</NavLink>
            <NavLink href="#features">Features</NavLink>
            <NavLink href="#compliance">Compliance</NavLink>
            <NavLink href="/wallet">Wallet</NavLink>
            <NavLink href="/explorer">Proof Explorer</NavLink>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button size="sm" className="rounded-full px-5" asChild>
            <Link href="/wallet">Launch App</Link>
          </Button>
        </div>
      </div>
    </nav>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
    >
      {children}
    </Link>
  );
}

/* ── Dashboard Preview ──────────────────────────────────────────────── */
function DashboardPreview() {
  return (
    <div className="w-full max-w-5xl mx-auto rounded-xl border border-border/60 bg-card shadow-2xl shadow-black/5 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 bg-muted/30">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-400/80" />
            <div className="w-3 h-3 rounded-full bg-yellow-400/80" />
            <div className="w-3 h-3 rounded-full bg-green-400/80" />
          </div>
          <div className="hidden sm:flex items-center gap-1 ml-3 px-3 py-1 rounded-md bg-muted/60 text-xs text-muted-foreground">
            <Search className="w-3 h-3" />
            <span>Search transactions...</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-muted-foreground" />
          <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-semibold text-primary">
            V
          </div>
        </div>
      </div>

      <div className="flex">
        <div className="hidden md:flex flex-col w-48 border-r border-border/40 p-3 gap-1 bg-muted/10">
          <SidebarItem active>Wallet</SidebarItem>
          <SidebarItem>Send</SidebarItem>
          <SidebarItem>Receive</SidebarItem>
          <SidebarItem>Remit</SidebarItem>
          <SidebarItem>Compliance</SidebarItem>
          <SidebarItem>Explorer</SidebarItem>
        </div>

        <div className="flex-1 p-4 space-y-4 min-h-[320px]">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-lg border border-border/40 p-4 bg-background">
              <div className="text-xs text-muted-foreground mb-1">Shielded Balance</div>
              <div className="text-2xl font-bold tracking-tight">1,250.00 XLM</div>
              <div className="flex items-center gap-1 mt-1">
                <TrendingUp className="w-3 h-3 text-emerald-500" />
                <span className="text-xs text-emerald-500 font-medium">+12.5%</span>
                <span className="text-xs text-muted-foreground">this month</span>
              </div>
            </div>
            <div className="rounded-lg border border-border/40 p-4 bg-background">
              <div className="text-xs text-muted-foreground mb-1">Anonymity Set</div>
              <div className="text-2xl font-bold tracking-tight">2,847</div>
              <div className="flex items-center gap-1 mt-1">
                <Sparkles className="w-3 h-3 text-blue-500" />
                <span className="text-xs text-blue-500 font-medium">Strong privacy</span>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border/40 p-4 bg-background">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium">Pool Activity (7d)</span>
              <span className="text-xs text-muted-foreground">24 deposits</span>
            </div>
            <svg viewBox="0 0 400 80" className="w-full h-16" preserveAspectRatio="none">
              <defs>
                <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.15" />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d="M0 60 Q50 55, 80 45 T160 35 T240 40 T320 25 T400 20 L400 80 L0 80 Z" fill="url(#chartGrad)" />
              <path d="M0 60 Q50 55, 80 45 T160 35 T240 40 T320 25 T400 20" fill="none" stroke="hsl(var(--primary))" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>

          <div className="rounded-lg border border-border/40 bg-background">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/30">
              <span className="text-xs font-medium">Recent Transactions</span>
              <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="divide-y divide-border/30">
              <TxRow type="deposit" amount="+100.00 XLM" time="2m ago" status="confirmed" />
              <TxRow type="withdraw" amount="-50.00 XLM" time="45m ago" status="confirmed" />
              <TxRow type="swap" amount="100 USD → 1,709 MXN" time="1h ago" status="confirmed" />
              <TxRow type="deposit" amount="+100.00 XLM" time="3h ago" status="confirmed" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SidebarItem({ children, active }: { children: React.ReactNode; active?: boolean }) {
  return (
    <div className={`px-3 py-1.5 rounded-md text-xs font-medium cursor-default transition-colors ${active ? "bg-primary/5 text-foreground" : "text-muted-foreground"}`}>
      {children}
    </div>
  );
}

function TxRow({ type, amount, time, status }: { type: "deposit" | "withdraw" | "swap"; amount: string; time: string; status: string }) {
  const styles = {
    deposit: { bg: "bg-emerald-50 text-emerald-600", icon: <ArrowDownLeft className="w-3.5 h-3.5" />, amountColor: "text-emerald-600" },
    withdraw: { bg: "bg-orange-50 text-orange-600", icon: <ArrowUpRight className="w-3.5 h-3.5" />, amountColor: "text-foreground" },
    swap: { bg: "bg-indigo-50 text-indigo-600", icon: <ArrowLeftRight className="w-3.5 h-3.5" />, amountColor: "text-indigo-600" },
  };
  const s = styles[type];
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <div className="flex items-center gap-3">
        <div className={`w-7 h-7 rounded-full flex items-center justify-center ${s.bg}`}>
          {s.icon}
        </div>
        <div>
          <div className="text-xs font-medium capitalize">{type === "swap" ? "remittance" : type === "deposit" ? "received" : "sent"}</div>
          <div className="text-[10px] text-muted-foreground">{time}</div>
        </div>
      </div>
      <div className="text-right">
        <div className={`text-xs font-medium ${s.amountColor}`}>{amount}</div>
        <div className={`text-[10px] capitalize ${status === "confirmed" ? "text-muted-foreground" : "text-yellow-600"}`}>{status}</div>
      </div>
    </div>
  );
}

/* ── Fade-in wrapper ────────────────────────────────────────────────── */
function FadeIn({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.5, delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/* ── Main Page ──────────────────────────────────────────────────────── */
export default function Home() {
  const [stats, setStats] = useState({ depositCount: 0, denominationXLM: 0, lastRoot: "", network: "" });

  useEffect(() => {
    fetch("/api/tree")
      .then((r) => r.json())
      .then((data) => setStats({
        depositCount: data.depositCount || data.leafCount || 0,
        denominationXLM: data.denominationXLM || 100,
        lastRoot: data.lastRoot || "0",
        network: data.network || "testnet",
      }))
      .catch(() => {});
  }, []);

  return (
    <>
      <Navbar />

      <main>
        {/* ─── Hero ─── */}
        <section className="relative flex flex-col items-center justify-center px-6 pt-24 pb-20">
          <div className="absolute inset-0 -z-10 overflow-hidden">
            {/* Animated mesh gradient background */}
            <div
              className="absolute -top-1/2 -left-1/2 w-[200%] h-[200%]"
              style={{
                background:
                  "conic-gradient(from 0deg at 50% 50%, rgba(99,102,241,0.12) 0deg, rgba(168,85,247,0.10) 60deg, rgba(236,72,153,0.08) 120deg, rgba(59,130,246,0.10) 180deg, rgba(16,185,129,0.08) 240deg, rgba(99,102,241,0.12) 360deg)",
                animation: "spin 25s linear infinite",
              }}
            />
            {/* Radial orbs */}
            <div
              className="absolute top-0 right-1/4 w-[500px] h-[500px] rounded-full"
              style={{ background: "rgba(139,92,246,0.12)", filter: "blur(120px)", animation: "pulse 4s ease-in-out infinite" }}
            />
            <div
              className="absolute bottom-0 left-1/4 w-[400px] h-[400px] rounded-full"
              style={{ background: "rgba(59,130,246,0.10)", filter: "blur(100px)", animation: "pulse 6s ease-in-out infinite" }}
            />
            <div
              className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full"
              style={{ background: "rgba(16,185,129,0.08)", filter: "blur(140px)", animation: "pulse 5s ease-in-out infinite" }}
            />
            {/* Semi-transparent overlay to soften */}
            <div className="absolute inset-0" style={{ background: "hsla(0,0%,100%,0.5)" }} />
            {/* Dot grid */}
            <div
              className="absolute inset-0"
              style={{
                backgroundImage: "radial-gradient(circle, rgba(0,0,0,0.07) 1px, transparent 1px)",
                backgroundSize: "24px 24px",
              }}
            />
          </div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="mb-6">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-border/60 bg-muted/50 text-sm text-muted-foreground">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Live on Stellar Mainnet</span>
            </div>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-center text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold tracking-tighter leading-[0.95] mb-6 max-w-4xl"
          >
            <span className="font-body">Private transfers,</span>
            <br />
            <span className="font-display italic font-normal">Smarter</span>{" "}
            <span className="font-body">compliance</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="text-center text-base sm:text-lg text-muted-foreground max-w-2xl mb-10 leading-relaxed"
          >
            Veil is a shielded wallet and private remittance protocol on Stellar.
            Send, receive, and transfer across borders with zero on-chain link between
            sender and recipient. Your shielded wallet manages everything —
            powered by Groth16 zero-knowledge proofs verified directly on Soroban.
          </motion.p>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.3 }} className="flex items-center gap-3">
            <Button size="lg" className="rounded-full px-7 gap-2" asChild>
              <Link href="/wallet">
                Launch App
                <ArrowRight className="w-4 h-4" />
              </Link>
            </Button>
            <Button variant="outline" size="lg" className="rounded-full px-7 gap-2" asChild>
              <Link href="#how-it-works">
                Learn More
              </Link>
            </Button>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.5 }}
            className="mt-16 w-full"
          >
            <DashboardPreview />
          </motion.div>
        </section>

        {/* ─── What is Veil ─── */}
        <section className="px-6 py-24 max-w-4xl mx-auto">
          <FadeIn>
            <div className="text-center mb-6">
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
                What is Veil?
              </h2>
              <p className="text-muted-foreground text-base sm:text-lg leading-relaxed max-w-3xl mx-auto">
                On public blockchains, every transfer is visible — anyone can trace who sent what to whom.
                Veil breaks that link. When you deposit tokens into Veil, they enter a shielded pool.
                When someone withdraws, a zero-knowledge proof proves they have the right to withdraw
                without revealing which deposit is theirs. The result: <strong className="text-foreground">complete sender–recipient unlinkability
                with built-in compliance</strong>. Timelocked viewing keys ensure that authorized auditors
                can verify transaction history after a configurable period — giving you privacy today
                and accountability when it matters.
              </p>
            </div>
          </FadeIn>

          <FadeIn delay={0.1}>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mt-12">
              <div className="rounded-xl border border-border/50 p-5 text-center">
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  <Activity className="w-4 h-4 text-emerald-500" />
                  <div className="text-3xl font-bold tracking-tight">{stats.depositCount}</div>
                </div>
                <div className="text-sm text-muted-foreground">Total deposits</div>
              </div>
              <div className="rounded-xl border border-border/50 p-5 text-center">
                <div className="text-3xl font-bold tracking-tight mb-1">{stats.depositCount}</div>
                <div className="text-sm text-muted-foreground">Anonymity set size</div>
              </div>
              <div className="rounded-xl border border-border/50 p-5 text-center">
                <div className="text-3xl font-bold tracking-tight mb-1">8</div>
                <div className="text-sm text-muted-foreground">Privacy pools</div>
              </div>
              <div className="rounded-xl border border-border/50 p-5 text-center">
                <div className="text-3xl font-bold tracking-tight mb-1">Depth 20</div>
                <div className="text-sm text-muted-foreground">Merkle tree (1M+ slots)</div>
              </div>
            </div>
            {stats.network && (
              <div className="mt-4 text-center">
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Live from Stellar {stats.network}
                </span>
              </div>
            )}
          </FadeIn>
        </section>

        {/* ─── How It Works ─── */}
        <section id="how-it-works" className="px-6 py-24 bg-muted/30">
          <div className="max-w-5xl mx-auto">
            <FadeIn>
              <div className="text-center mb-16">
                <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">How It Works</h2>
                <p className="text-muted-foreground max-w-2xl mx-auto">
                  From receiving funds to sending privately across borders. No on-chain link between sender and recipient at any point.
                </p>
              </div>
            </FadeIn>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[
                {
                  step: "01",
                  title: "Open your shielded wallet",
                  desc: "Set up your Veil wallet with a PIN. Connect your Freighter wallet and receive funds — tokens enter the shielded pool with a Poseidon commitment added to the on-chain Merkle tree. Your wallet auto-saves the secret note.",
                  icon: <ArrowDownLeft className="w-5 h-5" />,
                  color: "text-emerald-600 bg-emerald-50",
                },
                {
                  step: "02",
                  title: "Send privately",
                  desc: "Enter a recipient address and amount. Your wallet auto-selects the right note, generates a Groth16 zero-knowledge proof entirely in the browser, and submits it on-chain — no manual note handling required.",
                  icon: <Lock className="w-5 h-5" />,
                  color: "text-blue-600 bg-blue-50",
                },
                {
                  step: "03",
                  title: "Send across borders",
                  desc: "Choose a remittance corridor (USD→MXN, EUR→NGN, and more). Fiat on-ramps, shielded transfers through the Veil pool, and fiat off-ramps — all visualized in a real-time privacy pipeline.",
                  icon: <Globe className="w-5 h-5" />,
                  color: "text-violet-600 bg-violet-50",
                },
                {
                  step: "04",
                  title: "Stay compliant",
                  desc: "Every transaction runs an automatic Privacy Pools compliance check. Timelocked viewing keys let authorized auditors verify activity after a configurable period — privacy today, accountability when it matters.",
                  icon: <ShieldCheck className="w-5 h-5" />,
                  color: "text-orange-600 bg-orange-50",
                },
              ].map((item, i) => (
                <FadeIn key={item.step} delay={i * 0.1}>
                  <div className="rounded-xl border border-border/50 bg-background p-6 h-full">
                    <div className="flex items-center gap-3 mb-4">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${item.color}`}>
                        {item.icon}
                      </div>
                      <div>
                        <span className="text-xs font-mono text-muted-foreground">Step {item.step}</span>
                        <h3 className="text-lg font-semibold">{item.title}</h3>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
                  </div>
                </FadeIn>
              ))}
            </div>
          </div>
        </section>

        {/* ─── NEW: Private Swaps Highlight ─── */}
        <section className="px-6 py-12">
          <div className="max-w-5xl mx-auto">
            <FadeIn>
              <div className="relative rounded-2xl border border-indigo-200/60 bg-gradient-to-br from-indigo-50/80 via-white to-violet-50/50 p-8 sm:p-10 overflow-hidden">
                <div className="absolute top-4 right-4">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-600 text-white text-xs font-semibold">
                    NEW
                  </span>
                </div>
                <div className="flex flex-col sm:flex-row items-start gap-6">
                  <div className="w-14 h-14 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
                    <ArrowLeftRight className="w-7 h-7" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-2xl font-bold tracking-tight mb-2">Private DEX Swaps</h3>
                    <p className="text-muted-foreground leading-relaxed mb-4">
                      Deposit XLM, withdraw as USDC — or any supported token pair. The on-chain swap router
                      changes the token type during withdrawal, adding a second layer of unlinkability on top
                      of the ZK proof. Sender-recipient link broken <strong className="text-foreground">and</strong> token
                      type changed. Inspired by composable privacy on Starknet.
                    </p>
                    <Button size="sm" className="rounded-full px-6 gap-2 bg-indigo-600 hover:bg-indigo-700" asChild>
                      <Link href="/wallet/send">
                        Try Private Swap
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    </Button>
                  </div>
                </div>
              </div>
            </FadeIn>
          </div>
        </section>

        {/* ─── NEW: Private Remittance Highlight ─── */}
        <section className="px-6 py-12">
          <div className="max-w-5xl mx-auto">
            <FadeIn>
              <div className="relative rounded-2xl border border-emerald-200/60 bg-gradient-to-br from-emerald-50/80 via-white to-teal-50/50 p-8 sm:p-10 overflow-hidden">
                <div className="absolute top-4 right-4">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-600 text-white text-xs font-semibold">
                    NEW
                  </span>
                </div>
                <div className="flex flex-col sm:flex-row items-start gap-6">
                  <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                    <Globe className="w-7 h-7" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-2xl font-bold tracking-tight mb-2">Private Cross-Border Remittance</h3>
                    <p className="text-muted-foreground leading-relaxed mb-4">
                      Send money across borders with transfer amounts private throughout the pipeline.
                      Fiat on-ramp, shielded transfer through the Veil pool, fiat off-ramp — Stellar's
                      real payment rails, made confidential with zero-knowledge proofs.
                    </p>
                    <Button size="sm" className="rounded-full px-6 gap-2 bg-emerald-600 hover:bg-emerald-700" asChild>
                      <Link href="/remit">
                        Try Remittance
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    </Button>
                  </div>
                </div>
              </div>
            </FadeIn>
          </div>
        </section>

        {/* ─── Why Veil / Features ─── */}
        <section id="features" className="px-6 py-24">
          <div className="max-w-5xl mx-auto">
            <FadeIn>
              <div className="text-center mb-16">
                <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">Why Veil?</h2>
                <p className="text-muted-foreground max-w-2xl mx-auto">
                  Privacy without compromise. Real cryptography, real compliance tools, real on-chain verification.
                </p>
              </div>
            </FadeIn>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {[
                {
                  icon: <Shield className="w-5 h-5" />,
                  title: "Groth16 on Soroban",
                  desc: "Zero-knowledge proofs verified on-chain using Stellar's native BN254 host functions — g1_add, g1_mul, and multi_pairing_check. No off-chain trust assumptions.",
                },
                {
                  icon: <Zap className="w-5 h-5" />,
                  title: "Poseidon Hashing",
                  desc: "ZK-friendly Poseidon hash function over BN254 Fr for both the Circom circuits and the on-chain Merkle tree. Matching parameters ensure proof validity.",
                },
                {
                  icon: <Users className="w-5 h-5" />,
                  title: "Relayer Network",
                  desc: "Submit withdrawals through a relayer so the recipient doesn't need gas. Random delay queuing decorrelates timing between deposit and withdrawal.",
                },
                {
                  icon: <Eye className="w-5 h-5" />,
                  title: "Timelocked Viewing Keys",
                  desc: "Generate viewing keys that unlock transaction details after a configurable period. Regulators or auditors can verify activity without breaking real-time privacy.",
                },
                {
                  icon: <Lock className="w-5 h-5" />,
                  title: "Encrypted On-chain Memos",
                  desc: "Attach NaCl-encrypted notes to deposits, stored on-chain. Only the intended recipient can decrypt them — useful for payment references or messages.",
                },
                {
                  icon: <ArrowLeftRight className="w-5 h-5" />,
                  title: "Private DEX Swaps",
                  desc: "Withdraw as a different token via an on-chain swap router. Deposit XLM, receive USDC — two layers of unlinkability: sender-recipient link AND token type are both broken.",
                },
                {
                  icon: <ShieldCheck className="w-5 h-5" />,
                  title: "Privacy Pools",
                  desc: "Prove your funds are clean without revealing your identity. Based on Vitalik's Privacy Pools paper — compliance-ready privacy using subset membership proofs.",
                },
                {
                  icon: <Sparkles className="w-5 h-5" />,
                  title: "Client-side Proving",
                  desc: "Proofs are generated entirely in the browser using snarkjs WASM. Your secret never leaves your device. No server, no trusted third party.",
                },
              ].map((feature, i) => (
                <FadeIn key={feature.title} delay={i * 0.05}>
                  <div className="rounded-xl border border-border/50 p-5 h-full hover:border-border transition-colors">
                    <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center text-foreground mb-4">
                      {feature.icon}
                    </div>
                    <h3 className="text-base font-semibold mb-2">{feature.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{feature.desc}</p>
                  </div>
                </FadeIn>
              ))}
            </div>
          </div>
        </section>

        {/* ─── Compliance ─── */}
        <section id="compliance" className="px-6 py-24 bg-muted/30">
          <div className="max-w-5xl mx-auto">
            <FadeIn>
              <div className="text-center mb-16">
                <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
                  Privacy <span className="font-display italic font-normal">with</span> Compliance
                </h2>
                <p className="text-muted-foreground max-w-2xl mx-auto">
                  Most privacy protocols force a choice: hide everything or expose everything.
                  Veil gives you both — private by default, auditable when required.
                </p>
              </div>
            </FadeIn>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FadeIn delay={0.1}>
                <div className="rounded-xl border border-border/50 bg-background p-6 h-full">
                  <div className="w-10 h-10 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center mb-4">
                    <Eye className="w-5 h-5" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">Timelocked Viewing Keys</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                    Every deposit can generate a viewing key — a separate cryptographic key that
                    unlocks transaction details only after a configurable timelock period expires.
                    While the timelock is active, the transaction remains fully private. Once it
                    expires, authorized holders can see sender, recipient, amount, and memo.
                  </p>
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    <span className="text-muted-foreground">Real-time privacy preserved</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm mt-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    <span className="text-muted-foreground">Post-timelock auditability for regulators</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm mt-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    <span className="text-muted-foreground">User controls who gets the viewing key</span>
                  </div>
                </div>
              </FadeIn>

              <FadeIn delay={0.2}>
                <div className="rounded-xl border border-border/50 bg-background p-6 h-full">
                  <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center mb-4">
                    <Shield className="w-5 h-5" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">Why This Matters</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                    Regulators and institutions need auditability. Users need privacy. Without compliance
                    tools, privacy protocols get banned or avoided by legitimate users. Veil's viewing key
                    system means businesses can adopt shielded payments while still meeting KYC/AML
                    obligations — making privacy sustainable, not just technically possible.
                  </p>
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    <span className="text-muted-foreground">Institutional-grade audit trail</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm mt-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    <span className="text-muted-foreground">Compatible with KYC/AML requirements</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm mt-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    <span className="text-muted-foreground">Encrypted memos for payment references</span>
                  </div>
                </div>
              </FadeIn>
            </div>

            <FadeIn delay={0.3}>
              <div className="mt-8 text-center">
                <Button variant="outline" size="lg" className="rounded-full px-7 gap-2" asChild>
                  <Link href="/compliance">
                    Try Compliance Demo
                    <ChevronRight className="w-4 h-4" />
                  </Link>
                </Button>
              </div>
            </FadeIn>
          </div>
        </section>

        {/* ─── Architecture ─── */}
        <section id="architecture" className="px-6 py-24 bg-muted/30">
          <div className="max-w-4xl mx-auto">
            <FadeIn>
              <div className="text-center mb-12">
                <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">Under the Hood</h2>
                <p className="text-muted-foreground max-w-2xl mx-auto">
                  The complete privacy pipeline — from deposit commitment to zero-knowledge withdrawal.
                </p>
              </div>
            </FadeIn>

            <FadeIn delay={0.1}>
              <div className="rounded-xl border border-border/50 bg-background p-6 sm:p-8 overflow-x-auto">
                <pre className="font-mono text-xs sm:text-sm text-muted-foreground leading-relaxed whitespace-pre">
{`  Depositor                    Veil Pool (Soroban)               Recipient
  ─────────                    ──────────────────               ──────────
      │                               │                              │
      │── deposit(commitment) ───────▶│                              │
      │   [100 XLM + Poseidon hash]   │                              │
      │                               │◀── Merkle tree insert        │
      │                               │                              │
      │── share secret note (QR) ────────────────────────────────▶  │
      │                               │                              │
      │                               │◀── withdraw(proof) ──────── │
      │                               │    [Groth16 ZK proof]        │
      │                               │                              │
      │                               │── BN254 pairing verify ──▶  │
      │                               │── nullifier check ────────▶ │
      │                               │── transfer 100 XLM ───────▶ │
      │                               │                              │
   no link ◀────────────────────── zero knowledge ──────────────▶ funds`}
                </pre>
              </div>
            </FadeIn>

            <FadeIn delay={0.2}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-8">
                <div className="rounded-xl border border-border/50 bg-background p-5">
                  <h3 className="font-semibold mb-3">Tech Stack</h3>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> Circom 2.0 circuits + snarkjs (Groth16)</li>
                    <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> BN254 curve with native Soroban host fns</li>
                    <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> Poseidon hash (circomlib + on-chain)</li>
                    <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> Incremental Merkle tree (depth 20)</li>
                    <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> Client-side WASM proof generation</li>
                  </ul>
                </div>
                <div className="rounded-xl border border-border/50 bg-background p-5">
                  <h3 className="font-semibold mb-3">Security Guarantees</h3>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> Sender–recipient unlinkability</li>
                    <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> Nullifier prevents double-spending</li>
                    <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> On-chain proof verification (no trust)</li>
                    <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> Anti-frontrun binding in circuit</li>
                    <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> Secrets never leave the browser</li>
                  </ul>
                </div>
              </div>
            </FadeIn>
          </div>
        </section>

        {/* ─── Getting Started ─── */}
        <section className="px-6 py-24">
          <div className="max-w-3xl mx-auto">
            <FadeIn>
              <div className="text-center mb-12">
                <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">Get Started</h2>
                <p className="text-muted-foreground">
                  Start using Veil on Stellar mainnet in four simple steps.
                </p>
              </div>
            </FadeIn>

            <FadeIn delay={0.1}>
              <div className="space-y-4">
                {[
                  {
                    num: "1",
                    title: "Create your shielded wallet",
                    desc: "Set a PIN and connect your Freighter wallet. Make sure Freighter is set to Stellar mainnet.",
                    href: "/wallet",
                  },
                  {
                    num: "2",
                    title: "Receive tokens",
                    desc: "Deposit XLM or USDC into the shielded pool. Choose your tier and the secret note is auto-saved — no manual copying needed.",
                    href: "/wallet/receive",
                  },
                  {
                    num: "3",
                    title: "Send privately",
                    desc: "Enter a recipient and amount. Your wallet handles note selection, ZK proof generation, and on-chain submission automatically.",
                    href: "/wallet/send",
                  },
                  {
                    num: "4",
                    title: "Try cross-border remittance",
                    desc: "Pick a corridor (USD→MXN, EUR→NGN, and more), enter an amount, and watch the privacy pipeline execute in real time.",
                    href: "/remit",
                  },
                ].map((step) => (
                  <Link
                    key={step.num}
                    href={step.href}
                    className="flex items-start gap-4 rounded-xl border border-border/50 p-5 hover:border-border hover:bg-muted/20 transition-all group"
                  >
                    <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold shrink-0">
                      {step.num}
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold mb-1 group-hover:text-foreground">{step.title}</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">{step.desc}</p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-foreground shrink-0 mt-1 transition-colors" />
                  </Link>
                ))}
              </div>
            </FadeIn>
          </div>
        </section>

        {/* ─── CTA ─── */}
        <section className="px-6 py-24 bg-muted/30">
          <FadeIn>
            <div className="max-w-2xl mx-auto text-center">
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
                Privacy that plays by the rules
              </h2>
              <p className="text-muted-foreground mb-8">
                Your shielded wallet handles everything — receive, send, and remit across
                borders with zero-knowledge proofs and built-in compliance, all on Stellar.
              </p>
              <div className="flex items-center justify-center gap-3">
                <Button size="lg" className="rounded-full px-7 gap-2" asChild>
                  <Link href="/wallet">
                    Launch App
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </Button>
                <Button variant="outline" size="lg" className="rounded-full px-7" asChild>
                  <Link href="/compliance">
                    View Compliance
                  </Link>
                </Button>
              </div>
            </div>
          </FadeIn>
        </section>

        {/* ─── Footer ─── */}
        <footer className="px-6 py-12 border-t border-border/40">
          <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-lg bg-primary flex items-center justify-center">
                <span className="text-primary-foreground font-bold text-xs">V</span>
              </div>
              <span className="text-sm font-medium">Veil Protocol</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Built for the Stellar ZK Hack 2026
            </p>
          </div>
        </footer>
      </main>
    </>
  );
}
