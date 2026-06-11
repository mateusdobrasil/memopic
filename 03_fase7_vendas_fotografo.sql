-- =====================================================================
--  MEMOPIC — FASE 7: VENDAS DO FOTÓGRAFO
--  Banco: Supabase (PostgreSQL)
--
--  COMO USAR:
--  1. Supabase → seu projeto → SQL Editor → New query
--  2. Cole TODO este arquivo e clique em "Run"
--  3. Pronto. Pode rodar de novo sem quebrar (é idempotente).
-- =====================================================================


-- =====================================================================
--  1) APP_SETTINGS — percentual do valor da foto repassado ao fotógrafo
-- =====================================================================
insert into public.app_settings (key, value) values
  ('photographer_share_percent', '70')
on conflict (key) do nothing;


-- =====================================================================
--  2) FUNÇÃO — vendas (pagas) do fotógrafo logado
--      SECURITY DEFINER: order_items_select e orders_select não dão ao
--      fotógrafo acesso de leitura a essas tabelas (são do cliente/admin),
--      então o join precisa rodar com privilégio elevado. Filtra sempre
--      por e.photographer_id = auth.uid(), então cada fotógrafo só vê as
--      próprias vendas.
-- =====================================================================
create or replace function public.photographer_sales()
returns table (
  photo_id     uuid,
  event_id     uuid,
  event_name   text,
  preview_path text,
  price_cents  int,
  paid_at      timestamptz
)
language sql stable security definer set search_path = public
as $$
  select p.id, p.event_id, e.name, p.preview_path, oi.price_cents, o.paid_at
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  join public.photos p on p.id = oi.photo_id
  join public.events e on e.id = p.event_id
  where o.status = 'paid'
    and e.photographer_id = auth.uid()
  order by o.paid_at desc;
$$;

grant execute on function public.photographer_sales() to authenticated;


-- =====================================================================
--  FIM. Fase 7 (schema) pronta. 🎉
-- =====================================================================
