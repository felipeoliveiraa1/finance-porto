"use client";

import { useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { triggerSync } from "@/app/actions";
import { cn } from "@/lib/utils";

export function SyncButton({
  variant = "primary",
}: {
  variant?: "primary" | "ghost";
}) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      className={cn(
        "group relative inline-flex items-center gap-2 overflow-hidden rounded-xl px-4 py-2.5 text-sm font-medium transition-all disabled:opacity-60",
        variant === "primary"
          ? "bg-linear-to-br from-primary via-primary to-[rgb(178,100,255)] text-white glow-primary hover:glow-purple"
          : "glass text-foreground hover:bg-white/8",
      )}
      onClick={() => {
        start(async () => {
          try {
            const r = await triggerSync();
            if (r.errors.length === 0) {
              toast.success(
                `Sincronizado — ${r.itemsCount} bancos, ${r.transactionsCount} transações`,
              );
            } else {
              toast.warning(`Sync parcial — ${r.errors.length} erro(s)`, {
                description: r.errors[0]?.message,
              });
            }
          } catch (err) {
            toast.error("Sync falhou", {
              description: err instanceof Error ? err.message : "erro desconhecido",
            });
          }
        });
      }}
    >
      {variant === "primary" && (
        <span className="absolute inset-0 -translate-x-full bg-linear-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
      )}
      <RefreshCw className={cn("relative h-3.5 w-3.5", pending && "animate-spin")} />
      <span className="relative">{pending ? "Sincronizando…" : "Sincronizar"}</span>
    </button>
  );
}
