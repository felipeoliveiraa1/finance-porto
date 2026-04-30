import { db } from "./db";

// Cache the internal-name list briefly to avoid hitting the DB on every query.
let cache: { names: string[]; expiresAt: number } | null = null;
const TTL_MS = 60_000;

/**
 * Builds a list of name fragments associated with the workspace's accounts.
 * "FELIPE PORTO DE OLIVEIRA" → ["felipe", "milena"], etc.
 *
 * Used to detect PIX transfers between users in the workspace (couple/family
 * accounts) so we can exclude them from spending KPIs and reports.
 */
export async function getInternalOwnerNames(): Promise<string[]> {
  if (cache && cache.expiresAt > Date.now()) return cache.names;

  const accounts = await db.account.findMany({
    select: { owner: true },
    where: { owner: { not: null } },
  });

  const firstNames = new Set<string>();
  for (const a of accounts) {
    if (!a.owner) continue;
    const cleaned = a.owner.trim().toLowerCase();
    const first = cleaned.split(/\s+/)[0];
    if (first && first.length >= 3) firstNames.add(first);
  }

  const names = [...firstNames];
  cache = { names, expiresAt: Date.now() + TTL_MS };
  return names;
}

/**
 * Returns a Prisma `NOT` predicate that excludes transactions matching the
 * "internal transfer" pattern: PIX where the counterparty name in the
 * description matches one of our workspace owners (Felipe or Milena).
 *
 * Use it spread-merged with other filters via `AND`.
 */
export async function buildExcludeInternalTransferFilter() {
  const names = await getInternalOwnerNames();
  if (names.length < 2) return undefined; // need at least 2 owners to be "internal"

  // Also exclude Pluggy's own "Same person transfer" category (between accounts of the
  // same CPF) and credit-card payments (already accounted via balance changes).
  return {
    NOT: {
      OR: [
        {
          // Internal PIX between the workspace's people
          AND: [
            { description: { startsWith: "PIX", mode: "insensitive" as const } },
            {
              OR: names.map((n) => ({
                description: { contains: n, mode: "insensitive" as const },
              })),
            },
          ],
        },
        // "Same person transfer" (Pluggy categories starting with 04)
        { pluggyCategoryId: { startsWith: "04" } },
        // Credit-card payments (Pluggy 05100000) — already reflected by balance change
        { pluggyCategoryId: "05100000" },
      ],
    },
  };
}

/**
 * Synchronous in-memory check for already-fetched transactions. Use when
 * filtering can't easily go into a Prisma where clause (e.g. complex aggregations).
 */
export function isInternalTransfer(
  tx: { description: string; pluggyCategoryId?: string | null },
  internalNames: string[],
): boolean {
  if (tx.pluggyCategoryId) {
    if (tx.pluggyCategoryId.startsWith("04")) return true;
    if (tx.pluggyCategoryId === "05100000") return true;
  }
  const desc = tx.description.toLowerCase();
  if (!desc.startsWith("pix")) return false;
  return internalNames.some((n) => desc.includes(n));
}
