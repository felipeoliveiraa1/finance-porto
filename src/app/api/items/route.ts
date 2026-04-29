import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { syncSingleItem } from "@/lib/sync";

const addItemSchema = z.object({
  itemId: z.string().uuid(),
});

export async function GET() {
  const items = await db.item.findMany({
    include: { _count: { select: { accounts: true } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ items });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = addItemSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid itemId" }, { status: 400 });
  }

  try {
    await syncSingleItem(parsed.data.itemId);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch item from Pluggy" },
      { status: 502 },
    );
  }

  const item = await db.item.findUnique({ where: { id: parsed.data.itemId } });
  return NextResponse.json({ item }, { status: 201 });
}
