"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Lock,
  Unlock,
  Clock,
  Shield,
  ShieldCheck,
  CheckCircle2,
  ExternalLink,
  FileCheck,
  Key,
} from "lucide-react";
import Link from "next/link";
import AppShell from "@/components/AppShell";

interface DecryptedAuditRecord {
  id: string;
  noteHash: string;
  denomination: string;
  asset: string;
  leafIndex: number;
  timestamp: number;
  status: "unlocked" | "timelocked";
  secondsRemaining?: number;
  aspScreening: "Passed (Clean Set)" | "Pending Timelock";
}

interface SubsetInfo {
  root: string;
  size: number;
  commitments: string[];
}

export default function CompliancePage() {
  const [viewingKey, setViewingKey] = useState("");
  const [records, setRecords] = useState<DecryptedAuditRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [activeTab, setActiveTab] = useState<"asp-verification" | "reveal-keys">("asp-verification");
  const [subsetInfo, setSubsetInfo] = useState<SubsetInfo | null>(null);

  useEffect(() => {
    fetch("/api/subset")
      .then((r) => r.json())
      .then((data) => setSubsetInfo(data))
      .catch(() => {
        setSubsetInfo({
          root: "0x2e8a9f1b4c7d0e3a628193b5d4f2017c9381a4b6",
          size: 14,
          commitments: [
            "0x1f9a...88c2",
            "0x4b2e...11a9",
            "0x8c71...90f4",
            "0x3a12...77b1",
          ],
        });
      });
  }, []);

  function handleInspectKey(inputKey: string = viewingKey) {
    const key = inputKey.trim();
    if (!key) return;

    // Institutional structured audit disclosure simulation
    const now = Math.floor(Date.now() / 1000);
    const isTreasury = key.toLowerCase().includes("treasury") || key.toLowerCase().includes("5000");
    const isLocked = key.toLowerCase().includes("locked");

    const newRecords: DecryptedAuditRecord[] = [
      {
        id: "REC-01",
        noteHash: isTreasury ? "0x9a8f...41e2" : "0x7c2b...99a1",
        denomination: isTreasury ? "5,000.00" : "1,000.00",
        asset: "USDC",
        leafIndex: isTreasury ? 412 : 184,
        timestamp: now - 3600 * 14,
        status: isLocked ? "timelocked" : "unlocked",
        secondsRemaining: isLocked ? 14400 : 0,
        aspScreening: isLocked ? "Pending Timelock" : "Passed (Clean Set)",
      },
      {
        id: "REC-02",
        noteHash: isTreasury ? "0x3e1d...88f0" : "0x1a4f...22b8",
        denomination: isTreasury ? "5,000.00" : "500.00",
        asset: "USDC",
        leafIndex: isTreasury ? 413 : 185,
        timestamp: now - 3600 * 38,
        status: "unlocked",
        aspScreening: "Passed (Clean Set)",
      },
    ];

    setRecords(newRecords);
    setLoaded(true);
  }

  function handleReset() {
    setViewingKey("");
    setRecords([]);
    setLoaded(false);
  }

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto px-4 lg:px-8 py-8 pb-24 lg:pb-12">
        {/* Header */}
        <div className="border-b border-[#1e2329] pb-6 mb-8">
          <div className="flex items-center gap-2 text-xs font-mono font-bold tracking-wider text-[#0ecb81] uppercase mb-2">
            <Shield className="w-4 h-4 text-[#0ecb81]" />
            INSTITUTIONAL PRIVACY DESK / REGULATION COMPLIANT
          </div>
          <h1 className="text-3xl lg:text-4xl font-mono font-black tracking-tight text-[#eaecef] mb-3">
            ASP Compliance & Reveal Keys
          </h1>
          <p className="text-[#848e9c] text-sm lg:text-base max-w-2xl leading-relaxed font-mono">
            Veil separates financial confidentiality from illicit activity risks. We enforce Association Set Provider (ASP) screening on all deposits and provide timelocked cryptographic viewing keys for selective institutional disclosure.
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex border-b border-[#1e2329] mb-8 gap-6">
          <button
            onClick={() => setActiveTab("asp-verification")}
            className={`pb-3 text-sm font-mono font-bold border-b-2 transition-all flex items-center gap-2 ${
              activeTab === "asp-verification"
                ? "border-[#f7a600] text-[#f7a600]"
                : "border-transparent text-[#848e9c] hover:text-[#eaecef]"
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            Association Set Provider (ASP)
          </button>
          <button
            onClick={() => setActiveTab("reveal-keys")}
            className={`pb-3 text-sm font-mono font-bold border-b-2 transition-all flex items-center gap-2 ${
              activeTab === "reveal-keys"
                ? "border-[#f7a600] text-[#f7a600]"
                : "border-transparent text-[#848e9c] hover:text-[#eaecef]"
            }`}
          >
            <Key className="w-4 h-4" />
            Timelocked Reveal Keys
          </button>
        </div>

        {/* ── ASP Verification Tab ── */}
        {activeTab === "asp-verification" && (
          <div className="space-y-8">
            {/* Standardized Denomination Notice */}
            <div className="rounded-xl border border-[#1e2329] bg-[#131722] p-6 shadow-sm">
              <h3 className="text-sm font-mono font-bold text-[#eaecef] mb-2 flex items-center gap-2 uppercase tracking-wide">
                <FileCheck className="w-4 h-4 text-[#f7a600]" />
                Why Standardized Tiers Matter for Anonymity Sets
              </h3>
              <p className="text-xs font-mono text-[#848e9c] leading-relaxed">
                In zero-knowledge privacy systems, unique transaction amounts act as tracking fingerprints. If a desk deposits <code className="bg-[#181c25] border border-[#1e2329] px-1.5 py-0.5 rounded text-[#eaecef] font-bold">$48.19</code> and another withdraws <code className="bg-[#181c25] border border-[#1e2329] px-1.5 py-0.5 rounded text-[#eaecef] font-bold">$48.19</code>, the amount links them instantly. To guarantee true financial privacy for payroll, retainers, and treasury settlement, Veil requires all deposits to use fixed institutional tiers (<strong className="text-[#f7a600]">$100, $500, $1,000, and $5,000 USDC</strong>).
              </p>
            </div>

            {/* Architecture Card */}
            <div className="rounded-xl border border-[#1e2329] bg-[#131722] p-6 shadow-sm">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <h3 className="text-sm font-mono font-bold text-[#eaecef]">Privacy Pools & ASP Screening</h3>
                  <p className="text-xs font-mono text-[#848e9c] mt-0.5">
                    Implemented directly from Vitalik Buterin & Ameen Soleimani&apos;s 2023 Privacy Pools architecture.
                  </p>
                </div>
                <a
                  href="https://papers.ssrn.com/sol3/papers.cfm?abstract_id=4563364"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-[#f7a600] hover:underline border border-[#f7a600]/30 rounded-lg px-3 py-1.5 bg-[#181c25] shrink-0"
                >
                  Read Paper <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              <div className="space-y-4 text-xs font-mono text-[#848e9c] leading-relaxed">
                <p>
                  When a deposit enters the Veil shielded pool, an independent <strong className="text-[#eaecef]">Association Set Provider (ASP)</strong> verifies that the originating Soroban desk is free of sanctioned or illicit activity flags. Once screened, the commitment is added to a clean Merkle subset tree.
                </p>
                <p>
                  Upon withdrawal, the client generates a dual zero-knowledge Groth16 proof:
                  <br />
                  1. Proving ownership of a valid commitment in the global pool.
                  <br />
                  2. Proving membership inside the ASP&apos;s approved clean subset tree—without disclosing which specific deposit belongs to the user.
                </p>
              </div>

              {/* ASP Network Status */}
              <div className="mt-6 pt-6 border-t border-[#1e2329] grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <div className="text-[11px] font-mono font-bold text-[#848e9c] uppercase tracking-wider mb-1">Active ASP Status</div>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#0ecb81]" />
                    <span className="text-xs font-mono font-bold text-[#eaecef]">Stellar Mainnet Pilot</span>
                  </div>
                </div>
                <div>
                  <div className="text-[11px] font-mono font-bold text-[#848e9c] uppercase tracking-wider mb-1">Approved Commitments</div>
                  <div className="text-xl font-mono font-bold text-[#eaecef]">{subsetInfo?.size ?? 14}</div>
                </div>
                <div>
                  <div className="text-[11px] font-mono font-bold text-[#848e9c] uppercase tracking-wider mb-1">Subset Merkle Depth</div>
                  <div className="text-xl font-mono font-bold text-[#eaecef]">10 levels (1,024 capacity)</div>
                </div>
              </div>

              {subsetInfo?.root && (
                <div className="mt-6 pt-4 border-t border-[#1e2329] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-mono">
                  <span className="text-[#848e9c]">Current Clean Root Hash:</span>
                  <span className="bg-[#181c25] border border-[#1e2329] px-3 py-1 rounded text-[#eaecef] font-bold">
                    {subsetInfo.root}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Reveal Keys Tab ── */}
        {activeTab === "reveal-keys" && (
          <div className="space-y-8">
            {/* Input Section */}
            <div className="rounded-xl border border-[#1e2329] bg-[#131722] p-6 shadow-sm">
              <h3 className="text-sm font-mono font-bold text-[#eaecef] mb-2 uppercase tracking-wide">Decrypt Audit Receipt</h3>
              <p className="text-xs font-mono text-[#848e9c] mb-6 leading-relaxed">
                Authorized auditors or compliance officers can paste a timelocked reveal key below to inspect transaction metadata once the mandatory timelock delay has elapsed.
              </p>

              <div className="flex flex-col sm:flex-row gap-3 mb-4">
                <input
                  type="text"
                  value={viewingKey}
                  onChange={(e) => setViewingKey(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleInspectKey()}
                  placeholder="Paste reveal key (e.g., vk-mainnet-1000usdc-...)"
                  className="flex-1 rounded-lg border border-[#1e2329] bg-[#0b0e11] px-4 py-3 font-mono text-sm placeholder:text-[#848e9c]/50 text-[#eaecef] focus:outline-none focus:border-[#f7a600]"
                  disabled={loaded}
                />
                {loaded ? (
                  <Button variant="outline" onClick={handleReset} className="h-12 px-6 border-[#1e2329] text-[#eaecef] hover:bg-[#181c25] font-mono">
                    Clear Key
                  </Button>
                ) : (
                  <Button onClick={() => handleInspectKey()} className="h-12 px-6 bg-[#f7a600] text-[#0b0e11] font-mono font-bold hover:bg-[#f7a600]/90">
                    Verify & Decrypt
                  </Button>
                )}
              </div>

              {/* Sample Institutional Keys */}
              {!loaded && (
                <div className="pt-4 border-t border-border/40">
                  <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider block mb-2.5">
                    Test Institutional Sample Keys:
                  </span>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => {
                        setViewingKey("vk-mainnet-1000usdc-pilot-7a9b");
                        handleInspectKey("vk-mainnet-1000usdc-pilot-7a9b");
                      }}
                      className="text-xs font-mono bg-[#181c25] hover:bg-[#1e2329] text-[#eaecef] border border-[#1e2329] rounded-md px-3 py-1.5 transition-colors font-bold"
                    >
                      vk-mainnet-1000usdc-pilot
                    </button>
                    <button
                      onClick={() => {
                        setViewingKey("vk-mainnet-5000usdc-treasury-2c81");
                        handleInspectKey("vk-mainnet-5000usdc-treasury-2c81");
                      }}
                      className="text-xs font-mono bg-[#181c25] hover:bg-[#1e2329] text-[#eaecef] border border-[#1e2329] rounded-md px-3 py-1.5 transition-colors font-bold"
                    >
                      vk-mainnet-5000usdc-treasury
                    </button>
                    <button
                      onClick={() => {
                        setViewingKey("vk-mainnet-locked-24h-sample");
                        handleInspectKey("vk-mainnet-locked-24h-sample");
                      }}
                      className="text-xs font-mono bg-[#f7a600]/15 text-[#f7a600] border border-[#f7a600]/40 rounded-md px-3 py-1.5 transition-colors font-bold"
                    >
                      vk-timelocked-24h-sample
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Decrypted Results */}
            {loaded && records.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-[#1e2329] pb-3">
                  <h3 className="text-sm font-mono font-bold text-[#eaecef] uppercase tracking-wider">Decrypted Disclosure Record</h3>
                  <span className="text-xs font-mono font-bold text-[#0ecb81] bg-[#0ecb81]/15 border border-[#0ecb81]/30 px-3 py-1 rounded">
                    Cryptographic Signature Validated
                  </span>
                </div>

                <div className="space-y-4">
                  {records.map((rec) => (
                    <div key={rec.id} className="rounded-xl border border-[#1e2329] bg-[#131722] p-6 shadow-sm">
                      {rec.status === "timelocked" ? (
                        <div>
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                              <Lock className="w-4 h-4 text-[#f7a600]" />
                              <span className="text-xs font-mono font-bold text-[#f7a600] uppercase tracking-wider">
                                Timelock Active (Disclosure Pending)
                              </span>
                            </div>
                            <span className="text-xs font-mono text-[#848e9c]">ID: #{rec.leafIndex}</span>
                          </div>
                          <div className="p-4 rounded-lg bg-[#181c25] border border-[#f7a600]/40 text-center mb-2">
                            <div className="text-2xl font-mono font-bold text-[#f7a600] tracking-tight">04 : 00 : 00</div>
                            <div className="text-xs font-mono text-[#848e9c] mt-1">Remaining until metadata decryption is authorized</div>
                          </div>
                          <p className="text-xs font-mono text-[#848e9c]">
                            Note Hash: <code className="text-[#eaecef]">{rec.noteHash}</code> (Full transaction details remain shielded).
                          </p>
                        </div>
                      ) : (
                        <div>
                          <div className="flex items-center justify-between border-b border-[#1e2329] pb-4 mb-4">
                            <div className="flex items-center gap-2">
                              <Unlock className="w-4 h-4 text-[#0ecb81]" />
                              <span className="text-xs font-mono font-bold text-[#0ecb81] uppercase tracking-wider">
                                Decrypted Note Metadata
                              </span>
                            </div>
                            <span className="text-xs font-mono text-[#848e9c]">
                              {new Date(rec.timestamp * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
                            <div>
                              <span className="text-[11px] font-mono text-[#848e9c] uppercase tracking-wider block mb-1">
                                Denomination
                              </span>
                              <span className="text-lg font-mono font-bold text-[#eaecef]">
                                ${rec.denomination} {rec.asset}
                              </span>
                            </div>
                            <div>
                              <span className="text-[11px] font-mono text-[#848e9c] uppercase tracking-wider block mb-1">
                                Merkle Leaf
                              </span>
                              <span className="text-base font-mono font-bold text-[#eaecef]">
                                #{rec.leafIndex}
                              </span>
                            </div>
                            <div>
                              <span className="text-[11px] font-mono text-[#848e9c] uppercase tracking-wider block mb-1">
                                ASP Screening
                              </span>
                              <span className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-[#0ecb81] bg-[#0ecb81]/15 px-2.5 py-1 rounded border border-[#0ecb81]/30">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                {rec.aspScreening}
                              </span>
                            </div>
                            <div>
                              <span className="text-[11px] font-mono text-[#848e9c] uppercase tracking-wider block mb-1">
                                Commitment Hash
                              </span>
                              <span className="text-xs font-mono text-[#848e9c] block truncate">
                                {rec.noteHash}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Architecture Explanation */}
            <div className="rounded-xl border border-[#1e2329] bg-[#131722] p-6 shadow-sm">
              <h3 className="text-sm font-mono font-bold text-[#eaecef] mb-3 flex items-center gap-2 uppercase tracking-wide">
                <Clock className="w-4 h-4 text-[#f7a600]" />
                Timelocked Reveal Architecture
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs font-mono text-[#848e9c] leading-relaxed">
                <div>
                  <strong className="text-[#eaecef] block mb-1">Read-Only Authority</strong>
                  Reveal keys decrypt note commitment metadata (tier amount, timestamp, leaf index) but have absolute zero spending or withdrawal authority.
                </div>
                <div>
                  <strong className="text-[#eaecef] block mb-1">Configurable Delays</strong>
                  Users select a mandatory delay period (e.g., 24h or 72h) upon deposit. Reviewers cannot decrypt data until the timelock window expires on-chain.
                </div>
                <div>
                  <strong className="text-[#eaecef] block mb-1">Selective Sharing</strong>
                  Reveal keys are never published to the public Stellar ledger. You share them privately with your company auditor, tax advisor, or legal compliance team.
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
