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
