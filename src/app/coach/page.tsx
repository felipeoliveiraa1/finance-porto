import { CoachChat } from "@/components/coach-chat";

export const dynamic = "force-dynamic";

export default function CoachPage() {
  const apiKeyMissing = !process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL ?? "gpt-4.1";

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="mb-1 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
            </span>
            Powered by OpenAI {model}
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">
            <span className="text-gradient-primary">Coach financeiro</span>
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            IA com acesso aos seus extratos. Pergunta o que quiser sobre seus gastos.
          </p>
        </div>
      </header>

      <CoachChat apiKeyMissing={apiKeyMissing} />
    </div>
  );
}
