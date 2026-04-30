"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ChevronDown, User, Users, X } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const titleCase = (s: string) =>
  s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : s;

export function OwnerFilter({
  owners,
  selected,
}: {
  owners: string[];
  selected?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const setOwner = (next?: string) => {
    const params = new URLSearchParams(searchParams);
    if (next) params.set("owner", next);
    else params.delete("owner");
    // When changing person, drop the card filter (other person's card may not be valid)
    params.delete("accountId");
    router.push(`${pathname}?${params.toString()}`);
  };

  const isAll = !selected;
  const summary = isAll ? "Todos" : titleCase(selected);

  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors",
          !isAll
            ? "border-primary/40 bg-primary/10 text-primary shadow-[0_0_16px_rgba(79,140,255,0.25)]"
            : "border-border bg-card text-foreground hover:bg-elevated",
        )}
      >
        {isAll ? <Users className="h-3.5 w-3.5" /> : <User className="h-3.5 w-3.5" />}
        <span>{summary}</span>
        <ChevronDown className="h-3.5 w-3.5" />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-[220px] overflow-hidden rounded-xl border border-border bg-popover p-0 backdrop-blur-2xl"
      >
        <div className="border-b border-border px-3 py-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Filtrar por pessoa
          </p>
        </div>

        <div className="py-1">
          <button
            type="button"
            onClick={() => setOwner(undefined)}
            className={cn(
              "flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-elevated",
              isAll && "bg-primary/10",
            )}
          >
            <span
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full",
                isAll ? "bg-primary/20 text-primary" : "bg-secondary text-muted-foreground",
              )}
            >
              <Users className="h-3.5 w-3.5" />
            </span>
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">Todos</p>
              <p className="text-[11px] text-muted-foreground">{owners.length} pessoas</p>
            </div>
          </button>

          {owners.map((o) => {
            const isActive = o === selected;
            const initial = o[0]?.toUpperCase() ?? "?";
            return (
              <button
                key={o}
                type="button"
                onClick={() => setOwner(o)}
                className={cn(
                  "flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-elevated",
                  isActive && "bg-primary/10",
                )}
              >
                <span
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold",
                    isActive
                      ? "bg-linear-to-br from-primary to-[rgb(178,100,255)] text-white"
                      : "bg-secondary text-foreground",
                  )}
                >
                  {initial}
                </span>
                <p className="flex-1 text-sm font-medium text-foreground">{titleCase(o)}</p>
              </button>
            );
          })}
        </div>

        {!isAll && (
          <div className="flex items-center justify-end border-t border-border bg-elevated/40 px-3 py-2">
            <button
              type="button"
              onClick={() => setOwner(undefined)}
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
