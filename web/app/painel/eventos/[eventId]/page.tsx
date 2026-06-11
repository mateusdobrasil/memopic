import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { updateEvent } from "../actions";
import { EventPhotos, type Photo } from "./event-photos";
import { DeleteEventButton } from "./delete-event-button";

const STATUS_OPTIONS = [
  { value: "draft", label: "Rascunho" },
  { value: "published", label: "Publicado" },
  { value: "archived", label: "Arquivado" },
];

export default async function EventoPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
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

  const { data: event } = await supabase
    .from("events")
    .select("id, photographer_id, name, description, city, event_date, status")
    .eq("id", eventId)
    .maybeSingle();
  if (!event) notFound();

  const isOwner = event.photographer_id === user.id;
  const isAdmin = profile?.role === "admin";
  if (!isOwner && !isAdmin) notFound();

  const { data: photos } = await supabase
    .from("photos")
    .select(
      "id, storage_path, preview_path, price_cents, status, faces_count, width, height, created_at",
    )
    .eq("event_id", eventId)
    .order("created_at", { ascending: false });

  const { data: priceSetting } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "default_price_cents")
    .single();
  const defaultPriceCents = (priceSetting?.value as number | undefined) ?? 500;

  return (
    <main className="flex flex-1 flex-col px-4 py-8">
      <div className="mx-auto w-full max-w-3xl space-y-8">
        <div>
          <Link href="/painel" className="text-sm text-zinc-500">
            ← Painel
          </Link>
          <h1 className="mt-1 text-2xl font-semibold">{event.name}</h1>
        </div>

        <form
          action={updateEvent.bind(null, eventId)}
          className="space-y-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
        >
          <h2 className="text-lg font-semibold">Dados do evento</h2>

          <div className="space-y-1">
            <label htmlFor="name" className="text-sm text-zinc-500">
              Nome do evento
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              defaultValue={event.name}
              className="w-full rounded-lg border border-zinc-300 px-4 py-3 text-base dark:border-zinc-700 dark:bg-zinc-900"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="city" className="text-sm text-zinc-500">
              Cidade
            </label>
            <input
              id="city"
              name="city"
              type="text"
              defaultValue={event.city ?? ""}
              className="w-full rounded-lg border border-zinc-300 px-4 py-3 text-base dark:border-zinc-700 dark:bg-zinc-900"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="event_date" className="text-sm text-zinc-500">
              Data do evento
            </label>
            <input
              id="event_date"
              name="event_date"
              type="date"
              defaultValue={event.event_date ?? ""}
              className="w-full rounded-lg border border-zinc-300 px-4 py-3 text-base dark:border-zinc-700 dark:bg-zinc-900"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="description" className="text-sm text-zinc-500">
              Descrição
            </label>
            <textarea
              id="description"
              name="description"
              rows={3}
              defaultValue={event.description ?? ""}
              className="w-full rounded-lg border border-zinc-300 px-4 py-3 text-base dark:border-zinc-700 dark:bg-zinc-900"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="status" className="text-sm text-zinc-500">
              Status
            </label>
            <select
              id="status"
              name="status"
              defaultValue={event.status}
              className="w-full rounded-lg border border-zinc-300 px-4 py-3 text-base dark:border-zinc-700 dark:bg-zinc-900"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-zinc-500">
              Apenas eventos publicados aparecem na busca dos clientes.
            </p>
          </div>

          <button
            type="submit"
            className="w-full rounded-full bg-black px-5 py-3 text-base font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            Salvar evento
          </button>
        </form>

        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Fotos</h2>
          <EventPhotos
            eventId={eventId}
            userId={user.id}
            initialPhotos={(photos ?? []) as Photo[]}
            defaultPriceCents={defaultPriceCents}
          />
        </div>

        {isAdmin && (
          <div className="space-y-2 rounded-lg border border-red-200 p-4 dark:border-red-900">
            <h2 className="text-lg font-semibold">Zona de risco</h2>
            <p className="text-sm text-zinc-500">
              Apaga o evento e todas as fotos vinculadas a ele (originais e
              prévias). Fotos já vendidas são preservadas (ocultadas da
              busca) e o evento é arquivado em vez de apagado.
            </p>
            <DeleteEventButton eventId={eventId} />
          </div>
        )}
      </div>
    </main>
  );
}
