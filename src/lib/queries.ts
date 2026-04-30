import { db } from "./db";
import { translateCategory } from "./categories";
import { detectBankKey, BANK_LABEL, type BankKey } from "./bank";
import { buildExcludeInternalTransferFilter } from "./internal-transfer";

const RECENT_INSTALLMENT_DAYS = 60;
// Brazilian credit cards typically close ~9 days before due date
const DEFAULT_CLOSE_OFFSET_DAYS = 9;
// Matches bill-payment descriptions across BR banks: Nubank "Pagamento recebido",
// Santander "PAGAMENTO DE FATURA", Itaú "Pagamento da fatura", and a few variants.
const BILL_PAYMENT_REGEX =
  /pagamento\s+(recebido|efetuado|d[aeo]\s+fatura)|pgto\s+d[aeo]\s+fatura|estorno\s+pagamento|cred(i|í)to\s+pagamento/i;

/**
 * Estimates the "fatura atual em aberto" (current open bill) for a credit card.
 *
 * Pluggy's `account.balance` for a CREDIT account = current cycle bill + future
 * unbilled installments. Different banks expose installments differently:
 *  - Itaú returns future installments as transactions with `date > today`
 *  - Nubank doesn't, but encodes installments in description as "X/Y"
 *  - Some banks (e.g. Santander via this connector) expose neither, so we
 *    fall back to balance.
 *
 * Algorithm:
 *  1. If there are DEBIT txs with date > today, future installments = sum of them.
 *  2. Else parse "X/Y" from past tx descriptions (within RECENT_INSTALLMENT_DAYS).
 *     For each unique purchase (prefix+amount), implied future = (Y - maxX) * amount.
 *  3. Open bill = balance - estimated future installments.
 */
type OpenBillMethod = "FUTURE_TXS" | "DESCRIPTION_PARSE" | "CYCLE_DATE" | "BALANCE_ONLY";

async function computeOpenBills(): Promise<
  Map<
    string,
    {
      openBill: number;
      futureInstallments: number;
      method: OpenBillMethod;
      closeDate?: Date;
    }
  >
