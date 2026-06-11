import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Cliente com service_role — ignora RLS. Uso EXCLUSIVO em código server-only:
// confirmação de pagamento (webhook/poll) e geração de URLs assinadas
// (bucket `originals`). NUNCA importar este módulo em Client Components.
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
