"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatPriceCents } from "@/lib/format";

type CheckoutOrder = {
  id: string;
  totalCents: number;
  totalFormatted: string;
  pixQrCode: string | null;
  pixQrCodeBase64: string | null;
  pixTicketUrl: string | null;
  pixExpiresAt: string | null;
  items: { photoId: string; priceCents: number; previewUrl: string }[];
};

function secondsUntil(isoDate: string): number {
  return Math.floor((new Date(isoDate).getTime() - Date.now()) / 1000);
}

function formatCountdown(totalSeconds: number): string {
  const clamped = Math.max(0, totalSeconds);
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function CheckoutClient({ order }: { order: CheckoutOrder }) {
  const router = useRouter();
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!order.pixExpiresAt) return;
    const update = () => setSecondsLeft(secondsUntil(order.pixExpiresAt!));
    update();
    const tick = setInterval(update, 1000);
    return () => clearInterval(tick);
  }, [order.pixExpiresAt]);

  useEffect(() => {
    const poll = setInterval(async () => {
      try {
        const res = await fetch(`/api/orders/${order.id}/status`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data.status === "paid") {
          router.push(`/pedidos/${order.id}`);
        }
      } catch {
        // tenta de novo no próximo intervalo
      }
    }, 5000);
    return () => clearInterval(poll);
  }, [order.id, router]);

  async function handleCopy() {
    if (!order.pixQrCode) return;
    await navigator.clipboard.writeText(order.pixQrCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const expired = secondsLeft !== null && secondsLeft <= 0;

  return (
    <main className="flex flex-1 flex-col items-center px-6 py-8">
      <div className="w-full max-w-md space-y-6 text-center">
        <h1 className="text-2xl font-semibold">Pague com Pix</h1>
        <p className="text-lg font-semibold">Total: {order.totalFormatted}</p>

        {expired ? (
          <div className="space-y-4">
            <p className="text-sm text-red-600">
              O tempo para pagamento deste Pix expirou.
            </p>
            <a
              href="/busca"
              className="inline-block w-full rounded-full bg-black px-5 py-3 text-base font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
            >
              Voltar para a busca
            </a>
          </div>
        ) : (
          <>
            {order.pixQrCodeBase64 ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`data:image/png;base64,${order.pixQrCodeBase64}`}
                alt="QR Code do Pix"
                className="mx-auto h-64 w-64"
              />
            ) : (
              <p className="text-sm text-red-600">
                Não foi possível gerar o QR Code. Use o código copia-e-cola
                abaixo.
              </p>
            )}

            {order.pixQrCode && (
              <div className="space-y-2 text-left">
                <label htmlFor="pix-code" className="text-sm text-zinc-500">
                  Pix copia-e-cola
                </label>
                <div className="flex gap-2">
                  <input
                    id="pix-code"
                    type="text"
                    readOnly
                    value={order.pixQrCode}
                    className="flex-1 truncate rounded-lg border border-zinc-300 px-3 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                  />
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="shrink-0 rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
                  >
                    {copied ? "Copiado!" : "Copiar"}
                  </button>
                </div>
              </div>
            )}

            {secondsLeft !== null && (
              <p className="text-sm text-zinc-500">
                Expira em {formatCountdown(secondsLeft)}
              </p>
            )}

            <p className="text-sm text-zinc-500">
              Assim que o pagamento for confirmado, esta página será
              atualizada automaticamente.
            </p>
          </>
        )}

        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {order.items.map((item) => (
            <div
              key={item.photoId}
              className="relative overflow-hidden rounded-lg"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.previewUrl}
                alt="Foto do evento"
                className="aspect-square w-full object-cover"
              />
              <span className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5 text-[10px] font-medium text-white">
                {formatPriceCents(item.priceCents)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
