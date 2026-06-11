-- =====================================================================
--  FOTO FINDER — Schema inicial (FASE 1: FUNDAÇÃO)
--  Banco: Supabase (PostgreSQL) + pgvector
--  Reconhecimento facial: InsightFace buffalo_l → vetores de 512 dimensões
--
--  COMO USAR:
--  1. Supabase → seu projeto → SQL Editor → New query
--  2. Cole TODO este arquivo e clique em "Run"
--  3. Pronto. Pode rodar de novo sem quebrar (é idempotente).
-- =====================================================================


-- =====================================================================
--  1) EXTENSÕES
-- =====================================================================
create extension if not exists "pgcrypto";   -- gera UUIDs (gen_random_uuid)
create extension if not exists "vector";      -- pgvector: busca por similaridade de rostos


-- =====================================================================
--  2) TIPOS (ENUMS)
-- =====================================================================
do $$ begin
  create type user_role as enum ('admin', 'photographer', 'customer');
exception when duplicate_object then null; end $$;

do $$ begin
  create type event_status as enum ('draft', 'published', 'archived');
exception when duplicate_object then null; end $$;

do $$ begin
  create type photo_status as enum ('processing', 'ready', 'failed', 'hidden');
exception when duplicate_object then null; end $$;

do $$ begin
  create type order_status as enum ('pending', 'paid', 'cancelled', 'refunded');
exception when duplicate_object then null; end $$;


-- =====================================================================
--  3) FUNÇÕES AUXILIARES (papel do usuário / atualizações)
-- =====================================================================

-- Retorna o papel do usuário logado. SECURITY DEFINER evita recursão de RLS.
create or replace function public.current_role()
returns user_role
language sql stable security definer set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- Atalho: o usuário logado é admin?
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

-- Atualiza automaticamente o campo updated_at
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;


-- =====================================================================
--  4) PERFIS (estende auth.users)
-- =====================================================================
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  role        user_role not null default 'customer',
  full_name   text,
  phone       text,
  avatar_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Cria o perfil automaticamente quando um usuário se cadastra
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data->>'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Impede que um usuário comum se promova a admin sozinho.
-- auth.uid() só existe em requisições autenticadas via API (PostgREST/Auth);
-- conexões diretas (SQL Editor, migrations, service_role) têm auth.uid() nulo
-- e são tratadas como acesso administrativo direto ao banco.
create or replace function public.prevent_role_escalation()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if (new.role is distinct from old.role)
     and auth.uid() is not null
     and not public.is_admin() then
    raise exception 'Apenas administradores podem alterar o papel do usuário.';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_no_role_escalation on public.profiles;
create trigger profiles_no_role_escalation
  before update on public.profiles
  for each row execute function public.prevent_role_escalation();

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();


-- =====================================================================
--  5) EVENTOS (cada fotógrafo cria os seus)
-- =====================================================================
create table if not exists public.events (
  id               uuid primary key default gen_random_uuid(),
  photographer_id  uuid not null references public.profiles(id) on delete restrict,
  name             text not null,
  description      text,
  city             text,
  event_date       date,
  cover_photo_id   uuid,                       -- preenchido depois (foto de capa)
  status           event_status not null default 'draft',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists events_photographer_idx on public.events(photographer_id);
create index if not exists events_status_idx        on public.events(status);

drop trigger if exists events_touch on public.events;
create trigger events_touch before update on public.events
  for each row execute function public.touch_updated_at();


-- =====================================================================
--  6) FOTOS
-- =====================================================================
create table if not exists public.photos (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references public.events(id) on delete cascade,
  uploaded_by   uuid not null references public.profiles(id) on delete restrict,
  storage_path  text not null,                 -- original em alta (bucket privado)
  preview_path  text,                          -- prévia com marca d'água (bucket público)
  width         int,
  height        int,
  price_cents   int not null default 0,        -- preço em centavos (ex.: 500 = R$ 5,00)
  status        photo_status not null default 'processing',
  faces_count   int not null default 0,
  taken_at      timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists photos_event_idx  on public.photos(event_id);
create index if not exists photos_status_idx on public.photos(status);


-- =====================================================================
--  7) ROSTOS DETECTADOS  (1 foto pode ter vários rostos)
--     O worker InsightFace insere aqui via service_role.
-- =====================================================================
create table if not exists public.faces (
  id          uuid primary key default gen_random_uuid(),
  photo_id    uuid not null references public.photos(id) on delete cascade,
  embedding   vector(512) not null,            -- vetor do rosto (ArcFace, normalizado)
  bbox        jsonb,                            -- {x, y, w, h} da caixa do rosto
  det_score   real,                             -- confiança da detecção (0..1)
  created_at  timestamptz not null default now()
);
create index if not exists faces_photo_idx on public.faces(photo_id);

-- Índice de similaridade por COSSENO (HNSW é ideal pro volume de vocês)
create index if not exists faces_embedding_idx
  on public.faces using hnsw (embedding vector_cosine_ops);


