import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatPriceCents } from "@/lib/format";
import { CheckoutClient } from "./checkout-client";

type OrderRow = {
  id: string;
  status: string;
  total_cents: number;
  pix_qr_code: string | null;
  pix_qr_code_base64: string | null;
  pix_ticket_url: string | null;
  pix_expires_at: string | null;
  order_items: {
    photo_id: string;
    price_cents: number;
    photos: { preview_path: string } | null;
  }[];
};

export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: order } = await supabase
    .from("orders")
    .select(
      "id, status, total_cents, pix_qr_code, pix_qr_code_base64, pix_ticket_url, pix_expires_at, order_items(photo_id, price_cents, photos(preview_path))",
    )
    .eq("id", orderId)
    .maybeSingle<OrderRow>();

  if (!order) notFound();

  if (order.status === "paid") {
    redirect(`/pedidos/${order.id}`);
  }

  if (order.status === "cancelled" || order.status === "refunded") {
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
        <div className="w-full max-w-md space-y-4">
          <h1 className="text-2xl font-semibold">
            {order.status === "cancelled" ? "Pedido cancelado" : "Pedido reembolsado"}
          </h1>
          <p className="text-sm text-zinc-500">
            Este pedido não está mais disponível para pagamento.
          </p>
          <a
            href="/busca"
            className="inline-block w-full rounded-full bg-black px-5 py-3 text-base font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            Voltar para a busca
          </a>
        </div>
      </main>
    );
  }

  const items = order.order_items.map((item) => {
    const previewPath = item.photos?.preview_path ?? "";
    const { data } = supabase.storage.from("previews").getPublicUrl(previewPath);
    return {
      photoId: item.photo_id,
      priceCents: item.price_cents,
      previewUrl: data.publicUrl,
    };
  });

  return (
    <CheckoutClient
      order={{
        id: order.id,
        totalCents: order.total_cents,
        totalFormatted: formatPriceCents(order.total_cents),
        pixQrCode: order.pix_qr_code,
        pixQrCodeBase64: order.pix_qr_code_base64,
        pixTicketUrl: order.pix_ticket_url,
        pixExpiresAt: order.pix_expires_at,
        items,
      }}
    />
  );
}
