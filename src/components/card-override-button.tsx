"use client";

import { useState, useTransition } from "react";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  accountId: string;
  cardLabel: string;
  manualOpenBill: number | null;
  manualOpenBillDueDate: string | null; // ISO date string
  // Defaults shown when no override is set yet (helps the user calibrate the
  // input — currentBillDueDate from Pluggy, etc.).
  defaultDueDate: string | null;
};

function isoToInputDate(iso: string | null): string {
  if (!iso) return "";
  // <input type="date"> wants YYYY-MM-DD in local TZ. Pluggy due dates come
  // as UTC midnight, so anchoring to UTC keeps the displayed day stable.
  const d = new Date(iso);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function inputDateToIso(value: string): string | null {
  if (!value) return null;
  // Anchor to UTC midnight so we don't drift across timezones.
  return new Date(`${value}T00:00:00Z`).toISOString();
}

export function CardOverrideButton({
  accountId,
  cardLabel,
  manualOpenBill,
  manualOpenBillDueDate,
  defaultDueDate,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [valueStr, setValueStr] = useState(
    manualOpenBill != null ? manualOpenBill.toFixed(2).replace(".", ",") : "",
  );
  const [dueStr, setDueStr] = useState(
    isoToInputDate(manualOpenBillDueDate ?? defaultDueDate),
  );

  const hasOverride = manualOpenBill != null;

  function save(clear: boolean) {
    start(async () => {
      try {
        const body = clear
          ? { manualOpenBill: null, manualOpenBillDueDate: null }
          : {
              manualOpenBill: Number(valueStr.replace(/\./g, "").replace(",", ".")),
              manualOpenBillDueDate: inputDateToIso(dueStr),
            };
        if (!clear) {
          if (!Number.isFinite(body.manualOpenBill) || (body.manualOpenBill as number) < 0) {
            toast.error("Valor inválido");
            return;
          }
        }
        const r = await fetch(`/api/accounts/${accountId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!r.ok) {
          const err = await r.json().catch(() => ({}));
          throw new Error(err.error ?? "Falha ao salvar");
        }
        toast.success(clear ? "Override removido" : "Fatura ajustada");
        setOpen(false);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro desconhecido");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        type="button"
        aria-label="Ajustar fatura manualmente"
        title={hasOverride ? "Override ativo — clique para editar" : "Ajustar manualmente"}
        className={
          "absolute right-2 top-2 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full bg-black/40 text-white/70 backdrop-blur-sm transition hover:bg-black/60 hover:text-white " +
          (hasOverride ? "ring-1 ring-warning/70" : "")
        }
      >
        <Pencil className="h-3.5 w-3.5" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ajustar fatura — {cardLabel}</DialogTitle>
          <DialogDescription>
            Use quando o Open Finance não trouxer o valor correto da próxima fatura
            (típico do Mercado Pago, parcelamentos antigos). O dashboard vai exibir
            esse valor até você limpar o override.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="ovr-value">Valor da fatura aberta (R$)</Label>
            <Input
              id="ovr-value"
              type="text"
              inputMode="decimal"
              placeholder="467,71"
              value={valueStr}
              onChange={(e) => setValueStr(e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ovr-due">Vencimento</Label>
            <Input
              id="ovr-due"
              type="date"
              value={dueStr}
              onChange={(e) => setDueStr(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          {hasOverride && (
            <button
              type="button"
              disabled={pending}
              onClick={() => save(true)}
              className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground transition hover:bg-white/5 hover:text-foreground disabled:opacity-60"
            >
              Limpar override
            </button>
          )}
          <button
            type="button"
            disabled={pending || !valueStr.trim()}
            onClick={() => save(false)}
            className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white transition hover:bg-primary/90 disabled:opacity-60"
          >
            {pending ? "Salvando…" : "Salvar"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
