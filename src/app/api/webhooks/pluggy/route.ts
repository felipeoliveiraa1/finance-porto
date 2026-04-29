import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { syncSingleItem } from "@/lib/sync";

export async function POST(req: Request) {
  const secret = process.env.PLUGGY_WEBHOOK_SECRET;
  if (secret) {
    const provided = req.headers.get("x-webhook-secret") ?? req.headers.get("authorization");
    if (provided !== secret && provided !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const event = (body as { event?: string }).event;
  const itemId = (body as { itemId?: string }).itemId;

  if (!itemId) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  if (event === "item/deleted") {
    await db.item.delete({ where: { id: itemId } }).catch(() => null);
    return NextResponse.json({ ok: true });
  }

  if (
    event === "item/created" ||
    event === "item/updated" ||
    event === "transactions/created" ||
    event === "transactions/updated"
  ) {
    syncSingleItem(itemId).catch((err) => {
      console.error("[webhook] sync failed for item", itemId, err);
    });
  }

  return NextResponse.json({ ok: true });
}