> {
  const cards = await db.account.findMany({
    where: { type: "CREDIT" },
    select: { id: true, balance: true, currentBillDueDate: true },
  });
  const today = new Date();
  const recentSince = new Date(today);
  recentSince.setDate(recentSince.getDate() - RECENT_INSTALLMENT_DAYS);

  const results = new Map<
    string,
    { openBill: number; futureInstallments: number; method: OpenBillMethod; closeDate?: Date }
  >();

  for (const c of cards) {
    // Method 1: future-dated transactions (Itaú-style)
    const futureSum = await db.transaction.aggregate({
      where: { accountId: c.id, type: "DEBIT", date: { gt: today } },
      _sum: { amount: true },
    });
    const futureFromDates = futureSum._sum.amount ?? 0;

    if (futureFromDates > 0) {
      results.set(c.id, {
        openBill: c.balance - futureFromDates,
        futureInstallments: futureFromDates,
        method: "FUTURE_TXS",
      });
      continue;
    }

    // Method 2: parse "X/Y" pattern in recent transaction descriptions (Nubank-style)
    const recent = await db.transaction.findMany({
      where: { accountId: c.id, type: "DEBIT", date: { lte: today, gte: recentSince } },
      select: { description: true, amount: true },
    });
    const purchases = new Map<string, { latestX: number; total: number; amount: number }>();
    for (const tx of recent) {
      const m = tx.description.match(/(\d+)\s*\/\s*(\d+)\s*$/);
      if (!m) continue;
      const X = Number(m[1]);
      const Y = Number(m[2]);
      if (!Number.isFinite(X) || !Number.isFinite(Y) || X >= Y || Y > 99) continue;
      const prefix = tx.description.replace(/(\d+)\s*\/\s*(\d+)\s*$/, "").trim();
      const key = `${prefix}|${tx.amount.toFixed(2)}`;
      const cur = purchases.get(key);
      if (!cur || X > cur.latestX) {
        purchases.set(key, { latestX: X, total: Y, amount: tx.amount });
      }
    }
    let futureFromDescriptions = 0;
    for (const p of purchases.values()) {
      futureFromDescriptions += (p.total - p.latestX) * p.amount;
    }
    if (futureFromDescriptions > 0) {
      results.set(c.id, {
        openBill: c.balance - futureFromDescriptions,
        futureInstallments: futureFromDescriptions,
        method: "DESCRIPTION_PARSE",
      });
      continue;
    }

    // Method 3: cycle-date estimation (Santander-style)
    // Sum net (DEBIT - CREDIT non-payment) from "last close ~= dueDate − 9 days" to today.
    if (c.currentBillDueDate) {
      const closeDate = new Date(c.currentBillDueDate);
      closeDate.setDate(closeDate.getDate() - DEFAULT_CLOSE_OFFSET_DAYS);
      closeDate.setHours(23, 59, 59, 999);

      const cycleTxs = await db.transaction.findMany({
        where: { accountId: c.id, date: { gt: closeDate, lte: today } },
        select: { amount: true, type: true, description: true, descriptionRaw: true },
      });
      let cycleNet = 0;
      for (const tx of cycleTxs) {
        const desc = `${tx.description} ${tx.descriptionRaw ?? ""}`.toLowerCase();
        const isBillPayment = tx.type === "CREDIT" && BILL_PAYMENT_REGEX.test(desc);
        if (isBillPayment) continue;
        cycleNet += tx.type === "DEBIT" ? tx.amount : -tx.amount;
      }
      if (cycleNet > 0) {
        results.set(c.id, {
          openBill: cycleNet,
          futureInstallments: Math.max(0, c.balance - cycleNet),
          method: "CYCLE_DATE",
          closeDate,
        });
        continue;
      }
    }

    // Method 4: balance-only fallback
    results.set(c.id, {
      openBill: c.balance,
      futureInstallments: 0,
      method: "BALANCE_ONLY",
    });
  }
  return results;
}

const startOfMonth = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
};

const startOfPrevMonth = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() - 1, 1);
};

const endOfPrevMonth = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 0, 23, 59, 59, 999);
};

const startOfMonthsAgo = (n: number) => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() - n, 1);
};

export type DateRange = { from: Date; to: Date };

/**
 * Resolves the active range. If none is provided, defaults to the current month.
 */
export function resolveRange(opts?: Partial<DateRange>): DateRange {
  const to = opts?.to ?? new Date();
  const from = opts?.from ?? startOfMonth();
  return { from, to };
}

/**
 * Computes the range immediately preceding `range`, of equal duration. Used
 * to compute deltas (current period vs previous equivalent period).
 */
export function previousRange(range: DateRange): DateRange {
  const fromMs = range.from.getTime();
  const toMs = range.to.getTime();
  const durationMs = toMs - fromMs;
  // Previous range ends 1ms before current range starts.
  const prevTo = new Date(fromMs - 1);
  const prevFrom = new Date(prevTo.getTime() - durationMs);
  return { from: prevFrom, to: prevTo };
}

type Filter = Partial<DateRange> & { accountId?: string; owner?: string };

/**
 * Returns the lowercased first names of all account owners in the workspace.
 * Used to populate the "Filtrar por pessoa" UI ([Felipe, Milena, ...]).
 */
export async function getOwnerFirstNames(): Promise<string[]> {
  const accounts = await db.account.findMany({
    select: { owner: true },
    where: { owner: { not: null } },
  });
  const seen = new Set<string>();
  for (const a of accounts) {
    const first = a.owner?.trim().split(/\s+/)[0]?.toLowerCase();
    if (first && first.length >= 3) seen.add(first);
  }
  return [...seen].sort();
}

