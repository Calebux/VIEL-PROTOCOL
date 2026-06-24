"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ShieldCheck,
  Search,
  Download,
  Upload,
  Trash2,
  ChevronRight,
  AlertTriangle,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import AppShell from "@/components/AppShell";
import {
  isWalletInitialized,
  isUnlocked,
  exportWallet,
  importWallet,
  resetWallet,
} from "@/lib/noteStore";

export default function SettingsPage() {
  const [ready, setReady] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [exported, setExported] = useState(false);
  const [importError, setImportError] = useState("");
  const [importSuccess, setImportSuccess] = useState(false);

  useEffect(() => {
    setReady(true);
  }, []);

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

  const handleExport = () => {
    const data = exportWallet();
    if (!data) return;
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `veil-wallet-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setExported(true);
    setTimeout(() => setExported(false), 2000);
  };

  const handleImport = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const pin = prompt("Enter your wallet PIN to import:");
        if (!pin) return;
        importWallet(text, pin);
        setImportSuccess(true);
        setImportError("");
        setTimeout(() => setImportSuccess(false), 2000);
      } catch {
        setImportError("Failed to import wallet file");
      }
    };
    input.click();
  };

  const handleReset = () => {
    resetWallet();
    window.location.href = "/wallet";
  };

  return (
    <AppShell>
      <div className="max-w-lg mx-auto px-4 lg:px-6 py-6 pb-24 lg:pb-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Link href="/wallet" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-lg font-semibold">Settings</h1>
        </div>

        <div className="space-y-3">
          {/* Advanced Tools */}
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-1 pt-2 pb-1">
            Advanced Tools
          </div>

          <Link
            href="/compliance"
            className="flex items-center gap-4 rounded-xl border border-border/60 bg-card p-4 hover:bg-muted/30 transition-colors group"
          >
            <div className="h-9 w-9 rounded-lg bg-violet-100 text-violet-600 flex items-center justify-center shrink-0">
              <ShieldCheck className="h-4.5 w-4.5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">Compliance Dashboard</div>
              <div className="text-xs text-muted-foreground">
                Privacy Pools status, reveal key decoder, ASP info
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground shrink-0" />
          </Link>

          <Link
            href="/explorer"
            className="flex items-center gap-4 rounded-xl border border-border/60 bg-card p-4 hover:bg-muted/30 transition-colors group"
          >
            <div className="h-9 w-9 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
              <Search className="h-4.5 w-4.5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">Proof Explorer</div>
              <div className="text-xs text-muted-foreground">
                Browse on-chain proofs, Merkle tree, nullifiers
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground shrink-0" />
          </Link>

          {/* Wallet Management */}
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-1 pt-4 pb-1">
            Wallet
          </div>

          <button
            onClick={handleExport}
            className="w-full flex items-center gap-4 rounded-xl border border-border/60 bg-card p-4 hover:bg-muted/30 transition-colors group text-left"
          >
            <div className="h-9 w-9 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
              {exported ? <Check className="h-4.5 w-4.5" /> : <Download className="h-4.5 w-4.5" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">Export Wallet</div>
              <div className="text-xs text-muted-foreground">
                Download your shielded notes as a JSON backup
              </div>
            </div>
          </button>

          <button
            onClick={handleImport}
            className="w-full flex items-center gap-4 rounded-xl border border-border/60 bg-card p-4 hover:bg-muted/30 transition-colors group text-left"
          >
            <div className="h-9 w-9 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
              {importSuccess ? <Check className="h-4.5 w-4.5" /> : <Upload className="h-4.5 w-4.5" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">Import Wallet</div>
              <div className="text-xs text-muted-foreground">
                Restore from a JSON backup file
              </div>
            </div>
          </button>

          {importError && (
            <p className="text-sm text-destructive px-1">{importError}</p>
          )}

          {/* Danger Zone */}
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-1 pt-4 pb-1">
            Danger Zone
          </div>

          {!showReset ? (
            <button
              onClick={() => setShowReset(true)}
              className="w-full flex items-center gap-4 rounded-xl border border-red-200/60 bg-card p-4 hover:bg-red-50/50 transition-colors text-left"
            >
              <div className="h-9 w-9 rounded-lg bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                <Trash2 className="h-4.5 w-4.5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-red-600">Reset Wallet</div>
                <div className="text-xs text-muted-foreground">
                  Delete all notes and wallet data permanently
                </div>
              </div>
            </button>
          ) : (
            <div className="rounded-xl border border-red-300 bg-red-50/80 p-5 space-y-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-semibold text-red-700">Are you sure?</div>
                  <p className="text-xs text-red-600 mt-1">
                    This will permanently delete all shielded notes. Unspent funds will be lost if you haven't exported a backup.
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => setShowReset(false)}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                  onClick={handleReset}
                >
                  Reset Wallet
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
