const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const compactBrl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});

// Date-only fields from Pluggy (transaction date, bill due, etc.) come as
// UTC midnight (e.g. 2026-04-10T00:00:00Z). Formatting in the user's local
// timezone (UTC-3 in Brazil) shifts these to the previous day. We anchor to
// UTC for date-only formatters to preserve the intended day.
const dateShort = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  timeZone: "UTC",
});

const dateLong = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

// Datetime values (sync logs, real timestamps) are real moments — keep local TZ.
const dateTime = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatBRL(value: number) {
  return brl.format(value);
}

export function formatCompactBRL(value: number) {
  return compactBrl.format(value);
}

export function formatDateShort(value: Date | string) {
  return dateShort.format(new Date(value));
}

export function formatDateLong(value: Date | string) {
  return dateLong.format(new Date(value));
}

export function formatDateTime(value: Date | string) {
  return dateTime.format(new Date(value));
}

// Formato curto pra notificações WhatsApp (BRT timezone).
// Detecta se a transação tem horário real (não meia-noite UTC).
const dateShortBR = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "America/Sao_Paulo",
});
const timeBR = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
});
const dateTimeBR = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
});

/**
 * Returns true when the Date has actual hours/minutes set (not just a
 * date-only value defaulting to midnight UTC).
 */
export function hasTimeComponent(d: Date | string): boolean {
  const date = typeof d === "string" ? new Date(d) : d;
  return (
    date.getUTCHours() !== 0 ||
    date.getUTCMinutes() !== 0 ||
    date.getUTCSeconds() !== 0 ||
    date.getUTCMilliseconds() !== 0
  );
}

/** "30/04 14:32" if time present, else "30/04" — BRT timezone. */
export function formatTxDateTime(value: Date | string): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return hasTimeComponent(d) ? dateTimeBR.format(d) : dateShortBR.format(d);
}

/** "14:32" — useful when date is implicit (today's transactions). */
export function formatTxTimeOnly(value: Date | string): string | null {
  const d = typeof value === "string" ? new Date(value) : value;
  return hasTimeComponent(d) ? timeBR.format(d) : null;
}

export function formatRelative(value: Date | string) {
  const d = new Date(value);
  const diffMs = Date.now() - d.getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `${min}min atrás`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours}h atrás`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d atrás`;
  return formatDateLong(d);
}
