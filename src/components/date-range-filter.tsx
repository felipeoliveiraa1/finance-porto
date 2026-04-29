"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Calendar, ChevronDown, X } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type Preset = {
  key: string;
  label: string;
  compute: () => { from: string; to: string };
};

const isoDay = (d: Date) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const PRESETS: Preset[] = [
  {
    key: "today",
    label: "Hoje",
    compute: () => {
      const today = isoDay(new Date());
      return { from: today, to: today };
    },
  },
  {
    key: "7d",
    label: "Últimos 7 dias",
    compute: () => {
      const to = new Date();
      const from = new Date();
      from.setDate(from.getDate() - 6);
      return { from: isoDay(from), to: isoDay(to) };
    },
  },
  {
    key: "30d",
    label: "Últimos 30 dias",
    compute: () => {
      const to = new Date();
      const from = new Date();
      from.setDate(from.getDate() - 29);
      return { from: isoDay(from), to: isoDay(to) };
    },
  },
  {
    key: "thisMonth",
    label: "Este mês",
    compute: () => {
      const now = new Date();
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return { from: isoDay(from), to: isoDay(to) };
    },
  },
  {
    key: "lastMonth",
    label: "Mês passado",
    compute: () => {
      const now = new Date();
      const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const to = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: isoDay(from), to: isoDay(to) };
    },
  },
  {
    key: "thisYear",
    label: "Este ano",
    compute: () => {
      const now = new Date();
      const from = new Date(now.getFullYear(), 0, 1);
      const to = new Date(now.getFullYear(), 11, 31);
      return { from: isoDay(from), to: isoDay(to) };
    },
  },
];

const formatBR = (iso?: string) => {
  if (!iso) return null;
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y.slice(2)}`;
};

export function DateRangeFilter({
  from,
  to,
}: {
  from?: string;
  to?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [localFrom, setLocalFrom] = useState(from ?? "");
  const [localTo, setLocalTo] = useState(to ?? "");

  useEffect(() => {
    setLocalFrom(from ?? "");
    setLocalTo(to ?? "");
  }, [from, to]);

  const update = (nextFrom: string, nextTo: string) => {
    const params = new URLSearchParams(searchParams);
    if (nextFrom) params.set("from", nextFrom);
    else params.delete("from");
    if (nextTo) params.set("to", nextTo);
    else params.delete("to");
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  };

  const applyPreset = (p: Preset) => {
    const r = p.compute();
    setLocalFrom(r.from);
    setLocalTo(r.to);
    update(r.from, r.to);
  };

  const applyCustom = () => {
    update(localFrom, localTo);
  };

  const clear = () => {
    setLocalFrom("");
    setLocalTo("");
    update("", "");
  };

  const activePreset = PRESETS.find((p) => {
    const r = p.compute();
    return r.from === from && r.to === to;
  });

  const summary = (() => {
    if (activePreset) return activePreset.label;
    if (from && to) return `${formatBR(from)} → ${formatBR(to)}`;
    if (from) return `Desde ${formatBR(from)}`;
    if (to) return `Até ${formatBR(to)}`;
    return "Período";
  })();

  const isFiltered = !!(from || to);

  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors",
          isFiltered
            ? "border-primary/40 bg-primary/10 text-primary shadow-[0_0_16px_rgba(79,140,255,0.25)]"
            : "border-border bg-card text-foreground hover:bg-elevated",
        )}
      >
        <Calendar className="h-3.5 w-3.5" />
        <span className="truncate max-w-[180px]">{summary}</span>
        <ChevronDown className="h-3.5 w-3.5" />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-[320px] overflow-hidden rounded-xl border border-border bg-popover p-0 backdrop-blur-2xl"
      >
        <div className="border-b border-border p-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Atalhos
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {PRESETS.map((p) => {
              const isActive = activePreset?.key === p.key;
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => applyPreset(p)}
                  className={cn(
                    "rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground",
                  )}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2.5 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Personalizado
          </p>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1 block text-[11px] text-muted-foreground">De</span>
              <input
                type="date"
                value={localFrom}
                onChange={(e) => setLocalFrom(e.target.value)}
                className="w-full rounded-md border border-border bg-card px-2 py-1.5 text-xs text-foreground outline-none focus:border-primary scheme-dark"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] text-muted-foreground">Até</span>
              <input
                type="date"
                value={localTo}
                onChange={(e) => setLocalTo(e.target.value)}
                className="w-full rounded-md border border-border bg-card px-2 py-1.5 text-xs text-foreground outline-none focus:border-primary scheme-dark"
              />
            </label>
          </div>
          <button
            type="button"
            onClick={applyCustom}
            disabled={!localFrom && !localTo}
            className="w-full rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            Aplicar
          </button>
        </div>

        {isFiltered && (
          <div className="flex items-center justify-end border-t border-border bg-elevated/40 px-3 py-2">
            <button
              type="button"
              onClick={clear}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-primary transition-colors hover:text-primary/80"
            >
              <X className="h-3 w-3" />
              Limpar período
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
