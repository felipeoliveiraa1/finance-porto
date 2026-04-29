import { NextResponse, after } from "next/server";
import OpenAI from "openai";
import { db } from "@/lib/db";
import { COACH_SYSTEM_PROMPT } from "@/lib/coach-system";
import { COACH_TOOLS, executeCoachTool } from "@/lib/coach-tools";
import { jidToPhone, parseAllowedPhones, sendWhatsapp } from "@/lib/whatsapp";

export const maxDuration = 60;

const MAX_ITERATIONS = 6;
const MAX_TOOL_OUTPUT_CHARS = 60_000;
const DEFAULT_MODEL = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";

// Evolution v2 sends events under shapes like:
//   { event: "messages.upsert", instance, data: { key: { remoteJid, fromMe, id }, message: { conversation, ... }, pushName } }
type EvolutionWebhookPayload = {
  event?: string;
  instance?: string;
  data?: {
    key?: { remoteJid?: string; fromMe?: boolean; id?: string };
    message?: {
      conversation?: string;
      extendedTextMessage?: { text?: string };
    };
    messageType?: string;
    pushName?: string;
    messageTimestamp?: number;
  };
};

const WA_SYSTEM_ADDENDUM = `

# Canal: WhatsApp

Você está respondendo via WhatsApp. Adapte a forma:
- Mais conciso ainda — máximo ~6 linhas, sem títulos longos.
- Use emojis pra destacar valores e tipos (💸 saída, 💰 entrada, 📊 resumo).
- Sem markdown pesado (*negrito* funciona, # headers não).
- Sem tabelas — use bullets ou linha única "X: R$ Y".
- Termine com 1 sugestão de próxima ação se fizer sentido (e curta).
`;

