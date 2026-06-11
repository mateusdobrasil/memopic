# MemoPic — Contexto do Projeto

> Este arquivo é o "briefing" do projeto. O Claude Code lê ele automaticamente
> como contexto. Mantenha atualizado conforme o projeto evolui.

## O que é o MemoPic

Plataforma web (mobile-first) onde fotógrafos sobem fotos de eventos corporativos
e de igrejas. O sistema detecta os rostos de cada foto e guarda um vetor biométrico.
O cliente se cadastra, envia uma selfie, e o sistema devolve **apenas as fotos onde
ele aparece** — que ele então seleciona e compra por um preço simbólico.

Três perfis de usuário: **admin** (donos da plataforma), **photographer** (fotógrafos
parceiros) e **customer** (cliente interessado nas fotos).

## Stack

- **Frontend/app:** Next.js (App Router) → hospedado na **Vercel**. Mobile-first.
- **Backend de dados:** **Supabase** (PostgreSQL + pgvector + Auth + Storage).
- **Reconhecimento facial:** **InsightFace** (modelo `buffalo_l`, embeddings de 512d),
  rodando num **worker Python (FastAPI)** separado, hospedado no **Render** (ou
  Hugging Face Spaces). CPU, plano gratuito.
- **Pagamento:** Mercado Pago (Pix). Implementado na Fase 4 (`web/lib/mercadopago.ts`).

## Arquitetura — DOIS lugares de deploy

```
[ Navegador do usuário (celular) ]
            |
            v
[ App Next.js na VERCEL ]  <-- telas, login, upload, busca, carrinho
       |            |
       | (dados)    | (server-to-server, com X-Worker-Secret)
       v            v
[ SUPABASE ]   [ Worker Python no RENDER ]  <-- InsightFace: acha rostos, gera vetores
```

- O **worker NÃO vai pra Vercel** (processamento de IA é pesado demais pro serverless dela).
- A chave **`service_role`** do Supabase só existe no servidor (worker e rotas de
  servidor do Next.js). **Nunca** no código que roda no navegador.

## Convenções importantes

- **LGPD:** rosto é dado biométrico sensível. Sempre registrar consentimento na tabela
  `consents` antes de processar/guardar biometria. A selfie do cliente é processada
  **server-side** — o vetor nunca trafega pelo navegador dele.
- **Embeddings:** formato pgvector como string `"[0.1,0.2,...]"`. Comparação por
  **distância de cosseno** (`<=>`). Menor distância = mais parecido.
- **Limiar de busca:** parâmetro `match_threshold` na tabela `app_settings`
  (começamos em `0.35`), ajustável pelo painel admin sem mexer no código.
