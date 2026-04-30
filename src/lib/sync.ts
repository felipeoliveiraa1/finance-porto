import { db } from "./db";
import { getPluggyClient } from "./pluggy";
import { categorizeOne, ensureCategories } from "./auto-categorize";

type SyncResult = {
  syncLogId: string;
  itemsCount: number;
  accountsCount: number;
  transactionsCount: number;
  errors: { itemId: string; message: string }[];
};

// Window for the *first* sync of a freshly-linked item — pull a full year so
// charts/recurring detection have history.
const FETCH_INITIAL_DAYS = 365;
// Window for incremental syncs — webhook fires + manual refresh hit this path.
// 30d catches late-posted card transactions and any backdated entries Pluggy
// sends after a re-pull, while keeping the request small enough to finish
// within Vercel's 60s window even with 6 accounts.
const FETCH_INCREMENTAL_DAYS = 30;

export async function syncAllItems(): Promise<SyncResult> {
  const items = await db.item.findMany({ select: { id: true } });
  return syncItems(items.map((i) => i.id));
}

export async function syncItems(itemIds: string[]): Promise<SyncResult> {
  const log = await db.syncLog.create({
    data: { status: "RUNNING" },
  });

  const errors: { itemId: string; message: string }[] = [];
  let itemsCount = 0;
  let accountsCount = 0;
  let transactionsCount = 0;

  for (const itemId of itemIds) {
    try {
      const counts = await syncSingleItem(itemId);
      itemsCount += 1;
      accountsCount += counts.accounts;
      transactionsCount += counts.transactions;
    } catch (err) {
      errors.push({
        itemId,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const status = errors.length === 0 ? "SUCCESS" : errors.length === itemIds.length ? "ERROR" : "PARTIAL";

  await db.syncLog.update({
    where: { id: log.id },
    data: {
      finishedAt: new Date(),
      status,
      itemsCount,
      accountsCount,
      transactionsCount,
      errorMessage: errors.length ? JSON.stringify(errors) : null,
    },
  });

  return { syncLogId: log.id, itemsCount, accountsCount, transactionsCount, errors };
}

export async function syncSingleItem(itemId: string): Promise<{ accounts: number; transactions: number }> {
  const pluggy = getPluggyClient();

  // Decide whether this is a first-time seed or an incremental sync. If we've
  // already ingested any transactions for this item, we only need a small
  // overlap window — Pluggy will give us anything new and our upsert dedupes.
  const existingTxCount = await db.transaction.count({
    where: { account: { itemId } },
  });
  const isInitialSync = existingTxCount === 0;

  const item = await pluggy.fetchItem(itemId);

  await db.item.upsert({
    where: { id: item.id },
    create: {
      id: item.id,
      connectorId: item.connector.id,
      connectorName: item.connector.name,
      connectorImageUrl: item.connector.imageUrl ?? null,
      connectorPrimaryColor: item.connector.primaryColor ?? null,
      status: item.status,
      executionStatus: item.executionStatus ?? null,
      statusDetail: item.statusDetail ? JSON.stringify(item.statusDetail) : null,
      pluggyCreatedAt: item.createdAt ? new Date(item.createdAt) : null,
      pluggyUpdatedAt: item.updatedAt ? new Date(item.updatedAt) : null,
      lastUpdatedAt: item.lastUpdatedAt ? new Date(item.lastUpdatedAt) : null,
    },
    update: {
      connectorId: item.connector.id,
      connectorName: item.connector.name,
      connectorImageUrl: item.connector.imageUrl ?? null,
      connectorPrimaryColor: item.connector.primaryColor ?? null,
      status: item.status,
      executionStatus: item.executionStatus ?? null,
      statusDetail: item.statusDetail ? JSON.stringify(item.statusDetail) : null,
      pluggyUpdatedAt: item.updatedAt ? new Date(item.updatedAt) : null,
      lastUpdatedAt: item.lastUpdatedAt ? new Date(item.lastUpdatedAt) : null,
    },
  });

  const accountsResp = await pluggy.fetchAccounts(itemId);
  const accounts = accountsResp.results;

  for (const acc of accounts) {
    let currentBill: { totalAmount: number; dueDate: Date; minimumPaymentAmount: number | null } | null = null;
    let lastClosedBill: {
      totalAmount: number;
      dueDate: Date;
      paidAmount: number | null;
    } | null = null;
    if (acc.type === "CREDIT") {
      try {
        const billsResp = await pluggy.fetchCreditCardBills(acc.id);
        currentBill = pickCurrentBill(billsResp.results);
        lastClosedBill = pickLastClosedBill(billsResp.results);
      } catch (err) {
        console.warn(`[sync] failed to fetch bills for ${acc.id}`, err);
      }
    }

    await db.account.upsert({
      where: { id: acc.id },
      create: {
        id: acc.id,
        itemId,
        type: acc.type,
        subtype: acc.subtype,
        name: acc.name,
        marketingName: acc.marketingName ?? null,
        number: acc.number ?? null,
        balance: acc.balance,
        currencyCode: acc.currencyCode ?? "BRL",
        owner: acc.owner ?? null,
        taxNumber: acc.taxNumber ?? null,
        creditLimit: acc.creditData?.creditLimit ?? null,
        availableCreditLimit: acc.creditData?.availableCreditLimit ?? null,
        currentBillAmount: currentBill?.totalAmount ?? null,
        currentBillDueDate: currentBill?.dueDate ?? null,
        currentBillMinimum: currentBill?.minimumPaymentAmount ?? null,
        lastClosedBillAmount: lastClosedBill?.totalAmount ?? null,
        lastClosedBillDueDate: lastClosedBill?.dueDate ?? null,
        lastClosedBillPaidAmount: lastClosedBill?.paidAmount ?? null,
      },
      update: {
        type: acc.type,
        subtype: acc.subtype,
        name: acc.name,
        marketingName: acc.marketingName ?? null,
        number: acc.number ?? null,
        balance: acc.balance,
        currencyCode: acc.currencyCode ?? "BRL",
        creditLimit: acc.creditData?.creditLimit ?? null,
        availableCreditLimit: acc.creditData?.availableCreditLimit ?? null,
        currentBillAmount: currentBill?.totalAmount ?? null,
        currentBillDueDate: currentBill?.dueDate ?? null,
        currentBillMinimum: currentBill?.minimumPaymentAmount ?? null,
        lastClosedBillAmount: lastClosedBill?.totalAmount ?? null,
        lastClosedBillDueDate: lastClosedBill?.dueDate ?? null,
        lastClosedBillPaidAmount: lastClosedBill?.paidAmount ?? null,
      },
    });
  }

  const since = new Date();
  since.setDate(
    since.getDate() - (isInitialSync ? FETCH_INITIAL_DAYS : FETCH_INCREMENTAL_DAYS),
  );

  // Make sure the household categories exist + grab the name→id map so we
  // can auto-categorize each new DEBIT during the upsert (no second pass).
  const catByName = await ensureCategories();

  let txCount = 0;
  // Batch upserts in parallel — Postgres + the pgbouncer pooler handle the
  // concurrency well, and serial upserts blew our 60s Vercel budget on full
  // syncs (~2k rows). Keep batches small enough that one slow row can't
  // starve the others.
  const UPSERT_BATCH_SIZE = 20;
  for (const acc of accounts) {
    const transactions = await pluggy.fetchAllTransactions(acc.id, {
      dateFrom: since.toISOString().slice(0, 10),
    });
    for (let i = 0; i < transactions.length; i += UPSERT_BATCH_SIZE) {
      const batch = transactions.slice(i, i + UPSERT_BATCH_SIZE);
      await Promise.all(
        batch.map((tx) => {
          // Auto-categorize debits via household rules. We only set the
          // category on CREATE — never overwrite an existing user category,
          // which preserves manual edits made in the dashboard.
          const matchedName =
            tx.type === "DEBIT"
              ? categorizeOne({
                  description: tx.description,
                  merchantName: tx.merchant?.name ?? null,
                  pluggyCategoryId: tx.categoryId ?? null,
                })
              : null;
          const userCategoryId = matchedName ? catByName[matchedName] ?? null : null;

          // billId tells us which credit-card bill this transaction is part
          // of. When a tx is later assigned to a closed bill, Pluggy starts
          // returning a billId for it — we update it on every sync.
          const meta = (tx as unknown as { creditCardMetadata?: { billId?: string } })
            .creditCardMetadata;
          const pluggyBillId = meta?.billId ?? null;

          return db.transaction.upsert({
            where: { id: tx.id },
            create: {
              id: tx.id,
              accountId: acc.id,
              type: tx.type,
              description: tx.description,
              descriptionRaw: tx.descriptionRaw ?? null,
              amount: Math.abs(tx.amount),
              amountInAccountCurrency: tx.amountInAccountCurrency ?? null,
              currencyCode: tx.currencyCode ?? "BRL",
              date: new Date(tx.date),
              balance: tx.balance ?? null,
              pluggyCategory: tx.category ?? null,
              pluggyCategoryId: tx.categoryId ?? null,
              merchantName: tx.merchant?.name ?? null,
              paymentDataJson: tx.paymentData ? JSON.stringify(tx.paymentData) : null,
              providerCode: tx.providerCode ?? null,
              pluggyBillId,
              userCategoryId,
            },
            update: {
              type: tx.type,
              description: tx.description,
              descriptionRaw: tx.descriptionRaw ?? null,
              amount: Math.abs(tx.amount),
              amountInAccountCurrency: tx.amountInAccountCurrency ?? null,
              date: new Date(tx.date),
              balance: tx.balance ?? null,
              pluggyCategory: tx.category ?? null,
              pluggyCategoryId: tx.categoryId ?? null,
              merchantName: tx.merchant?.name ?? null,
              paymentDataJson: tx.paymentData ? JSON.stringify(tx.paymentData) : null,
              providerCode: tx.providerCode ?? null,
              pluggyBillId,
              // Don't touch userCategoryId on update — preserve user edits.
            },
          });
        }),
      );
      txCount += batch.length;
    }
  }

  return { accounts: accounts.length, transactions: txCount };
}

/**
 * Pick the bill that represents the user's "current statement":
 * the soonest-to-be-due unpaid bill (dueDate >= today).
 * Falls back to the latest past bill if no future bills exist.
 */
function pickCurrentBill(
  bills: { totalAmount: number; dueDate: Date; minimumPaymentAmount: number | null }[],
) {
  if (!bills.length) return null;
  const todayMs = Date.now();
  const future = bills
    .filter((b) => new Date(b.dueDate).getTime() >= todayMs)
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  if (future.length) return future[0];
  return [...bills].sort(
    (a, b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime(),
  )[0];
}

// The most recently closed bill — the one with the latest dueDate. We treat
// EVERY bill returned by Pluggy as "closed" (Pluggy doesn't expose pending
// open-cycle bills). The user's bank app sometimes shows this value as the
// "fatura aberta" — surfacing it lets the user reconcile easily.
function pickLastClosedBill(
  bills: {
    totalAmount: number;
    dueDate: Date;
    payments?: { amount: number }[];
  }[],
): { totalAmount: number; dueDate: Date; paidAmount: number | null } | null {
  if (!bills.length) return null;
  const sorted = [...bills].sort(
    (a, b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime(),
  );
  const latest = sorted[0];
  const paidAmount = latest.payments?.reduce((s, p) => s + (p.amount ?? 0), 0) ?? null;
  // When Pluggy reports totalAmount=0 for a fully-paid bill (Mercado Pago does
  // this), surface the payment sum as the effective bill amount — that's what
  // the user expects to see as the "fatura anterior". When the bill is unpaid
  // or partial, totalAmount is the source of truth.
  const effectiveAmount =
    latest.totalAmount > 0 ? latest.totalAmount : paidAmount ?? 0;
  return {
    totalAmount: effectiveAmount,
    dueDate: new Date(latest.dueDate),
    paidAmount,
  };
}
