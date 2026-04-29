"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addItem } from "@/app/actions";

export function AddItemForm() {
  const [itemId, setItemId] = useState("");
  const [pending, start] = useTransition();

  return (
    <form
      className="flex flex-col gap-2 sm:flex-row sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          try {
            await addItem(itemId);
            toast.success("Banco adicionado e sincronizado");
            setItemId("");
          } catch (err) {
            toast.error("Falha ao adicionar", {
              description: err instanceof Error ? err.message : "erro desconhecido",
            });
          }
        });
      }}
    >
      <div className="flex-1">
        <Label htmlFor="itemId" className="mb-1.5">Pluggy Item ID</Label>
        <Input
          id="itemId"
          placeholder="ex: 1d3a8b2c-5f7e-4d11-..."
          value={itemId}
          onChange={(e) => setItemId(e.target.value)}
          disabled={pending}
        />
      </div>
      <Button type="submit" disabled={pending || !itemId.trim()}>
        <Plus className="h-4 w-4" />
        Adicionar
      </Button>
    </form>
  );
}