function accountWhereFromFilter(filter?: Filter) {
  if (filter?.accountId) return { id: filter.accountId };
  if (filter?.owner)
    return {
      owner: { contains: filter.owner, mode: "insensitive" as const },
    };
  return {};
}

function txAccountWhereFromFilter(filter?: Filter) {
  if (filter?.accountId) return { accountId: filter.accountId };
  if (filter?.owner)
    return {
      account: { owner: { contains: filter.owner, mode: "insensitive" as const } },
    };
  return {};
}

export async function getOverview(filter?: Filter) {
  const accountWhere = accountWhereFromFilter(filter);
  const accounts = await db.account.findMany({
    where: accountWhere,
    select: {
      id: true,
      type: true,
      balance: true,
      subtype: true,
      creditLimit: true,
      availableCreditLimit: true,
      currentBillAmount: true,
    },
  });

  const bankBalance = accounts
    .filter((a) => a.type === "BANK")
    .reduce((sum, a) => sum + a.balance, 0);

  const openBills = await computeOpenBills();
  const creditUsed = accounts
    .filter((a) => a.type === "CREDIT")
    .reduce((sum, a) => sum + (openBills.get(a.id)?.openBill ?? a.balance), 0);

  const creditAvailable = accounts
    .filter((a) => a.type === "CREDIT")
    .reduce((sum, a) => sum + (a.availableCreditLimit ?? 0), 0);

  const r = resolveRange(filter);
  const prev = previousRange(r);
  const accountFilter = txAccountWhereFromFilter(filter);
  const internalFilter = await buildExcludeInternalTransferFilter();

  const [periodDebits, prevPeriodDebits, periodCredits, prevPeriodCredits] = await Promise.all([
    db.transaction.findMany({
      where: { ...accountFilter, ...internalFilter, date: { gte: r.from, lte: r.to }, type: "DEBIT" },
      select: { amount: true },
    }),
    db.transaction.findMany({
      where: { ...accountFilter, ...internalFilter, date: { gte: prev.from, lte: prev.to }, type: "DEBIT" },
      select: { amount: true },
    }),
    db.transaction.findMany({
      where: { ...accountFilter, ...internalFilter, date: { gte: r.from, lte: r.to }, type: "CREDIT" },
      select: { amount: true },
    }),
    db.transaction.findMany({
      where: { ...accountFilter, ...internalFilter, date: { gte: prev.from, lte: prev.to }, type: "CREDIT" },
      select: { amount: true },
    }),
  ]);

  const monthSpend = periodDebits.reduce((s, t) => s + t.amount, 0);
  const prevMonthSpend = prevPeriodDebits.reduce((s, t) => s + t.amount, 0);
  const monthIncome = periodCredits.reduce((s, t) => s + t.amount, 0);
  const prevMonthIncome = prevPeriodCredits.reduce((s, t) => s + t.amount, 0);

  const biggestSpend = periodDebits.length ? Math.max(...periodDebits.map((t) => t.amount)) : 0;
  const avgTicket = periodDebits.length ? monthSpend / periodDebits.length : 0;

  return {
    bankBalance,
    creditUsed,
    creditAvailable,
    monthSpend,
    prevMonthSpend,
    monthIncome,
    prevMonthIncome,
    netCashflow: monthIncome - monthSpend,
    prevNetCashflow: prevMonthIncome - prevMonthSpend,
    biggestSpend,
    avgTicket,
    monthTxCount: periodDebits.length + periodCredits.length,
    accountsCount: accounts.length,
    range: { from: r.from.toISOString(), to: r.to.toISOString() },
  };
}

export async function getRecentTransactions(limit = 10) {
  return db.transaction.findMany({
    orderBy: { date: "desc" },
    take: limit,
    include: {
      account: {
        select: {
          name: true,
          type: true,
          item: { select: { connectorName: true, connectorImageUrl: true, connectorPrimaryColor: true } },
        },
      },
    },
  });
}

