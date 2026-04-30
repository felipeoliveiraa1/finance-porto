"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { syncAllItems, syncSingleItem } from "@/lib/sync";

export async function triggerSync() {
  const result = await syncAllItems();
  revalidatePath("/", "layout");
  return result;
}

export async function addItem(itemId: string) {
  const trimmed = itemId.trim();
  if (!trimmed) throw new Error("Cole um Item ID válido");
  await syncSingleItem(trimmed);
  revalidatePath("/", "layout");
}

export async function removeItem(itemId: string) {
  await db.item.delete({ where: { id: itemId } });
  revalidatePath("/", "layout");
}

// --- Manual budget (Receitas + Gastos Fixos) ---
// Mirrors Milena's spreadsheet (`fatura_compras_MI.xlsx`) — workspace-scoped,
// shared between Felipe + Milena. We keep these separate from Pluggy data
// because they're *plans*, not observations.

export type FixedExpenseInput = {
  name: string;
  amount: number;
  dueDay?: number | null;
  bucket?: string | null;
  owner?: string | null;
  notes?: string | null;
  active?: boolean;
};

export type IncomeSourceInput = {
  name: string;
  amount: number;
  dueDay?: number | null;
  owner?: string | null;
  notes?: string | null;
  active?: boolean;
};

function sanitizeAmount(v: number): number {
  if (!Number.isFinite(v) || v < 0) throw new Error("Valor inválido");
  return Math.round(v * 100) / 100;
}

function sanitizeDueDay(v: number | null | undefined): number | null {
  if (v == null) return null;
  if (!Number.isInteger(v) || v < 1 || v > 31) {
    throw new Error("Dia de vencimento deve estar entre 1 e 31");
  }
  return v;
}

export async function upsertFixedExpense(
  id: string | null,
  input: FixedExpenseInput,
) {
  const data = {
    name: input.name.trim(),
    amount: sanitizeAmount(input.amount),
    dueDay: sanitizeDueDay(input.dueDay ?? null),
    bucket: input.bucket?.trim() || null,
    owner: input.owner?.trim() || null,
    notes: input.notes?.trim() || null,
    active: input.active ?? true,
  };
  if (!data.name) throw new Error("Nome é obrigatório");
  if (id) {
    await db.fixedExpense.update({ where: { id }, data });
  } else {
    await db.fixedExpense.create({ data });
  }
  revalidatePath("/fixed");
}

export async function deleteFixedExpense(id: string) {
  await db.fixedExpense.delete({ where: { id } });
  revalidatePath("/fixed");
}

export async function upsertIncomeSource(
  id: string | null,
  input: IncomeSourceInput,
) {
  const data = {
    name: input.name.trim(),
    amount: sanitizeAmount(input.amount),
    dueDay: sanitizeDueDay(input.dueDay ?? null),
    owner: input.owner?.trim() || null,
    notes: input.notes?.trim() || null,
    active: input.active ?? true,
  };
  if (!data.name) throw new Error("Nome é obrigatório");
  if (id) {
    await db.incomeSource.update({ where: { id }, data });
  } else {
    await db.incomeSource.create({ data });
  }
  revalidatePath("/fixed");
}

export async function deleteIncomeSource(id: string) {
  await db.incomeSource.delete({ where: { id } });
  revalidatePath("/fixed");
}
