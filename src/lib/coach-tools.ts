import type OpenAI from "openai";
import { db } from "./db";
import { translateCategory } from "./categories";
import {
  getCreditCardUsage,
  getRecurringExpenses,
  getTopMerchants,
} from "./queries";
import { buildExcludeInternalTransferFilter } from "./internal-transfer";

// ─── Helpers ────────────────────────────────────────────────────────────────

const startOfMonth = (offsetMonths = 0) => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + offsetMonths, 1);
};

const endOfMonth = (offsetMonths = 0) => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + offsetMonths + 1, 0, 23, 59, 59, 999);
};

const parseDateBoundary = (iso: string | undefined, isEnd = false): Date | undefined => {
  if (!iso) return undefined;
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return undefined;
  return new Date(
    Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), isEnd ? 23 : 0, isEnd ? 59 : 0, isEnd ? 59 : 0, 0),
  );
};

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

// ─── Tool definitions (OpenAI function-tool format) ─────────────────────────

export const COACH_TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "get_monthly_summary",
      description:
        "Retorna o resumo financeiro do usuário num período: total de receitas, total de gastos, saldo do período (receitas − gastos), maior gasto único, ticket médio, e as 5 maiores categorias de gasto. Use sempre que precisar de visão geral de um mês.",
      parameters: {
        type: "object",
        properties: {
          monthsBack: {
            type: "integer",
            description:
              "Quantos meses atrás começar. 0 = mês corrente, 1 = mês passado, 3 = começa há 3 meses. Default 0.",
          },
          monthsRange: {
            type: "integer",
            description:
              "Quantos meses incluir a partir do início. Default 1 (apenas o mês indicado).",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_spend_by_category",
      description:
        "Retorna gastos agrupados por categoria (Mercado, Restaurantes, Delivery, etc.) num intervalo, ordenados por valor decrescente. Inclui total, quantidade de transações e percentual sobre o total. Use quando o usuário perguntar 'em que gastei?' ou pedir análise por tipo de gasto.",
      parameters: {
        type: "object",
        properties: {
          from: {
            type: "string",
            description: "Data inicial inclusive, formato YYYY-MM-DD. Default: início do mês corrente.",
          },
          to: {
            type: "string",
            description: "Data final inclusive, formato YYYY-MM-DD. Default: hoje.",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_recurring_expenses",
      description:
        "Lista as despesas recorrentes detectadas automaticamente (assinaturas, parcelas, contas mensais). Cada item traz valor médio, número de ocorrências, próximo vencimento esperado, se é parcelamento (com X de Y restantes), categoria, e estimativa mensal. Use ao discutir gastos fixos, oportunidades de cortar assinaturas, ou planejamento de orçamento.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_top_merchants",
      description:
        "Top estabelecimentos por valor gasto num intervalo. Retorna nome, total gasto e número de transações. Use quando o usuário perguntar 'onde gastei mais?' ou ao identificar concentração de gastos.",
      parameters: {
        type: "object",
        properties: {
          from: {
            type: "string",
            description: "YYYY-MM-DD inclusive. Default: início do mês corrente.",
          },
          to: { type: "string", description: "YYYY-MM-DD inclusive. Default: hoje." },
          limit: {
            type: "integer",
            description: "Quantos retornar. Default 10. Máximo 30.",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_credit_card_overview",
      description:
        "Estado atual de cada cartão de crédito: banco, nome, fatura atual aberta (estimada), método de cálculo da estimativa (exato/estimado/ciclo/limitado), saldo total acumulado, limite total, limite disponível, % usado e próximo vencimento. Use ao falar de cartões, faturas, organização de pagamentos ou quando o usuário precisar entender o quadro de cartões.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_account_balances",
      description:
        "Saldo atual de TODAS as contas (correntes + cartões de crédito). Retorna nome da conta, banco, dono (Felipe ou Milena), tipo (BANK ou CREDIT), saldo atual, e — pra cartões — a fatura aberta + limite disponível. Use sempre que o usuário perguntar sobre saldo, dinheiro disponível, posição de contas, ou quanto tem em qual banco.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "remember_note",
      description:
        "Salva uma anotação de memória de longo prazo sobre o usuário (preferência, meta financeira, limite, contexto pessoal, hábito, etc). Essas notas ficam disponíveis em todas as conversas futuras (via WhatsApp e browser, pra ambos os usuários do workspace). Use quando o usuário compartilhar algo que valha a pena lembrar pra próximas conversas (ex: 'minha meta é juntar 10k até dezembro', 'gosto de pagar tudo via PIX', 'limite informal de R$ 500 em delivery'). NUNCA salve dados sensíveis (CPF, senhas, números de cartão).",
      parameters: {
        type: "object",
        properties: {
          content: {
            type: "string",
            description:
              "Texto curto e factual da anotação. Em primeira pessoa do usuário sempre que possível. Ex: 'Quer cortar 30% de gastos com delivery'.",
          },
          category: {
            type: "string",
            enum: ["preference", "goal", "limit", "fact", "context", "habit", "concern"],
            description:
              "Tipo da nota: preference=preferência, goal=meta, limit=limite/teto, fact=fato sobre vida do usuário, context=contexto temporário, habit=hábito identificado, concern=preocupação relatada.",
          },
          source: {
            type: "string",
            description:
              "Opcional: nome do usuário que disse isso (ex: 'felipe' ou 'milena'). Use quando souber.",
          },
        },
        required: ["content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "recall_notes",
      description:
        "Lista as anotações de memória salvas. Já são automaticamente carregadas no início de cada conversa, mas use essa tool quando precisar revisar TUDO que sabe sobre o usuário antes de uma análise mais profunda.",
      parameters: {
        type: "object",
        properties: {
          category: {
            type: "string",
            description: "Filtrar por categoria específica.",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "forget_note",
      description:
        "Apaga uma anotação que não vale mais (ex: meta atingida, preferência mudou). Use o ID retornado por recall_notes.",
      parameters: {
        type: "object",
        properties: { id: { type: "string", description: "ID da nota a apagar." } },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_transactions",
      description:
        "Lista até 50 transações individuais filtradas por intervalo, categoria ou conta. Use para análise pontual (ex: 'me mostra os pedidos do iFood do mês', 'quanto eu gastei na Amazon nos últimos 3 meses'). Sempre prefira tools agregadas (summary/category/merchants) antes — só recorra a essa quando precisar ver itens específicos.",
      parameters: {
        type: "object",
        properties: {
          from: { type: "string", description: "YYYY-MM-DD inclusive." },
          to: { type: "string", description: "YYYY-MM-DD inclusive." },
          type: {
            type: "string",
            enum: ["DEBIT", "CREDIT"],
            description: "DEBIT = saída (gasto), CREDIT = entrada (receita).",
          },
          merchantContains: {
            type: "string",
            description:
              "Filtra transações cujo merchantName ou descrição contenha esse texto (case-insensitive). Útil para 'iFood', 'Uber', 'Amazon'.",
          },
          limit: {
            type: "integer",
            description: "Máximo de transações. Default 25, teto 50.",
          },
        },
      },
    },
  },
];

// ─── Tool execution ──────────────────────────────────────────────────────────

type ToolResult = Record<string, unknown> | { error: string };

export async function executeCoachTool(name: string, rawInput: unknown): Promise<ToolResult> {
  const input = (rawInput ?? {}) as Record<string, unknown>;
  try {
    switch (name) {
      case "get_monthly_summary":
        return await getMonthlySummary(
          Number(input.monthsBack ?? 0),
          Number(input.monthsRange ?? 1),
        );
      case "get_spend_by_category":
        return await spendByCategory(input.from as string | undefined, input.to as string | undefined);
      case "get_recurring_expenses":
        return await recurringExpenses();
      case "get_top_merchants":
        return await topMerchants(
          input.from as string | undefined,
          input.to as string | undefined,
          Math.min(30, Number(input.limit ?? 10)),
        );
      case "get_credit_card_overview":
        return await creditCardOverview();
      case "get_account_balances":
        return await accountBalances();
      case "remember_note":
        return await rememberNote({
          content: String(input.content ?? ""),
          category: typeof input.category === "string" ? input.category : null,
          source: typeof input.source === "string" ? input.source : null,
        });
      case "recall_notes":
        return await recallNotes(
          typeof input.category === "string" ? input.category : undefined,
        );
      case "forget_note":
        return await forgetNote(String(input.id ?? ""));
      case "get_transactions":
        return await transactions({
          from: input.from as string | undefined,
          to: input.to as string | undefined,
          type: input.type as "DEBIT" | "CREDIT" | undefined,
          merchantContains: input.merchantContains as string | undefined,
          limit: Math.min(50, Number(input.limit ?? 25)),
        });
      default:
        return { error: `Unknown tool: ${name}` };
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Tool execution failed" };
  }
}

// ─── Tool implementations ────────────────────────────────────────────────────

async function getMonthlySummary(monthsBack: number, monthsRange: number) {
  const from = startOfMonth(-monthsBack);
  const to = endOfMonth(-monthsBack + monthsRange - 1);
  const internalFilter = await buildExcludeInternalTransferFilter();

  const txs = await db.transaction.findMany({
    where: { ...internalFilter, date: { gte: from, lte: to } },
    select: {
      amount: true,
      type: true,
      pluggyCategory: true,
      pluggyCategoryId: true,
      merchantName: true,
      description: true,
    },
  });

  let totalSpend = 0;
  let totalIncome = 0;
  let biggestSpend = 0;
  const byCategory = new Map<string, { name: string; total: number; count: number }>();

  for (const t of txs) {
    if (t.type === "DEBIT") {
      totalSpend += t.amount;
      biggestSpend = Math.max(biggestSpend, t.amount);
      const catName =
        translateCategory(t.pluggyCategoryId, t.pluggyCategory) ?? "Sem categoria";
      const cur = byCategory.get(catName) ?? { name: catName, total: 0, count: 0 };
      cur.total += t.amount;
      cur.count += 1;
      byCategory.set(catName, cur);
    } else if (t.type === "CREDIT") {
      totalIncome += t.amount;
    }
  }

  const debitTxs = txs.filter((t) => t.type === "DEBIT");
  const avgTicket = debitTxs.length > 0 ? totalSpend / debitTxs.length : 0;

  const topCategories = [...byCategory.values()]
    .sort((a, b) => b.total - a.total)
    .slice(0, 5)
    .map((c) => ({
      category: c.name,
      total: round2(c.total),
      count: c.count,
      pctOfSpend: totalSpend > 0 ? round2((c.total / totalSpend) * 100) : 0,
    }));

  return {
    period: { from: isoDay(from), to: isoDay(to) },
    totalSpend: round2(totalSpend),
    totalIncome: round2(totalIncome),
    netCashflow: round2(totalIncome - totalSpend),
    transactionsCount: txs.length,
    debitTransactionsCount: debitTxs.length,
    avgTicket: round2(avgTicket),
    biggestSpend: round2(biggestSpend),
    topCategories,
  };
}

async function spendByCategory(fromIso?: string, toIso?: string) {
  const from = parseDateBoundary(fromIso) ?? startOfMonth();
  const to = parseDateBoundary(toIso, true) ?? new Date();
  const internalFilter = await buildExcludeInternalTransferFilter();

  const grouped = await db.transaction.groupBy({
    by: ["pluggyCategoryId", "pluggyCategory"],
    where: { ...internalFilter, type: "DEBIT", date: { gte: from, lte: to } },
    _sum: { amount: true },
    _count: true,
  });

  const totalSpend = grouped.reduce((s, g) => s + (g._sum.amount ?? 0), 0);
  const categories = grouped
    .map((g) => ({
      category: translateCategory(g.pluggyCategoryId, g.pluggyCategory) ?? "Sem categoria",
      total: round2(g._sum.amount ?? 0),
      count: g._count,
      pctOfSpend: totalSpend > 0 ? round2(((g._sum.amount ?? 0) / totalSpend) * 100) : 0,
    }))
    .sort((a, b) => b.total - a.total);

  return {
    period: { from: isoDay(from), to: isoDay(to) },
    totalSpend: round2(totalSpend),
    categories,
  };
}

async function recurringExpenses() {
  const items = await getRecurringExpenses({ monthsBack: 6 });
  return {
    detected: items.length,
    items: items.map((r) => ({
      label: r.label,
      category: translateCategory(r.categoryId, r.category) ?? null,
      avgAmount: round2(r.avgAmount),
      amountRange: { min: round2(r.minAmount), max: round2(r.maxAmount) },
      occurrences: r.occurrences,
      avgIntervalDays: Math.round(r.avgIntervalDays),
      lastSeen: isoDay(r.lastSeen),
      nextExpected: r.nextExpected ? isoDay(r.nextExpected) : null,
      isInstallment: r.isInstallment,
      installments: r.isInstallment
        ? {
            current: r.installmentCurrent,
            total: r.installmentTotal,
            remaining: r.installmentsRemaining,
          }
        : null,
      monthlyEstimate: round2(r.monthlyEstimate),
    })),
  };
}

async function topMerchants(fromIso?: string, toIso?: string, limit = 10) {
  const from = parseDateBoundary(fromIso) ?? startOfMonth();
  const to = parseDateBoundary(toIso, true) ?? new Date();
  const internalFilter = await buildExcludeInternalTransferFilter();

  const txs = await db.transaction.findMany({
    where: { ...internalFilter, type: "DEBIT", date: { gte: from, lte: to } },
    select: { merchantName: true, description: true, amount: true },
  });

  const byMerchant = new Map<string, { name: string; total: number; count: number }>();
  for (const t of txs) {
    const name = t.merchantName?.trim() ?? t.description.split(/\s{2,}|\s+\d/)[0]?.trim() ?? "Outros";
    const cur = byMerchant.get(name) ?? { name, total: 0, count: 0 };
    cur.total += t.amount;
    cur.count += 1;
    byMerchant.set(name, cur);
  }

  const merchants = [...byMerchant.values()]
    .sort((a, b) => b.total - a.total)
    .slice(0, limit)
    .map((m) => ({ merchant: m.name, total: round2(m.total), count: m.count }));

  // Hint: also compute the all-time fallback so when the agent asks without dates we use the helper.
  if (!fromIso && !toIso) {
    const fallback = await getTopMerchants(limit);
    if (fallback.length > 0) {
      return { period: { from: isoDay(from), to: isoDay(to) }, merchants: fallback.map((m) => ({ merchant: m.name, total: round2(m.total), count: m.count })) };
    }
  }

  return { period: { from: isoDay(from), to: isoDay(to) }, merchants };
}

async function accountBalances() {
  const accounts = await db.account.findMany({
    include: { item: { select: { connectorName: true } } },
    orderBy: [{ type: "asc" }, { balance: "desc" }],
  });
  const cards = await getCreditCardUsage();
  const cardsById = new Map(cards.map((c) => [c.id, c]));

  return {
    totalBankBalance: round2(
      accounts.filter((a) => a.type === "BANK").reduce((s, a) => s + a.balance, 0),
    ),
    totalCreditOpenBills: round2(
      cards.reduce((s, c) => s + c.used, 0),
    ),
    totalCreditAvailable: round2(
      cards.reduce((s, c) => s + c.available, 0),
    ),
    accounts: accounts.map((a) => {
      const card = cardsById.get(a.id);
      const owner = a.owner?.split(/\s+/).slice(0, 2).join(" ") ?? null;
      return {
        bank: a.item.connectorName,
        name: a.name.trim(),
        type: a.type,
        subtype: a.subtype,
        owner,
        balance: round2(a.balance),
        ...(card
          ? {
              openBill: round2(card.used),
              creditLimit: round2(card.limit),
              creditAvailable: round2(card.available),
              billDueDate: card.billDueDate ? isoDay(new Date(card.billDueDate)) : null,
            }
          : {}),
      };
    }),
  };
}

async function creditCardOverview() {
  const cards = await getCreditCardUsage();
  return {
    cards: cards.map((c) => ({
      bank: c.bank,
      name: c.name.trim(),
      last4: c.number?.replace(/\D/g, "").slice(-4) ?? null,
      openBill: round2(c.used),
      openBillMethod: c.method,
      totalBalance: round2(c.totalBalance),
      futureInstallments: round2(c.futureInstallments),
      limit: round2(c.limit),
      available: round2(c.available),
      usedPctOfLimit: round2(c.usedPct),
      nextDueDate: c.billDueDate ? isoDay(new Date(c.billDueDate)) : null,
      minimumPayment: c.billMinimum ? round2(c.billMinimum) : null,
    })),
  };
}

async function transactions(opts: {
  from?: string;
  to?: string;
  type?: "DEBIT" | "CREDIT";
  merchantContains?: string;
  limit: number;
}) {
  const from = parseDateBoundary(opts.from);
  const to = parseDateBoundary(opts.to, true);

  const dateFilter = from || to ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {};
  const merchantFilter = opts.merchantContains
    ? {
        OR: [
          { merchantName: { contains: opts.merchantContains, mode: "insensitive" as const } },
          { description: { contains: opts.merchantContains, mode: "insensitive" as const } },
        ],
      }
    : {};

  const items = await db.transaction.findMany({
    where: {
      ...(opts.type ? { type: opts.type } : {}),
      ...dateFilter,
      ...merchantFilter,
    },
    orderBy: { date: "desc" },
    take: opts.limit,
    select: {
      date: true,
      type: true,
      amount: true,
      description: true,
      merchantName: true,
      pluggyCategory: true,
      pluggyCategoryId: true,
      account: { select: { name: true, item: { select: { connectorName: true } } } },
    },
  });

  return {
    count: items.length,
    transactions: items.map((t) => ({
      date: isoDay(t.date),
      type: t.type,
      amount: round2(t.amount),
      description: t.description,
      merchant: t.merchantName,
      category: translateCategory(t.pluggyCategoryId, t.pluggyCategory),
      bank: t.account.item.connectorName,
      account: t.account.name,
    })),
  };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

// ─── Memory ──────────────────────────────────────────────────────────────────

async function rememberNote(opts: {
  content: string;
  category: string | null;
  source: string | null;
}) {
  const trimmed = opts.content.trim();
  if (!trimmed) return { error: "content is required" };
  if (trimmed.length > 600) return { error: "content too long (max 600 chars)" };

  // Avoid storing duplicate notes (same content within 90 days)
  const recent = await db.coachNote.findFirst({
    where: {
      content: trimmed,
      createdAt: { gte: new Date(Date.now() - 90 * 86400000) },
    },
  });
  if (recent) {
    return {
      ok: true,
      duplicate: true,
      id: recent.id,
      message: "Já tinha essa nota salva.",
    };
  }

  const note = await db.coachNote.create({
    data: {
      content: trimmed,
      category: opts.category?.trim() || null,
      source: opts.source?.trim().toLowerCase() || null,
    },
  });
  return {
    ok: true,
    id: note.id,
    category: note.category,
    content: note.content,
  };
}

async function recallNotes(category?: string) {
  const notes = await db.coachNote.findMany({
    where: category ? { category } : {},
    orderBy: { updatedAt: "desc" },
    take: 50,
  });
  return {
    count: notes.length,
    notes: notes.map((n) => ({
      id: n.id,
      content: n.content,
      category: n.category,
      source: n.source,
      createdAt: n.createdAt.toISOString().slice(0, 10),
    })),
  };
}

async function forgetNote(id: string) {
  if (!id) return { error: "id required" };
  const result = await db.coachNote.delete({ where: { id } }).catch(() => null);
  return result ? { ok: true, deleted: id } : { ok: false, error: "not found" };
}

/**
 * Returns a system-prompt-ready string of the user's saved notes. Called at
 * the start of each chat so the agent already knows the long-term context.
 */
export async function loadMemoryContext(): Promise<string> {
  const notes = await db.coachNote.findMany({
    orderBy: { updatedAt: "desc" },
    take: 30,
  });
  if (notes.length === 0) return "";
  const lines = notes.map((n) => {
    const parts = [n.content];
    if (n.category) parts.push(`(${n.category})`);
    if (n.source) parts.push(`[${n.source}]`);
    return `- ${parts.join(" ")}`;
  });
  return `

# Memória de longo prazo (${notes.length} ${notes.length === 1 ? "nota salva" : "notas salvas"})

Use essas anotações como contexto. Pra adicionar/remover use as tools \`remember_note\` / \`forget_note\`.

${lines.join("\n")}
`;
}
