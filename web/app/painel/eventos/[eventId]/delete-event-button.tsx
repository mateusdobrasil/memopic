"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteEvent } from "../actions";

export function DeleteEventButton({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function handleClick() {
    if (
      !window.confirm(
        "Excluir este evento e todas as fotos vinculadas a ele? Essa ação não pode ser desfeita.",
      )
    ) {
      return;
    }

    startTransition(async () => {
      const result = await deleteEvent(eventId);
      if (result.status === "deleted") {
        router.push("/painel");
        router.refresh();
      } else {
        setMessage(
          "Algumas fotos já foram vendidas e não podem ser apagadas. " +
            "As fotos vendidas foram ocultadas da busca e o evento foi arquivado.",
        );
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="w-full rounded-full border border-red-200 px-5 py-3 text-base font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:hover:bg-red-950"
      >
        {isPending ? "Excluindo..." : "Excluir evento"}
      </button>
      {message && <p className="text-sm text-zinc-500">{message}</p>}
    </div>
  );
}
