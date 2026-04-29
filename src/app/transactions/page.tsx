import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, LayoutGrid } from "lucide-react";
import { SectionCard } from "@/components/section-card";
import { CreditCardVisual } from "@/components/credit-card-visual";
import { listTransactions, getCreditCardUsage, getCategoriesInScope } from "@/lib/queries";
import { translateCategory } from "@/lib/categories";
import { formatBRL, formatDateShort } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CategoryMultiSelect } from "@/components/category-multi-select";
import { DateRangeFilter } from "@/components/date-range-filter";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  page?: string;
  type?: "DEBIT" | "CREDIT";
  accountId?: string;
  categories?: string;
  from?: string;
  to?: string;
}>;

const parseDate = (iso?: string, isEndOfDay = false) => {
  if (!iso) return undefined;
  // Anchor to UTC to align with how Pluggy stores date-only fields.
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, isEndOfDay ? 23 : 0, isEndOfDay ? 59 : 0, isEndOfDay ? 59 : 0, 0));
};

export default async function TransactionsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const page = Number(params.page ?? 1);
  const categoryIds = params.categories
    ? params.categories.split(",").filter(Boolean)
    : [];
  const dateFrom = parseDate(params.from, false);
  const dateTo = parseDate(params.to, true);

  const sharedFilters = {
    type: params.type,
    accountId: params.accountId,
    dateFrom,
    dateTo,
  };

  const [{ items, total, totalPages }, cards, { categories }] = await Promise.all([
    listTransactions({
      ...sharedFilters,
      categoryIds: categoryIds.length > 0 ? categoryIds : undefined,
      page,
    }),
    getCreditCardUsage(),
    getCategoriesInScope(sharedFilters),
  ]);

  const selected = cards.find((c) => c.id === params.accountId);

  // Helpers for filter URLs that preserve other query params
  const buildHref = (overrides: Record<string, string | undefined>) => {
    const merged = { ...params, ...overrides };
    const query: Record<string, string> = {};
    for (const [k, v] of Object.entries(merged)) {
      if (v) query[k] = v;
    }
    return { pathname: "/transactions", query } as const;
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Transações</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {total.toLocaleString("pt-BR")} movimentações
          {selected && (
            <>
              {" · "}filtrando <span className="text-foreground">{selected.name.trim()}</span>
            </>
          )}
        </p>
      </header>

      {cards.length > 0 && (
        <section>
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Filtrar por cartão
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <FilterTile
              href={buildHref({ accountId: undefined, page: undefined })}
              active={!params.accountId}
              count={cards.length}
            />
            {cards.map((c) => (
              <CardFilterTile
                key={c.id}
                href={buildHref({ accountId: c.id, page: undefined })}
                active={c.id === params.accountId}
                cardName={c.name}
                bank={c.bank}
                number={c.number}
                owner={c.owner}
                openBill={c.used}
                method={c.method}
              />
            ))}
          </div>
        </section>
      )}

      {selected && (
        <SectionCard
          title={
            <div className="flex items-center gap-3">
              <span>{selected.name.trim()}</span>
              <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                {selected.bank}
              </span>
            </div>
          }
          description={`Fatura aberta ${formatBRL(selected.used)} · limite ${formatBRL(selected.limit)} (${selected.usedPct.toFixed(0)}% usado)`}
        >
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 text-sm">
            <Stat label="Aberta" value={formatBRL(selected.used)} tone="warning" />
            <Stat label="Total acumulado" value={formatBRL(selected.totalBalance)} />
            <Stat
              label={selected.method === "CYCLE_DATE" ? "Outros saldos" : "Parcelas futuras"}
              value={selected.futureInstallments > 0 ? `+${formatBRL(selected.futureInstallments)}` : "—"}
            />
            <Stat
              label="Limite livre"
              value={formatBRL(selected.available)}
              tone="success"
            />
          </div>
        </SectionCard>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <FilterPill href={buildHref({ type: undefined, page: undefined })} active={!params.type} label="Todas" />
        <FilterPill href={buildHref({ type: "DEBIT", page: undefined })} active={params.type === "DEBIT"} label="Saídas" />
        <FilterPill href={buildHref({ type: "CREDIT", page: undefined })} active={params.type === "CREDIT"} label="Entradas" />
        <span className="mx-1 h-5 w-px bg-border" />
        <CategoryMultiSelect categories={categories} selected={categoryIds} />
        <DateRangeFilter from={params.from} to={params.to} />
      </div>

      <SectionCard className="overflow-hidden" bare>
        <div>
          <div className="hidden grid-cols-12 gap-3 border-b border-border bg-elevated/40 px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sm:grid">
            <div className="col-span-1">#</div>
            <div className="col-span-5">Descrição</div>
            <div className="col-span-2">Banco / Conta</div>
            <div className="col-span-2">Categoria</div>
            <div className="col-span-2 text-right">Valor</div>
          </div>

          {items.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-muted-foreground">
              Nenhuma transação encontrada.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((t) => (
                <li
                  key={t.id}
                  className="grid grid-cols-1 items-center gap-2 px-5 py-3 transition-colors hover:bg-elevated sm:grid-cols-12 sm:gap-3"
                >
                  <div className="col-span-1 hidden sm:block">
                    <span
                      className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-lg",
                        t.type === "DEBIT"
                          ? "bg-destructive/10 text-destructive"
                          : "bg-success/10 text-success",
                      )}
                    >
                      {t.type === "DEBIT" ? (
                        <ArrowDownRight className="h-4 w-4" />
                      ) : (
                        <ArrowUpRight className="h-4 w-4" />
                      )}
                    </span>
                  </div>
                  <div className="col-span-5 min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {t.description}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground sm:hidden">
                      {formatDateShort(t.date)} · {t.account.item.connectorName}
                    </p>
                    <p className="mt-0.5 hidden text-xs text-muted-foreground sm:block">
                      {formatDateShort(t.date)}
                    </p>
                  </div>
                  <div className="col-span-2 hidden sm:block">
                    <p className="truncate text-xs text-foreground">{t.account.item.connectorName}</p>
                    <p className="truncate text-[11px] text-muted-foreground">{t.account.name}</p>
                  </div>
                  <div className="col-span-2 hidden sm:block">
                    {(() => {
                      const cat = translateCategory(t.pluggyCategoryId, t.pluggyCategory);
                      return cat ? (
                        <span className="inline-block rounded-md border border-border bg-secondary/50 px-2 py-0.5 text-[11px] text-muted-foreground">
                          {cat}
                        </span>
                      ) : null;
                    })()}
                  </div>
                  <div className="col-span-2 text-right">
                    <span
                      className={cn(
                        "text-sm font-semibold tabular-nums",
                        t.type === "DEBIT" ? "text-destructive" : "text-success",
                      )}
                    >
                      {t.type === "DEBIT" ? "−" : "+"}
                      {formatBRL(t.amount)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </SectionCard>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <PagerLink disabled={page <= 1} href={buildHref({ page: String(page - 1) })}>
            ← Anterior
          </PagerLink>
          <span className="text-xs text-muted-foreground">
            Página {page} de {totalPages}
          </span>
          <PagerLink disabled={page >= totalPages} href={buildHref({ page: String(page + 1) })}>
            Próxima →
          </PagerLink>
        </div>
      )}
    </div>
  );
}

function FilterTile({
  href,
  active,
  count,
}: {
  href: React.ComponentProps<typeof Link>["href"];
  active: boolean;
  count: number;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group relative overflow-hidden rounded-2xl glass top-highlight border-gradient p-3 transition-all duration-200",
        active
          ? "ring-2 ring-primary shadow-[0_0_30px_rgba(79,140,255,0.4)]"
          : "hover:bg-elevated",
      )}
    >
      {/* Mini stack of overlapping mini-cards as the visual */}
      <div
        className="aspect-[1.586/1] w-full overflow-hidden rounded-lg"
        style={{
          background:
            "linear-gradient(135deg, #4f8cff 0%, #b264ff 50%, #ff4566 100%)",
          boxShadow:
            "0 8px 24px -6px rgba(79, 140, 255, 0.4), 0 0 0 1px rgba(255,255,255,0.06) inset",
        }}
      >
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(circle at 18% 18%, rgba(255,255,255,0.22), transparent 55%)",
          }}
        />
        <div className="relative flex h-full items-center justify-center">
          <LayoutGrid className="h-7 w-7 text-white/90" strokeWidth={1.8} />
        </div>
      </div>
      <div className="mt-2.5">
        <p className="truncate text-xs font-semibold text-foreground">Todos</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {count} {count === 1 ? "cartão" : "cartões"}
        </p>
      </div>
    </Link>
  );
}

