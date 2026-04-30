"use client";

import { useState, useTransition } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
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
import {
  upsertFixedExpense,
  deleteFixedExpense,
  upsertIncomeSource,
  deleteIncomeSource,
} from "@/app/actions";

type Kind = "fixed" | "income";

type Row = {
  id: string;
  name: string;
  amount: number;
  dueDay: number | null;
  owner: string | null;
  notes: string | null;
  bucket?: string | null;
};

function formatBRLInput(v: number): string {
  return v.toFixed(2).replace(".", ",");
}

function parseBRLInput(s: string): number {
  // Accept "1.234,56" and "1234.56" — strip dots used as thousand separators
  // when a comma is also present, then normalize comma → dot.
  if (s.includes(",") && s.includes(".")) {
    s = s.replace(/\./g, "");
  }
  return Number(s.replace(",", "."));
}

export function BudgetRowEditor({
  kind,
  initial,
  triggerLabel,
  triggerIcon,
}: {
  kind: Kind;
  initial?: Row;
  triggerLabel?: string;
  triggerIcon?: "edit" | "add";
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [name, setName] = useState(initial?.name ?? "");
  const [amount, setAmount] = useState(
    initial ? formatBRLInput(initial.amount) : "",
  );
  const [dueDay, setDueDay] = useState(
    initial?.dueDay != null ? String(initial.dueDay) : "",
  );
  const [bucket, setBucket] = useState(initial?.bucket ?? "");
  const [owner, setOwner] = useState(initial?.owner ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");

  const isEdit = !!initial;

  function save() {
    const parsedAmount = parseBRLInput(amount);
    if (!name.trim()) {
      toast.error("Nome é obrigatório");
      return;
    }
    if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
      toast.error("Valor inválido");
      return;
    }
    const parsedDue = dueDay ? Number(dueDay) : null;
    if (parsedDue != null && (!Number.isInteger(parsedDue) || parsedDue < 1 || parsedDue > 31)) {
      toast.error("Dia de vencimento entre 1 e 31");
      return;
    }
    start(async () => {
      try {
        if (kind === "fixed") {
          await upsertFixedExpense(initial?.id ?? null, {
            name,
            amount: parsedAmount,
            dueDay: parsedDue,
            bucket: bucket || null,
            owner: owner || null,
            notes: notes || null,
          });
        } else {
          await upsertIncomeSource(initial?.id ?? null, {
            name,
            amount: parsedAmount,
            dueDay: parsedDue,
            owner: owner || null,
            notes: notes || null,
          });
        }
        toast.success(isEdit ? "Atualizado" : "Adicionado");
        setOpen(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro desconhecido");
      }
    });
  }

  function remove() {
    if (!initial) return;
    if (!confirm(`Remover "${initial.name}"?`)) return;
    start(async () => {
      try {
        if (kind === "fixed") {
          await deleteFixedExpense(initial.id);
        } else {
          await deleteIncomeSource(initial.id);
        }
        toast.success("Removido");
        setOpen(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro desconhecido");
      }
    });
  }

  const triggerClassName = isEdit
    ? "inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition hover:bg-white/5 hover:text-foreground"
    : "inline-flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition hover:bg-primary/20";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        type="button"
        aria-label={isEdit ? "Editar" : "Adicionar"}
        className={triggerClassName}
      >
        {triggerIcon === "add" || !isEdit ? (
          <Plus className="h-3.5 w-3.5" />
        ) : (
          <Pencil className="h-3.5 w-3.5" />
        )}
        {triggerLabel && <span>{triggerLabel}</span>}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Editar" : "Adicionar"}{" "}
            {kind === "fixed" ? "despesa fixa" : "receita"}
          </DialogTitle>
          <DialogDescription>
            {kind === "fixed"
              ? "Bills/contas mensais que se repetem (aluguel, escola, energia)."
              : "Fontes de renda mensais (salário, autônomo, pensão)."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 py-2">
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="be-name">Nome</Label>
            <Input
              id="be-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={kind === "fixed" ? "Aluguel" : "Salário"}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="be-amount">Valor (R$)</Label>
            <Input
              id="be-amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="3475,98"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="be-due">Dia (1–31)</Label>
            <Input
              id="be-due"
              inputMode="numeric"
              value={dueDay}
              onChange={(e) => setDueDay(e.target.value)}
              placeholder="10"
            />
          </div>
          {kind === "fixed" && (
            <div className="space-y-1.5">
              <Label htmlFor="be-bucket">Categoria</Label>
              <Input
                id="be-bucket"
                value={bucket}
                onChange={(e) => setBucket(e.target.value)}
                placeholder="ALUGUEL"
              />
            </div>
          )}
          <div className={kind === "fixed" ? "space-y-1.5" : "col-span-2 space-y-1.5"}>
            <Label htmlFor="be-owner">Pessoa</Label>
            <Input
              id="be-owner"
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
              placeholder="Felipe / Milena"
            />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="be-notes">Observação</Label>
            <Input
              id="be-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Termina em 12/2026, varia ~50, etc."
            />
          </div>
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          <div>
            {isEdit && (
              <button
                type="button"
                disabled={pending}
                onClick={remove}
                className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/40 px-3 py-1.5 text-sm text-destructive transition hover:bg-destructive/10 disabled:opacity-60"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Remover
              </button>
            )}
          </div>
          <button
            type="button"
            disabled={pending || !name || !amount}
            onClick={save}
            className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white transition hover:bg-primary/90 disabled:opacity-60"
          >
            {pending ? "Salvando…" : "Salvar"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