export async function getSpendByCategory(filter?: Filter) {
  const r = resolveRange(filter);
  const accountFilter = txAccountWhereFromFilter(filter);
  const internalFilter = await buildExcludeInternalTransferFilter();
  const txs = await db.transaction.findMany({
    where: { ...accountFilter, ...internalFilter, date: { gte: r.from, lte: r.to }, type: "DEBIT" },
    select: {
      amount: true,
      pluggyCategory: true,
      pluggyCategoryId: true,
      userCategory: { select: { name: true, emoji: true } },
    },
  });
  const byCat = new Map<string, { name: string; emoji?: string | null; total: number; count: number }>();
  for (const t of txs) {
    const name =
      t.userCategory?.name ??
      translateCategory(t.pluggyCategoryId, t.pluggyCategory) ??
      "Sem categoria";
    const emoji = t.userCategory?.emoji ?? null;
    const cur = byCat.get(name) ?? { name, emoji, total: 0, count: 0 };
    cur.total += t.amount;
    cur.count += 1;
    byCat.set(name, cur);
  }
  return [...byCat.values()].sort((a, b) => b.total - a.total);
}

export async function getSpendByBank(filter?: Filter) {
  const r = resolveRange(filter);
  const accountFilter = txAccountWhereFromFilter(filter);
  const internalFilter = await buildExcludeInternalTransferFilter();
  const txs = await db.transaction.findMany({
    where: { ...accountFilter, ...internalFilter, date: { gte: r.from, lte: r.to }, type: "DEBIT" },
    select: {
      amount: true,
      account: {
        select: {
          name: true,
          owner: true,
          item: {
            select: { id: true, connectorName: true, connectorPrimaryColor: true },
          },
        },
      },
    },
  });

  // Aggregate per Item (= per real bank connection). For each, infer the bank
  // from the account names within that item.
  type Bucket = {
    itemId: string;
    bankKey: BankKey;
    ownerFirstName: string;
    color?: string | null;
    total: number;
    count: number;
    sampleAccountName: string;
  };
  const byItem = new Map<string, Bucket>();
  for (const t of txs) {
    const item = t.account.item;
    let cur = byItem.get(item.id);
    if (!cur) {
      cur = {
        itemId: item.id,
        bankKey: detectBankKey(t.account.name, item.connectorName),
        ownerFirstName: ((t.account.owner ?? "").trim().split(/\s+/)[0] ?? "").toLowerCase(),
        color: item.connectorPrimaryColor,
        total: 0,
        count: 0,
        sampleAccountName: t.account.name,
      };
      byItem.set(item.id, cur);
    }
    cur.total += t.amount;
    cur.count += 1;
  }

  // Disambiguate items that resolve to the same bank (e.g. Felipe and Milena
  // both have Santander) by appending the owner's first name.
  const bankFrequency = new Map<BankKey, number>();
  for (const b of byItem.values()) {
    bankFrequency.set(b.bankKey, (bankFrequency.get(b.bankKey) ?? 0) + 1);
  }

  const titleCase = (s: string) =>
    s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : s;

  return [...byItem.values()]
    .map((b) => {
      const baseLabel = BANK_LABEL[b.bankKey];
      const needsOwner = (bankFrequency.get(b.bankKey) ?? 0) > 1 && b.ownerFirstName;
      const name = needsOwner ? `${baseLabel} · ${titleCase(b.ownerFirstName)}` : baseLabel;
      return {
        id: b.itemId,
        name,
        color: b.color,
        total: b.total,
        count: b.count,
      };
    })
    .sort((a, b) => b.total - a.total);
}

