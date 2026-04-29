"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import { Bot, Send, Sparkles, User, Wrench, AlertCircle } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

type Role = "user" | "assistant";

type Message = {
  id: string;
  role: Role;
  content: string;
  toolCalls?: { name: string; durationMs: number; ok: boolean }[];
  pending?: boolean;
  error?: string;
};

const SUGGESTIONS = [
  "Onde mais gastei esse mês?",
  "Tem alguma assinatura que dá pra cortar?",
  "Como está minha fatura do Santander?",
  "Estou gastando muito com delivery?",
  "Me dá um diagnóstico geral das minhas finanças.",
];

const TOOL_LABELS: Record<string, string> = {
  get_monthly_summary: "Resumo do mês",
  get_spend_by_category: "Gastos por categoria",
  get_recurring_expenses: "Despesas recorrentes",
  get_top_merchants: "Top estabelecimentos",
  get_credit_card_overview: "Visão dos cartões",
  get_transactions: "Transações",
};

export function CoachChat({ apiKeyMissing }: { apiKeyMissing: boolean }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [pending, startTransition] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || pending || apiKeyMissing) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
    };
    const assistantMsg: Message = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      pending: true,
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput("");

    startTransition(async () => {
      try {
        const history = messages
          .filter((m) => !m.pending && !m.error)
          .map((m) => ({ role: m.role, content: m.content }));

        const res = await fetch("/api/coach", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ history, message: trimmed }),
        });
        const data = await res.json();
        if (!res.ok) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsg.id
                ? { ...m, pending: false, error: data.error ?? "Erro desconhecido" }
                : m,
            ),
          );
          return;
        }
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsg.id
              ? {
                  ...m,
                  pending: false,
                  content: data.reply,
                  toolCalls: data.toolCalls,
                }
              : m,
          ),
        );
      } catch (err) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsg.id
              ? {
                  ...m,
                  pending: false,
                  error: err instanceof Error ? err.message : "Falha de rede",
                }
              : m,
          ),
        );
      }
    });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  return (
    <div className="flex h-[calc(100vh-160px)] flex-col gap-3">
      {apiKeyMissing && (
        <div className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm">
          <AlertCircle className="mt-0.5 h-5 w-5 text-warning" />
          <div>
            <p className="font-medium text-foreground">OPENAI_API_KEY ausente</p>
            <p className="text-muted-foreground">
              Adicione sua chave em <code className="text-foreground">.env</code>{" "}
              (
              <a
                className="text-primary hover:underline"
                href="https://platform.openai.com/api-keys"
                target="_blank"
              >
                platform.openai.com
              </a>
              ) e reinicie o servidor.
            </p>
          </div>
        </div>
      )}

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto scrollbar-thin rounded-2xl glass top-highlight px-4 py-6 sm:px-6"
      >
        {messages.length === 0 ? (
          <Welcome onPick={send} disabled={apiKeyMissing} />
        ) : (
          <div className="space-y-6">
            {messages.map((m) => (
              <Bubble key={m.id} message={m} />
            ))}
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex items-end gap-2 rounded-2xl glass top-highlight p-2.5"
      >
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          placeholder={
            apiKeyMissing
              ? "Configure OPENAI_API_KEY pra começar..."
              : "Pergunta sobre teus gastos, peça uma análise, ou mande algo livre..."
          }
          disabled={apiKeyMissing || pending}
          className="max-h-40 min-h-[40px] flex-1 resize-none bg-transparent px-2 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={!input.trim() || pending || apiKeyMissing}
          className="group inline-flex shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-primary to-[rgb(178,100,255)] px-3.5 py-2 text-sm font-medium text-white transition-all glow-primary hover:glow-purple disabled:opacity-50 disabled:hover:glow-primary"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}

function Welcome({ onPick, disabled }: { onPick: (text: string) => void; disabled?: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-linear-to-br from-primary to-[rgb(178,100,255)] glow-primary">
        <Sparkles className="h-6 w-6 text-white" />
      </div>
      <h2 className="mt-5 text-2xl font-semibold tracking-tight">
        <span className="text-gradient-primary">Oi Felipe, sou seu coach financeiro</span>
      </h2>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        Tenho acesso aos seus extratos e cartões. Posso analisar gastos, identificar desperdícios e
        sugerir cortes. Manda uma pergunta ou escolhe abaixo:
      </p>
      <div className="mt-7 flex flex-wrap justify-center gap-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onPick(s)}
            disabled={disabled}
            className="rounded-full border border-border bg-card/60 px-3.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-primary disabled:opacity-50"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function Bubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex gap-3", isUser && "flex-row-reverse")}>
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
          isUser
            ? "bg-secondary text-foreground"
            : "bg-linear-to-br from-primary to-[rgb(178,100,255)] text-white glow-primary",
        )}
      >
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>
      <div className={cn("min-w-0 max-w-[85%] space-y-2", isUser && "items-end")}>
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {message.toolCalls.map((tc, i) => (
              <span
                key={i}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium",
                  tc.ok
                    ? "border-success/30 bg-success/10 text-success"
                    : "border-destructive/30 bg-destructive/10 text-destructive",
                )}
                title={`${tc.durationMs}ms`}
              >
                <Wrench className="h-3 w-3" />
                {TOOL_LABELS[tc.name] ?? tc.name}
              </span>
            ))}
          </div>
        )}
        <div
          className={cn(
            "rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
            isUser
              ? "bg-primary/15 text-foreground"
              : "bg-card/70 backdrop-blur-md text-foreground border border-border",
            message.error && "border-destructive/40 bg-destructive/10 text-destructive",
          )}
        >
          {message.pending ? (
            <TypingIndicator />
          ) : message.error ? (
            <p>{message.error}</p>
          ) : (
            <Markdown content={message.content} />
          )}
        </div>
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary [animation-delay:-0.3s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary [animation-delay:-0.15s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary" />
      <span className="ml-2 text-xs text-muted-foreground">pensando...</span>
    </span>
  );
}

function Markdown({ content }: { content: string }) {
  return (
    <div className="prose-coach">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
          ul: ({ children }) => <ul className="mb-2 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>,
          ol: ({ children }) => <ol className="mb-2 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>,
          h3: ({ children }) => (
            <h3 className="mb-1 mt-3 text-sm font-semibold text-foreground first:mt-0">{children}</h3>
          ),
          strong: ({ children }) => <strong className="text-foreground">{children}</strong>,
          code: ({ children }) => (
            <code className="rounded bg-elevated px-1 py-0.5 text-[12px] font-mono">{children}</code>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
