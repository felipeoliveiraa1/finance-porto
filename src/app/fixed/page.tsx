import { CalendarClock, CreditCard, Hash, Repeat, TrendingDown } from "lucide-react";
import { KpiCard } from "@/components/kpi-card";
import { SectionCard } from "@/components/section-card";
import { getRecurringExpenses } from "@/lib/queries";
import { translateCategory } from "@/lib/categories";
import { formatBRL, formatDateShort } from "@/lib/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function FixedPage() {
  const items = await getRecurringExpenses({ monthsBack: 6 });

  const subscriptions = items.filter((i) => !i.isInstallment);
  const installments = items.filter((i) => i.isInstallment);

  const monthlySubsTotal = subscriptions.reduce((s, i) => s + i.monthlyEstimate, 0);
  const monthlyInstTotal = installments.reduce((s, i) => s + i.monthlyEstimate, 0);
  const monthlyTotal = monthlySubsTotal + monthlyInstTotal;
  const annualProjection = monthlyTotal * 12;
  const remainingInstallmentsTotal = installments.reduce(
    (s, i) => s + (i.installmentsRemaining ?? 0) * i.avgAmount,
    0,
  );

  return (
    <div className="space-y-6">
      <header>
        <p className="mb-1 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">
          <Repeat className="h-3 w-3" />
          {items.length} despesas recorrentes detectadas
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          <span className="text-gradient-primary">Gastos fixos</span>
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Despesas que se repetem mensalmente — assinaturas, parcelas, contas. Detectado
          automaticamente nos últimos 6 meses.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={<TrendingDown className="h-4 w-4" />}
          label="Fixos por mês"
          value={formatBRL(monthlyTotal)}
          tone="warning"
          hint={`${items.length} ${items.length === 1 ? "despesa" : "despesas"}`}
        />
        <KpiCard
          icon={<Repeat className="h-4 w-4" />}
          label="Assinaturas"
          value={formatBRL(monthlySubsTotal)}
          tone="primary"
          hint={`${subscriptions.length} ${subscriptions.length === 1 ? "ativa" : "ativas"}`}
        />
        <KpiCard
          icon={<CreditCard className="h-4 w-4" />}
          label="Parcelas em curso"
          value={formatBRL(monthlyInstTotal)}
          tone="purple"
          hint={`${installments.length} ${installments.length === 1 ? "parcelamento" : "parcelamentos"}`}
        />
        <KpiCard
          icon={<CalendarClock className="h-4 w-4" />}
          label="Projeção anual"
          value={formatBRL(annualProjection)}
          tone="danger"
          hint={`+${formatBRL(remainingInstallmentsTotal)} a quitar em parcelas`}
        />
      </section>

      {subscriptions.length > 0 && (
        <SectionCard
          title={
            <div className="flex items-center gap-2">
              <Repeat className="h-4 w-4 text-primary" />
              <span>Assinaturas e despesas mensais</span>
            </div>
          }
          description="Cobranças que se repetem indefinidamente"
        >
          <RecurringList items={subscriptions} />
        </SectionCard>
      )}

      {installments.length > 0 && (
        <SectionCard
          title={
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-[rgb(178,100,255)]" />
              <span>Parcelamentos em curso</span>
            </div>
          }
          description="Compras parceladas com fim previsto"
        >
          <RecurringList items={installments} />
        </SectionCard>
      )}

      {items.length === 0 && (
        <SectionCard>
          <div className="py-12 text-center text-sm text-muted-foreground">
            Nenhuma despesa recorrente detectada ainda. Sincronize mais transações
            (precisamos de pelo menos 3 meses de histórico).
          </div>
        </SectionCard>
      )}
    </div>
  );
}

function RecurringList({
  items,
}: {
  items: Awaited<ReturnType<typeof getRecurringExpenses>>;
}) {
  return (
    <ul className="divide-y divide-border">
      {items.map((r) => {
        const cat = translateCategory(r.categoryId, r.category);
        return (
          <li
            key={r.signature}
            className="grid grid-cols-12 items-center gap-3 py-3 first:pt-0 last:pb-0"
          >
            <div className="col-span-12 sm:col-span-5">
              <p className="truncate text-sm font-medium text-foreground">{r.label}</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                {cat && (
                  <span className="rounded-md border border-border bg-secondary/50 px-1.5 py-0.5 text-[10px]">
                    {cat}
                  </span>
                )}
                <span className="inline-flex items-center gap-1">
                  <Hash className="h-3 w-3" /> {r.occurrences}× nos últimos meses
                </span>
              </p>
            </div>
            <div className="col-span-6 sm:col-span-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Valor médio
              </p>
              <p className="text-sm font-semibold tabular-nums text-foreground">
                {formatBRL(r.avgAmount)}
              </p>
              {r.maxAmount - r.minAmount > 0.5 && (
                <p className="text-[10px] text-muted-foreground">
                  varia {formatBRL(r.minAmount)} – {formatBRL(r.maxAmount)}
                </p>
              )}
            </div>
            <div className="col-span-6 sm:col-span-2">
              {r.isInstallment ? (
                <>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Parcelas
                  </p>
                  <p className="text-sm font-semibold text-foreground">
                    {r.installmentCurrent}/{r.installmentTotal}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {r.installmentsRemaining} restantes
                  </p>
                </>
              ) : (
                <>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Frequência
                  </p>
                  <p className="text-sm font-semibold text-foreground">
                    a cada {Math.round(r.avgIntervalDays)}d
                  </p>
                </>
              )}
            </div>
            <div className="col-span-12 sm:col-span-2 text-left sm:text-right">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {r.nextExpected ? "Próx. cobrança" : "Última"}
              </p>
              <p
                className={cn(
                  "text-sm font-semibold",
                  r.nextExpected ? "text-warning" : "text-muted-foreground",
                )}
              >
                {r.nextExpected
                  ? formatDateShort(r.nextExpected)
                  : formatDateShort(r.lastSeen)}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
