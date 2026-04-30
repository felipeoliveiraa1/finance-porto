// Maintenance script — re-runs auto-categorization across all DEBIT
// transactions in the DB. Useful after editing the rules in
// `src/lib/auto-categorize.ts`. Idempotent.
//
// Usage:
//   npx tsx -r dotenv/config scripts/recategorize-history.ts dotenv_config_path=.env
//   npx tsx -r dotenv/config scripts/recategorize-history.ts --preview dotenv_config_path=.env
//   npx tsx -r dotenv/config scripts/recategorize-history.ts --skip-existing dotenv_config_path=.env
//
// Flags:
//   --preview        : don't write — print the breakdown that *would* be applied
//   --skip-existing  : leave any tx that already has a userCategoryId untouched
//                      (use when you've manually edited categories in the UI
//                      and don't want to overwrite them)

import { db } from "../src/lib/db";
import { categorizeOne, ensureCategories } from "../src/lib/auto-categorize";

const PREVIEW = process.argv.includes("--preview");
const SKIP_EXISTING = process.argv.includes("--skip-existing");

async function main() {
  console.log("📚 Ensuring Category records exist…");
  const catByName = await ensureCategories();
  console.log(`  ${Object.keys(catByName).length} categories present`);

  console.log("📥 Loading transactions (DEBIT only)…");
  const txs = await db.transaction.findMany({
    where: { type: "DEBIT" },
    select: {
      id: true,
      description: true,
      merchantName: true,
      pluggyCategoryId: true,
      userCategoryId: true,
    },
  });
  console.log(`  ${txs.length} debit transactions loaded`);

  let matched = 0;
  let unmatched = 0;
  let skipped = 0;
  const updates: { id: string; categoryId: string; categoryName: string }[] = [];
  const unmatchedSamples: Map<string, number> = new Map();

  for (const t of txs) {
    if (SKIP_EXISTING && t.userCategoryId) {
      skipped += 1;
      continue;
    }
    const name = categorizeOne({
      description: t.description,
      merchantName: t.merchantName,
      pluggyCategoryId: t.pluggyCategoryId,
    });
    if (!name) {
      unmatched += 1;
      const key = t.merchantName ?? t.description.slice(0, 40);
      unmatchedSamples.set(key, (unmatchedSamples.get(key) ?? 0) + 1);
      continue;
    }
    matched += 1;
    const categoryId = catByName[name];
    if (!categoryId) continue;
    if (t.userCategoryId === categoryId) {
      skipped += 1;
      continue;
    }
    updates.push({ id: t.id, categoryId, categoryName: name });
  }

  console.log("");
  console.log(`✅ matched=${matched}  ❌ unmatched=${unmatched}  ⏭ already-correct=${skipped}`);
  console.log(`📝 ${updates.length} transactions to update`);

  if (PREVIEW) {
    const byCat = new Map<string, number>();
    for (const u of updates) byCat.set(u.categoryName, (byCat.get(u.categoryName) ?? 0) + 1);
    console.log("\n=== Categorization breakdown (preview) ===");
    for (const [n, c] of [...byCat.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${c.toString().padStart(4)}× ${n}`);
    }
    console.log("\n=== Top unmatched merchants ===");
    for (const [k, n] of [...unmatchedSamples.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30)) {
      console.log(`  ${n}× ${k}`);
    }
    console.log("\n(preview mode — no DB writes)");
    return;
  }

  const BATCH = 50;
  for (let i = 0; i < updates.length; i += BATCH) {
    const slice = updates.slice(i, i + BATCH);
    await Promise.all(
      slice.map((u) =>
        db.transaction.update({
          where: { id: u.id },
          data: { userCategoryId: u.categoryId },
        }),
      ),
    );
    process.stdout.write(`\r  applied ${Math.min(i + BATCH, updates.length)}/${updates.length}`);
  }
  console.log("\n✓ done");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
