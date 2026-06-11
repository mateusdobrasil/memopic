import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "./actions";

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

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">
            Olá, {profile?.full_name ?? "usuário"}
          </h1>
          <p className="text-zinc-500">Painel em construção (Fase 5).</p>
        </div>

        <form action={signOut}>
          <button
            type="submit"
            className="w-full rounded-full border border-zinc-300 px-5 py-3 text-base font-medium transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            Sair
          </button>
        </form>
      </div>
    </main>
  );
}
