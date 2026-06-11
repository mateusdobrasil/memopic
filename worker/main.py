"""
MemoPic — Worker de Reconhecimento Facial
==========================================
Serviço FastAPI que usa o InsightFace (buffalo_l) para:
  - /process-photo : detectar rostos numa foto, gerar os vetores (512d),
                     criar a prévia com marca d'água e salvar tudo no Supabase.
  - /search        : receber uma selfie e devolver as fotos onde a pessoa aparece.
  - /embed         : (opcional) devolver só o vetor de uma selfie.
  - /health        : checagem de saúde (também serve pra "acordar" o serviço).

Roda em CPU. Pensado pra hospedagem gratuita (Render / Hugging Face Spaces).
"""

import io
import os
import threading

import cv2
import numpy as np
from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from PIL import Image, ImageDraw, ImageFont
from pydantic import BaseModel
from supabase import Client, create_client
from insightface.app import FaceAnalysis

# ---------------------------------------------------------------------
#  Configuração (vem das variáveis de ambiente — NUNCA coloque chaves no código)
# ---------------------------------------------------------------------
SUPABASE_URL = os.environ["SUPABASE_URL"]
SERVICE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]   # chave service_role (secreta!)
WORKER_SECRET = os.environ.get("WORKER_SECRET", "")     # senha compartilhada com o app

sb: Client = create_client(SUPABASE_URL, SERVICE_KEY)

# Fonte da marca d'água (instalada via Dockerfile). Cai no padrão se não achar.
FONT_PATH = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

# ---------------------------------------------------------------------
#  Modelo de rosto (carrega 1x na inicialização)
# ---------------------------------------------------------------------
face_app = FaceAnalysis(name="buffalo_l", providers=["CPUExecutionProvider"])
face_app.prepare(ctx_id=0, det_size=(640, 640))
_model_lock = threading.Lock()   # InsightFace não é 100% thread-safe; 1 por vez

app = FastAPI(title="MemoPic Face Worker", version="1.0")


# ---------------------------------------------------------------------
#  Utilitários
# ---------------------------------------------------------------------
def check_secret(secret: str):
    """Bloqueia chamadas sem a senha compartilhada."""
    if WORKER_SECRET and secret != WORKER_SECRET:
        raise HTTPException(status_code=401, detail="unauthorized")


def vec_to_str(v) -> str:
    """Converte o vetor pro formato que o pgvector entende: '[0.1,0.2,...]'."""
    return "[" + ",".join(f"{float(x):.6f}" for x in v) + "]"


def load_image(data: bytes):
    """Bytes -> (imagem PIL em RGB, matriz BGR pro InsightFace)."""
    pil = Image.open(io.BytesIO(data)).convert("RGB")
    bgr = cv2.cvtColor(np.array(pil), cv2.COLOR_RGB2BGR)
    return pil, bgr


def detect_faces(bgr):
    with _model_lock:
        return face_app.get(bgr)


def biggest_face(faces):
    """Retorna o maior rosto (útil pra selfie, onde só interessa a própria pessoa)."""
    return max(
        faces,
        key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]),
    )


def get_settings():
    """Lê limiar de similaridade e máx. de resultados da tabela app_settings."""
    try:
        res = (
            sb.table("app_settings")
            .select("key,value")
            .in_("key", ["match_threshold", "max_results"])
            .execute()
        )
        d = {r["key"]: r["value"] for r in res.data}
        return float(d.get("match_threshold", 0.35)), int(d.get("max_results", 60))
    except Exception:
        return 0.35, 60