export async function getDailySpendSeries(
  opts?: { days?: number; accountId?: string; owner?: string } & Partial<DateRange>,
) {
  let start: Date;
  let end: Date;
  if (opts?.from || opts?.to) {
    const r = resolveRange(opts);
    start = new Date(r.from);
    start.setHours(0, 0, 0, 0);
    end = new Date(r.to);
    end.setHours(23, 59, 59, 999);
  } else {
    const days = opts?.days ?? 30;
    end = new Date();
    start = new Date();
    start.setDate(start.getDate() - days);
    start.setHours(0, 0, 0, 0);
  }
  const accountFilter = txAccountWhereFromFilter(opts);
  const internalFilter = await buildExcludeInternalTransferFilter();
  const txs = await db.transaction.findMany({
    where: { ...accountFilter, ...internalFilter, date: { gte: start, lte: end }, type: "DEBIT" },
    select: { amount: true, date: true },
    orderBy: { date: "asc" },
  });
  const byDay = new Map<string, number>();
  const dayMs = 86400000;
  const totalDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / dayMs));
  for (let i = 0; i <= totalDays; i++) {
    const d = new Date(start.getTime() + i * dayMs);
    byDay.set(d.toISOString().slice(0, 10), 0);
  }
  for (const t of txs) {
    const k = new Date(t.date).toISOString().slice(0, 10);
    byDay.set(k, (byDay.get(k) ?? 0) + t.amount);
  }
  return [...byDay.entries()].map(([date, amount]) => ({ date, amount }));
}

export async function getMonthlyCashflowSeries(
  months = 12,
  accountId?: string,
  owner?: string,
) {
  const start = startOfMonthsAgo(months - 1);
  const accountFilter = txAccountWhereFromFilter({ accountId, owner });
  const internalFilter = await buildExcludeInternalTransferFilter();
  const txs = await db.transaction.findMany({
    where: { ...accountFilter, ...internalFilter, date: { gte: start } },
    select: { amount: true, date: true, type: true },
  });
  const series: { month: string; income: number; expense: number; net: number }[] = [];
  for (let i = 0; i < months; i++) {
    const d = startOfMonthsAgo(months - 1 - i);
    series.push({
      month: d.toISOString().slice(0, 7),
      income: 0,
      expense: 0,
      net: 0,
    });
  }
  for (const t of txs) {
    const k = new Date(t.date).toISOString().slice(0, 7);
    const row = series.find((s) => s.month === k);
    if (!row) continue;
    if (t.type === "DEBIT") row.expense += t.amount;
    else row.income += t.amount;
  }
  for (const r of series) r.net = r.income - r.expense;
  return series;
}

export async function getTopMerchants(limit = 5, filter?: Filter) {
  const r = resolveRange(filter);
  const accountFilter = txAccountWhereFromFilter(filter);
  const internalFilter = await buildExcludeInternalTransferFilter();
  const txs = await db.transaction.findMany({
    where: { ...accountFilter, ...internalFilter, date: { gte: r.from, lte: r.to }, type: "DEBIT" },
    select: { amount: true, merchantName: true, description: true },
  });
  const byMerchant = new Map<string, { name: string; total: number; count: number }>();
  for (const t of txs) {
    const name = t.merchantName ?? t.description.split(/\s{2,}|\s+\d/)[0].trim() ?? "Outros";
    const cur = byMerchant.get(name) ?? { name, total: 0, count: 0 };
    cur.total += t.amount;
    cur.count += 1;
    byMerchant.set(name, cur);
  }
  return [...byMerchant.values()].sort((a, b) => b.total - a.total).slice(0, limit);
}

