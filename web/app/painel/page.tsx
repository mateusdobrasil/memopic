import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "./actions";

const EVENT_STATUS_LABELS: Record<string, string> = {
  draft: "Rascunho",
  published: "Publicado",
  archived: "Arquivado",
};

type EventRow = {
  id: string;
  name: string;
  city: string | null;
  event_date: string | null;
  status: string;
  photos: { count: number }[];
};

function formatEventDate(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const [year, month, day] = dateStr.split("-");
  return `${day}/${month}/${year}`;
}

export default async function PainelPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name")
    .eq("id", user.id)
    .single();

  if (profile?.role === "customer") {
    redirect("/busca");
  }

  const { data: events } = await supabase
    .from("events")
    .select("id, name, city, event_date, status, photos(count)")
    .eq("photographer_id", user.id)
    .order("created_at", { ascending: false })
    .returns<EventRow[]>();

  return (
    <main className="flex flex-1 flex-col px-4 py-8">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold">
            Olá, {profile?.full_name ?? "usuário"}
          </h1>
          <form action={signOut}>
            <button
              type="submit"
              className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              Sair
            </button>
          </form>
        </div>

        {profile?.role === "admin" && (
          <Link
            href="/painel/admin"
            className="block w-full rounded-lg border border-zinc-200 px-4 py-3 text-sm font-medium transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
          >
            Parâmetros do sistema
          </Link>
        )}

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Meus eventos</h2>
            <Link
              href="/painel/eventos/novo"
              className="rounded-full bg-black px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
            >
              + Novo evento
            </Link>
          </div>

          {!events || events.length === 0 ? (
            <p className="text-sm text-zinc-500">
              Você ainda não criou nenhum evento.
            </p>
          ) : (
            <ul className="space-y-3">
              {events.map((event) => {
                const photoCount = event.photos?.[0]?.count ?? 0;
                const date = formatEventDate(event.event_date);
                return (
                  <li key={event.id}>
                    <Link
                      href={`/painel/eventos/${event.id}`}
                      className="flex items-center justify-between rounded-lg border border-zinc-200 px-4 py-3 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
                    >
                      <div>
                        <p className="font-medium">{event.name}</p>
                        <p className="text-sm text-zinc-500">
                          {[event.city, date].filter(Boolean).join(" — ")}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium">
                          {EVENT_STATUS_LABELS[event.status] ?? event.status}
                        </p>
                        <p className="text-xs text-zinc-500">
                          {photoCount} foto(s)
                        </p>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </main>
  );
}