- **Preços:** sempre em **centavos** (`price_cents`), inteiro. Ex.: 500 = R$ 5,00.
- **Buckets:** `originals` (alta, privado) · `previews` (com marca d'água, público) ·
  `selfies` (privado).

## Banco de dados (já criado)

Schema completo aplicado no Supabase. Tabelas principais:
`profiles`, `events`, `photos`, `faces` (vector 512), `customer_faces`,
`orders`, `order_items`, `consents`, `app_settings`.
RLS ativo em tudo. Função-chave: `match_photos_by_face(query_embedding, threshold, max)`.
Arquivo de origem: `01_schema_fundacao.sql`. Fase 4 adicionou colunas de
pagamento (`profiles.cpf`, `orders.payer_cpf`, `pix_qr_code`,
`pix_qr_code_base64`, `pix_ticket_url`, `pix_expires_at`) via
`02_fase4_pedidos.sql`.

## Pagamentos (Fase 4)

- **Fluxo:** `/busca` (seleção) → `createOrder` (`web/app/checkout/actions.ts`)
  cria `orders`/`order_items` e chama `createPixPayment`
  (`web/lib/mercadopago.ts`) → `/checkout/[orderId]` mostra QR + copia-e-cola
  e faz polling em `/api/orders/[orderId]/status` a cada 5s → quando `paid`,
  redireciona para `/pedidos/[orderId]` (download em alta via URL assinada).
- **Idempotência:** tanto o webhook (`/api/webhooks/mercadopago`) quanto o
  polling fazem `update orders set status='paid' ... where status='pending'`
  — qualquer um dos dois que rodar primeiro "vence", sem duplicar.
- **Assinatura do webhook:** validada via `verifyWebhookSignature` quando
  `MERCADOPAGO_WEBHOOK_SECRET` está configurado. Antes do deploy (ou em
  localhost) essa env var fica vazia e a verificação é pulada — a proteção
  real nesse caso é a confirmação server-to-server via
  `GET /v1/payments/{id}` com nosso `MERCADOPAGO_ACCESS_TOKEN`.
- **Entrega:** `/pedidos/[orderId]` gera URLs assinadas do bucket `originals`
  com TTL de 1h (`createSignedUrl`, via `lib/supabase/admin.ts`).
- **Limitação conhecida:** duplo clique em "Gerar Pix" pode criar dois
  pedidos `pending` para as mesmas fotos (mitigado client-side, mas sem
  limpeza automática de pedidos órfãos ainda — fica para Fase 5+).

## Painel — Fotógrafo + Admin (Fase 5)

- **Fotógrafo (`/painel`):** lista os próprios eventos (`events` filtrado por
  `photographer_id = auth.uid()`) com contagem de fotos e botão "+ Novo
  evento" (`/painel/eventos/novo`).
- **Evento (`/painel/eventos/[eventId]`):** form de edição (nome, cidade,
  data, descrição, status draft/published/archived) via `updateEvent`
  (`web/app/painel/eventos/actions.ts`) — só `published` aparece na busca dos
  clientes (`events_select`).
- **Upload de fotos (`web/app/painel/eventos/[eventId]/event-photos.tsx`):**
  client component. Para cada arquivo: gera `id = crypto.randomUUID()`, sobe
  pro bucket `originals` em `${eventId}/${id}.${ext}` com o client de **sessão**
  (RLS `originals_rw` exige `owner = auth.uid()`), insere `photos` (mesmo
  `id`, `price_cents = app_settings.default_price_cents`,
  `status = 'processing'`) e chama `POST /api/photos/process` — esse endpoint
  (server-to-server, `X-Worker-Secret`) aciona `${WORKER_URL}/process-photo`,
  que já atualiza `status/preview_path/faces_count/width/height` antes de
  responder (sem polling). Upload sequencial (um arquivo por vez) por causa do
  worker no plano free do Render.
- **Preço por foto:** editável inline (`updatePhotoPrice`); **remover foto**
  (`deletePhoto`) usa o **admin client** (`service_role`) pra apagar de
  `originals`/`previews` — `previews` não tem policy de delete pra usuário
  comum — e depois deleta a linha de `photos` (cascade em `faces`) com o
  client de sessão.
- **Admin (`/painel/admin`):** form de `app_settings`
  (`match_threshold`, `max_results`, `default_price_cents`,
  `biometric_consent_version`) via `updateSettings`
  (`web/app/painel/admin/actions.ts`), client de sessão (RLS `settings_write`
  exige `is_admin()`, sem precisar de `service_role`). `match_threshold`/
  `max_results` já são lidos pelo worker em todo `/search`
  (`worker/main.py:get_settings`); `default_price_cents` só afeta fotos
  novas.
- **Promoção de papel:** `photographer`/`admin` ainda são definidos só via
  SQL direto no Supabase (`update profiles set role = ...`), porque
  `prevent_role_escalation()` bloqueia troca de role fora de admin e ainda
  não há UI para isso.

## Termos LGPD + marca d'água (Fase 6)

- **`/termos`** (`web/app/termos/page.tsx`): página pública (sem login) com
  o texto real dos Termos de Uso e Privacidade — identificação do
  controlador (placeholder `[razão social / CNPJ — preencher]`, ajustar
  antes de ir pra produção), dados coletados (cadastro, biométricos, fotos
  de eventos), base legal, compartilhamento (Supabase/Mercado Pago),
  retenção/exclusão, direitos do titular (LGPD art. 18) e contato. Lê
  `app_settings.biometric_consent_version` (mesmo padrão de
  `busca/page.tsx`) e mostra "Versão vigente: X" — quando essa versão muda,
  o fluxo de re-consentimento em `/busca` já força novo aceite.
- Linkada de três lugares: tela de consentimento biométrico em
  `busca-client.tsx` ("Leia os termos completos"), aviso abaixo do botão de
  cadastro em `signup/page.tsx`, e um **footer global** novo em
  `web/app/layout.tsx` (visível em todas as páginas).
- **Marca d'água** (`worker/main.py:make_preview`): reescrita pra gerar um
  tile de texto "MemoPic" rotacionado -30° (`Image.rotate(expand=True)`) e
  espalhado em grade com `Image.paste(tile, (x, y), tile)` (suporta offsets
  negativos, cobre as bordas sem buracos), opacidade 115/255. Antes era um
  grid sem rotação apesar do docstring dizer "diagonal".

## Status atual

- [x] **Fase 1 — Fundação:** schema, RLS, função de match, buckets. APLICADO.
- [x] **Fase 2 — Worker:** deploy concluído no Render — `https://memopic-fdxa.onrender.com`. `/health` OK.
- [x] **Fase 3 — App (cliente):** cadastro + selfie + busca + galeria de resultados.
  Implementado em `web/` (Next.js 16 + `@supabase/ssr`), testado localmente
  ponta a ponta (signup/login, redirect por role, consentimento LGPD,
  upload de selfie → `/api/search` → galeria com seleção).
- [x] **Fase 4 — Venda:** seleção (`/busca`), carrinho/checkout (`/checkout/[id]`)
  com Pix via Mercado Pago, confirmação por webhook + polling, entrega em
  alta via URL assinada (`/pedidos`, `/pedidos/[id]`).
- [x] **Fase 5 — Fotógrafo + Admin:** painel do fotógrafo (eventos +
  upload de fotos com preço, processamento via worker), painel do admin
  (parâmetros em `app_settings`). Ver seção "Painel — Fotógrafo + Admin"
  acima.
- [x] **Fase 6 — Acabamento:** termos de consentimento (LGPD) com texto real
  em `/termos`, linkado do consentimento/cadastro/footer, e marca d'água com
  rotação diagonal de verdade. Ver seção "Termos LGPD + marca d'água (Fase
  6)" acima.