-- =====================================================================
--  8) SELFIE DO CLIENTE (vetor de referência pra busca)
-- =====================================================================
create table if not exists public.customer_faces (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid not null references public.profiles(id) on delete cascade,
  embedding    vector(512) not null,
  selfie_path  text,                            -- bucket privado de selfies
  is_primary   boolean not null default true,
  created_at   timestamptz not null default now()
);
create index if not exists customer_faces_idx on public.customer_faces(customer_id);


-- =====================================================================
--  9) PEDIDOS E ITENS
-- =====================================================================
create table if not exists public.orders (
  id               uuid primary key default gen_random_uuid(),
  customer_id      uuid not null references public.profiles(id) on delete restrict,
  status           order_status not null default 'pending',
  total_cents      int not null default 0,
  payment_provider text,                        -- ex.: 'mercadopago'
  payment_ref      text,                         -- id da cobrança / Pix
  created_at       timestamptz not null default now(),
  paid_at          timestamptz
);
create index if not exists orders_customer_idx on public.orders(customer_id);

create table if not exists public.order_items (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.orders(id) on delete cascade,
  photo_id    uuid not null references public.photos(id) on delete restrict,
  price_cents int not null,
  unique (order_id, photo_id)
);


-- =====================================================================
--  10) CONSENTIMENTOS (LGPD — dado biométrico é sensível!)
-- =====================================================================
create table if not exists public.consents (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.profiles(id) on delete cascade,
  kind        text not null,                    -- 'biometric' | 'terms' | 'privacy'
  version     text not null,
  granted     boolean not null default true,
  ip          text,
  user_agent  text,
  created_at  timestamptz not null default now()
);
create index if not exists consents_user_idx on public.consents(user_id);


-- =====================================================================
--  11) PARÂMETROS DO SISTEMA (o admin edita aqui)
-- =====================================================================
create table if not exists public.app_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

insert into public.app_settings (key, value) values
  ('default_price_cents',        '500'),     -- R$ 5,00 padrão por foto
  ('currency',                   '"BRL"'),
  ('match_threshold',            '0.35'),    -- distância cosseno máx. p/ "mesma pessoa"
  ('max_results',                '60'),      -- máx. de fotos retornadas na busca
  ('biometric_consent_version',  '"1.0"')
on conflict (key) do nothing;


-- =====================================================================
--  12) FUNÇÃO DE BUSCA POR ROSTO
--      Cliente envia o vetor da selfie → recebe as fotos onde aparece.
--      SECURITY DEFINER: o cliente NÃO lê a tabela faces direto (privacidade/IP),
--      só recebe as prévias das fotos publicadas.
-- =====================================================================
create or replace function public.match_photos_by_face(
  query_embedding vector(512),
  match_threshold float default 0.35,
  max_results     int   default 60
)
returns table (
  photo_id      uuid,
  event_id      uuid,
  preview_path  text,
  price_cents   int,
  best_distance float
)
language sql stable security definer set search_path = public
as $$
  select p.id, p.event_id, p.preview_path, p.price_cents,
         min(f.embedding <=> query_embedding) as best_distance
  from public.faces f
  join public.photos p on p.id = f.photo_id
  join public.events e on e.id = p.event_id
  where p.status = 'ready'
    and e.status = 'published'
    and (f.embedding <=> query_embedding) < match_threshold
  group by p.id, p.event_id, p.preview_path, p.price_cents
  order by best_distance asc
  limit max_results;
$$;

grant execute on function public.match_photos_by_face(vector, float, int) to authenticated;


-- =====================================================================
--  13) ROW LEVEL SECURITY (quem enxerga o quê)
-- =====================================================================
alter table public.profiles       enable row level security;
alter table public.events         enable row level security;
alter table public.photos         enable row level security;
alter table public.faces          enable row level security;
alter table public.customer_faces enable row level security;
alter table public.orders         enable row level security;
alter table public.order_items    enable row level security;
alter table public.consents       enable row level security;
alter table public.app_settings   enable row level security;

-- ---- PROFILES ----
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (id = auth.uid() or public.is_admin());
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update using (id = auth.uid() or public.is_admin());

-- ---- EVENTS ----
drop policy if exists events_select on public.events;
create policy events_select on public.events
  for select using (
    status = 'published' or photographer_id = auth.uid() or public.is_admin()
  );
drop policy if exists events_insert on public.events;
create policy events_insert on public.events
  for insert with check (
    photographer_id = auth.uid() and public.current_role() in ('photographer','admin')
  );
drop policy if exists events_update on public.events;
create policy events_update on public.events
  for update using (photographer_id = auth.uid() or public.is_admin());
drop policy if exists events_delete on public.events;
create policy events_delete on public.events
  for delete using (photographer_id = auth.uid() or public.is_admin());

