import Link from "next/link";
import {
  Wallet,
  CreditCard,
  ArrowDownRight,
  ArrowUpRight,
  TrendingUp,
  Receipt,
  AlertTriangle,
  Crown,
  X,
} from "lucide-react";
import { KpiCard } from "@/components/kpi-card";
import { SectionCard } from "@/components/section-card";
import { SyncButton } from "@/components/sync-button";
import { CreditCardVisual } from "@/components/credit-card-visual";
import { CardOverrideButton } from "@/components/card-override-button";
import {
  DailySpendChart,
  CashflowChart,
  CategoryDonut,
  BankBreakdown,
} from "@/components/charts";
import { hasPluggyCredentials } from "@/lib/pluggy";
import { CardFilter } from "@/components/card-filter";
import { OwnerFilter } from "@/components/owner-filter";
import {
  getOverview,
  getRecentTransactions,
  getSpendByCategory,
  getSpendByBank,
  getDailySpendSeries,
  getMonthlyCashflowSeries,
  getTopMerchants,
  getCreditCardUsage,
  getLastSync,
  getOwnerFirstNames,
} from "@/lib/queries";
import { formatBRL, formatDateShort, formatRelative } from "@/lib/format";
import { DateRangeFilter } from "@/components/date-range-filter";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  from?: string;
  to?: string;
  accountId?: string;
  owner?: string;
}>;

const parseRangeBoundary = (iso: string | undefined, isEndOfDay: boolean): Date | undefined => {
  if (!iso) return undefined;
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return undefined;
  return new Date(
    Date.UTC(
      Number(m[1]),
      Number(m[2]) - 1,
      Number(m[3]),
      isEndOfDay ? 23 : 0,
      isEndOfDay ? 59 : 0,
      isEndOfDay ? 59 : 0,
      isEndOfDay ? 999 : 0,
    ),
  );
};

const periodLabel = (fromIso?: string, toIso?: string) => {
  if (!fromIso && !toIso) return "neste mês";
  if (!fromIso) return `até ${toIso}`;
  if (!toIso) return `desde ${fromIso}`;
  // Try to detect common presets via their from/to shape
  const today = new Date();
  const isoDay = (d: Date) => d.toISOString().slice(0, 10);
  if (fromIso === isoDay(today) && toIso === isoDay(today)) return "hoje";
  return "no período";
};

const periodTitle = (period: string) => {
  if (period === "neste mês") return "Mês corrente";
  if (period === "hoje") return "Hoje";
  if (period.startsWith("até ") || period.startsWith("desde ")) return period;
  return "Período selecionado";
};

const buildHref = (
  current: { from?: string; to?: string; accountId?: string },
  overrides: { from?: string; to?: string; accountId?: string },
) => {
  const merged = { ...current, ...overrides };
  const query: Record<string, string> = {};
  for (const [k, v] of Object.entries(merged)) {
    if (v) query[k] = v;
  }
  return { pathname: "/", query } as const;
};

