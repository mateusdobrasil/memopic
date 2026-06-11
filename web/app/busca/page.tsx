import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BuscaClient } from "./busca-client";

export default async function BuscaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, cpf")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "customer") {
    redirect("/painel");
  }

  const { data: settings } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "biometric_consent_version")
    .single();

  const requiredVersion = (settings?.value as string | undefined) ?? "1.0";

  const { data: consent } = await supabase
    .from("consents")
    .select("version, granted")
    .eq("user_id", user.id)
    .eq("kind", "biometric")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const hasValidConsent =
    consent?.granted === true && consent.version === requiredVersion;

  return (
    <BuscaClient
      hasValidConsent={hasValidConsent}
      requiredVersion={requiredVersion}
      customerCpf={profile?.cpf ?? ""}
    />
  );
}
