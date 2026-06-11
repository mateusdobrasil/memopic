"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { parsePriceInput } from "@/lib/format";

export async function updateSettings(formData: FormData) {
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
  if (profile?.role !== "admin") throw new Error("not authorized");

  const matchThreshold = Number(formData.get("match_threshold"));
  const maxResults = Number(formData.get("max_results"));
  const defaultPriceCents = parsePriceInput(
    (formData.get("default_price_cents") as string) ?? "",
  );
  const consentVersion = (
    formData.get("biometric_consent_version") as string
  )?.trim();
  const photographerSharePercent = Number(
    formData.get("photographer_share_percent"),
  );

  if (!Number.isFinite(matchThreshold) || matchThreshold <= 0 || matchThreshold > 2) {
    throw new Error("Limiar de busca inválido");
  }
  if (!Number.isInteger(maxResults) || maxResults <= 0) {
    throw new Error("Máximo de resultados inválido");
  }
  if (defaultPriceCents === null) {
    throw new Error("Preço padrão inválido");
  }
  if (!consentVersion) {
    throw new Error("Versão do termo é obrigatória");
  }
  if (
    !Number.isFinite(photographerSharePercent) ||
    photographerSharePercent < 0 ||
    photographerSharePercent > 100
  ) {
    throw new Error("Repasse ao fotógrafo inválido");
  }

  const updates: { key: string; value: number | string }[] = [
    { key: "match_threshold", value: matchThreshold },
    { key: "max_results", value: maxResults },
    { key: "default_price_cents", value: defaultPriceCents },
    { key: "biometric_consent_version", value: consentVersion },
    { key: "photographer_share_percent", value: photographerSharePercent },
  ];

  for (const { key, value } of updates) {
    const { error } = await supabase
      .from("app_settings")
      .update({ value, updated_at: new Date().toISOString() })
      .eq("key", key);
    if (error) throw error;
  }

  revalidatePath("/painel/admin");
}
