"use client";

import { useMemo, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ChevronDown, Filter, Search, X } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

export function CategoryMultiSelect({
  categories,
  selected,
}: {
  categories: { id: string; name: string; count: number }[];
  selected: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState("");

  const updateUrl = (next: string[]) => {
    const params = new URLSearchParams(searchParams);
    if (next.length === 0) params.delete("categories");
    else params.set("categories", next.join(","));
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  };

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    updateUrl([...next]);
  };

  const clear = () => updateUrl([]);

  const selectAll = () => updateUrl(categories.map((c) => c.id));

  const filtered = useMemo(() => {
    if (!search.trim()) return categories;
    const q = search.toLowerCase();
    return categories.filter((c) => c.name.toLowerCase().includes(q));
  }, [categories, search]);

  const summary =
    selected.length === 0
      ? "Todas as categorias"
      : selected.length === 1
        ? categories.find((c) => c.id === selected[0])?.name ?? "1 categoria"
        : `${selected.length} categorias`;

  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors",
          selected.length > 0
            ? "border-primary/40 bg-primary/10 text-primary shadow-[0_0_16px_rgba(79,140,255,0.25)]"
            : "border-border bg-card text-foreground hover:bg-elevated",
        )}
      >
        <Filter className="h-3.5 w-3.5" />
        <span>{summary}</span>
        {selected.length > 0 && (
          <span className="rounded-full bg-primary/20 px-1.5 text-[10px] tabular-nums">
            {selected.length}
          </span>
        )}
        <ChevronDown className="h-3.5 w-3.5" />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-72 overflow-hidden rounded-xl border border-border bg-popover p-0 backdrop-blur-2xl"
      >
        <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          <input
            placeholder="Buscar categoria…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="max-h-[280px] overflow-y-auto scrollbar-thin py-1.5">
          {filtered.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              Nenhuma categoria
            </p>
          ) : (
            filtered.map((c) => {
              const isSelected = selected.includes(c.id);
              return (
                <label
                  key={c.id}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 px-3 py-1.5 transition-colors hover:bg-elevated",
                    isSelected && "bg-primary/5",
                  )}
                >
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => toggle(c.id)}
                    className="border-white/20 data-[state=checked]:border-primary data-[state=checked]:bg-primary"
                  />
                  <span className="flex-1 truncate text-sm text-foreground">
                    {c.name}
                  </span>
                  <span className="text-[11px] tabular-nums text-muted-foreground">
                    {c.count}
                  </span>
                </label>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border bg-elevated/40 px-3 py-2">
          <button
            type="button"
            onClick={selectAll}
            className="text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Selecionar todas
          </button>
          {selected.length > 0 && (
            <button
              type="button"
              onClick={clear}
              className="text-[11px] font-medium text-primary transition-colors hover:text-primary/80"
            >
              Limpar ({selected.length})
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
