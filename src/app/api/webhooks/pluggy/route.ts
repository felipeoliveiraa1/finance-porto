import { NextResponse, after } from "next/server";
import { db } from "@/lib/db";
import { syncSingleItem } from "@/lib/sync";
import { broadcastWhatsapp, parseReportPhones, isWhatsappConfigured } from "@/lib/whatsapp";

// Pluggy retries 5xx but expects ack within ~30s. We respond fast (200),
// then run the actual sync in the background via `after()` — which keeps
// the serverless function alive on Vercel after the response is sent.
export const maxDuration = 60;

type PluggyWebhookPayload = {
  id?: string;
  event?: string;
  itemId?: string;
  eventId?: string;
  clientId?: string;
  triggeredBy?: string;
  clientUserId?: string | null;
};

// Events that mean we should pull fresh data for the item.
const SYNC_EVENTS = new Set([
  "item/created",
  "item/updated",
  "item/login_succeeded",
  "transactions/created",
  "transactions/updated",
  "transactions/deleted",
]);

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as PluggyWebhookPayload | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  // Authenticate the webhook. Two paths are supported:
  //  1) Custom shared-secret header (x-webhook-secret) — used for manual testing
  //     via curl/Postman; doesn't apply to Pluggy itself, which doesn't sign requests.
  //  2) clientId in the payload matches our PLUGGY_CLIENT_ID — this is how Pluggy's
  //     native webhook system proves origin (the clientId is shared only between us
  //     and Pluggy, so a third party can't fake it without leaking our credentials).
  const headerSecret = process.env.PLUGGY_WEBHOOK_SECRET;
  const ourClientId = process.env.PLUGGY_CLIENT_ID;
  const providedHeader = req.headers.get("x-webhook-secret") ?? req.headers.get("authorization");

  const headerOk =
    !!headerSecret &&
    (providedHeader === headerSecret || providedHeader === `Bearer ${headerSecret}`);
  const clientIdOk = !!ourClientId && body.clientId === ourClientId;

  if (!headerOk && !clientIdOk) {
    console.warn(
      `[webhook] auth failed event=${body.event} itemId=${body.itemId} ` +
        `headerOk=${headerOk} clientIdMatch=${clientIdOk} payloadClientId=${body.clientId}`,
    );
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { event, itemId, eventId } = body;
  console.log(`[webhook] received event=${event} itemId=${itemId} eventId=${eventId}`);

  if (!itemId) {
    return NextResponse.json({ ok: true, ignored: "no itemId" });
  }

  if (event === "item/deleted") {
    await db.item.delete({ where: { id: itemId } }).catch(() => null);
    return NextResponse.json({ ok: true });
  }

  if (event && SYNC_EVENTS.has(event)) {
    after(async () => {
      const start = Date.now();
      try {
        // Capture which transaction IDs existed BEFORE the sync so we can
        // detect which ones are new and notify.
        const before = await db.transaction.findMany({
          where: { account: { itemId } },
          select: { id: true },
        });
        const beforeIds = new Set(before.map((t) => t.id));

        const result = await syncSingleItem(itemId);

        const after = await db.transaction.findMany({
          where: {
            account: { itemId },
            id: { notIn: [...beforeIds] },
          },
          orderBy: { date: "desc" },
          take: 5,
          include: { account: { select: { name: true, item: { select: { connectorName: true } } } } },
        });

        console.log(
          `[webhook] sync ok itemId=${itemId} accounts=${result.accounts} transactions=${result.transactions} new=${after.length} (${Date.now() - start}ms)`,
        );

        // Notify via WhatsApp on each genuinely new transaction.
        if (after.length > 0 && isWhatsappConfigured()) {
          const phones = parseReportPhones();
          if (phones.length > 0) {
            for (const tx of after) {
              const fmt = (v: number) =>
                v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
              const arrow = tx.type === "DEBIT" ? "💸" : "💰";
              const sign = tx.type === "DEBIT" ? "-" : "+";
              const msg = `${arrow} *${sign}${fmt(tx.amount)}* — ${tx.description.slice(0, 50)}\n${tx.account.item.connectorName} · ${tx.account.name.trim()}`;
              await broadcastWhatsapp(phones, msg);
            }
          }
        }
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