def make_preview(pil: Image.Image, max_side: int = 1600) -> bytes:
    """Gera uma prévia reduzida com marca d'água 'MemoPic' repetida na diagonal."""
    im = pil.copy()
    im.thumbnail((max_side, max_side))
    base = im.convert("RGBA")

    overlay = Image.new("RGBA", base.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    size = max(20, base.size[0] // 16)
    try:
        font = ImageFont.truetype(FONT_PATH, size=size)
    except Exception:
        font = ImageFont.load_default()

    text = "MemoPic"
    step = max(140, base.size[0] // 4)
    for y in range(-step, base.size[1] + step, step):
        for x in range(-step, base.size[0] + step, step):
            draw.text((x, y), text, fill=(255, 255, 255, 80), font=font)

    out = Image.alpha_composite(base, overlay).convert("RGB")
    buf = io.BytesIO()
    out.save(buf, format="JPEG", quality=70, optimize=True)
    return buf.getvalue()


def upload_preview(path: str, data: bytes):
    """Sobe (ou substitui) a prévia no bucket público."""
    sb.storage.from_("previews").upload(
        path, data, {"content-type": "image/jpeg", "upsert": "true"}
    )


# ---------------------------------------------------------------------
#  Endpoints
# ---------------------------------------------------------------------
@app.get("/health")
def health():
    return {"status": "ok"}


class ProcessReq(BaseModel):
    photo_id: str


@app.post("/process-photo")
def process_photo(req: ProcessReq, x_worker_secret: str = Header(default="")):
    """
    Fluxo do FOTÓGRAFO.
    O app insere a foto (status 'processing') e chama aqui passando o photo_id.
    """
    check_secret(x_worker_secret)

    res = (
        sb.table("photos")
        .select("id, storage_path")
        .eq("id", req.photo_id)
        .single()
        .execute()
    )
    photo = res.data
    if not photo:
        raise HTTPException(status_code=404, detail="foto não encontrada")

    try:
        # 1) baixar o original do bucket privado
        data = sb.storage.from_("originals").download(photo["storage_path"])
        pil, bgr = load_image(data)
        h, w = bgr.shape[:2]

        # 2) detectar rostos e montar as linhas
        faces = detect_faces(bgr)
        rows = []
        for f in faces:
            x1, y1, x2, y2 = (float(v) for v in f.bbox)
            rows.append(
                {
                    "photo_id": req.photo_id,
                    "embedding": vec_to_str(f.normed_embedding),
                    "bbox": {"x": x1, "y": y1, "w": x2 - x1, "h": y2 - y1},
                    "det_score": float(f.det_score),
                }
            )

        # 3) regravar os rostos (idempotente: reprocessar não duplica)
        sb.table("faces").delete().eq("photo_id", req.photo_id).execute()
        if rows:
            sb.table("faces").insert(rows).execute()

        # 4) prévia com marca d'água
        preview_path = f"{req.photo_id}.jpg"
        upload_preview(preview_path, make_preview(pil))

        # 5) marcar a foto como pronta
        sb.table("photos").update(
            {
                "status": "ready",
                "faces_count": len(rows),
                "width": w,
                "height": h,
                "preview_path": preview_path,
            }
        ).eq("id", req.photo_id).execute()

        return {"ok": True, "faces": len(rows), "preview_path": preview_path}

    except Exception as e:
        # marca como falha pra aparecer no painel e poder reprocessar
        sb.table("photos").update({"status": "failed"}).eq("id", req.photo_id).execute()
        raise HTTPException(status_code=500, detail=f"falha ao processar: {e}")


@app.post("/search")
async def search(file: UploadFile = File(...), x_worker_secret: str = Header(default="")):
    """
    Fluxo do CLIENTE.
    Recebe a selfie, acha o rosto principal e devolve as fotos onde ele aparece.
    Deve ser chamado pelo SERVIDOR do app (nunca direto do navegador), pra que o
    vetor biométrico não trafegue pelo dispositivo do usuário.
    """
    check_secret(x_worker_secret)

    pil, bgr = load_image(await file.read())
    faces = detect_faces(bgr)
    if not faces:
        return {"ok": True, "matches": [], "message": "Nenhum rosto detectado na selfie."}

    emb = biggest_face(faces).normed_embedding
    threshold, max_results = get_settings()

    rpc = sb.rpc(
        "match_photos_by_face",
        {
            "query_embedding": vec_to_str(emb),
            "match_threshold": threshold,
            "max_results": max_results,
        },
    ).execute()

    # 'embedding' volta pro servidor poder salvar em customer_faces, se quiser.
    return {"ok": True, "matches": rpc.data, "embedding": vec_to_str(emb)}


@app.post("/embed")
async def embed(file: UploadFile = File(...), x_worker_secret: str = Header(default="")):
    """Devolve só o vetor do rosto principal de uma imagem (uso flexível)."""
    check_secret(x_worker_secret)

    pil, bgr = load_image(await file.read())
    faces = detect_faces(bgr)
    if not faces:
        return {"ok": True, "embedding": None, "message": "Nenhum rosto detectado."}

    f = biggest_face(faces)
    return {
        "ok": True,
        "embedding": vec_to_str(f.normed_embedding),
        "det_score": float(f.det_score),
    }