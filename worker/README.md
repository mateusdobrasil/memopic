# MemoPic — Worker de Reconhecimento Facial

Serviço em Python (FastAPI + InsightFace) que detecta rostos, gera os vetores e
faz a busca por selfie. Roda em CPU, pensado pra hospedagem **gratuita**.

## O que ele expõe

| Rota             | Quem usa            | O que faz                                                        |
|------------------|---------------------|------------------------------------------------------------------|
| `POST /process-photo` | App (fotógrafo) | Acha rostos de uma foto, salva os vetores e gera a prévia        |
| `POST /search`        | App (cliente)   | Recebe uma selfie e devolve as fotos onde a pessoa aparece       |
| `POST /embed`         | App (opcional)  | Devolve só o vetor de um rosto                                   |
| `GET  /health`        | Monitor         | Diz se está no ar (use pra manter "acordado")                   |

Todas as rotas (menos `/health`) exigem o header `X-Worker-Secret`.

---

## Variáveis de ambiente

Veja `.env.example`. São três: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` e
`WORKER_SECRET`. A `service_role` é secreta e dá acesso total — só fica aqui no
servidor, nunca no app do navegador.

---

## Deploy — Opção A: Render (mais simples)

1. Suba esta pasta `worker/` pra um repositório no GitHub.
2. No Render: **New → Web Service** → conecte o repositório.
3. Em **Runtime**, escolha **Docker** (ele detecta o `Dockerfile`).
4. Plano: **Free**.
5. Em **Environment**, adicione as 3 variáveis do `.env.example`.
6. Deploy. A build baixa o modelo (~300 MB), então a primeira vez demora alguns minutos.
7. No fim você recebe uma URL tipo `https://memopic-worker.onrender.com`. Guarde — o app vai usar.

> ⚠️ No plano Free o serviço "dorme" após inatividade e a 1ª chamada leva ~1 min
> pra acordar. Pra eventos, dá pra "esquentar" batendo em `/health` antes de subir as fotos.

## Deploy — Opção B: Hugging Face Spaces (também grátis)

1. Crie um **Space** novo → SDK: **Docker**.
2. Suba os arquivos desta pasta.
3. Em **Settings → Variables and secrets**, adicione as 3 variáveis (como *Secrets*).
4. O Space builda sozinho e fica em `https://SEU-USER-seu-space.hf.space`.

---

## Como o app vai chamar (referência pra Fase 3)

Processar uma foto recém-enviada:

```
POST {WORKER_URL}/process-photo
Headers: X-Worker-Secret: <seu segredo>
Body (JSON): { "photo_id": "uuid-da-foto" }
```

Buscar pelas fotos de uma selfie:

```
POST {WORKER_URL}/search
Headers: X-Worker-Secret: <seu segredo>
Body (multipart/form-data): file=<arquivo da selfie>
```

Resposta do `/search`:

```json
{
  "ok": true,
  "matches": [
    { "photo_id": "...", "event_id": "...", "preview_path": "uuid.jpg",
      "price_cents": 500, "best_distance": 0.21 }
  ],
  "embedding": "[...]"
}
```

---

## Testar rápido (depois do deploy)

```bash
# está no ar?
curl https://SUA-URL/health

# buscar por uma selfie
curl -X POST https://SUA-URL/search \
  -H "X-Worker-Secret: SEU_SEGREDO" \
  -F "file=@selfie.jpg"
```

---

## Ajuste fino da busca

A precisão é controlada pelo `match_threshold` na tabela `app_settings`
(distância de cosseno; **menor = mais rígido**). Começamos em `0.35`.
- Aparecendo fotos de gente parecida (falsos positivos)? **Diminua** (ex.: 0.30).
- Faltando fotos da própria pessoa (falsos negativos)? **Aumente** (ex.: 0.40).

Dá pra mudar pelo painel admin sem mexer no código.