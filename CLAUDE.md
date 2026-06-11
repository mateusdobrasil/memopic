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
- **Pagamento:** Mercado Pago (Pix). [ainda não implementado]

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
Arquivo de origem: `01_schema_fundacao.sql`.

## Status atual

- [x] **Fase 1 — Fundação:** schema, RLS, função de match, buckets. APLICADO.
- [x] **Fase 2 — Worker:** código pronto (`worker/`). EM DEPLOY no Render.
- [ ] **Fase 3 — App (cliente):** cadastro + selfie + busca + galeria de resultados.
- [ ] **Fase 4 — Venda:** seleção, carrinho, Pix (Mercado Pago), entrega em alta.
- [ ] **Fase 5 — Fotógrafo + Admin:** upload de fotos/eventos, painel, parâmetros.
- [ ] **Fase 6 — Acabamento:** termos de consentimento (LGPD), refino da marca d'água.

## Worker — rotas (já implementadas)

- `POST /process-photo` { photo_id } → acha rostos, salva vetores, gera prévia.
- `POST /search` (multipart: file) → recebe selfie, devolve fotos onde a pessoa aparece.
- `POST /embed` (multipart: file) → devolve só o vetor de um rosto.
- `GET /health` → status. Todas (menos health) exigem header `X-Worker-Secret`.

## Próximos passos imediatos

1. Concluir o deploy do worker no Render e obter a URL pública.
2. Iniciar o app Next.js na Vercel: scaffolding + login Supabase + os 3 perfis.
3. Configurar variáveis de ambiente no app: `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, e (server-only) `SUPABASE_SERVICE_ROLE_KEY`,
   `WORKER_URL`, `WORKER_SECRET`.

## Variáveis de ambiente

**Worker (Render):** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `WORKER_SECRET`.
**App (Vercel):** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY` (server-only), `WORKER_URL`, `WORKER_SECRET`.