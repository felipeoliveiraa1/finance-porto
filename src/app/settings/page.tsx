import { CheckCircle2, XCircle, Webhook, Plug, Building2 } from "lucide-react";
import { SectionCard } from "@/components/section-card";
import { AddItemForm } from "@/components/add-item-form";
import { RemoveItemButton } from "@/components/remove-item-button";
import { SyncButton } from "@/components/sync-button";
import { hasPluggyCredentials } from "@/lib/pluggy";
import { getItemsWithCounts, getLastSync } from "@/lib/queries";
import { formatDateLong, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, string> = {
  UPDATED: "bg-success/15 text-success",
  UPDATING: "bg-primary/15 text-primary",
  WAITING_USER_INPUT: "bg-warning/15 text-warning",
  WAITING_USER_ACTION: "bg-warning/15 text-warning",
  LOGIN_ERROR: "bg-destructive/15 text-destructive",
  OUTDATED: "bg-destructive/15 text-destructive",
};

export default async function SettingsPage() {
  const credsOk = hasPluggyCredentials();
  const items = await getItemsWithCounts();
  const lastSync = await getLastSync();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Configurações</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Credenciais, conexões e webhook do Pluggy.
        </p>
      </header>

      <SectionCard
        title={
          <div className="flex items-center gap-2">
            <Plug className="h-4 w-4 text-primary" />
            <span>Credenciais Pluggy</span>
          </div>
        }
        description={
          <>
            Crie uma Application em{" "}
            <a
              className="text-primary hover:underline"
              href="https://dashboard.pluggy.ai/applications"
              target="_blank"
            >
              dashboard.pluggy.ai/applications
            </a>{" "}
            e adicione no <code className="text-foreground">.env</code> como{" "}
            <code className="text-foreground">PLUGGY_CLIENT_ID</code> e{" "}
            <code className="text-foreground">PLUGGY_CLIENT_SECRET</code>.
          </>
        }
      >
        {credsOk ? (
          <div className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="h-4 w-4 text-success" />
            <span className="text-success">Credenciais configuradas</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm">
            <XCircle className="h-4 w-4 text-destructive" />
            <span className="text-destructive">
              Faltando — defina no .env e reinicie o servidor
            </span>
          </div>
        )}
      </SectionCard>

      <SectionCard
        title={
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" />
            <span>Adicionar conexão</span>
          </div>
        }
        description={
          <>
            Conecte os bancos em{" "}
            <a className="text-primary hover:underline" href="https://meu.pluggy.ai" target="_blank">
              meu.pluggy.ai
            </a>{" "}
            e cole aqui o Item ID de cada conexão.
          </>
        }
      >
        <AddItemForm />
      </SectionCard>

      <SectionCard
        title="Conexões ativas"
        description={
          lastSync?.finishedAt
            ? `Última sincronização ${formatRelative(lastSync.finishedAt)}`
            : "Sem sincronizações ainda"
        }
        action={items.length > 0 && <SyncButton variant="ghost" />}
      >
        {items.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nenhuma conexão ainda.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((item) => {
              const txCount = item.accounts.reduce((s, a) => s + a._count.transactions, 0);
              return (
                <li key={item.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                  {item.connectorImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.connectorImageUrl}
                      alt=""
                      className="h-9 w-9 rounded-lg bg-white/5 p-1"
                    />
                  ) : (
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
                      <Building2 className="h-4 w-4" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-foreground">
                        {item.connectorName}
                      </p>
                      <span
                        className={cn(
                          "rounded-md px-1.5 py-0.5 text-[10px] font-medium",
                          STATUS_TONE[item.status] ?? "bg-secondary text-muted-foreground",
                        )}
                      >
                        {item.status}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {item._count.accounts} contas · {txCount} transações
                      {item.consentExpiresAt && (
                        <> · consentimento expira {formatDateLong(item.consentExpiresAt)}</>
                      )}
                    </p>
                    <p className="mt-0.5 font-mono text-[10px] text-muted-foreground/60">{item.id}</p>
                  </div>
                  <RemoveItemButton itemId={item.id} label={item.connectorName} />
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>

      <SectionCard
        title={
          <div className="flex items-center gap-2">
            <Webhook className="h-4 w-4 text-primary" />
            <span>Webhook</span>
          </div>
        }
        description="Para sincronização automática quando uma transação nova chega no Pluggy"
      >
        <div className="space-y-3 text-sm">
          <div>
            <p className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">URL</p>
            <code className="block rounded-md border border-border bg-elevated px-3 py-2 text-xs text-foreground">
              https://seu-dominio.com/api/webhooks/pluggy
            </code>
          </div>
          <div>
            <p className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">Eventos</p>
            <div className="flex flex-wrap gap-1.5">
              {["item/created", "item/updated", "transactions/created", "transactions/updated", "item/deleted"].map(
                (e) => (
                  <span
                    key={e}
                    className="rounded-md border border-border bg-secondary/50 px-2 py-0.5 text-[11px] text-muted-foreground"
                  >
                    {e}
                  </span>
                ),
              )}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Defina <code className="text-foreground">PLUGGY_WEBHOOK_SECRET</code> no .env e use o
            mesmo valor no header <code className="text-foreground">x-webhook-secret</code>.
          </p>
        </div>
      </SectionCard>
    </div>
  );
}