export async function POST(req: Request) {
  // Optional shared-secret check — set EVOLUTION_WEBHOOK_SECRET on both sides
  // and Evolution will include it in the `apikey` header.
  const expectedSecret = process.env.EVOLUTION_WEBHOOK_SECRET;
  if (expectedSecret) {
    const provided =
      req.headers.get("apikey") ??
      req.headers.get("x-webhook-secret") ??
      req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (provided !== expectedSecret) {
      console.warn("[wa-webhook] auth failed");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const body = (await req.json().catch(() => null)) as EvolutionWebhookPayload | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  // Only react to incoming user messages, not status updates or our own sends.
  if (body.event !== "messages.upsert") {
    return NextResponse.json({ ok: true, ignored: `event=${body.event ?? "?"}` });
  }
  const data = body.data;
  if (!data || data.key?.fromMe) {
    return NextResponse.json({ ok: true, ignored: "fromMe or missing data" });
  }

  const phone = jidToPhone(data.key?.remoteJid);
  const text =
    data.message?.conversation?.trim() ??
    data.message?.extendedTextMessage?.text?.trim() ??
    "";

  if (!phone || !text) {
    return NextResponse.json({ ok: true, ignored: "no phone/text" });
  }

  // Whitelist
  const allowed = parseAllowedPhones();
  if (!allowed.has(phone)) {
    console.warn(`[wa-webhook] phone ${phone} not in allowlist — ignoring`);
    return NextResponse.json({ ok: true, ignored: "phone not allowed" });
  }

  // Heavy work runs after we ack — Evolution expects a fast 200.
  after(async () => {
    try {
      await handleIncomingMessage({
        phone,
        text,
        pushName: data.pushName ?? null,
        messageId: data.key?.id ?? null,
      });
    } catch (err) {
      console.error("[wa-webhook] handler failed", err);
    }
  });

  return NextResponse.json({ ok: true });
}

async function handleIncomingMessage(opts: {
  phone: string;
  text: string;
  pushName: string | null;
  messageId: string | null;
}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    await sendWhatsapp(
      opts.phone,
      "🤖 Coach configurado mas OPENAI_API_KEY ausente no servidor. Avisa o Felipe.",
    );
    return;
  }

  // 1. Find or create conversation for this WhatsApp phone.
  let conversation = await db.conversation.findUnique({
    where: { whatsappPhone: opts.phone },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!conversation) {
    const name = opts.pushName?.split(" ")[0] ?? `+${opts.phone}`;
    conversation = await db.conversation.create({
      data: {
        whatsappPhone: opts.phone,
        title: `WhatsApp · ${name}`,
      },
      include: { messages: true },
    });
  }

  // 2. Save the incoming user message.
  await db.coachMessage.create({
    data: {
      conversationId: conversation.id,
      role: "user",
      content: opts.text,
    },
  });

  // 3. Build OpenAI messages with WhatsApp-specific addendum.
  const history: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: COACH_SYSTEM_PROMPT + WA_SYSTEM_ADDENDUM },
    ...conversation.messages.map<OpenAI.Chat.Completions.ChatCompletionMessageParam>((m) =>
      m.role === "assistant"
        ? { role: "assistant", content: m.content }
        : { role: "user", content: m.content },
    ),
    { role: "user", content: opts.text },
  ];

  const client = new OpenAI({ apiKey });
  const messages = [...history];
  const toolCalls: { name: string; durationMs: number; ok: boolean }[] = [];
  let finalText = "";

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    let completion: OpenAI.Chat.Completions.ChatCompletion;
    try {
      completion = await client.chat.completions.create({
        model: DEFAULT_MODEL,
        messages,
        tools: COACH_TOOLS,
        tool_choice: "auto",
        temperature: 0.4,
        max_completion_tokens: 1500, // mais curto pra WA
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "openai error";
      console.error("[wa-webhook] openai", msg);
      finalText = `🤖 Erro ao processar: ${msg.slice(0, 100)}`;
      break;
    }

    const choice = completion.choices[0];
    if (!choice) break;
    const assistantMsg = choice.message;

    if (assistantMsg.tool_calls && assistantMsg.tool_calls.length > 0) {
      messages.push(assistantMsg);
      for (const tc of assistantMsg.tool_calls) {
        if (tc.type !== "function") continue;
        const start = Date.now();
        let parsedArgs: unknown = {};
        try {
          parsedArgs = tc.function.arguments ? JSON.parse(tc.function.arguments) : {};
        } catch {
          parsedArgs = {};
        }
        const result = await executeCoachTool(tc.function.name, parsedArgs);
        toolCalls.push({
          name: tc.function.name,
          durationMs: Date.now() - start,
          ok: !("error" in result),
        });
        let serialized = JSON.stringify(result);
        if (serialized.length > MAX_TOOL_OUTPUT_CHARS) {
          serialized = serialized.slice(0, MAX_TOOL_OUTPUT_CHARS) + '..."<TRUNCATED>"';
        }
        messages.push({ role: "tool", tool_call_id: tc.id, content: serialized });
      }
      continue;
    }

    if (typeof assistantMsg.content === "string") {
      finalText = assistantMsg.content.trim();
    }
    break;
  }

  if (!finalText) finalText = "🤖 Não consegui responder agora. Tenta de novo daqui a pouco.";

  // 4. Persist + send back to user
  await db.coachMessage.create({
    data: {
      conversationId: conversation.id,
      role: "assistant",
      content: finalText,
      toolCallsJson: toolCalls.length > 0 ? JSON.stringify(toolCalls) : null,
    },
  });
  await db.conversation.update({
    where: { id: conversation.id },
    data: { updatedAt: new Date() },
  });

  const sendResult = await sendWhatsapp(opts.phone, finalText);
  if (!sendResult.ok) {
    console.error(`[wa-webhook] send failed to ${opts.phone}:`, sendResult.error);
  } else {
    console.log(`[wa-webhook] sent to ${opts.phone} msgId=${sendResult.messageId}`);
  }
}
