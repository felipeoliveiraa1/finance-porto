import {
  CalendarClock,
  CreditCard,
  Hash,
  Repeat,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { KpiCard } from "@/components/kpi-card";
import { SectionCard } from "@/components/section-card";
import { BudgetRowEditor } from "@/components/budget-row-editor";
import { getRecurringExpenses, getMonthlyBudget } from "@/lib/queries";
import { translateCategory } from "@/lib/categories";
import { formatBRL, formatDateShort } from "@/lib/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function FixedPage() {
  const [budget, items] = await Promise.all([
    getMonthlyBudget(),
    getRecurringExpenses({ monthsBack: 6 }),
  ]);

  const subscriptions = items.filter((i) => !i.isInstallment);
  const installments = items.filter((i) => i.isInstallment);

  const tone =
    budget.totals.leftover >= 0
      ? "success"
      : budget.totals.leftover >= -1000
        ? "warning"
        : "danger";

  return (
    <div className="space-y-6">
      <header>
        <p className="mb-1 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">
          <Wallet className="h-3 w-3" />
          Orçamento mensal
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          <span className="text-gradient-primary">Gastos fixos</span>
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Receitas, despesas fixas e cartões esperados pro mês — o quanto sobra de
          fato. Edite os itens conforme cada mês muda.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="Receitas previstas"
          value={formatBRL(budget.totals.income)}
          tone="success"
          hint={`${budget.incomeSources.length} ${budget.incomeSources.length === 1 ? "fonte" : "fontes"}`}
        />
        <KpiCard
          icon={<TrendingDown className="h-4 w-4" />}
          label="Fixos do mês"
          value={formatBRL(budget.totals.fixed)}
          tone="warning"
          hint={`${budget.fixedExpenses.length} ${budget.fixedExpenses.length === 1 ? "conta" : "contas"}`}
        />
        <KpiCard
          icon={<CreditCard className="h-4 w-4" />}
          label="Cartões abertos"
          value={formatBRL(budget.totals.cards)}
          tone="purple"
          hint={`${budget.cardBills.length} ${budget.cardBills.length === 1 ? "cartão" : "cartões"}`}
        />
        <KpiCard
          icon={<Wallet className="h-4 w-4" />}
          label="Sobra prevista"
          value={formatBRL(budget.totals.leftover)}
          tone={tone}
          hint={
            budget.totals.leftover >= 0
              ? "Receita − fixos − cartões"
              : "Negativo — receita não cobre"
          }
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard
          title={
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-success" />
                Receitas
              </span>
              <BudgetRowEditor kind="income" triggerLabel="Adicionar" triggerIcon="add" />
            </div>
          }
          description="Fontes de renda mensais"
        >
          {budget.incomeSources.length === 0 ? (
            <EmptyState text="Nenhuma fonte de renda cadastrada." />
          ) : (
            <ul className="divide-y divide-border">
              {budget.incomeSources.map((i) => (
                <BudgetRow
                  key={i.id}
                  name={i.name}
                  amount={i.amount}
                  dueDay={i.dueDay}
                  owner={i.owner}
                  notes={i.notes}
                  positive
                  edit={
                    <BudgetRowEditor
                      kind="income"
                      initial={{
                        id: i.id,
                        name: i.name,
                        amount: i.amount,
                        dueDay: i.dueDay,
                        owner: i.owner,
                        notes: i.notes,
                      }}
                    />
                  }
                />
              ))}
              <li className="flex items-center justify-between pt-3 text-sm font-semibold">
                <span className="text-muted-foreground">Total</span>
                <span className="tabular-nums text-success">
                  {formatBRL(budget.totals.income)}
                </span>
              </li>
            </ul>
          )}
        </SectionCard>

        <SectionCard
          title={
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-warning" />
                Despesas fixas
              </span>
              <BudgetRowEditor kind="fixed" triggerLabel="Adicionar" triggerIcon="add" />
            </div>
          }
          description="Bills mensais com dia de vencimento"
        >
          {budget.fixedExpenses.length === 0 ? (
            <EmptyState text="Nenhuma despesa fixa cadastrada." />
          ) : (
            <ul className="divide-y divide-border">
              {budget.fixedExpenses.map((f) => (
                <BudgetRow
                  key={f.id}
                  name={f.name}
                  amount={f.amount}
                  dueDay={f.dueDay}
                  owner={f.owner}
                  notes={f.notes}
                  bucket={f.bucket}
                  edit={
                    <BudgetRowEditor
                      kind="fixed"
                      initial={{
                        id: f.id,
                        name: f.name,
                        amount: f.amount,
                        dueDay: f.dueDay,
                        owner: f.owner,
                        notes: f.notes,
                        bucket: f.bucket,
                      }}
                    />
                  }
                />
              ))}
              <li className="flex items-center justify-between pt-3 text-sm font-semibold">
                <span className="text-muted-foreground">Total</span>
                <span className="tabular-nums text-warning">
                  {formatBRL(budget.totals.fixed)}
                </span>
              </li>
            </ul>
          )}
        </SectionCard>
      </div>

      {budget.cardBills.length > 0 && (
        <SectionCard
          title={
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-[rgb(178,100,255)]" />
              Cartões a pagar
            </div>
          }
          description="Faturas abertas dos cartões — origem: dados sincronizados (com override manual quando configurado)"
        >
          <ul className="divide-y divide-border">
            {budget.cardBills.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <DueDayBadge day={c.dueDay} />
                  <p className="truncate text-sm font-medium text-foreground">
                    {c.label}
                  </p>
                </div>
                <p className="text-sm font-semibold tabular-nums text-foreground">
                  {formatBRL(c.amount)}
                </p>
              </li>
            ))}
            <li className="flex items-center justify-between pt-3 text-sm font-semibold">
              <span className="text-muted-foreground">Total cartões</span>
              <span className="tabular-nums text-[rgb(178,100,255)]">
                {formatBRL(budget.totals.cards)}
              </span>
            </li>
          </ul>
        </SectionCard>
      )}

      <SectionCard
        title={
          <div className="flex items-center gap-2">
            <Repeat className="h-4 w-4 text-primary" />
            <span>Detectado automaticamente nos últimos 6 meses</span>
          </div>
        }
        description="Padrões recorrentes que aparecem nas suas transações — assinaturas, parcelamentos. Use isso pra descobrir o que esqueceu de cadastrar acima."
      >
        {items.length === 0 ? (
          <EmptyState text="Nenhuma despesa recorrente detectada ainda. Sincronize mais transações." />
        ) : (
          <div className="space-y-5">
            {subscriptions.length > 0 && (
              <div>
                <p className="mb-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  Assinaturas e mensalidades ({subscriptions.length})
                </p>
                <RecurringList items={subscriptions} />
              </div>
            )}
            {installments.length > 0 && (
              <div>
                <p className="mb-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  Parcelamentos em curso ({installments.length})
                </p>
                <RecurringList items={installments} />
              </div>
            )}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="py-8 text-center text-sm text-muted-foreground">{text}</div>;
}

function DueDayBadge({ day }: { day: number | null }) {
  if (day == null) {
    return (
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-dashed border-border text-[10px] text-muted-foreground">
        —
      </span>
    );
  }
  return (
    <span className="inline-flex h-9 w-9 flex-col items-center justify-center rounded-md border border-border bg-secondary/40 text-foreground">
      <span className="text-[8px] uppercase leading-none tracking-wider text-muted-foreground">
        Dia
      </span>
      <span className="text-sm font-semibold leading-none tabular-nums">
        {String(day).padStart(2, "0")}
      </span>
    </span>
  );
}

function BudgetRow({
  name,
  amount,
  dueDay,
  owner,
  notes,
  bucket,
  positive,
  edit,
}: {
  name: string;
  amount: number;
  dueDay: number | null;
  owner: string | null;
  notes: string | null;
  bucket?: string | null;
  positive?: boolean;
  edit: React.ReactNode;
}) {
  return (
    <li className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
      <div className="flex min-w-0 items-center gap-3">
        <DueDayBadge day={dueDay} />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{name}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
            {bucket && (
              <span className="rounded-md border border-border bg-secondary/50 px-1.5 py-0.5 text-[10px]">
                {bucket}
              </span>
            )}
            {owner && <span>{owner}</span>}
            {notes && <span className="italic">{notes}</span>}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <p
          className={cn(
            "text-sm font-semibold tabular-nums",
            positive ? "text-success" : "text-foreground",
          )}
        >
          {positive ? "+" : ""}
          {formatBRL(amount)}
        </p>
        {edit}
      </div>
    </li>
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
