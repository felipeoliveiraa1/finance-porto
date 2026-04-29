import OpenAI from "openai";
import { NextResponse } from "next/server";
import { COACH_SYSTEM_PROMPT } from "@/lib/coach-system";
import { COACH_TOOLS, executeCoachTool } from "@/lib/coach-tools";

// Tool-calling loop is bounded so a buggy model or runaway prompt can't
// burn through the API key indefinitely.
const MAX_ITERATIONS = 6;
const MAX_TOOL_OUTPUT_CHARS = 60_000;

const DEFAULT_MODEL = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type CoachRequest = {
  history?: ChatMessage[];
  message?: string;
};

type Usage = {
  promptTokens: number;
  cachedPromptTokens: number;
  completionTokens: number;
};

export async function POST(req: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "OPENAI_API_KEY não configurada. Adicione no .env e reinicie o servidor.",
      },
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

  const history = (body.history ?? []).filter(
    (m) =>
      m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string",
  );

  const client = new OpenAI({ apiKey });

  // Build the running message list. OpenAI auto-caches stable prompt prefixes
  // ≥1024 tokens — keeping `system` first and `tools` constant gives free
  // caching across requests with no explicit markers needed.
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: COACH_SYSTEM_PROMPT },
    ...history.map<OpenAI.Chat.Completions.ChatCompletionMessageParam>((h) => ({
      role: h.role,
      content: h.content,
    })),
    { role: "user", content: userMessage },
  ];

  const toolCalls: Array<{ name: string; durationMs: number; ok: boolean }> = [];
  const usage: Usage = { promptTokens: 0, cachedPromptTokens: 0, completionTokens: 0 };

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
        { error: `Falha ao chamar OpenAI: ${message}` },
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

    // Tool calls present → execute them, append results, loop
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
        const duration = Date.now() - start;
        toolCalls.push({ name: tc.function.name, durationMs: duration, ok: !isError });

        let serialized = JSON.stringify(result);
        if (serialized.length > MAX_TOOL_OUTPUT_CHARS) {
          serialized = serialized.slice(0, MAX_TOOL_OUTPUT_CHARS) + '..."<TRUNCATED>"';
        }

        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: serialized,
        });
      }
      continue;
    }

    // No tool calls → final answer (chat completions returns string | null)
    if (typeof assistantMsg.content === "string") {
      finalText = assistantMsg.content.trim();
    }

    if (choice.finish_reason === "content_filter") {
      finalText =
        finalText ||
        "Filtro de conteúdo ativou aqui. Se o pedido foi diferente do que pareceu, tenta reformular.";
    }

    break;
  }

  if (!finalText) {
    finalText =
      "Hmm, deu pane aqui no fim. Tenta reformular a pergunta — se o problema persistir, o limite de iterações foi atingido.";
  }

  return NextResponse.json({
    reply: finalText,
    toolCalls,
    usage,
    finishReason: lastFinishReason,
    model: DEFAULT_MODEL,
  });
}