export default async function DashboardPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const credsOk = hasPluggyCredentials();
  const accountId = params.accountId || undefined;
  const owner = params.owner?.trim().toLowerCase() || undefined;
  const filter = {
    from: parseRangeBoundary(params.from, false),
    to: parseRangeBoundary(params.to, true),
    accountId,
    owner,
  };
  const period = periodLabel(params.from, params.to);

  const [
    ov,
    recent,
    byCat,
    byBank,
    daily,
    cashflow,
    merchants,
    cards,
    lastSync,
    owners,
  ] = await Promise.all([
    getOverview(filter),
    getRecentTransactions(8),
    getSpendByCategory(filter),
    getSpendByBank(filter),
    getDailySpendSeries(
      params.from || params.to ? { ...filter } : { days: 30, accountId, owner },
    ),
    getMonthlyCashflowSeries(12, accountId, owner),
    getTopMerchants(5, filter),
    getCreditCardUsage({ owner }),
    getLastSync(),
    getOwnerFirstNames(),
  ]);

  const selectedCard = accountId ? cards.find((c) => c.id === accountId) : null;

  const spendDelta =
    ov.prevMonthSpend > 0 ? ((ov.monthSpend - ov.prevMonthSpend) / ov.prevMonthSpend) * 100 : null;
  const incomeDelta =
    ov.prevMonthIncome > 0 ? ((ov.monthIncome - ov.prevMonthIncome) / ov.prevMonthIncome) * 100 : null;
  const netDelta =
    ov.prevNetCashflow !== 0
      ? ((ov.netCashflow - ov.prevNetCashflow) / Math.abs(ov.prevNetCashflow)) * 100
      : null;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-1 inline-flex items-center gap-2 rounded-full border border-success/30 bg-success/10 px-2.5 py-1 text-[11px] font-medium text-success">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
            </span>
            {ov.accountsCount} contas conectadas · live
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">
            <span className="text-gradient-primary">Bem-vindo de volta</span>
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {lastSync?.finishedAt
              ? `Última sincronização ${formatRelative(lastSync.finishedAt)}`
              : "Ainda não sincronizado"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {owners.length > 1 && <OwnerFilter owners={owners} selected={owner} />}
          {cards.length > 0 && (
            <CardFilter
              cards={cards.map((c) => ({
                id: c.id,
                name: c.name,
                bank: c.bank,
                number: c.number,
                owner: c.owner,
              }))}
              selectedId={accountId}
            />
          )}
          <DateRangeFilter from={params.from} to={params.to} />
          <SyncButton />
        </div>
      </header>

      {selectedCard && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-2.5 text-xs text-muted-foreground">
          Filtrando por{" "}
          <span className="font-semibold text-foreground">{selectedCard.name.trim()}</span>{" "}
          ({selectedCard.bank}) — todos os KPIs e gráficos abaixo respeitam essa seleção.
        </div>
      )}

      {!credsOk && (
        <div className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm">
          <AlertTriangle className="mt-0.5 h-5 w-5 text-warning" />
          <div>
            <p className="font-medium text-foreground">Credenciais Pluggy ausentes</p>
            <p className="text-muted-foreground">
              Configure <code className="text-foreground">PLUGGY_CLIENT_ID</code> e{" "}
              <code className="text-foreground">PLUGGY_CLIENT_SECRET</code> no <code>.env</code>.
            </p>
          </div>
        </div>
      )}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={<Wallet className="h-4 w-4" />}
          label="Saldo total"
          value={formatBRL(ov.bankBalance)}
          tone="success"
          hint={`em ${ov.accountsCount > 0 ? cards.length + " cartões + " : ""}contas correntes`}
        />
        <KpiCard
          icon={<CreditCard className="h-4 w-4" />}
          label="Cartões usados"
          value={formatBRL(ov.creditUsed)}
          tone={ov.creditUsed > 0 ? "warning" : "muted"}
          hint={
            ov.creditAvailable > 0
              ? `${formatBRL(ov.creditAvailable)} disponíveis`
              : undefined
          }
        />
        <KpiCard
          icon={<ArrowDownRight className="h-4 w-4" />}
          label={`Gastos ${period}`}
          value={formatBRL(ov.monthSpend)}
          delta={spendDelta}
          tone="danger"
          invertDelta
        />
        <KpiCard
          icon={<ArrowUpRight className="h-4 w-4" />}
          label={`Entradas ${period}`}
          value={formatBRL(ov.monthIncome)}
          delta={incomeDelta}
          tone="success"
        />
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <KpiCard
          icon={<TrendingUp className="h-4 w-4" />}
          label={`Saldo ${period}`}
          value={formatBRL(ov.netCashflow)}
          delta={netDelta}
          tone={ov.netCashflow >= 0 ? "success" : "danger"}
          hint="entradas − saídas"
        />
        <KpiCard
          icon={<Receipt className="h-4 w-4" />}
          label="Ticket médio"
          value={formatBRL(ov.avgTicket)}
          tone="primary"
          hint={`${ov.monthTxCount} transações ${period}`}
        />
        <KpiCard
          icon={<Crown className="h-4 w-4" />}
          label="Maior gasto único"
          value={formatBRL(ov.biggestSpend)}
          tone="purple"
          hint={period}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <SectionCard
          className="lg:col-span-2"
          title="Gastos diários"
          description={params.from || params.to ? "Período selecionado" : "Últimos 30 dias"}
          action={
            <span className="rounded-md bg-secondary px-2 py-1 text-[11px] font-medium text-muted-foreground">
              {params.from || params.to ? "Personalizado" : "30d"}
            </span>
          }
        >
          <DailySpendChart data={daily} />
        </SectionCard>

        <SectionCard title="Por categoria" description={periodTitle(period)}>
          {byCat.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Sem gastos no período
            </p>
          ) : (
            <CategoryDonut data={byCat} />
          )}
        </SectionCard>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <SectionCard
          className="lg:col-span-2"
          title="Cashflow"
          description="Entradas vs saídas (12 meses)"
          action={
            <div className="flex items-center gap-3 text-[11px]">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span className="h-2 w-2 rounded-full bg-success" /> Entradas
              </span>
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span className="h-2 w-2 rounded-full bg-destructive" /> Saídas
              </span>
            </div>
          }
        >
          <CashflowChart data={cashflow} />
        </SectionCard>

        <SectionCard title="Top estabelecimentos" description={periodTitle(period)}>
          {merchants.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Sem dados ainda
            </p>
          ) : (
            <ul className="space-y-3">
              {merchants.map((m, i) => (
                <li key={m.name} className="flex items-center gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-secondary text-xs font-semibold text-muted-foreground">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{m.name}</p>
                    <p className="text-xs text-muted-foreground">{m.count} transações</p>
                  </div>
                  <span className="text-sm font-semibold tabular-nums text-foreground">
                    {formatBRL(m.total)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </section>

      {cards.length > 0 && (
        <SectionCard
          title="Cartões de crédito"
          description="Fatura atual aberta · próximo vencimento"
        >
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map((c) => {
              const noBreakdown = c.method === "BALANCE_ONLY";
              const methodLabel =
                c.method === "MANUAL"
                  ? "manual"
                  : c.method === "FUTURE_TXS"
                    ? "exato"
                    : c.method === "DESCRIPTION_PARSE"
                      ? "estimado"
                      : c.method === "CYCLE_DATE"
                        ? "ciclo"
                        : "limitado";
              const methodBadgeClass =
                c.method === "MANUAL"
                  ? "bg-warning/15 text-warning ring-1 ring-warning/40"
                  : c.method === "FUTURE_TXS"
                    ? "bg-success/15 text-success"
                    : c.method === "DESCRIPTION_PARSE"
                      ? "bg-primary/15 text-primary"
                      : c.method === "CYCLE_DATE"
                        ? "bg-[rgb(178,100,255)]/15 text-[rgb(178,100,255)]"
                        : "bg-warning/15 text-warning";
              return (
                <div
                  key={c.id}
                  className="relative overflow-hidden rounded-2xl glass top-highlight p-4 transition-colors hover:bg-elevated"
                >
                  <CardOverrideButton
                    accountId={c.id}
                    cardLabel={`${c.bank}${c.owner ? ` · ${c.owner.split(/\s+/)[0]}` : ""}`}
                    manualOpenBill={c.manualOpenBill}
                    manualOpenBillDueDate={
                      c.manualOpenBillDueDate
                        ? new Date(c.manualOpenBillDueDate).toISOString()
                        : null
                    }
                    defaultDueDate={
                      c.billDueDate ? new Date(c.billDueDate).toISOString() : null
                    }
                  />
                  <CreditCardVisual
                    cardName={c.name}
                    bankConnectorName={c.bank}
                    number={c.number}
                    owner={c.owner}
                  />
                  <div className="mt-4">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                        Fatura aberta
                      </p>
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${methodBadgeClass}`}
                      >
                        {methodLabel}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-end justify-between gap-2">
                      <p className="text-2xl font-semibold tabular-nums text-gradient-warning">
                        {formatBRL(c.used)}
                      </p>
                      <p className="pb-1 text-[11px] text-muted-foreground">
                        de {formatBRL(c.limit)}
                      </p>
                    </div>
                    <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-white/5">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.min(100, c.usedPct)}%`,
                          background:
                            c.usedPct > 80
                              ? "linear-gradient(90deg, #ff4566, #ff4566dd)"
                              : c.usedPct > 50
                                ? "linear-gradient(90deg, #ffb547, #ffb547dd)"
                                : "linear-gradient(90deg, #00f5a0, #00f5a0dd)",
                          boxShadow:
                            c.usedPct > 80
                              ? "0 0 12px #ff456688"
                              : c.usedPct > 50
                                ? "0 0 12px #ffb54788"
                                : "0 0 12px #00f5a088",
                        }}
                      />
                    </div>
                    <p className="mt-1.5 text-[11px] text-muted-foreground">
                      {c.usedPct.toFixed(0)}% do limite · {formatBRL(c.available)} livre
                    </p>
                    <div className="mt-3 space-y-1 border-t border-border pt-2.5 text-[11px] text-muted-foreground">
                      {c.futureInstallments > 0 && (
                        <p className="flex items-center justify-between">
                          <span>
                            {c.method === "CYCLE_DATE"
                              ? "Outros saldos"
                              : "Parcelas futuras"}
                          </span>
                          <span className="font-medium text-foreground">
                            +{formatBRL(c.futureInstallments)}
                          </span>
                        </p>
                      )}
                      <p className="flex items-center justify-between">
                        <span>Total acumulado</span>
                        <span className="font-medium text-foreground">
                          {formatBRL(c.totalBalance)}
                        </span>
                      </p>
                      {c.cycleCloseDate && (
                        <p className="flex items-center justify-between">
                          <span>Ciclo desde</span>
                          <span className="font-medium text-foreground">
                            {formatDateShort(c.cycleCloseDate)}
                          </span>
                        </p>
                      )}
                      {c.billDueDate && (
                        <p className="flex items-center justify-between">
                          <span>Próximo venc.</span>
                          <span className="font-medium text-foreground">
                            {formatDateShort(c.billDueDate)}
                          </span>
                        </p>
                      )}
                      {c.lastClosedBillAmount != null && c.lastClosedBillDueDate && (
                        <p className="flex items-center justify-between">
                          <span>
                            Fatura anterior
                            {c.lastClosedBillDueDate && (
                              <span className="text-muted-foreground/60">
                                {" "}
                                · venc {formatDateShort(c.lastClosedBillDueDate)}
                              </span>
                            )}
                          </span>
                          <span className="font-medium text-foreground">
                            {formatBRL(c.lastClosedBillAmount)}
                            {c.lastClosedBillPaidAmount != null &&
                              c.lastClosedBillPaidAmount > 0 && (
                                <span
                                  className={cn(
                                    "ml-1 text-[10px]",
                                    Math.abs(
                                      c.lastClosedBillPaidAmount - c.lastClosedBillAmount,
                                    ) < 1
                                      ? "text-success"
                                      : "text-warning",
                                  )}
                                >
                                  {Math.abs(
                                    c.lastClosedBillPaidAmount - c.lastClosedBillAmount,
                                  ) < 1
                                    ? "✓ paga"
                                    : `parcial`}
                                </span>
                              )}
                          </span>
                        </p>
                      )}
                      {noBreakdown && (
                        <p className="mt-1.5 rounded-md bg-warning/10 px-2 py-1.5 text-[10px] text-warning">
                          Open Finance não retornou parcelas futuras pra esse banco — exibindo total acumulado.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </SectionCard>
      )}

      <section className="grid gap-4 lg:grid-cols-3">
        <SectionCard
          className="lg:col-span-2"
          title="Transações recentes"
          description="Últimas 8 movimentações"
          action={
            <Link
              href="/transactions"
              className="text-xs font-medium text-primary hover:text-primary/80"
            >
              Ver todas →
            </Link>
          }
        >
          {recent.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhuma transação. Adicione um Item ID em{" "}
              <Link href="/settings" className="text-primary underline-offset-4 hover:underline">
                Configurações
              </Link>
              .
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {recent.map((t) => (
                <li key={t.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                      t.type === "DEBIT"
                        ? "bg-destructive/10 text-destructive"
                        : "bg-success/10 text-success"
                    }`}
                  >
                    {t.type === "DEBIT" ? (
                      <ArrowDownRight className="h-4 w-4" />
                    ) : (
                      <ArrowUpRight className="h-4 w-4" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{t.description}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatDateShort(t.date)} · {t.account.item.connectorName} · {t.account.name}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 text-sm font-semibold tabular-nums ${
                      t.type === "DEBIT" ? "text-destructive" : "text-success"
                    }`}
                  >
                    {t.type === "DEBIT" ? "−" : "+"}
                    {formatBRL(t.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Gastos por banco" description={periodTitle(period)}>
          {byBank.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Sem dados ainda
            </p>
          ) : (
            <BankBreakdown data={byBank} />
          )}
        </SectionCard>
      </section>
    </div>
  );
}