-- ---- PHOTOS ----
drop policy if exists photos_select on public.photos;
create policy photos_select on public.photos
  for select using (
    public.is_admin()
    or uploaded_by = auth.uid()
    or exists (select 1 from public.events e
               where e.id = photos.event_id and e.status = 'published')
  );
drop policy if exists photos_insert on public.photos;
create policy photos_insert on public.photos
  for insert with check (
    uploaded_by = auth.uid() and public.current_role() in ('photographer','admin')
  );
drop policy if exists photos_update on public.photos;
create policy photos_update on public.photos
  for update using (uploaded_by = auth.uid() or public.is_admin());
drop policy if exists photos_delete on public.photos;
create policy photos_delete on public.photos
  for delete using (uploaded_by = auth.uid() or public.is_admin());

-- ---- FACES (cliente NÃO lê; só dono da foto + admin; worker usa service_role) ----
drop policy if exists faces_owner on public.faces;
create policy faces_owner on public.faces
  for all using (
    public.is_admin()
    or exists (select 1 from public.photos p
               where p.id = faces.photo_id and p.uploaded_by = auth.uid())
  ) with check (
    public.is_admin()
    or exists (select 1 from public.photos p
               where p.id = faces.photo_id and p.uploaded_by = auth.uid())
  );

-- ---- CUSTOMER_FACES (só o próprio cliente + admin) ----
drop policy if exists customer_faces_own on public.customer_faces;
create policy customer_faces_own on public.customer_faces
  for all using (customer_id = auth.uid() or public.is_admin())
  with check (customer_id = auth.uid() or public.is_admin());

-- ---- ORDERS ----
drop policy if exists orders_select on public.orders;
create policy orders_select on public.orders
  for select using (customer_id = auth.uid() or public.is_admin());
drop policy if exists orders_insert on public.orders;
create policy orders_insert on public.orders
  for insert with check (customer_id = auth.uid());
drop policy if exists orders_update on public.orders;
create policy orders_update on public.orders
  for update using (public.is_admin());   -- pagamento confirmado via webhook (service_role)

-- ---- ORDER_ITEMS ----
drop policy if exists order_items_select on public.order_items;
create policy order_items_select on public.order_items
  for select using (
    public.is_admin()
    or exists (select 1 from public.orders o
               where o.id = order_items.order_id and o.customer_id = auth.uid())
  );
drop policy if exists order_items_insert on public.order_items;
create policy order_items_insert on public.order_items
  for insert with check (
    exists (select 1 from public.orders o
            where o.id = order_items.order_id and o.customer_id = auth.uid())
  );

-- ---- CONSENTS ----
drop policy if exists consents_select on public.consents;
create policy consents_select on public.consents
  for select using (user_id = auth.uid() or public.is_admin());
drop policy if exists consents_insert on public.consents;
create policy consents_insert on public.consents
  for insert with check (user_id = auth.uid());

-- ---- APP_SETTINGS (todos leem; só admin escreve) ----
drop policy if exists settings_select on public.app_settings;
create policy settings_select on public.app_settings
  for select using (true);
drop policy if exists settings_write on public.app_settings;
create policy settings_write on public.app_settings
  for all using (public.is_admin()) with check (public.is_admin());


-- =====================================================================
--  14) STORAGE (buckets de arquivos)
--      originals = alta resolução, privado
--      previews  = prévia com marca d'água, público
--      selfies   = selfie do cliente, privado
-- =====================================================================
insert into storage.buckets (id, name, public) values
  ('originals', 'originals', false),
  ('previews',  'previews',  true),
  ('selfies',   'selfies',   false)
on conflict (id) do nothing;

-- previews: leitura é pública (bucket público); escrita só fotógrafo/admin
drop policy if exists previews_write on storage.objects;
create policy previews_write on storage.objects
  for insert to authenticated
  with check (bucket_id = 'previews' and public.current_role() in ('photographer','admin'));
drop policy if exists previews_update on storage.objects;
create policy previews_update on storage.objects
  for update to authenticated
  using (bucket_id = 'previews' and (owner = auth.uid() or public.is_admin()));

-- originals: só o dono (fotógrafo) e admin. (Entrega ao comprador = URL assinada
--            gerada no servidor com service_role, depois do pagamento.)
drop policy if exists originals_rw on storage.objects;
create policy originals_rw on storage.objects
  for all to authenticated
  using       (bucket_id = 'originals' and (owner = auth.uid() or public.is_admin()))
  with check  (bucket_id = 'originals' and (owner = auth.uid() or public.is_admin()));

-- selfies: só o próprio usuário
drop policy if exists selfies_rw on storage.objects;
create policy selfies_rw on storage.objects
  for all to authenticated
  using      (bucket_id = 'selfies' and owner = auth.uid())
  with check (bucket_id = 'selfies' and owner = auth.uid());

-- =====================================================================
--  FIM. Fundação pronta. 🎉
-- =====================================================================