export async function getCreditCardUsage(opts?: { owner?: string }) {
  const ownerWhere = opts?.owner
    ? { owner: { contains: opts.owner, mode: "insensitive" as const } }
    : {};
  const [cards, openBills] = await Promise.all([
    db.account.findMany({
      where: { type: "CREDIT", ...ownerWhere },
      include: { item: { select: { connectorName: true, connectorPrimaryColor: true } } },
      orderBy: { balance: "desc" },
    }),
    computeOpenBills(),
  ]);
  return cards.map((c) => {
    const computed = openBills.get(c.id);
    const openBill = computed?.openBill ?? c.balance;
    // Resolve the real bank name from the card name (Pluggy reports
    // everything as "MeuPluggy" via the meu.pluggy.ai connector).
    const bankKey = detectBankKey(c.name, c.item.connectorName);
    const bankLabel = BANK_LABEL[bankKey];
    return {
      id: c.id,
      name: c.name,
      number: c.number ?? null,
      owner: c.owner ?? null,
      bank: bankLabel,
      color: c.item.connectorPrimaryColor,
      used: openBill,
      totalBalance: c.balance,
      futureInstallments: computed?.futureInstallments ?? 0,
      method: computed?.method ?? "BALANCE_ONLY",
      cycleCloseDate: computed?.closeDate ?? null,
      limit: c.creditLimit ?? 0,
      available: c.availableCreditLimit ?? 0,
      usedPct: c.creditLimit && c.creditLimit > 0 ? (openBill / c.creditLimit) * 100 : 0,
      billDueDate: c.currentBillDueDate ?? null,
      billMinimum: c.currentBillMinimum ?? null,
    };
  });
}

export async function getAccountsWithItem() {
  return db.account.findMany({
    include: { item: true },
    orderBy: [{ item: { connectorName: "asc" } }, { name: "asc" }],
  });
}

export async function getItemsWithCounts() {
  return db.item.findMany({
    include: {
      _count: { select: { accounts: true } },
      accounts: { select: { _count: { select: { transactions: true } } } },
    },
    orderBy: { connectorName: "asc" },
  });
}

export async function getLastSync() {
  return db.syncLog.findFirst({
    where: { finishedAt: { not: null } },
    orderBy: { finishedAt: "desc" },
  });
}

type TransactionFilters = {
  accountId?: string;
  type?: "DEBIT" | "CREDIT";
  categoryIds?: string[];
  dateFrom?: Date;
  dateTo?: Date;
};

function buildCategoryWhere(ids: string[]) {
  const hasNone = ids.includes("__none__");
  const realIds = ids.filter((id) => id !== "__none__");
  if (hasNone && realIds.length === 0) return { pluggyCategoryId: null };
  if (hasNone && realIds.length > 0) {
    return {
      OR: [{ pluggyCategoryId: null }, { pluggyCategoryId: { in: realIds } }],
    };
  }
  return { pluggyCategoryId: { in: realIds } };
}

function buildTransactionWhere(opts: TransactionFilters) {
  const dateRange =
    opts.dateFrom || opts.dateTo
      ? {
          date: {
            ...(opts.dateFrom ? { gte: opts.dateFrom } : {}),
            ...(opts.dateTo ? { lte: opts.dateTo } : {}),
          },
        }
      : {};
  return {
    ...(opts.accountId ? { accountId: opts.accountId } : {}),
    ...(opts.type ? { type: opts.type } : {}),
    ...(opts.categoryIds && opts.categoryIds.length > 0
      ? buildCategoryWhere(opts.categoryIds)
      : {}),
    ...dateRange,
  };
}

// Pluggy category IDs that should NOT count as "fixed expense":
// transferências entre contas próprias (04*), pagamento de cartão (05100000),
// outras transferências internas e cashback.
const NON_EXPENSE_CATEGORY_IDS = new Set([
  "04000000",
  "04010000",
  "04020000",
  "04030000",
  "05060000",
  "05100000",
  "08090000", // Cashback
]);

export type RecurringExpense = {
  signature: string;
  label: string;
  category: string | null;
  categoryId: string | null;
  avgAmount: number;
  minAmount: number;
  maxAmount: number;
  occurrences: number;
  avgIntervalDays: number;
  lastSeen: Date;
  nextExpected: Date | null;
  isInstallment: boolean;
  installmentTotal: number | null;
  installmentCurrent: number | null;
  installmentsRemaining: number | null;
  totalSpent: number;
  monthlyEstimate: number;
  recentSamples: { date: Date; amount: number; description: string }[];
};

