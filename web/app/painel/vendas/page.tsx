import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatPriceCents } from "@/lib/format";

type Sale = {
  photo_id: string;
  event_id: string;
  event_name: string;
  preview_path: string | null;
  price_cents: number;
  paid_at: string;
};

export default async function VendasPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role === "customer") redirect("/busca");

  const { data: sales } = await supabase.rpc("photographer_sales");
  const items = (sales ?? []) as unknown as Sale[];

  const { data: shareSetting } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "photographer_share_percent")
    .single();
  const sharePercent = Number(shareSetting?.value ?? 70);

  const totalCents = items.reduce((sum, item) => sum + item.price_cents, 0);
  const shareCents = Math.round((totalCents * sharePercent) / 100);

  return (
    <main className="flex flex-1 flex-col px-4 py-8">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <div className="space-y-1">
          <Link href="/painel" className="text-sm text-zinc-500">
            ← Painel
          </Link>
          <h1 className="text-2xl font-semibold">Vendas</h1>
        </div>

        <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <p className="text-sm text-zinc-500">
            {items.length} foto(s) vendida(s) — total{" "}
            {formatPriceCents(totalCents)}
          </p>
          <p className="text-lg font-semibold">
            Seu repasse ({sharePercent}%): {formatPriceCents(shareCents)}
          </p>
        </div>

        {items.length === 0 ? (
          <p className="text-sm text-zinc-500">Nenhuma foto vendida ainda.</p>
        ) : (
          <ul className="space-y-3">
            {items.map((item) => {
              const previewUrl = item.preview_path
                ? supabase.storage.from("previews").getPublicUrl(item.preview_path)
                    .data.publicUrl
                : null;
              const itemShareCents = Math.round(
                (item.price_cents * sharePercent) / 100,
              );

              return (
                <li
                  key={item.photo_id}
                  className="flex items-center gap-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
                >
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-900">
                    {previewUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={previewUrl}
                        alt="Foto vendida"
                        className="h-full w-full object-cover"
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{item.event_name}</p>
                    <p className="text-xs text-zinc-500">
                      {new Date(item.paid_at).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-zinc-500">
                      {formatPriceCents(item.price_cents)}
                    </p>
                    <p className="font-semibold">
                      {formatPriceCents(itemShareCents)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
