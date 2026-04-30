// Backfills `pluggyBillId` and refreshed `lastClosedBill*` on existing data.
// The standard sync only fetches the last 30 days for already-seeded items;
// this script pulls 365 days of credit-card transactions specifically to
// populate billId on historical rows.
//
// Usage:
//   npx tsx -r dotenv/config scripts/backfill-bill-ids.ts dotenv_config_path=.env

import { db } from "../src/lib/db";
import { getPluggyClient } from "../src/lib/pluggy";

async function main() {
  const pluggy = getPluggyClient();
  const cards = await db.account.findMany({
    where: { type: "CREDIT" },
    orderBy: { name: "asc" },
  });
  console.log(`📥 ${cards.length} credit cards`);

  for (const c of cards) {
    console.log(`\n▶ ${c.name}`);

    // 1) Refresh bills + last closed
    let lastClosed: { totalAmount: number; dueDate: Date; paidAmount: number | null } | null = null;
    try {
      const billsResp = await pluggy.fetchCreditCardBills(c.id);
      const sorted = [...billsResp.results].sort(
        (a, b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime(),
      );
      if (sorted[0]) {
        const b = sorted[0] as unknown as {
          totalAmount: number;
          dueDate: string | Date;
          payments?: { amount: number }[];
        };
        const paidAmount =
          b.payments?.reduce((s: number, p: { amount: number }) => s + (p.amount ?? 0), 0) ?? null;
        const effective = b.totalAmount > 0 ? b.totalAmount : paidAmount ?? 0;
        lastClosed = { totalAmount: effective, dueDate: new Date(b.dueDate), paidAmount };
      }
    } catch (err) {
      console.warn("  bills failed:", err instanceof Error ? err.message : err);
    }
    if (lastClosed) {
      await db.account.update({
        where: { id: c.id },
        data: {
          lastClosedBillAmount: lastClosed.totalAmount,
          lastClosedBillDueDate: lastClosed.dueDate,
          lastClosedBillPaidAmount: lastClosed.paidAmount,
        },
      });
      console.log(
        `  lastClosed → R$ ${lastClosed.totalAmount.toFixed(2)} venc ${lastClosed.dueDate.toISOString().slice(0, 10)}`,
      );
    }

    // 2) Pull a year of transactions and patch billId
    const txs = await pluggy.fetchAllTransactions(c.id, { dateFrom: "2025-01-01" });
    console.log(`  ${txs.length} txs from Pluggy`);

    let updated = 0;
    const BATCH = 50;
    for (let i = 0; i < txs.length; i += BATCH) {
      const slice = txs.slice(i, i + BATCH);
      await Promise.all(
        slice.map(async (t) => {
          const meta = (t as unknown as { creditCardMetadata?: { billId?: string } })
            .creditCardMetadata;
          const billId = meta?.billId ?? null;
          if (!billId) return;
          const r = await db.transaction
            .updateMany({
              where: { id: t.id, OR: [{ pluggyBillId: null }, { pluggyBillId: { not: billId } }] },
              data: { pluggyBillId: billId },
            })
            .catch(() => ({ count: 0 }));
          updated += r.count;
        }),
      );
      process.stdout.write(`\r  patched ${Math.min(i + BATCH, txs.length)}/${txs.length}`);
    }
    console.log(`\n  pluggyBillId set on ${updated} txs`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
