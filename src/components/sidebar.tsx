"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Wallet, ListChecks, Settings, Sparkles, Repeat, Bot } from "lucide-react";
import { cn } from "@/lib/utils";
import { UserMenu } from "@/components/user-menu";

const items = [
  { href: "/", label: "Visão geral", icon: LayoutDashboard },
  { href: "/accounts", label: "Contas", icon: Wallet },
  { href: "/transactions", label: "Transações", icon: ListChecks },
  { href: "/fixed", label: "Gastos fixos", icon: Repeat },
  { href: "/coach", label: "Coach IA", icon: Bot, badge: "BETA" },
  { href: "/settings", label: "Configurações", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  // /login renders its own full-screen layout — hide the dashboard chrome there.
  if (pathname === "/login" || pathname.startsWith("/auth/")) return null;
  return (
    <aside className="hidden md:flex w-64 shrink-0 flex-col bg-sidebar/80 backdrop-blur-2xl border-r border-sidebar-border relative z-10">
      <Link href="/" className="flex items-center gap-3 px-6 py-6 border-b border-sidebar-border">
        <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-linear-to-br from-primary via-primary to-[rgb(178,100,255)] glow-primary">
          <Sparkles className="h-4.5 w-4.5 text-white" strokeWidth={2.5} />
        </div>
        <div>
          <span className="text-base font-bold tracking-[0.18em] text-foreground">FINANCE</span>
          <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Open Finance</p>
        </div>
      </Link>

      <nav className="flex-1 px-3 py-5">
        <p className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Principal
        </p>
        <ul className="flex flex-col gap-1">
          {items.map(({ href, label, icon: Icon, badge }) => {
            const active = pathname === href || (href !== "/" && pathname.startsWith(href));
            return (
              <li key={href}>
                <Link
                  href={href}
                  className={cn(
                    "group relative flex items-center gap-3 overflow-hidden rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
                    active
                      ? "bg-linear-to-r from-primary/15 to-primary/0 text-foreground"
                      : "text-sidebar-foreground hover:bg-white/5 hover:text-foreground",
                  )}
                >
                  {active && (
                    <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-primary glow-primary" />
                  )}
                  <Icon
                    className={cn(
                      "h-4 w-4 transition-all",
                      active
                        ? "text-primary"
                        : "text-muted-foreground group-hover:text-foreground",
                    )}
                  />
                  <span className="flex-1">{label}</span>
                  {badge && (
                    <span className="rounded-full bg-linear-to-br from-primary to-[rgb(178,100,255)] px-1.5 py-0.5 text-[9px] font-bold tracking-wider text-white">
                      {badge}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <UserMenu />
      </div>
    </aside>
  );
}
