import { db } from "./db";
import { getPluggyClient } from "./pluggy";

type SyncResult = {
  syncLogId: string;
  itemsCount: number;
  accountsCount: number;
  transactionsCount: number;
  errors: { itemId: string; message: string }[];
};

const FETCH_SINCE_DAYS = 365;

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
    if (acc.type === "CREDIT") {
      try {
        const billsResp = await pluggy.fetchCreditCardBills(acc.id);
        currentBill = pickCurrentBill(billsResp.results);
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
      },
    });
  }

  const since = new Date();
  since.setDate(since.getDate() - FETCH_SINCE_DAYS);

  let txCount = 0;
  for (const acc of accounts) {
    const transactions = await pluggy.fetchAllTransactions(acc.id, {
      dateFrom: since.toISOString().slice(0, 10),
    });
    for (const tx of transactions) {
      await db.transaction.upsert({
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
        },
      });
      txCount += 1;
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
