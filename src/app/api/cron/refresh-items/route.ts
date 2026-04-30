import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getPluggyClient } from "@/lib/pluggy";
import {
  broadcastWhatsapp,
  isWhatsappConfigured,
  parseReportPhones,
} from "@/lib/whatsapp";

// Tries to trigger a refresh on every connected Pluggy Item. After
// updateItem succeeds, Pluggy fires `item/updated`, which our existing
// /api/webhooks/pluggy handler picks up and runs syncSingleItem.
//
// IMPORTANT — meu.pluggy.ai (free aggregator, connector "MeuPluggy") does
// NOT allow programmatic updates. Pluggy returns 400 "MeuPluggy item cant
// be updated" — refreshes for those items must be triggered manually in the
// meu.pluggy.ai UI. This route still works for direct connectors (Itaú,
// Nubank, Santander production etc.) so we keep it, but it's intentionally
// NOT scheduled in vercel.json: hitting it every 4h on MeuPluggy items
// would just burn cron quota and produce noise.
//
// Trigger manually with:
//   curl -H "Authorization: Bearer $CRON_SECRET" $URL/api/cron/refresh-items
export const maxDuration = 60;

// Item.status values that mean "Open Finance lost access — user must
// re-authenticate the bank in meu.pluggy.ai". Worth alerting.
const REAUTH_STATUSES = new Set([
  "LOGIN_ERROR",
  "WAITING_USER_INPUT",
  "WAITING_USER_ACTION",
]);

function isAuthorized(req: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true; // dev convenience
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${cronSecret}`;
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const pluggy = getPluggyClient();
  const items = await db.item.findMany({
    select: { id: true, connectorName: true, status: true },
  });

  const results: {
    itemId: string;
    connectorName: string;
    statusBefore: string;
    statusAfter: string;
    error?: string;
  }[] = [];
  const reauthLost: string[] = [];

  for (const item of items) {
    try {
      // No params = "retry with the latest used credentials". Pluggy returns
      // the Item with the new status; the actual sync happens async on their
      // side and we get a webhook when it finishes.
      const refreshed = await pluggy.updateItem(item.id);
      results.push({
        itemId: item.id,
        connectorName: item.connectorName,
        statusBefore: item.status,
        statusAfter: refreshed.status,
      });
      if (REAUTH_STATUSES.has(refreshed.status)) {
        reauthLost.push(item.connectorName);
      }
    } catch (err) {
      // Pluggy SDK throws plain objects (not Error instances), so plain
      // String(err) gives "[object Object]". Pull message/code out.
      const e = err as { message?: string; code?: number } | Error;
      const message =
        (typeof e === "object" && e !== null && "message" in e && e.message) ||
        (err instanceof Error ? err.message : null) ||
        JSON.stringify(err);
      results.push({
        itemId: item.id,
        connectorName: item.connectorName,
        statusBefore: item.status,
        statusAfter: "ERROR",
        error: message,
      });
      console.error(`[cron/refresh-items] ${item.connectorName} (${item.id}):`, message);
    }
  }

  // Heads-up to the user: if any bank lost OF access, the dashboard data is
  // about to go stale until they reconnect. Send once per cron tick.
  if (reauthLost.length > 0 && isWhatsappConfigured()) {
    const phones = parseReportPhones();
    if (phones.length > 0) {
      const banks = [...new Set(reauthLost)].join(", ");
      await broadcastWhatsapp(
        phones,
        `🔐 *Open Finance perdeu acesso*\n\nBancos: *${banks}*\n\nAbre meu.pluggy.ai pra reconectar — enquanto isso, os dados desses bancos ficam congelados no dashboard.`,
      );
    }
  }

  return NextResponse.json({
    triggered: results.length,
    results,
    reauthLost: reauthLost.length > 0 ? reauthLost : undefined,
  });
}