/**
 * Detect recurring expenses (subscriptions + parceled purchases) from the
 * user's transactions. Heuristic:
 *  - merchantName (or normalized description prefix) appears ≥3 times
 *  - average interval between occurrences is 25–40 days
 *  - amounts are within 3× of each other
 *  - excludes bill payments, transfers between own accounts, cashback
 */
export async function getRecurringExpenses(opts?: {
  monthsBack?: number;
}): Promise<RecurringExpense[]> {
  const monthsBack = opts?.monthsBack ?? 6;
  const since = new Date();
  since.setMonth(since.getMonth() - monthsBack);

  const internalFilter = await buildExcludeInternalTransferFilter();
  const txs = await db.transaction.findMany({
    where: { ...internalFilter, type: "DEBIT", date: { gte: since } },
    select: {
      merchantName: true,
      description: true,
      amount: true,
      date: true,
      pluggyCategory: true,
      pluggyCategoryId: true,
    },
    orderBy: { date: "asc" },
  });

  // Group by signature: merchantName when available, else normalized description prefix
  const groups = new Map<string, typeof txs>();
  for (const t of txs) {
    if (t.pluggyCategoryId && NON_EXPENSE_CATEGORY_IDS.has(t.pluggyCategoryId)) continue;
    let key: string;
    if (t.merchantName?.trim()) {
      key = t.merchantName.toLowerCase().trim();
    } else {
      const norm = t.description
        .replace(/(\d+)\s*\/\s*(\d+)\s*$/, "")
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      // Skip very generic descriptions
      if (norm.length < 5) continue;
      // Skip bill payment style descriptions defensively (already filtered by category id but
      // some banks don't tag them).
      if (/pagamento\s+(de|da|do)\s+fatura|pagamento\s+recebido|pagamento\s+efetuado/.test(norm))
        continue;
      key = norm.split(" ").slice(0, 5).join(" ");
    }
    if (!key) continue;
    const arr = groups.get(key) ?? [];
    arr.push(t);
    groups.set(key, arr);
  }

  const results: RecurringExpense[] = [];

  for (const [signature, group] of groups.entries()) {
    if (group.length < 3) continue;
    const sorted = [...group].sort((a, b) => a.date.getTime() - b.date.getTime());

    const intervals: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const diffDays =
        (sorted[i].date.getTime() - sorted[i - 1].date.getTime()) / (24 * 3600 * 1000);
      intervals.push(diffDays);
    }
    const avgInterval = intervals.reduce((s, x) => s + x, 0) / intervals.length;
    if (avgInterval < 20 || avgInterval > 45) continue;

    const monthlyIntervals = intervals.filter((i) => i >= 22 && i <= 40).length;
    if (monthlyIntervals / intervals.length < 0.6) continue;

    const amounts = sorted.map((s) => s.amount);
    const minAmount = Math.min(...amounts);
    const maxAmount = Math.max(...amounts);
    if (maxAmount / minAmount > 3) continue;
    const avgAmount = amounts.reduce((s, a) => s + a, 0) / amounts.length;

    // Detect installments via X/Y pattern in any of the sampled descriptions
    const installmentMatch = sorted
      .map((s) => s.description.match(/(\d+)\s*\/\s*(\d+)/))
      .filter((m): m is RegExpMatchArray => Boolean(m));
    const isInstallment = installmentMatch.length > 0;
    let installmentTotal: number | null = null;
    let installmentCurrent: number | null = null;
    let installmentsRemaining: number | null = null;
    if (isInstallment) {
      installmentTotal = Math.max(...installmentMatch.map((m) => Number(m[2])));
      installmentCurrent = Math.max(...installmentMatch.map((m) => Number(m[1])));
      installmentsRemaining = Math.max(0, installmentTotal - installmentCurrent);
    }

    const lastSeen = sorted[sorted.length - 1].date;
    const nextExpected = new Date(lastSeen);
    nextExpected.setDate(nextExpected.getDate() + Math.round(avgInterval));

    // For an installment that's already finished, drop it from the list.
    if (isInstallment && installmentsRemaining === 0 && lastSeen.getTime() < Date.now() - 60 * 86400 * 1000) {
      continue;
    }

    const monthlyEstimate = isInstallment && installmentsRemaining === 0 ? 0 : avgAmount;
    const totalSpent = amounts.reduce((s, a) => s + a, 0);

    results.push({
      signature,
      label: humanize(signature, sorted),
      category: sorted[sorted.length - 1].pluggyCategory ?? null,
      categoryId: sorted[sorted.length - 1].pluggyCategoryId ?? null,
      avgAmount,
      minAmount,
      maxAmount,
      occurrences: sorted.length,
      avgIntervalDays: avgInterval,
      lastSeen,
      nextExpected: isInstallment && installmentsRemaining === 0 ? null : nextExpected,
      isInstallment,
      installmentTotal,
      installmentCurrent,
      installmentsRemaining,
      totalSpent,
      monthlyEstimate,
      recentSamples: sorted.slice(-3).map((s) => ({
        date: s.date,
        amount: s.amount,
        description: s.description,
      })),
    });
  }

  return results.sort((a, b) => b.monthlyEstimate - a.monthlyEstimate);
}

