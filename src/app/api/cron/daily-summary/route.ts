import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { translateCategory } from "@/lib/categories";
import { broadcastWhatsapp, parseReportPhones } from "@/lib/whatsapp";
import { getCreditCardUsage } from "@/lib/queries";
import { cleanTransactionDescription, detectBankLabel, formatAccountLabel, shortCardName } from "@/lib/bank";
import { buildExcludeInternalTransferFilter } from "@/lib/internal-transfer";

export const maxDuration = 60;

// Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}` automatically when
// CRON_SECRET env var is set. We accept that OR a direct call from an admin
// who knows the secret (useful for manual testing via curl).
function isAuthorized(req: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true; // dev convenience
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${cronSecret}`;
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const phones = parseReportPhones();
  if (phones.length === 0) {
    return NextResponse.json({ error: "no report phones configured" }, { status: 200 });
  }

  const summary = await buildDailySummary();
  const results = await broadcastWhatsapp(phones, summary);

  return NextResponse.json({
    sent: results.filter((r) => r.result.ok).length,
    failed: results.filter((r) => !r.result.ok),
    summaryPreview: summary.slice(0, 200),
  });
}

async function buildDailySummary(): Promise<string> {
  // "Hoje" e "ontem" no fuso de São Paulo (UTC-3). Cron roda em UTC.
  // 22h BRT = 01h UTC; o resumo é de "ontem" (dia que acabou).
  // Aqui consideramos "hoje" como o dia que estamos prestes a fechar.
  const now = new Date();
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  todayStart.setUTCHours(3, 0, 0, 0); // 00:00 BRT = 03:00 UTC
  // If we're in BRT after midnight already (cron at 01 UTC = 22 BRT), targetting yesterday
  if (now.getUTCHours() < 3) {
    todayStart.setUTCDate(todayStart.getUTCDate() - 1);
  }
  const todayEnd = new Date(todayStart);
  todayEnd.setUTCDate(todayEnd.getUTCDate() + 1);
  todayEnd.setUTCMilliseconds(-1);

  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setUTCDate(yesterdayStart.getUTCDate() - 1);
  const yesterdayEnd = new Date(todayStart.getTime() - 1);

  // For credit cards, look back 48h since they typically settle 1-2 days later.
  const cardsLookbackStart = new Date(todayStart);
  cardsLookbackStart.setUTCDate(cardsLookbackStart.getUTCDate() - 1);

  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 3, 0, 0));

  const internalFilter = await buildExcludeInternalTransferFilter();
  const [todayDebits, yesterdayDebits, monthDebits, cards, recentCardDebits] = await Promise.all([
    db.transaction.findMany({
      where: { ...internalFilter, date: { gte: todayStart, lte: todayEnd }, type: "DEBIT" },
      orderBy: { amount: "desc" },
      include: { account: { select: { name: true, item: { select: { connectorName: true } } } } },
    }),
    db.transaction.findMany({
      where: { ...internalFilter, date: { gte: yesterdayStart, lte: yesterdayEnd }, type: "DEBIT" },
      select: { amount: true },
    }),
    db.transaction.findMany({
      where: { ...internalFilter, date: { gte: monthStart }, type: "DEBIT" },
      select: { amount: true, pluggyCategory: true, pluggyCategoryId: true },
    }),
    getCreditCardUsage(),
    db.transaction.findMany({
      where: {
        account: { type: "CREDIT" },
        type: "DEBIT",
        date: { gte: cardsLookbackStart, lte: todayEnd },
      },
      orderBy: [{ date: "desc" }, { amount: "desc" }],
      // No `take` limit — we group by card below, showing each card's full list.
      include: {
        account: {
          select: {
            id: true,
            name: true,
            owner: true,
            item: { select: { connectorName: true } },
          },
        },
      },
    }),
  ]);

  const todayTotal = todayDebits.reduce((s, t) => s + t.amount, 0);
  const yesterdayTotal = yesterdayDebits.reduce((s, t) => s + t.amount, 0);
  const monthTotal = monthDebits.reduce((s, t) => s + t.amount, 0);

  // Top category this month
  const byCat = new Map<string, number>();
  for (const t of monthDebits) {
    const name = translateCategory(t.pluggyCategoryId, t.pluggyCategory) ?? "Sem categoria";
    byCat.set(name, (byCat.get(name) ?? 0) + t.amount);
  }
  const topCat = [...byCat.entries()].sort((a, b) => b[1] - a[1])[0];

  const fmt = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const dayStr = todayStart.toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "short",
  });

  const lines: string[] = [];
  lines.push(`📊 *Resumo de ${dayStr}*`);
  lines.push("");

  if (todayDebits.length === 0) {
    lines.push("Hoje sem gastos 🎉");
  } else {
    lines.push(`💸 Gastos: ${fmt(todayTotal)} em ${todayDebits.length} ${todayDebits.length === 1 ? "transação" : "transações"}`);
    if (yesterdayTotal > 0) {
      const delta = ((todayTotal - yesterdayTotal) / yesterdayTotal) * 100;
      const arrow = delta > 0 ? "📈" : "📉";
      lines.push(`${arrow} vs ontem: ${delta > 0 ? "+" : ""}${delta.toFixed(0)}%`);
    }
    lines.push("");
    lines.push("*Maiores gastos:*");
    for (const t of todayDebits.slice(0, 3)) {
      const desc = cleanTransactionDescription(t.description, 32);
      const bank = detectBankLabel(t.account.name, t.account.item.connectorName);
      lines.push(`• ${fmt(t.amount)} — ${desc} · ${bank}`);
    }
  }

  // Credit card section — grouped by card so user sees every card's activity
  // (or lack thereof) in the last 48h.
  if (cards.length > 0) {
    lines.push("");
    lines.push("🏧 *Compras no cartão (48h):*");
    const dateFmt = (d: Date) =>
      d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });

    // Group transactions by accountId
    const byAccount = new Map<string, typeof recentCardDebits>();
    for (const t of recentCardDebits) {
      const arr = byAccount.get(t.account.id) ?? [];
      arr.push(t);
      byAccount.set(t.account.id, arr);
    }

    // Detect collisions on bank label so we can disambiguate by owner
    const bankCounts = new Map<string, number>();
    for (const c of cards) {
      const bank = detectBankLabel(c.name, c.bank);
      bankCounts.set(bank, (bankCounts.get(bank) ?? 0) + 1);
    }

    // Sort: cards with activity first, then alphabetically
    const sortedCards = [...cards].sort((a, b) => {
      const aHas = (byAccount.get(a.id)?.length ?? 0) > 0;
      const bHas = (byAccount.get(b.id)?.length ?? 0) > 0;
      if (aHas !== bHas) return aHas ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    let totalSpent = 0;
    for (const card of sortedCards) {
      const txs = byAccount.get(card.id) ?? [];
      const baseLabel = formatAccountLabel(card.name, card.bank);
      const ownerFirst = (card.owner ?? "").trim().split(/\s+/)[0] ?? "";
      const bank = detectBankLabel(card.name, card.bank);
      const needsOwner = (bankCounts.get(bank) ?? 0) > 1 && ownerFirst;
      const label = needsOwner
        ? `${baseLabel} (${ownerFirst[0].toUpperCase()}${ownerFirst.slice(1).toLowerCase()})`
        : baseLabel;

      lines.push("");
      if (txs.length === 0) {
        lines.push(`⚪ *${label}* — sem compras`);
        continue;
      }
      const subtotal = txs.reduce((s, t) => s + t.amount, 0);
      totalSpent += subtotal;
      const compraStr = txs.length === 1 ? "compra" : "compras";
      lines.push(`🟢 *${label}* — ${txs.length} ${compraStr} · ${fmt(subtotal)}`);
      for (const t of txs.slice(0, 5)) {
        const desc = cleanTransactionDescription(t.description, 26);
        lines.push(`  • ${dateFmt(t.date)} ${fmt(t.amount)} — ${desc}`);
      }
      if (txs.length > 5) {
        lines.push(`  (+${txs.length - 5} compras)`);
      }
    }
    lines.push("");
    lines.push(`*Subtotal cartão 48h:* ${fmt(totalSpent)}`);
  }

  lines.push("");
  lines.push(`💰 *Total do mês:* ${fmt(monthTotal)}`);
  if (topCat) {
    lines.push(`📁 Top categoria: ${topCat[0]} (${fmt(topCat[1])})`);
  }

  if (cards.length > 0) {
    lines.push("");
    lines.push("*Faturas abertas:*");
    for (const c of cards) {
      const due = c.billDueDate
        ? new Date(c.billDueDate).toLocaleDateString("pt-BR", {
            day: "2-digit",
            month: "short",
            timeZone: "UTC",
          })
        : null;
      const dueStr = due ? ` (venc ${due})` : "";
      const label = formatAccountLabel(c.name, c.bank);
      lines.push(`• ${label}: ${fmt(c.used)}${dueStr}`);
    }
  }

  return lines.join("\n");
}
