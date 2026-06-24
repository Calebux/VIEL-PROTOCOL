"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Wallet,
  Send,
  Download,
  Globe,
  Settings,
  MoreHorizontal,
} from "lucide-react";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  section?: "main" | "advanced";
}

const NAV_ITEMS: NavItem[] = [
  { label: "Wallet", href: "/wallet", icon: Wallet, section: "main" },
  { label: "Send", href: "/wallet/send", icon: Send, section: "main" },
  { label: "Receive", href: "/wallet/receive", icon: Download, section: "main" },
  { label: "Remit", href: "/remit", icon: Globe, section: "main" },
  { label: "Settings", href: "/wallet/settings", icon: Settings, section: "advanced" },
];

const MOBILE_TABS: NavItem[] = [
  { label: "Wallet", href: "/wallet", icon: Wallet },
  { label: "Send", href: "/wallet/send", icon: Send },
  { label: "Remit", href: "/remit", icon: Globe },
  { label: "More", href: "/wallet/settings", icon: MoreHorizontal },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/wallet") return pathname === "/wallet";
    return pathname.startsWith(href);
  };

  const isMobileActive = (href: string) => {
    if (href === "/wallet") return pathname.startsWith("/wallet");
    return pathname.startsWith(href);
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* ── Desktop Sidebar ───────────────────────────────── */}
      <aside className="hidden lg:flex flex-col w-56 border-r border-border/40 bg-card/50">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 px-5 h-14 border-b border-border/40">
          <div className="h-7 w-7 rounded-lg bg-foreground flex items-center justify-center">
            <span className="text-background font-bold text-sm">V</span>
          </div>
          <span className="text-sm font-semibold tracking-tight">Veil Protocol</span>
        </Link>

        <nav className="flex-1 py-3 px-3 space-y-0.5">
          {NAV_ITEMS.filter((i) => i.section === "main").map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href + item.label}
                href={item.href}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}

          <div className="pt-3 pb-1 px-3">
            <span className="text-xs font-medium text-muted-foreground/60 uppercase tracking-wider">
              Advanced
            </span>
          </div>

          {NAV_ITEMS.filter((i) => i.section === "advanced").map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href + item.label}
                href={item.href}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* ── Main Content ──────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-h-screen">
        {/* Top bar (mobile + desktop) */}
        <header className="h-14 border-b border-border/40 flex items-center justify-between px-4 lg:px-6 bg-card/50">
          <Link href="/" className="lg:hidden flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-foreground flex items-center justify-center">
              <span className="text-background font-bold text-sm">V</span>
            </div>
            <span className="text-sm font-semibold">Veil</span>
          </Link>
          <div className="hidden lg:block text-sm font-medium text-muted-foreground">
            Shielded Wallet
          </div>
          <div className="text-xs font-mono bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-md">
            Mainnet
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>

      {/* ── Mobile Bottom Tabs ────────────────────────────── */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 bg-card border-t border-border/40 flex items-center justify-around h-16 z-50">
        {MOBILE_TABS.map((item) => {
          const Icon = item.icon;
          const active = isMobileActive(item.href);
          return (
            <Link
              key={item.label}
              href={item.href}
              className={`flex flex-col items-center gap-0.5 px-3 py-1.5 ${
                active ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              <Icon className="h-5 w-5" />
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
