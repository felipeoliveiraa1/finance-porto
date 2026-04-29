import { Building2, CreditCard, Wallet } from "lucide-react";
import { SectionCard } from "@/components/section-card";
import { SyncButton } from "@/components/sync-button";
import { getAccountsWithItem } from "@/lib/queries";
import { formatBRL } from "@/lib/format";
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

export default async function AccountsPage() {
  const accounts = await getAccountsWithItem();

  const grouped = new Map<string, typeof accounts>();
  for (const a of accounts) {
    const key = a.item.id;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(a);
  }

  const totalBank = accounts
    .filter((a) => a.type === "BANK")
    .reduce((s, a) => s + a.balance, 0);
  const totalCredit = accounts
    .filter((a) => a.type === "CREDIT")
    .reduce((s, a) => s + a.balance, 0);

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Contas</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {accounts.length} contas em {grouped.size} bancos · saldo total{" "}
            <span className="font-medium text-foreground">{formatBRL(totalBank)}</span> · cartões{" "}
            <span className="font-medium text-foreground">{formatBRL(totalCredit)}</span>
          </p>
        </div>
        <SyncButton variant="ghost" />
      </header>

      {accounts.length === 0 ? (
        <SectionCard>
          <div className="py-12 text-center text-sm text-muted-foreground">
            Nenhuma conta. Conecte um banco em <strong className="text-foreground">Configurações</strong>.
          </div>
        </SectionCard>
      ) : (
        <div className="space-y-5">
          {[...grouped.entries()].map(([itemId, accs]) => {
            const item = accs[0].item;
            const totalBalance = accs.reduce((s, a) => s + a.balance, 0);
            return (
              <SectionCard
                key={itemId}
                title={
                  <div className="flex items-center gap-3">
                    {item.connectorImageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.connectorImageUrl}
                        alt=""
                        className="h-8 w-8 rounded-lg bg-white/5 p-1"
                      />
                    ) : (
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
                        <Building2 className="h-4 w-4" />
                      </div>
                    )}
                    <div>
                      <span>{item.connectorName}</span>
                      <p className="mt-0.5 text-xs font-normal text-muted-foreground">
                        {accs.length} contas · {formatBRL(totalBalance)}
                      </p>
                    </div>
                  </div>
                }
                action={
                  <span
                    className={cn(
                      "rounded-md px-2 py-1 text-[11px] font-medium",
                      STATUS_TONE[item.status] ?? "bg-secondary text-muted-foreground",
                    )}
                  >
                    {item.status}
                  </span>
                }
              >
                <ul className="divide-y divide-border">
                  {accs.map((a) => (
                    <li key={a.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                      <span
                        className={cn(
                          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                          a.type === "CREDIT"
                            ? "bg-warning/15 text-warning"
                            : "bg-primary/15 text-primary",
                        )}
                      >
                        {a.type === "CREDIT" ? (
                          <CreditCard className="h-4 w-4" />
                        ) : (
                          <Wallet className="h-4 w-4" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">{a.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {a.subtype.replace(/_/g, " ").toLowerCase()}
                          {a.number && ` · ${a.number}`}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p
                          className={cn(
                            "text-sm font-semibold tabular-nums",
                            a.type === "CREDIT" ? "text-warning" : "text-foreground",
                          )}
                        >
                          {formatBRL(a.balance)}
                        </p>
                        {a.creditLimit && (
                          <p className="text-[11px] text-muted-foreground">
                            limite {formatBRL(a.creditLimit)}
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </SectionCard>
            );
          })}
        </div>
      )}
    </div>
  );
}
