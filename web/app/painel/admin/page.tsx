import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { centsToInputValue } from "@/lib/format";
import { updateSettings } from "./actions";

const SETTINGS_KEYS = [
  "match_threshold",
  "max_results",
  "default_price_cents",
  "biometric_consent_version",
] as const;

export default async function AdminPage() {
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
  if (profile?.role !== "admin") redirect("/painel");

  const { data: settings } = await supabase
    .from("app_settings")
    .select("key, value")
    .in("key", SETTINGS_KEYS);

  const values = Object.fromEntries(
    (settings ?? []).map((s) => [s.key, s.value]),
  ) as Record<(typeof SETTINGS_KEYS)[number], number | string>;

  const matchThreshold = Number(values.match_threshold ?? 0.35);
  const maxResults = Number(values.max_results ?? 60);
  const defaultPriceCents = Number(values.default_price_cents ?? 500);
  const consentVersion = String(values.biometric_consent_version ?? "1.0");

  return (
    <main className="flex flex-1 flex-col px-6 py-8">
      <div className="mx-auto w-full max-w-md space-y-6">
        <div className="space-y-1">
          <Link href="/painel" className="text-sm text-zinc-500">
            ← Painel
          </Link>
          <h1 className="text-2xl font-semibold">Parâmetros do sistema</h1>
        </div>

        <form action={updateSettings} className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="match_threshold" className="text-sm text-zinc-500">
              Limiar de busca (distância de cosseno)
            </label>
            <input
              id="match_threshold"
              name="match_threshold"
              type="number"
              step="0.01"
              min="0"
              max="2"
              defaultValue={matchThreshold}
              className="w-full rounded-lg border border-zinc-300 px-4 py-3 text-base dark:border-zinc-700 dark:bg-zinc-900"
            />
            <p className="text-xs text-zinc-500">
              Quanto menor, mais exigente é a busca (0,35 é o padrão).
            </p>
          </div>

          <div className="space-y-1">
            <label htmlFor="max_results" className="text-sm text-zinc-500">
              Máximo de resultados na busca
            </label>
            <input
              id="max_results"
              name="max_results"
              type="number"
              step="1"
              min="1"
              defaultValue={maxResults}
              className="w-full rounded-lg border border-zinc-300 px-4 py-3 text-base dark:border-zinc-700 dark:bg-zinc-900"
            />
          </div>

          <div className="space-y-1">
            <label
              htmlFor="default_price_cents"
              className="text-sm text-zinc-500"
            >
              Preço padrão por foto (R$)
            </label>
            <input
              id="default_price_cents"
              name="default_price_cents"
              type="number"
              step="0.01"
              min="0"
              defaultValue={centsToInputValue(defaultPriceCents)}
              className="w-full rounded-lg border border-zinc-300 px-4 py-3 text-base dark:border-zinc-700 dark:bg-zinc-900"
            />
            <p className="text-xs text-zinc-500">
              Aplicado a novas fotos enviadas pelos fotógrafos.
            </p>
          </div>

          <div className="space-y-1">
            <label
              htmlFor="biometric_consent_version"
              className="text-sm text-zinc-500"
            >
              Versão do termo de consentimento biométrico
            </label>
            <input
              id="biometric_consent_version"
              name="biometric_consent_version"
              type="text"
              defaultValue={consentVersion}
              className="w-full rounded-lg border border-zinc-300 px-4 py-3 text-base dark:border-zinc-700 dark:bg-zinc-900"
            />
            <p className="text-xs text-zinc-500">
              Alterar exige que clientes aceitem o termo novamente.
            </p>
          </div>

          <button
            type="submit"
            className="w-full rounded-full bg-black px-5 py-3 text-base font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            Salvar parâmetros
          </button>
        </form>
      </div>
    </main>
  );
}
