"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { removeItem } from "@/app/actions";

export function RemoveItemButton({ itemId, label }: { itemId: string; label: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={pending}
      onClick={() => {
        if (!confirm(`Remover conexão com ${label}?`)) return;
        start(async () => {
          try {
            await removeItem(itemId);
            toast.success("Conexão removida");
          } catch (err) {
            toast.error("Erro ao remover", {
              description: err instanceof Error ? err.message : "",
            });
          }
        });
      }}
    >
      <Trash2 className="h-4 w-4" />
    </Button>
  );
}