function CardFilterTile({
  href,
  active,
  cardName,
  bank,
  number,
  owner,
  openBill,
  method,
}: {
  href: React.ComponentProps<typeof Link>["href"];
  active: boolean;
  cardName: string;
  bank: string;
  number: string | null;
  owner: string | null;
  openBill: number;
  method: string;
}) {
  const methodHint =
    method === "FUTURE_TXS"
      ? "fatura aberta"
      : method === "DESCRIPTION_PARSE"
        ? "fatura aberta (estimada)"
        : method === "CYCLE_DATE"
          ? "fatura do ciclo"
          : "saldo total";

  return (
    <Link
      href={href}
      className={cn(
        "group relative overflow-hidden rounded-2xl glass top-highlight p-3 transition-all duration-200",
        active
          ? "ring-2 ring-primary shadow-[0_0_30px_rgba(79,140,255,0.4)]"
          : "opacity-75 hover:opacity-100 hover:bg-elevated",
      )}
    >
      <CreditCardVisual
        cardName={cardName}
        bankConnectorName={bank}
        number={number}
        owner={owner}
        compact
      />
      <div className="mt-2.5">
        <p className="truncate text-xs font-semibold text-foreground">
          {cardName.trim()}
        </p>
        <div className="mt-0.5 flex items-baseline justify-between gap-1">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {methodHint}
          </span>
          <span className="text-xs font-semibold tabular-nums text-warning">
            {formatBRL(openBill)}
          </span>
        </div>
      </div>
    </Link>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "warning" | "success";
}) {
  return (
    <div className="rounded-xl border border-border bg-card/50 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 text-base font-semibold tabular-nums",
          tone === "warning" && "text-warning",
          tone === "success" && "text-success",
          !tone && "text-foreground",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function PagerLink({
  href,
  disabled,
  children,
}: {
  href: React.ComponentProps<typeof Link>["href"];
  disabled?: boolean;
  children: React.ReactNode;
}) {
  if (disabled) {
    return (
      <span className="cursor-not-allowed rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground/50">
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-elevated"
    >
      {children}
    </Link>
  );
}

function FilterPill({
  href,
  active,
  label,
}: {
  href: React.ComponentProps<typeof Link>["href"];
  active?: boolean;
  label: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "bg-secondary text-muted-foreground hover:bg-secondary/70 hover:text-foreground",
      )}
    >
      {label}
    </Link>
  );
}

