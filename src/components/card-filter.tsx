"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ChevronDown, CreditCard, LayoutGrid, X } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CreditCardVisual } from "@/components/credit-card-visual";
import { cn } from "@/lib/utils";

type CardOption = {
  id: string;
  name: string;
  bank: string;
  number: string | null;
  owner: string | null;
};

export function CardFilter({
  cards,
  selectedId,
}: {
  cards: CardOption[];
  selectedId?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const updateUrl = (next?: string) => {
    const params = new URLSearchParams(searchParams);
    if (next) params.set("accountId", next);
    else params.delete("accountId");
    router.push(`${pathname}?${params.toString()}`);
  };

  const selected = selectedId ? cards.find((c) => c.id === selectedId) : null;

  const summary = selected
    ? `${selected.bank} · ${shortName(selected.name)}`
    : "Todos os cartões";

  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors",
          selected
            ? "border-primary/40 bg-primary/10 text-primary shadow-[0_0_16px_rgba(79,140,255,0.25)]"
            : "border-border bg-card text-foreground hover:bg-elevated",
        )}
      >
        <CreditCard className="h-3.5 w-3.5" />
        <span className="max-w-[180px] truncate">{summary}</span>
        <ChevronDown className="h-3.5 w-3.5" />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-[300px] overflow-hidden rounded-xl border border-border bg-popover p-0 backdrop-blur-2xl"
      >
        <div className="border-b border-border px-3 py-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Filtrar por cartão
          </p>
        </div>

        <div className="max-h-[360px] overflow-y-auto scrollbar-thin py-1">
          <button
            type="button"
            onClick={() => updateUrl(undefined)}
            className={cn(
              "flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-elevated",
              !selectedId && "bg-primary/10",
            )}
          >
            <span
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                !selectedId ? "bg-primary/20 text-primary" : "bg-secondary/60 text-muted-foreground",
              )}
            >
              <LayoutGrid className="h-4 w-4" />
            </span>
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">Todos os cartões</p>
              <p className="text-[11px] text-muted-foreground">{cards.length} conectados</p>
            </div>
          </button>

          {cards.map((c) => {
            const isActive = c.id === selectedId;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => updateUrl(c.id)}
                className={cn(
                  "flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-elevated",
                  isActive && "bg-primary/10",
                )}
              >
                <span className="h-9 w-14 shrink-0 overflow-hidden rounded-md">
                  <CreditCardVisual
                    cardName={c.name}
                    bankConnectorName={c.bank}
                    number={c.number}
                    owner={c.owner}
                    compact
                  />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {c.bank}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {shortName(c.name)} · final {lastFour(c.number)}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {selected && (
          <div className="flex items-center justify-end border-t border-border bg-elevated/40 px-3 py-2">
            <button
              type="button"
              onClick={() => updateUrl(undefined)}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-primary transition-colors hover:text-primary/80"
            >
              <X className="h-3 w-3" />
              Limpar filtro
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function shortName(s: string): string {
  return s.trim().replace(/\s+/g, " ").slice(0, 30);
}

function lastFour(num: string | null): string {
  if (!num) return "••••";
  return num.replace(/\D/g, "").slice(-4) || "••••";
}
