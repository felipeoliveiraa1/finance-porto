import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";

// Manual override for the open bill — needed when Pluggy can't reliably tell us
// which installment lands in which future bill (Mercado Pago in particular).
// Pass `manualOpenBill: null` to clear the override and go back to auto-compute.
const patchSchema = z.object({
  manualOpenBill: z.number().nonnegative().nullable().optional(),
  manualOpenBillDueDate: z.string().datetime().nullable().optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const data: Record<string, unknown> = {};
  if ("manualOpenBill" in parsed.data) {
    data.manualOpenBill = parsed.data.manualOpenBill ?? null;
  }
  if ("manualOpenBillDueDate" in parsed.data) {
    data.manualOpenBillDueDate = parsed.data.manualOpenBillDueDate
      ? new Date(parsed.data.manualOpenBillDueDate)
      : null;
  }

  const account = await db.account
    .update({ where: { id }, data })
    .catch(() => null);

  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  return NextResponse.json({ account });
}
