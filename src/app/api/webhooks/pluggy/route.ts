import { NextResponse, after } from "next/server";
import { db } from "@/lib/db";
import { syncSingleItem } from "@/lib/sync";
import { broadcastWhatsapp, parseReportPhones, isWhatsappConfigured } from "@/lib/whatsapp";
import { cleanTransactionDescription, detectBankLabel } from "@/lib/bank";
import { buildExcludeInternalTransferFilter } from "@/lib/internal-transfer";
import { formatTxDateTime, formatTxTimeOnly } from "@/lib/format";

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
        // Capture existing tx IDs BEFORE the sync to identify what's new.
        const before = await db.transaction.findMany({
          where: { account: { itemId } },
          select: { id: true },
        });
        const beforeIds = new Set(before.map((t) => t.id));

        const result = await syncSingleItem(itemId);

        const internalFilter = await buildExcludeInternalTransferFilter();
        const newTxs = await db.transaction.findMany({
          where: {
            ...internalFilter,
            account: { itemId },
            id: { notIn: [...beforeIds] },
          },
          orderBy: [{ date: "desc" }, { createdAt: "desc" }],
          include: {
            account: { select: { name: true, item: { select: { connectorName: true } } } },
          },
        });

        // Drop "refund pairs": when a DEBIT is matched by an equivalent CREDIT
        // on the same account on the same day, both notify zero net effect.
        // This usually happens with PIX QR codes that get reversed (Pagar.me etc).
        const skipIds = new Set<string>();
        for (const tx of newTxs) {
          if (skipIds.has(tx.id)) continue;
          const counterpart = newTxs.find(
            (other) =>
              other.id !== tx.id &&
              !skipIds.has(other.id) &&
              other.type !== tx.type &&
              Math.abs(other.amount - tx.amount) < 0.01 &&
              Math.abs(other.date.getTime() - tx.date.getTime()) < 48 * 3600 * 1000,
          );
          if (counterpart) {
            skipIds.add(tx.id);
            skipIds.add(counterpart.id);
          }
        }
        const meaningful = newTxs.filter((t) => !skipIds.has(t.id));

        console.log(
          `[webhook] sync ok itemId=${itemId} accounts=${result.accounts} transactions=${result.transactions} new=${newTxs.length} meaningful=${meaningful.length} (${Date.now() - start}ms)`,
        );

        if (meaningful.length === 0 || !isWhatsappConfigured()) return;
        const phones = parseReportPhones();
        if (phones.length === 0) return;

        const fmt = (v: number) =>
          v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

        if (meaningful.length === 1) {
          // Single transaction — keep the rich format
          const tx = meaningful[0];
          const arrow = tx.type === "DEBIT" ? "💸" : "💰";
          const sign = tx.type === "DEBIT" ? "-" : "+";
          const desc = cleanTransactionDescription(tx.description, 45);
          const bank = detectBankLabel(tx.account.name, tx.account.item.connectorName);
          const when = formatTxDateTime(tx.date);
          await broadcastWhatsapp(
            phones,
            `${arrow} *${sign}${fmt(tx.amount)}* — ${desc}\n${bank} · ${tx.account.name.trim()}\n_${when}_`,
          );
          return;
        }

        // Multiple → digest. Group by account so user sees what hit each card.
        const bank = detectBankLabel(meaningful[0].account.name, meaningful[0].account.item.connectorName);
        const totalDebit = meaningful
          .filter((t) => t.type === "DEBIT")
          .reduce((s, t) => s + t.amount, 0);
        const totalCredit = meaningful
          .filter((t) => t.type === "CREDIT")
          .reduce((s, t) => s + t.amount, 0);

        const lines: string[] = [];
        lines.push(`🔔 *${meaningful.length} novas transações* — ${bank}`);
        if (totalDebit > 0) lines.push(`💸 Saídas: ${fmt(totalDebit)}`);
        if (totalCredit > 0) lines.push(`💰 Entradas: ${fmt(totalCredit)}`);
        lines.push("");
        for (const tx of meaningful.slice(0, 8)) {
          const arrow = tx.type === "DEBIT" ? "−" : "+";
          const desc = cleanTransactionDescription(tx.description, 24);
          const when = formatTxTimeOnly(tx.date) ?? formatTxDateTime(tx.date);
          lines.push(`${when} ${arrow}${fmt(tx.amount)} ${desc}`);
        }
        if (meaningful.length > 8) lines.push(`(+${meaningful.length - 8} outras)`);
        if (skipIds.size > 0) lines.push(`\n_${skipIds.size / 2} par${skipIds.size === 2 ? "" : "es"} de transações canceladas (ida + volta) ocultadas._`);

        await broadcastWhatsapp(phones, lines.join("\n"));
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
