import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatPriceCents } from "@/lib/format";

const STATUS_LABELS: Record<string, string> = {
  pending: "Aguardando pagamento",
  paid: "Pago",
  cancelled: "Cancelado",
  refunded: "Reembolsado",
};

export default async function PedidosPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: orders } = await supabase
    .from("orders")
    .select("id, status, total_cents, created_at")
    .order("created_at", { ascending: false });

  return (
    <main className="flex flex-1 flex-col px-4 py-8">
      <h1 className="mb-6 text-center text-2xl font-semibold">Meus pedidos</h1>

      {!orders || orders.length === 0 ? (
        <div className="mx-auto w-full max-w-md space-y-4 text-center">
          <p className="text-sm text-zinc-500">
            Você ainda não fez nenhum pedido.
          </p>
          <Link
            href="/busca"
            className="inline-block w-full rounded-full bg-black px-5 py-3 text-base font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            Buscar minhas fotos
          </Link>
        </div>
      ) : (
        <ul className="mx-auto w-full max-w-md space-y-3">
          {orders.map((order) => (
            <li key={order.id}>
              <Link
                href={
                  order.status === "paid"
                    ? `/pedidos/${order.id}`
                    : `/checkout/${order.id}`
                }
                className="flex items-center justify-between rounded-lg border border-zinc-200 px-4 py-3 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
              >
                <div>
                  <p className="font-medium">
                    {new Date(order.created_at).toLocaleDateString("pt-BR")}
                  </p>
                  <p className="text-sm text-zinc-500">
                    {STATUS_LABELS[order.status] ?? order.status}
                  </p>
                </div>
                <p className="font-semibold">
                  {formatPriceCents(order.total_cents)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
