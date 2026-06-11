import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createEvent } from "../actions";

export default async function NovoEventoPage() {
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

  return (
    <main className="flex flex-1 flex-col px-6 py-8">
      <div className="mx-auto w-full max-w-md space-y-6">
        <div className="space-y-1">
          <Link href="/painel" className="text-sm text-zinc-500">
            ← Painel
          </Link>
          <h1 className="text-2xl font-semibold">Novo evento</h1>
        </div>

        <form action={createEvent} className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="name" className="text-sm text-zinc-500">
              Nome do evento
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
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
              className="w-full rounded-lg border border-zinc-300 px-4 py-3 text-base dark:border-zinc-700 dark:bg-zinc-900"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-full bg-black px-5 py-3 text-base font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            Criar evento
          </button>
        </form>
      </div>
    </main>
  );
}
