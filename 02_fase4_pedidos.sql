-- =====================================================================
--  FOTO FINDER — FASE 4: VENDA (pedidos, Pix via Mercado Pago)
--  Banco: Supabase (PostgreSQL)
--
--  COMO USAR:
--  1. Supabase → seu projeto → SQL Editor → New query
--  2. Cole TODO este arquivo e clique em "Run"
--  3. Pronto. Pode rodar de novo sem quebrar (é idempotente).
-- =====================================================================


-- =====================================================================
--  1) PROFILES — CPF do cliente (reaproveitado em pedidos futuros)
-- =====================================================================
alter table public.profiles
  add column if not exists cpf text;


-- =====================================================================
--  2) ORDERS — dados do pagamento Pix (Mercado Pago)
-- =====================================================================
alter table public.orders
  add column if not exists payer_cpf         text,
  add column if not exists pix_qr_code        text,
  add column if not exists pix_qr_code_base64 text,
  add column if not exists pix_ticket_url     text,
  add column if not exists pix_expires_at     timestamptz;

-- Nenhuma policy nova: RLS é por linha, e orders_select/profiles_update já
-- cobrem as colunas novas para o próprio usuário (e is_admin() para admins).


-- =====================================================================
--  FIM. Fase 4 (schema) pronta. 🎉
-- =====================================================================
