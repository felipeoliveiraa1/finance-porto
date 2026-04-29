import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// List conversations (no per-user scoping — both users share the workspace)
export async function GET() {
  const conversations = await db.conversation.findMany({
    orderBy: { updatedAt: "desc" },
    take: 100,
    select: {
      id: true,
      title: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { messages: true } },
    },
  });
  return NextResponse.json({ conversations });
}

// Create an empty conversation (called when user clicks "Nova conversa" before sending anything)
export async function POST() {
  const c = await db.conversation.create({ data: {} });
  return NextResponse.json({ id: c.id, title: c.title });
}