function humanize(signature: string, samples: { description: string; merchantName: string | null }[]): string {
  // Prefer the merchantName when available, otherwise capitalize the signature words.
  const withMerchant = samples.find((s) => s.merchantName);
  if (withMerchant?.merchantName) return withMerchant.merchantName.trim();
  return signature
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export async function listTransactions(opts: TransactionFilters & {
  page?: number;
  pageSize?: number;
}) {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(200, opts.pageSize ?? 50);
  const where = buildTransactionWhere(opts);
  const [items, total] = await Promise.all([
    db.transaction.findMany({
      where,
      orderBy: { date: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        account: {
          select: {
            name: true,
            type: true,
            item: { select: { connectorName: true, connectorPrimaryColor: true } },
          },
        },
      },
    }),
    db.transaction.count({ where }),
  ]);
  return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

/**
 * Distinct categories present in the transaction set (optionally filtered
 * by accountId/type), with PT-BR name, total amount and count. Sorted by
 * count desc so the most-used categories surface first.
 */
export async function getCategoriesInScope(
  opts: Omit<TransactionFilters, "categoryIds">,
) {
  // Categories list is computed without applying the category filter itself,
  // so the user always sees the universe of categories available in the
  // surrounding scope (account/type/date) regardless of current selection.
  const where = buildTransactionWhere(opts);
  const grouped = await db.transaction.groupBy({
    by: ["pluggyCategoryId", "pluggyCategory"],
    where,
    _count: true,
    _sum: { amount: true },
  });
  const totalCount = grouped.reduce((s, g) => s + g._count, 0);
  const noCategoryCount = grouped
    .filter((g) => !g.pluggyCategoryId && !g.pluggyCategory)
    .reduce((s, g) => s + g._count, 0);

  // Merge entries with same id (different category names) just in case
  const map = new Map<
    string,
    { id: string; name: string; count: number; total: number }
  >();
  for (const g of grouped) {
    const id = g.pluggyCategoryId ?? "__none__";
    const ptName =
      translateCategory(g.pluggyCategoryId, g.pluggyCategory) ?? "Sem categoria";
    const cur = map.get(id) ?? { id, name: ptName, count: 0, total: 0 };
    cur.count += g._count;
    cur.total += g._sum.amount ?? 0;
    map.set(id, cur);
  }
  const categories = [...map.values()].sort((a, b) => b.count - a.count);
  return { categories, totalCount, noCategoryCount };
}
