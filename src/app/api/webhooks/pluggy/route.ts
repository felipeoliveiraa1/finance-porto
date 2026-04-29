import { NextResponse, after } from "next/server";
import { db } from "@/lib/db";
import { syncSingleItem } from "@/lib/sync";

// Pluggy retries 5xx but expects ack within ~30s. We respond fast (200),
// then run the actual sync in the background via `after()` — which keeps
// the serverless function alive on Vercel after the response is sent.
export const maxDuration = 60;

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

  console.log(`[webhook] event=${event} itemId=${itemId}`);

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
    event === "transactions/updated" ||
    event === "transactions/deleted"
  ) {
    // Run the sync in the background after the response is sent.
    // Without `after()`, Vercel kills the function the moment we return,
    // and any in-flight Pluggy fetch is aborted mid-stream.
    after(async () => {
      const start = Date.now();
      try {
        const result = await syncSingleItem(itemId);
        console.log(
          `[webhook] sync ok itemId=${itemId} accounts=${result.accounts} transactions=${result.transactions} (${Date.now() - start}ms)`,
        );
      } catch (err) {
        console.error(
          `[webhook] sync FAILED itemId=${itemId} (${Date.now() - start}ms)`,
          err,
        );
      }
    });
  }

  return NextResponse.json({ ok: true });
}