## Worker — rotas (já implementadas)

- `POST /process-photo` { photo_id } → acha rostos, salva vetores, gera prévia.
- `POST /search` (multipart: file) → recebe selfie, devolve fotos onde a pessoa aparece.
- `POST /embed` (multipart: file) → devolve só o vetor de um rosto.
- `GET /health` → status. Todas (menos health) exigem header `X-Worker-Secret`.

## Próximos passos imediatos

1. Promover via SQL um usuário de teste para `photographer` (e outro para
   `admin`) e testar o painel ponta a ponta (criar evento, subir fotos,
   publicar, conferir em `/busca` como `customer`).
2. Deploy do app `web/` na Vercel, configurando todas as variáveis de
   ambiente (ver seção abaixo) — depois configurar o webhook do Mercado Pago
   com a URL pública e copiar `MERCADOPAGO_WEBHOOK_SECRET`.
3. Redeploy do worker no Render para aplicar o novo `make_preview` (marca
   d'água diagonal) — depois, re-chamar `/process-photo` para a foto de
   teste (`photos.id = 13112b78-b9c6-4825-ad7f-6256ec3f3b7a`, evento "Teste
   Fase 5 (pode apagar)") pra gerar uma nova prévia e conferir visualmente.
4. Preencher `[razão social / CNPJ — preencher]` e o e-mail de contato em
   `web/app/termos/page.tsx` com os dados reais da empresa antes de ir pra
   produção.

> Atenção memória: o worker roda no plano free do Render (512MB RAM). O
> `FaceAnalysis(name="buffalo_l")` carrega 5 modelos por padrão; se
> `/process-photo` ou `/search` derem erro de memória com fotos reais,
> restringir com `allowed_modules=["detection","recognition"]` (os únicos
> usados pelo código).

## Variáveis de ambiente

**Worker (Render):** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `WORKER_SECRET`.
**App (Vercel/`web/`):** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`WORKER_URL` (server-only), `WORKER_SECRET` (server-only),
`SUPABASE_SERVICE_ROLE_KEY` (server-only, Fase 4: confirmação de pagamento e
URLs assinadas de `originals`), `MERCADOPAGO_ACCESS_TOKEN` (server-only),
`MERCADOPAGO_WEBHOOK_SECRET` (server-only, configurar após o deploy).