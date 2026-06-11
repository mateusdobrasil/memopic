import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatPriceCents } from "@/lib/format";

const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1h

type OrderRow = {
  id: string;
  status: string;
  total_cents: number;
  created_at: string;
  order_items: {
    photo_id: string;
    price_cents: number;
    photos: { preview_path: string | null; storage_path: string } | null;
  }[];
};

export default async function PedidoPage({
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
      "id, status, total_cents, created_at, order_items(photo_id, price_cents, photos(preview_path, storage_path))",
    )
    .eq("id", orderId)
    .maybeSingle<OrderRow>();

  if (!order) notFound();

  if (order.status !== "paid") {
    redirect(`/checkout/${order.id}`);
  }

  const admin = createAdminClient();

  const items = await Promise.all(
    order.order_items.map(async (item) => {
      const previewPath = item.photos?.preview_path ?? "";
      const { data: previewData } = supabase.storage
        .from("previews")
        .getPublicUrl(previewPath);

      let downloadUrl: string | null = null;
      if (item.photos?.storage_path) {
        const { data: signedData } = await admin.storage
          .from("originals")
          .createSignedUrl(item.photos.storage_path, SIGNED_URL_TTL_SECONDS);
        downloadUrl = signedData?.signedUrl ?? null;
      }

      return {
        photoId: item.photo_id,
        priceCents: item.price_cents,
        previewUrl: previewData.publicUrl,
        downloadUrl,
      };
    }),
  );

  return (
    <main className="flex flex-1 flex-col px-4 py-8">
      <div className="mx-auto w-full max-w-md space-y-1 text-center">
        <h1 className="text-2xl font-semibold">Pedido pago</h1>
        <p className="text-sm text-zinc-500">
          {new Date(order.created_at).toLocaleDateString("pt-BR")} —{" "}
          {formatPriceCents(order.total_cents)}
        </p>
        <p className="text-xs text-zinc-400">
          Os links para baixar em alta resolução expiram em 1 hora.
        </p>
      </div>

      <div className="mx-auto mt-6 grid w-full max-w-md grid-cols-2 gap-3 sm:grid-cols-3">
        {items.map((item) => (
          <div key={item.photoId} className="space-y-2">
            <div className="relative overflow-hidden rounded-lg">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.previewUrl}
                alt="Foto do evento"
                className="aspect-square w-full object-cover"
              />
            </div>
            {item.downloadUrl && (
              <a
                href={item.downloadUrl}
                download
                className="block rounded-full bg-black px-3 py-2 text-center text-xs font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
              >
                Baixar em alta
              </a>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}
