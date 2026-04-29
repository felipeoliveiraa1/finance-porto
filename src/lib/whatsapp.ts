// Evolution API v2 client. Self-hosted WhatsApp gateway.
// Docs: https://doc.evolution-api.com/v2/api-reference

const BASE_URL = process.env.EVOLUTION_API_URL?.replace(/\/+$/, "") ?? "";
const API_KEY = process.env.EVOLUTION_API_KEY ?? "";
const INSTANCE = process.env.EVOLUTION_INSTANCE ?? "";

export function isWhatsappConfigured(): boolean {
  return Boolean(BASE_URL && API_KEY && INSTANCE);
}

export function parseAllowedPhones(): Set<string> {
  const list = process.env.WHATSAPP_ALLOWED_PHONES ?? "";
  return new Set(
    list
      .split(",")
      .map((p) => normalizePhone(p))
      .filter(Boolean),
  );
}

export function parseReportPhones(): string[] {
  const list = process.env.WHATSAPP_REPORT_PHONES ?? process.env.WHATSAPP_ALLOWED_PHONES ?? "";
  return list
    .split(",")
    .map((p) => normalizePhone(p))
    .filter(Boolean);
}

/**
 * Strip everything that's not a digit. WhatsApp expects 5511... format
 * (country code + DDD + number, no spaces or +).
 */
export function normalizePhone(input: string): string {
  return input.replace(/\D/g, "");
}

/**
 * Convert a remoteJid (`5511...@s.whatsapp.net`) into a clean phone number.
 */
export function jidToPhone(jid: string | undefined | null): string {
  if (!jid) return "";
  return jid.split("@")[0]?.replace(/\D/g, "") ?? "";
}

export type SendResult = { ok: true; messageId?: string } | { ok: false; error: string; status?: number };

export async function sendWhatsapp(phone: string, text: string): Promise<SendResult> {
  if (!isWhatsappConfigured()) {
    return { ok: false, error: "Evolution API not configured" };
  }
  const number = normalizePhone(phone);
  if (!number) return { ok: false, error: "invalid phone" };

  try {
    const res = await fetch(
      `${BASE_URL}/message/sendText/${encodeURIComponent(INSTANCE)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: API_KEY,
        },
        body: JSON.stringify({ number, text }),
      },
    );
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: typeof body === "object" && body && "message" in body ? String((body as { message: unknown }).message) : `HTTP ${res.status}`,
      };
    }
    const messageId =
      (body as { key?: { id?: string } })?.key?.id ??
      (body as { messageId?: string })?.messageId;
    return { ok: true, messageId };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Send to multiple phones; returns per-phone results.
 */
export async function broadcastWhatsapp(
  phones: string[],
  text: string,
): Promise<Array<{ phone: string; result: SendResult }>> {
  return Promise.all(
    phones.map(async (phone) => ({ phone, result: await sendWhatsapp(phone, text) })),
  );
}
