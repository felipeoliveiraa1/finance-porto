import { NextResponse } from "next/server";
import { syncAllItems } from "@/lib/sync";

export async function POST() {
  try {
    const result = await syncAllItems();
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sync failed" },
      { status: 500 },
    );
  }
}
