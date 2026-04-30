import OpenAI from "openai";
import { NextResponse } from "next/server";
import { COACH_SYSTEM_PROMPT, buildDateContext } from "@/lib/coach-system";
import { COACH_TOOLS, executeCoachTool } from "@/lib/coach-tools";
import { db } from "@/lib/db";

const MAX_ITERATIONS = 6;
const MAX_TOOL_OUTPUT_CHARS = 60_000;
const DEFAULT_MODEL = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";

type CoachRequest = {
  conversationId?: string;
  message?: string;
};

export async function POST(req: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY não configurada." },
      { status: 500 },
    );
  }

  let body: CoachRequest;
  try {
    body = (await req.json()) as CoachRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const userMessage = body.message?.trim();
  if (!userMessage) {
    return NextResponse.json({ error: "Mensagem vazia" }, { status: 400 });
  }

  // 1. Resolve / create conversation, then load history from DB
  let conversation = body.conversationId
    ? await db.conversation.findUnique({
        where: { id: body.conversationId },
        include: {
          messages: { orderBy: { createdAt: "asc" } },
        },
      })
    : null;

  let isNewConversation = false;
  if (!conversation) {
    conversation = await db.conversation.create({
      data: { title: deriveTitle(userMessage) },
      include: { messages: true },
    });
    isNewConversation = true;
  }

  // 2. Build OpenAI messages array from saved history
  const history: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: COACH_SYSTEM_PROMPT + buildDateContext() },
    ...conversation.messages.map<OpenAI.Chat.Completions.ChatCompletionMessageParam>((m) =>
      m.role === "assistant"
        ? { role: "assistant", content: m.content }
        : { role: "user", content: m.content },
    ),
    { role: "user", content: userMessage },
  ];

  // 3. Persist the user message immediately so a server crash mid-loop still
  //    leaves the conversation in a recoverable state.
  await db.coachMessage.create({
    data: {
      conversationId: conversation.id,
      role: "user",
      content: userMessage,
    },
  });

  const client = new OpenAI({ apiKey });
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [...history];
  const toolCalls: Array<{ name: string; durationMs: number; ok: boolean }> = [];
  let usage = { promptTokens: 0, cachedPromptTokens: 0, completionTokens: 0 };
  let finalText = "";
  let lastFinishReason: string | null = null;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    let completion: OpenAI.Chat.Completions.ChatCompletion;
    try {
      completion = await client.chat.completions.create({
        model: DEFAULT_MODEL,
        messages,
        tools: COACH_TOOLS,
        tool_choice: "auto",
        temperature: 0.4,
        max_completion_tokens: 4000,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown API error";
      return NextResponse.json(
        { error: `Falha ao chamar OpenAI: ${message}`, conversationId: conversation.id },
        { status: 502 },
      );
    }

    if (completion.usage) {
      usage.promptTokens += completion.usage.prompt_tokens ?? 0;
      usage.completionTokens += completion.usage.completion_tokens ?? 0;
      const cached =
        (completion.usage as { prompt_tokens_details?: { cached_tokens?: number } })
          .prompt_tokens_details?.cached_tokens ?? 0;
      usage.cachedPromptTokens += cached;
    }

    const choice = completion.choices[0];
    if (!choice) {
      finalText = "Resposta vazia do modelo.";
      break;
    }
    lastFinishReason = choice.finish_reason;
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
        const isError = "error" in result;
        toolCalls.push({
          name: tc.function.name,
          durationMs: Date.now() - start,
          ok: !isError,
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
    if (choice.finish_reason === "content_filter") {
      finalText = finalText || "Filtro de conteúdo bloqueou. Tenta reformular.";
    }
    break;
  }

  if (!finalText) {
    finalText = "Hmm, não consegui processar essa. Tenta de novo?";
  }

  // 4. Persist assistant message + bump conversation.updatedAt for sidebar ordering
  const assistantRow = await db.coachMessage.create({
    data: {
      conversationId: conversation.id,
      role: "assistant",
      content: finalText,
      toolCallsJson: toolCalls.length > 0 ? JSON.stringify(toolCalls) : null,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      cachedPromptTokens: usage.cachedPromptTokens,
    },
  });
  await db.conversation.update({
    where: { id: conversation.id },
    data: { updatedAt: new Date() },
  });

  return NextResponse.json({
    reply: finalText,
    toolCalls,
    usage,
    finishReason: lastFinishReason,
    model: DEFAULT_MODEL,
    conversationId: conversation.id,
    messageId: assistantRow.id,
    title: conversation.title,
    isNewConversation,
  });
}

// Generate a short title from the first user message. We just truncate;
// could later use a quick LLM call for nicer titles.
function deriveTitle(message: string): string {
  const cleaned = message.replace(/\s+/g, " ").trim();
  if (cleaned.length <= 50) return cleaned;
  return cleaned.slice(0, 47).trimEnd() + "…";
}
