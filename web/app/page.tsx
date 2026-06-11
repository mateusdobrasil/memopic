import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role === "customer") {
      redirect("/busca");
    }

    redirect("/painel");
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold">MemoPic</h1>
          <p className="text-zinc-500">
            Encontre suas fotos de eventos em segundos. Tire uma selfie e
            descubra todas as fotos onde você aparece.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <Link
            href="/signup"
            className="w-full rounded-full bg-black px-5 py-3 text-base font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            Cadastrar
          </Link>
          <Link
            href="/login"
            className="w-full rounded-full border border-zinc-300 px-5 py-3 text-base font-medium transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            Entrar
          </Link>
        </div>
      </div>
    </main>
  );
}
