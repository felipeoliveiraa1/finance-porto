"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LogOut, ChevronUp, User as UserIcon } from "lucide-react";
import type { Session, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

export function UserMenu() {
  const [email, setEmail] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    let active = true;
    supabase.auth.getUser().then(({ data }: { data: { user: User | null } }) => {
      if (active) setEmail(data.user?.email ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange(
      (_event: string, session: Session | null) => {
        setEmail(session?.user.email ?? null);
      },
    );
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const onLogout = () => {
    start(async () => {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push("/login");
      router.refresh();
    });
  };

  const initials = email
    ? email
        .split("@")[0]
        .split(/[._-]/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? "")
        .join("") || email[0].toUpperCase()
    : "?";

  return (
    <div className="relative">
      {open && (
        <div className="absolute bottom-[calc(100%+8px)] left-0 right-0 overflow-hidden rounded-xl glass top-highlight z-50">
          <div className="border-b border-border px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Logado como
            </p>
            <p className="mt-0.5 truncate text-xs text-foreground" title={email ?? undefined}>
              {email ?? "—"}
            </p>
          </div>
          <button
            type="button"
            onClick={onLogout}
            disabled={pending}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-60"
          >
            <LogOut className="h-4 w-4" />
            {pending ? "Saindo…" : "Sair"}
          </button>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-white/5"
      >
        <div className="relative flex h-9 w-9 items-center justify-center rounded-full bg-linear-to-br from-primary to-[rgb(178,100,255)] text-xs font-semibold text-white">
          {email ? initials : <UserIcon className="h-4 w-4" />}
          <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-sidebar bg-success pulse-glow" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            {email ? email.split("@")[0] : "Convidado"}
          </p>
          <p className="truncate text-[11px] text-muted-foreground">
            {email ? email.split("@")[1] : "não autenticado"}
          </p>
        </div>
        <ChevronUp className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "" : "rotate-180"}`} />
      </button>
    </div>
  );
}
