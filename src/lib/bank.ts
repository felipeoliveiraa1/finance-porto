// Bank/account label helpers. The Pluggy connector for `meu.pluggy.ai` reports
// every item under the same name ("MeuPluggy"), so we infer the real bank from
// the account/card name.

export type BankKey =
  | "itau"
  | "nubank"
  | "santander"
  | "mercadopago"
  | "magalu"
  | "default";

export function detectBankKey(name: string, fallback?: string): BankKey {
  const s = `${name} ${fallback ?? ""}`.toLowerCase();
  if (s.includes("itau") || s.includes("itaú")) return "itau";
  if (
    s.includes("mercado pago") ||
    s.includes("mercadolivre") ||
    s.includes("mercado livre") ||
    s.includes("mercadopago")
  )
    return "mercadopago";
  if (s.includes("nubank") || s.includes("nu pagamentos") || /\bgold\b/.test(s))
    return "nubank";
  if (s.includes("santander") || s.includes("elite")) return "santander";
  if (
    s.includes("magalu") ||
    s.includes("magazine luiza") ||
    s.includes("magazine") ||
    s.includes("luizacred")
  )
    return "magalu";
  return "default";
}

export const BANK_LABEL: Record<BankKey, string> = {
  itau: "Itaú",
  nubank: "Nubank",
  santander: "Santander",
  mercadopago: "Mercado Pago",
  magalu: "Magalu",
  default: "Banco",
};

/**
 * Human-friendly bank label inferred from card/account name.
 * Use this everywhere we'd otherwise show "MeuPluggy".
 */
export function detectBankLabel(name: string, fallback?: string): string {
  return BANK_LABEL[detectBankKey(name, fallback)];
}

/**
 * Strips the bank prefix from a card name to leave the distinguishing part.
 * "SANTANDER ELITE MASTER" → "Elite Master"
 * "ITAU BRASIL DIGITAL" → "Brasil Digital"
 * "gold" → "Gold"
 * "Mercado Pago" → "" (returns empty because the whole name is the bank)
 */
export function shortCardName(name: string): string {
  const trimmed = name.trim();
  const stripped = trimmed
    .replace(/^santander\b\s*/i, "")
    .replace(/^itau\b\s*/i, "")
    .replace(/^itaú\b\s*/i, "")
    .replace(/^nubank\b\s*/i, "")
    .replace(/^nu pagamentos[^()]*$/i, "")
    .replace(/^mercado\s*pago\b\s*/i, "")
    .replace(/^mercadolivre\b\s*/i, "")
    .replace(/^banco\s+santander\b\s*/i, "")
    .replace(/^magazine\s+luiza\b\s*/i, "")
    .replace(/^magalu\b\s*/i, "")
    .replace(/^luizacred\b\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
  return capitalize(stripped);
}

/**
 * Render-friendly format: "<Bank> · <CardShort>" or just "<Bank>" when
 * there's no distinguishing card name.
 */
export function formatAccountLabel(name: string, bankFallback?: string): string {
  const bank = detectBankLabel(name, bankFallback);
  const short = shortCardName(name);
  if (!short || short.toLowerCase() === bank.toLowerCase()) return bank;
  return `${bank} · ${short}`;
}

/**
 * Tidy up a Pluggy transaction description for display in tight spaces
 * (WhatsApp, push notifications). Keeps the meaningful payee, drops the
 * boilerplate prefix, collapses multiple spaces.
 */
export function cleanTransactionDescription(desc: string, maxLen = 35): string {
  let cleaned = desc.trim();
  cleaned = cleaned
    .replace(/^pix\s+enviado\s+/i, "PIX → ")
    .replace(/^pix\s+recebido\s+/i, "PIX ← ")
    .replace(/^dev(?:olu[çc][ãa]o)?\s+pix\s+/i, "Devolução PIX ")
    .replace(/^pix\s+qrs?\s+/i, "PIX QR ")
    .replace(/^pagamento\s+cartao\s+credito\s+/i, "Pgto cartão ")
    .replace(/^pagamento\s+de\s+fatura/i, "Pgto fatura")
    .replace(/^iof\s+(imposto\s+)?/i, "IOF ")
    .replace(/\s{2,}/g, " ");
  if (cleaned.length > maxLen) cleaned = cleaned.slice(0, maxLen - 1).trimEnd() + "…";
  return cleaned;
}

function capitalize(s: string): string {
  if (!s) return "";
  // If the string is ALL CAPS or all lowercase, title-case it. If it's already
  // mixed case (e.g. "Mercado Pago"), keep it as-is.
  const isAllSame = s === s.toUpperCase() || s === s.toLowerCase();
  if (!isAllSame) return s;
  return s
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}
