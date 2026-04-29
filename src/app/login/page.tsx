"use client";

import { useState, useTransition, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Sparkles, Mail, Lock, AlertCircle, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const envMissing =
    !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (envMissing) {
      setError(
        "Supabase não está configurado. Defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY no .env.",
      );
      return;
    }
    setError(null);
    start(async () => {
      try {
        const supabase = createClient();
        const { error: authError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (authError) {
          setError(translateError(authError.message));
          return;
        }
        router.push(next);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro inesperado");
      }
    });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_8%_0%,rgba(79,140,255,0.18),transparent_45%),radial-gradient(circle_at_100%_0%,rgba(178,100,255,0.12),transparent_50%),radial-gradient(circle_at_50%_100%,rgba(0,245,160,0.08),transparent_55%)]" />

      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-linear-to-br from-primary via-primary to-[rgb(178,100,255)] glow-primary">
            <Sparkles className="h-5 w-5 text-white" strokeWidth={2.5} />
          </div>
          <h1 className="mt-5 text-2xl font-bold tracking-[0.18em] text-foreground">FINANCE</h1>
          <p className="mt-1 text-xs uppercase tracking-[0.14em] text-muted-foreground">
            Open Finance
          </p>
        </div>

        <div className="rounded-2xl glass top-highlight border-gradient p-6">
          <h2 className="text-lg font-semibold text-foreground">
            <span className="text-gradient-primary">Entrar</span>
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Acesso restrito. Use o email cadastrado.
          </p>

          {envMissing && (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <p className="text-foreground">
                Supabase ainda não foi configurado. Confira as env vars no <code>.env</code>.
              </p>
            </div>
          )}

          <form onSubmit={onSubmit} className="mt-5 space-y-3">
            <div>
              <label htmlFor="email" className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Email
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={pending}
                  placeholder="seu@email.com"
                  className="w-full rounded-lg border border-border bg-card pl-9 pr-3 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-primary disabled:opacity-60"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Senha
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={pending}
                  className="w-full rounded-lg border border-border bg-card pl-9 pr-3 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-primary disabled:opacity-60"
                />
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={pending || !email || !password}
              className={cn(
                "group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-lg bg-linear-to-br from-primary via-primary to-[rgb(178,100,255)] px-4 py-2.5 text-sm font-medium text-white transition-all glow-primary hover:glow-purple disabled:opacity-50 disabled:hover:glow-primary",
              )}
            >
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>Entrar</>
              )}
            </button>
          </form>

          <p className="mt-5 text-center text-[11px] text-muted-foreground">
            Esqueceu a senha? Use o painel do{" "}
            <a
              href="https://supabase.com/dashboard"
              target="_blank"
              className="text-primary hover:underline"
            >
              Supabase
            </a>{" "}
            pra resetar.
          </p>
        </div>
      </div>
    </div>
  );
}

function translateError(msg: string): string {
  const lower = msg.toLowerCase();
  if (lower.includes("invalid login credentials")) return "Email ou senha incorretos.";
  if (lower.includes("email not confirmed")) return "Email ainda não confirmado.";
  if (lower.includes("too many")) return "Muitas tentativas. Tenta de novo em alguns minutos.";
  return msg;
}
